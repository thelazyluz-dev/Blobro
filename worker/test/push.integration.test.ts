// Integration tests for the Web Push subscription endpoints, against the real
// worker on a local D1 seeded from schema.sql.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

(env as { ALLOW_PASSWORD_AUTH?: string }).ALLOW_PASSWORD_AUTH = '1';

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const request = new Request(`http://worker.example${path}`, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
function cookieFrom(res: Response): string {
  return (res.headers.get('Set-Cookie') ?? '').split(';')[0];
}
let counter = 0;
async function signUp(): Promise<string> {
  counter += 1;
  const res = await call('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `push${counter}-${Date.now()}@example.com`, password: 'hunter22' }),
  });
  expect(res.status).toBe(201);
  return cookieFrom(res);
}
const ORIGIN = 'https://bl-or-bo.com';
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'BPk_' + 'a'.repeat(84), auth: 'c'.repeat(22) } });

async function subscribe(cookie: string, endpoint: string): Promise<Response> {
  return call('/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
    body: JSON.stringify(sub(endpoint)),
  });
}

async function countSubs(userId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?1').bind(userId).first<{ n: number }>();
  return row?.n ?? 0;
}
async function userIdFor(cookie: string): Promise<string> {
  const res = await call('/auth/me', { headers: { Cookie: cookie } });
  return ((await res.json()) as { user: { id: string } }).user.id;
}

describe('/push/subscribe', () => {
  it('401 without a session', async () => {
    const res = await call('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify(sub('https://push.example/x')),
    });
    expect(res.status).toBe(401);
  });

  it('stores a subscription, and re-subscribing the same endpoint is idempotent', async () => {
    const cookie = await signUp();
    const uid = await userIdFor(cookie);
    expect((await subscribe(cookie, 'https://push.example/aaa')).status).toBe(200);
    expect(await countSubs(uid)).toBe(1);
    // Same endpoint again → still one row (upsert on the endpoint PK).
    expect((await subscribe(cookie, 'https://push.example/aaa')).status).toBe(200);
    expect(await countSubs(uid)).toBe(1);
    // A second device → a second row.
    expect((await subscribe(cookie, 'https://push.example/bbb')).status).toBe(200);
    expect(await countSubs(uid)).toBe(2);
  });

  it('rejects a malformed endpoint / missing keys', async () => {
    const cookie = await signUp();
    const bad = await call('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
      body: JSON.stringify({ endpoint: 'not-a-url', keys: {} }),
    });
    expect(bad.status).toBe(400);
  });
});

describe('/push/unsubscribe', () => {
  it('removes only the caller’s subscription for that endpoint', async () => {
    const cookie = await signUp();
    const uid = await userIdFor(cookie);
    await subscribe(cookie, 'https://push.example/ccc');
    expect(await countSubs(uid)).toBe(1);
    const res = await call('/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
      body: JSON.stringify({ endpoint: 'https://push.example/ccc' }),
    });
    expect(res.status).toBe(200);
    expect(await countSubs(uid)).toBe(0);
  });
});
