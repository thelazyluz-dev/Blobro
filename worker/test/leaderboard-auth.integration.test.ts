// The leaderboard write path (PR 9, pulled forward).
//
// Before this, POST /submit accepted {code, name, clicks, goo} from anyone at
// all. Three things were wrong at once and each has a test here:
//   • no authentication — the "code" was a string the caller invented;
//   • the scores were simply whatever the caller typed, and two requests were
//     enough to own the goo board permanently (the first created the row, the
//     second lifted the cap from a million to 1e18);
//   • the nickname filter ran only in the UI, so a stranger could put any word
//     they liked on a board that children read.

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker, { FIRST_SAVE_CAP_BARS_SINCE } from '../src/index';
import { maxCpm } from '../src/rules';

// The email/password routes are disabled in production (Google-only sign-in).
// These tests create accounts through them because it is the only way to mint
// a session without a real Google round-trip; the disabled-by-default behaviour
// has its own tests in auth-endpoints.integration.test.ts.
(env as { ALLOW_PASSWORD_AUTH?: string }).ALLOW_PASSWORD_AUTH = '1';

(env as { MIN_SAVE_INTERVAL_MS?: string }).MIN_SAVE_INTERVAL_MS = '0';
(env as { RANK_HISTOGRAM_TTL_MS?: string }).RANK_HISTOGRAM_TTL_MS = '0';
(env as { ADMIN_TOKEN?: string }).ADMIN_TOKEN = 'test-admin-token';

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const request = new Request(`http://worker.example${path}`, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

let n = 0;
async function signUp(): Promise<string> {
  const res = await call('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `lb${++n}-${Date.now()}@example.com`, password: 'hunter22' }),
  });
  expect(res.status).toBe(201);
  return (res.headers.get('Set-Cookie') ?? '').split(';')[0];
}

const submit = (cookie: string | undefined, body: unknown) =>
  call('/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });

function save(over: Record<string, unknown> = {}) {
  return {
    version: 12, goo: 100, lifetimeGoo: 5_000, clicks: 300,
    upgrades: { finger: 1, power: 0, autoTap: 0, nurture: 0, crit: 0, luck: 0 },
    characters: {}, eggs: 0, totalHatches: 0, sinceRare: 0, bonusesCollected: 0,
    leaderboard: [], achievements: [], ownedCosmetics: [],
    equippedBlob: 'blob-goo', equippedBackground: 'bg-aurora',
    equippedAccessory: 'acc-none', equippedSound: 'sound-classic',
    equippedMain: null, milestonesShown: [], lastSeen: Date.now(), muted: false,
    rng: { seed: 1, cursor: 0 }, ...over,
  };
}

const putSave = (cookie: string, baseRev: number, s: unknown) =>
  call('/save', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ baseRev, save: s }),
  });

describe('POST /submit — authentication', () => {
  it('rejects an anonymous submission', async () => {
    const res = await submit(undefined, { name: 'רן' });
    expect(res.status).toBe(401);
  });

  it('rejects a made-up device code — codes are no longer accepted at all', async () => {
    const res = await submit(undefined, { code: 'totallymadeupcode123', name: 'רן', clicks: 4_000_000, goo: 1e17 });
    expect(res.status).toBe(401);
  });
});

describe('POST /submit — the scores come from the server, never the request', () => {
  it('ignores clicks and goo in the body entirely', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ goo: 4_200, lifetimeGoo: 5_000, clicks: 300 }));

    // The old attack: claim an enormous score. The fields are simply not read.
    const res = await submit(cookie, { name: 'רן', clicks: 4_999_999, goo: 1e18 });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { clicks: { best: number }; goo: { best: number } };
    expect(body.goo.best).toBe(4_200); // the save's HELD goo — not lifetime, not the request's number
    expect(body.clicks.best).toBe(300);
  });

  it('a second submission cannot inflate the score either', async () => {
    // This was the whole exploit: the first write created the row, and the
    // second lifted the goo cap from a million to 1e18.
    const cookie = await signUp();
    await putSave(cookie, 0, save({ goo: 1_234, lifetimeGoo: 1_234 }));
    await submit(cookie, { name: 'רן' });

    (env as { MIN_SUBMIT?: string }).MIN_SUBMIT = undefined;
    const second = await submit(cookie, { name: 'רן', goo: 1e18, clicks: 4_000_000 });
    // Either rate-limited or accepted, but never with the injected numbers.
    if (second.status === 200) {
      const body = (await second.json()) as { goo: { best: number } };
      expect(body.goo.best).toBe(1_234);
    } else {
      expect(second.status).toBe(429);
    }
  });

  it('refuses to rank an account that has no save yet', async () => {
    const cookie = await signUp();
    const res = await submit(cookie, { name: 'רן' });
    expect(res.status).toBe(409);
  });
});

describe('POST /submit — nickname filtering is enforced server-side', () => {
  it('rejects profanity that the UI would have blocked', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save());
    const res = await submit(cookie, { name: 'fuck' });
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('bad-name');
  });

  it('accepts an ordinary Hebrew nickname', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save());
    expect((await submit(cookie, { name: 'רָן' })).status).toBe(200);
  });

  it('rejects an empty name', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save());
    expect((await submit(cookie, { name: '   ' })).status).toBe(400);
  });
});

describe('GET /rank — session-scoped', () => {
  it('rejects an anonymous caller', async () => {
    expect((await call('/rank?by=goo')).status).toBe(401);
  });

  it('is rate-limited per account per metric — the D1-cost hot path cannot be looped', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ goo: 9, lifetimeGoo: 9 }));
    await submit(cookie, { name: 'רן' });
    expect((await call('/rank?by=goo', { headers: { Cookie: cookie } })).status).toBe(200);
    // Immediate repeat on the SAME metric → throttled.
    expect((await call('/rank?by=goo', { headers: { Cookie: cookie } })).status).toBe(429);
    // A different metric has its own key and still answers.
    expect((await call('/rank?by=clicks', { headers: { Cookie: cookie } })).status).toBe(200);
  });

  it('returns this account row, with no code in the URL', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ goo: 9_876, lifetimeGoo: 9_876 }));
    await submit(cookie, { name: 'רן' });

    const res = await call('/rank?by=goo', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { score: number };
    expect(body.score).toBe(9_876);
  });
});

describe('POST /ad-event — aggregate ad telemetry', () => {
  const event = (cookie: string | undefined, body: unknown) =>
    call('/ad-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });

  it('rejects anonymous senders (spam resistance), but stores NO identity', async () => {
    expect((await event(undefined, { purpose: 'boost', outcome: 'shown' })).status).toBe(401);
    const cookie = await signUp();
    expect((await event(cookie, { purpose: 'egg', outcome: 'no_fill' })).status).toBe(200);
    const row = await env.DB.prepare('SELECT purpose, outcome FROM ad_events ORDER BY id DESC LIMIT 1').first<{
      purpose: string;
      outcome: string;
    }>();
    expect(row).toEqual({ purpose: 'egg', outcome: 'no_fill' });
    // The privacy contract: the table has no user column at all.
    const cols = await env.DB.prepare("SELECT name FROM pragma_table_info('ad_events')").all<{ name: string }>();
    expect(cols.results.map((c) => c.name)).toEqual(['id', 'purpose', 'outcome', 'created']);
  });

  it('rejects values outside the allowlists', async () => {
    const cookie = await signUp();
    expect((await event(cookie, { purpose: 'banner', outcome: 'shown' })).status).toBe(400);
    expect((await event(cookie, { purpose: 'boost', outcome: 'clicked' })).status).toBe(400);
  });

  it('throttles rapid ad-events from one account so they cannot spam D1 writes', async () => {
    const cookie = await signUp();
    const before = (await env.DB.prepare('SELECT COUNT(*) AS c FROM ad_events').first<{ c: number }>())!.c;
    expect((await event(cookie, { purpose: 'boost', outcome: 'shown' })).status).toBe(200);
    // Immediate second call: still answered ok (fire-and-forget), but dropped — no D1 write.
    expect((await event(cookie, { purpose: 'boost', outcome: 'reward' })).status).toBe(200);
    const after = (await env.DB.prepare('SELECT COUNT(*) AS c FROM ad_events').first<{ c: number }>())!.c;
    expect(after - before).toBe(1);
  });
});

describe('GET /admin/stats — owner dashboard, bearer-gated & aggregate-only', () => {
  const stats = (token?: string) =>
    call('/admin/stats', { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it('rejects a missing or wrong token', async () => {
    expect((await stats()).status).toBe(401);
    expect((await stats('nope')).status).toBe(401);
  });

  it('returns aggregate stats with the right token — no per-user PII', async () => {
    // Seed one player so the counts are non-trivial.
    const cookie = await signUp();
    await putSave(cookie, 0, save({ goo: 4242, lifetimeGoo: 4242 }));
    await submit(cookie, { name: 'רן' });

    const res = await stats('test-admin-token');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    for (const k of ['accounts', 'activeNow', 'active24h', 'newAccounts7d', 'boardSize', 'topGoo', 'topClicks', 'ads']) {
      expect(body).toHaveProperty(k);
    }
    expect(body.accounts as number).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.topGoo)).toBe(true);
    // The privacy contract: leaderboard rows carry a nickname + score, never an
    // email/id, and there is no user list anywhere in the payload.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('@example.com');
    for (const row of body.topGoo as Array<Record<string, unknown>>) {
      expect(Object.keys(row).sort()).toEqual(['name', 'score']);
    }
  });

  it('reflects fresh save progress without a new /submit (reads the saves table)', async () => {
    const cookie = await signUp();
    // Join the board once — scores.goo is now 1,111.
    await putSave(cookie, 0, save({ goo: 1_111, lifetimeGoo: 9_999_999 }));
    await submit(cookie, { name: 'פְרֶשׁ' });
    // Keep playing: the 60s checkpoint save updates, but the player never reopens
    // the leaderboard, so /submit is NOT called again.
    await putSave(cookie, 1, save({ goo: 7_654_321, lifetimeGoo: 9_999_999 }));

    const res = await stats('test-admin-token');
    const body = (await res.json()) as { topGoo: Array<{ name: string | null; score: number }> };
    const row = body.topGoo.find((r) => r.name === 'פְרֶשׁ');
    expect(row).toBeDefined();
    // The dashboard shows the FRESH held goo from the save (7,654,321), not the
    // stale 1,111 that /submit last wrote to the scores table.
    expect(row!.score).toBe(7_654_321);
  });
});

describe('POST /admin/edit — testing tool: set a player’s goo/clicks by nickname', () => {
  const edit = (token: string | undefined, body: unknown) =>
    call('/admin/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

  it('rejects a missing or wrong token', async () => {
    expect((await edit(undefined, { nickname: 'x', goo: 1 })).status).toBe(401);
    expect((await edit('nope', { nickname: 'x', goo: 1 })).status).toBe(401);
  });

  it('404s an unknown nickname', async () => {
    expect((await edit('test-admin-token', { nickname: 'לא-קיים-בכלל', goo: 1 })).status).toBe(404);
  });

  it('overwrites held goo + clicks, keeps lifetimeGoo ≥ goo, and the dashboard reflects it', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ goo: 100, lifetimeGoo: 5_000, clicks: 300 }));
    await submit(cookie, { name: 'עֲרִיכָה' });

    const res = await edit('test-admin-token', { nickname: 'עֲרִיכָה', goo: 999_999, clicks: 12_345 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; goo: number; clicks: number; lifetimeGoo: number };
    expect(body.ok).toBe(true);
    expect(body.goo).toBe(999_999);
    expect(body.clicks).toBe(12_345);
    expect(body.lifetimeGoo).toBeGreaterThanOrEqual(999_999); // raised to stay ≥ held goo

    // Persisted: the dashboard (which reads the saves table) now shows it.
    const stats = (await (await call('/admin/stats', { headers: { Authorization: 'Bearer test-admin-token' } })).json()) as {
      topGoo: Array<{ name: string | null; score: number }>;
      topClicks: Array<{ name: string | null; score: number }>;
    };
    expect(stats.topGoo.find((r) => r.name === 'עֲרִיכָה')?.score).toBe(999_999);
    expect(stats.topClicks.find((r) => r.name === 'עֲרִיכָה')?.score).toBe(12_345);
  });

  it('rejects an edit with nothing to change', async () => {
    expect((await edit('test-admin-token', { nickname: 'עֲרִיכָה' })).status).toBe(400);
  });
});

describe('GET /top stays public', () => {
  it('needs no session — anyone can read the board', async () => {
    const res = await call('/top?by=goo');
    expect(res.status).toBe(200);
    // Short browser-side cache: reopening the board within 30s costs nothing.
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
  });
});

describe('GET /boards — all three top-10 lists in one cached call', () => {
  it('is public and returns goo/clicks/cpm arrays', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ goo: 12_345, lifetimeGoo: 12_345, clicks: 777 }));
    await submit(cookie, { name: 'אֶלּוּף' });

    const res = await call('/boards');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
    const body = (await res.json()) as Record<string, Array<{ name: string; score: number }>>;
    for (const k of ['goo', 'clicks', 'cpm']) expect(Array.isArray(body[k])).toBe(true);
    // The player we just seeded leads the goo board.
    expect(body.goo.some((e) => e.name === 'אֶלּוּף')).toBe(true);
  });
});

// ── Enforcement (PR 6, minimal) ─────────────────────────────────────────────
// The audit stopped being purely shadow: an account with a rate-violation on
// record keeps its cloud save but is not published to the board. These tests
// pin the exact boundary — what bars, what deliberately doesn't, and that the
// save itself is never blocked or lost.

async function userIdFor(cookie: string): Promise<string> {
  const res = await call('/auth/me', { headers: { Cookie: cookie } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { user: { id: string } }).user.id;
}

describe('POST /submit — flagged accounts are not published', () => {
  it('an impossible goo jump bars the account from the board, but never costs it the save', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ lifetimeGoo: 5_000, clicks: 300 }));
    // A gain of 1e15 goo in one 10-second window at finger level 1 — the
    // exact F12 attack: write absurd numbers into /save, then publish them.
    const res = await putSave(cookie, 1, save({ lifetimeGoo: 1e15, clicks: 350 }));
    expect(res.status).toBe(200); // the save is stored — progress is never destroyed on suspicion

    const submit1 = await submit(cookie, { name: 'רן' });
    expect(submit1.status).toBe(403);
    expect(((await submit1.json()) as { error: string }).error).toBe('flagged');

    // The cloud save is intact and readable — only the board is withheld.
    const get = await call('/save', { headers: { Cookie: cookie } });
    expect(((await get.json()) as { save: { lifetimeGoo: number } }).save.lifetimeGoo).toBe(1e15);
  });

  it('a rich first save is always RECORDED, and bars only once the migration grace ends', async () => {
    const cookie = await signUp();
    const userId = await userIdFor(cookie);
    // No history to diff against, so verifySaveDelta alone would call this
    // clean. The worker's first-save cap records it either way.
    expect((await putSave(cookie, 0, save({ lifetimeGoo: 5e9, clicks: 300 }))).status).toBe(200);
    const row = await env.DB.prepare(
      `SELECT flags, ok FROM save_audit WHERE user_id = ?1 ORDER BY created DESC LIMIT 1`,
    )
      .bind(userId)
      .first<{ flags: string; ok: number }>();
    expect(row?.flags).toContain('first-save-cap');
    expect(row?.ok).toBe(0);
    // Whether it BARS depends on the calendar: during the sign-in migration
    // window an honest pre-auth player's carried-over local save looks exactly
    // like this, so the flag is data, not a verdict. After the grace date every
    // first save really is a brand-new account and the cap arms itself.
    const expected = Date.now() >= FIRST_SAVE_CAP_BARS_SINCE ? 403 : 200;
    expect((await submit(cookie, { name: 'רן' })).status).toBe(expected);
  });

  it('the first-save cap re-arms after the grace date (synthetic post-grace flag bars)', async () => {
    const cookie = await signUp();
    const userId = await userIdFor(cookie);
    await putSave(cookie, 0, save({ lifetimeGoo: 5_000, clicks: 300 }));
    await env.DB.prepare(
      `INSERT INTO save_audit (user_id, rev, created, elapsed_sec, goo_gain, max_gain, ratio, click_gain, flags, ok)
       VALUES (?1, 1, ?2, 0, 5e9, 0, 0, 0, 'first-save-cap', 0)`,
    )
      .bind(userId, FIRST_SAVE_CAP_BARS_SINCE + 86_400_000) // one day after the cap arms
      .run();
    expect((await submit(cookie, { name: 'רן' })).status).toBe(403);
  });

  it('a migration-window first-save flag does NOT bar — retroactive release included', async () => {
    const cookie = await signUp();
    const userId = await userIdFor(cookie);
    await putSave(cookie, 0, save({ lifetimeGoo: 5_000, clicks: 300 }));
    // Exactly the rows the Aug-3..grace window wrote for honest pre-auth
    // players: enforcement-era created, first-save-cap only. Read-time
    // filtering means these release without any manual D1 surgery.
    await env.DB.prepare(
      `INSERT INTO save_audit (user_id, rev, created, elapsed_sec, goo_gain, max_gain, ratio, click_gain, flags, ok)
       VALUES (?1, 1, ?2, 0, 5e9, 0, 0, 0, 'first-save-cap', 0)`,
    )
      .bind(userId, Date.UTC(2026, 7, 3) + 3_600_000) // an hour into enforcement day
      .run();
    expect((await submit(cookie, { name: 'רן' })).status).toBe(200);
  });

  it('a deliberate restore (decrease) does NOT bar — that is the button we gave players', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ lifetimeGoo: 5_000, clicks: 300 }));
    const res = await call('/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ baseRev: 1, save: save({ lifetimeGoo: 4_000, clicks: 250 }), rollback: true }),
    });
    expect(res.status).toBe(200);
    expect((await submit(cookie, { name: 'רן' })).status).toBe(200);
  });

  it('flags recorded before enforcement shipped do not bar — shadow-era data keeps its contract', async () => {
    const cookie = await signUp();
    const userId = await userIdFor(cookie);
    await putSave(cookie, 0, save({ lifetimeGoo: 5_000, clicks: 300 }));
    // A goo-rate flag as the shadow period would have recorded it: before the
    // enforcement date. The family's test accounts carry rows like this one.
    await env.DB.prepare(
      `INSERT INTO save_audit (user_id, rev, created, elapsed_sec, goo_gain, max_gain, ratio, click_gain, flags, ok)
       VALUES (?1, 1, ?2, 10, 1e15, 1e6, 1e9, 0, 'goo-rate', 0)`,
    )
      .bind(userId, Date.UTC(2026, 7, 2)) // the day before SUBMIT_ENFORCE_SINCE
      .run();
    expect((await submit(cookie, { name: 'רן' })).status).toBe(200);
  });

  it('an ordinary honest account is untouched by all of this', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ lifetimeGoo: 5_000, clicks: 300 }));
    expect((await submit(cookie, { name: 'רן' })).status).toBe(200);
  });
});

// ── The taps-per-minute board + held-goo semantics ──────────────────────────

describe('the cpm board and the held-goo board', () => {
  it('bestCpm flows from the save to the board and /top?by=cpm ranks by it', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ bestCpm: 412 }));
    const res = await submit(cookie, { name: 'רן' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cpm: { best: number; rank: number } };
    expect(body.cpm.best).toBe(412);
    expect(body.cpm.rank).toBeGreaterThan(0);

    const top = await call('/top?by=cpm');
    expect(top.status).toBe(200);
    const list = (await top.json()) as { by: string; entries: { score: number }[] };
    expect(list.by).toBe('cpm');
    expect(list.entries.some((e) => e.score === 412)).toBe(true);
  });

  it('an impossible bestCpm in the save is clamped to the physical ceiling, not published', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ bestCpm: 99_999 }));
    const res = await submit(cookie, { name: 'רן' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cpm: { best: number } };
    expect(body.cpm.best).toBe(maxCpm); // maxHumanTapsPerSec * 60 — see game/cpm.ts
  });

  it('flags a first save that already claims a high taps-per-minute record', async () => {
    // cpm has no delta audit, so the first-save cap is its only guard against an
    // instant fabricated ⚡ #1. Small goo/clicks isolate the cpm trigger.
    const cookie = await signUp();
    await putSave(cookie, 0, save({ bestCpm: 2500, goo: 100, lifetimeGoo: 100, clicks: 10 }));
    const row = await env.DB.prepare('SELECT flags, ok FROM save_audit ORDER BY id DESC LIMIT 1').first<{
      flags: string;
      ok: number;
    }>();
    expect(row?.ok).toBe(0);
    expect((row?.flags ?? '').split(',')).toContain('first-save-cap');
  });

  it('the goo board tracks the CURRENT balance — it goes DOWN after spending', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ goo: 4_000, lifetimeGoo: 5_000 }));
    const first = await submit(cookie, { name: 'רן' });
    expect(((await first.json()) as { goo: { best: number } }).goo.best).toBe(4_000);

    // The player spends: held goo drops, lifetime doesn't. Push the updated
    // save, age the scores row past the submit rate-limit, resubmit.
    await putSave(cookie, 1, save({ goo: 700, lifetimeGoo: 5_000 }));
    await env.DB.prepare('UPDATE scores SET updated = updated - 20000').run();
    const second = await submit(cookie, { name: 'רן' });
    expect(second.status).toBe(200);
    const body = (await second.json()) as { goo: { best: number }; clicks: { best: number } };
    expect(body.goo.best).toBe(700); // down — the board shows what you hold
    expect(body.clicks.best).toBe(300); // records still never move backwards
  });

  it('held goo can never exceed lifetime — the edited-save shortcut onto the board is closed', async () => {
    const cookie = await signUp();
    // The attack: a fortune in `goo` next to a small, audit-clean lifetime.
    // migrate() raises lifetime to match, which makes the fortune a lifetime
    // JUMP — and on a first save that trips the first-save cap. 1e15 is below
    // the game's hard ceilings, so during the sign-in migration grace it is
    // indistinguishable from an honest carried-over save and publishes; once
    // the cap arms (FIRST_SAVE_CAP_BARS_SINCE) it bars.
    await putSave(cookie, 0, save({ goo: 1e15, lifetimeGoo: 50 }));
    const expected = Date.now() >= FIRST_SAVE_CAP_BARS_SINCE ? 403 : 200;
    expect((await submit(cookie, { name: 'רן' })).status).toBe(expected);
  });
});

// The rank comes from a once-a-minute score histogram (approxRank in index.ts),
// not a per-request COUNT scan. With RANK_HISTOGRAM_TTL_MS=0 (set at the top of
// this file) every read rebuilds it, and well-separated scores land in distinct
// buckets — where the approximation is exactly the true rank.
describe('GET /rank — approximate ranks from the score histogram', () => {
  const rankOf = async (cookie: string) => {
    const res = await call('/rank?by=goo', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    return (await res.json()) as { rank: number; score: number; total: number };
  };

  it('orders well-separated goo scores 1, 2, 3 and reports a plausible total', async () => {
    const specs = [
      { goo: 5_000, name: 'נָמוּךְ' },
      { goo: 5_000_000, name: 'אֶמְצַע' },
      { goo: 5_000_000_000, name: 'גָּבוֹהַּ' },
    ];
    const cookies: string[] = [];
    for (const s of specs) {
      const c = await signUp();
      await putSave(c, 0, save({ goo: s.goo, lifetimeGoo: s.goo }));
      expect((await submit(c, { name: s.name })).status).toBe(200);
      cookies.push(c);
    }

    const high = await rankOf(cookies[2]);
    const mid = await rankOf(cookies[1]);
    const low = await rankOf(cookies[0]);

    expect(high.score).toBe(5_000_000_000);
    expect(high.rank).toBe(1);
    expect(mid.rank).toBe(2);
    expect(low.rank).toBe(3);
    // total is the up-to-60s-stale cached count (see cachedTotalScores), so we
    // only assert it's populated — freshness isn't this test's concern.
    expect(high.total).toBeGreaterThan(0);
    // the reported total is always guarded up to the player's own rank
    expect(low.rank).toBeLessThanOrEqual(low.total);
  });
});
