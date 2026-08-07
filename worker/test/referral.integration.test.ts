// Real endpoint integration tests for the referral system (share code, claim,
// and the play-to-qualify counting), against the actual worker on a local D1
// seeded from the REAL schema.sql — same rig as the other *.integration tests.
//
// Run with: cd worker && npx vitest run
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

(env as { ALLOW_PASSWORD_AUTH?: string }).ALLOW_PASSWORD_AUTH = '1';
(env as { MIN_SAVE_INTERVAL_MS?: string }).MIN_SAVE_INTERVAL_MS = '0';

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const request = new Request(`http://worker.example${path}`, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function sessionCookieFrom(res: Response): string {
  const nameValue = (res.headers.get('Set-Cookie') ?? '').split(';')[0];
  expect(nameValue).toMatch(/^blorbo_session=/);
  return nameValue;
}

let counter = 0;
async function signUp(): Promise<string> {
  counter += 1;
  const res = await call('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `ref${counter}-${Date.now()}@example.com`, password: 'hunter22' }),
  });
  expect(res.status).toBe(201);
  return sessionCookieFrom(res);
}

const ORIGIN = 'https://bl-or-bo.com';

async function refMe(cookie: string): Promise<{ code: string | null; count: number }> {
  const res = await call('/referral/me', { headers: { Cookie: cookie } });
  expect(res.status).toBe(200);
  return res.json();
}

async function claim(cookie: string, ref: string): Promise<{ ok: boolean; reason?: string }> {
  const res = await call('/referral/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
    body: JSON.stringify({ ref }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

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
    ownedCosmetics: ['blob-goo', 'bg-aurora', 'acc-none', 'sound-classic'],
    equippedBlob: 'blob-goo',
    equippedBackground: 'bg-aurora',
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

function putSave(cookie: string, baseRev: number, save: unknown): Promise<Response> {
  return call('/save', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
    body: JSON.stringify({ baseRev, save }),
  });
}

describe('/referral/me', () => {
  it('mints a stable code and starts at zero friends', async () => {
    const cookie = await signUp();
    const first = await refMe(cookie);
    expect(first.code).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(first.count).toBe(0);
    // Same code on a second call — it's persisted, not regenerated.
    const second = await refMe(cookie);
    expect(second.code).toBe(first.code);
  });

  it('401 without a session', async () => {
    const res = await call('/referral/me');
    expect(res.status).toBe(401);
  });
});

describe('/referral/claim', () => {
  it('binds a referee to a referrer, and is one-time', async () => {
    const referrer = await signUp();
    const { code } = await refMe(referrer);
    const referee = await signUp();

    expect(await claim(referee, code!)).toEqual({ ok: true });
    // A second claim (even with a different code) is refused — one referrer ever.
    const other = await refMe(await signUp());
    expect((await claim(referee, other.code!)).reason).toBe('already');
  });

  it('rejects self-referral, an unknown code, and a malformed code', async () => {
    const cookie = await signUp();
    const { code } = await refMe(cookie);
    expect((await claim(cookie, code!)).reason).toBe('self');

    const other = await signUp();
    expect((await claim(other, 'ZZZZZZZZ')).reason).toBe('unknown');
    expect((await claim(other, '!!')).reason).toBe('bad-ref');
  });
});

describe('referral qualification (play-to-count)', () => {
  it('counts a referee only after it crosses the play bar, and never twice', async () => {
    const referrer = await signUp();
    const { code } = await refMe(referrer);
    const referee = await signUp();
    await claim(referee, code!);

    // A tiny save (below the bar) does NOT count the referral.
    let r = await putSave(referee, 0, sampleSave({ lifetimeGoo: 100 }));
    expect(r.status).toBe(200);
    expect((await refMe(referrer)).count).toBe(0);

    // A save past the bar qualifies it — the referrer now has 1 friend.
    r = await putSave(referee, 1, sampleSave({ lifetimeGoo: 50_000 }));
    expect(r.status).toBe(200);
    expect((await refMe(referrer)).count).toBe(1);

    // Another qualifying save does NOT double-count.
    r = await putSave(referee, 2, sampleSave({ lifetimeGoo: 90_000 }));
    expect(r.status).toBe(200);
    expect((await refMe(referrer)).count).toBe(1);
  });

  it('surfaces the friend count on /auth/me too', async () => {
    const referrer = await signUp();
    const { code } = await refMe(referrer);
    const referee = await signUp();
    await claim(referee, code!);
    await putSave(referee, 0, sampleSave({ lifetimeGoo: 50_000 }));

    const me = await call('/auth/me', { headers: { Cookie: referrer } });
    const body = (await me.json()) as { referral?: { count: number } };
    expect(body.referral?.count).toBe(1);
  });
});
