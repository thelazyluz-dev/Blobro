/**
 * Auth primitives for PR 3a (identity only — no game logic here).
 *
 * Everything below is built on WebCrypto (`crypto.subtle`,
 * `crypto.getRandomValues`) — available natively in the Workers runtime and
 * in Node ≥ 18 for tests, no npm crypto dependency needed.
 *
 * Security properties implemented here:
 *   • Passwords: PBKDF2-HMAC-SHA256, random 16-byte salt, self-describing
 *     stored string so the iteration count can be raised later without
 *     invalidating old hashes.
 *   • Verification is constant-time (no early-exit `===` on secret bytes).
 *   • Session tokens: 32 random bytes: raw token goes in the cookie, only its
 *     SHA-256 hash is ever persisted (D1 leak ≠ session leak).
 *   • Cookies: HttpOnly + Secure + SameSite=Lax, scoped to the apex domain
 *     via a caller-supplied Domain (see cookieDomainFor).
 *
 * Explicitly NOT implemented / deferred (be honest about the ceiling):
 *   • Login throttling here is per-email, in D1, with no IP dimension and no
 *     cleanup sweep for rows created by probing nonexistent emails. It stops
 *     a naive credential-stuffing loop against one account; it is not a
 *     general rate limiter. A later PR could add Cloudflare-level rate
 *     limiting or a TTL sweep.
 *   • Google ID-token verification here trusts the OpenID `userinfo`
 *     endpoint reached over the server-to-server token exchange (code+PKCE
 *     already bind the request to this session) rather than doing full
 *     RS256 JWT/JWKS verification by hand. This is a common, accepted
 *     pattern but is weaker than verifying Google's signature locally.
 */

// ── base64 / base64url helpers ────────────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return base64ToBytes(padded + pad);
}

// ── constant-time compare ─────────────────────────────────────────────────

/**
 * Timing-safe byte compare. Always walks the full length of the longer array
 * so the *time taken* doesn't leak how many leading bytes matched. A length
 * mismatch alone returns false quickly, but for our use (comparing two fixed
 * KEY_LEN-byte digests) lengths always match in real use, so this doesn't
 * leak anything attacker-controlled.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

// ── password hashing (PBKDF2-HMAC-SHA256) ─────────────────────────────────

export const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, keyBytes: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    keyBytes * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Hash a plaintext password into a self-describing string:
 *   pbkdf2$sha256$<iterations>$<saltB64>$<hashB64>
 * `iterations` is a parameter (not a module constant baked into the format)
 * so tests can pass a smaller count for speed and production can raise the
 * count later — old rows keep verifying because the count travels with them.
 */
export async function hashPassword(password: string, iterations = DEFAULT_PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, iterations, KEY_BYTES);
  return `pbkdf2$sha256$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

/** Verify a plaintext password against a stored `hashPassword` string. Constant-time on the digest compare. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = base64ToBytes(parts[3]);
    expected = base64ToBytes(parts[4]);
  } catch {
    return false;
  }
  const actual = await pbkdf2(password, salt, iterations, expected.length);
  return timingSafeEqual(actual, expected);
}

/**
 * A fixed, valid-format dummy hash used to pay the same PBKDF2 cost on a
 * login attempt against an email that doesn't exist, so "unknown email" and
 * "wrong password" take the same wall-clock time and can't be distinguished
 * by a timing side-channel. The password it corresponds to is never used.
 */
export const DUMMY_PASSWORD_HASH =
  'pbkdf2$sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// ── session tokens ─────────────────────────────────────────────────────────

const TOKEN_BYTES = 32;

/** 32 random bytes, base64url-encoded. This is the raw token that goes in the cookie. */
export function generateSessionToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/** SHA-256 of the raw token, base64url. This — never the raw token — is what's stored in D1. */
export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

export const DEFAULT_SESSION_TTL_DAYS = 30;

export function sessionExpiresAt(now: number, ttlDays = DEFAULT_SESSION_TTL_DAYS): number {
  return now + ttlDays * 24 * 60 * 60 * 1000;
}

export function isSessionExpired(expires: number, now = Date.now()): boolean {
  return now >= expires;
}

// ── cookies ─────────────────────────────────────────────────────────────

export const SESSION_COOKIE_NAME = 'blorbo_session';
export const OAUTH_STATE_COOKIE_NAME = 'blorbo_oauth_state';

export interface BuildCookieOptions {
  name: string;
  value: string;
  maxAgeSeconds: number;
  /** Undefined = host-only cookie (dev/workers.dev). Set to '.bl-or-bo.com' in prod. */
  domain?: string;
  path?: string;
  sameSite?: 'Lax' | 'Strict' | 'None';
}

/** Build a Set-Cookie value. HttpOnly + Secure always on — this is never a JS-readable cookie. */
export function buildCookie(opts: BuildCookieOptions): string {
  const parts = [`${opts.name}=${opts.value}`, 'HttpOnly', 'Secure', `SameSite=${opts.sameSite ?? 'Lax'}`, `Path=${opts.path ?? '/'}`];
  parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join('; ');
}

export function buildClearCookie(name: string, opts: { domain?: string; path?: string } = {}): string {
  return buildCookie({ name, value: '', maxAgeSeconds: 0, domain: opts.domain, path: opts.path });
}

/** Parse a `Cookie` request header into a plain map. */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Only set a Domain attribute when the Worker's own hostname is the apex
 * domain or a subdomain of it — a browser rejects (silently drops) a
 * Set-Cookie whose Domain isn't the current host or a superdomain of it.
 * This lets the same code work against a workers.dev URL during setup
 * (host-only cookie) and against api.bl-or-bo.com in production (cookie
 * scoped to the whole apex).
 */
export function cookieDomainFor(hostname: string): string | undefined {
  if (hostname === 'bl-or-bo.com' || hostname.endsWith('.bl-or-bo.com')) return '.bl-or-bo.com';
  return undefined;
}

// ── HMAC signing (used for the opaque OAuth `state`) ──────────────────────

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToBase64Url(new Uint8Array(sig));
}

export async function hmacVerify(secret: string, message: string, signatureB64Url: string): Promise<boolean> {
  let sig: Uint8Array;
  try {
    sig = base64UrlToBytes(signatureB64Url);
  } catch {
    return false;
  }
  const key = await hmacKey(secret);
  // crypto.subtle.verify itself is a constant-time MAC comparison.
  return crypto.subtle.verify('HMAC', key, sig as BufferSource, new TextEncoder().encode(message));
}

// ── PKCE (RFC 7636) for the Google authorization-code flow ────────────────

export function generateCodeVerifier(): string {
  // 32 random bytes -> 43-char base64url string, well within the 43-128
  // char range PKCE requires.
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function codeChallengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function generateState(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}

// ── login throttling (simple, D1-backed, per-email) ───────────────────────

export const LOGIN_ATTEMPT_LIMIT = 5;
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export interface ThrottleRow {
  attempts: number;
  window_start: number;
}

/**
 * Returns true if a login attempt for this email is currently allowed.
 * Callers should still record the outcome via recordLoginFailure /
 * resetLoginThrottle. Split into "check" and "record" so a caller can check
 * before spending the PBKDF2 cost of verifying a password.
 *
 * Limitation (documented, not fixed here): this is keyed purely by email,
 * with no IP dimension, so it can't stop a distributed attacker spreading
 * attempts across many accounts, and rows for probed-but-nonexistent emails
 * accumulate forever (no cleanup sweep). It raises the cost of hammering a
 * single known account, which is the threat this PR targets.
 */
export function isThrottled(row: ThrottleRow | null, now: number): boolean {
  if (!row) return false;
  if (now - row.window_start > LOGIN_ATTEMPT_WINDOW_MS) return false; // window expired, treat as fresh
  return row.attempts >= LOGIN_ATTEMPT_LIMIT;
}
