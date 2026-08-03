// Gacha logic (§7): roll, pity, duplicates. Pure — rng is injected so it
// can be tested deterministically.

import {
  adEggLegendaryChance,
  adEggRareChance,
  luckLegendaryShare,
  luckRareShare,
  pityLegendaryThreshold,
  pityRareThreshold,
  rarityChances,
} from './balance';
import { hatchableByRarity } from './characters';
import type { CharId, OwnedCharacters, Rarity } from './types';

const rarityOrder: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

export interface HatchContext {
  owned: OwnedCharacters;
  sinceRare: number;
  totalHatches: number;
  luck?: number; // 0..luckCap, shifts odds from common toward rare/legendary
  premium?: boolean; // the ad egg: its own flat rarity table (premiumRollRarity)
}

/** Rarity odds after applying luck (mass moves from common to rare+legendary). */
function luckyChances(luck: number): Record<Rarity, number> {
  if (luck <= 0) return rarityChances;
  const shift = Math.min(luck, rarityChances.common);
  return {
    common: rarityChances.common - shift,
    uncommon: rarityChances.uncommon,
    rare: rarityChances.rare + shift * luckRareShare,
    legendary: rarityChances.legendary + shift * luckLegendaryShare,
  };
}

export function isLegendaryOwned(owned: OwnedCharacters): boolean {
  return hatchableByRarity.legendary.some((def) => Boolean(owned[def.id]));
}

/** Choose a rarity, applying both pity rules (§7.2). */
export function rollRarity(
  rng: () => number,
  ctx: { sinceRare: number; totalHatches: number; legendaryOwned: boolean; luck?: number },
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
  // Normal weighted roll, biased by luck.
  const chances = luckyChances(ctx.luck ?? 0);
  const r = rng();
  let acc = 0;
  for (const rarity of rarityOrder) {
    acc += chances[rarity];
    if (r < acc) return rarity;
  }
  return 'common';
}

/**
 * The AD EGG's rarity roll (owner-set odds; see adEgg* in balance.ts).
 *
 * Deliberately flat: no pity and no luck bias. Pity exists to rescue a bad
 * streak of NORMAL eggs, and letting the premium roll consume or trigger it
 * would tangle the two economies — the premium table is already the rescue.
 * The leftover mass splits between common/uncommon at their base ratio.
 * Callers still run the outcome through hatch(), so pity COUNTERS keep
 * moving correctly (a rare+ resets sinceRare like any other hatch).
 */
export function premiumRollRarity(u: number): Rarity {
  const legendary = adEggLegendaryChance;
  const rare = adEggRareChance;
  const rest = 1 - legendary - rare;
  const baseCommon = rarityChances.common;
  const baseUncommon = rarityChances.uncommon;
  const uncommon = (rest * baseUncommon) / (baseCommon + baseUncommon);
  if (u < legendary) return 'legendary';
  if (u < legendary + rare) return 'rare';
  if (u < legendary + rare + uncommon) return 'uncommon';
  return 'common';
}

/** Uniform pick among the characters of a rarity (§7.1). */
export function pickChar(rng: () => number, rarity: Rarity): CharId {
  const pool = hatchableByRarity[rarity];
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx].id;
}

export type HatchKind = 'new' | 'levelup';

export interface HatchOutcome {
  charId: CharId;
  rarity: Rarity;
  kind: HatchKind;
  level: number; // resulting level (creatures level up forever)
  gooReward: number; // reserved (0) — duplicates now always level up
  nextSinceRare: number;
  nextTotalHatches: number;
}

/**
 * Perform one hatch. Returns the outcome plus the updated pity counters.
 * Does NOT mutate anything — the caller (store) applies the result.
 */
export interface OpenInput {
  rng: () => number;
  owned: OwnedCharacters;
  sinceRare: number;
  totalHatches: number;
  luck: number;
  count: number; // how many eggs from inventory to open
}

export interface BatchResult {
  count: number; // eggs actually hatched
  spent: number; // goo spent (0 for opening — eggs were paid for when bought)
  gooFromDupes: number; // goo earned back from maxed duplicates
  goo: number; // resulting goo (after spend + dupe refunds)
  owned: OwnedCharacters; // updated (new object)
  sinceRare: number;
  totalHatches: number;
  rarityTally: Record<Rarity, number>;
  charTally: Partial<Record<CharId, number>>; // every creature pulled → how many times
  newIds: CharId[]; // creatures obtained for the first time (unique, in order)
  levelUps: Partial<Record<CharId, number>>; // charId → levels gained
  bestRarity: Rarity | null; // rarest pull in the batch
}

const rarityRank: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3 };

/**
 * How many eggs can be bought with `goo`, and the total goo spent — using the
 * escalating price where `acquired` is how many eggs have EVER been acquired
 * (opened + still in inventory), so the price keeps climbing across sessions.
 */
export function buyableEggs(
  goo: number,
  acquired: number,
  maxCount: number,
  eggCost: (n: number) => number,
): { count: number; spent: number } {
  let count = 0;
  let spent = 0;
  let n = acquired;
  while (count < maxCount) {
    const cost = eggCost(n);
    if (goo - spent < cost) break;
    spent += cost;
    n += 1;
    count += 1;
  }
  return { count, spent };
}

/**
 * Open `count` eggs from inventory in one go — no goo cost (they were paid for
 * when bought). Pure; returns the aggregated result for the store to apply.
 */
export function openEggs(input: OpenInput): BatchResult {
  let { sinceRare, totalHatches } = input;
  const owned: OwnedCharacters = { ...input.owned };
  const rarityTally: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
  const charTally: Partial<Record<CharId, number>> = {};
  const newIds: CharId[] = [];
  const levelUps: Partial<Record<CharId, number>> = {};
  let count = 0;
  let gooFromDupes = 0;
  let bestRarity: Rarity | null = null;

  for (let i = 0; i < input.count; i++) {
    const outcome = hatch(input.rng, { owned, sinceRare, totalHatches, luck: input.luck });
    const existing = owned[outcome.charId];
    owned[outcome.charId] = existing
      ? { ...existing, level: outcome.level }
      : { level: outcome.level };

    charTally[outcome.charId] = (charTally[outcome.charId] ?? 0) + 1;
    if (outcome.kind === 'new') newIds.push(outcome.charId);
    else if (outcome.kind === 'levelup') levelUps[outcome.charId] = (levelUps[outcome.charId] ?? 0) + 1;
    if (outcome.gooReward > 0) gooFromDupes += outcome.gooReward;

    rarityTally[outcome.rarity]++;
    if (!bestRarity || rarityRank[outcome.rarity] > rarityRank[bestRarity]) bestRarity = outcome.rarity;

    sinceRare = outcome.nextSinceRare;
    totalHatches = outcome.nextTotalHatches;
    count++;
  }

  return {
    count,
    spent: 0,
    gooFromDupes,
    goo: 0, // unused for opening — the store keeps its own goo
    owned,
    sinceRare,
    totalHatches,
    rarityTally,
    charTally,
    newIds,
    levelUps,
    bestRarity,
  };
}

export function hatch(rng: () => number, ctx: HatchContext): HatchOutcome {
  const legendaryOwned = isLegendaryOwned(ctx.owned);
  const rarity = ctx.premium
    ? premiumRollRarity(rng())
    : rollRarity(rng, {
        sinceRare: ctx.sinceRare,
        totalHatches: ctx.totalHatches,
        legendaryOwned,
        luck: ctx.luck,
      });
  const charId = pickChar(rng, rarity);

  const gotRareOrBetter = rarity === 'rare' || rarity === 'legendary';
  const nextSinceRare = gotRareOrBetter ? 0 : ctx.sinceRare + 1;
  const nextTotalHatches = ctx.totalHatches + 1;

  // Creatures level up forever — a duplicate always makes the creature stronger
  // (§ user request: "דמויות יכולות להגיע עד אין סוף רמות").
  const existing = ctx.owned[charId];
  const kind: HatchKind = existing ? 'levelup' : 'new';
  const level = existing ? existing.level + 1 : 1;

  return { charId, rarity, kind, level, gooReward: 0, nextSinceRare, nextTotalHatches };
}
