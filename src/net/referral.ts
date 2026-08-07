// Referral client — the share link, capturing an incoming ?ref, claiming it
// after sign-in, and reading how many friends have joined. Every function is a
// safe no-op / null when there's no backend, and a flaky network never throws.
//
// The share token is captured into localStorage at boot and claimed only AFTER
// a session exists, because the Google OAuth round-trip drops all query params —
// localStorage (same origin across the redirect) is what carries it through.

import { AUTH_API } from '../config';

const BASE = () => AUTH_API.replace(/\/$/, '');
const PENDING_KEY = 'blorbo.pendingRef';
const REF_RE = /^[A-Za-z0-9]{4,40}$/;

export function hasReferralBackend(): boolean {
  return AUTH_API.trim().length > 0;
}

/**
 * At boot: if the URL carries ?ref=CODE, stash it and strip it from the address
 * bar (so it doesn't linger or get re-shared). Call BEFORE sign-in — the code is
 * claimed later, once there's a session.
 */
export function capturePendingRef(): void {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && REF_RE.test(ref)) localStorage.setItem(PENDING_KEY, ref);
    if (params.has('ref')) {
      params.delete('ref');
      const q = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash);
    }
  } catch {
    /* ignore — no query, blocked storage, etc. */
  }
}

export function pendingRef(): string | null {
  try {
    const r = localStorage.getItem(PENDING_KEY);
    return r && REF_RE.test(r) ? r : null;
  } catch {
    return null;
  }
}

export function clearPendingRef(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export interface ReferralInfo {
  code: string | null; // this player's own share code
  count: number; // friends who have joined AND started playing
}

/** GET /referral/me — this player's share code + qualified-friend count. */
export async function fetchReferralMe(): Promise<ReferralInfo | null> {
  if (!hasReferralBackend()) return null;
  try {
    const res = await fetch(`${BASE()}/referral/me`, { credentials: 'include' });
    if (!res.ok) return null;
    const d = (await res.json()) as { code?: unknown; count?: unknown };
    return {
      code: typeof d.code === 'string' ? d.code : null,
      count: typeof d.count === 'number' ? d.count : 0,
    };
  } catch {
    return null;
  }
}

/** POST /referral/claim — bind this account to the referrer behind `ref`. */
export async function claimReferral(ref: string): Promise<boolean> {
  if (!hasReferralBackend() || !REF_RE.test(ref)) return false;
  try {
    const res = await fetch(`${BASE()}/referral/claim`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    });
    if (!res.ok) return false;
    const d = (await res.json()) as { ok?: unknown };
    return d.ok === true;
  } catch {
    return false;
  }
}

/** The link a player sends to friends. */
export function referralLink(code: string): string {
  return `https://bl-or-bo.com/?ref=${encodeURIComponent(code)}`;
}
