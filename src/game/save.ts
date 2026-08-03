// Serialize / migrate save state. Pure — the actual IndexedDB I/O lives in
// src/persistence.ts so this module never touches `window`. Testers are real
// kids with real progress, so migration must never throw a save away.

import {
  adEggCooldownMs,
  charIncomeGrowth,
  charIncomeGrowthLegacyAdditive,
  evolveLevels,
  leaderboardMaxEntries,
  leaderboardNameMaxLen,
  maxEvolution,
  minCharLevel,
} from './balance';
import { collectionOrder } from './characters';
import { achievements } from './achievements';
import {
  DEFAULT_ACCESSORY,
  DEFAULT_BACKGROUND,
  DEFAULT_BLOB,
  DEFAULT_SOUND,
  accessoryById,
  backgroundById,
  blobById,
  cosmeticsById,
  soundById,
} from './cosmetics';
import { defaultUpgrades } from './upgrades';
import { maxCpm } from './cpm';
import { GIFT_CYCLE_DAYS, QUEST_POOL, type QuestId } from './daily';
import { randomSeed, type RngState } from './rng';
import type {
  CharId,
  LeaderboardEntry,
  OwnedCharacters,
  SaveState,
  UpgradeId,
  Upgrades,
} from './types';

export const CURRENT_VERSION = 15 as const;

/**
 * v6 switched creature income from additive (flat +per level) to compounding
 * (×per level). Remap a pre-v6 level to the compounding level that yields the
 * SAME income, so no progress is lost — e.g. an additive level 94072 becomes a
 * ~228 compounding level with identical income.
 */
function remapLegacyLevel(oldLevel: number): number {
  const oldFactor = 1 + charIncomeGrowthLegacyAdditive * (oldLevel - 1);
  const newLevel = 1 + Math.log(oldFactor) / Math.log(charIncomeGrowth);
  return Math.max(minCharLevel, Math.round(newLevel));
}

export function defaultSaveState(now: number): SaveState {
  return {
    version: CURRENT_VERSION,
    goo: 0,
    lifetimeGoo: 0,
    bestCpm: 0,
    upgrades: { ...defaultUpgrades },
    characters: {},
    eggs: 0,
    totalHatches: 0,
    sinceRare: 0,
    bonusesCollected: 0,
    clicks: 0,
    leaderboard: [],
    achievements: [],
    ownedCosmetics: [DEFAULT_BLOB, DEFAULT_BACKGROUND, DEFAULT_ACCESSORY, DEFAULT_SOUND],
    equippedBlob: DEFAULT_BLOB,
    equippedBackground: DEFAULT_BACKGROUND,
    equippedAccessory: DEFAULT_ACCESSORY,
    equippedSound: DEFAULT_SOUND,
    equippedMain: null,
    milestonesShown: [],
    lastGiftDay: 0,
    giftStreak: 0,
    questDay: 0,
    questProgress: {},
    questsClaimed: [],
    questAllClaimed: false,
    adEggReadyAt: 0,
    lastSeen: now,
    muted: false,
    rng: { seed: randomSeed(), cursor: 0 },
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonNegInt(value: unknown, fallback: number): number {
  return Math.max(0, Math.floor(num(value, fallback)));
}

function sanitizeCharacters(raw: unknown, remapLegacy: boolean): OwnedCharacters {
  const out: OwnedCharacters = {};
  if (!raw || typeof raw !== 'object') return out;
  const valid = new Set<CharId>(collectionOrder);
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!valid.has(key as CharId)) continue;
    const e = entry as { level?: unknown; shiny?: unknown; evolution?: unknown } | null;
    const raw0 = Math.max(minCharLevel, nonNegInt(e?.level, minCharLevel));
    const clamped = remapLegacy ? remapLegacyLevel(raw0) : raw0;
    // Evolution stage: read the number, or convert a legacy `shiny:true` to stage 1.
    // Cap to what the level actually allows (and to maxEvolution).
    const rawEvo = typeof e?.evolution === 'number' ? Math.floor(e.evolution) : e?.shiny ? 1 : 0;
    let stageForLevel = 0;
    for (const lv of evolveLevels) {
      if (clamped >= lv) stageForLevel += 1;
      else break;
    }
    const evolution = Math.max(0, Math.min(rawEvo, maxEvolution, stageForLevel));
    out[key as CharId] = evolution > 0 ? { level: clamped, evolution } : { level: clamped };
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

function sanitizeLeaderboard(raw: unknown): LeaderboardEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      const rec = e as { name?: unknown; clicks?: unknown } | null;
      const name = typeof rec?.name === 'string' ? rec.name.trim().slice(0, leaderboardNameMaxLen) : '';
      return { name, clicks: nonNegInt(rec?.clicks, 0) };
    })
    .filter((e) => e.name.length > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, leaderboardMaxEntries);
}

/**
 * A missing or malformed rng stream (old save, or corrupted data) gets a
 * fresh random seed at cursor 0 — never throws, and never blocks a load.
 * A valid-looking stream is kept as-is so an in-progress stream survives a
 * reload (that's the whole point — see SaveState.rng).
 */
function sanitizeRng(raw: unknown): RngState {
  if (raw && typeof raw === 'object') {
    const r = raw as { seed?: unknown; cursor?: unknown };
    if (
      typeof r.seed === 'number' &&
      Number.isFinite(r.seed) &&
      typeof r.cursor === 'number' &&
      Number.isFinite(r.cursor) &&
      r.cursor >= 0
    ) {
      return { seed: r.seed >>> 0, cursor: Math.floor(r.cursor) };
    }
  }
  return { seed: randomSeed(), cursor: 0 };
}

/** v14 daily quests: keep only counters for real quest ids, capped sanely. */
function sanitizeQuestProgress(raw: unknown): Partial<Record<QuestId, number>> {
  const out: Partial<Record<QuestId, number>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const def of QUEST_POOL) {
    const v = (raw as Record<string, unknown>)[def.id];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      // Progress above the target carries no meaning — cap it so a corrupted
      // counter can't grow without bound inside the save.
      out[def.id] = Math.min(Math.floor(v), def.target);
    }
  }
  return out;
}

function sanitizeQuestIds(raw: unknown): QuestId[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>(QUEST_POOL.map((q) => q.id));
  return [...new Set(raw.filter((id): id is QuestId => typeof id === 'string' && valid.has(id)))];
}

/** Keep only real cosmetic ids; always include the free defaults. */
function sanitizeCosmetics(raw: unknown): string[] {
  const out = new Set<string>([DEFAULT_BLOB, DEFAULT_BACKGROUND, DEFAULT_ACCESSORY, DEFAULT_SOUND]);
  if (Array.isArray(raw)) {
    for (const id of raw) if (typeof id === 'string' && cosmeticsById.has(id)) out.add(id);
  }
  return [...out];
}

/**
 * Coerce arbitrary persisted data into a valid current-version SaveState.
 * Additive across versions (v1 single fingerLevel → v2 upgrades/achievements →
 * v3 clicks/leaderboard → v4 shop cosmetics); missing fields default cleanly, so
 * progress is kept.
 */
export function migrate(raw: unknown, now: number): SaveState {
  if (!raw || typeof raw !== 'object') return defaultSaveState(now);
  const data = raw as Record<string, unknown>;

  // Pre-v6 saves stored additive creature levels — remap them to compounding.
  const remapLegacy = num(data.version, 0) < 6;
  const ownedCosmetics = sanitizeCosmetics(data.ownedCosmetics);
  // Equip a saved choice only if it's a real, owned item; else the default.
  // Blob skins are retired: the starter blob is always our original green one,
  // so old saves are normalized back to it (no invisible click bonus lingering).
  const blobPick = DEFAULT_BLOB;
  const bgPick = typeof data.equippedBackground === 'string' ? data.equippedBackground : '';
  const accPick = typeof data.equippedAccessory === 'string' ? data.equippedAccessory : '';
  const equippedBlob = ownedCosmetics.includes(blobPick) ? blobById(blobPick).id : DEFAULT_BLOB;
  const equippedBackground = ownedCosmetics.includes(bgPick)
    ? backgroundById(bgPick).id
    : DEFAULT_BACKGROUND;
  const equippedAccessory = ownedCosmetics.includes(accPick)
    ? accessoryById(accPick).id
    : DEFAULT_ACCESSORY;
  const soundPick = typeof data.equippedSound === 'string' ? data.equippedSound : '';
  const equippedSound = ownedCosmetics.includes(soundPick) ? soundById(soundPick).id : DEFAULT_SOUND;

  // Main-screen creature: keep only a real creature id (ownership is checked at
  // render time, so a not-yet-owned pick simply falls back to the classic blob).
  const mainPick = typeof data.equippedMain === 'string' ? (data.equippedMain as CharId) : null;
  const equippedMain = mainPick && collectionOrder.includes(mainPick) ? mainPick : null;

  const milestonesShown = Array.isArray(data.milestonesShown)
    ? data.milestonesShown.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : [];

  return {
    version: CURRENT_VERSION,
    goo: Math.max(0, num(data.goo, 0)),
    // Held goo can never exceed lifetime goo — lifetime is everything ever
    // earned and spending only moves goo down. The invariant is enforced
    // (v13) by RAISING lifetime to at least the held amount, never by cutting
    // the held amount: a legit save is only ever corrected in the player's
    // favour, while an edited save carrying goo=1e17 next to a tiny lifetime
    // now shows that 1e17 as a lifetime JUMP — exactly the delta the
    // plausibility audit measures and the leaderboard bars on.
    lifetimeGoo: Math.max(0, num(data.lifetimeGoo, 0), num(data.goo, 0)),
    // v13: taps-per-minute record. Clamped to the physical ceiling — a value
    // above what a human can produce in a minute is an edited save.
    bestCpm: Math.min(nonNegInt(data.bestCpm, 0), maxCpm),
    upgrades: sanitizeUpgrades(data.upgrades, data.fingerLevel),
    characters: sanitizeCharacters(data.characters, remapLegacy),
    eggs: nonNegInt(data.eggs, 0),
    totalHatches: nonNegInt(data.totalHatches, 0),
    sinceRare: nonNegInt(data.sinceRare, 0),
    bonusesCollected: nonNegInt(data.bonusesCollected, 0),
    clicks: nonNegInt(data.clicks, 0),
    leaderboard: sanitizeLeaderboard(data.leaderboard),
    achievements: sanitizeAchievements(data.achievements),
    ownedCosmetics,
    equippedBlob,
    equippedBackground,
    equippedAccessory,
    equippedSound,
    equippedMain,
    milestonesShown,
    // v14 daily loop — plain sanitation; all real semantics live in daily.ts.
    lastGiftDay: nonNegInt(data.lastGiftDay, 0),
    giftStreak: Math.min(nonNegInt(data.giftStreak, 0), GIFT_CYCLE_DAYS),
    questDay: nonNegInt(data.questDay, 0),
    questProgress: sanitizeQuestProgress(data.questProgress),
    questsClaimed: sanitizeQuestIds(data.questsClaimed),
    questAllClaimed: Boolean(data.questAllClaimed),
    // Capped at one full cooldown from now: a corrupted far-future timestamp
    // must never lock the button forever.
    adEggReadyAt: Math.min(nonNegInt(data.adEggReadyAt, 0), now + adEggCooldownMs),
    lastSeen: num(data.lastSeen, now),
    muted: Boolean(data.muted),
    rng: sanitizeRng(data.rng),
  };
}
