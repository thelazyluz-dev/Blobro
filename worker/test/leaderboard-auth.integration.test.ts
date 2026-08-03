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
import worker from '../src/index';

// The email/password routes are disabled in production (Google-only sign-in).
// These tests create accounts through them because it is the only way to mint
// a session without a real Google round-trip; the disabled-by-default behaviour
// has its own tests in auth-endpoints.integration.test.ts.
(env as { ALLOW_PASSWORD_AUTH?: string }).ALLOW_PASSWORD_AUTH = '1';

(env as { MIN_SAVE_INTERVAL_MS?: string }).MIN_SAVE_INTERVAL_MS = '0';

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
    await putSave(cookie, 0, save({ lifetimeGoo: 5_000, clicks: 300 }));

    // The old attack: claim an enormous score. The fields are simply not read.
    const res = await submit(cookie, { name: 'רן', clicks: 4_999_999, goo: 1e18 });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { clicks: { best: number }; goo: { best: number } };
    expect(body.goo.best).toBe(5_000); // the save's value, not the request's
    expect(body.clicks.best).toBe(300);
  });

  it('a second submission cannot inflate the score either', async () => {
    // This was the whole exploit: the first write created the row, and the
    // second lifted the goo cap from a million to 1e18.
    const cookie = await signUp();
    await putSave(cookie, 0, save({ lifetimeGoo: 1_234 }));
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

  it('returns this account row, with no code in the URL', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ lifetimeGoo: 9_876 }));
    await submit(cookie, { name: 'רן' });

    const res = await call('/rank?by=goo', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { score: number };
    expect(body.score).toBe(9_876);
  });
});

describe('GET /top stays public', () => {
  it('needs no session — anyone can read the board', async () => {
    expect((await call('/top?by=goo')).status).toBe(200);
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

  it('a fresh account cannot arrive already rich — the first save is capped', async () => {
    const cookie = await signUp();
    // No history to diff against, so verifySaveDelta alone would call this
    // clean. The worker's first-save cap is what stands in the way.
    expect((await putSave(cookie, 0, save({ lifetimeGoo: 5e9, clicks: 300 }))).status).toBe(200);
    expect((await submit(cookie, { name: 'רן' })).status).toBe(403);
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
