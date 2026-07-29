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
// "Strong finger" grows per level so it never becomes a dead +1, but its growth
// is kept BELOW the cost growth (1.5) so a tap stays a sensible active bonus
// (roughly a second or two of passive income) instead of exploding past the
// whole idle economy. fingerBonus(level) = base × (growth^level − 1).
export const fingerBonusBase = 5;
export const fingerBonusGrowth = 1.21;

// --- Passive income ----------------------------------------------------------
// charIncome = baseByRarity × charIncomeGrowth ^ (level − 1)  (compounding)
// Widely-separated tiers so a rarer creature is unmistakably worth more:
// each step is roughly ×7-8 the one below it.
export const baseByRarity: Record<Rarity, number> = {
  common: 1,
  uncommon: 8,
  rare: 50,
  legendary: 350,
};
// Each level MULTIPLIES a creature's income (compounding), so a level is always
// a meaningful jump — +5% of the creature's own income — no matter how high the
// level. (Old saves used a flat additive curve; migration remaps their levels to
// the equivalent compounding level so income is preserved — see save.ts.)
export const charIncomeGrowth = 1.05;
export const charIncomeGrowthLegacyAdditive = 0.7; // the pre-v6 additive rate, for migration only
// The robot hand works alongside the creatures (automation, not taps): each
// level makes it harvest a bit more of their income, so it scales WITH the
// creatures and stays a meaningful contributor however strong they get —
// instead of falling behind as a flat trickle. Capped so creatures stay king.
export const autoTapFractionPerLevel = 0.035; // +3.5% of creature income per level
export const autoTapFractionCap = 0.6; // up to +60% of creature income
export const minCharLevel = 1;
// No maximum — creatures level up forever, giving more each level (§ user request).

// --- Evolution chain ---------------------------------------------------------
// A creature can evolve several times, each stage a bigger shiny worth much more.
// Stage s needs the creature at evolveLevels[s-1]; income is × the stage factor.
export const evolveLevels = [10, 25, 50, 100]; // level required for stage 1,2,3,4
export const maxEvolution = evolveLevels.length; // 4
export const evolveMultiplierByStage = [1, 3, 8, 20, 50]; // income × at stage 0..4
export const evolveLevel = evolveLevels[0]; // first evolution level (back-compat)

// --- Direct creature leveling (goo sink) --------------------------------------
// Besides hatching duplicates, a creature can be levelled straight up with goo.
// The cost is tied directly to the income the level GRANTS: a level always costs
// this many seconds of the extra goo/sec it adds. So the price-to-payoff ratio is
// sensible at every level (never a multi-day payback), and it scales up naturally
// as the creature — and your whole economy — grow stronger.
export const creatureLevelPaybackSeconds = 180;
// The price-to-payoff ratio is NOT flat — it scales with your wealth (current
// passive goo/sec). Upgrades are cheap when you're poor (a snappy, rewarding
// start) and get progressively pricier as you get rich, so the late game stays
// a challenge instead of trivially doubling every couple of minutes forever.
// multiplier = 1 at the pivot rate, floored below it, +slope per 10× above.
export const paybackPivotRate = 1000; // goo/sec at which the ratio equals the base
export const paybackSlopePerDecade = 0.5; // +0.5× payback for each 10× richer
export const paybackMultMin = 0.5; // early game: half-price upgrades
export const paybackMultMax = 20; // hard ceiling so it can never explode

// --- "Upgrade all" convenience (paced so it isn't a free fast-forward) --------
// Pressing it charges a service fee (this many seconds of your income) that
// DOUBLES with each use in the session, and then locks the button for a cooldown.
export const upgradeAllCooldownMs = 60_000; // 1-minute lock after each use
export const upgradeAllFeeBaseSeconds = 60; // base fee = 60s of income…
export const upgradeAllFeeGrowth = 2; // …×2 per use (escalating)

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

// --- Combo milestones --------------------------------------------------------
// Sustained rapid tapping pays off: reaching a combo milestone grants a lump sum
// worth (milestone × current tap value) — the streak "cashed in", so a longer
// combo pays proportionally more. Early ramp, then a bonus every N combo FOREVER
// (…500, 1000, 1500, 2000…) so it never stops rewarding.
export const comboMilestones = [50, 100, 250];
export const comboRepeatEvery = 500;
// How long a tap keeps the combo alive. Forgiving enough that a brief pause or
// a frame-hitch during a celebration doesn't drop a long streak.
export const comboWindowMs = 1200;

// --- Luck (hatch odds shift) -------------------------------------------------
export const luckCap = 0.35; // max fraction shifted from common → rare/legendary
export const luckRareShare = 0.7; // of the shifted mass, this goes to rare…
export const luckLegendaryShare = 0.3; // …and this to legendary

// --- Evolution cost ----------------------------------------------------------
// An evolution costs this many seconds of the extra income it grants — same
// sensible payback idea as leveling, but a bigger commitment (a premium jump).
export const evolvePaybackSeconds = 600;

// --- Goo rain event ----------------------------------------------------------
export const rainIntervalMinMs = 70_000;
export const rainIntervalMaxMs = 150_000;
export const rainDurationMs = 6_000;
export const rainDropCount = 14;
export const rainDropIncomeSeconds = 3; // each drop ≈ this many seconds of income
export const rainDropClickMult = 10; // …or ≈ this many taps, whichever is bigger
export const rainDropMinGoo = 5;
// Catch EVERY drop in a rain event and the whole haul is multiplied by this,
// as a celebratory completion bonus (rewards fast, active tapping).
export const rainAllBonusMult = 3;

// --- Eggs --------------------------------------------------------------------
// eggCost(n) = round(eggCostBase × eggCostGrowth ^ n)   // n = eggs already hatched
// Costs climb faster now so filling the collection is a longer journey — you
// can't just spam-hatch your way to every creature in a few minutes.
export const eggCostBase = 80;
export const eggCostGrowth = 1.18; // steeper — each egg is a bigger investment

// --- Eggs: buying & opening --------------------------------------------------
export const eggBuyMaxPerPress = 50; // "buy max" purchases at most this many at once
export const openAllCap = 200; // safety cap for opening the whole inventory at once

// --- Hatching odds -----------------------------------------------------------
// Rarer creatures are meant to feel earned: rare/legendary odds are deliberately
// low, so a rare pull is exciting and a legendary is a real event — not something
// you trip over in the first few minutes. (Pity below still guarantees them so a
// patient player is never permanently shut out.)
export const rarityChances: Record<Rarity, number> = {
  common: 0.68,
  uncommon: 0.27,
  rare: 0.045, // rarer than before (was 0.07) — a rare pull feels special
  legendary: 0.005, // ~half the old chance (was 0.01); pity still guarantees one
};

// --- Pity --------------------------------------------------------------------
// Higher thresholds → the guaranteed rare/legendary takes longer to arrive, so
// the rarest creatures stay a longer-term goal.
export const pityRareThreshold = 25; // sinceRare → guaranteed rare/legendary
export const pityLegendaryThreshold = 110; // totalHatches → guaranteed legendary if unowned

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
// Many escalating tiers per category so there's always another goal. Rewards are
// now SPLIT by category (see game/achievements.ts): the collection-mastery
// ladders (collecting & evolving creatures) grant a permanent income bonus
// (star); the grind ladders (goo/hatches/clicks/bonuses) grant a one-time goo
// lump. No achievement gives both — so the permanent bonus comes only from a
// handful of achievements and stays modest instead of ballooning across dozens.
export const achievementStarPerTier = 0.015; // +1.5% income per difficulty tier (star ladders only)
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
export const offlineCapSeconds = 1800; // 30 minutes — offline earnings stop after this
export const offlineRate = 0.5; // 50%

// --- Local leaderboard -------------------------------------------------------
export const leaderboardMaxEntries = 20; // keep the top N on the device
export const leaderboardNameMaxLen = 12;

// --- Persistence -------------------------------------------------------------
export const saveIntervalMs = 5000;
