// Real endpoint integration tests for PR 5's save auditing, exercising the
// actual worker (src/index.ts) inside Miniflare/workerd via
// @cloudflare/vitest-pool-workers, against a local D1 seeded from the REAL
// schema.sql (see vitest.config.ts + test/apply-schema.ts) — same rig as
// worker/test/save-endpoints.integration.test.ts.
//
// Run with: cd worker && npx vitest run
// (NOT part of the root `npm test` — see worker/README.md "Testing".)
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

// These tests write repeatedly in quick succession on purpose. Production
// rate-limits one account to a write every few seconds (see
// DEFAULT_MIN_SAVE_INTERVAL_MS in src/index.ts); that guard has its own tests
// in save-endpoints.integration.test.ts, and here it would only obscure what
// is being checked.
(env as { MIN_SAVE_INTERVAL_MS?: string }).MIN_SAVE_INTERVAL_MS = '0';

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const request = new Request(`http://worker.example${path}`, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function sessionCookieFrom(res: Response): string {
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  const nameValue = setCookie.split(';')[0];
  expect(nameValue).toMatch(/^blorbo_session=/);
  return nameValue;
}

// Fresh, unique email per test so tests don't interact via the shared D1
// (Miniflare's default is NOT necessarily reset between tests in this pool
// version, so isolate by data instead of relying on storage reset).
let counter = 0;
function freshEmail(): string {
  counter += 1;
  return `auditor${counter}-${Date.now()}@example.com`;
}

/** Register a fresh account, returning its session cookie AND user id. */
async function signUp(): Promise<{ cookie: string; userId: string }> {
  const email = freshEmail();
  const res = await call('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter22' }),
  });
  expect(res.status).toBe(201);
  const cookie = sessionCookieFrom(res);
  const body = (await res.json()) as { user: { id: string } };
  return { cookie, userId: body.user.id };
}

function getSave(cookie?: string): Promise<Response> {
  return call('/save', { headers: cookie ? { Cookie: cookie } : {} });
}

function putSave(cookie: string | undefined, baseRev: number, save: unknown): Promise<Response> {
  return call('/save', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ baseRev, save }),
  });
}

/** A minimal-but-plausible save body, cheap to build per test. */
function sampleSave(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 12,
    goo: 100,
    lifetimeGoo: 500,
    clicks: 42,
    upgrades: { finger: 3, power: 1, autoTap: 0, nurture: 0, crit: 0, luck: 0 },
    characters: {},
    eggs: 0,
    totalHatches: 0,
    sinceRare: 0,
    bonusesCollected: 0,
    leaderboard: [],
    achievements: [],
    ownedCosmetics: ['blob-classic', 'bg-plain', 'acc-none', 'sound-classic'],
    equippedBlob: 'blob-classic',
    equippedBackground: 'bg-plain',
    equippedAccessory: 'acc-none',
    equippedSound: 'sound-classic',
    equippedMain: null,
    milestonesShown: [],
    lastSeen: Date.now(),
    muted: false,
    rng: { seed: 12345, cursor: 0 },
    ...overrides,
  };
}

interface AuditRow {
  id: number;
  user_id: string;
  rev: number;
  created: number;
  elapsed_sec: number;
  goo_gain: number;
  max_gain: number;
  ratio: number;
  click_gain: number;
  flags: string;
  ok: number;
}

async function auditRowsFor(userId: string): Promise<AuditRow[]> {
  const { results } = await env.DB.prepare('SELECT * FROM save_audit WHERE user_id = ?1 ORDER BY id ASC')
    .bind(userId)
    .all<AuditRow>();
  return results ?? [];
}

const CREATE_SAVE_AUDIT_SQL = `
  CREATE TABLE IF NOT EXISTS save_audit (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT    NOT NULL,
    rev           INTEGER NOT NULL,
    created       INTEGER NOT NULL,
    elapsed_sec   REAL    NOT NULL,
    goo_gain      REAL    NOT NULL,
    max_gain      REAL    NOT NULL,
    ratio         REAL    NOT NULL,
    click_gain    INTEGER NOT NULL,
    flags         TEXT    NOT NULL,
    ok            INTEGER NOT NULL
  )
`;

describe('save auditing (PR 5, shadow mode)', () => {
  it('a first PUT records an audit row with ok=1 and no flags (nothing to compare against yet)', async () => {
    const { cookie, userId } = await signUp();
    const res = await putSave(cookie, 0, sampleSave({ lifetimeGoo: 500, clicks: 42 }));
    expect(res.status).toBe(200);

    const rows = await auditRowsFor(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(1);
    expect(rows[0].flags).toBe('');
    expect(rows[0].rev).toBe(1);
  });

  it('a modest second PUT records a second row, still ok=1, with a server-measured (small) elapsed_sec', async () => {
    const { cookie, userId } = await signUp();
    await putSave(cookie, 0, sampleSave({ lifetimeGoo: 500, clicks: 42 })); // rev -> 1

    // A save reporting a huge lastSeen gap must NOT influence elapsed_sec —
    // only the server's own clock between the two writes may.
    const res = await putSave(
      cookie,
      1,
      sampleSave({ lifetimeGoo: 600, clicks: 50, lastSeen: Date.now() - 1_000_000_000 }),
    );
    expect(res.status).toBe(200);

    const rows = await auditRowsFor(userId);
    expect(rows).toHaveLength(2);
    const second = rows[1];
    expect(second.ok).toBe(1);
    expect(second.flags).toBe('');
    expect(second.rev).toBe(2);
    // These two PUTs happen back-to-back in the same test — the real gap is a
    // handful of milliseconds, nowhere near the fabricated lastSeen gap.
    expect(second.elapsed_sec).toBeGreaterThanOrEqual(0);
    expect(second.elapsed_sec).toBeLessThan(5);
  });

  it('an absurd lifetimeGoo jump is flagged goo-rate but the write STILL SUCCEEDS (shadow mode never blocks)', async () => {
    const { cookie, userId } = await signUp();
    await putSave(cookie, 0, sampleSave({ lifetimeGoo: 500, clicks: 42 })); // rev -> 1

    const res = await putSave(cookie, 1, sampleSave({ lifetimeGoo: 500 + 1e18, clicks: 42 }));
    // The single most important assertion in this file: a flagged save is
    // NOT rejected. It still returns 200 with the new rev.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rev: number };
    expect(body.rev).toBe(2);

    const rows = await auditRowsFor(userId);
    const flagged = rows[rows.length - 1];
    expect(flagged.ok).toBe(0);
    expect(flagged.flags.split(',')).toContain('goo-rate');
    expect(flagged.ratio).toBeGreaterThan(1);

    // And the save really did persist the absurd value — auditing observed,
    // it did not sanitize or clamp it away.
    const getRes = await getSave(cookie);
    const getBody = (await getRes.json()) as { save: { lifetimeGoo: number } };
    expect(getBody.save.lifetimeGoo).toBe(500 + 1e18);
  });

  it('lifetimeGoo going down is flagged lifetime-goo-decreased', async () => {
    const { cookie, userId } = await signUp();
    await putSave(cookie, 0, sampleSave({ lifetimeGoo: 500, clicks: 42 })); // rev -> 1

    const res = await putSave(cookie, 1, sampleSave({ lifetimeGoo: 100, clicks: 42 }));
    expect(res.status).toBe(200); // shadow mode: still succeeds

    const rows = await auditRowsFor(userId);
    const last = rows[rows.length - 1];
    expect(last.ok).toBe(0);
    expect(last.flags.split(',')).toContain('lifetime-goo-decreased');
  });

  it('an impossible tap-count jump is flagged click-rate', async () => {
    const { cookie, userId } = await signUp();
    await putSave(cookie, 0, sampleSave({ lifetimeGoo: 500, clicks: 42 })); // rev -> 1

    // Far more taps than a human (+ a level-0 robot hand) could produce in the
    // handful of milliseconds this second PUT is separated by.
    const res = await putSave(cookie, 1, sampleSave({ lifetimeGoo: 500, clicks: 42 + 1_000_000 }));
    expect(res.status).toBe(200); // shadow mode: still succeeds

    const rows = await auditRowsFor(userId);
    const last = rows[rows.length - 1];
    expect(last.ok).toBe(0);
    expect(last.flags.split(',')).toContain('click-rate');
  });

  it('ratio is stored and separates honest play (well below 1) from gross fabrication (above 1)', async () => {
    const { cookie, userId } = await signUp();
    await putSave(cookie, 0, sampleSave({ lifetimeGoo: 500, clicks: 42 })); // rev -> 1, ratio 0 (no previous)
    await putSave(cookie, 1, sampleSave({ lifetimeGoo: 600, clicks: 50 })); // honest gain
    await putSave(cookie, 2, sampleSave({ lifetimeGoo: 600 + 1e18, clicks: 50 })); // absurd gain

    const rows = await auditRowsFor(userId);
    expect(rows).toHaveLength(3);
    const [, honest, absurd] = rows;
    expect(honest.ok).toBe(1);
    expect(honest.ratio).toBeGreaterThanOrEqual(0);
    expect(honest.ratio).toBeLessThan(0.01); // orders of magnitude below 1 — see verify.ts
    expect(absurd.ok).toBe(0);
    expect(absurd.ratio).toBeGreaterThan(1);
  });

  it('audit rows are attributed to the right account — two users never cross-contaminate', async () => {
    const a = await signUp();
    const b = await signUp();

    await putSave(a.cookie, 0, sampleSave({ lifetimeGoo: 500, clicks: 42 }));
    await putSave(b.cookie, 0, sampleSave({ lifetimeGoo: 500 + 1e18, clicks: 42 })); // b is flagged

    const aRows = await auditRowsFor(a.userId);
    const bRows = await auditRowsFor(b.userId);
    expect(aRows).toHaveLength(1);
    expect(bRows).toHaveLength(1);
    expect(aRows[0].ok).toBe(1); // a's honest first save is unaffected by b's flagged one
    expect(bRows[0].ok).toBe(1); // b's own FIRST save also has nothing to compare against yet
    expect(aRows.every((r) => r.user_id === a.userId)).toBe(true);
    expect(bRows.every((r) => r.user_id === b.userId)).toBe(true);
  });

  it('an auditing failure cannot break a save — simulates the owner not having re-run schema.sql yet', async () => {
    const { cookie } = await signUp();
    await putSave(cookie, 0, sampleSave({ lifetimeGoo: 10, clicks: 1 })); // rev -> 1, audit row too

    // Simulate the deploy window where the Worker code is live but the owner
    // hasn't re-applied schema.sql, so save_audit doesn't exist.
    await env.DB.prepare('DROP TABLE save_audit').run();

    try {
      const res = await putSave(cookie, 1, sampleSave({ lifetimeGoo: 20, clicks: 2 }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { rev: number };
      expect(body.rev).toBe(2);

      const getRes = await getSave(cookie);
      expect(getRes.status).toBe(200);
      const getBody = (await getRes.json()) as { save: { lifetimeGoo: number } };
      expect(getBody.save.lifetimeGoo).toBe(20);
    } finally {
      // Restore the table — other test files may share this D1 instance (see
      // the "Miniflare storage reset" note above), and this table's absence
      // must not leak into them.
      await env.DB.prepare(CREATE_SAVE_AUDIT_SQL).run();
    }
  });
});
