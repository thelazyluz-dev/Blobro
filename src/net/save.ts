// Client for the cloud-save backend (see worker/src/index.ts's /save routes,
// PR 4). Mirrors net/auth.ts's philosophy: every function is a safe no-op
// when AUTH_API is empty, and this client NEVER throws — a flaky network is a
// normal, expected state for a kid playing on a phone, not an error to
// surface. Callers get a plain result they can act on; the store layer
// decides what "no cloud answer" means for the game.

import { AUTH_API } from '../config';
import type { SaveState } from '../game/types';

/** A save as it comes off the wire — `save` is `unknown` on purpose, the
 * caller must run it through game/save.ts's migrate() before trusting it. */
export interface CloudSave {
  rev: number;
  updated: number;
  save: unknown;
}

export type PushResult =
  | { ok: true; rev: number; updated: number }
  | { ok: false; conflict: { rev: number; updated: number; save: unknown } }
  | { ok: false; conflict: null };

/** True when a backend URL is configured — everything else no-ops without one. */
function hasAuthBackend(): boolean {
  return AUTH_API.trim().length > 0;
}

const BASE = () => AUTH_API.replace(/\/$/, '');

async function readJsonBody(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await res.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isRevBody(body: Record<string, unknown> | null): body is Record<string, unknown> & { rev: number; updated: number } {
  return !!body && typeof body.rev === 'number' && typeof body.updated === 'number';
}

/**
 * Fetch the player's cloud save. Returns null on a 401, on a network
 * failure, or when no backend is configured — the caller cannot (and must
 * not need to) tell those apart; every case just means "proceed local-only".
 * A `{rev: 0, save: null}` 200 (nothing in the cloud yet) is returned as-is
 * so the caller still learns rev 0, which is the right baseRev for a first push.
 */
export async function fetchCloudSave(): Promise<CloudSave | null> {
  if (!hasAuthBackend()) return null;
  try {
    const res = await fetch(`${BASE()}/save`, { credentials: 'include' });
    if (!res.ok) return null; // 401 (or any other non-2xx) — proceed local-only
    const body = await readJsonBody(res);
    if (!isRevBody(body)) return null;
    return { rev: body.rev, updated: body.updated, save: body.save ?? null };
  } catch {
    return null; // offline play is a supported mode, not an error
  }
}

/**
 * Push the save at `baseRev`. A 409 means another device/tab wrote since
 * baseRev — its body carries the CURRENT cloud save so the caller can re-run
 * the merge rule and retry once. Anything else that isn't a clean 200
 * collapses to {ok:false, conflict:null}: best-effort, never throws, leaves
 * the save dirty to retry at the next checkpoint.
 *
 * `keepalive` lets this fetch survive a page/tab teardown — this is the call
 * made from a `pagehide` handler (see store.ts), the one meant to catch a
 * kid closing the tab mid-session.
 *
 * `opts.rollback` marks a push that deliberately lowers progress, because the
 * player restored their other save. Without it the audit records a plain
 * "lifetime goo went down", which is its strongest cheat signal — so using a
 * button the game itself offers would look exactly like editing a save.
 *
 * `opts.merge` marks the one push that follows adopting a bigger save from
 * another device / pre-auth progress (see decideMergeWinner). That lands as a
 * single huge lifetimeGoo jump which reads as an impossible per-second rate;
 * the flag tells the server this is a legitimate history transfer, so an honest
 * multi-device player isn't benched. Recorded alongside the rate flag, never in
 * place of it — the value is still bounded by MAX_GOO.
 */
export async function pushCloudSave(
  baseRev: number,
  save: SaveState,
  opts: { rollback?: boolean; merge?: boolean } = {},
): Promise<PushResult> {
  if (!hasAuthBackend()) return { ok: false, conflict: null };
  try {
    const res = await fetch(`${BASE()}/save`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRev,
        save,
        ...(opts.rollback ? { rollback: true } : {}),
        ...(opts.merge ? { merge: true } : {}),
      }),
      keepalive: true,
    });
    if (res.status === 409) {
      const body = await readJsonBody(res);
      if (!isRevBody(body)) return { ok: false, conflict: null };
      return { ok: false, conflict: { rev: body.rev, updated: body.updated, save: body.save ?? null } };
    }
    if (!res.ok) return { ok: false, conflict: null };
    const body = await readJsonBody(res);
    if (!isRevBody(body)) return { ok: false, conflict: null };
    return { ok: true, rev: body.rev, updated: body.updated };
  } catch {
    return { ok: false, conflict: null };
  }
}

export type MergeWinner = 'local' | 'cloud' | 'default';

export interface MergeOutcome {
  winner: MergeWinner;
  /** The cloud revision the next push should use as baseRev. */
  cloudRev: number;
}

/**
 * The cloud-save merge rule (PR 4's one business-critical decision — see
 * CLAUDE.md "never drop a player's progress"). Picks a winner by
 * `lifetimeGoo`: it only ever grows within a save (spending goo doesn't
 * lower it), so it's an honest, un-gameable measure of "how much has this
 * player actually done" — unlike `goo`, which a shopping spree can shrink.
 *
 * Local wins ties (no network round trip should ever cost you progress you
 * already have on the device you're holding). If there's no local save at
 * all, the cloud is adopted unconditionally — that's the whole point of
 * signing in on a new device.
 *
 * Pure and side-effect free on purpose: the caller (store.ts) does the I/O
 * (loadRaw/migrate/backupLocal) and just asks this function who won.
 */
export function decideMergeWinner(
  local: SaveState | null,
  cloud: { rev: number; save: SaveState } | null,
): MergeOutcome {
  if (!local && !cloud) return { winner: 'default', cloudRev: 0 };
  if (!local) return { winner: 'cloud', cloudRev: cloud!.rev };
  if (!cloud) return { winner: 'local', cloudRev: 0 };
  if (cloud.save.lifetimeGoo > local.lifetimeGoo) return { winner: 'cloud', cloudRev: cloud.rev };
  return { winner: 'local', cloudRev: cloud.rev };
}
