// Client for the global leaderboard Worker (see /worker). Every function is a
// safe no-op when LEADERBOARD_API is empty, so the app works identically with
// or without a backend.
//
// Two ranked metrics: 'clicks' (physical taps) and 'goo' (total goo earned).
//
// Privacy: the only identifier we keep is a random per-device "recovery code"
// in localStorage. It's a secret sent on writes so the same device updates its
// own row; it is never shown and never returned by the server. No PII, ever.

import { LEADERBOARD_API } from '../config';

export type Metric = 'clicks' | 'goo' | 'cpm';

export interface GlobalEntry {
  name: string;
  score: number; // the value of the requested metric
}

export interface MetricRank {
  rank: number; // 1-based position in that metric's table
  best: number; // the player's best value for that metric
}

export interface SubmitResult {
  total: number; // how many players are on the table
  clicks: MetricRank;
  goo: MetricRank; // goo HELD right now, not lifetime — the board shows current wealth
  cpm: MetricRank; // record manual taps in a rolling minute
}

/** True when a backend URL is configured — i.e. the leaderboard is global. */
export function hasGlobalLeaderboard(): boolean {
  return LEADERBOARD_API.trim().length > 0;
}

const BASE = () => LEADERBOARD_API.replace(/\/$/, '');
const CODE_KEY = 'blorbo.playerCode';
const NAME_KEY = 'blorbo.playerName';
const ASKED_KEY = 'blorbo.nicknameAsked';

function randomCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const buf = new Uint32Array(24);
  (globalThis.crypto ?? ({} as Crypto)).getRandomValues?.(buf);
  for (let i = 0; i < 24; i++) {
    const n = buf[i] || Math.floor(Math.random() * 4294967296);
    out += alphabet[n % alphabet.length];
  }
  return out;
}

/** The stable per-device recovery code, generated once and reused. */
export function playerCode(): string {
  try {
    let code = localStorage.getItem(CODE_KEY);
    if (!code || !/^[A-Za-z0-9]{6,40}$/.test(code)) {
      code = randomCode();
      localStorage.setItem(CODE_KEY, code);
    }
    return code;
  } catch {
    return randomCode();
  }
}

/** The nickname the player chose (persisted across sessions). */
export function playerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

/** Whether to show the first-launch "pick a nickname" prompt. */
export function shouldPromptNickname(): boolean {
  if (!hasGlobalLeaderboard() || playerName()) return false;
  try {
    return !localStorage.getItem(ASKED_KEY);
  } catch {
    return true;
  }
}

export function markNicknameAsked(): void {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Full reset for "new game": drop the nickname, the recovery code (so the new
 * name becomes a brand-new leaderboard entry), and the asked flag (so the
 * welcome prompt reappears to collect a fresh name). */
export function resetPlayerIdentity(): void {
  try {
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(CODE_KEY);
    localStorage.removeItem(ASKED_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Submit the player's current scores under their nickname. Returns rank info
 * for BOTH metrics on success, or null when there's no backend / the request
 * failed (the caller just carries on — nothing breaks).
 */
/**
 * Claim/refresh this account's leaderboard row.
 *
 * Note what is NOT sent: the scores. The server reads them from this account's
 * own stored save. They used to come from here, which meant the board could be
 * written by anyone willing to POST a number — the arguments are kept in the
 * signature only so existing callers don't have to change, and are ignored.
 */
export async function submitScore(name: string, _clicks?: number, _goo?: number): Promise<SubmitResult | null> {
  if (!hasGlobalLeaderboard()) return null;
  const clean = name.trim();
  if (!clean) return null;
  savePlayerName(clean);
  try {
    const res = await fetch(`${BASE()}/submit`, {
      method: 'POST',
      credentials: 'include', // the row is keyed to the signed-in account now
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: clean }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SubmitResult> & { ok?: boolean };
    if (!data.clicks || !data.goo) return null;
    // A server deployed before the cpm board answers without the field —
    // degrade to rank 0 rather than failing the whole submit.
    return { total: data.total ?? 0, clicks: data.clicks, goo: data.goo, cpm: data.cpm ?? { best: 0, rank: 0 } };
  } catch {
    return null;
  }
}

/** The global top-N for a metric, or null on no-backend/failure. */
export async function fetchTop(by: Metric, limit = 50): Promise<GlobalEntry[] | null> {
  if (!hasGlobalLeaderboard()) return null;
  try {
    const res = await fetch(`${BASE()}/top?by=${by}&limit=${encodeURIComponent(limit)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { entries?: unknown };
    if (!Array.isArray(data.entries)) return null;
    return data.entries
      .map((e) => e as Record<string, unknown>)
      .filter((e) => typeof e.name === 'string' && typeof e.score === 'number')
      .map((e) => ({ name: e.name as string, score: e.score as number }));
  } catch {
    return null;
  }
}

