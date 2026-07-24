// -----------------------------------------------------------------------------
// BLORBO — all tunable constants live here and NOWHERE else.
// A designer must never have to read a component to change a number.
// -----------------------------------------------------------------------------

import type { Rarity } from './types';

/**
 * Prestige hook — do not remove.
 * Every earnings calculation (click power AND passive income) multiplies
 * through this. It is 1 today; it is the entire prestige system in v2.
 */
export const globalMultiplier = 1; // prestige hook — do not remove

// --- Clicking (§6.1) ---------------------------------------------------------
// clickPower = (clickBase + fingerLevel * fingerEffectPerLevel) * globalMultiplier
export const clickBase = 1;
export const fingerEffectPerLevel = 1;

// --- Finger upgrade (§6.2) ---------------------------------------------------
// cost(level) = round(fingerCostBase * fingerCostGrowth ^ level)
export const fingerCostBase = 25;
export const fingerCostGrowth = 1.6;

// --- Passive income (§6.3) ---------------------------------------------------
// charIncome = baseByRarity * (1 + charIncomeGrowthPerLevel * (level - 1))
export const baseByRarity: Record<Rarity, number> = {
  common: 1,
  uncommon: 6,
  rare: 30,
  legendary: 200,
};
export const charIncomeGrowthPerLevel = 0.25;
export const maxCharLevel = 10;
export const minCharLevel = 1;

// --- Eggs (§6.4) -------------------------------------------------------------
// eggCost(n) = round(eggCostBase * eggCostGrowth ^ n)   // n = eggs already hatched
export const eggCostBase = 50;
export const eggCostGrowth = 1.12;

// --- Hatching odds (§7.1) ----------------------------------------------------
export const rarityChances: Record<Rarity, number> = {
  common: 0.6,
  uncommon: 0.28,
  rare: 0.105,
  legendary: 0.015,
};

// --- Pity (§7.2) -------------------------------------------------------------
// If sinceRare reaches this, the next hatch is guaranteed rare or legendary.
export const pityRareThreshold = 15;
// If totalHatches reaches this and the legendary is still unowned, guarantee it.
export const pityLegendaryThreshold = 60;

// --- Duplicates (§7.3) -------------------------------------------------------
// A maxed duplicate converts to goo: baseByRarity * duplicateGooMultiplier.
export const duplicateGooMultiplier = 300;

// --- Offline income (§8) -----------------------------------------------------
export const offlineMinSeconds = 60; // must be away longer than this to earn
export const offlineCapSeconds = 14400; // 4 hours
export const offlineRate = 0.5; // 50%

// --- Persistence (§12) -------------------------------------------------------
export const saveIntervalMs = 5000;
