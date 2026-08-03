// Real endpoint integration tests for PR 3a, exercising the actual worker
// (src/index.ts) inside Miniflare/workerd via @cloudflare/vitest-pool-workers,
// against a local D1 seeded from the REAL schema.sql (see vitest.config.ts +
// test/apply-schema.ts). This is a genuine end-to-end test of the HTTP
// surface, not a hand-rolled fake D1 — request in, real SQL, response out.
//
// Run with: cd worker && npx vitest run
// (NOT part of the root `npm test` — see worker/README.md "Testing".)
//
// Not covered here (honestly, not faked): the Google OAuth *callback's*
// happy path needs a real `code` exchanged with Google's token endpoint,
// which requires live credentials this sandbox doesn't have. What IS
// covered: /auth/google/start's PKCE+state cookie mechanics indirectly via
// the auth.ts unit tests, and that both Google routes correctly no-op with
// 501 when GOOGLE_CLIENT_ID/SECRET aren't configured (this repo's default,
// safe state).
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';

const ORIGIN = 'https://bl-or-bo.com';

function sessionCookieFrom(res: Response): string {
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  const nameValue = setCookie.split(';')[0];
  expect(nameValue).toMatch(/^blorbo_session=/);
  return nameValue;
}

async function call(path: string, init: RequestInit & { origin?: string } = {}): Promise<Response> {
  const { origin, headers, ...rest } = init;
  const request = new Request(`http://worker.example${path}`, {
    ...rest,
    headers: { ...(headers as Record<string, string> | undefined), ...(origin ? { Origin: origin } : {}) },
  });
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function jsonInit(body: unknown, extra: RequestInit = {}): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...extra };
}

// Fresh, unique email per test so tests don't interact via the shared D1
// (Miniflare's default is NOT necessarily reset between tests in this pool
// version, so isolate by data instead of relying on storage reset).
let counter = 0;
function freshEmail(): string {
  counter += 1;
  return `player${counter}-${Date.now()}@example.com`;
}

describe('leaderboard routes still work (no regression from PR 3a)', () => {
  it('GET /health', async () => {
    const res = await call('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('GET /top returns the public leaderboard shape', async () => {
    const res = await call('/top?by=clicks');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { by: string; entries: unknown[] };
    expect(body.by).toBe('clicks');
    expect(Array.isArray(body.entries)).toBe(true);
  });
});

describe('POST /auth/register', () => {
  it('creates an account, sets a session cookie, and returns the public user shape', async () => {
    const email = freshEmail();
    const res = await call('/auth/register', jsonInit({ email, password: 'hunter22', displayName: 'Test Kid' }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { id: string; email: string; displayName: string | null } };
    expect(body.user.email).toBe(email);
    expect(body.user.displayName).toBe('Test Kid');
    expect(typeof body.user.id).toBe('string');
    sessionCookieFrom(res); // throws/asserts if missing
  });

  it('lowercases the email', async () => {
    const email = `MixedCase-${Date.now()}@Example.com`;
    const res = await call('/auth/register', jsonInit({ email, password: 'hunter22' }));
    const body = (await res.json()) as { user: { email: string } };
    expect(body.user.email).toBe(email.toLowerCase());
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await call('/auth/register', jsonInit({ email: freshEmail(), password: 'short' }));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed email', async () => {
    const res = await call('/auth/register', jsonInit({ email: 'not-an-email', password: 'hunter22' }));
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email with 409', async () => {
    const email = freshEmail();
    const first = await call('/auth/register', jsonInit({ email, password: 'hunter22' }));
    expect(first.status).toBe(201);
    const second = await call('/auth/register', jsonInit({ email, password: 'different-pass' }));
    expect(second.status).toBe(409);
  });
});

describe('POST /auth/login + GET /auth/me + POST /auth/logout', () => {
  it('logs in with correct credentials and can fetch /auth/me with the cookie', async () => {
    const email = freshEmail();
    await call('/auth/register', jsonInit({ email, password: 'correct-password' }));

    const loginRes = await call('/auth/login', jsonInit({ email, password: 'correct-password' }));
    expect(loginRes.status).toBe(200);
    const cookie = sessionCookieFrom(loginRes);

    const meRes = await call('/auth/me', { headers: { Cookie: cookie } });
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { user: { email: string } };
    expect(meBody.user.email).toBe(email);
  });

  it('GET /auth/me without a cookie is 401', async () => {
    const res = await call('/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password with 401 and a generic message', async () => {
    const email = freshEmail();
    await call('/auth/register', jsonInit({ email, password: 'correct-password' }));
    const res = await call('/auth/login', jsonInit({ email, password: 'wrong-password' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid-credentials' });
  });

  it('rejects an unknown email with the SAME status and message as a wrong password', async () => {
    const res = await call('/auth/login', jsonInit({ email: freshEmail(), password: 'whatever123' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid-credentials' });
  });

  it('logout clears the session so /auth/me afterwards is 401', async () => {
    const email = freshEmail();
    await call('/auth/register', jsonInit({ email, password: 'correct-password' }));
    const loginRes = await call('/auth/login', jsonInit({ email, password: 'correct-password' }));
    const cookie = sessionCookieFrom(loginRes);

    const meBefore = await call('/auth/me', { headers: { Cookie: cookie } });
    expect(meBefore.status).toBe(200);

    const logoutRes = await call('/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
    expect(logoutRes.status).toBe(200);

    const meAfter = await call('/auth/me', { headers: { Cookie: cookie } });
    expect(meAfter.status).toBe(401);
  });
});

describe('login throttling', () => {
  it('locks out after LOGIN_ATTEMPT_LIMIT failures within the window', async () => {
    const email = freshEmail();
    await call('/auth/register', jsonInit({ email, password: 'correct-password' }));

    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await call('/auth/login', jsonInit({ email, password: 'wrong-password' }));
    }
    // The 6th attempt (index 5) should be throttled — the limit is 5.
    expect(last!.status).toBe(429);
  });
});

describe('credentialed CORS on /auth/* (the trap this PR calls out)', () => {
  it('reflects an allowlisted origin and sends Allow-Credentials', async () => {
    const res = await call('/auth/me', { origin: ORIGIN });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Vary')).toBe('Origin');
    // NEVER a wildcard alongside credentials — that combination is invalid
    // and browsers reject it outright.
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });

  it('does not reflect a non-allowlisted origin', async () => {
    const res = await call('/auth/me', { origin: 'https://evil.example.com' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('OPTIONS preflight on an auth route uses the credentialed CORS headers, not the wildcard leaderboard ones', async () => {
    const res = await call('/auth/login', { method: 'OPTIONS', origin: ORIGIN });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('the PUBLIC leaderboard read still uses wildcard CORS with no credentials', async () => {
    // /top is the only leaderboard route left that anyone may call. It carries
    // no cookie and returns no identifiers, so it stays wildcard — the point of
    // splitting the two CORS stories in the first place.
    const res = await call('/top', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('WRITING to the leaderboard now uses credentialed CORS, not the wildcard', async () => {
    // /submit used to be public and wildcard-CORS'd. It carries a session now,
    // and `Allow-Origin: *` is invalid together with credentials — so a
    // wildcard here would mean the browser refused every real submission.
    const res = await call('/submit', {
      method: 'OPTIONS',
      headers: { Origin: 'https://bl-or-bo.com' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://bl-or-bo.com');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});

describe('Google OAuth routes without configured credentials (this repo default)', () => {
  it('GET /auth/google/start answers 501, not a crash', async () => {
    const res = await call('/auth/google/start');
    expect(res.status).toBe(501);
  });

  it('GET /auth/google/callback answers 501, not a crash', async () => {
    const res = await call('/auth/google/callback?code=x&state=y');
    expect(res.status).toBe(501);
  });
});
