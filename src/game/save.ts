// Serialize / migrate save state (§12). Pure — the actual IndexedDB I/O
// lives in src/persistence.ts so this module never touches `window`.

import { collectionOrder } from './characters';
import { maxCharLevel, minCharLevel } from './balance';
import type { CharId, OwnedCharacters, SaveState } from './types';

export const CURRENT_VERSION = 1 as const;

export function defaultSaveState(now: number): SaveState {
  return {
    version: CURRENT_VERSION,
    goo: 0,
    lifetimeGoo: 0,
    fingerLevel: 0,
    characters: {},
    totalHatches: 0,
    sinceRare: 0,
    lastSeen: now,
    muted: false,
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonNegInt(value: unknown, fallback: number): number {
  const n = num(value, fallback);
  return Math.max(0, Math.floor(n));
}

function sanitizeCharacters(raw: unknown): OwnedCharacters {
  const out: OwnedCharacters = {};
  if (!raw || typeof raw !== 'object') return out;
  const valid = new Set<CharId>(collectionOrder);
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!valid.has(key as CharId)) continue;
    const level = (entry as { level?: unknown } | null)?.level;
    const clamped = Math.min(maxCharLevel, Math.max(minCharLevel, nonNegInt(level, minCharLevel)));
    out[key as CharId] = { level: clamped };
  }
  return out;
}

/**
 * Coerce arbitrary persisted data into a valid current-version SaveState.
 * Add version-specific migration steps here as the schema evolves; testers are
 * real kids with real progress, so this must never throw away a save.
 */
export function migrate(raw: unknown, now: number): SaveState {
  if (!raw || typeof raw !== 'object') return defaultSaveState(now);
  const data = raw as Record<string, unknown>;

  // Future: switch on data.version to run step-by-step migrations.

  return {
    version: CURRENT_VERSION,
    goo: Math.max(0, num(data.goo, 0)),
    lifetimeGoo: Math.max(0, num(data.lifetimeGoo, 0)),
    fingerLevel: nonNegInt(data.fingerLevel, 0),
    characters: sanitizeCharacters(data.characters),
    totalHatches: nonNegInt(data.totalHatches, 0),
    sinceRare: nonNegInt(data.sinceRare, 0),
    lastSeen: num(data.lastSeen, now),
    muted: Boolean(data.muted),
  };
}
