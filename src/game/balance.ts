// -----------------------------------------------------------------------------
// BLORBO — all tunable constants live here and NOWHERE else.
// A designer must never have to read a component to change a number.
// -----------------------------------------------------------------------------

import type { Rarity, UpgradeId } from './types';

/**
 * Prestige hook — do not remove.
 * Every earnings calculation (click power AND passive income) multiplies
 * through this. It is 1 today; it is the entire prestige system in v2.
 */
export const globalMultiplier = 1; // prestige hook — do not remove

// --- Clicking ----------------------------------------------------------------
// clickPower = (clickBase + fingerLevel) × clickMultiplier × star × globalMultiplier
export const clickBase = 1;
export const fingerEffectPerLevel = 1;

// --- Passive income ----------------------------------------------------------
// charIncome = baseByRarity × (1 + charIncomeGrowthPerLevel × (level − 1))
export const baseByRarity: Record<Rarity, number> = {
  common: 1,
  uncommon: 6,
  rare: 30,
  legendary: 200,
};
export const charIncomeGrowthPerLevel = 0.25;
export const maxCharLevel = 20; // creatures now level up to 20
export const minCharLevel = 1;
export const evolveLevel = 10; // a creature can evolve into a shiny from this level

// --- Upgrades ----------------------------------------------------------------
// Each upgrade: cost(level) = round(base × growth ^ level); effect per level below.
export interface UpgradeConfig {
  costBase: number;
  costGrowth: number;
  effectPerLevel: number;
}
export const upgradeConfig: Record<UpgradeId, UpgradeConfig> = {
  // +1 goo per tap per level.
  finger: { costBase: 15, costGrowth: 1.5, effectPerLevel: 1 },
  // +25% tap power per level (multiplier).
  power: { costBase: 200, costGrowth: 2.05, effectPerLevel: 0.25 },
  // +0.4 automatic taps/sec per level.
  autoTap: { costBase: 300, costGrowth: 1.95, effectPerLevel: 0.4 },
  // +12% to all creature income per level.
  nurture: { costBase: 250, costGrowth: 1.8, effectPerLevel: 0.12 },
  // +3% chance for a critical tap per level.
  crit: { costBase: 800, costGrowth: 2.15, effectPerLevel: 0.03 },
  // shifts hatch odds toward rare/legendary per level.
  luck: { costBase: 1200, costGrowth: 2.25, effectPerLevel: 0.02 },
};

// --- Critical taps -----------------------------------------------------------
export const critBaseChance = 0.02; // before any upgrade
export const critChanceCap = 0.6;
export const critMultiplier = 8; // a crit tap is worth this many normal taps

// --- Luck (hatch odds shift) -------------------------------------------------
export const luckCap = 0.35; // max fraction shifted from common → rare/legendary
export const luckRareShare = 0.7; // of the shifted mass, this goes to rare…
export const luckLegendaryShare = 0.3; // …and this to legendary

// --- Evolution (shiny creatures) ---------------------------------------------
// A level-10 creature can evolve into a shiny variant worth much more.
export const evolveIncomeMultiplier = 3;
export const evolveCostByRarity: Record<Rarity, number> = {
  common: 2_500,
  uncommon: 12_000,
  rare: 60_000,
  legendary: 400_000,
};

// --- Goo rain event ----------------------------------------------------------
export const rainIntervalMinMs = 70_000;
export const rainIntervalMaxMs = 150_000;
export const rainDurationMs = 6_000;
export const rainDropCount = 14;
export const rainDropIncomeSeconds = 3; // each drop ≈ this many seconds of income
export const rainDropMinGoo = 5;

// --- Eggs --------------------------------------------------------------------
// eggCost(n) = round(eggCostBase × eggCostGrowth ^ n)   // n = eggs already hatched
export const eggCostBase = 45;
export const eggCostGrowth = 1.11;

// --- Bulk hatching -----------------------------------------------------------
export const bulkHatchTen = 10;
export const bulkHatchMax = 100; // safety cap for "hatch all" in one press

// --- Hatching odds -----------------------------------------------------------
export const rarityChances: Record<Rarity, number> = {
  common: 0.6,
  uncommon: 0.28,
  rare: 0.105,
  legendary: 0.015,
};

// --- Pity --------------------------------------------------------------------
export const pityRareThreshold = 15; // sinceRare → guaranteed rare/legendary
export const pityLegendaryThreshold = 60; // totalHatches → guaranteed legendary if unowned

// --- Duplicates --------------------------------------------------------------
export const duplicateGooMultiplier = 300; // maxed dup → baseByRarity × this

// --- Golden bonus (the pull mechanic) ----------------------------------------
// A golden blob drifts across the click screen; tapping it pays out and starts
// a short click frenzy.
export const bonusIntervalMinMs = 42000;
export const bonusIntervalMaxMs = 88000;
export const bonusLifetimeMs = 9000; // how long it stays before drifting off
export const bonusIncomeSeconds = 40; // reward ≈ this many seconds of passive income
export const bonusClickEquivalent = 40; // …or this many taps, whichever is larger
export const bonusMinGoo = 20; // floor so it always feels worth it
export const frenzyMultiplier = 8; // tap power during a frenzy
export const frenzyDurationMs = 9000;

// --- Achievements ------------------------------------------------------------
// Each claimed achievement adds starPerAchievement to a global income star.
export const starPerAchievement = 0.04; // +4% to everything, per achievement
export const achievementCollectionGoals = [3, 6, 10];
export const achievementLifetimeGoals = [1_000, 50_000, 1_000_000];
export const achievementHatchGoals = [10, 30, 75];

// --- Offline income ----------------------------------------------------------
export const offlineMinSeconds = 60; // must be away longer than this to earn
export const offlineCapSeconds = 14400; // 4 hours
export const offlineRate = 0.5; // 50%

// --- Persistence -------------------------------------------------------------
export const saveIntervalMs = 5000;
