// Gacha logic (§7): roll, pity, duplicates. Pure — rng is injected so it
// can be tested deterministically.

import {
  baseByRarity,
  duplicateGooMultiplier,
  maxCharLevel,
  pityLegendaryThreshold,
  pityRareThreshold,
  rarityChances,
} from './balance';
import { charactersByRarity } from './characters';
import type { CharId, OwnedCharacters, Rarity } from './types';

const rarityOrder: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

export interface HatchContext {
  owned: OwnedCharacters;
  sinceRare: number;
  totalHatches: number;
}

export function isLegendaryOwned(owned: OwnedCharacters): boolean {
  return charactersByRarity.legendary.some((def) => Boolean(owned[def.id]));
}

/** Choose a rarity, applying both pity rules (§7.2). */
export function rollRarity(
  rng: () => number,
  ctx: { sinceRare: number; totalHatches: number; legendaryOwned: boolean },
): Rarity {
  // Pity 2: guaranteed legendary once totalHatches hits the threshold unowned.
  if (ctx.totalHatches >= pityLegendaryThreshold && !ctx.legendaryOwned) {
    return 'legendary';
  }
  // Pity 1: guaranteed rare-or-better; split between rare/legendary by odds.
  if (ctx.sinceRare >= pityRareThreshold) {
    const rareW = rarityChances.rare;
    const legW = rarityChances.legendary;
    return rng() < rareW / (rareW + legW) ? 'rare' : 'legendary';
  }
  // Normal weighted roll.
  const r = rng();
  let acc = 0;
  for (const rarity of rarityOrder) {
    acc += rarityChances[rarity];
    if (r < acc) return rarity;
  }
  return 'common';
}

/** Uniform pick among the characters of a rarity (§7.1). */
export function pickChar(rng: () => number, rarity: Rarity): CharId {
  const pool = charactersByRarity[rarity];
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx].id;
}

export type HatchKind = 'new' | 'levelup' | 'maxed';

export interface HatchOutcome {
  charId: CharId;
  rarity: Rarity;
  kind: HatchKind;
  level: number; // resulting level (maxCharLevel when maxed)
  gooReward: number; // >0 only when maxed (§7.3)
  nextSinceRare: number;
  nextTotalHatches: number;
}

/**
 * Perform one hatch. Returns the outcome plus the updated pity counters.
 * Does NOT mutate anything — the caller (store) applies the result.
 */
export function hatch(rng: () => number, ctx: HatchContext): HatchOutcome {
  const legendaryOwned = isLegendaryOwned(ctx.owned);
  const rarity = rollRarity(rng, {
    sinceRare: ctx.sinceRare,
    totalHatches: ctx.totalHatches,
    legendaryOwned,
  });
  const charId = pickChar(rng, rarity);

  const gotRareOrBetter = rarity === 'rare' || rarity === 'legendary';
  const nextSinceRare = gotRareOrBetter ? 0 : ctx.sinceRare + 1;
  const nextTotalHatches = ctx.totalHatches + 1;

  const existing = ctx.owned[charId];
  let kind: HatchKind;
  let level: number;
  let gooReward = 0;

  if (!existing) {
    kind = 'new';
    level = 1;
  } else if (existing.level < maxCharLevel) {
    kind = 'levelup';
    level = existing.level + 1;
  } else {
    kind = 'maxed';
    level = maxCharLevel;
    gooReward = baseByRarity[rarity] * duplicateGooMultiplier;
  }

  return { charId, rarity, kind, level, gooReward, nextSinceRare, nextTotalHatches };
}
