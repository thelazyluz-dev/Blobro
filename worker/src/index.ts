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
import {
  balance,
  CURRENT_VERSION,
  isCleanNickname,
  maxCpm,
  migrate,
  ownsImpossibleCreatures,
  plausibilityCeiling,
  verifySaveDelta,
} from './rules';
import { sendPush, type PushMessage, type VapidConfig } from './push';

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
  // Web Push (VAPID). PUBLIC key is a plain [vars] entry (not secret); PRIVATE
  // key + subject are SECRETS (`wrangler secret put` / dashboard). All absent →
  // push sending no-ops.
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
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
const MAX_GOO = 1e103; // headroom ABOVE the googol (1e100) win: after a player
// wins, goo keeps climbing for a good while (up to a thousand googols) instead
// of freezing at the ceiling the moment they reach the summit. Still absurd-junk
// protection (first-save-absurd bars
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
      url.pathname === '/admin/players' ||
      url.pathname === '/admin/broadcast' ||
      url.pathname === '/admin/barred' ||
      url.pathname === '/admin/release' ||
      url.pathname === '/admin/edit' ||
      url.pathname === '/referral/claim' ||
      url.pathname === '/referral/claim-reward' ||
      url.pathname === '/referral/me' ||
      url.pathname.startsWith('/group/') ||
      url.pathname === '/push/subscribe' ||
      url.pathname === '/push/unsubscribe';

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

    // ── All three boards' top-10 at once (public, cached) ─────────────────
    // One request feeds the client's "new #1" watcher for every board.
    if (url.pathname === '/boards' && request.method === 'GET') {
      try {
        return await handleBoards(env);
      } catch {
        return json({ error: 'db' }, 500);
      }
    }

    // ── Hall of Champions (public, cached) ────────────────────────────────
    // The roll of honour: everyone who has reached the googol victory
    // summit, earliest first. Read-only, no session, no PII (nickname only).
    if (url.pathname === '/champions' && request.method === 'GET') {
      try {
        return await handleChampions(env);
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
      return handleSubmit(request, env, ctx);
    }

    // ── Ad telemetry (aggregate-only — see ad_events in schema.sql) ───────
    if (url.pathname === '/ad-event' && request.method === 'POST') {
      return handleAdEvent(request, env);
    }

    // ── Owner dashboard (bearer-token) ────────────────────────────────────
    if (url.pathname === '/admin/stats' && request.method === 'GET') {
      return handleAdminStats(request, env);
    }
    if (url.pathname === '/admin/players' && request.method === 'GET') {
      return handleAdminPlayers(request, env);
    }
    if (url.pathname === '/admin/broadcast' && request.method === 'POST') {
      return handleAdminBroadcast(request, env, ctx);
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
    // A testing convenience: overwrite a player's held goo / clicks by nickname.
    if (url.pathname === '/admin/edit' && request.method === 'POST') {
      return handleAdminEdit(request, env);
    }

    // ── Auth (PR 3a — identity only, no game logic here) ──────────────────
    if (url.pathname.startsWith('/auth/')) {
      return handleAuth(request, env, url);
    }

    // ── Cloud save (PR 4) ──────────────────────────────────────────────────
    if (url.pathname === '/save') {
      return handleSave(request, env);
    }

    // ── Referral (share link → friends → reward) ──────────────────────────
    if (url.pathname === '/referral/claim' && request.method === 'POST') {
      return handleReferralClaim(request, env);
    }
    if (url.pathname === '/referral/claim-reward' && request.method === 'POST') {
      return handleReferralClaimReward(request, env);
    }
    if (url.pathname === '/referral/me' && request.method === 'GET') {
      return handleReferralMe(request, env);
    }

    // ── Groups (friend / family / class boards — member-only, session-gated) ─
    if (url.pathname === '/group/create' && request.method === 'POST') {
      return handleGroupCreate(request, env);
    }
    if (url.pathname === '/group/join' && request.method === 'POST') {
      return handleGroupJoin(request, env);
    }
    if (url.pathname === '/group/leave' && request.method === 'POST') {
      return handleGroupLeave(request, env);
    }
    if (url.pathname === '/group/mine' && request.method === 'GET') {
      return handleGroupMine(request, env);
    }
    if (url.pathname === '/group/board' && request.method === 'GET') {
      return handleGroupBoard(request, env, url);
    }

    // ── Web Push subscriptions ────────────────────────────────────────────
    if (url.pathname === '/push/subscribe' && request.method === 'POST') {
      return handlePushSubscribe(request, env);
    }
    if (url.pathname === '/push/unsubscribe' && request.method === 'POST') {
      return handlePushUnsubscribe(request, env);
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
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    // The frequent cron only fires the offline-income-cap push; housekeeping
    // stays nightly. (At 03:00 both crons match and fire as separate events.)
    if (event.cron === '*/10 * * * *') {
      await pushOfflineCap(env);
      return;
    }
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
    // Referral status rides along on the per-load /auth/me so the client learns
    // its friend count (→ which medals it has earned) without a second call.
    // Read in a SEPARATE, guarded query — NOT folded into getUserFromRequest's
    // hot-path SELECT — so a deploy that lands before the schema ALTER degrades
    // to "no referral info" instead of breaking sign-in for everyone.
    const referral = await referralStatusFor(env, user.id);
    return authJson({ user: publicUser(user), referral }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

// ── Referral (share link → 5 friends → medal) ────────────────────────────
//
// A referee counts toward its referrer only once it shows real play — crosses
// this lifetime-goo bar (checked in savePut) — so a wave of throwaway accounts
// that never play never inflates anyone's count. Small enough that any genuine
// new player clears it within a few minutes.
const REFERRAL_QUALIFY_GOO = 5_000;
const REF_CODE_RE = /^[A-Za-z0-9]{4,40}$/;

/** A fresh opaque, non-PII share code (base62). Deliberately NOT the user id. */
function generateRefCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

/**
 * The caller's referral status for /auth/me — {code, count}. Returns null if the
 * columns aren't there yet (pre-schema deploy) so it can never break sign-in.
 * Does NOT lazily generate the code (that's a write; /referral/me handles it) —
 * keeps the per-load path read-only.
 */
async function referralStatusFor(
  env: Env,
  userId: string,
): Promise<{ code: string | null; count: number; claimed: number[] } | null> {
  try {
    const row = await env.DB.prepare('SELECT ref_code, referral_count, referral_claimed FROM users WHERE id = ?1')
      .bind(userId)
      .first<{ ref_code: string | null; referral_count: number; referral_claimed: string | null }>();
    if (!row) return null;
    return { code: row.ref_code ?? null, count: row.referral_count ?? 0, claimed: parseClaimed(row.referral_claimed) };
  } catch {
    return null; // columns not present yet — degrade quietly
  }
}

/** Parse the users.referral_claimed JSON array into a clean number[] (tiers). */
function parseClaimed(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

/** GET /referral/me → {code, count}. Lazily mints (and persists) the code. */
async function handleReferralMe(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);
  try {
    const existing = await env.DB.prepare('SELECT ref_code, referral_count, referral_claimed FROM users WHERE id = ?1')
      .bind(user.id)
      .first<{ ref_code: string | null; referral_count: number; referral_claimed: string | null }>();
    let code = existing?.ref_code ?? null;
    const count = existing?.referral_count ?? 0;
    const claimed = parseClaimed(existing?.referral_claimed);
    if (!code) {
      // Mint a unique code. Collisions are astronomically unlikely at 62^8; a
      // couple of retries covers the unique-index race/collision anyway.
      for (let i = 0; i < 4 && !code; i++) {
        const candidate = generateRefCode();
        try {
          const res = await env.DB.prepare('UPDATE users SET ref_code = ?1 WHERE id = ?2 AND ref_code IS NULL')
            .bind(candidate, user.id)
            .run();
          if ((res.meta?.changes ?? 0) > 0) {
            code = candidate;
          } else {
            // Someone set it concurrently — re-read and use that.
            const cur = await env.DB.prepare('SELECT ref_code FROM users WHERE id = ?1')
              .bind(user.id)
              .first<{ ref_code: string | null }>();
            if (cur?.ref_code) code = cur.ref_code;
          }
        } catch {
          // UNIQUE collision on ref_code — loop and try another candidate.
        }
      }
    }
    return authJson({ code, count, claimed }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

// The reward tiers, and what each pays out. Goo is a lump of this many hours of
// the referrer's CURRENT production; the medal tiers also grant a cosmetic.
const REFERRAL_TIERS: { friends: number; hours: number; medal?: string }[] = [
  { friends: balance.referralFriendsForGift, hours: balance.referralGiftHours },
  { friends: balance.referralFriendsForMedal, hours: balance.referralMedalBonusHours, medal: 'acc-referral' },
  { friends: balance.referralFriendsForGoldMedal, hours: balance.referralMedalBonusHours, medal: 'acc-referral-gold' },
];

/**
 * POST /referral/claim-reward {tier} — the player taps a reward they've earned.
 * Grants the tier's goo lump (and medal, if any) SERVER-SIDE into their stored
 * save, then records the tier in users.referral_claimed so it can't be claimed
 * twice — even if the client resets its own state, this column is the authority.
 * Returns {ok, tier, goo, ownedCosmetics, claimed} so the client merges the
 * result immediately; a locked/duplicate tier returns {ok:false, reason}.
 */
async function handleReferralClaimReward(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);

  const body = await readJsonObject(request);
  const tier = typeof body?.tier === 'number' ? body.tier : NaN;
  const def = REFERRAL_TIERS.find((t) => t.friends === tier);
  if (!def) return authJson({ ok: false, reason: 'bad-tier' }, 400, origin);

  try {
    const row = await env.DB.prepare('SELECT referral_count, referral_claimed FROM users WHERE id = ?1')
      .bind(user.id)
      .first<{ referral_count: number; referral_claimed: string | null }>();
    const count = row?.referral_count ?? 0;
    const claimed = parseClaimed(row?.referral_claimed);
    if (count < def.friends) return authJson({ ok: false, reason: 'locked' }, 200, origin);
    if (claimed.includes(def.friends)) return authJson({ ok: false, reason: 'claimed' }, 200, origin);

    // Grant into the stored save (goo is server-authoritative — a client lump
    // would trip the plausibility audit; the medal is a cosmetic we own here).
    const now = Date.now();
    const grant = await grantReferralReward(env, user.id, now, def.hours, def.medal);
    if (!grant) return authJson({ ok: false, reason: 'retry' }, 200, origin); // no save yet / write raced — nothing recorded, safe to retry

    // Record the tier ONLY after the grant persisted, so a failed grant never
    // burns the tier. Distinct tiers use distinct numbers, so appending is safe.
    const next = [...claimed, def.friends];
    await env.DB.prepare('UPDATE users SET referral_claimed = ?1 WHERE id = ?2')
      .bind(JSON.stringify(next), user.id)
      .run();

    return authJson(
      {
        ok: true,
        tier: def.friends,
        goo: grant.goo,
        lifetimeGoo: grant.lifetimeGoo,
        ownedCosmetics: grant.ownedCosmetics,
        rev: grant.rev,
        claimed: next,
      },
      200,
      origin,
    );
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

/**
 * POST /referral/claim {ref} — bind the caller (referee) to the referrer whose
 * share code is `ref`. One-time and idempotent (referee_id is the PK). Rejects
 * self-referral and an already-referred caller. Returns {ok} — a soft
 * false/reason on any benign rejection so the client just moves on.
 */
async function handleReferralClaim(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);
  const body = await readJsonObject(request);
  const ref = typeof body?.ref === 'string' ? body.ref.trim() : '';
  if (!REF_CODE_RE.test(ref)) return authJson({ ok: false, reason: 'bad-ref' }, 200, origin);
  try {
    // Already referred? One referrer per account, ever.
    const me = await env.DB.prepare('SELECT referred_by FROM users WHERE id = ?1')
      .bind(user.id)
      .first<{ referred_by: string | null }>();
    if (me?.referred_by) return authJson({ ok: false, reason: 'already' }, 200, origin);

    const referrer = await env.DB.prepare('SELECT id FROM users WHERE ref_code = ?1')
      .bind(ref)
      .first<{ id: string }>();
    if (!referrer) return authJson({ ok: false, reason: 'unknown' }, 200, origin);
    if (referrer.id === user.id) return authJson({ ok: false, reason: 'self' }, 200, origin);

    // Bind: record the edge (idempotent) and stamp the referee's referred_by.
    // The count is NOT incremented here — that waits until the referee qualifies
    // by actually playing (savePut), which defeats throwaway accounts.
    await env.DB.prepare(
      'INSERT OR IGNORE INTO referrals (referee_id, referrer_id, created, qualified) VALUES (?1, ?2, ?3, 0)',
    )
      .bind(user.id, referrer.id, Date.now())
      .run();
    await env.DB.prepare('UPDATE users SET referred_by = ?1 WHERE id = ?2 AND referred_by IS NULL')
      .bind(referrer.id, user.id)
      .run();
    return authJson({ ok: true }, 200, origin);
  } catch {
    return authJson({ ok: false, reason: 'db' }, 200, origin);
  }
}

/**
 * Grant a claimed referral reward into a player's stored save SERVER-SIDE: a
 * goo lump of `hours` of their CURRENT production, plus an optional medal
 * cosmetic. Doing it here (not client-side) is what keeps the goo anti-cheat-
 * safe: the audit's baseline becomes this new, higher save, so the next upload
 * shows no anomalous jump — a client-injected lump would trip the goo-rate flag,
 * which always bars. The player also gets the result echoed back to merge
 * immediately. Retries once on a save-rev race; returns null (nothing written)
 * if there's no save yet or the write keeps racing, so the caller can leave the
 * tier unclaimed and let the player retry.
 */
async function grantReferralReward(
  env: Env,
  userId: string,
  now: number,
  hours: number,
  medal?: string,
): Promise<{ goo: number; lifetimeGoo: number; ownedCosmetics: string[]; rev: number } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await env.DB.prepare('SELECT rev, payload FROM saves WHERE user_id = ?1')
      .bind(userId)
      .first<{ rev: number; payload: string }>();
    if (!row) return null; // no cloud save yet — can't grant
    const save = migrate(tryParseJson(row.payload), now);
    const rate = plausibilityCeiling(save, 0).passivePerSec;
    // Floor the goo lump so a referrer with little/no passive income (e.g. a
    // click-only player with no creatures) still gets a real reward instead of
    // 0 for a tier that's now marked claimed. Safe: it's one-time per tier and
    // gated by real qualified referrals, and it's tiny once income grows.
    const gift = Math.max(balance.referralMinGift, Math.floor(rate * hours * 3600));
    save.goo += gift;
    save.lifetimeGoo += gift;
    if (medal && !save.ownedCosmetics.includes(medal)) save.ownedCosmetics.push(medal);
    const payload = JSON.stringify(save);
    const nextRev = row.rev + 1;
    const res = await env.DB.prepare(
      'UPDATE saves SET rev = rev + 1, lifetime_goo = ?1, payload = ?2, updated = ?3 WHERE user_id = ?4 AND rev = ?5',
    )
      .bind(save.lifetimeGoo, payload, now, userId, row.rev)
      .run();
    // Echo back the FULL resulting state (goo, lifetimeGoo, ownedCosmetics, rev)
    // so the client can advance its cloudRev + lifetimeGoo in lockstep — without
    // that, the next checkpoint 409s and the merge refuses to push for hours.
    if ((res.meta?.changes ?? 0) > 0) {
      return { goo: save.goo, lifetimeGoo: save.lifetimeGoo, ownedCosmetics: save.ownedCosmetics, rev: nextRev };
    }
    // rev moved under us — loop and re-read once.
  }
  return null;
}

// ── Groups (friend / family / class boards) ──────────────────────────────
//
// Small private circles with their own leaderboard. A group is UNLISTED —
// reachable only by its share code (minted like ref_code: an opaque join
// capability, not a secret credential) — and its board is MEMBER-ONLY,
// checked per request, so a class of kids is never browsable by strangers.
// Board entries carry a nickname + score and NOTHING else: no user id, no
// code, no join time crosses the wire; "which row is mine" is computed
// server-side into a plain boolean.

const GROUP_NAME_MIN = 2;
const GROUP_NAME_MAX = 24; // longer than a nickname (12) — "הַכִּתָּה שֶׁל דָּנָה" needs room
const MAX_GROUP_MEMBERS = 60; // a whole school class + slack; also caps the board scan
const MAX_GROUPS_PER_USER = 10; // enough for family + class + friends; blocks group spam

/** How many groups this account belongs to (both caps below check this). */
async function groupCountFor(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE user_id = ?1')
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** POST /group/create {name} → 201 {ok, id, code, name}. Creator auto-joins. */
async function handleGroupCreate(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);

  const body = await readJsonObject(request);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  // Same server-side gate as leaderboard nicknames — other kids read this name.
  if (name.length < GROUP_NAME_MIN || name.length > GROUP_NAME_MAX || !isCleanNickname(name)) {
    return authJson({ error: 'bad-name' }, 400, origin);
  }

  try {
    if ((await groupCountFor(env, user.id)) >= MAX_GROUPS_PER_USER) {
      return authJson({ error: 'too-many-groups' }, 403, origin);
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    // Mint a unique share code. Collisions are astronomically unlikely at
    // 62^8; a couple of retries covers the unique-index race anyway (same
    // pattern as the ref_code minting in handleReferralMe).
    let code: string | null = null;
    for (let i = 0; i < 4 && !code; i++) {
      const candidate = generateRefCode();
      try {
        await env.DB.prepare('INSERT INTO groups (id, code, name, creator_id, created) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind(id, candidate, name, user.id, now)
          .run();
        code = candidate;
      } catch {
        // UNIQUE collision on idx_groups_code — loop and try another candidate.
      }
    }
    if (!code) return authJson({ error: 'db' }, 500, origin);
    await env.DB.prepare('INSERT INTO group_members (group_id, user_id, joined) VALUES (?1, ?2, ?3)')
      .bind(id, user.id, now)
      .run();
    return authJson({ ok: true, id, code, name }, 201, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

/** POST /group/join {code} → {ok, id, name} (idempotent — re-joining is never an error). */
async function handleGroupJoin(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);

  const body = await readJsonObject(request);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  // A malformed code answers exactly like an unknown one — no format oracle.
  if (!REF_CODE_RE.test(code)) return authJson({ error: 'not-found' }, 404, origin);

  try {
    const group = await env.DB.prepare('SELECT id, name FROM groups WHERE code = ?1')
      .bind(code)
      .first<{ id: string; name: string }>();
    if (!group) return authJson({ error: 'not-found' }, 404, origin);

    // Idempotent BEFORE the caps: an existing member re-tapping a share link
    // must never be told the group is full.
    const member = await env.DB.prepare('SELECT 1 AS x FROM group_members WHERE group_id = ?1 AND user_id = ?2')
      .bind(group.id, user.id)
      .first();
    if (member) return authJson({ ok: true, id: group.id, name: group.name, already: true }, 200, origin);

    if ((await groupCountFor(env, user.id)) >= MAX_GROUPS_PER_USER) {
      return authJson({ error: 'too-many-groups' }, 403, origin);
    }
    const size = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?1')
      .bind(group.id)
      .first<{ n: number }>();
    if ((size?.n ?? 0) >= MAX_GROUP_MEMBERS) return authJson({ error: 'full' }, 403, origin);

    // OR IGNORE: two devices racing the same join both land on the PK — fine.
    await env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, joined) VALUES (?1, ?2, ?3)')
      .bind(group.id, user.id, Date.now())
      .run();
    return authJson({ ok: true, id: group.id, name: group.name }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

/** POST /group/leave {id} → {ok}. The last member out deletes the group row. */
async function handleGroupLeave(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);

  const body = await readJsonObject(request);
  const id = typeof body?.id === 'string' ? body.id : '';

  try {
    // Leaving is idempotent — a membership row that isn't there is still gone.
    await env.DB.prepare('DELETE FROM group_members WHERE group_id = ?1 AND user_id = ?2').bind(id, user.id).run();
    // No orphans: an emptied group is unreachable (its code resolves to a
    // board nobody may see), so delete the row rather than leak it forever.
    await env.DB.prepare(
      'DELETE FROM groups WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = ?1)',
    )
      .bind(id)
      .run();
    return authJson({ ok: true }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

/** GET /group/mine → {groups:[{id, name, code, members}]} — the caller's own groups. */
async function handleGroupMine(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);

  try {
    // `code` is returned here and ONLY here — it's the caller's own invite
    // token for a group they already belong to, which is what the share
    // button needs. The member count rides along in the same query.
    const { results } = await env.DB.prepare(
      `SELECT g.id AS id, g.name AS name, g.code AS code,
              (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members
         FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = ?1
        ORDER BY gm.joined ASC`,
    )
      .bind(user.id)
      .all<{ id: string; name: string; code: string; members: number }>();
    return authJson({ groups: results ?? [] }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

/** GET /group/board?id=…&by=clicks|goo|cpm → the group's private leaderboard (members only). */
async function handleGroupBoard(request: Request, env: Env, url: URL): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);

  const id = url.searchParams.get('id') ?? '';
  const col = metricCol(url.searchParams.get('by'));

  try {
    // The privacy gate: only members see the board. An unknown id answers the
    // same as someone else's group — no existence oracle.
    const group = await env.DB.prepare(
      `SELECT g.name AS name FROM groups g
         JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?2
        WHERE g.id = ?1`,
    )
      .bind(id, user.id)
      .first<{ name: string }>();
    if (!group) return authJson({ error: 'not-a-member' }, 403, origin);

    // Members → their public scores rows via the same de-hyphenated-user-id
    // relation the rest of the leaderboard uses (leaderboardCodeFor). LEFT
    // JOIN so a classmate who just joined and never submitted still appears,
    // at score 0, immediately. Membership is capped at MAX_GROUP_MEMBERS so
    // this is a tiny scan — no caching needed.
    const { results } = await env.DB.prepare(
      `SELECT gm.user_id AS uid, s.name AS name, COALESCE(s.${col}, 0) AS score
         FROM group_members gm
         LEFT JOIN scores s ON s.code = REPLACE(gm.user_id, '-', '')
        WHERE gm.group_id = ?1
        ORDER BY score DESC, gm.joined ASC`,
    )
      .bind(id)
      .all<{ uid: string; name: string | null; score: number }>();
    // `me` is resolved HERE and the id dropped — entries never carry a user
    // id, a code, or anything else that could identify a child to another.
    const entries = (results ?? []).map((r) => ({
      name: r.name ?? 'שַׂחְקָן חָדָשׁ', // a member who never submitted to the public board
      score: r.score,
      me: r.uid === user.id,
    }));
    return authJson({ id, name: group.name, by: col, entries }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

// ── Web Push subscriptions ────────────────────────────────────────────────

/** POST /push/subscribe {endpoint, keys:{p256dh,auth}} — store this device's push subscription. */
async function handlePushSubscribe(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);
  const body = await readJsonObject(request);
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  const keys = body?.keys as { p256dh?: unknown; auth?: unknown } | undefined;
  const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh : '';
  const auth = typeof keys?.auth === 'string' ? keys.auth : '';
  // Endpoints are https push-service URLs; bound the size and shape defensively.
  if (!/^https:\/\/./.test(endpoint) || endpoint.length > 1024 || !p256dh || !auth) {
    return authJson({ error: 'bad-body' }, 400, origin);
  }
  try {
    // endpoint is the PK — a re-subscribe (or a device that moved accounts)
    // updates the owner + keys in place.
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created, last_offline_push)
       VALUES (?1, ?2, ?3, ?4, ?5, 0)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
      .bind(endpoint, user.id, p256dh, auth, Date.now())
      .run();
    return authJson({ ok: true }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

/** POST /push/unsubscribe {endpoint} — remove this device's subscription. */
async function handlePushUnsubscribe(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  let user: UserRow | null;
  try {
    user = await getUserFromRequest(request, env);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
  if (!user) return authJson({ error: 'unauthenticated' }, 401, origin);
  const body = await readJsonObject(request);
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint) return authJson({ error: 'bad-body' }, 400, origin);
  try {
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1 AND user_id = ?2')
      .bind(endpoint, user.id)
      .run();
    return authJson({ ok: true }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

// ── Push send helpers ──────────────────────────────────────────────────────

/** The VAPID config from env, or null when push isn't configured (sending no-ops). */
function vapidFrom(env: Env): VapidConfig | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
}

/** Reconstruct a user id from its leaderboard code (the de-hyphenated UUID). */
function userIdFromLeaderboardCode(code: string): string | null {
  if (!/^[0-9a-fA-F]{32}$/.test(code)) return null; // only the UUID-derived codes round-trip
  return `${code.slice(0, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}-${code.slice(16, 20)}-${code.slice(20, 32)}`;
}

/** Send a notification to every device a user has registered; prune dead ones. */
async function pushToUser(env: Env, userId: string, message: PushMessage): Promise<void> {
  const vapid = vapidFrom(env);
  if (!vapid) return;
  try {
    const { results } = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?1')
      .bind(userId)
      .all<{ endpoint: string; p256dh: string; auth: string }>();
    for (const sub of results ?? []) {
      const r = await sendPush(vapid, sub, message);
      if (r === 'gone') {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(sub.endpoint).run();
      }
    }
  } catch (err) {
    console.error('pushToUser failed', err);
  }
}

const METRIC_LABEL_HE: Record<'clicks' | 'goo' | 'cpm', string> = {
  clicks: 'לחיצות',
  goo: 'גו',
  cpm: 'מהירות',
};

/**
 * After a submit, notify the players a rising score displaced on any board:
 * the previous #1 who was overtaken, and anyone knocked out of the top-10.
 * Reads the top-11 before + after per metric (small, indexed) and diffs. Fired
 * via waitUntil so it never delays the submit response, and best-effort
 * throughout — a push failure never affects the leaderboard write.
 */
// A displaced-alert push is dropped by the service if it can't be delivered
// within this window — better silence than "someone overtook you" hours late.
const DISPLACE_PUSH_TTL_S = 15 * 60;
// A player who saved within this window is treated as actively playing, so the
// in-app toast (useChampionWatch) covers the news and we skip the push — this is
// what stops a stale alert from popping while you're already in the game. Sized
// above the 60s checkpoint cadence so a mid-checkpoint player still counts.
const ACTIVE_WINDOW_MS = 90 * 1000;

/** Is this user actively playing right now (saved within ACTIVE_WINDOW_MS)? */
async function isActive(env: Env, userId: string): Promise<boolean> {
  try {
    const row = await env.DB.prepare('SELECT updated FROM saves WHERE user_id = ?1')
      .bind(userId)
      .first<{ updated: number }>();
    return !!row && Date.now() - row.updated < ACTIVE_WINDOW_MS;
  } catch {
    return false; // on error, prefer sending the push over swallowing it
  }
}

async function notifyDisplaced(
  env: Env,
  submitterCode: string,
  before: Record<'clicks' | 'goo' | 'cpm', { code: string; name: string }[]>,
): Promise<void> {
  if (!vapidFrom(env)) return;
  const metrics = ['clicks', 'goo', 'cpm'] as const;
  const pushed = new Set<string>(); // one push per user across metrics
  for (const metric of metrics) {
    try {
      const after = await topForMetric(env, metric, 11);
      const beforeList = before[metric] ?? [];
      const afterCodes10 = new Set(after.slice(0, 10).map((r) => r.code));
      const cat = METRIC_LABEL_HE[metric];

      // Overtaken: the submitter is now #1 and wasn't before → tell the old #1.
      if (after[0]?.code === submitterCode && beforeList[0] && beforeList[0].code !== submitterCode) {
        const uid = userIdFromLeaderboardCode(beforeList[0].code);
        if (uid && !pushed.has(uid) && !(await isActive(env, uid))) {
          pushed.add(uid);
          await pushToUser(env, uid, {
            title: 'נלקח לך המקום הראשון! 👑',
            body: `${after[0].name} עקף אותך ב${cat}. תחזיר לעצמך את הכתר!`,
            tag: `overtaken-${metric}`,
            url: './',
            urgency: 'high',
            ttlSeconds: DISPLACE_PUSH_TTL_S,
          });
        }
      }

      // Dropped from the top-10: was in the before-top-10, gone from after-top-10.
      for (const b of beforeList.slice(0, 10)) {
        if (b.code === submitterCode || afterCodes10.has(b.code)) continue;
        const uid = userIdFromLeaderboardCode(b.code);
        if (uid && !pushed.has(uid) && !(await isActive(env, uid))) {
          pushed.add(uid);
          await pushToUser(env, uid, {
            title: 'ירדת מהטופ 10 📉',
            body: `מישהו עקף אותך בטבלת ה${cat}. חזור למשחק כדי לטפס בחזרה!`,
            tag: `dropped-${metric}`,
            url: './',
            urgency: 'high',
            ttlSeconds: DISPLACE_PUSH_TTL_S,
          });
        }
      }
    } catch (err) {
      console.error('notifyDisplaced failed', err);
    }
  }
}

/** Top-N (code + name) for a board — the small read the displacement diff uses. */
async function topForMetric(
  env: Env,
  metric: 'clicks' | 'goo' | 'cpm',
  limit: number,
): Promise<{ code: string; name: string }[]> {
  const { results } = await env.DB.prepare(
    `SELECT code, name FROM scores ORDER BY ${metric} DESC, updated ASC LIMIT ?1`,
  )
    .bind(limit)
    .all<{ code: string; name: string }>();
  return results ?? [];
}

/**
 * The offline-income-cap push (cron, every 10 min): notify players whose save
 * has been idle past the offline cap and who haven't been told about THIS idle
 * period yet (last_offline_push < the save's updated time). Bounded per run.
 */
async function pushOfflineCap(env: Env): Promise<void> {
  const vapid = vapidFrom(env);
  if (!vapid) return;
  const now = Date.now();
  const cutoff = now - balance.offlineCapSeconds * 1000;
  try {
    const { results } = await env.DB.prepare(
      `SELECT ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps JOIN saves s ON s.user_id = ps.user_id
       WHERE s.updated <= ?1 AND ps.last_offline_push < s.updated
       LIMIT 500`,
    )
      .bind(cutoff)
      .all<{ endpoint: string; p256dh: string; auth: string }>();
    for (const sub of results ?? []) {
      const r = await sendPush(vapid, sub, {
        title: 'הבלובים מחכים! 🟢',
        body: 'צברת את המקסימום של חצי שעה באופליין — בוא לאסוף ולהמשיך להרוויח!',
        tag: 'offline-cap',
        url: './',
      });
      if (r === 'gone') {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(sub.endpoint).run();
      } else {
        // Mark this idle period as handled; it re-arms when they next save.
        await env.DB.prepare('UPDATE push_subscriptions SET last_offline_push = ?1 WHERE endpoint = ?2')
          .bind(now, sub.endpoint)
          .run();
      }
    }
  } catch (err) {
    console.error('pushOfflineCap failed', err);
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
  // NB: merge-claimed is deliberately NOT excluded here. It is a CLIENT claim
  // (body.merge on PUT /save), and a client claim is unverifiable — the "other
  // device's" progress was never audited by us, so an honest cross-device merge
  // and a fabricated one are indistinguishable, and either can be as large as
  // the other (up to MAX_GOO). Auto-exempting it would let one crafted request
  // publish any score and defeat the "boards can be trusted" guarantee the whole
  // enforcement exists for. So merge-claimed is ADVISORY ONLY — recorded and
  // surfaced on the dashboard so the owner can release an honest multi-device
  // player in one tap (with the annotation telling them it's likely genuine),
  // exactly the "annotate, never excuse" posture rollback-claimed already uses.
  return `${col}ok = 0 AND ${col}created >= ${enforcePh}
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

    const [accounts, activeNow, active24h, newAccounts7d, boardSize, pushOptIns, totalGoo] = await Promise.all([
      count('SELECT COUNT(*) AS c FROM users'),
      count('SELECT COUNT(*) AS c FROM saves WHERE updated >= ?1', now - 5 * 60_000),
      count('SELECT COUNT(*) AS c FROM saves WHERE updated >= ?1', now - 86_400_000),
      count('SELECT COUNT(*) AS c FROM users WHERE created >= ?1', now - 7 * 86_400_000),
      count('SELECT COUNT(*) AS c FROM scores'),
      // Distinct accounts with at least one live push subscription.
      count('SELECT COUNT(DISTINCT user_id) AS c FROM push_subscriptions').catch(() => 0),
      // Total goo ever earned across all saves — a vanity/scale headline.
      (async () =>
        (await env.DB.prepare('SELECT COALESCE(SUM(lifetime_goo),0) AS c FROM saves').first<{ c: number }>())?.c ?? 0)(),
    ]);

    // Daily time series. `newByDay` is real history (users.created is stored);
    // `activeByDay` builds up from the day the `activity` table shipped. Both
    // degrade to [] if their source isn't there yet, so the dashboard never
    // breaks on a pre-schema deploy.
    const newByDay = (await rows(
      `SELECT strftime('%Y-%m-%d', created/1000, 'unixepoch') AS day, COUNT(*) AS n
       FROM users GROUP BY day ORDER BY day DESC LIMIT 30`,
    ).catch(() => [])) as Array<{ day: string; n: number }>;
    const activeByDay = (await rows(
      `SELECT day, COUNT(*) AS users, COALESCE(SUM(saves),0) AS saves
       FROM activity GROUP BY day ORDER BY day DESC LIMIT 30`,
    ).catch(() => [])) as Array<{ day: string; users: number; saves: number }>;
    // Top lists come from the authoritative `saves` table (checkpointed ~60s),
    // NOT from `scores`. `scores` is only written when a player OPENS their
    // leaderboard (/submit), so a scores-based dashboard was stale until each
    // tester happened to peek at the board. `saves` carries denormalized fresh
    // `clicks` and `lifetime_goo`, and the held goo lives in the payload — so
    // this reflects current progress every refresh, no board-open required.
    // The public nickname is joined in from `scores` via each account's derived
    // leaderboard code (a hash, so it can't be a SQL join); accounts that never
    // joined the board simply have no nickname yet.
    const [gooCandidates, clickRows, scoreNames, ads] = await Promise.all([
      rows('SELECT user_id, payload FROM saves ORDER BY lifetime_goo DESC LIMIT 25'),
      rows('SELECT user_id, clicks FROM saves ORDER BY clicks DESC LIMIT 10'),
      rows('SELECT code, name FROM scores'),
      rows('SELECT purpose, outcome, COUNT(*) AS count FROM ad_events WHERE created >= ?1 GROUP BY purpose, outcome', now - 7 * 86_400_000),
    ]);
    const nameByCode = new Map<string, string>();
    for (const r of scoreNames as Array<{ code: string; name: string }>) nameByCode.set(String(r.code), String(r.name));
    const nameFor = (userId: string) => nameByCode.get(leaderboardCodeFor(userId)) ?? null;

    const topClicks = (clickRows as Array<{ user_id: string; clicks: number }>).map((r) => ({
      name: nameFor(String(r.user_id)),
      score: Number(r.clicks) || 0,
    }));
    // The board shows HELD goo (current balance), which is a payload field — read
    // it from the top candidates and re-sort, so the number matches the board.
    const topGoo = (gooCandidates as Array<{ user_id: string; payload: string }>)
      .map((r) => {
        const parsed = tryParseJson(String(r.payload)) as { goo?: unknown } | null;
        return { name: nameFor(String(r.user_id)), score: clamp(Number(parsed?.goo) || 0, 0, MAX_GOO) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return authJson(
      {
        generatedAt: now,
        accounts,
        activeNow,
        active24h,
        newAccounts7d,
        boardSize,
        pushOptIns,
        totalGoo,
        topGoo,
        topClicks,
        ads,
        newByDay,
        activeByDay,
        // The checkpoint gap (seconds) each `saves` count represents — lets the
        // dashboard turn save-counts into a screen-time estimate without pinning
        // the client to a magic number.
        checkpointSeconds: 60,
      },
      200,
      origin,
    );
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

// GET /admin/players — the 100 most recently registered accounts, PRIVACY-SAFE:
// only the public nickname (from `scores`, already visible on the board), the
// join date, last-active time, and their goo/clicks. Never the email or the
// Google display name (stored for account identity, never shown — see the
// privacy policy). Separate from /admin/stats so the 30s refresh stays light.
async function handleAdminPlayers(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!isAdmin(request, env)) return authJson({ error: 'unauthorized' }, 401, origin);
  try {
    const [players, scoreNames] = await Promise.all([
      env.DB.prepare(
        `SELECT u.id, u.created, s.updated, s.clicks, s.lifetime_goo
         FROM users u LEFT JOIN saves s ON s.user_id = u.id
         ORDER BY u.created DESC LIMIT 100`,
      ).all<{ id: string; created: number; updated: number | null; clicks: number | null; lifetime_goo: number | null }>(),
      env.DB.prepare('SELECT code, name FROM scores').all<{ code: string; name: string }>(),
    ]);
    const nameByCode = new Map<string, string>();
    for (const r of scoreNames.results ?? []) nameByCode.set(String(r.code), String(r.name));
    const list = (players.results ?? []).map((r) => ({
      name: nameByCode.get(leaderboardCodeFor(String(r.id))) ?? null, // public alias, or null if never joined the board
      joined: r.created,
      lastActive: r.updated ?? null,
      clicks: Number(r.clicks) || 0,
      goo: Number(r.lifetime_goo) || 0,
    }));
    return authJson({ players: list }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

// POST /admin/broadcast {title, body} — send one push notification to every
// opted-in device. Owner-only. Bounded per invocation and pruned as it goes;
// the actual sends run in the background so the request returns promptly with
// how many devices were targeted.
async function handleAdminBroadcast(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!isAdmin(request, env)) return authJson({ error: 'unauthorized' }, 401, origin);
  const vapid = vapidFrom(env);
  if (!vapid) return authJson({ error: 'push-unconfigured' }, 400, origin);
  const body = await readJsonObject(request);
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 400) : '';
  if (!text && !title) return authJson({ error: 'empty' }, 400, origin);
  try {
    const subs = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions LIMIT 2000')
      .all<{ endpoint: string; p256dh: string; auth: string }>();
    const rows = subs.results ?? [];
    const message: PushMessage = {
      title: title || 'בלורבו 🫧',
      body: text,
      tag: 'broadcast',
      url: './',
      urgency: 'normal',
    };
    // Fire the sends in the background so the dashboard gets an immediate count.
    ctx.waitUntil(
      (async () => {
        for (const sub of rows) {
          const r = await sendPush(vapid, sub, message);
          if (r === 'gone') {
            await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(sub.endpoint).run().catch(() => {});
          }
        }
      })(),
    );
    return authJson({ ok: true, targeted: rows.length }, 200, origin);
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

// POST /admin/edit { nickname, goo?, clicks? } — a TESTING convenience: overwrite
// a player's held goo and/or tap count, identified by their PUBLIC leaderboard
// nickname (no id or PII ever crosses the wire — the nickname is already public).
// It patches the stored save payload + denormalized columns and bumps `rev` so
// the player's next load adopts it. `lifetimeGoo` is only ever RAISED to stay
// ≥ the held goo (monotonic — an edit can never look like a rewound save, so it
// can't corrupt an account or trip the audit). Nickname → account resolves via
// the scores.code = de-hyphenated user_id relation (leaderboardCodeFor).
async function handleAdminEdit(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!isAdmin(request, env)) return authJson({ error: 'unauthorized' }, 401, origin);
  const body = await readJsonObject(request);
  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
  if (!nickname) return authJson({ error: 'bad-nickname' }, 400, origin);
  const hasGoo = typeof body?.goo === 'number' && Number.isFinite(body.goo);
  const hasClicks = typeof body?.clicks === 'number' && Number.isFinite(body.clicks);
  if (!hasGoo && !hasClicks) return authJson({ error: 'nothing-to-edit' }, 400, origin);

  try {
    // Resolve nickname → the account's save. Only players who reached the board
    // (have a nickname) are addressable — exactly the ones the owner can see.
    const row = await env.DB.prepare(
      `SELECT sv.user_id AS userId, sv.rev AS rev, sv.payload AS payload
         FROM saves sv JOIN scores sc ON sc.code = REPLACE(sv.user_id, '-', '')
        WHERE sc.name = ?1 LIMIT 1`,
    )
      .bind(nickname)
      .first<{ userId: string; rev: number; payload: string }>();
    if (!row) return authJson({ error: 'not-found' }, 404, origin);

    const now = Date.now();
    const save = migrate(tryParseJson(row.payload), now);
    if (hasGoo) save.goo = clamp(Math.floor(body!.goo as number), 0, MAX_GOO);
    if (hasClicks) save.clicks = Math.max(0, Math.min(1e12, Math.floor(body!.clicks as number)));
    // The client only ADOPTS the cloud save when its lifetimeGoo exceeds the
    // LOCAL (in-memory) one (decideMergeWinner). Between the player's last 60s
    // checkpoint and their reload, local can have earned up to ~a minute of
    // income, so a tiny +1 nudge lost the race — that's why the edit "took a few
    // tries". Nudge lifetimeGoo by a generous buffer (≈90s of the account's own
    // income, min 1000) so the edited save wins on the FIRST try for any prompt
    // reload, without needing to know the local value.
    const income = plausibilityCeiling(save, 0).passivePerSec;
    const nudge = Math.max(1000, (Number.isFinite(income) ? income : 0) * 90);
    save.lifetimeGoo = clamp(Math.max(Number(save.lifetimeGoo) || 0, save.goo) + nudge, 0, MAX_GOO);

    const sanitized = migrate(save, now);
    const payload = JSON.stringify(sanitized);
    const newRev = (Number(row.rev) || 0) + 1;
    await env.DB.prepare(
      `UPDATE saves SET rev = ?2, version = ?3, lifetime_goo = ?4, clicks = ?5, payload = ?6, updated = ?7
        WHERE user_id = ?1`,
    )
      .bind(row.userId, newRev, CURRENT_VERSION, sanitized.lifetimeGoo, sanitized.clicks, payload, now)
      .run();

    return authJson(
      { ok: true, nickname, goo: sanitized.goo, clicks: sanitized.clicks, lifetimeGoo: sanitized.lifetimeGoo, rev: newRev },
      200,
      origin,
    );
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}

async function handleSubmit(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

    // Snapshot each board's top-11 BEFORE the write, so notifyDisplaced can diff
    // it against the after-state to find who got overtaken / knocked out of the
    // top-10. Only when push is configured — otherwise skip the reads entirely.
    const before = vapidFrom(env)
      ? {
          clicks: await topForMetric(env, 'clicks', 11),
          goo: await topForMetric(env, 'goo', 11),
          cpm: await topForMetric(env, 'cpm', 11),
        }
      : null;

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

    // Notify anyone this score displaced — in the background, so the submit
    // response isn't held up by push round-trips.
    if (before) ctx.waitUntil(notifyDisplaced(env, code, before));

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

// ── All three boards' top-10 in one cached call (GET /boards) ────────────────
// Feeds the client's "new #1" watcher: it polls this, and when a board's leader
// changes AND the player is in that board's top-10, it shows a toast. Cached
// in-isolate (same trade-off as the total/histogram) so continuous polling by
// many clients costs at most one grouped read per board per 30s, not per poll.
const BOARDS_TTL_MS = 30_000;
let boardsCache: { data: unknown; at: number } | null = null;
async function handleBoards(env: Env): Promise<Response> {
  const now = Date.now();
  const headers = { 'Cache-Control': 'public, max-age=30' };
  if (boardsCache && now - boardsCache.at < BOARDS_TTL_MS) return json(boardsCache.data, 200, headers);
  const top = async (col: Board) =>
    ((await env.DB.prepare(`SELECT name, ${col} AS score FROM scores ORDER BY ${col} DESC, updated ASC LIMIT 10`).all())
      .results ?? []);
  const [goo, clicks, cpm] = await Promise.all([top('goo'), top('clicks'), top('cpm')]);
  const data = { generatedAt: now, goo, clicks, cpm };
  boardsCache = { data, at: now };
  return json(data, 200, headers);
}

// ── Hall of Champions ───────────────────────────────────────────────────────
// The public roll of honour: every account that has reached the googol
// victory summit, EARLIEST FIRST (won_at ASC) — the pioneers head the list, and
// because won_at is stamped once and never moves, a champion's place never
// shifts as newcomers arrive. The nickname is LEFT JOINed from `scores` via the
// same de-hyphenated-user-id relation the rest of the leaderboard uses; a
// champion who never picked a leaderboard nickname shows a kid-safe default.
// No PII (nickname only), no session, and cached in-isolate + browser-side like
// /boards — the Hall changes rarely, so a 60s stale read is invisible.
const CHAMPIONS_TTL_MS_DEFAULT = 60_000;
const CHAMPIONS_LIMIT = 100;
let championsCache: { data: unknown; at: number } | null = null;

// Test hook (like RANK_HISTOGRAM_TTL_MS): the integration suite sets this to '0'
// so a read right after an enrolment sees fresh rows instead of the up-to-a-
// minute-stale roll production intentionally serves.
function championsTtl(env: Env): number {
  const raw = (env as { CHAMPIONS_TTL_MS?: string }).CHAMPIONS_TTL_MS;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : CHAMPIONS_TTL_MS_DEFAULT;
}

async function handleChampions(env: Env): Promise<Response> {
  const now = Date.now();
  const headers = { 'Cache-Control': 'public, max-age=60' };
  if (championsCache && now - championsCache.at < championsTtl(env)) {
    return json(championsCache.data, 200, headers);
  }
  const { results } = await env.DB.prepare(
    `SELECT c.won_at AS wonAt, s.name AS name
       FROM champions c
       LEFT JOIN scores s ON s.code = REPLACE(c.user_id, '-', '')
      ORDER BY c.won_at ASC
      LIMIT ?1`,
  )
    .bind(CHAMPIONS_LIMIT)
    .all<{ wonAt: number; name: string | null }>();
  const entries = (results ?? []).map((r, i) => ({
    rank: i + 1,
    name: r.name ?? 'אַלּוּף אַלְמוֹנִי', // a champion who never set a leaderboard nickname
    wonAt: r.wonAt,
  }));
  const data = { generatedAt: now, entries };
  championsCache = { data, at: now };
  return json(data, 200, headers);
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

    // ── Referral qualification ────────────────────────────────────────────
    // If this saver was referred and has now shown real play (crossed the goo
    // bar), flip their referral row to qualified ONCE and credit the referrer.
    // Gated on referred_by IS NOT NULL first, so an honest non-referred save
    // does a single cheap indexed lookup and nothing else. Never breaks a save
    // (own try/catch), and the UPDATE...WHERE qualified = 0 guarantees it counts
    // at most once no matter how many saves cross the bar.
    try {
      if (sanitized.lifetimeGoo >= REFERRAL_QUALIFY_GOO) {
        const ref = await env.DB.prepare('SELECT referrer_id, qualified FROM referrals WHERE referee_id = ?1')
          .bind(user.id)
          .first<{ referrer_id: string; qualified: number }>();
        if (ref && ref.qualified === 0) {
          const flip = await env.DB.prepare('UPDATE referrals SET qualified = 1 WHERE referee_id = ?1 AND qualified = 0')
            .bind(user.id)
            .run();
          if ((flip.meta?.changes ?? 0) > 0) {
            // Credit the referrer's friend count. The rewards themselves are NOT
            // granted here — the player claims each tier by tapping it in the
            // invite screen (see /referral/claim-reward), which grants the goo +
            // medal server-side and records the tier so it can't be claimed
            // twice. This keeps the "tap the glowing prize to collect it" flow.
            await env.DB.prepare('UPDATE users SET referral_count = referral_count + 1 WHERE id = ?1')
              .bind(ref.referrer_id)
              .run();
          }
        }
      }
    } catch (err) {
      console.error('referral qualify failed', err);
    }

    // ── Engagement logging (owner dashboard) ──────────────────────────────
    // One row per (account, day); `saves` counts this day's checkpoints. Gives
    // daily-active-users (COUNT per day) and a screen-time estimate (SUM of
    // saves × the ~60s checkpoint gap). Best-effort — a failure here (e.g. the
    // `activity` table not created yet) never affects the save.
    try {
      const day = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
      await env.DB.prepare(
        `INSERT INTO activity (user_id, day, saves) VALUES (?1, ?2, 1)
         ON CONFLICT(user_id, day) DO UPDATE SET saves = saves + 1`,
      )
        .bind(user.id, day)
        .run();
    } catch (err) {
      console.error('activity log failed', err);
    }

    // ── Hall of Champions (endgame) ───────────────────────────────────────
    // The first time a save carrying the googol champion crown lands, stamp
    // the moment of victory. INSERT OR IGNORE on the user_id PK records it
    // once, ever — the "won at" time never moves, so the Hall's earliest-first
    // ordering is stable. Guarded on lifetimeGoo too: the crown is only ever
    // granted at the 1e100 summit, so a save with the cosmetic but without the
    // progress behind it (a hand-edited ownedCosmetics list) is not enrolled —
    // a cheap consistency belt on top of the leaderboard's own barring. Best-
    // effort: a failure here (e.g. the champions table not created yet on a
    // pre-schema deploy) never affects the save.
    try {
      if (
        sanitized.ownedCosmetics.includes('acc-champion') &&
        sanitized.lifetimeGoo >= balance.googolWinGoo
      ) {
        await env.DB.prepare('INSERT OR IGNORE INTO champions (user_id, won_at) VALUES (?1, ?2)')
          .bind(user.id, now)
          .run();
      }
    } catch (err) {
      console.error('champion record failed', err);
    }

    return authJson({ rev: newRev, updated: now }, 200, origin);
  } catch {
    return authJson({ error: 'db' }, 500, origin);
  }
}
