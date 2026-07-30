// Client for the global leaderboard Worker (see /worker). Every function is a
// safe no-op when LEADERBOARD_API is empty, so the app works identically with
// or without a backend — the UI just falls back to the on-device list.
//
// Privacy: the only identifier we keep is a random per-device "recovery code"
// in localStorage. It's a secret sent on writes so the same device updates its
// own row; it is never shown and never returned by the server. No PII, ever.

import { LEADERBOARD_API } from '../config';

export interface GlobalEntry {
  name: string;
  score: number;
}

/** True when a backend URL is configured — i.e. the leaderboard is global. */
export function hasGlobalLeaderboard(): boolean {
  return LEADERBOARD_API.trim().length > 0;
}

const CODE_KEY = 'blorbo.playerCode';
const NAME_KEY = 'blorbo.playerName';

function randomCode(): string {
  // 24 alnum chars — plenty of entropy, matches the server's /^[A-Za-z0-9]{6,40}$/.
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
    // Private mode / storage blocked — fall back to an ephemeral code.
    return randomCode();
  }
}

/** The nickname the player last saved (persisted across sessions). */
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

/**
 * Submit the player's best score under a nickname. Returns the server's kept
 * best on success, or null when there's no backend or the request failed
 * (the caller then just relies on the local list — nothing breaks).
 */
export async function submitScore(name: string, score: number): Promise<number | null> {
  if (!hasGlobalLeaderboard()) return null;
  const clean = name.trim();
  if (!clean) return null;
  savePlayerName(clean);
  try {
    const res = await fetch(`${LEADERBOARD_API.replace(/\/$/, '')}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: playerCode(), name: clean, score: Math.floor(score) }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; best?: number };
    return typeof data.best === 'number' ? data.best : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the global top-N. Returns null when there's no backend or the request
 * failed, so the UI can fall back to the on-device list gracefully.
 */
export async function fetchTop(limit = 50): Promise<GlobalEntry[] | null> {
  if (!hasGlobalLeaderboard()) return null;
  try {
    const res = await fetch(`${LEADERBOARD_API.replace(/\/$/, '')}/top?limit=${encodeURIComponent(limit)}`);
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
