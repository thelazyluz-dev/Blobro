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

// The email/password routes are disabled in production (Google-only sign-in).
// These tests create accounts through them because it is the only way to mint
// a session without a real Google round-trip; the disabled-by-default behaviour
// has its own tests in auth-endpoints.integration.test.ts.
(env as { ALLOW_PASSWORD_AUTH?: string }).ALLOW_PASSWORD_AUTH = '1';

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

describe('password routes are disabled by default', () => {
  // The app is Google-only. Leaving these live gave anyone who knew the path an
  // email-enumeration oracle: /auth/register answers 409 "email-taken" for a
  // registered address and 201 otherwise — on a children's app, from an
  // endpoint no player can reach.
  const withPasswordAuth = async <T>(value: string | undefined, fn: () => Promise<T>): Promise<T> => {
    const e = env as { ALLOW_PASSWORD_AUTH?: string };
    const prev = e.ALLOW_PASSWORD_AUTH;
    e.ALLOW_PASSWORD_AUTH = value;
    try {
      return await fn();
    } finally {
      e.ALLOW_PASSWORD_AUTH = prev;
    }
  };

  it('POST /auth/register answers 404 when the flag is unset', async () => {
    await withPasswordAuth(undefined, async () => {
      const res = await call('/auth/register', jsonInit({ email: 'probe@example.com', password: 'hunter22' }));
      expect(res.status).toBe(404);
    });
  });

  it('POST /auth/login answers 404 when the flag is unset', async () => {
    await withPasswordAuth(undefined, async () => {
      const res = await call('/auth/login', jsonInit({ email: 'probe@example.com', password: 'hunter22' }));
      expect(res.status).toBe(404);
    });
  });

  it('gives away NOTHING about whether an address is registered', async () => {
    // The whole point. A known-registered address and a never-seen one must be
    // indistinguishable — same status, same body.
    const known = `known-${Date.now()}@example.com`;
    await withPasswordAuth('1', async () => {
      expect((await call('/auth/register', jsonInit({ email: known, password: 'hunter22' }))).status).toBe(201);
    });

    await withPasswordAuth(undefined, async () => {
      const a = await call('/auth/register', jsonInit({ email: known, password: 'hunter22' }));
      const b = await call('/auth/register', jsonInit({ email: `never-${Date.now()}@example.com`, password: 'hunter22' }));
      expect(a.status).toBe(b.status);
      expect(await a.text()).toBe(await b.text());
    });
  });

  it('404, not 403 — a 403 would confirm the route exists', async () => {
    await withPasswordAuth(undefined, async () => {
      const res = await call('/auth/register', jsonInit({ email: 'probe@example.com', password: 'hunter22' }));
      expect(res.status).not.toBe(403);
      expect((await res.json() as { error: string }).error).toBe('not-found');
    });
  });

  it('Google sign-in is unaffected', async () => {
    await withPasswordAuth(undefined, async () => {
      // 501 = "not configured in this test env", i.e. the route still routes.
      expect((await call('/auth/google/start')).status).toBe(501);
    });
  });
});

// ── Host-only session cookies ──────────────────────────────────────────────
// The session cookie used to be Domain=.bl-or-bo.com, which sent the raw
// token to the GitHub Pages site on the apex with every asset request. It is
// host-only now; the Domain-scoped variant is actively cleared so a returning
// browser can't end up with two same-name cookies fighting each other.

async function callAt(urlStr: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(urlStr, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('session cookies are host-only', () => {
  it('on the production API host: no Domain attribute, plus a clear for the legacy wide cookie', async () => {
    const res = await callAt(
      'https://api.bl-or-bo.com/auth/register',
      jsonInit({ email: freshEmail(), password: 'hunter22' }),
    );
    expect(res.status).toBe(201);
    const cookies = res.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith('blorbo_session=') && !c.includes('Max-Age=0'));
    expect(session).toBeDefined();
    expect(session).not.toContain('Domain='); // the token no longer travels to the Pages origin
    const legacyClear = cookies.find((c) => c.startsWith('blorbo_session=') && c.includes('Max-Age=0'));
    expect(legacyClear).toBeDefined();
    expect(legacyClear).toContain('Domain=.bl-or-bo.com');
  });

  it('on a non-production host there is no legacy cookie to clear — a single Set-Cookie', async () => {
    const res = await call('/auth/register', jsonInit({ email: freshEmail(), password: 'hunter22' }));
    expect(res.status).toBe(201);
    expect(res.headers.getSetCookie()).toHaveLength(1);
  });

  it('a transition-era browser sending BOTH cookies stays signed in regardless of their order', async () => {
    const reg = await call('/auth/register', jsonInit({ email: freshEmail(), password: 'hunter22' }));
    const real = sessionCookieFrom(reg).split('=')[1];
    for (const header of [
      `blorbo_session=stale-legacy-token; blorbo_session=${real}`,
      `blorbo_session=${real}; blorbo_session=stale-legacy-token`,
    ]) {
      const me = await call('/auth/me', { headers: { Cookie: header } });
      expect(me.status).toBe(200);
    }
  });

  it('logout revokes every presented session token, not just the first', async () => {
    const regA = await call('/auth/register', jsonInit({ email: freshEmail(), password: 'hunter22' }));
    const regB = await call('/auth/register', jsonInit({ email: freshEmail(), password: 'hunter22' }));
    const tokenA = sessionCookieFrom(regA).split('=')[1];
    const tokenB = sessionCookieFrom(regB).split('=')[1];

    const res = await call('/auth/logout', {
      method: 'POST',
      headers: { Cookie: `blorbo_session=${tokenA}; blorbo_session=${tokenB}` },
    });
    expect(res.status).toBe(200);

    expect((await call('/auth/me', { headers: { Cookie: `blorbo_session=${tokenA}` } })).status).toBe(401);
    expect((await call('/auth/me', { headers: { Cookie: `blorbo_session=${tokenB}` } })).status).toBe(401);
  });
});

describe('cross-origin writes are refused at the boundary, not merely made unreadable', () => {
  // CORS headers only decide whether the CALLER may read the response — the
  // handler itself still ran. These prove the request is refused outright, so
  // SameSite=Lax is no longer the single control against cross-site writes.
  it('a POST from an off-allowlist origin answers 403 before any handler runs', async () => {
    const res = await call('/auth/logout', { method: 'POST', origin: 'https://evil.example.com' });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('bad-origin');
  });

  it('a POST from the app origin is untouched', async () => {
    expect((await call('/auth/logout', { method: 'POST', origin: ORIGIN })).status).toBe(200);
  });

  it('a request with no Origin at all (curl, a native app) is untouched', async () => {
    expect((await call('/auth/logout', { method: 'POST' })).status).toBe(200);
  });
});

describe('identity responses are never cacheable', () => {
  it('/auth/me and /save send Cache-Control: no-store', async () => {
    expect((await call('/auth/me')).headers.get('Cache-Control')).toBe('no-store');
    expect((await call('/save')).headers.get('Cache-Control')).toBe('no-store');
  });
});
