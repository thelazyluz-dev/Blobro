// Real endpoint integration tests for PR 4's cloud-save endpoints, exercising
// the actual worker (src/index.ts) inside Miniflare/workerd via
// @cloudflare/vitest-pool-workers, against a local D1 seeded from the REAL
// schema.sql (see vitest.config.ts + test/apply-schema.ts) — same rig as
// worker/test/auth-endpoints.integration.test.ts.
//
// Run with: cd worker && npx vitest run
// (NOT part of the root `npm test` — see worker/README.md "Testing".)
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

// The email/password routes are disabled in production (Google-only sign-in).
// These tests create accounts through them because it is the only way to mint
// a session without a real Google round-trip; the disabled-by-default behaviour
// has its own tests in auth-endpoints.integration.test.ts.
(env as { ALLOW_PASSWORD_AUTH?: string }).ALLOW_PASSWORD_AUTH = '1';

// Most tests here write back-to-back to exercise revisions and conflicts,
// which the production write rate-limit would suppress. Off by default; the
// block at the bottom turns it back on to test the guard itself.
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
  return `saver${counter}-${Date.now()}@example.com`;
}

/** Register a fresh account and return its session cookie. */
async function signUp(): Promise<string> {
  const email = freshEmail();
  const res = await call('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter22' }),
  });
  expect(res.status).toBe(201);
  return sessionCookieFrom(res);
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

describe('GET /save', () => {
  it('401 with no session', async () => {
    const res = await getSave();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('200 with rev:0, save:null for a signed-in user with no cloud save yet', async () => {
    const cookie = await signUp();
    const res = await getSave(cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rev: 0, updated: 0, save: null });
  });
});

describe('PUT /save', () => {
  it('401 with no session', async () => {
    const res = await putSave(undefined, 0, sampleSave());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('PUT then GET round-trips the save, rev goes 0 -> 1', async () => {
    const cookie = await signUp();

    const putRes = await putSave(cookie, 0, sampleSave({ goo: 777 }));
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { rev: number; updated: number };
    expect(putBody.rev).toBe(1);
    expect(typeof putBody.updated).toBe('number');

    const getRes = await getSave(cookie);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { rev: number; updated: number; save: { goo: number } };
    expect(getBody.rev).toBe(1);
    expect(getBody.save.goo).toBe(777);
  });

  it('two sequential PUTs increment rev 1 -> 2', async () => {
    const cookie = await signUp();
    const first = await putSave(cookie, 0, sampleSave());
    expect((await first.json() as { rev: number }).rev).toBe(1);

    const second = await putSave(cookie, 1, sampleSave({ goo: 999 }));
    expect(second.status).toBe(200);
    expect((await second.json() as { rev: number }).rev).toBe(2);
  });

  it('a stale PUT (baseRev behind) is rejected with 409 and carries the current save', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, sampleSave({ goo: 111 })); // rev -> 1
    await putSave(cookie, 1, sampleSave({ goo: 222 })); // rev -> 2

    // Reusing the already-consumed baseRev:1 is stale (current rev is 2).
    const stale = await putSave(cookie, 1, sampleSave({ goo: 333 }));
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { error: string; rev: number; save: { goo: number } };
    expect(body.error).toBe('stale');
    expect(body.rev).toBe(2);
    expect(body.save.goo).toBe(222); // the second write's value, not the rejected third

    // The rejected write must not have taken effect.
    const after = await getSave(cookie);
    expect((await after.json() as { rev: number }).rev).toBe(2);
  });

  it('a payload over 64 KiB is rejected with 413', async () => {
    const cookie = await signUp();
    const huge = sampleSave({ junkField: 'x'.repeat(70_000) });
    const res = await putSave(cookie, 0, huge);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too-large' });

    // Nothing should have been written.
    const after = await getSave(cookie);
    expect((await after.json() as { rev: number }).rev).toBe(0);
  });

  it('sanitizes junk on write: unknown creature id, negative goo, NaN clicks, unknown cosmetic', async () => {
    const cookie = await signUp();
    const junk = sampleSave({
      goo: -500,
      lifetimeGoo: -1,
      clicks: Number.NaN,
      characters: {
        'not-a-real-creature-id': { level: 5 },
      },
      ownedCosmetics: ['blob-classic', 'totally-fake-cosmetic-id'],
      equippedAccessory: 'totally-fake-cosmetic-id',
    });

    const putRes = await putSave(cookie, 0, junk);
    expect(putRes.status).toBe(200);

    const getRes = await getSave(cookie);
    const body = (await getRes.json()) as {
      save: {
        goo: number;
        lifetimeGoo: number;
        clicks: number;
        characters: Record<string, unknown>;
        ownedCosmetics: string[];
        equippedAccessory: string;
      };
    };
    expect(body.save.goo).toBe(0); // negative goo clamped to 0
    expect(body.save.lifetimeGoo).toBe(0); // negative lifetimeGoo clamped to 0
    expect(body.save.clicks).toBe(0); // NaN clicks falls back to 0
    expect(body.save.characters['not-a-real-creature-id']).toBeUndefined(); // unknown creature dropped
    expect(body.save.ownedCosmetics).not.toContain('totally-fake-cosmetic-id'); // unknown cosmetic dropped
    expect(body.save.equippedAccessory).not.toBe('totally-fake-cosmetic-id'); // falls back to a default
  });

  // The test above passes even if the raw upload is stored verbatim, because
  // GET sanitizes on read too. So assert the STORED row directly: junk must
  // never reach the database in the first place. Without this, a refactor
  // that dropped the write-side migrate() would go unnoticed, and the
  // denormalized columns a later anti-cheat PR reads would be fed raw
  // attacker input.
  it('stores the SANITIZED save, not the raw upload', async () => {
    const cookie = await signUp();
    await putSave(
      cookie,
      0,
      sampleSave({
        lifetimeGoo: -1,
        clicks: Number.NaN,
        characters: { 'not-a-real-creature-id': { level: 5 } },
        ownedCosmetics: ['totally-fake-cosmetic-id'],
      }),
    );

    const row = await env.DB.prepare(
      'SELECT payload, lifetime_goo AS lifetimeGoo, clicks, version FROM saves ORDER BY updated DESC LIMIT 1',
    ).first<{ payload: string; lifetimeGoo: number; clicks: number; version: number }>();

    expect(row).not.toBeNull();
    expect(row!.payload).not.toContain('not-a-real-creature-id');
    expect(row!.payload).not.toContain('totally-fake-cosmetic-id');
    const stored = JSON.parse(row!.payload) as { lifetimeGoo: number; clicks: number };
    expect(stored.lifetimeGoo).toBe(0);
    expect(stored.clicks).toBe(0);

    // The denormalized columns must agree with the sanitized payload — they
    // are what a later PR re-simulates against, so drift here would be silent.
    expect(row!.lifetimeGoo).toBe(0);
    expect(row!.clicks).toBe(0);
    expect(row!.version).toBe(12);
  });

  it('one user cannot read or overwrite another user\'s save', async () => {
    const cookieA = await signUp();
    const cookieB = await signUp();

    await putSave(cookieA, 0, sampleSave({ goo: 12345 }));

    // B has no save of their own yet — A's write must not be visible to B.
    const bGet = await getSave(cookieB);
    expect(await bGet.json()).toEqual({ rev: 0, updated: 0, save: null });

    // B writing does not disturb A's row.
    await putSave(cookieB, 0, sampleSave({ goo: 1 }));
    const aGet = await getSave(cookieA);
    const aBody = (await aGet.json()) as { rev: number; save: { goo: number } };
    expect(aBody.rev).toBe(1);
    expect(aBody.save.goo).toBe(12345);
  });

  it('a malformed body (no save key) is 400, not 500', async () => {
    const cookie = await signUp();
    const res = await call('/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ baseRev: 0 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad-body' });
  });

  it('a malformed body (baseRev not a number) is 400, not 500', async () => {
    const cookie = await signUp();
    const res = await call('/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ baseRev: 'abc', save: sampleSave() }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad-body' });
  });
});

describe('PUT /save — write rate limit', () => {
  // Nothing bounded /save before this: an account is free to create, so a
  // signed-in caller could loop PUTs and burn the D1 write budget three
  // operations at a time. The project's first constraint is that it must not
  // cost money.
  const withLimit = async <T>(ms: string, fn: () => Promise<T>): Promise<T> => {
    const e = env as { MIN_SAVE_INTERVAL_MS?: string };
    const prev = e.MIN_SAVE_INTERVAL_MS;
    e.MIN_SAVE_INTERVAL_MS = ms;
    try {
      return await fn();
    } finally {
      e.MIN_SAVE_INTERVAL_MS = prev;
    }
  };

  it('rejects a second write inside the window with 429, not a silent 200', async () => {
    await withLimit('60000', async () => {
      const cookie = await signUp();
      expect((await putSave(cookie, 0, sampleSave())).status).toBe(200);

      const res = await putSave(cookie, 1, sampleSave({ lifetimeGoo: 999 }));
      // 200 here would be a lie with teeth: a second device would clear its
      // dirty flag believing the save landed, and stop retrying.
      expect(res.status).toBe(429);
      expect((await res.json() as { error: string }).error).toBe('too-fast');
    });
  });

  it('does not write anything when it rejects', async () => {
    await withLimit('60000', async () => {
      const cookie = await signUp();
      await putSave(cookie, 0, sampleSave({ lifetimeGoo: 111 }));
      await putSave(cookie, 1, sampleSave({ lifetimeGoo: 999 }));

      const body = (await (await getSave(cookie)).json()) as { rev: number; save: { lifetimeGoo: number } };
      expect(body.rev).toBe(1);
      expect(body.save.lifetimeGoo).toBe(111); // the suppressed value never landed
    });
  });

  it('lets the first write of a brand-new account through', async () => {
    await withLimit('60000', async () => {
      const cookie = await signUp();
      expect((await putSave(cookie, 0, sampleSave())).status).toBe(200);
    });
  });
});
