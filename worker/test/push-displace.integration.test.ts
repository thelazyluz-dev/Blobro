// Integration test for the displacement pushes fired on /submit: when a rising
// score overtakes the #1, the old leader is notified — UNLESS they're actively
// playing (a recent save), in which case the in-app toast covers it and the
// push is suppressed. This is the owner-reported fix: no stale "someone overtook
// you" popping up while you're already in the game.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

(env as { ALLOW_PASSWORD_AUTH?: string }).ALLOW_PASSWORD_AUTH = '1';

function bytesToB64url(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

beforeAll(async () => {
  // notifyDisplaced only runs when VAPID is configured — give it a real keypair.
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const e = env as Record<string, string>;
  e.VAPID_PUBLIC_KEY = bytesToB64url(pub);
  e.VAPID_PRIVATE_KEY = jwk.d as string;
  e.VAPID_SUBJECT = 'mailto:test@example.com';
});

afterEach(() => vi.unstubAllGlobals());

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const request = new Request(`http://worker.example${path}`, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx); // drains ctx.waitUntil (notifyDisplaced)
  return res;
}

let n = 0;
async function signUp(): Promise<string> {
  const res = await call('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `disp${++n}-${Date.now()}@example.com`, password: 'hunter22' }),
  });
  expect(res.status).toBe(201);
  return (res.headers.get('Set-Cookie') ?? '').split(';')[0];
}
async function userIdFor(cookie: string): Promise<string> {
  const res = await call('/auth/me', { headers: { Cookie: cookie } });
  return ((await res.json()) as { user: { id: string } }).user.id;
}

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
  call('/save', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ baseRev, save: s }) });
const submit = (cookie: string, name: string) =>
  call('/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ name }) });

// A subscription with a REAL ECDH public key so encryptPayload succeeds and a
// real fetch is attempted (which we capture).
async function subscribe(cookie: string, endpoint: string): Promise<void> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const res = await call('/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://bl-or-bo.com', Cookie: cookie },
    body: JSON.stringify({ endpoint, keys: { p256dh: bytesToB64url(pub), auth: bytesToB64url(auth) } }),
  });
  expect(res.status).toBe(200);
}
const ageSave = (userId: string, updated: number) =>
  env.DB.prepare('UPDATE saves SET updated = ?1 WHERE user_id = ?2').bind(updated, userId).run();

// Capture the endpoints sendPush actually POSTs to.
function captureFetch(): string[] {
  const hits: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    hits.push(url);
    return new Response(null, { status: 201 });
  });
  return hits;
}

describe('displacement push — overtaking the #1', () => {
  it('pushes the dethroned leader when they are NOT actively playing', async () => {
    const leader = await signUp();
    const leaderId = await userIdFor(leader);
    await subscribe(leader, 'https://push.example/leader-inactive');
    await putSave(leader, 0, save({ goo: 1_000, lifetimeGoo: 1_000 }));
    await submit(leader, 'מוֹבִיל');

    // Leader went idle — their save is old, so isActive() is false.
    await ageSave(leaderId, Date.now() - 10 * 60 * 1000);

    const challenger = await signUp();
    await putSave(challenger, 0, save({ goo: 2_000, lifetimeGoo: 2_000 }));

    const hits = captureFetch();
    await submit(challenger, 'מְאַתְגֵּר'); // overtakes on goo
    expect(hits).toContain('https://push.example/leader-inactive');
  });

  it('does NOT push a dethroned leader who is actively playing (recent save)', async () => {
    const leader = await signUp();
    const leaderId = await userIdFor(leader);
    await subscribe(leader, 'https://push.example/leader-active');
    await putSave(leader, 0, save({ goo: 3_000, lifetimeGoo: 3_000 }));
    await submit(leader, 'מוֹבִיל2');

    // Leader is active right now (fresh save) → the in-app toast handles it.
    await ageSave(leaderId, Date.now());

    const challenger = await signUp();
    await putSave(challenger, 0, save({ goo: 4_000, lifetimeGoo: 4_000 }));

    const hits = captureFetch();
    await submit(challenger, 'מְאַתְגֵּר2');
    expect(hits).not.toContain('https://push.example/leader-active');
  });
});
