// Client for the account/session backend (see worker/src/index.ts's /auth/*
// routes, PR 3a). Mirrors leaderboard.ts's philosophy: every function is a
// safe no-op when AUTH_API is empty, and a flaky network never breaks the
// game — this client never throws on a normal 401/409/429, it returns a
// typed result the UI can turn into a friendly Hebrew message.
//
// Offline-first identity: the last signed-in user is cached in localStorage so
// the app can start (and stay playable) instantly, with no network — a
// mandatory-login game that dies the moment you lose signal would undo the
// whole point of the game being client-side. A cached user is trusted
// immediately; fetchMe() then reconciles with the server in the background.
// The cache is cleared ONLY on a definitive 401 (the server has explicitly
// said "no valid session") — never on a network error, a 5xx, or a timeout.

import { AUTH_API } from '../config';

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
}

export type AuthErrorCode =
  | 'bad-email'
  | 'bad-password'
  | 'email-taken'
  | 'invalid-credentials'
  | 'too-many-attempts'
  | 'network'
  | 'unknown';

export type AuthResult = { ok: true; user: AuthUser } | { ok: false; error: AuthErrorCode };

const CACHE_KEY = 'blorbo.authUser';

/** True when a backend URL is configured — everything else no-ops without one. */
export function hasAuthBackend(): boolean {
  return AUTH_API.trim().length > 0;
}

const BASE = () => AUTH_API.replace(/\/$/, '');

function isAuthUser(v: unknown): v is AuthUser {
  return !!v && typeof v === 'object' && typeof (v as Record<string, unknown>).id === 'string';
}

/** The last signed-in user, read synchronously — lets the app start "signed
 * in" before (or even without) a round-trip to /auth/me. */
export function cachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isAuthUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cacheUser(user: AuthUser): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(user));
  } catch {
    /* best-effort — a full/blocked localStorage just means no offline cache */
  }
}

function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function userFrom(body: Record<string, unknown> | null): AuthUser | null {
  const raw = body?.user;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    email: typeof r.email === 'string' ? r.email : null,
    displayName: typeof r.displayName === 'string' ? r.displayName : null,
  };
}

/** Map a JSON error body's `error` code (or a bare HTTP status) to one of ours. */
function errorFrom(status: number, body: Record<string, unknown> | null): AuthErrorCode {
  const code = typeof body?.error === 'string' ? body.error : '';
  if (code === 'bad-email' || code === 'bad-password' || code === 'email-taken' || code === 'invalid-credentials') {
    return code;
  }
  if (status === 429 || code === 'too-many-attempts') return 'too-many-attempts';
  if (status === 401) return 'invalid-credentials';
  if (status === 409) return 'email-taken';
  return 'unknown';
}

async function readJsonBody(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await res.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function post(path: string, body: unknown): Promise<AuthResult> {
  if (!hasAuthBackend()) return { ok: false, error: 'network' };
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method: 'POST',
      credentials: 'include', // required — without it the session cookie never round-trips
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await readJsonBody(res);
    if (!res.ok) return { ok: false, error: errorFrom(res.status, data) };
    const user = userFrom(data);
    if (!user) return { ok: false, error: 'unknown' };
    cacheUser(user);
    return { ok: true, user };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export function register(input: { email: string; password: string; displayName?: string }): Promise<AuthResult> {
  return post('/auth/register', input);
}

export function login(input: { email: string; password: string }): Promise<AuthResult> {
  return post('/auth/login', input);
}

/**
 * Sign out. The local cache is cleared unconditionally and immediately (so the
 * UI reflects it right away even offline); the server call is best-effort —
 * its failure doesn't matter, the cookie will simply expire on its own TTL.
 */
export async function logout(): Promise<void> {
  clearCache();
  if (!hasAuthBackend()) return;
  try {
    await fetch(`${BASE()}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    /* best-effort — cache is already cleared */
  }
}

/**
 * Reconcile with the server. On success, refreshes (and returns) the cached
 * user. On a DEFINITIVE 401 (the server has spoken: no valid session), clears
 * the cache and returns null. On anything else — network failure, a 5xx, a
 * malformed body — the cache is left untouched and the last-known user is
 * returned, so a flaky connection can never sign a player out.
 */
export async function fetchMe(): Promise<AuthUser | null> {
  if (!hasAuthBackend()) return null;
  try {
    const res = await fetch(`${BASE()}/auth/me`, { credentials: 'include' });
    if (res.status === 401) {
      clearCache();
      return null;
    }
    if (!res.ok) return cachedUser(); // ambiguous failure (5xx etc) — trust the cache
    const user = userFrom(await readJsonBody(res));
    if (!user) return cachedUser();
    cacheUser(user);
    return user;
  } catch {
    return cachedUser(); // network failure — never sign the player out for this
  }
}

/** Where the "Sign in with Google" button should link. */
export function googleSignInUrl(): string {
  return `${BASE()}/auth/google/start`;
}
