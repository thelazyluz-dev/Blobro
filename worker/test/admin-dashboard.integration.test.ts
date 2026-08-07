// Integration tests for the owner dashboard additions: daily-activity logging,
// the expanded /admin/stats fields, the privacy-safe /admin/players list, and
// the /admin/broadcast push.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

(env as Record<string, string>).ALLOW_PASSWORD_AUTH = '1';
(env as Record<string, string>).MIN_SAVE_INTERVAL_MS = '0';
(env as Record<string, string>).ADMIN_TOKEN = 'test-admin-token';

function bytesToB64url(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

beforeAll(async () => {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
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
  await waitOnExecutionContext(ctx);
  return res;
}
const ADMIN = { Authorization: 'Bearer test-admin-token' };
let n = 0;
async function signUp(): Promise<string> {
  const res = await call('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `adm${++n}-${Date.now()}@example.com`, password: 'hunter22' }),
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
    version: 12, goo: 100, lifetimeGoo: 5000, clicks: 300,
    upgrades: { finger: 1, power: 0, autoTap: 0, nurture: 0, crit: 0, luck: 0 },
    characters: {}, eggs: 0, totalHatches: 0, sinceRare: 0, bonusesCollected: 0,
    leaderboard: [], achievements: [], ownedCosmetics: [],
    equippedBlob: 'blob-goo', equippedBackground: 'bg-aurora', equippedAccessory: 'acc-none',
    equippedSound: 'sound-classic', equippedMain: null, milestonesShown: [], lastSeen: Date.now(),
    muted: false, rng: { seed: 1, cursor: 0 }, ...over,
  };
}
const putSave = (cookie: string, baseRev: number, s: unknown) =>
  call('/save', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ baseRev, save: s }) });
const submit = (cookie: string, name: string) =>
  call('/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ name }) });

describe('daily activity logging', () => {
  it('records one activity row per (account, day) and counts checkpoints', async () => {
    const cookie = await signUp();
    const uid = await userIdFor(cookie);
    expect((await putSave(cookie, 0, save({ goo: 1000, lifetimeGoo: 1000 }))).status).toBe(200);
    expect((await putSave(cookie, 1, save({ goo: 2000, lifetimeGoo: 2000 }))).status).toBe(200);
    const row = await env.DB.prepare('SELECT day, saves FROM activity WHERE user_id = ?1').bind(uid).first<{ day: string; saves: number }>();
    expect(row).toBeTruthy();
    expect(row!.day).toBe(new Date().toISOString().slice(0, 10));
    expect(row!.saves).toBe(2); // two checkpoints today
  });
});

describe('GET /admin/stats — expanded fields', () => {
  it('includes engagement + totals, and today shows in activeByDay', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ goo: 4242, lifetimeGoo: 4242 }));
    const res = await call('/admin/stats', { headers: ADMIN });
    expect(res.status).toBe(200);
    const b = (await res.json()) as Record<string, any>;
    for (const k of ['pushOptIns', 'totalGoo', 'newByDay', 'activeByDay', 'checkpointSeconds']) expect(b).toHaveProperty(k);
    expect(b.totalGoo).toBeGreaterThanOrEqual(4242);
    const today = new Date().toISOString().slice(0, 10);
    expect((b.newByDay as Array<{ day: string }>).some((r) => r.day === today)).toBe(true);
    const active = (b.activeByDay as Array<{ day: string; users: number }>).find((r) => r.day === today);
    expect(active && active.users).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /admin/players — last 100, privacy-safe', () => {
  it('rejects a wrong token', async () => {
    expect((await call('/admin/players')).status).toBe(401);
    expect((await call('/admin/players', { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
  });

  it('lists recent players by nickname only — no email/PII, right shape', async () => {
    const cookie = await signUp();
    await putSave(cookie, 0, save({ goo: 500, lifetimeGoo: 12345, clicks: 42 }));
    await submit(cookie, 'שַׂחְקָן');
    const res = await call('/admin/players', { headers: ADMIN });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { players: Array<Record<string, unknown>> };
    expect(Array.isArray(b.players)).toBe(true);
    expect(JSON.stringify(b)).not.toContain('@example.com'); // no email ever
    const mine = b.players.find((p) => p.name === 'שַׂחְקָן');
    expect(mine).toBeTruthy();
    expect(Object.keys(mine!).sort()).toEqual(['clicks', 'goo', 'joined', 'lastActive', 'name']);
    expect(mine!.goo).toBe(12345);
  });
});

describe('POST /admin/broadcast — push to everyone', () => {
  it('rejects a wrong token', async () => {
    const r = await call('/admin/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'hi' }) });
    expect(r.status).toBe(401);
  });

  it('sends to every opted-in device and reports the count', async () => {
    // One user opts in with a real ECDH key so encryptPayload succeeds.
    const cookie = await signUp();
    const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const sub = await call('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://bl-or-bo.com', Cookie: cookie },
      body: JSON.stringify({ endpoint: 'https://push.example/broadcast-1', keys: { p256dh: bytesToB64url(pub), auth: bytesToB64url(auth) } }),
    });
    expect(sub.status).toBe(200);

    const hits: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      hits.push(url);
      return new Response(null, { status: 201 });
    });
    const res = await call('/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ADMIN },
      body: JSON.stringify({ title: 'עדכון', body: 'שלום לכולם!' }),
    });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { ok: boolean; targeted: number };
    expect(b.ok).toBe(true);
    expect(b.targeted).toBeGreaterThanOrEqual(1);
    expect(hits).toContain('https://push.example/broadcast-1');
  });
});
