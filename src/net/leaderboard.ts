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

export type Metric = 'clicks' | 'goo';

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
  goo: MetricRank;
}

export interface RankInfo {
  rank: number;
  score: number;
  total: number;
  name?: string;
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
export async function submitScore(name: string, clicks: number, goo: number): Promise<SubmitResult | null> {
  if (!hasGlobalLeaderboard()) return null;
  const clean = name.trim();
  if (!clean) return null;
  savePlayerName(clean);
  try {
    const res = await fetch(`${BASE()}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: playerCode(), name: clean, clicks: Math.floor(clicks), goo }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SubmitResult> & { ok?: boolean };
    if (!data.clicks || !data.goo) return null;
    return { total: data.total ?? 0, clicks: data.clicks, goo: data.goo };
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

/** The player's own rank in a metric (works even far below the top N). */
export async function fetchRank(by: Metric): Promise<RankInfo | null> {
  if (!hasGlobalLeaderboard()) return null;
  try {
    const res = await fetch(`${BASE()}/rank?by=${by}&code=${encodeURIComponent(playerCode())}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { rank?: number | null; score?: number; total?: number; name?: string };
    if (typeof data.rank !== 'number') return null; // not on the table yet
    return { rank: data.rank, score: data.score ?? 0, total: data.total ?? 0, name: data.name };
  } catch {
    return null;
  }
}
