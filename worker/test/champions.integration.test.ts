// Hall of Champions (endgame). Reaching the googol summit (owning the
// exclusive 'acc-champion' crown, with the 1e100 lifetime progress behind it)
// enrolls an account in a public roll of honour. These tests pin: the crown
// enrolls, a plain save does not, the "won at" time is stamped once and never
// moves, the board is earliest-first, and the nickname comes from `scores`
// (never a real name), falling back to a kid-safe default.

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';

// Password auth is disabled in production (Google-only); the suite enables it to
// mint sessions without a real Google round-trip. No save-interval throttle so
// two checkpoints can land back to back.
(env as { ALLOW_PASSWORD_AUTH?: string }).ALLOW_PASSWORD_AUTH = '1';
(env as { MIN_SAVE_INTERVAL_MS?: string }).MIN_SAVE_INTERVAL_MS = '0';
// No in-isolate cache between calls, so a read right after an enrolment (or a
// beforeEach wipe) sees the live table, not the previous test's cached roll.
(env as { CHAMPIONS_TTL_MS?: string }).CHAMPIONS_TTL_MS = '0';

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
    body: JSON.stringify({ email: `champ${++n}-${Date.now()}@example.com`, password: 'hunter22' }),
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

const putSave = (cookie: string, s: unknown, baseRev = 0) =>
  call('/save', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ baseRev, save: s }),
  });

const submit = (cookie: string, name: string) =>
  call('/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name }),
  });

const champions = () => call('/champions');

// A won save: the exclusive crown plus the 1e100 progress it is only ever
// granted for. (1e100 < MAX_GOO 1e103, so this is legitimate, not absurd.)
const wonSave = (over: Record<string, unknown> = {}) =>
  save({ ownedCosmetics: ['acc-champion'], lifetimeGoo: 1e100, goo: 1e100, ...over });

beforeEach(async () => {
  // A shared D1 persists across tests in a file; clear the champions roll so
  // each test's assertions see only its own enrollees.
  await env.DB.prepare('DELETE FROM champions').run();
});

describe('the Hall of Champions', () => {
  it('is public and starts empty', async () => {
    const res = await champions();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: unknown[] };
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries).toHaveLength(0);
  });

  it('enrolls an account whose save carries the champion crown', async () => {
    const cookie = await signUp();
    await putSave(cookie, wonSave());

    const body = (await (await champions()).json()) as { entries: { rank: number; name: string; wonAt: number }[] };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].rank).toBe(1);
    expect(body.entries[0].wonAt).toBeGreaterThan(0);
    // No leaderboard nickname set → a kid-safe default, never a real name.
    expect(body.entries[0].name).toBe('אַלּוּף אַלְמוֹנִי');
  });

  it('does NOT enroll a plain save (no crown)', async () => {
    const cookie = await signUp();
    await putSave(cookie, save());
    const body = (await (await champions()).json()) as { entries: unknown[] };
    expect(body.entries).toHaveLength(0);
  });

  it('does NOT enroll a hand-edited crown without the 1e100 progress behind it', async () => {
    const cookie = await signUp();
    // The cosmetic is present but lifetimeGoo is nowhere near the summit — the
    // consistency guard drops it (the crown is only ever granted at 1e100).
    await putSave(cookie, save({ ownedCosmetics: ['acc-champion'], lifetimeGoo: 2_500 }));
    const body = (await (await champions()).json()) as { entries: unknown[] };
    expect(body.entries).toHaveLength(0);
  });

  it('shows the leaderboard nickname when the champion has one', async () => {
    const cookie = await signUp();
    // A legitimate small save first, published to the board so a scores row (and
    // nickname) exists, then the winning checkpoint carrying the crown.
    await putSave(cookie, save({ lifetimeGoo: 2_500, clicks: 120 }));
    expect((await submit(cookie, 'רָן')).status).toBe(200);
    await putSave(cookie, wonSave(), 1);

    const body = (await (await champions()).json()) as { entries: { name: string }[] };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].name).toBe('רָן');
  });

  it('stamps won_at once — a later crowned save never moves a champion', async () => {
    const cookie = await signUp();
    await putSave(cookie, wonSave());
    const first = (await (await champions()).json()) as { entries: { wonAt: number }[] };
    const wonAt = first.entries[0].wonAt;

    // Earn more and save again, still crowned — the enrollment must not re-stamp.
    await putSave(cookie, wonSave({ lifetimeGoo: 2e100, goo: 2e100 }), 1);
    const second = (await (await champions()).json()) as { entries: { wonAt: number }[] };
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0].wonAt).toBe(wonAt); // unchanged
  });

  it('orders the roll earliest-first (the pioneers head the list)', async () => {
    const a = await signUp();
    await putSave(a, save({ lifetimeGoo: 2_500 }));
    expect((await submit(a, 'רִאשׁוֹן')).status).toBe(200);
    await putSave(a, wonSave(), 1);

    const b = await signUp();
    await putSave(b, save({ lifetimeGoo: 2_500 }));
    expect((await submit(b, 'שֵׁנִי')).status).toBe(200);
    await putSave(b, wonSave(), 1);

    const body = (await (await champions()).json()) as { entries: { rank: number; name: string }[] };
    expect(body.entries.map((e) => e.name)).toEqual(['רִאשׁוֹן', 'שֵׁנִי']);
    expect(body.entries.map((e) => e.rank)).toEqual([1, 2]);
  });
});
