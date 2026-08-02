// Unit tests for worker/src/auth.ts — the crypto + session primitives behind
// PR 3a (identity only). Run via the root `npm test` (vitest picks up
// worker/test/**/*.test.ts — see vite.config.ts).
//
// PBKDF2 iteration count: production uses DEFAULT_PBKDF2_ITERATIONS (100k+,
// see the acceptance criteria in CLAUDE.md/the PR brief). Tests that hash
// many passwords pass a much smaller iteration count *as a parameter* to
// keep the suite fast — the format/verify logic is identical regardless of
// count, and format/self-description tests below assert the real default
// still round-trips correctly at least once.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PBKDF2_ITERATIONS,
  DEFAULT_SESSION_TTL_DAYS,
  DUMMY_PASSWORD_HASH,
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_ATTEMPT_WINDOW_MS,
  base64UrlToBytes,
  buildClearCookie,
  buildCookie,
  bytesToBase64Url,
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
  timingSafeEqual,
  verifyPassword,
} from '../src/auth';

// A small-but-still-real iteration count for fast tests. Never used to
// assert anything about the *production* cost — see the DEFAULT_PBKDF2_ITERATIONS
// test below for that.
const FAST_ITERATIONS = 100;

describe('password hashing (PBKDF2-HMAC-SHA256)', () => {
  it('round-trips: verifyPassword accepts the password it was hashed with', async () => {
    const hash = await hashPassword('correct horse battery staple', FAST_ITERATIONS);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple', FAST_ITERATIONS);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('is case-sensitive and whitespace-sensitive', async () => {
    const hash = await hashPassword('Password123', FAST_ITERATIONS);
    expect(await verifyPassword('password123', hash)).toBe(false);
    expect(await verifyPassword('Password123 ', hash)).toBe(false);
  });

  it('produces a self-describing string: pbkdf2$sha256$<iterations>$<salt>$<hash>', async () => {
    const hash = await hashPassword('hunter2', FAST_ITERATIONS);
    const parts = hash.split('$');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('pbkdf2');
    expect(parts[1]).toBe('sha256');
    expect(Number(parts[2])).toBe(FAST_ITERATIONS);
    expect(parts[3].length).toBeGreaterThan(0); // salt, base64
    expect(parts[4].length).toBeGreaterThan(0); // derived key, base64
  });

  it('salts: hashing the same password twice yields two different hashes', async () => {
    const a = await hashPassword('same-password', FAST_ITERATIONS);
    const b = await hashPassword('same-password', FAST_ITERATIONS);
    expect(a).not.toBe(b);
    // ...but both still verify.
    expect(await verifyPassword('same-password', a)).toBe(true);
    expect(await verifyPassword('same-password', b)).toBe(true);
  });

  it('an old hash with a different (e.g. lower) iteration count still verifies — the count travels with the hash', async () => {
    const oldHash = await hashPassword('legacy-password', 50);
    const newHash = await hashPassword('legacy-password', 500);
    expect(await verifyPassword('legacy-password', oldHash)).toBe(true);
    expect(await verifyPassword('legacy-password', newHash)).toBe(true);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-real-hash')).toBe(false);
    expect(await verifyPassword('anything', 'pbkdf2$sha256$notanumber$aGk=$aGk=')).toBe(false);
    expect(await verifyPassword('anything', 'bcrypt$10$foo$bar')).toBe(false);
  });

  it('DEFAULT_PBKDF2_ITERATIONS meets the ≥100,000 floor the brief requires', () => {
    expect(DEFAULT_PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100_000);
  });

  it('the real default iteration count still produces a verifiable hash (paid once, not in a loop)', async () => {
    const hash = await hashPassword('slow-but-real');
    expect(hash.split('$')[2]).toBe(String(DEFAULT_PBKDF2_ITERATIONS));
    expect(await verifyPassword('slow-but-real', hash)).toBe(true);
  }, 20_000);

  it('DUMMY_PASSWORD_HASH is itself well-formed (used to equalize login timing)', async () => {
    expect(await verifyPassword('literally anything', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});

describe('timingSafeEqual', () => {
  it('returns true for identical byte arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(timingSafeEqual(a, b)).toBe(true);
  });

  it('returns false when any byte differs', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 5]);
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
  });

  it('treats two empty arrays as equal', () => {
    expect(timingSafeEqual(new Uint8Array([]), new Uint8Array([]))).toBe(true);
  });
});

describe('session tokens', () => {
  it('generates 32 random bytes worth of base64url (43 chars, no padding)', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(base64UrlToBytes(token)).toHaveLength(32);
  });

  it('generates different tokens each call', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
    expect(tokens.size).toBe(50);
  });

  it('hashes a token deterministically (same input -> same hash)', async () => {
    const token = generateSessionToken();
    expect(await hashSessionToken(token)).toBe(await hashSessionToken(token));
  });

  it('different tokens hash to different values', async () => {
    const a = await hashSessionToken(generateSessionToken());
    const b = await hashSessionToken(generateSessionToken());
    expect(a).not.toBe(b);
  });

  it('the hash is not the raw token (never store the raw token)', async () => {
    const token = generateSessionToken();
    expect(await hashSessionToken(token)).not.toBe(token);
  });
});

describe('session expiry', () => {
  it('sessionExpiresAt adds the TTL in ms', () => {
    const now = 1_000_000;
    expect(sessionExpiresAt(now, 1)).toBe(now + 24 * 60 * 60 * 1000);
  });

  it('defaults to DEFAULT_SESSION_TTL_DAYS (30) when no ttl given', () => {
    const now = 0;
    expect(sessionExpiresAt(now)).toBe(DEFAULT_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  });

  it('isSessionExpired: false while expires is in the future', () => {
    expect(isSessionExpired(Date.now() + 60_000)).toBe(false);
  });

  it('isSessionExpired: true once expires has passed', () => {
    expect(isSessionExpired(Date.now() - 1)).toBe(true);
  });

  it('isSessionExpired: true exactly at the boundary (now >= expires)', () => {
    expect(isSessionExpired(1000, 1000)).toBe(true);
  });
});

describe('cookies', () => {
  it('builds a session cookie with the required attributes', () => {
    const cookie = buildCookie({ name: 'blorbo_session', value: 'tok123', maxAgeSeconds: 3600 });
    expect(cookie).toContain('blorbo_session=tok123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=3600');
  });

  it('includes Domain only when one is supplied', () => {
    const withDomain = buildCookie({ name: 'x', value: 'y', maxAgeSeconds: 1, domain: '.bl-or-bo.com' });
    const withoutDomain = buildCookie({ name: 'x', value: 'y', maxAgeSeconds: 1 });
    expect(withDomain).toContain('Domain=.bl-or-bo.com');
    expect(withoutDomain).not.toContain('Domain=');
  });

  it('buildClearCookie sets Max-Age=0', () => {
    expect(buildClearCookie('blorbo_session')).toContain('Max-Age=0');
  });

  it('parseCookies reads back a single cookie', () => {
    expect(parseCookies('blorbo_session=abc123')).toEqual({ blorbo_session: 'abc123' });
  });

  it('parseCookies reads back multiple cookies with spacing like a real header', () => {
    expect(parseCookies('a=1; b=2;c=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('parseCookies handles an empty/missing header', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });

  it('round-trips build -> parse for the session cookie value', () => {
    const token = generateSessionToken();
    const setCookie = buildCookie({ name: 'blorbo_session', value: token, maxAgeSeconds: 60 });
    // Set-Cookie has attributes after the first `; ` — a request Cookie
    // header only ever sends `name=value` pairs, so slice like a browser would.
    const nameValue = setCookie.split(';')[0];
    expect(parseCookies(nameValue)).toEqual({ blorbo_session: token });
  });

  it('cookieDomainFor: apex and subdomains of bl-or-bo.com get the shared domain', () => {
    expect(cookieDomainFor('bl-or-bo.com')).toBe('.bl-or-bo.com');
    expect(cookieDomainFor('api.bl-or-bo.com')).toBe('.bl-or-bo.com');
  });

  it('cookieDomainFor: unrelated hosts (dev, workers.dev) get a host-only cookie', () => {
    expect(cookieDomainFor('localhost')).toBeUndefined();
    expect(cookieDomainFor('blorbo-leaderboard.example.workers.dev')).toBeUndefined();
    expect(cookieDomainFor('evil-bl-or-bo.com')).toBeUndefined(); // NOT a suffix match trap
  });
});

describe('HMAC signing (OAuth state)', () => {
  it('a signature verifies against the same secret and message', async () => {
    const sig = await hmacSign('secret-key', 'hello');
    expect(await hmacVerify('secret-key', 'hello', sig)).toBe(true);
  });

  it('fails verification if the message was tampered with', async () => {
    const sig = await hmacSign('secret-key', 'hello');
    expect(await hmacVerify('secret-key', 'goodbye', sig)).toBe(false);
  });

  it('fails verification with the wrong secret', async () => {
    const sig = await hmacSign('secret-key', 'hello');
    expect(await hmacVerify('wrong-key', 'hello', sig)).toBe(false);
  });

  it('rejects a garbage signature instead of throwing', async () => {
    expect(await hmacVerify('secret-key', 'hello', '!!!not-base64url!!!')).toBe(false);
  });
});

describe('PKCE', () => {
  it('generates a verifier in the valid RFC 7636 length range (43-128 chars)', () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('derives the same challenge from the same verifier (deterministic)', async () => {
    const v = generateCodeVerifier();
    expect(await codeChallengeFromVerifier(v)).toBe(await codeChallengeFromVerifier(v));
  });

  it('different verifiers produce different challenges', async () => {
    const a = await codeChallengeFromVerifier(generateCodeVerifier());
    const b = await codeChallengeFromVerifier(generateCodeVerifier());
    expect(a).not.toBe(b);
  });

  it('generateState produces url-safe, sufficiently random strings', () => {
    const states = new Set(Array.from({ length: 50 }, () => generateState()));
    expect(states.size).toBe(50);
    for (const s of states) expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('login throttling (isThrottled)', () => {
  it('allows a login attempt when there is no prior row', () => {
    expect(isThrottled(null, Date.now())).toBe(false);
  });

  it('allows attempts under the limit', () => {
    const row = { attempts: LOGIN_ATTEMPT_LIMIT - 1, window_start: Date.now() };
    expect(isThrottled(row, Date.now())).toBe(false);
  });

  it('blocks once attempts reach the limit within the window', () => {
    const now = Date.now();
    const row = { attempts: LOGIN_ATTEMPT_LIMIT, window_start: now };
    expect(isThrottled(row, now)).toBe(true);
  });

  it('resets once the window has elapsed, even with many prior attempts', () => {
    const windowStart = 0;
    const now = windowStart + LOGIN_ATTEMPT_WINDOW_MS + 1;
    const row = { attempts: LOGIN_ATTEMPT_LIMIT * 10, window_start: windowStart };
    expect(isThrottled(row, now)).toBe(false);
  });

  it('is still blocked one ms before the window boundary', () => {
    const windowStart = 0;
    const now = windowStart + LOGIN_ATTEMPT_WINDOW_MS; // exactly at the edge, not past it
    const row = { attempts: LOGIN_ATTEMPT_LIMIT, window_start: windowStart };
    expect(isThrottled(row, now)).toBe(true);
  });
});

describe('base64url helpers', () => {
  it('round-trips arbitrary bytes through bytesToBase64Url / base64UrlToBytes', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(40));
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
  });

  it('produces no padding and no +/ characters (URL/cookie safe)', () => {
    const bytes = new Uint8Array([255, 254, 253, 252, 251]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });
});
