/**
 * Blorbo global leaderboard — a Cloudflare Worker backed by D1 (SQLite).
 *
 * Free tier forever at family scale → ₪0/month.
 *
 * Privacy (kids' app): the leaderboard shows only a nickname and two scores.
 * Accounts (PR 3a) store the Google email, sub and display name — used for
 * sign-in only, never shown to other players. No IP, no location. Disclosed
 * in public/privacy.html; keep the two in sync.
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
 *
 * PR 4 adds CLOUD SAVE under /save — see the "Cloud save (PR 4)" section
 * below. The client stays authoritative in this PR: the server sanitizes an
 * uploaded save with the same pure `migrate()` the client loads with (never
 * a reimplementation, so the two can't drift) and stores it; it does not yet
 * re-simulate or verify the numbers are earned (that's anti-cheat, later).
 *   GET  /save                      → { rev, updated, save } | { rev:0, save:null } | 401
 *   PUT  /save                      → { rev, updated } | 409 { error, rev, updated, save } | 401
 *        body: { baseRev, save }
 *
 * PR 5 adds save AUDITING — see the "Save auditing (PR 5)" section below.
 * Every successful `PUT /save` also records the server's opinion of whether
 * the upload's delta was physically achievable into `save_audit`. The WRITE is
 * never rejected, blocked, or altered — a player must never lose progress on
 * suspicion.
 *
 * PR 6 (minimal) adds the CONSEQUENCE: an account with a rate-violation flag
 * on record (goo/clicks beyond the ceiling, or a first save that arrived
 * already rich) keeps its cloud save but is not published by /submit — see
 * SUBMIT_ENFORCE_SINCE for the boundary and the release command. The tuned,
 * data-driven threshold on the audit RATIO remains future work.
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
  generateCodeVerifier,
  generateSessionToken,
  generateState,
  hashPassword,
  hashSessionToken,
  hmacSign,
  hmacVerify,
  isSessionExpired,
  isThrottled,
  legacyCookieDomainFor,
  parseCookieValues,
  parseCookies,
  sessionExpiresAt,
  timingSafeEqual,
  verifyPassword,
} from './auth';
// The Worker's one import surface onto the shared, pure game rules (PR 4)
// — see worker/src/rules.ts for why this is never reimplemented locally.
import { CURRENT_VERSION, isCleanNickname, maxCpm, migrate, ownsImpossibleCreatures, verifySaveDelta } from './rules';

export interface Env {
  DB: D1Database;
  // Auth (PR 3a) config — all optional so the leaderboard keeps working with
  // zero config; /auth/google/* just answers 501 until the two secrets are
  // set. See worker/README.md for the exact `wrangler secret put` commands.
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APP_ORIGIN?: string; // default 'https://bl-or-bo.com'
  SESSION_TTL_DAYS?: string; // default 30 (see DEFAULT_SESSION_TTL_DAYS)
  MIN_SAVE_INTERVAL_MS?: string; // default 5000 — see DEFAULT_MIN_SAVE_INTERVAL_MS
  // Password sign-up/sign-in. OFF unless explicitly "1" — see passwordAuthEnabled.
  ALLOW_PASSWORD_AUTH?: string;
  // Owner dashboard bearer token (GET /admin/stats). A SECRET — set once via
  // `wrangler secret put ADMIN_TOKEN`. Absent → the endpoint answers 401 to all.
  ADMIN_TOKEN?: string;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// ── Auth CORS (PR 3a; also covers /save from PR 4) ────────────────────────
// Cookies require credentialed CORS, and `Access-Control-Allow-Origin: *` is
// INVALID together with `Access-Control-Allow-Credentials: true` (browsers
// reject it outright). So credentialed routes get their own, separate CORS
// story: reflect the request's Origin only if it's in this allowlist, never
// a wildcard. The leaderboard routes above are untouched — they stay
// public/uncredentialed.
const PROD_ORIGIN = 'https://bl-or-bo.com';
const DEV_ORIGINS = [
  'http://localhost:5173', // vite dev
  'http://127.0.0.1:5173',
  'http://localhost:4173', // vite preview
];

/**
 * Origins allowed to make credentialed requests.
 *
 * The dev origins used to ship to production too. SameSite=Lax already stops
 * the session cookie riding a cross-site request, so it was not exploitable —
 * but that left one control doing all the work, and a production allowlist
 * naming localhost is the kind of thing that is only ever one refactor away
 * from mattering. Production now allows exactly one origin.
 */
// APP_ORIGIN is a deploy-time var, identical for every request an isolate ever
// serves, so this is resolved once at the top of fetch() rather than threaded
// through the ~40 call sites of authJson below. Defaults to the production
// origin, so a misconfigured deploy fails CLOSED (locked down), not open.
let allowedOrigins: string[] = [PROD_ORIGIN];

function resolveAllowedOrigins(env: Env): void {
  const app = (env.APP_ORIGIN ?? PROD_ORIGIN).trim();
  allowedOrigins = app === PROD_ORIGIN ? [PROD_ORIGIN] : [app, PROD_ORIGIN, ...DEV_ORIGINS];
}

function authCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function authJson(
  body: unknown,
  status: number,
  origin: string | null,
  cookies: string[] = [],
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    // Identity and save payloads must never land in any cache, shared or
    // local. Browsers rarely cache these heuristically, but "rarely" is not a
    // security property — no-store makes it one.
    'Cache-Control': 'no-store',
    ...authCorsHeaders(origin),
  });
  // Set-Cookie is the one header that can legitimately repeat (the session
  // cookie plus the legacy-domain clear), which a plain Record can't express.
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

const MAX_NAME_LEN = 12;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

// Sane ceilings. Clicks are physical taps; goo is total earned. Anything above
// these is impossible and hard-rejected (4xx) rather than clamped.
const MAX_CLICKS = 5_000_000; // ~weeks of nonstop tapping — no human exceeds this
const MAX_GOO = 1e34; // raised for the "first to a decillion" (1e33) challenge:
// the board must be able to hold — and rank — a decillion, so the ceiling sits
// one decade above it. Still absurd-junk protection (first-save-absurd bars
// beyond this), and the plausibility audit — which is rate-based and scales
// with the player's own income, not with this constant — remains the real
// defence, so raising this does not weaken it.

// A real save is a few KB; 64 KiB is a generous ceiling that still blocks
// someone using the account as free blob storage. Checked on the raw request
// text, in bytes, BEFORE any JSON parsing.
const MAX_SAVE_BYTES = 65_536;

// Minimum gap between accepted writes for one account. The client checkpoints
// once a minute, so this never touches honest play — it exists because nothing
// else bounded /save at all: a signed-in caller (and an account is free) could
// loop PUTs and burn the D1 write budget, each request costing three
// operations. The project's first constraint is that it must not cost money.
//
// A suppressed write answers 429, NOT 200. Answering 200 was the first thing I
// tried and it is a lie with teeth: two devices playing at once collide inside
// this window, and the loser would be told its save reached the cloud when it
// did not — it clears its dirty flag and stops trying. 429 is what the client
// already handles correctly (best-effort, stay dirty, retry at the next
// checkpoint, never surfaced to the player), so the save lands a minute later
// instead of silently never.
const DEFAULT_MIN_SAVE_INTERVAL_MS = 5_000;

// Clean audit rows older than this. The table is tuning data for choosing an
// enforcement threshold (PR 6), not history — a month is far more than enough
// to characterise normal play.
const AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const AD_EVENTS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
// Cap on rows removed per nightly run, so housekeeping stays a short query.
const SWEEP_BATCH = 5_000;

function minSaveIntervalMs(env: Env): number {
  const raw = Number(env.MIN_SAVE_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MIN_SAVE_INTERVAL_MS;
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extraHeaders },
  });
}

function metricCol(by: string | null): 'clicks' | 'goo' | 'cpm' {
  return by === 'goo' || by === 'cpm' ? by : 'clicks';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    resolveAllowedOrigins(env);
    const url = new URL(request.url);
    // /auth/* AND /save are both credentialed (cookie-session) routes and
    // share the same CORS story — see authCorsHeaders.
    const isCredentialedRoute =
      url.pathname.startsWith('/auth/') ||
      url.pathname === '/save' ||
      url.pathname === '/submit' ||
      url.pathname === '/rank' ||
      url.pathname === '/ad-event' ||
      url.pathname === '/admin/stats' ||
      url.pathname === '/admin/barred' ||
      url.pathname === '/admin/release';

    if (request.method === 'OPTIONS') {
      // Credentialed routes need allowlisted-origin CORS, never the wildcard
      // the public leaderboard routes use — see authCorsHeaders.
      if (isCredentialedRoute) {
        return new Response(null, { status: 204, headers: authCorsHeaders(request.headers.get('Origin')) });
      }
      return new Response(null, { status: 204, headers: CORS });
    }

    // CORS response headers only govern who may READ a response — they never
    // stop the request itself from running. For the cookie-carrying write
    // routes that left SameSite=Lax as the single control against cross-site
    // writes. A browser always names the sending site in Origin on a
    // cross-origin POST/PUT, so an off-allowlist Origin is refused before any
    // handler runs. Requests with no Origin at all (curl, native apps) pass —
    // this boundary is about browsers steered from someone else's page, and
    // those always announce themselves.
    if (isCredentialedRoute && (request.method === 'POST' || request.method === 'PUT')) {
      const origin = request.headers.get('Origin');
      if (origin && !allowedOrigins.includes(origin)) {
        return authJson({ error: 'bad-origin' }, 403, origin);
      }
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
        // Browser-side caching only (a Worker response is not edge-cached by
        // default): a device reopening the board within 30s — the classic
        // "did I pass him yet?" loop — costs zero requests. The board is
        // identical for everyone and 30s stale is invisible next to the
        // 10s submit interval.
        return json({ by: col, entries: results ?? [] }, 200, { 'Cache-Control': 'public, max-age=30' });
      } catch {
        return json({ error: 'db' }, 500);
      }
    }

    // ── A player's own rank in a metric ───────────────────────────────────
    // ── Your own rank in a metric (session required) ──────────────────────
    if (url.pathname === '/rank' && request.method === 'GET') {
      return handleRank(request, env, metricCol(url.searchParams.get('by')));
    }

    // ── Submit your leaderboard row (session required) ────────────────────
    //
    // This used to accept {code, name, clicks, goo} from anyone at all: the
    // "code" was a string the client invented, and the scores were simply
    // whatever the caller typed. Two requests were enough to own the goo board
    // permanently — the first created the row, and the second lifted the cap
    // from a million to 1e18 — and nothing checked the nickname server-side, so
    // a stranger could put any word they liked on a board children read.
    //
    // Now: identity comes from the session, and the SCORES ARE NOT ACCEPTED
    // FROM THE REQUEST AT ALL. They are read from this account's own stored
    // save, which is the same copy the plausibility audit already examines
    // (PR 5). That collapses two separately-attackable paths into one, so
    // hardening the save path hardens the leaderboard for free.
    if (url.pathname === '/submit' && request.method === 'POST') {
      return handleSubmit(request, env);
    }

    // ── Ad telemetry (aggregate-only — see ad_events in schema.sql) ───────
    if (url.pathname === '/ad-event' && request.method === 'POST') {
      return handleAdEvent(request, env);
    }

    // ── Owner dashboard (bearer-token) ────────────────────────────────────
    if (url.pathname === '/admin/stats' && request.method === 'GET') {
      return handleAdminStats(request, env);
    }
    // The barred-players moderation surface: list who's off the board and why,
    // and release a wrongly-barred account (the owner's one-tap version of the
    // documented `DELETE FROM save_audit … ok = 0` one-liner).
    if (url.pathname === '/admin/barred' && request.method === 'GET') {
      return handleAdminBarred(request, env);
    }
    if (url.pathname === '/admin/release' && request.method === 'POST') {
      return handleAdminRelease(request, env);
    }

    // ── Auth (PR 3a — identity only, no game logic here) ──────────────────
    if (url.pathname.startsWith('/auth/')) {
      return handleAuth(request, env, url);
    }

    // ── Cloud save (PR 4) ──────────────────────────────────────────────────
    if (url.pathname === '/save') {
      return handleSave(request, env);
    }

    return json({ error: 'not-found' }, 404);
  },

  /**
   * Nightly housekeeping (see [triggers] in wrangler.toml).
   *
   * Two tables grew without any bound. Sessions were only ever deleted when
   * someone tried to reuse an expired one, so a player who simply stops
   * playing leaves a row behind forever. save_audit gains a row per cloud
   * save — around 1,400 a day per active player — and its whole purpose is
   * statistical, so a row from months ago is dead weight.
   *
   * Both sweeps are bounded by LIMIT so one night's work can never turn into
   * a long-running query, and failures are swallowed: housekeeping must never
   * be the reason the API is unavailable.
   */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const now = Date.now();
    try {
      await env.DB.prepare(
        'DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires < ?1 LIMIT ?2)',
      )
        .bind(now, SWEEP_BATCH)
        .run();
    } catch (err) {
      console.error('session sweep failed', err);
    }
    try {
      // Flagged rows (ok = 0) are kept indefinitely — they are the rare ones,
      // and they are the entire reason the table exists.
      await env.DB.prepare(
        'DELETE FROM save_audit WHERE id IN (SELECT id FROM save_audit WHERE ok = 1 AND created < ?1 LIMIT ?2)',
      )
        .bind(now - AUDIT_RETENTION_MS, SWEEP_BATCH)
        .run();
    } catch (err) {
      console.error('audit sweep failed', err);
    }
    try {
      // Ad telemetry: trends matter, history doesn't — 90 days is plenty.
      await env.DB.prepare(
        'DELETE FROM ad_events WHERE id IN (SELECT id FROM ad_events WHERE created < ?1 LIMIT ?2)',
      )
        .bind(now - AD_EVENTS_RETENTION_MS, SWEEP_BATCH)
        .run();
    } catch (err) {
      console.error('ad_events sweep failed', err);
    }
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

/**
 * Set-Cookie list for a fresh session: the host-only session cookie, plus —
 * on the production host — a clear for the legacy Domain-scoped cookie a
 * returning browser may still hold. Without the clear the two coexist under
 * the same name and which one the browser sends first is unspecified, so a
 * stale session could shadow the new one at random.
 */
function sessionCookiesFor(request: Request, token: string, ttlDays: number): string[] {
  const cookies = [
    buildCookie({ name: SESSION_COOKIE_NAME, value: token, maxAgeSeconds: ttlDays * 24 * 60 * 60 }),
  ];
  const legacyDomain = legacyCookieDomainFor(new URL(request.url).hostname);
  if (legacyDomain) cookies.push(buildClearCookie(SESSION_COOKIE_NAME, { domain: legacyDomain }));
  return cookies;
}

/** Clear the session cookie — both the host-only one and the legacy Domain-scoped one. */
function clearSessionCookiesFor(request: Request): string[] {
  const cookies = [buildClearCookie(SESSION_COOKIE_NAME)];
  const legacyDomain = legacyCookieDomainFor(new URL(request.url).hostname);
  if (legacyDomain) cookies.push(buildClearCookie(SESSION_COOKIE_NAME, { domain: legacyDomain }));
  return cookies;
}

/**
 * Resolve the caller's session cookie to a user row, or null. Lazily deletes
 * an expired session row.
 *
 * Tries every value sent under the session cookie's name (capped, but in
 * practice two): during the host-only-cookie transition a browser can hold
 * both the legacy Domain-scoped cookie and the new host-only one, and if the
 * one it happens to list first is stale, keeping only that one would sign the
 * player out at random.
 */
async function getUserFromRequest(request: Request, env: Env): Promise<UserRow | null> {
  const tokens = parseCookieValues(request.headers.get('Cookie'), SESSION_COOKIE_NAME).slice(0, 3);
  for (const token of tokens) {
    const tokenHash = await hashSessionToken(token);
    // Session and user in one query — this runs on every credentialed
    // request, so it is the single hottest read path in the Worker.
    const row = await env.DB.prepare(
      `SELECT s.expires, u.id, u.email, u.password_hash, u.google_sub, u.display_name, u.created, u.last_login
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?1`,
    )
      .bind(tokenHash)
      .first<UserRow & { expires: number }>();
    if (!row) continue;
    if (isSessionExpired(row.expires)) {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run();
      continue;
    }
    const { expires: _expires, ...user } = row;
    return user;
  }
  return null;
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

/**
 * Whether the email/password routes answer at all. Off by default.
 *
 * The app offers Google sign-in only (there is no password-reset flow, so a
 * child who forgot one would be locked out forever — see src/ui/AuthGate.tsx).
 * The routes stayed live anyway, reachable by anyone who knew the path, and
 * they leaked which email addresses have accounts: /auth/register answers 409
 * "email-taken" for a registered one and 201 otherwise. That is an enumeration
 * oracle on a children's app, sitting on an endpoint no player can even reach.
 *
 * Disabling beats patching the message: it removes the oracle, the
 * password-guessing surface and the login-throttle question in one move. The
 * implementation and its tests stay — flip this to "1" to bring them back.
 */
function passwordAuthEnabled(env: Env): boolean {
  return env.ALLOW_PASSWORD_AUTH === '1';
}

async function handleAuth(request: Request, env: Env, url: URL): Promise<Response> {
  const origin = request.headers.get('Origin');

  // 404, not 403: a 403 would confirm the route exists, which is the one bit
  // of information disabling it is meant to withhold.
  if (url.pathname === '/auth/register' || url.pathname === '/auth/login') {
    if (!passwordAuthEnabled(env)) return authJson({ error: 'not-found' }, 404, origin);
  }
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
    return authJson({ user: { id, email, displayName } }, 201, origin, sessionCookiesFor(request, token, ttlDays));
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
    return authJson({ user: publicUser(user) }, 200, origin, sessionCookiesFor(request, token, ttlDays));
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

async function authLogout(request: Request, env: Env, origin: string | null): Promise<Response> {
  // Every presented value, not just one — a transition-era browser can send
  // two session cookies, and logout must kill both server-side rows.
  const tokens = parseCookieValues(request.headers.get('Cookie'), SESSION_COOKIE_NAME).slice(0, 3);
  for (const token of tokens) {
    try {
      const tokenHash = await hashSessionToken(token);
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run();
    } catch {
      // Best-effort — the cookie gets cleared client-side below regardless.
    }
  }
  return authJson({ ok: true }, 200, origin, clearSessionCookiesFor(request));
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
    for (const cookie of sessionCookiesFor(request, token, ttlDays)) headers.append('Set-Cookie', cookie);
    headers.append('Set-Cookie', buildClearCookie(OAUTH_STATE_COOKIE_NAME, { path: '/auth/google' }));
    // The pre-change state cookie was Domain-scoped; a host-only clear can't
    // remove it, so clear that variant too while any may still be in flight.
    const legacyDomain = legacyCookieDomainFor(url.hostname);
    if (legacyDomain) {
      headers.append(
        'Set-Cookie',
        buildClearCookie(OAUTH_STATE_COOKIE_NAME, { domain: legacyDomain, path: '/auth/google' }),
      );
    }
    return new Response(null, { status: 302, headers });
  } catch {
    return failRedirect('google-error');
  }
}

// ════════════════════════════════════════════════════════════════════════
// Leaderboard writes (PR 9, pulled forward)
// ════════════════════════════════════════════════════════════════════════
//
// One row per ACCOUNT. The row key is derived from the user id rather than a
// client-chosen string, so identities can't be invented or flooded, and the
// scores come from this account's stored save rather than from the request.

/** Row key for an account. UUID minus its hyphens fits the existing scores PK. */
function leaderboardCodeFor(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 40);
}

/** Minimum gap between leaderboard writes for one account. */
const MIN_SUBMIT_INTERVAL_MS = 10_000;

// ── Enforcement (PR 6, minimal) ───────────────────────────────────────────
//
// The audit (PR 5) records physically-impossible save deltas; this is the
// consequence. An account with a rate violation on record — goo or clicks
// beyond the plausibility ceiling, or a first save that arrived already rich
// — KEEPS its cloud save (progress is never destroyed on suspicion) but is
// not published to a board children compete on.
//
// Decrease flags deliberately do NOT bar: they are what the restore button
// legitimately produces, and a decrease cannot inflate a MAX()-based board
// anyway. And only rows from after ENFORCE_SINCE count — everything recorded
// while the audit was shadow-only was collected under a different contract,
// and the family's test accounts must not be barred retroactively by it.
//
// Releasing a wrongly-barred account is a one-liner for the owner:
//   npx wrangler d1 execute blorbo-leaderboard --remote \
//     --command "DELETE FROM save_audit WHERE user_id = '<id>' AND ok = 0"
const SUBMIT_ENFORCE_SINCE = Date.UTC(2026, 7, 3); // 2026-08-03, the day enforcement shipped
// Barring flags: 'goo-rate' and 'click-rate' always; 'first-save-cap' only from
// FIRST_SAVE_CAP_BARS_SINCE (below). Spelled out in isBarredFromBoard's SQL.

// The first-save cap only BARS from this date on. Mandatory sign-in shipped
// 2026-08-02, so the pre-auth player base migrates its local progress as a
// "first save" in the following days — and an honest carried-over save is
// easily past FIRST_SAVE_GOO_CAP (1e6 is literally the game's first milestone,
// and AuthGate promises "your progress will be linked to your account").
// Barring during that window silently benches real players (a known past
// incident). The flag is still RECORDED throughout (tuning data, and repeat
// cheating is still caught by the rate flags); filtering at READ time also
// retroactively releases everyone wrongly barred since Aug 3. Owner decision at
// the pre-launch review: a SHORT ~2-week migration window (sign-in shipped
// Aug 2), then the cap arms so the boards are trustworthy for the wider push —
// balancing "don't bench honest migrators" against "boards can be trusted".
export const FIRST_SAVE_CAP_BARS_SINCE = Date.UTC(2026, 7, 16); // 2026-08-16

/**
 * A first save has no previous row to diff against, so verifySaveDelta
 * reports it clean by design (everyone has a first save). That leniency was
 * the last hole wide enough to matter: a fresh account's very first PUT could
 * claim any number at all, and /submit would publish it. A genuinely new
 * account syncs within its first minute of play (sign-in is mandatory and
 * checkpoints run every 60s), so an honest first save is worth a few hundred
 * goo — these caps sit three-plus orders of magnitude above that. This is
 * worker-side POLICY, not shared physics: thresholds live here, the ceiling
 * math lives in src/game/verify.ts.
 *
 * The save is STORED either way (a wrong guess here must never cost progress
 * — e.g. signing in on a plane and playing for hours before the first sync
 * lands); the flag only keeps the account off the leaderboard.
 */
const FIRST_SAVE_GOO_CAP = 1_000_000;
const FIRST_SAVE_CLICK_CAP = 5_000;
// The ⚡ taps-per-minute board is otherwise unaudited (verifySaveDelta ignores
// cpm — it's only ever clamped to the maxCpm ceiling). A brand-new account's
// first minute of play tops out at a few hundred, so a first save already
// claiming a near-ceiling record is the cheap "instant #1" cheat. Half the
// physical ceiling (maxCpm 3000) is comfortably above any honest first minute
// and well below a fabricated max. Bars on the same date as the other caps.
const FIRST_SAVE_CPM_CAP = 1_500;

/**
 * The SQL predicate that makes a save_audit row a BARRING one — extracted so the
 * live enforcement (isBarredFromBoard) and the dashboard's barred-list query it
 * from ONE source and can never silently drift when a boundary date changes.
 * `col` prefixes the columns (e.g. 'sa.' for a joined query, '' for a bare one);
 * `enforcePh`/`firstCapPh` are the bind placeholders for SUBMIT_ENFORCE_SINCE and
 * FIRST_SAVE_CAP_BARS_SINCE. Exact-token match on the comma-joined flags column:
 * both sides are wrapped in delimiters so e.g. 'goo-rate' can't match inside a
 * longer flag name.
 */
function barringRowSql(col: string, enforcePh: string, firstCapPh: string): string {
  const f = `',' || ${col}flags || ','`;
  // A row the client marked as a cross-device merge (merge-claimed, alongside its
  // rate flag) never bars — an honest device-linking event lands as one huge
  // jump that reads like an impossible rate. It's still RECORDED (ratio kept for
  // tuning, spoofs visible on the dashboard) and still bounded by MAX_GOO; it
  // just doesn't bench the player. See verify.ts's merge-claimed flag.
  return `${col}ok = 0 AND ${col}created >= ${enforcePh}
    AND ${f} NOT LIKE '%,merge-claimed,%'
    AND (${f} LIKE '%,goo-rate,%'
      OR ${f} LIKE '%,click-rate,%'
      OR ${f} LIKE '%,first-save-absurd,%'
      OR (${f} LIKE '%,first-save-cap,%' AND ${col}created >= ${firstCapPh}))`;
}

/** True when this account has a barring audit flag recorded since enforcement began.
 * The rate flags (goo-rate / click-rate) bar from SUBMIT_ENFORCE_SINCE; the
 * first-save cap only bars from FIRST_SAVE_CAP_BARS_SINCE (see above) — filtering
 * here, at read time, is what retroactively releases the migration-window
 * false positives without touching a single audit row. */
async function isBarredFromBoard(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS x FROM save_audit WHERE user_id = ?1 AND ${barringRowSql('', '?2', '?3')} LIMIT 1`)
    .bind(userId, SUBMIT_ENFORCE_SINCE, FIRST_SAVE_CAP_BARS_SINCE)
    .first<{ x: number }>();
  return row !== null;
}

// ── Ad telemetry ────────────────────────────────────────────────────────────
// One row per ad interaction: which surface, what happened, when. Requires a
// session (so junk can't be sprayed anonymously) but deliberately stores NO
// user id — the table must stay un-joinable to a child. Values are allowlisted
// (never stored raw), and a failure here must never matter to the client: the
// endpoint always answers quickly and the caller fires-and-forgets.
const AD_PURPOSES = new Set(['boost', 'offline', 'egg']);
const AD_OUTCOMES = new Set(['shown', 'reward', 'cancel', 'no_fill']);

// /ad-event is the one write path that had no throttle: a session is free
// (Google OAuth), so one signed-in client could loop it and burn D1 writes
// (against the "must not cost money" constraint). Same in-isolate limiter as
// /rank. Over-frequency events are silently dropped (no D1 write) and still
// answered ok:true — the client fires-and-forgets telemetry, so a dropped
// duplicate must never surface as an error.
const AD_EVENT_MIN_INTERVAL_MS = 1_000;
const adEventLastCall = new Map<string, number>();

async function handleAdEvent(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);

  const body = await readJsonObject(request);
  const purpose = typeof body?.purpose === 'string' ? body.purpose : '';
  const outcome = typeof body?.outcome === 'string' ? body.outcome : '';
  if (!AD_PURPOSES.has(purpose) || !AD_OUTCOMES.has(outcome)) {
    return authJson({ error: 'bad-event' }, 400, origin);
  }

  // Throttle AFTER validation (a bad event still gets its 400) and before the
  // write: over-frequency VALID events are dropped, answered ok:true, no D1 row.
  const nowMs = Date.now();
  const last = adEventLastCall.get(user.id) ?? 0;
  if (nowMs - last < AD_EVENT_MIN_INTERVAL_MS) return authJson({ ok: true }, 200, origin);
  adEventLastCall.set(user.id, nowMs);
  // Bound isolate memory the same way rankLastCall does — eviction just re-allows
  // each account one more event, never a sustained write bypass.
  if (adEventLastCall.size > 10_000) adEventLastCall.clear();

  try {
    await env.DB.prepare('INSERT INTO ad_events (purpose, outcome, created) VALUES (?1, ?2, ?3)')
      .bind(purpose, outcome, Date.now())
      .run();
  } catch (err) {
    // Same contract as save_audit: telemetry hiccups are logged, never surfaced.
    console.error('ad_event insert failed', err);
  }
  return authJson({ ok: true }, 200, origin);
}

// GET /admin/stats — the owner's private dashboard feed. Bearer-token gated
// (ADMIN_TOKEN secret, compared constant-time), and deliberately AGGREGATE-ONLY:
// counts, leaderboard nicknames and ad-outcome tallies — never an email, id, or
// any per-child row, so the dashboard can't become a PII surface even if the
// token leaks. "Active now" is approximated from saves touched in the last 5
// minutes (checkpoints run every 60s), costing zero extra writes.
/** Constant-time bearer check against ADMIN_TOKEN — shared by every /admin route. */
function isAdmin(request: Request, env: Env): boolean {
  const expected = (env.ADMIN_TOKEN ?? '').trim();
  const header = request.headers.get('Authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const enc = new TextEncoder();
  return expected.length > 0 && provided.length > 0 && timingSafeEqual(enc.encode(provided), enc.encode(expected));
}

async function handleAdminStats(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!isAdmin(request, env)) return authJson({ error: 'unauthorized' }, 401, origin);

  try {
    const now = Date.now();
    const count = async (sql: string, ...binds: number[]) =>
      (await env.DB.prepare(sql).bind(...binds).first<{ c: number }>())?.c ?? 0;
    const rows = async (sql: string, ...binds: number[]) =>
      (await env.DB.prepare(sql).bind(...binds).all()).results ?? [];

    const [accounts, activeNow, active24h, newAccounts7d, boardSize] = await Promise.all([
      count('SELECT COUNT(*) AS c FROM users'),
      count('SELECT COUNT(*) AS c FROM saves WHERE updated >= ?1', now - 5 * 60_000),
      count('SELECT COUNT(*) AS c FROM saves WHERE updated >= ?1', now - 86_400_000),
      count('SELECT COUNT(*) AS c FROM users WHERE created >= ?1', now - 7 * 86_400_000),
      count('SELECT COUNT(*) AS c FROM scores'),
    ]);
    const [topGoo, topClicks, ads] = await Promise.all([
      rows('SELECT name, goo AS score FROM scores ORDER BY goo DESC, updated ASC LIMIT 10'),
      rows('SELECT name, clicks AS score FROM scores ORDER BY clicks DESC, updated ASC LIMIT 10'),
      rows('SELECT purpose, outcome, COUNT(*) AS count FROM ad_events WHERE created >= ?1 GROUP BY purpose, outcome', now - 7 * 86_400_000),
    ]);

    return authJson(
      { generatedAt: now, accounts, activeNow, active24h, newAccounts7d, boardSize, topGoo, topClicks, ads },
      200,
      origin,
    );
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

// GET /admin/barred — the accounts currently kept off the leaderboard, and why.
// Unlike /admin/stats this DOES return per-account rows (user_id + nickname), on
// purpose: it's the owner's moderation tool and releasing an account needs its
// id. Still no email or any other PII — just the id (a UUID) and the nickname
// that's already public on the board. Barred set is derived from the SAME
// predicate as isBarredFromBoard (barringRowSql), so the list can never claim
// someone is barred whom /submit would actually let through, or vice-versa.
async function handleAdminBarred(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!isAdmin(request, env)) return authJson({ error: 'unauthorized' }, 401, origin);
  try {
    // One row per barred account: worst ratio, the biggest reported jump, how
    // many flagged writes, the union of flags, and the nickname if they ever
    // reached the board (a LEFT JOIN — barred-on-first-submit accounts have no
    // scores row, so name is null and the UI falls back to the id).
    const res = await env.DB.prepare(
      `SELECT sa.user_id AS userId,
              s.name AS name,
              MAX(sa.created)   AS lastFlagged,
              MAX(sa.ratio)     AS worstRatio,
              MAX(sa.goo_gain)  AS maxGooGain,
              COUNT(*)          AS flaggedWrites,
              GROUP_CONCAT(DISTINCT sa.flags) AS flags
         FROM save_audit sa
         LEFT JOIN scores s ON s.code = REPLACE(sa.user_id, '-', '')
        WHERE ${barringRowSql('sa.', '?1', '?2')}
        GROUP BY sa.user_id
        ORDER BY lastFlagged DESC
        LIMIT 200`,
    )
      .bind(SUBMIT_ENFORCE_SINCE, FIRST_SAVE_CAP_BARS_SINCE)
      .all();
    return authJson({ generatedAt: Date.now(), barred: res.results ?? [] }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

// POST /admin/release { user_id } — clear an account's failed-audit rows so it
// returns to the board. Deletes ONLY ok = 0 rows (never the account, never its
// save), i.e. the one-liner documented above, one tap. Idempotent: releasing an
// already-clean account simply changes nothing.
async function handleAdminRelease(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!isAdmin(request, env)) return authJson({ error: 'unauthorized' }, 401, origin);
  const body = await readJsonObject(request);
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  if (!userId) return authJson({ error: 'bad-user' }, 400, origin);
  try {
    const res = await env.DB.prepare('DELETE FROM save_audit WHERE user_id = ?1 AND ok = 0').bind(userId).run();
    return authJson({ ok: true, released: res.meta?.changes ?? 0 }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);

  const body = await readJsonObject(request);
  if (!body) return authJson({ error: 'bad-json' }, 400, origin);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME_LEN) : '';
  if (!name) return authJson({ error: 'bad-name' }, 400, origin);
  // Enforced HERE, not only in the UI. The leaderboard is read by children.
  if (!isCleanNickname(name)) return authJson({ error: 'bad-name' }, 400, origin);

  try {
    const now = Date.now();
    const code = leaderboardCodeFor(user.id);

    // The consequence half of the audit — see SUBMIT_ENFORCE_SINCE above.
    if (await isBarredFromBoard(env.DB, user.id)) {
      return authJson({ error: 'flagged' }, 403, origin);
    }

    // The scores come from the server's own copy of this account's save. There
    // is deliberately no path for the request to supply them. The board values
    // live inside the payload, sanitized through the same migrate() the client
    // loads with — which also enforces goo ≤ lifetimeGoo and the physical
    // bestCpm ceiling, so an edited field can't sail past the rate audit.
    const row = await env.DB.prepare('SELECT payload FROM saves WHERE user_id = ?1')
      .bind(user.id)
      .first<{ payload: string }>();
    if (!row) return authJson({ error: 'no-save' }, 409, origin);
    const save = migrate(tryParseJson(row.payload), now);

    // HELD goo, not lifetime — the owner's call: the board shows what a player
    // has right now, so spending it on creatures is a real trade-off.
    const goo = clamp(Number(save.goo) || 0, 0, MAX_GOO);
    const clicks = clamp(Math.floor(Number(save.clicks) || 0), 0, MAX_CLICKS);
    const cpm = clamp(Math.floor(Number(save.bestCpm) || 0), 0, maxCpm);

    const existing = await env.DB.prepare('SELECT updated FROM scores WHERE code = ?1')
      .bind(code)
      .first<{ updated: number }>();
    if (existing && now - existing.updated < MIN_SUBMIT_INTERVAL_MS) {
      return authJson({ error: 'too-fast' }, 429, origin);
    }

    // goo tracks the CURRENT balance so it may go DOWN (that is the point);
    // clicks and cpm are records and only ever ratchet up via MAX.
    await env.DB.prepare(
      `INSERT INTO scores (code, name, clicks, goo, cpm, created, updated)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT(code) DO UPDATE SET
         name    = excluded.name,
         clicks  = MAX(scores.clicks, excluded.clicks),
         goo     = excluded.goo,
         cpm     = MAX(scores.cpm, excluded.cpm),
         created = CASE WHEN scores.created > 0 THEN scores.created ELSE excluded.created END,
         updated = excluded.updated`,
    )
      .bind(code, name, clicks, goo, cpm, now)
      .run();

    return authJson(await rankPayload(env, code), 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

// The board's total-player count is identical for everyone and moves only when
// a brand-new player joins — yet the rank queries below ran `SELECT COUNT(*)
// FROM scores`, a full-table scan, on EVERY leaderboard open. At tens of
// thousands of rows and thousands of opens a day that one scan was the single
// largest source of D1 rows-read. It doesn't need to be live: a count that's up
// to a minute stale is invisible to a player ("out of ~15,000"). So we cache it
// in-isolate and refresh at most once a minute. A cold isolate simply does what
// the code always did — one scan — so this can only ever help, never regress.
const TOTAL_SCORES_TTL_MS = 60_000;
let totalScoresCache: { value: number; at: number } | null = null;

async function cachedTotalScores(env: Env): Promise<number> {
  const now = Date.now();
  if (totalScoresCache && now - totalScoresCache.at < TOTAL_SCORES_TTL_MS) {
    return totalScoresCache.value;
  }
  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores').first<{ c: number }>();
  const value = total?.c ?? 0;
  totalScoresCache = { value, at: now };
  return value;
}

// ── Approximate ranks from a once-a-minute score histogram ──────────────────
//
// The per-player rank used to be `COUNT(*) WHERE col > me` on EVERY board open —
// a range scan that, at scale, is the single biggest source of D1 rows-read
// (CLAUDE.md's named hot path). Instead we bucket every score by its base-10
// magnitude ONCE a minute per board and cache the histogram in-isolate; a rank
// is then a lookup over a few hundred bucket counts and costs ZERO extra D1
// reads between refreshes. Same in-isolate trade-off as cachedTotalScores: a
// cold isolate simply does the one grouped scan, so this only ever helps.
//
// The rank becomes APPROXIMATE (bucketed to ~20 steps per power of ten) rather
// than exact — the player sees "~#1,234". That is the deliberate move CLAUDE.md
// prescribes for the >25-30k-DAU regime, and it adds no writes (the anti-goal
// there was per-minute rank WRITES, ~$600/mo — this is reads only).
const RANK_HISTOGRAM_TTL_MS_DEFAULT = 60_000;
const BUCKETS_PER_DECADE = 20; // log10(score) * 20 → 20 buckets per power of ten

type Board = 'clicks' | 'goo' | 'cpm';
interface Histogram {
  buckets: Map<number, number>; // bucket index → how many players fall in it
  positive: number; // total players with score >= 1 (sum of all bucket counts)
  at: number;
}
const histogramCache = new Map<Board, Histogram>();

// Test hook (like MIN_SAVE_INTERVAL_MS): the integration suite sets this to '0'
// so a rank read right after a submit sees a fresh histogram instead of the
// up-to-a-minute-stale one production intentionally serves.
function histogramTtl(env: Env): number {
  const raw = (env as { RANK_HISTOGRAM_TTL_MS?: string }).RANK_HISTOGRAM_TTL_MS;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : RANK_HISTOGRAM_TTL_MS_DEFAULT;
}

// score → bucket, matching the SQL `CAST(log(col) * B AS INTEGER)` exactly for
// col >= 1 (there log is >= 0, so SQLite's cast-truncation == Math.floor). D1
// exposes base-10 `log()`; `log10` is not authorized, hence `log`.
function bucketOf(v: number): number {
  return Math.floor(Math.log10(v) * BUCKETS_PER_DECADE);
}

async function scoreHistogram(env: Env, col: Board): Promise<Histogram> {
  const now = Date.now();
  const cached = histogramCache.get(col);
  if (cached && now - cached.at < histogramTtl(env)) return cached;
  // One grouped scan, served from the board's DESC index. `col >= 1` skips the
  // zero/tiny rows — they rank at the very bottom and never need the histogram.
  const rows = await env.DB.prepare(
    `SELECT CAST(log(${col}) * ${BUCKETS_PER_DECADE} AS INTEGER) AS b, COUNT(*) AS c FROM scores WHERE ${col} >= 1 GROUP BY b`,
  ).all<{ b: number; c: number }>();
  const buckets = new Map<number, number>();
  let positive = 0;
  for (const r of rows.results ?? []) {
    buckets.set(r.b, r.c);
    positive += r.c;
  }
  const hist: Histogram = { buckets, positive, at: now };
  histogramCache.set(col, hist);
  return hist;
}

// Approximate 1-based rank of score `v` on `col`. Everyone in a higher bucket
// ranks above; within the player's own bucket we place them at the midpoint
// (the least-biased guess with no intra-bucket detail). A score below 1 sits
// beneath everyone with a real score. Always >= 1, and identical to the old
// exact rank whenever the neighbours fall in separate buckets.
async function approxRank(env: Env, col: Board, v: number): Promise<number> {
  const hist = await scoreHistogram(env, col);
  if (v < 1) return hist.positive + 1;
  const mine = bucketOf(v);
  let above = 0;
  let same = 0;
  for (const [b, c] of hist.buckets) {
    if (b > mine) above += c;
    else if (b === mine) same = c;
  }
  return above + Math.max(1, Math.round(same / 2));
}

// GET /rank runs the one query CLAUDE.md names as the D1-cost hot path (a
// range COUNT that can scan most of the table), and unlike /submit and /save
// it had no throttle at all — any signed-in account could loop it for free.
// In-isolate limiter, same trade-off as cachedTotalScores: a cold isolate
// simply starts fresh, so this bounds abuse without adding a single D1 write.
// The UI only calls /rank on board-open, so 1 per 5s per account per metric is
// far above any legitimate cadence.
const RANK_MIN_INTERVAL_MS = 5_000;
const rankLastCall = new Map<string, number>();

async function handleRank(request: Request, env: Env, col: 'clicks' | 'goo' | 'cpm'): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);

  const rlKey = `${user.id}:${col}`;
  const nowMs = Date.now();
  const last = rankLastCall.get(rlKey) ?? 0;
  if (nowMs - last < RANK_MIN_INTERVAL_MS) return authJson({ error: 'too-fast' }, 429, origin);
  rankLastCall.set(rlKey, nowMs);
  // The map only ever grows while an isolate is warm — cap it so a wave of
  // accounts can't balloon isolate memory (eviction just re-allows a call).
  if (rankLastCall.size > 10_000) rankLastCall.clear();

  try {
    const code = leaderboardCodeFor(user.id);
    const me = await env.DB.prepare(`SELECT name, ${col} AS v FROM scores WHERE code = ?1`)
      .bind(code)
      .first<{ name: string; v: number }>();
    if (!me) return authJson({ rank: null }, 200, origin);
    // Approximate rank from the cached histogram — no range scan per request.
    const rank = await approxRank(env, col, me.v);
    // Guard the (possibly up-to-a-minute-stale) cached total up to the rank
    // so a brand-new joiner never sees "rank 15,001 of 15,000".
    const total = Math.max(await cachedTotalScores(env), rank);
    return authJson({ by: col, rank, score: me.v, name: me.name, total }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

/** The {total, clicks:{best,rank}, goo:{best,rank}} shape the client expects. */
async function rankPayload(env: Env, code: string) {
  const row = await env.DB.prepare('SELECT clicks, goo, cpm FROM scores WHERE code = ?1')
    .bind(code)
    .first<{ clicks: number; goo: number; cpm: number }>();
  const bestClicks = row?.clicks ?? 0;
  const bestGoo = row?.goo ?? 0;
  const bestCpm = row?.cpm ?? 0;
  // All three ranks come from the cached histograms (see approxRank) — no
  // range-COUNT scan per board, per request.
  const cRank = await approxRank(env, 'clicks', bestClicks);
  const gRank = await approxRank(env, 'goo', bestGoo);
  const mRank = await approxRank(env, 'cpm', bestCpm);
  // Cached, up-to-a-minute-stale total (see cachedTotalScores). Guard it up to
  // the largest rank so a brand-new joiner never reads "rank N+1 of N".
  const total = Math.max(await cachedTotalScores(env), cRank, gRank, mRank);
  return {
    ok: true,
    total,
    clicks: { best: bestClicks, rank: cRank },
    goo: { best: bestGoo, rank: gRank },
    cpm: { best: bestCpm, rank: mRank },
  };
}

// ════════════════════════════════════════════════════════════════════════
// Cloud save (PR 4)
// ════════════════════════════════════════════════════════════════════════
//
// The client stays authoritative here: on write, an uploaded save is run
// through `migrate()` — the SAME pure function the client loads with — and
// the RESULT is stored, never the raw body. On read, the stored payload is
// run through `migrate()` again before it goes out, so a payload written by
// an older deploy always comes back current. `migrate()` is total (it never
// throws — a malformed save just becomes a fresh default one), so a bad
// upload can never 500 here.
//
// Revisions: `rev` is 0 when no row exists yet. A write sends `baseRev` (the
// rev it last saw) and, if it still matches the stored rev, the row is
// updated to `baseRev + 1`; otherwise it's a stale write and the CURRENT
// cloud save comes back with the 409 so the client can merge without a
// second round trip. The write below is a single guarded UPSERT (see the
// WHERE clauses) so two concurrent writes against the same row can't both
// succeed — whichever commits first moves `rev` forward and the loser's
// guard fails.
//
// PR 5 adds a plausibility AUDIT of every successful write (see the
// try/catch around `verifySaveDelta` in `savePut` below) — shadow mode only,
// see worker/README.md "Save auditing (PR 5)" for what it records and why.

interface SaveRow {
  rev: number;
  payload: string;
  updated: number;
}

/** JSON.parse that degrades to null instead of throwing — migrate() treats null as "no save". */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function handleSave(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (request.method === 'GET') return saveGet(request, env, origin);
  if (request.method === 'PUT') return savePut(request, env, origin);
  return authJson({ error: 'not-found' }, 404, origin);
}

async function saveGet(request: Request, env: Env, origin: string | null): Promise<Response> {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);

    const row = await env.DB.prepare('SELECT rev, payload, updated FROM saves WHERE user_id = ?1')
      .bind(user.id)
      .first<SaveRow>();
    if (!row) return authJson({ rev: 0, updated: 0, save: null }, 200, origin);

    const save = migrate(tryParseJson(row.payload), Date.now());
    return authJson({ rev: row.rev, updated: row.updated, save }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

async function savePut(request: Request, env: Env, origin: string | null): Promise<Response> {
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);

  // Reject from the header first, before a byte is buffered. request.text()
  // materialises the WHOLE body in Worker memory, and a Worker has 128MB — so
  // checking the length only after reading it means a large upload can exhaust
  // memory on the way to being rejected.
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SAVE_BYTES) {
    return authJson({ error: 'too-large' }, 413, origin);
  }

  // Still check the real size: Content-Length is client-supplied and may be
  // absent (chunked) or a lie.
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_SAVE_BYTES) {
    return authJson({ error: 'too-large' }, 413, origin);
  }

  const body = tryParseJson(text);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return authJson({ error: 'bad-body' }, 400, origin);
  const b = body as Record<string, unknown>;

  const baseRev = b.baseRev;
  if (typeof baseRev !== 'number' || !Number.isFinite(baseRev) || !Number.isInteger(baseRev) || baseRev < 0) {
    return authJson({ error: 'bad-body' }, 400, origin);
  }
  if (b.save === undefined || b.save === null) return authJson({ error: 'bad-body' }, 400, origin);

  // Sanitize with the shared rule — the stored payload is the RESULT of
  // migrate(), never the raw upload. migrate() is total, so this never throws.
  const sanitized = migrate(b.save, Date.now());
  const payload = JSON.stringify(sanitized);
  const now = Date.now();
  const newRev = baseRev + 1;

  try {
    // Read the row as it stood BEFORE this write — this is the PREVIOUS save
    // the audit (PR 5) measures this upload's delta against. It has to be read
    // up front, because after the UPSERT the row IS the new save and there is
    // nothing left to compare to.
    //
    // It is safe to use for exactly that and nothing else: the UPSERT only
    // succeeds when the stored rev still equals baseRev, so on success this
    // snapshot is provably the row we just replaced. It is NOT reused for the
    // 409 response — see the comment there.
    const previousRow = await env.DB.prepare('SELECT rev, payload, updated FROM saves WHERE user_id = ?1')
      .bind(user.id)
      .first<SaveRow>();

    if (previousRow && now - previousRow.updated < minSaveIntervalMs(env)) {
      return authJson({ error: 'too-fast', rev: previousRow.rev, updated: previousRow.updated }, 429, origin);
    }

    // A single guarded UPSERT:
    //  - No row yet: the SELECT source only yields a row when baseRev is 0
    //    (the only correct baseRev for "no save"), so a stale baseRev with no
    //    existing row inserts nothing rather than fabricating a wrong rev.
    //  - Row exists: ON CONFLICT tries to update it, but the DO UPDATE's own
    //    WHERE guards on the CURRENT stored rev matching baseRev — a mismatch
    //    makes it a no-op (0 rows changed), which is how a race between two
    //    concurrent writers resolves to exactly one winner.
    const result = await env.DB.prepare(
      `INSERT INTO saves (user_id, rev, version, lifetime_goo, clicks, payload, updated)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
       WHERE ?8 = 0 OR EXISTS (SELECT 1 FROM saves WHERE user_id = ?1)
       ON CONFLICT(user_id) DO UPDATE SET
         rev = excluded.rev,
         version = excluded.version,
         lifetime_goo = excluded.lifetime_goo,
         clicks = excluded.clicks,
         payload = excluded.payload,
         updated = excluded.updated
       WHERE saves.rev = ?8`,
    )
      .bind(user.id, newRev, CURRENT_VERSION, sanitized.lifetimeGoo, sanitized.clicks, payload, now, baseRev)
      .run();

    if ((result.meta?.changes ?? 0) === 0) {
      // Re-read rather than reuse `previousRow`. The whole point of a 409 is
      // to hand back the save that BEAT us, and `previousRow` was read before
      // the UPSERT — if the winning write landed in between, that snapshot is
      // already stale. Answering with it would send the client away to merge
      // against its own old state and retry at a rev the server has moved
      // past, conflicting forever. One extra read, only on the conflict path.
      const current = await env.DB.prepare('SELECT rev, payload, updated FROM saves WHERE user_id = ?1')
        .bind(user.id)
        .first<SaveRow>();
      if (!current) return authJson({ error: 'stale', rev: 0, updated: 0, save: null }, 409, origin);
      const currentSave = migrate(tryParseJson(current.payload), now);
      return authJson({ error: 'stale', rev: current.rev, updated: current.updated, save: currentSave }, 409, origin);
    }

    // ── Save auditing (PR 5, shadow mode) ─────────────────────────────────
    // Record whether this delta was physically achievable — never blocks or
    // alters the response. A failure here (bad SQL, or `save_audit` not
    // existing yet because the owner hasn't re-run schema.sql against this
    // deploy) is caught and logged, not propagated: a player must never lose
    // a save because auditing hiccuped.
    try {
      const previousSave = previousRow ? migrate(tryParseJson(previousRow.payload), now) : null;
      // elapsedSeconds MUST come from the SERVER's own clock (the gap since
      // the previous stored write) — never from anything in the uploaded
      // save (e.g. `lastSeen`), which would hand a cheater exactly the
      // number that's supposed to bound them.
      const elapsedSeconds = previousRow ? Math.max(0, (now - previousRow.updated) / 1000) : 0;
      // The client can SAY a decrease is a deliberate rollback (see the
      // restore button in StatsOverlay). Passed through as an annotation only —
      // verifySaveDelta records it next to the decrease, never in place of it,
      // because it is a claim from the same party the audit is watching.
      const verdict = verifySaveDelta(previousSave, sanitized, elapsedSeconds, {
        rollbackClaimed: b.rollback === true,
        // The client can SAY a huge jump is a cross-device progress merge (the
        // one push right after decideMergeWinner adopts a bigger save). Like
        // rollback, it's a claim from the watched party — recorded alongside the
        // rate flag, never in place of it; isBarredFromBoard is what spares it.
        mergeClaimed: b.merge === true,
      });
      // First-save policy (see FIRST_SAVE_* above): the shared rule can't
      // judge a save with nothing before it, so the worker applies a flat cap
      // of its own. Recorded as an extra flag on the same audit row — the
      // write itself already succeeded and stays untouched.
      const flags: string[] = [...verdict.flags];
      let ok = verdict.ok;
      if (
        !previousRow &&
        (sanitized.lifetimeGoo > FIRST_SAVE_GOO_CAP ||
          sanitized.clicks > FIRST_SAVE_CLICK_CAP ||
          sanitized.bestCpm > FIRST_SAVE_CPM_CAP)
      ) {
        // Two tiers. Beyond the game's own hard ceilings (MAX_GOO / MAX_CLICKS)
        // no honest save can exist AT ALL — that is 'first-save-absurd' and it
        // bars regardless of the calendar. Below them, a big first save during
        // the sign-in migration window is indistinguishable from an honest
        // pre-auth player's carried-over progress, so 'first-save-cap' only
        // bars once FIRST_SAVE_CAP_BARS_SINCE arms it (see isBarredFromBoard).
        const absurd = sanitized.lifetimeGoo > MAX_GOO || sanitized.clicks > MAX_CLICKS;
        flags.push(absurd ? 'first-save-absurd' : 'first-save-cap');
        ok = false;
      }
      // Structurally impossible ownership (creatures with zero hatches AND zero
      // clicks behind them). Recorded as data only — deliberately NOT a barring
      // flag until real distribution shows its false-positive rate is zero.
      if (ownsImpossibleCreatures(sanitized)) {
        flags.push('impossible-creatures');
        ok = false;
      }
      await env.DB.prepare(
        `INSERT INTO save_audit (user_id, rev, created, elapsed_sec, goo_gain, max_gain, ratio, click_gain, flags, ok)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      )
        .bind(
          user.id,
          newRev,
          now,
          elapsedSeconds,
          verdict.gooGain,
          verdict.maxGain,
          verdict.ratio,
          verdict.clickGain,
          flags.join(','),
          ok ? 1 : 0,
        )
        .run();
    } catch (err) {
      console.error('save_audit insert failed', err);
    }

    return authJson({ rev: newRev, updated: now }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}
