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

// --- Prestige ("גלגול מחדש") — see game/prestige.ts ------------------------
// Crystals derive from TOTAL lifetime goo via a square root, which makes the
// system strategy-proof: total crystals depend only on total goo ever earned,
// never on how the player splits their rolls — so there is no degenerate
// "roll constantly" optimum, and the migrate() invariant (crystals ≤ what
// lifetime justifies) is a one-liner.
export const prestigeCrystalBonus = 0.05; // +5% income AND taps per crystal, forever (owner-set)
// LOGARITHMIC crystal curve (recalibrated on real pacing data: the owner's
// uncle hit billions in an afternoon, the owner hit 1e15 in two days — any
// polynomial curve explodes under orders-of-magnitude-per-day growth).
// Crystals per ORDER OF MAGNITUDE of total lifetime goo: steady, never
// runaway, always a next crystal within reach (~×1.6 growth apart).
// Raised 1e9 → 1e10 (playtest): at 1e9 the roll button lit up ~end of day 1 for
// a single +5% crystal, inviting a curious kid to reset their whole build for a
// trivial gain. One decade later the FIRST roll is already worth ~5-6 crystals,
// so the mechanic's debut is a real reward, not a trap. (owner-tunable)
export const prestigeFirstCrystalGoo = 1e10;
export const prestigeCrystalsPerDecade = 5; // +25% per ×10 lifetime growth

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
// The robot hand is an AUTO-CLICKER: it taps for you at this rate, each auto-tap
// earning a normal tap's worth of goo (it does NOT count toward the physical
// taps leaderboard). Passive income (goo/sec) comes purely from the creatures;
// the robot lives on the active/tap side.
export const autoTapRatePerLevel = 0.25; // +0.25 auto-taps/sec per level
export const autoTapRateCap = 10; // up to 10 auto-taps/sec
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
// GEOMETRIC per decade, not linear (owner-approved rebalance, measured first):
// a linear slope cannot brake an exponential — the bot crossed the game's
// entire number space (1e18) in 1.8 hours of active play with each decade a
// flat ~10 minutes. Compounding ×1.6 per decade makes every decade ~1.5×
// slower than the one before it: same first day, but 1e18 moves from "days"
// to "weeks" and the numbers stop running out. Measured: 9.3 bot-hours to
// 1e18, last decade ×15 longer than today's.
export const paybackGrowthPerDecade = 1.6;
export const paybackMultMin = 0.5; // early game: half-price upgrades
export const paybackMultMax = 1e6; // still bounded, but far past any reachable rate

// --- "Upgrade all" convenience (paced so it isn't a free fast-forward) --------
// Pressing it charges a service fee (this many seconds of your income) that
// DOUBLES with each use in the session, and then locks the button for a cooldown.
export const upgradeAllCooldownMs = 60_000; // 1-minute lock after each use (no fee)

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
  // The robot hand's cost curve. Its effect is an auto-tap rate — see
  // autoTapRatePerLevel above — so effectPerLevel here is unused.
  autoTap: { costBase: 240, costGrowth: 1.95, effectPerLevel: 0 },
  // +12% to all creature income per level.
  nurture: { costBase: 250, costGrowth: 1.8, effectPerLevel: 0.12 },
  // +3% chance for a critical tap per level.
  crit: { costBase: 800, costGrowth: 2.15, effectPerLevel: 0.03 },
  // shifts hatch odds toward rare/legendary per level.
  // costGrowth 2.25 → 1.9 (gacha audit): luck is the biggest lever on the
  // collection chase (~12x fewer hatches to full at cap, per simulation), but
  // at 2.25 maxing it cost ~2.1B goo — affordable only once the player is
  // already circling prestige, i.e. AFTER the chase it exists to accelerate.
  // At 1.9 max-luck lands near ~300M, inside the actual collection window.
  luck: { costBase: 1200, costGrowth: 1.9, effectPerLevel: 0.02 },
};

// --- Critical taps -----------------------------------------------------------
export const critBaseChance = 0.02; // before any upgrade
export const critChanceCap = 0.6;
export const critMultiplier = 8; // a crit tap is worth this many normal taps

// A tap is never worth less than this share of the player's own production.
//
// Without a floor, tapping dies. The "strong finger" upgrade's cost grows ×1.5
// per level while its effect grows ×1.21, so every level is ~24% worse value
// than the last, while creature levels are payback-priced and hold their value
// forever. Creatures therefore always win in the end: measured, taps fall from
// ~67% of income early to literally 0% by the billions, and the robot hand
// never even reaches its own rate cap because buying it stops being worth it.
//
// Fixing that through the cost curves is a knife edge — exponential effect vs
// exponential cost has no stable middle. Dropping the finger's growth to 1.32
// inflates income a hundred-thousandfold; to 1.21 it reaches 1e198. This floor
// sidesteps the whole problem: tied to production, tapping can't decay, and
// because it's a SHARE of production it can't run away either.
export const tapProductionShare = 0.02;

// --- Combo milestones --------------------------------------------------------
// Sustained rapid tapping pays off: reaching a combo milestone grants a lump sum
// worth (milestone × current tap value) — the streak "cashed in", so a longer
// combo pays proportionally more. Early ramp, then a bonus every N combo FOREVER
// (…500, 1000, 1500, 2000…) so it never stops rewarding.
export const comboMilestones = [50, 100, 250];
export const comboRepeatEvery = 500;
// Combo payouts are multiplied by this — bumped to make active tapping (combos)
// more rewarding relative to idle income.
export const comboRewardMult = 2;
// How long a tap keeps the combo alive. Widened 1200 → 1600 (playtest): a kid
// who taps, pauses to watch the blob, then taps again shouldn't lose the whole
// streak — and a missed window now HALVES the count instead of zeroing it (see
// ClickScreen), so natural bursty tapping still builds toward the payouts.
export const comboWindowMs = 1600;

// --- Luck (hatch odds shift) -------------------------------------------------
export const luckCap = 0.35; // max fraction shifted from common → rare/legendary
export const luckRareShare = 0.7; // of the shifted mass, this goes to rare…
export const luckLegendaryShare = 0.3; // …and this to legendary

// --- Evolution cost ----------------------------------------------------------
// An evolution costs this many seconds of the extra income it grants — same
// sensible payback idea as leveling, but a bigger commitment (a premium jump).
export const evolvePaybackSeconds = 600;

// Evolution already costs more for a rarer creature, because it's priced as a
// payback on the income the evolution adds and a legendary adds far more — a
// legendary evolution runs ~350× a common one. What was identical across
// rarities was the *payback time*: 1500s for every creature, so a rare one was
// no bigger a commitment than a common one, just a bigger number.
//
// That's why a freshly-hatched legendary could be taken through three of its
// four evolutions in about a minute of a wealthy player's income. This makes
// rarity a real investment rather than only a larger price tag.
export const evolveRarityCostMult: Record<Rarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3.5,
  legendary: 6,
};

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
// The FIRST bonus of an early-game session comes fast so a normal-paced player
// gets a payoff inside their first minute — the 42-88s floor left the opening
// stretch (the most retention-critical part) with nothing scheduled. Only fires
// while the player is still new (see ClickScreen gate); steady-state is unchanged.
export const firstBonusDelayMinMs = 12000;
export const firstBonusDelayMaxMs = 20000;
export const bonusLifetimeMs = 9000; // how long it stays before drifting off
export const bonusIncomeSeconds = 40; // reward ≈ this many seconds of passive income
export const bonusClickEquivalent = 40; // …or this many taps, whichever is larger
export const bonusMinGoo = 20; // floor so it always feels worth it
export const frenzyMultiplier = 8; // tap power during a frenzy
export const frenzyDurationMs = 9000;

// --- Rewarded bonus (the "watch to boost" mechanic) --------------------------
// A button that, after a short (placeholder) ad, grants a big timed boost to
// BOTH taps and passive income. This is the hook that later carries real
// rewarded ads — the reward is generous on purpose so watching feels worth it.
export const adRewardMult = 3; // ×income and ×taps while the boost is live
// A full minute (was 30s): the watch-an-ad ritual costs a kid real attention,
// and 30 seconds of reward for it felt thin next to that cost — the product
// review called it the weakest number in the ads flow. The toast has always
// said "for a minute"; now it's true.
export const adRewardDurationMs = 60000;
// 10min → 6min (monetization audit): sessions average ~5 active minutes, so a
// 10-minute recharge structurally capped the boost at one watch per SESSION —
// only long sessions ever saw a second. Opt-in with no penalty for skipping,
// so a shorter window adds opportunity, never pressure.
export const adRewardCooldownMs = 360000;
// "Watch an ad → a free egg" (the hatch screen's rewarded placement). The
// cooldown keeps it a treat, not an egg firehose — and the economy self-limits
// anyway: every egg (free or bought) raises the escalating egg-price curve via
// totalHatches, so farmed free eggs mostly make future eggs pricier.
export const adEggCooldownMs = 30 * 60 * 1000;
// The ad egg's own rarity table (owner-set): a real reason to watch. The
// remaining 85% splits between common/uncommon at their base ratio, so this
// is "the same egg with the top boosted", not a different game.
// Raised 0.05/0.10 → 0.12/0.30 (economy verification round): cheapening the
// luck upgrade let a maxed-luck NATURAL roll (11% legendary / 29% rare) beat
// the ad egg from ~day 3 — the one reward ad had become objectively worse
// odds. The ad egg must stay the best egg in the game at any luck level.
export const adEggLegendaryChance = 0.12;
export const adEggRareChance = 0.3;
// 4s → 10s: real rewarded video runs 15-30s, and a 4s demo was training kids
// on a reward-per-effort ratio that would break the day AdSense goes live.
// 10s is the compromise — closer to reality without making today's demo a slog.
export const adPlaceholderMs = 10000;

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
  // Runs to all 24 creatures (16 egg-hatchable + 8 click-unlock). It used to
  // stop at 16, so the click-unlock grind — up to a 500K-tap legendary — paid no
  // achievement/star at all, and the "collected everything" line could never
  // fire. Top tier == TOTAL_CREATURES, so nameFor's all-collected branch lands.
  collection: [4, 8, 12, 16, 20, 24],
  shinies: [1, 3, 6, 10, 16, 20, 24],
  // open-ended, up to 100 trillion lifetime goo (with ~half-step tiers)
  // Extended past 1e14 (owner-approved rebalance): the old top tier fell on
  // day two of real play, and a deep player then never saw another badge.
  // With the geometric wealth brake these upper floors span weeks-to-months.
  // Top tier is 6e23 to line up with the game's biggest milestone (Avogadro's
  // number) — so the ultimate "fun fact" celebration and the final badge land
  // together instead of an order of magnitude apart.
  lifetime: [1e3, 5e3, 2e4, 1e5, 3e5, 1e6, 3e6, 1e7, 3e7, 1e8, 3e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e20, 1e22, 6e23],
  hatches: [10, 25, 50, 90, 150, 250, 400, 650, 1000, 1600, 2500, 4000, 6500, 10000],
  // Top extended past the highest cosmetic click-gate (600K), so the ladder
  // always reaches beyond the shop.
  clicks: [100, 300, 700, 1500, 3000, 5500, 9000, 14000, 22000, 35000, 60000, 100000, 200000, 400000, 700000, 1500000],
  bonuses: [5, 15, 30, 50, 80, 120, 180, 280, 450, 700],
  // Creatures taken to MAX evolution (stage 4 == level 100) — the single
  // hardest per-creature grind, which the binary "shiny" flag couldn't see.
  // A goo (grind) ladder, not a star, so it doesn't inflate the permanent bonus.
  maxevolved: [1, 3, 6, 12, 24],
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

// --- Daily gift + daily quests (see game/daily.ts) ---------------------------
// Rewards are SECONDS OF PASSIVE INCOME, not flat goo — a flat number is
// generous on day one and insulting a week later, while income-seconds keep
// the same felt value at every depth. Floors keep day one from paying pennies.
// Ceilings were checked against the plausibility audit: the largest single
// grant (160s) sits well inside the smallest window's ceiling.
export const dailyGiftIncomeSeconds = [40, 60, 80, 100, 130, 160] as const; // days 1–6; day 7 is eggs
export const dailyGiftMinGoo = 30; // floor per gift-day, times the day number
// Day 7 is the week's finale — a small clutch of eggs, not a lone one, so the
// payoff for a full streak feels like an event (playtest: day 7 read as flat).
export const dailyGiftDay7Eggs = 3;
// Bumped ~1.5x (playtest) to track the quest targets, which were raised twice
// since launch (taps 300→800, levels 10→65, …) while the reward stayed flat —
// the effort-to-reward ratio had drifted toward "chore". Kept modest so the
// largest combined grant stays in the same band the plausibility audit already
// tolerates for the day-6 gift.
export const dailyQuestIncomeSeconds = 90; // reward per completed quest
export const dailyQuestMinGoo = 60;
export const dailyQuestAllBonusSeconds = 225; // extra for finishing all three (x1.5 like the per-quest reward)
export const dailyQuestAllBonusMinGoo = 150;
