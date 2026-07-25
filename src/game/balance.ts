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
// clickPower = (clickBase + fingerBonus(level)) × clickMultiplier × star × globalMultiplier
export const clickBase = 1;
// "Strong finger" COMPOUNDS so every level is a real jump — a flat +1 stopped
// mattering once taps were worth thousands. fingerBonus(level) = base × (growth^level − 1).
export const fingerBonusBase = 4;
export const fingerBonusGrowth = 1.4;

// --- Passive income ----------------------------------------------------------
// charIncome = baseByRarity × (1 + charIncomeGrowthPerLevel × (level − 1))
// Widely-separated tiers so a rarer creature is unmistakably worth more:
// each step is roughly ×7-8 the one below it.
export const baseByRarity: Record<Rarity, number> = {
  common: 1,
  uncommon: 8,
  rare: 50,
  legendary: 350,
};
export const charIncomeGrowthPerLevel = 0.4; // +40% of base income per level — every level is a real jump
// The robot hand works alongside the creatures (automation, not taps): each
// level makes it harvest a bit more of their income, so it scales WITH the
// creatures and stays a meaningful contributor however strong they get —
// instead of falling behind as a flat trickle. Capped so creatures stay king.
export const autoTapFractionPerLevel = 0.035; // +3.5% of creature income per level
export const autoTapFractionCap = 0.6; // up to +60% of creature income
export const minCharLevel = 1;
// No maximum — creatures level up forever, giving more each level (§ user request).
export const evolveLevel = 10; // a creature can evolve into a shiny from this level

// --- Direct creature leveling (goo sink) --------------------------------------
// Besides hatching duplicates, a creature can be levelled straight up with goo
// from the collection. Cost scales with rarity and its current level. Because
// low-level creatures stay cheap, there is ALWAYS an affordable next level —
// progress slows at the top but never dead-stops (§ user request).
// cost(level → level+1) = round(base[rarity] × growth ^ (level − 1))
export const creatureLevelCostBase: Record<Rarity, number> = {
  common: 25,
  uncommon: 120,
  rare: 700,
  legendary: 4000,
};
export const creatureLevelCostGrowth = 1.16;

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
  // The robot hand's cost curve. Its effect is a fraction of creature income —
  // see autoTapFractionPerLevel below — so effectPerLevel here is unused.
  autoTap: { costBase: 240, costGrowth: 1.95, effectPerLevel: 0 },
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
// Many escalating tiers per category so there's always another goal. Each
// achievement's reward scales with its tier (difficulty): a permanent income
// bonus (star) plus a one-time goo grant.
export const achievementStarPerTier = 0.02; // +2% income per difficulty tier
export const achievementGooBase = 200; // tier-1 goo grant…
export const achievementGooGrowth = 3; // …× this per tier (kept modest so a single
// claim never bombs the economy and completions stay spread out, not bursty)

// Ladders are tuned so a new badge pops every few minutes across a whole
// session — never a front-loaded rush then silence. The action-paced ladders
// (clicks/hatches/bonuses/shinies) advance with play, so they carry the
// mid-and-late-game cadence; lifetime-goo stays open-ended for the long haul.
export const achievementGoals = {
  // capped at the 16 creatures / 16 evolutions
  collection: [4, 8, 12, 16],
  shinies: [1, 3, 6, 10, 16],
  // open-ended, up to 100 trillion lifetime goo (with ~half-step tiers)
  lifetime: [1e3, 5e3, 2e4, 1e5, 3e5, 1e6, 3e6, 1e7, 3e7, 1e8, 3e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14],
  hatches: [10, 25, 50, 90, 150, 250, 400, 650, 1000, 1600, 2500, 4000, 6500, 10000],
  clicks: [100, 300, 700, 1500, 3000, 5500, 9000, 14000, 22000, 35000, 60000, 100000, 200000, 400000],
  bonuses: [5, 15, 30, 50, 80, 120, 180, 280, 450, 700],
} as const;

// --- Offline income ----------------------------------------------------------
export const offlineMinSeconds = 60; // must be away longer than this to earn
export const offlineCapSeconds = 14400; // 4 hours
export const offlineRate = 0.5; // 50%

// --- Local leaderboard -------------------------------------------------------
export const leaderboardMaxEntries = 20; // keep the top N on the device
export const leaderboardNameMaxLen = 12;

// --- Persistence -------------------------------------------------------------
export const saveIntervalMs = 5000;
