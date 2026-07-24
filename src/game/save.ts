// Serialize / migrate save state. Pure — the actual IndexedDB I/O lives in
// src/persistence.ts so this module never touches `window`. Testers are real
// kids with real progress, so migration must never throw a save away.

import { maxCharLevel, minCharLevel } from './balance';
import { collectionOrder } from './characters';
import { achievements } from './achievements';
import { defaultUpgrades } from './upgrades';
import type { CharId, OwnedCharacters, SaveState, UpgradeId, Upgrades } from './types';

export const CURRENT_VERSION = 2 as const;

export function defaultSaveState(now: number): SaveState {
  return {
    version: CURRENT_VERSION,
    goo: 0,
    lifetimeGoo: 0,
    upgrades: { ...defaultUpgrades },
    characters: {},
    totalHatches: 0,
    sinceRare: 0,
    bonusesCollected: 0,
    achievements: [],
    lastSeen: now,
    muted: false,
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonNegInt(value: unknown, fallback: number): number {
  return Math.max(0, Math.floor(num(value, fallback)));
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

function sanitizeUpgrades(raw: unknown, legacyFinger: unknown): Upgrades {
  const out: Upgrades = { ...defaultUpgrades };
  if (raw && typeof raw === 'object') {
    for (const id of Object.keys(out) as UpgradeId[]) {
      out[id] = nonNegInt((raw as Record<string, unknown>)[id], out[id]);
    }
  }
  // v1 stored a single fingerLevel — carry it into the upgrades map.
  const finger = nonNegInt(legacyFinger, 0);
  if (finger > out.finger) out.finger = finger;
  return out;
}

function sanitizeAchievements(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(achievements.map((a) => a.id));
  return raw.filter((id): id is string => typeof id === 'string' && valid.has(id));
}

/**
 * Coerce arbitrary persisted data into a valid current-version SaveState.
 * Handles v1 (single fingerLevel, no upgrades/achievements) → v2.
 */
export function migrate(raw: unknown, now: number): SaveState {
  if (!raw || typeof raw !== 'object') return defaultSaveState(now);
  const data = raw as Record<string, unknown>;

  return {
    version: CURRENT_VERSION,
    goo: Math.max(0, num(data.goo, 0)),
    lifetimeGoo: Math.max(0, num(data.lifetimeGoo, 0)),
    upgrades: sanitizeUpgrades(data.upgrades, data.fingerLevel),
    characters: sanitizeCharacters(data.characters),
    totalHatches: nonNegInt(data.totalHatches, 0),
    sinceRare: nonNegInt(data.sinceRare, 0),
    bonusesCollected: nonNegInt(data.bonusesCollected, 0),
    achievements: sanitizeAchievements(data.achievements),
    lastSeen: num(data.lastSeen, now),
    muted: Boolean(data.muted),
  };
}
