/**
 * Blorbo global leaderboard — a Cloudflare Worker backed by D1 (SQLite).
 *
 * Free tier forever at family scale → ₪0/month.
 *
 * Privacy (kids' app): stores only a nickname, two scores, and a random
 * per-device recovery code. No email, no real name, no IP, no location. The
 * code is a write-only secret — never returned.
 *
 * Anti-cheat (pragmatic — you can't fully secure a client-side game, the goal
 * is "annoying enough nobody bothers"):
 *   • Sane ceilings on both metrics (the old 1e30 goo ceiling let junk in).
 *   • CLICKS are capped to a humanly-plausible rate since the code's first-seen
 *     time (server-stamped), so a drive-by can't post a top tap score. This is
 *     the "fair" board and it's now well protected.
 *   • GOO grows exponentially (idle income), so a time-rate cap would reject
 *     legit deep play — it relies on the flat ceiling. Softer by nature; honest
 *     about that.
 * Values are CLAMPED (not rejected) so a legit near-boundary score still saves.
 *
 * Endpoints
 *   GET  /top?by=clicks|goo&limit=N → { by, entries: [{ name, score }, ...] }
 *   GET  /rank?code=C&by=clicks|goo → { by, rank, score, name, total } | { rank: null }
 *   POST /submit                    → { ok, total, clicks:{best,rank}, goo:{best,rank} }
 *        body: { code, name, clicks, goo }
 *   GET  /health                    → { ok: true }
 *
 * PR 3a adds IDENTITY ONLY (accounts + sessions) under /auth/* — see the
 * "Auth (PR 3a)" section below. It does not move any game logic server-side;
 * that's a later PR. The endpoints above are untouched by this addition.
 *   POST /auth/register             → { user } + Set-Cookie session
 *   POST /auth/login                → { user } + Set-Cookie session
 *   POST /auth/logout               → { ok } + clears the cookie
 *   GET  /auth/me                   → { user } | 401
 *   GET  /auth/google/start         → 302 to Google's consent screen (PKCE)
 *   GET  /auth/google/callback      → 302 back to the app + Set-Cookie session
 */

import {
  DEFAULT_SESSION_TTL_DAYS,
  DUMMY_PASSWORD_HASH,
  LOGIN_ATTEMPT_WINDOW_MS,
  OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  ThrottleRow,
  buildClearCookie,
  buildCookie,
  codeChallengeFromVerifier,
  cookieDomainFor,
  generateCodeVerifier,
  generateSessionToken,
  generateState,
  hashPassword,
  hashSessionToken,
  hmacSign,
  hmacVerify,
  isSessionExpired,
  isThrottled,
  parseCookies,
  sessionExpiresAt,
  verifyPassword,
} from './auth';

export interface Env {
  DB: D1Database;
  // Auth (PR 3a) config — all optional so the leaderboard keeps working with
  // zero config; /auth/google/* just answers 501 until the two secrets are
  // set. See worker/README.md for the exact `wrangler secret put` commands.
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APP_ORIGIN?: string; // default 'https://bl-or-bo.com'
  SESSION_TTL_DAYS?: string; // default 30 (see DEFAULT_SESSION_TTL_DAYS)
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// ── Auth CORS (PR 3a) ────────────────────────────────────────────────────
// Cookies require credentialed CORS, and `Access-Control-Allow-Origin: *` is
// INVALID together with `Access-Control-Allow-Credentials: true` (browsers
// reject it outright). So /auth/* gets its own, separate CORS story: reflect
// the request's Origin only if it's in this allowlist, never a wildcard.
// The leaderboard routes above are untouched — they stay public/uncredentialed.
const AUTH_ALLOWED_ORIGINS = [
  'https://bl-or-bo.com',
  'http://localhost:5173', // vite dev
  'http://127.0.0.1:5173',
  'http://localhost:4173', // vite preview
];

function authCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
  if (origin && AUTH_ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function authJson(
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...authCorsHeaders(origin), ...extraHeaders },
  });
}

const MAX_NAME_LEN = 12;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

// Sane ceilings. Clicks are physical taps; goo is total earned. Anything above
// these is impossible and hard-rejected (4xx) rather than clamped.
const MAX_CLICKS = 5_000_000; // ~weeks of nonstop tapping — no human exceeds this
const MAX_GOO = 1e18; // a quintillion: generous for deep play, blocks absurd junk

// Clicks plausibility: at most this many taps per second since first-seen, plus
// a small grace for taps made in the session before the first submit.
const CLICK_RATE_PER_SEC = 25; // well above a human's ~10/s
const CLICK_BASELINE = 5_000;
// Goo can't be time-bounded (idle income is exponential), so a fresh identity's
// FIRST submit is capped low — this kills the one-shot "new player → millions"
// drive-by. Established rows may grow up to MAX_GOO.
const GOO_FIRST_CAP = 1_000_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function metricCol(by: string | null): 'clicks' | 'goo' {
  return by === 'goo' ? 'goo' : 'clicks';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isAuthRoute = url.pathname.startsWith('/auth/');

    if (request.method === 'OPTIONS') {
      // Auth routes need credentialed (allowlisted-origin) CORS, never the
      // wildcard the public leaderboard routes use — see authCorsHeaders.
      if (isAuthRoute) {
        return new Response(null, { status: 204, headers: authCorsHeaders(request.headers.get('Origin')) });
      }
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === '/health') {
      return json({ ok: true });
    }

    // ── Public leaderboard (by metric) ────────────────────────────────────
    if (url.pathname === '/top' && request.method === 'GET') {
      const col = metricCol(url.searchParams.get('by'));
      const raw = Number(url.searchParams.get('limit'));
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_LIMIT));
      try {
        const { results } = await env.DB.prepare(
          `SELECT name, ${col} AS score FROM scores ORDER BY ${col} DESC, updated ASC LIMIT ?1`,
        )
          .bind(limit)
          .all<{ name: string; score: number }>();
        return json({ by: col, entries: results ?? [] });
      } catch {
        return json({ error: 'db' }, 500);
      }
    }

    // ── A player's own rank in a metric ───────────────────────────────────
    if (url.pathname === '/rank' && request.method === 'GET') {
      const col = metricCol(url.searchParams.get('by'));
      const code = (url.searchParams.get('code') ?? '').trim();
      if (!/^[A-Za-z0-9]{6,40}$/.test(code)) return json({ error: 'bad-code' }, 400);
      try {
        const me = await env.DB.prepare(`SELECT name, ${col} AS v FROM scores WHERE code = ?1`)
          .bind(code)
          .first<{ name: string; v: number }>();
        if (!me) return json({ rank: null });
        const above = await env.DB.prepare(`SELECT COUNT(*) AS c FROM scores WHERE ${col} > ?1`)
          .bind(me.v)
          .first<{ c: number }>();
        const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores').first<{ c: number }>();
        return json({ by: col, rank: (above?.c ?? 0) + 1, score: me.v, name: me.name, total: total?.c ?? 1 });
      } catch {
        return json({ error: 'db' }, 500);
      }
    }

    // ── Submit both scores (validated + clamped) ──────────────────────────
    if (url.pathname === '/submit' && request.method === 'POST') {
      let body: { code?: unknown; name?: unknown; clicks?: unknown; goo?: unknown };
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad-json' }, 400);
      }

      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME_LEN) : '';
      const rawClicks = typeof body.clicks === 'number' && Number.isFinite(body.clicks) ? Math.floor(body.clicks) : NaN;
      const rawGoo = typeof body.goo === 'number' && Number.isFinite(body.goo) ? body.goo : NaN;

      if (!/^[A-Za-z0-9]{6,40}$/.test(code)) return json({ error: 'bad-code' }, 400);
      if (!name) return json({ error: 'bad-name' }, 400);
      if (!Number.isFinite(rawClicks) || !Number.isFinite(rawGoo)) return json({ error: 'bad-score' }, 400);
      // Hard-reject the flat-out impossible (a clear 4xx, not a silent clamp).
      if (rawClicks < 0 || rawClicks > MAX_CLICKS) return json({ error: 'clicks-out-of-range' }, 400);
      if (rawGoo < 0 || rawGoo > MAX_GOO) return json({ error: 'goo-out-of-range' }, 400);

      try {
        const now = Date.now();
        const existing = await env.DB.prepare('SELECT clicks, goo, created FROM scores WHERE code = ?1')
          .bind(code)
          .first<{ clicks: number; goo: number; created: number }>();

        // First-seen: keep the original if we have it, else now. Grandfathered
        // rows (pre-anti-cheat, created = 0) skip the time cap so their existing
        // legit score isn't clamped; from now on they're tracked.
        const grandfathered = !!existing && !(existing.created > 0);
        const created = existing && existing.created > 0 ? existing.created : now;
        const elapsedSec = Math.max(0, (now - created) / 1000);
        const clickCap = grandfathered
          ? MAX_CLICKS
          : Math.min(MAX_CLICKS, Math.floor(CLICK_RATE_PER_SEC * elapsedSec + CLICK_BASELINE));

        const clicks = clamp(rawClicks, 0, clickCap);
        // A brand-new identity (no row yet) can't claim big goo in one shot.
        const gooCap = existing ? MAX_GOO : Math.min(MAX_GOO, GOO_FIRST_CAP);
        const goo = clamp(rawGoo, 0, gooCap);

        await env.DB.prepare(
          `INSERT INTO scores (code, name, clicks, goo, created, updated)
           VALUES (?1, ?2, ?3, ?4, ?5, ?5)
           ON CONFLICT(code) DO UPDATE SET
             name    = excluded.name,
             clicks  = MAX(scores.clicks, excluded.clicks),
             goo     = MAX(scores.goo, excluded.goo),
             created = CASE WHEN scores.created > 0 THEN scores.created ELSE excluded.created END,
             updated = excluded.updated`,
        )
          .bind(code, name, clicks, goo, now)
          .run();

        const row = await env.DB.prepare('SELECT clicks, goo FROM scores WHERE code = ?1')
          .bind(code)
          .first<{ clicks: number; goo: number }>();
        const bestClicks = row?.clicks ?? clicks;
        const bestGoo = row?.goo ?? goo;
        const cAbove = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE clicks > ?1')
          .bind(bestClicks)
          .first<{ c: number }>();
        const gAbove = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE goo > ?1')
          .bind(bestGoo)
          .first<{ c: number }>();
        const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores').first<{ c: number }>();
        return json({
          ok: true,
          total: total?.c ?? 1,
          clicks: { best: bestClicks, rank: (cAbove?.c ?? 0) + 1 },
          goo: { best: bestGoo, rank: (gAbove?.c ?? 0) + 1 },
        });
      } catch {
        return json({ error: 'db' }, 500);
      }
    }

    // ── Auth (PR 3a — identity only, no game logic here) ──────────────────
    if (isAuthRoute) {
      return handleAuth(request, env, url);
    }

    return json({ error: 'not-found' }, 404);
  },
};

// ════════════════════════════════════════════════════════════════════════
// Auth (PR 3a)
// ════════════════════════════════════════════════════════════════════════

interface UserRow {
  id: string;
  email: string | null;
  password_hash: string | null;
  google_sub: string | null;
  display_name: string | null;
  created: number;
  last_login: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function appOrigin(env: Env): string {
  return env.APP_ORIGIN || 'https://bl-or-bo.com';
}

function sessionTtlDays(env: Env): number {
  const n = Number(env.SESSION_TTL_DAYS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SESSION_TTL_DAYS;
}

function publicUser(row: Pick<UserRow, 'id' | 'email' | 'display_name'>) {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

/** Parse a JSON body defensively — request.json() happily returns `null`/arrays/etc, not just objects. */
async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function openSession(db: D1Database, userId: string, ttlDays: number): Promise<{ token: string }> {
  const token = generateSessionToken();
  const tokenHash = await hashSessionToken(token);
  const now = Date.now();
  const expires = sessionExpiresAt(now, ttlDays);
  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?1, ?2, ?3, ?4)')
    .bind(tokenHash, userId, now, expires)
    .run();
  return { token };
}

function sessionCookieFor(request: Request, token: string, ttlDays: number): string {
  const hostname = new URL(request.url).hostname;
  return buildCookie({
    name: SESSION_COOKIE_NAME,
    value: token,
    maxAgeSeconds: ttlDays * 24 * 60 * 60,
    domain: cookieDomainFor(hostname),
  });
}

function clearSessionCookieFor(request: Request): string {
  const hostname = new URL(request.url).hostname;
  return buildClearCookie(SESSION_COOKIE_NAME, { domain: cookieDomainFor(hostname) });
}

/** Resolve the caller's session cookie to a user row, or null. Lazily deletes an expired session row. */
async function getUserFromRequest(request: Request, env: Env): Promise<UserRow | null> {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  const tokenHash = await hashSessionToken(token);
  const session = await env.DB.prepare('SELECT user_id, expires FROM sessions WHERE token_hash = ?1')
    .bind(tokenHash)
    .first<{ user_id: string; expires: number }>();
  if (!session) return null;
  if (isSessionExpired(session.expires)) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run();
    return null;
  }
  return env.DB.prepare(
    'SELECT id, email, password_hash, google_sub, display_name, created, last_login FROM users WHERE id = ?1',
  )
    .bind(session.user_id)
    .first<UserRow>();
}

async function recordLoginFailure(db: D1Database, email: string, row: ThrottleRow | null, now: number): Promise<void> {
  const fresh = !row || now - row.window_start > LOGIN_ATTEMPT_WINDOW_MS;
  const attempts = fresh || !row ? 1 : row.attempts + 1;
  const windowStart = fresh || !row ? now : row.window_start;
  await db
    .prepare(
      `INSERT INTO login_throttle (email, attempts, window_start) VALUES (?1, ?2, ?3)
       ON CONFLICT(email) DO UPDATE SET attempts = excluded.attempts, window_start = excluded.window_start`,
    )
    .bind(email, attempts, windowStart)
    .run();
}

async function resetLoginThrottle(db: D1Database, email: string): Promise<void> {
  await db.prepare('DELETE FROM login_throttle WHERE email = ?1').bind(email).run();
}

async function handleAuth(request: Request, env: Env, url: URL): Promise<Response> {
  const origin = request.headers.get('Origin');

  if (url.pathname === '/auth/register' && request.method === 'POST') return authRegister(request, env, origin);
  if (url.pathname === '/auth/login' && request.method === 'POST') return authLogin(request, env, origin);
  if (url.pathname === '/auth/logout' && request.method === 'POST') return authLogout(request, env, origin);
  if (url.pathname === '/auth/me' && request.method === 'GET') return authMe(request, env, origin);
  if (url.pathname === '/auth/google/start' && request.method === 'GET') return authGoogleStart(env, url);
  if (url.pathname === '/auth/google/callback' && request.method === 'GET') return authGoogleCallback(request, env, url);

  return authJson({ error: 'not-found' }, 404, origin);
}

async function authRegister(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return authJson({ error: 'bad-json' }, 400, origin);

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim().slice(0, 40) : null;

  if (!EMAIL_RE.test(email)) return authJson({ error: 'bad-email' }, 400, origin);
  if (password.length < 8) return authJson({ error: 'bad-password' }, 400, origin);

  try {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first<{ id: string }>();
    if (existing) return authJson({ error: 'email-taken' }, 409, origin);

    const id = crypto.randomUUID();
    const now = Date.now();
    const passwordHash = await hashPassword(password);
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, google_sub, display_name, created, last_login)
       VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?5)`,
    )
      .bind(id, email, passwordHash, displayName, now)
      .run();

    const ttlDays = sessionTtlDays(env);
    const { token } = await openSession(env.DB, id, ttlDays);
    return authJson({ user: { id, email, displayName } }, 201, origin, {
      'Set-Cookie': sessionCookieFor(request, token, ttlDays),
    });
  } catch (err) {
    // A UNIQUE-constraint race (two concurrent registers for the same email)
    // lands here as a generic D1 error — surface the same 409, not a scary 500.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) return authJson({ error: 'email-taken' }, 409, origin);
    return authJson({ error: 'db' }, 500, origin);
  }
}

async function authLogin(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return authJson({ error: 'bad-json' }, 400, origin);

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  // Identical error for "no such email" and "wrong password" everywhere below
  // (message AND status AND timing) so a caller can't use this endpoint to
  // discover which emails have accounts.
  const invalid = () => authJson({ error: 'invalid-credentials' }, 401, origin);
  if (!email || !password) return invalid();

  try {
    const now = Date.now();
    const throttleRow = await env.DB.prepare('SELECT attempts, window_start FROM login_throttle WHERE email = ?1')
      .bind(email)
      .first<ThrottleRow>();
    if (isThrottled(throttleRow, now)) return authJson({ error: 'too-many-attempts' }, 429, origin);

    const user = await env.DB.prepare(
      'SELECT id, email, password_hash, display_name FROM users WHERE email = ?1',
    )
      .bind(email)
      .first<Pick<UserRow, 'id' | 'email' | 'password_hash' | 'display_name'>>();

    // Always pay the PBKDF2 cost — even for an unknown email or a Google-only
    // account with no password — via DUMMY_PASSWORD_HASH, so response time
    // can't leak "no such account" vs "wrong password".
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);

    if (!user || !user.password_hash || !ok) {
      await recordLoginFailure(env.DB, email, throttleRow, now);
      return invalid();
    }

    await resetLoginThrottle(env.DB, email);
    await env.DB.prepare('UPDATE users SET last_login = ?1 WHERE id = ?2').bind(now, user.id).run();

    const ttlDays = sessionTtlDays(env);
    const { token } = await openSession(env.DB, user.id, ttlDays);
    return authJson({ user: publicUser(user) }, 200, origin, {
      'Set-Cookie': sessionCookieFor(request, token, ttlDays),
    });
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

async function authLogout(request: Request, env: Env, origin: string | null): Promise<Response> {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = cookies[SESSION_COOKIE_NAME];
  if (token) {
    try {
      const tokenHash = await hashSessionToken(token);
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run();
    } catch {
      // Best-effort — the cookie gets cleared client-side below regardless.
    }
  }
  return authJson({ ok: true }, 200, origin, { 'Set-Cookie': clearSessionCookieFor(request) });
}

async function authMe(request: Request, env: Env, origin: string | null): Promise<Response> {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);
    return authJson({ user: publicUser(user) }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

// ── Google OAuth (authorization code + PKCE) ──────────────────────────────

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — enough for the consent screen, no longer

async function authGoogleStart(env: Env, url: URL): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return json({ error: 'google-oauth-not-configured' }, 501);
  }

  const verifier = generateCodeVerifier();
  const challenge = await codeChallengeFromVerifier(verifier);
  const state = generateState();
  const expires = Date.now() + OAUTH_STATE_TTL_MS;

  // Signed, opaque, short-lived cookie carrying state+verifier+expiry — this
  // IS the "server-side" storage for PKCE across the redirect round-trip; no
  // D1 row needed for a value only this one browser ever needs, and signing
  // (HMAC keyed on GOOGLE_CLIENT_SECRET, a server-only secret) makes it
  // tamper-evident without a lookup.
  const payload = `${state}.${verifier}.${expires}`;
  const signature = await hmacSign(env.GOOGLE_CLIENT_SECRET, payload);
  const cookieValue = encodeURIComponent(`${payload}.${signature}`);

  const redirectUri = `${url.origin}/auth/google/callback`;
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('access_type', 'online');
  authUrl.searchParams.set('prompt', 'select_account');

  const cookie = buildCookie({
    name: OAUTH_STATE_COOKIE_NAME,
    value: cookieValue,
    maxAgeSeconds: OAUTH_STATE_TTL_MS / 1000,
    domain: cookieDomainFor(url.hostname),
    path: '/auth/google',
  });

  return new Response(null, { status: 302, headers: { Location: authUrl.toString(), 'Set-Cookie': cookie } });
}

async function authGoogleCallback(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return json({ error: 'google-oauth-not-configured' }, 501);
  }

  const dest = appOrigin(env);
  const failRedirect = (reason: string): Response => {
    const u = new URL(dest);
    u.searchParams.set('auth_error', reason);
    return new Response(null, { status: 302, headers: { Location: u.toString() } });
  };

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (url.searchParams.get('error') || !code || !state) return failRedirect('google-denied');

  const cookies = parseCookies(request.headers.get('Cookie'));
  const raw = cookies[OAUTH_STATE_COOKIE_NAME];
  if (!raw) return failRedirect('missing-state');

  const segments = raw.split('.');
  if (segments.length !== 4) return failRedirect('bad-state');
  const [cookieState, verifier, expiresStr, signature] = segments;
  const payload = `${cookieState}.${verifier}.${expiresStr}`;
  const validSig = await hmacVerify(env.GOOGLE_CLIENT_SECRET, payload, signature);
  const expires = Number(expiresStr);
  if (!validSig || !Number.isFinite(expires) || Date.now() > expires || cookieState !== state) {
    return failRedirect('bad-state');
  }

  try {
    const redirectUri = `${url.origin}/auth/google/callback`;
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    if (!tokenRes.ok) return failRedirect('token-exchange-failed');
    const tokenBody = (await tokenRes.json()) as { access_token?: string };
    if (!tokenBody.access_token) return failRedirect('token-exchange-failed');

    // We trust Google's userinfo endpoint reached over this server-to-server,
    // TLS-protected call (the code+PKCE exchange above already proves this
    // request originated from the browser we handed the state cookie to)
    // rather than verifying the ID token's RS256 signature by hand against
    // Google's JWKS. Common, accepted pattern — but weaker than local JWT
    // verification; documented as a deferred hardening step in auth.ts.
    const profileRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    });
    if (!profileRes.ok) return failRedirect('profile-fetch-failed');
    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!profile.sub) return failRedirect('profile-fetch-failed');

    const now = Date.now();
    const verifiedEmail = profile.email_verified && profile.email ? profile.email.toLowerCase() : null;

    let user = await env.DB.prepare('SELECT id, email, display_name FROM users WHERE google_sub = ?1')
      .bind(profile.sub)
      .first<{ id: string; email: string | null; display_name: string | null }>();

    if (!user && verifiedEmail) {
      const byEmail = await env.DB.prepare('SELECT id, email, display_name FROM users WHERE email = ?1')
        .bind(verifiedEmail)
        .first<{ id: string; email: string | null; display_name: string | null }>();
      if (byEmail) {
        await env.DB.prepare('UPDATE users SET google_sub = ?1 WHERE id = ?2').bind(profile.sub, byEmail.id).run();
        user = byEmail;
      }
    }

    if (!user) {
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, google_sub, display_name, created, last_login)
         VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?5)`,
      )
        .bind(id, verifiedEmail, profile.sub, profile.name ?? null, now)
        .run();
      user = { id, email: verifiedEmail, display_name: profile.name ?? null };
    } else {
      await env.DB.prepare('UPDATE users SET last_login = ?1 WHERE id = ?2').bind(now, user.id).run();
    }

    const ttlDays = sessionTtlDays(env);
    const { token } = await openSession(env.DB, user.id, ttlDays);
    const headers = new Headers({ Location: dest });
    headers.append('Set-Cookie', sessionCookieFor(request, token, ttlDays));
    headers.append(
      'Set-Cookie',
      buildClearCookie(OAUTH_STATE_COOKIE_NAME, { domain: cookieDomainFor(url.hostname), path: '/auth/google' }),
    );
    return new Response(null, { status: 302, headers });
  } catch {
    return failRedirect('google-error');
  }
}
