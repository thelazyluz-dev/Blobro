// Regression guard for the leaderboard, rewritten when /submit was locked down.
//
// The original version of this file asserted the OLD contract: an anonymous
// caller supplying {code, name, clicks, goo}, with the server clamping whatever
// arrived. Those tests were correct for their time and they failed loudly when
// the contract changed — which is what a regression test is for. They are not
// deleted here, they are re-pointed: the intent ("a stranger cannot write a
// score, and impossible values cannot land on the board") is unchanged, but it
// is now enforced by not accepting scores from the caller at all rather than by
// clamping them afterwards. Per-account and profanity behaviour live in
// leaderboard-auth.integration.test.ts.

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
    body: JSON.stringify({ email: `reg${++n}-${Date.now()}@example.com`, password: 'hunter22' }),
  });
  expect(res.status).toBe(201);
  return (res.headers.get('Set-Cookie') ?? '').split(';')[0];
}

function save(over: Record<string, unknown> = {}) {
  return {
    version: 12, goo: 10, lifetimeGoo: 2_500, clicks: 120,
    upgrades: { finger: 1, power: 0, autoTap: 0, nurture: 0, crit: 0, luck: 0 },
    characters: {}, eggs: 0, totalHatches: 0, sinceRare: 0, bonusesCollected: 0,
    leaderboard: [], achievements: [], ownedCosmetics: [],
    equippedBlob: 'blob-goo', equippedBackground: 'bg-aurora',
    equippedAccessory: 'acc-none', equippedSound: 'sound-classic',
    equippedMain: null, milestonesShown: [], lastSeen: Date.now(), muted: false,
    rng: { seed: 1, cursor: 0 }, ...over,
  };
}

const putSave = (cookie: string, s: unknown) =>
  call('/save', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ baseRev: 0, save: s }),
  });

const submit = (cookie: string, name: string) =>
  call('/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name }),
  });

describe('the leaderboard still works end to end', () => {
  it('a signed-in player with a save is accepted and ranked', async () => {
    const cookie = await signUp();
    await putSave(cookie, save({ lifetimeGoo: 2_500, clicks: 120 }));

    const res = await submit(cookie, 'רָן');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; total: number; clicks: { best: number; rank: number } };
    expect(body.ok).toBe(true);
    expect(body.total).toBeGreaterThan(0);
    expect(body.clicks.best).toBe(120);
    expect(body.clicks.rank).toBeGreaterThan(0);
  });

  it('the name is capped in length before it is stored', async () => {
    const cookie = await signUp();
    await putSave(cookie, save());
    expect((await submit(cookie, 'א'.repeat(80))).status).toBe(200);

    const row = await env.DB.prepare('SELECT name FROM scores ORDER BY updated DESC LIMIT 1').first<{ name: string }>();
    expect(row!.name.length).toBeLessThanOrEqual(12);
  });
});

describe('impossible values cannot reach the board', () => {
  // Previously these arrived in the request and were clamped. Now they can only
  // arrive via a save, which is sanitized by migrate() and audited on write —
  // so the guarantee is stronger, and this asserts the end state either way.
  it('an absurd goo figure in a save does not become an absurd leaderboard score', async () => {
    const cookie = await signUp();
    await putSave(cookie, save({ lifetimeGoo: 1e30 }));
    const res = await submit(cookie, 'רָן');

    if (res.status === 200) {
      const body = (await res.json()) as { goo: { best: number } };
      expect(body.goo.best).toBeLessThanOrEqual(1e18);
    }
    const row = await env.DB.prepare('SELECT MAX(goo) AS g FROM scores').first<{ g: number }>();
    expect(row!.g).toBeLessThanOrEqual(1e18);
  });

  it('an absurd tap count in a save does not become an absurd leaderboard score', async () => {
    const cookie = await signUp();
    await putSave(cookie, save({ clicks: 999_999_999 }));
    await submit(cookie, 'רָן');

    const row = await env.DB.prepare('SELECT MAX(clicks) AS c FROM scores').first<{ c: number }>();
    expect(row!.c).toBeLessThanOrEqual(5_000_000);
  });
});

describe('reading the board stays public and leaks nothing', () => {
  it('GET /top needs no session', async () => {
    expect((await call('/top?by=clicks')).status).toBe(200);
  });

  it('GET /top never returns the row key', async () => {
    const res = await call('/top?by=goo');
    const text = await res.text();
    expect(text).not.toContain('code');
  });

  it('an unknown metric falls back to clicks rather than reaching SQL', async () => {
    const res = await call('/top?by=%27%3B%20DROP%20TABLE%20scores%3B--');
    expect(res.status).toBe(200);
    expect((await res.json() as { by: string }).by).toBe('clicks');

    // The table is still there.
    const still = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores').first<{ c: number }>();
    expect(still).not.toBeNull();
  });
});
