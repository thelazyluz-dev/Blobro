// Groups client — friend/family/class groups with a private board. Mirrors
// net/referral.ts: capture an incoming ?group=CODE at boot, join it after
// sign-in, and thin fetch wrappers that never throw — a flaky network returns
// null and the UI degrades, exactly like the referral and leaderboard clients.
//
// The invite code is captured into localStorage at boot and joined only AFTER
// a session exists, because the Google OAuth round-trip drops all query params —
// localStorage (same origin across the redirect) is what carries it through.

import { AUTH_API } from '../config';
import { isCleanNickname } from '../game/profanity';

const BASE = () => AUTH_API.replace(/\/$/, '');
const PENDING_KEY = 'blorbo.pendingGroup';
const CODE_RE = /^[A-Za-z0-9]{4,40}$/;

/** Group-name limits, enforced client-side before any request goes out. */
export const groupNameMinLen = 2;
export const groupNameMaxLen = 24;

export function hasGroupsBackend(): boolean {
  return AUTH_API.trim().length > 0;
}

/**
 * At boot: if the URL carries ?group=CODE, stash it and strip ONLY that param
 * from the address bar (a link can carry ?ref= too — the group link doubles as
 * a referral link, and capturePendingRef owns stripping that one). Call BEFORE
 * sign-in — the group is joined later, once there's a session.
 */
export function capturePendingGroup(): void {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('group');
    if (code && CODE_RE.test(code)) localStorage.setItem(PENDING_KEY, code);
    if (params.has('group')) {
      params.delete('group');
      const q = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash);
    }
  } catch {
    /* ignore — no query, blocked storage, etc. */
  }
}

export function pendingGroup(): string | null {
  try {
    const c = localStorage.getItem(PENDING_KEY);
    return c && CODE_RE.test(c) ? c : null;
  } catch {
    return null;
  }
}

export function clearPendingGroup(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** A group id as the server minted it — passed back verbatim on leave/board. */
export type GroupId = string | number;

/** The errors the server names. Distinct so the UI can say WHY in Hebrew. */
export type GroupError = 'bad-name' | 'too-many-groups' | 'not-found' | 'full';

export interface GroupInfo {
  id: GroupId;
  name: string;
  code: string; // the invite code — shown to the owner for verbal sharing
  members: number;
}

export type GroupMetric = 'clicks' | 'goo' | 'cpm';

export interface GroupBoardEntry {
  name: string;
  score: number;
  me: boolean; // the server marks my own row — no nickname matching needed
}

export interface GroupBoard {
  id: GroupId;
  name: string;
  by: GroupMetric;
  entries: GroupBoardEntry[]; // already sorted desc by the server
}

function isGroupId(v: unknown): v is GroupId {
  return typeof v === 'string' || typeof v === 'number';
}

/** Read {error} out of a non-ok response body; null when it isn't one we know. */
async function namedError(res: Response): Promise<GroupError | null> {
  try {
    const d = (await res.json()) as { error?: unknown };
    return d.error === 'bad-name' || d.error === 'too-many-groups' || d.error === 'not-found' || d.error === 'full'
      ? d.error
      : null;
  } catch {
    return null;
  }
}

/**
 * POST /group/create. Returns the new group, {error} for a named refusal
 * (bad name, already in 10 groups), or null on a network/unknown failure.
 * Name limits are enforced HERE too, so no caller can skip them.
 */
export async function createGroup(name: string): Promise<{ id: GroupId; code: string; name: string } | { error: GroupError } | null> {
  if (!hasGroupsBackend()) return null;
  const clean = name.trim();
  if (clean.length < groupNameMinLen || clean.length > groupNameMaxLen || !isCleanNickname(clean)) {
    return { error: 'bad-name' };
  }
  try {
    const res = await fetch(`${BASE()}/group/create`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: clean }),
    });
    if (!res.ok) {
      const err = await namedError(res);
      return err ? { error: err } : null;
    }
    const d = (await res.json()) as { ok?: unknown; id?: unknown; code?: unknown; name?: unknown };
    if (d.ok !== true || !isGroupId(d.id) || typeof d.code !== 'string' || typeof d.name !== 'string') return null;
    return { id: d.id, code: d.code, name: d.name };
  } catch {
    return null;
  }
}

/**
 * POST /group/join. {error} keeps 'not-found' / 'full' / 'too-many-groups'
 * distinct — each gets its own friendly message — while null stays "network
 * blinked, worth retrying" (the auto-join flow leans on that distinction).
 */
export async function joinGroup(code: string): Promise<{ id: GroupId; name: string; already: boolean } | { error: GroupError } | null> {
  if (!hasGroupsBackend() || !CODE_RE.test(code)) return null;
  try {
    const res = await fetch(`${BASE()}/group/join`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const err = await namedError(res);
      return err ? { error: err } : null;
    }
    const d = (await res.json()) as { ok?: unknown; id?: unknown; name?: unknown; already?: unknown };
    if (d.ok !== true || !isGroupId(d.id) || typeof d.name !== 'string') return null;
    return { id: d.id, name: d.name, already: d.already === true };
  } catch {
    return null;
  }
}

/** POST /group/leave — true only when the server confirmed. */
export async function leaveGroup(id: GroupId): Promise<boolean> {
  if (!hasGroupsBackend()) return false;
  try {
    const res = await fetch(`${BASE()}/group/leave`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return false;
    const d = (await res.json()) as { ok?: unknown };
    return d.ok === true;
  } catch {
    return false;
  }
}

/** GET /group/mine — every group I'm a member of. */
export async function fetchMyGroups(): Promise<GroupInfo[] | null> {
  if (!hasGroupsBackend()) return null;
  try {
    const res = await fetch(`${BASE()}/group/mine`, { credentials: 'include' });
    if (!res.ok) return null;
    const d = (await res.json()) as { groups?: unknown };
    if (!Array.isArray(d.groups)) return null;
    const out: GroupInfo[] = [];
    for (const g of d.groups as Array<Record<string, unknown>>) {
      if (!g || !isGroupId(g.id) || typeof g.name !== 'string' || typeof g.code !== 'string') continue;
      out.push({ id: g.id, name: g.name, code: g.code, members: typeof g.members === 'number' ? g.members : 0 });
    }
    return out;
  } catch {
    return null;
  }
}

/** GET /group/board?id&by — one group's private board (members only). */
export async function fetchGroupBoard(id: GroupId, by: GroupMetric): Promise<GroupBoard | null> {
  if (!hasGroupsBackend()) return null;
  try {
    const res = await fetch(`${BASE()}/group/board?id=${encodeURIComponent(String(id))}&by=${by}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { id?: unknown; name?: unknown; by?: unknown; entries?: unknown };
    if (!isGroupId(d.id) || typeof d.name !== 'string' || !Array.isArray(d.entries)) return null;
    const entries: GroupBoardEntry[] = [];
    for (const e of d.entries as Array<Record<string, unknown>>) {
      if (!e || typeof e.name !== 'string' || typeof e.score !== 'number') continue;
      entries.push({ name: e.name, score: e.score, me: e.me === true });
    }
    return { id: d.id, name: d.name, by, entries };
  } catch {
    return null;
  }
}

/**
 * The link a player sends to the group. It carries the sender's referral code
 * too (when they have one) ON PURPOSE: a classmate who joins the group through
 * it also counts toward the inviter's referral tiers — one link, both rewards.
 */
export function groupInviteLink(refCode: string | null, groupCode: string): string {
  const ref = refCode ? `ref=${encodeURIComponent(refCode)}&` : '';
  return `https://bl-or-bo.com/?${ref}group=${encodeURIComponent(groupCode)}`;
}
