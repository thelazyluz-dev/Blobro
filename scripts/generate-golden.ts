// Generates src/game/__golden__/vectors.json — the golden-vector contract
// that locks the shared game rules (see CLAUDE.md, "Direction:
// server-authoritative rebuild"). Run with `npm run golden:generate`.
//
// Two different PRNG roles show up in this file — don't conflate them:
//  1. The local `mulberry32`/`recordingRng` below is a TEST-ONLY generator
//     used to feed the seeded rule functions (rollRarity/pickChar/hatch/
//     openEggs), which take `rng: () => number` as a real parameter. Instead
//     of asking the test files to reimplement a PRNG to "replay" a seed, we
//     record the EXACT sequence of draws each call consumed and bake that
//     sequence into the vectors — src/game/golden.test.ts and
//     worker/test/golden.test.ts just pop numbers off that recorded array.
//  2. `createRng` from src/game/rng.ts is the REAL production PRNG (PR 2) —
//     the one src/store.ts and, later, the server actually run. Its own
//     "rng" vector category below calls it directly (no recording needed:
//     we're locking the generator itself, not something it feeds).
//
// Never run this to "make a failing test pass" — if a golden value changes,
// that's a business-rule change that must be visible and justified in the
// PR diff (see CLAUDE.md).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as balance from '../src/game/balance';
import { abilityForType, abilityOf, type Ability, type AbilityType } from '../src/game/abilities';
import { achievements, isComplete, starBonusFor } from '../src/game/achievements';
import { characters } from '../src/game/characters';
import {
  affordableCreatureLevels,
  autoClicksPerSec,
  charIncome,
  clickPower,
  effectiveClickPower,
  creatureContribution,
  creatureIncome,
  creatureLevelCost,
  eggCost,
  evolveCost,
  evolveIncomeMult,
  gooPerSec,
  modifiersFrom,
  ownedCreatureIncome,
  rebirthGlobalMult,
  wealthPaybackMult,
} from '../src/game/economy';
import { currentEvent, eventStateAt } from '../src/game/events';
import { buyableEggs, hatch, openEggs, pickChar, rollRarity } from '../src/game/hatching';
import { milestones, milestonesCrossed } from '../src/game/milestones';
import { computeOffline } from '../src/game/offline';
import { createRng, type RngState } from '../src/game/rng';
import { migrate, defaultSaveState } from '../src/game/save';
import { plausibilityCeiling, verifySaveDelta } from '../src/game/verify';
import { defaultUpgrades } from '../src/game/upgrades';
import type { CharId, OwnedCharacters, Rarity, Upgrades } from '../src/game/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../src/game/__golden__/vectors.json');

// ── A tiny deterministic PRNG, generator-only (see file header) ────────────
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wrap a PRNG so every draw it produces is also pushed onto `consumed` —
 * this is what lets us bake "replayable" sequences into the JSON instead of
 * shipping the PRNG algorithm itself. */
function recordingRng(seed: number): { rng: () => number; consumed: number[] } {
  const base = mulberry32(seed);
  const consumed: number[] = [];
  return {
    rng: () => {
      const v = base();
      consumed.push(v);
      return v;
    },
    consumed,
  };
}

function upgrades(over: Partial<Upgrades> = {}): Upgrades {
  return { ...defaultUpgrades, ...over };
}

// ── modifiersFrom ────────────────────────────────────────────────────────
interface ModParams {
  upgrades: Upgrades;
  achievementStarBonus: number;
  clickCosmeticBonus?: number;
  incomeCosmeticBonus?: number;
}
function mods(p: ModParams) {
  return modifiersFrom(p.upgrades, p.achievementStarBonus, p.clickCosmeticBonus ?? 0, p.incomeCosmeticBonus ?? 0);
}

const modifiersFromCases: { params: ModParams; expected: ReturnType<typeof modifiersFrom> }[] = [
  { params: { upgrades: upgrades(), achievementStarBonus: 0 } },
  { params: { upgrades: upgrades({ finger: 5, power: 4, nurture: 3, crit: 6, luck: 8 }), achievementStarBonus: 0.06 } },
  { params: { upgrades: upgrades({ power: 20, crit: 40, luck: 50 }), achievementStarBonus: 0.3 } },
  {
    params: {
      upgrades: upgrades({ finger: 10, power: 2, nurture: 5 }),
      achievementStarBonus: 0.02,
      clickCosmeticBonus: 0.15,
      incomeCosmeticBonus: 0.1,
    },
  },
  { params: { upgrades: upgrades({ crit: 1000, luck: 1000 }), achievementStarBonus: 0 } }, // caps
].map((c) => ({ params: c.params, expected: mods(c.params) }));

// ── clickPower ───────────────────────────────────────────────────────────
const clickPowerCases = [
  { params: { upgrades: upgrades(), achievementStarBonus: 0 } },
  { params: { upgrades: upgrades({ finger: 1 }), achievementStarBonus: 0 } },
  { params: { upgrades: upgrades({ finger: 10 }), achievementStarBonus: 0 } },
  { params: { upgrades: upgrades({ finger: 5, power: 4 }), achievementStarBonus: 0 } },
  { params: { upgrades: upgrades({ finger: 5, power: 4 }), achievementStarBonus: 0.1 } },
  { params: { upgrades: upgrades({ power: 20 }), achievementStarBonus: 0.3, clickCosmeticBonus: 0.2 } },
  { params: { upgrades: upgrades({ finger: 50, power: 10 }), achievementStarBonus: 0.15 } },
  { params: { upgrades: upgrades({ finger: 200 }), achievementStarBonus: 0 } },
].map((c) => ({ ...c, expected: clickPower(mods(c.params)) }));

// ── autoClicksPerSec ─────────────────────────────────────────────────────
const autoClicksPerSecCases = [0, 1, 10, 40, 1000].map((level) => ({
  level,
  expected: autoClicksPerSec(level),
}));

// ── charIncome ───────────────────────────────────────────────────────────
const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];
const charIncomeCases: { rarity: Rarity; level: number; expected: number }[] = [];
for (const rarity of rarities) {
  for (const level of [1, 2, 10, 50, 200]) {
    charIncomeCases.push({ rarity, level, expected: charIncome(rarity, level) });
  }
}

// ── evolveIncomeMult ─────────────────────────────────────────────────────
const evolveIncomeMultCases = Array.from({ length: balance.maxEvolution + 1 }, (_, evolution) => ({
  evolution,
  expected: evolveIncomeMult(evolution),
}));

// ── ownedCreatureIncome ──────────────────────────────────────────────────
const ownedCreatureIncomeCases: {
  rarity: Rarity;
  held: { level: number; evolution?: number; rebirths?: number };
  incomeMult: number;
  expected: number;
}[] = [
  { rarity: 'common', held: { level: 1 }, incomeMult: 1 },
  { rarity: 'common', held: { level: 50 }, incomeMult: 1 },
  { rarity: 'uncommon', held: { level: 10, evolution: 1 }, incomeMult: 1 },
  { rarity: 'rare', held: { level: 25, evolution: 2 }, incomeMult: 1 },
  { rarity: 'rare', held: { level: 25, evolution: 2 }, incomeMult: 2 }, // click-unlock creature
  { rarity: 'legendary', held: { level: 100, evolution: 4 }, incomeMult: 1 },
  { rarity: 'legendary', held: { level: 100, evolution: 4 }, incomeMult: 2 },
  { rarity: 'common', held: { level: 500, evolution: 0 }, incomeMult: 1 },
  { rarity: 'uncommon', held: { level: 3 }, incomeMult: 2 },
  { rarity: 'legendary', held: { level: 1 }, incomeMult: 1 },
].map((c) => ({ ...c, expected: ownedCreatureIncome(c.rarity, c.held, c.incomeMult) }));

// ── creatureContribution ─────────────────────────────────────────────────
const creatureContributionCases: {
  rarity: Rarity;
  held: { level: number; evolution?: number };
  modParams: ModParams;
  incomeMult: number;
  expected: number;
}[] = [
  { rarity: 'common', held: { level: 1 }, modParams: { upgrades: upgrades(), achievementStarBonus: 0 }, incomeMult: 1 },
  {
    rarity: 'uncommon',
    held: { level: 15, evolution: 1 },
    modParams: { upgrades: upgrades({ nurture: 5 }), achievementStarBonus: 0.05 },
    incomeMult: 1,
  },
  {
    rarity: 'rare',
    held: { level: 30, evolution: 2 },
    modParams: { upgrades: upgrades({ nurture: 20 }), achievementStarBonus: 0.1 },
    incomeMult: 2,
  },
  {
    rarity: 'legendary',
    held: { level: 60, evolution: 3 },
    modParams: { upgrades: upgrades({ nurture: 40 }), achievementStarBonus: 0.2 },
    incomeMult: 1,
  },
  {
    rarity: 'legendary',
    held: { level: 200, evolution: 4 },
    modParams: { upgrades: upgrades(), achievementStarBonus: 0 },
    incomeMult: 2,
  },
  {
    rarity: 'common',
    held: { level: 1000 },
    modParams: { upgrades: upgrades({ nurture: 100 }), achievementStarBonus: 0.3 },
    incomeMult: 1,
  },
  {
    rarity: 'uncommon',
    held: { level: 1 },
    modParams: { upgrades: upgrades(), achievementStarBonus: 0 },
    incomeMult: 1,
  },
  {
    rarity: 'rare',
    held: { level: 1, evolution: 0 },
    modParams: { upgrades: upgrades({ nurture: 3 }), achievementStarBonus: 0 },
    incomeMult: 2,
  },
].map((c) => ({ ...c, expected: creatureContribution(c.rarity, c.held, mods(c.modParams), c.incomeMult) }));

// ── owned-set scenarios shared by creatureIncome / gooPerSec ────────────
const ownedSets: { owned: OwnedCharacters; modParams: ModParams }[] = [
  { owned: {}, modParams: { upgrades: upgrades(), achievementStarBonus: 0 } },
  { owned: { blombo: { level: 20 } }, modParams: { upgrades: upgrades(), achievementStarBonus: 0 } },
  {
    owned: { blombo: { level: 20 }, fizzik: { level: 5 }, skwibbly: { level: 10, evolution: 1 } },
    modParams: { upgrades: upgrades({ nurture: 8 }), achievementStarBonus: 0.03 },
  },
  {
    owned: {
      zapparoo: { level: 40, evolution: 2 },
      gigablorf: { level: 15 },
      dondonu: { level: 100, evolution: 3 }, // click-unlock, incomeMult applies
      idanosau: { level: 5 },
    },
    modParams: { upgrades: upgrades({ nurture: 30 }), achievementStarBonus: 0.15 },
  },
  {
    owned: Object.fromEntries(characters.map((c) => [c.id, { level: 10, evolution: 1 }])) as OwnedCharacters,
    modParams: { upgrades: upgrades({ nurture: 50 }), achievementStarBonus: 0.2 },
  },
];

const creatureIncomeCases = ownedSets.map((s) => ({
  ...s,
  expected: creatureIncome(s.owned, mods(s.modParams)),
}));
const gooPerSecCases = ownedSets.map((s) => ({
  ...s,
  expected: gooPerSec(s.owned, mods(s.modParams)),
}));

// ── eggCost ──────────────────────────────────────────────────────────────
const eggCostCases = [0, 1, 10, 50, 200].map((n) => ({ n, expected: eggCost(n) }));

// ── wealthPaybackMult ────────────────────────────────────────────────────
const wealthPaybackMultCases = [0, 1, 10, 1e3, 1e6, 1e9, 1e12, 1e30].map((rate) => ({
  rate,
  expected: wealthPaybackMult(rate),
}));

// ── creatureLevelCost / evolveCost at several wealth levels ─────────────
const wealthLevels = [0, 100, 1e4, 1e7, 1e12];
const levelCostHeld = { rarity: 'rare' as Rarity, held: { level: 12, evolution: 1 } };
const evolveCostHeld = { rarity: 'uncommon' as Rarity, held: { level: 25, evolution: 0 } };
const modParamsForCosts: ModParams = { upgrades: upgrades({ nurture: 6 }), achievementStarBonus: 0.02 };

// A reborn creature (rebirths > 0) MUST still cost a sensible, positive amount —
// the "next level" has to carry the same rebirth bonus, or the gain goes
// negative and the cost floors to 1 goo (the bug this locks against). Priced
// at a high wealth level, where the bug was most visible.
const rebornLevelCostHeld = { rarity: 'rare' as Rarity, held: { level: 12, evolution: 1, rebirths: 3 } };
const creatureLevelCostCases = [
  ...wealthLevels.map((gooPerSecValue) => ({
    ...levelCostHeld,
    modParams: modParamsForCosts,
    gooPerSecValue,
    incomeMult: 1,
    expected: creatureLevelCost(levelCostHeld.rarity, levelCostHeld.held, mods(modParamsForCosts), gooPerSecValue, 1),
  })),
  ...[1e7, 1e12].map((gooPerSecValue) => ({
    ...rebornLevelCostHeld,
    modParams: modParamsForCosts,
    gooPerSecValue,
    incomeMult: 1,
    expected: creatureLevelCost(rebornLevelCostHeld.rarity, rebornLevelCostHeld.held, mods(modParamsForCosts), gooPerSecValue, 1),
  })),
];

// Every rarity, not just one: evolution now carries an explicit per-rarity
// cost multiplier (balance.evolveRarityCostMult), so a vector set that only
// exercised `uncommon` would let three quarters of that rule change silently.
const evolveCostCases = rarities.flatMap((rarity) =>
  wealthLevels.map((gooPerSecValue) => ({
    ...evolveCostHeld,
    rarity,
    modParams: modParamsForCosts,
    gooPerSecValue,
    incomeMult: 2,
    expected: evolveCost(rarity, evolveCostHeld.held, mods(modParamsForCosts), gooPerSecValue, 2),
  })),
);

// ── affordableCreatureLevels ─────────────────────────────────────────────
const affordableCreatureLevelsCases = [0, 50, 5_000, 500_000, 1e9].map((goo) => {
  const rarity: Rarity = 'common';
  const held = { level: 1 };
  const modParams: ModParams = { upgrades: upgrades(), achievementStarBonus: 0 };
  const gooPerSecValue = 100;
  return {
    rarity,
    held,
    modParams,
    goo,
    gooPerSecValue,
    incomeMult: 1,
    expected: affordableCreatureLevels(rarity, held, mods(modParams), goo, gooPerSecValue, 1),
  };
});
// Level-cap cases (§ owner rule): handed enough goo to blow well past level 500,
// a not-yet-mastered creature still stops AT the cap (level 1 → 500, i.e. 499
// buys), while a fully-reborn creature (rebirths >= rebirthCap) is uncapped and
// keeps climbing past it. Pins maxCharLevel through the buyer that consumes it,
// on BOTH the client and the Worker (they iterate this same array).
{
  const rarity: Rarity = 'common';
  const modParams: ModParams = { upgrades: upgrades(), achievementStarBonus: 0 };
  const gooPerSecValue = 100;
  const goo = 1e13; // more than enough to reach 500 from level 1
  const capCases = [
    { held: { level: 1 } }, // below the rebirth cap → clamps at 500 (499 buys)
    { held: { level: 1, rebirths: balance.rebirthCap } }, // mastered → climbs past 500
  ].map(({ held }) => ({
    rarity,
    held,
    modParams,
    goo,
    gooPerSecValue,
    incomeMult: 1,
    expected: affordableCreatureLevels(rarity, held, mods(modParams), goo, gooPerSecValue, 1),
  }));
  affordableCreatureLevelsCases.push(...capCases);
}

// ── rollRarity — seeded ──────────────────────────────────────────────────
interface RollRarityCtx {
  sinceRare: number;
  totalHatches: number;
  legendaryOwned: boolean;
  luck?: number;
}
function genRollRarity(seed: number, ctx: RollRarityCtx, calls: number) {
  const { rng, consumed } = recordingRng(seed);
  const results: Rarity[] = [];
  const rngLenPerCall: number[] = [];
  let prevLen = 0;
  for (let i = 0; i < calls; i++) {
    results.push(rollRarity(rng, ctx));
    rngLenPerCall.push(consumed.length - prevLen);
    prevLen = consumed.length;
  }
  return { seed, ctx, calls, rngValues: consumed, rngLenPerCall, expected: results };
}
const rollRarityCases = [
  genRollRarity(1001, { sinceRare: 0, totalHatches: 0, legendaryOwned: false, luck: 0 }, 30),
  genRollRarity(1002, { sinceRare: balance.pityRareThreshold, totalHatches: 5, legendaryOwned: false, luck: 0 }, 20),
  genRollRarity(1003, { sinceRare: 0, totalHatches: balance.pityLegendaryThreshold, legendaryOwned: false, luck: 0 }, 10),
  genRollRarity(1004, { sinceRare: 0, totalHatches: 0, legendaryOwned: false, luck: 0.3 }, 30),
  genRollRarity(1005, { sinceRare: 0, totalHatches: 200, legendaryOwned: true, luck: 0 }, 15),
];

// ── pickChar — seeded ────────────────────────────────────────────────────
function genPickChar(seed: number, rarity: Rarity, calls: number) {
  const { rng, consumed } = recordingRng(seed);
  const results: CharId[] = [];
  for (let i = 0; i < calls; i++) results.push(pickChar(rng, rarity));
  return { seed, rarity, calls, rngValues: consumed, expected: results };
}
const pickCharCases = [
  genPickChar(2101, 'common', 15),
  genPickChar(2102, 'uncommon', 15),
  genPickChar(2103, 'rare', 15),
  genPickChar(2104, 'legendary', 15),
];

// ── hatch — seeded sequential simulation ─────────────────────────────────
// Each step records the ctx it was called with (self-contained — the test
// doesn't need to re-derive state, just replay it) plus the exact rng
// values that one call consumed and the outcome it produced.
function genHatchSequence(seed: number, luck: number, steps: number) {
  const { rng, consumed } = recordingRng(seed);
  let owned: OwnedCharacters = {};
  let sinceRare = 0;
  let totalHatches = 0;
  const stepVectors: {
    ctxIn: { owned: OwnedCharacters; sinceRare: number; totalHatches: number; luck: number };
    rngValues: number[];
    expected: ReturnType<typeof hatch>;
  }[] = [];
  let prevLen = 0;
  for (let i = 0; i < steps; i++) {
    const ctxIn = { owned: { ...owned }, sinceRare, totalHatches, luck };
    const outcome = hatch(rng, ctxIn);
    const rngValues = consumed.slice(prevLen);
    prevLen = consumed.length;
    stepVectors.push({ ctxIn, rngValues, expected: outcome });

    const existing = owned[outcome.charId];
    owned = { ...owned, [outcome.charId]: existing ? { ...existing, level: outcome.level } : { level: outcome.level } };
    sinceRare = outcome.nextSinceRare;
    totalHatches = outcome.nextTotalHatches;
  }
  return { seed, luck, steps: stepVectors };
}
const hatchCases = [genHatchSequence(3001, 0, 20), genHatchSequence(3002, 0.2, 15)];

// ── openEggs — seeded ────────────────────────────────────────────────────
function genOpenEggs(
  seed: number,
  owned: OwnedCharacters,
  sinceRare: number,
  totalHatches: number,
  luck: number,
  count: number,
) {
  const { rng, consumed } = recordingRng(seed);
  const result = openEggs({ rng, owned, sinceRare, totalHatches, luck, count });
  return { seed, owned, sinceRare, totalHatches, luck, count, rngValues: consumed, expected: result };
}
const openEggsCases = [
  genOpenEggs(4001, {}, 0, 0, 0, 10),
  genOpenEggs(4002, { blombo: { level: 3 } }, 5, 8, 0, 25),
  genOpenEggs(4003, {}, balance.pityRareThreshold - 2, 0, 0.1, 5),
  genOpenEggs(4004, { gigablorf: { level: 2 } }, 0, balance.pityLegendaryThreshold - 3, 0, 5),
];

// ── buyableEggs ──────────────────────────────────────────────────────────
const buyableEggsCases = [
  { goo: 0, acquired: 0, maxCount: 50 },
  { goo: 100, acquired: 0, maxCount: 50 },
  { goo: 100_000, acquired: 10, maxCount: 50 },
  { goo: 1e9, acquired: 100, maxCount: 50 },
  { goo: 1e9, acquired: 100, maxCount: 5 }, // maxCount binds
  { goo: 50, acquired: 0, maxCount: 200 },
].map((c) => ({ ...c, expected: buyableEggs(c.goo, c.acquired, c.maxCount, eggCost) }));

// ── rebirthGlobalMult — the GLOBAL rebirth income multiplier ──────────────
// +rebirthIncomeBonus per counted rebirth across the roster; each creature is
// clamped to rebirthCap and the SUM to rebirthGlobalCap. These vectors pin the
// summation and BOTH clamps for the client and the Worker.
const rebirthGlobalMultCases: { owned: OwnedCharacters; expected: number }[] = [
  { owned: {} },
  { owned: { blombo: { level: 20 } } }, // no rebirths → 1
  { owned: { blombo: { level: 20, rebirths: 3 } } }, // +30%
  { owned: { blombo: { level: 20, rebirths: 1 }, fizzik: { level: 5, rebirths: 2 }, nono: { level: 8, rebirths: 4 } } }, // sums to 7 → +70%
  { owned: { blombo: { level: 1, rebirths: 999 } } }, // one creature clamped to rebirthCap
  { owned: Object.fromEntries(characters.map((c) => [c.id, { level: 1, rebirths: 20 }])) as OwnedCharacters }, // sum clamped to rebirthGlobalCap
].map((c) => ({ ...c, expected: rebirthGlobalMult(c.owned) }));

// ── abilityOf — every creature ───────────────────────────────────────────
const abilityOfCases = characters.map((def) => ({
  id: def.id,
  rarity: def.rarity,
  expected: abilityOf(def.id, def.rarity),
}));

// ── abilityOf with rebirths — the mastering loop ──────────────────────────
// Locks value = base × (1 + abilityRebirthBonus × min(rebirths, rebirthCap))
// for both the client and the Worker. rebirths 0 must equal the plain case
// above; the last case proves the anti-cheat clamp (999 credits as the cap).
const abilityOfRebirthCases: { id: CharId; rarity: Rarity; rebirths: number; expected: Ability }[] = [
  { id: 'blombo', rarity: 'common', rebirths: 0 }, // == base
  { id: 'fizzik', rarity: 'common', rebirths: 1 }, // tap
  { id: 'mumbo', rarity: 'uncommon', rebirths: 5 }, // income
  { id: 'gigablorf', rarity: 'legendary', rebirths: 20 }, // income, at the cap
  { id: 'dragapuf', rarity: 'legendary', rebirths: 999 }, // tap, clamped to the cap
  { id: 'grumpolo', rarity: 'common', rebirths: 8 }, // crit (value grows; the game clamps the CHANCE, not this base)
].map((c) => ({ ...c, expected: abilityOf(c.id, c.rarity, c.rebirths) }));

// ── abilityForType — the chosen SECOND ability (10th rebirth) ─────────────
// Value straight off the rarity curve for a picked type, no rebirth scaling.
// Locks client (store) and Worker (verify) on the same second-ability values.
const abilityForTypeCases: { type: AbilityType; rarity: Rarity; expected: Ability }[] = (
  ['tap', 'income', 'crit', 'luck', 'combo', 'bonus'] as AbilityType[]
).flatMap((type) =>
  (['common', 'rare', 'legendary'] as Rarity[]).map((rarity) => ({ type, rarity, expected: abilityForType(type, rarity) })),
);

// ── starBonusFor ─────────────────────────────────────────────────────────
const starAchievementIds = achievements.filter((a) => a.starReward > 0).map((a) => a.id);
const starBonusForCases = [
  { claimedIds: [] as string[] },
  { claimedIds: [starAchievementIds[0]] },
  { claimedIds: starAchievementIds.slice(0, 3) },
  { claimedIds: starAchievementIds },
  { claimedIds: achievements.map((a) => a.id) }, // includes non-star ids too — must not double count
].map((c) => ({ ...c, expected: starBonusFor(c.claimedIds) }));

// ── isComplete ───────────────────────────────────────────────────────────
const isCompleteCases = [
  { id: 'collection-4', ctx: { collectionCount: 3, shinyCount: 0, lifetimeGoo: 0, totalHatches: 0, clicks: 0, bonusesCollected: 0 } },
  { id: 'collection-4', ctx: { collectionCount: 4, shinyCount: 0, lifetimeGoo: 0, totalHatches: 0, clicks: 0, bonusesCollected: 0 } },
  { id: 'collection-4', ctx: { collectionCount: 24, shinyCount: 0, lifetimeGoo: 0, totalHatches: 0, clicks: 0, bonusesCollected: 0 } },
  { id: 'shinies-1', ctx: { collectionCount: 0, shinyCount: 0, lifetimeGoo: 0, totalHatches: 0, clicks: 0, bonusesCollected: 0 } },
  { id: 'shinies-1', ctx: { collectionCount: 0, shinyCount: 1, lifetimeGoo: 0, totalHatches: 0, clicks: 0, bonusesCollected: 0 } },
  { id: 'lifetime-1000', ctx: { collectionCount: 0, shinyCount: 0, lifetimeGoo: 999, totalHatches: 0, clicks: 0, bonusesCollected: 0 } },
  { id: 'lifetime-1000', ctx: { collectionCount: 0, shinyCount: 0, lifetimeGoo: 1000, totalHatches: 0, clicks: 0, bonusesCollected: 0 } },
  { id: 'hatches-10', ctx: { collectionCount: 0, shinyCount: 0, lifetimeGoo: 0, totalHatches: 9, clicks: 0, bonusesCollected: 0 } },
  { id: 'clicks-100', ctx: { collectionCount: 0, shinyCount: 0, lifetimeGoo: 0, totalHatches: 0, clicks: 100, bonusesCollected: 0 } },
  { id: 'bonuses-5', ctx: { collectionCount: 0, shinyCount: 0, lifetimeGoo: 0, totalHatches: 0, clicks: 0, bonusesCollected: 4 } },
  { id: 'maxevolved-1', ctx: { collectionCount: 0, shinyCount: 0, lifetimeGoo: 0, totalHatches: 0, clicks: 0, bonusesCollected: 0, maxEvolvedCount: 0 } },
  { id: 'maxevolved-1', ctx: { collectionCount: 0, shinyCount: 0, lifetimeGoo: 0, totalHatches: 0, clicks: 0, bonusesCollected: 0, maxEvolvedCount: 1 } },
].map((c) => {
  const def = achievements.find((a) => a.id === c.id);
  if (!def) throw new Error(`unknown achievement id in golden generator: ${c.id}`);
  return { ...c, expected: isComplete(def, c.ctx) };
});

// ── computeOffline ───────────────────────────────────────────────────────
const computeOfflineCases = [
  { rate: 0, secondsAway: 100 }, // rate <= 0 → null
  { rate: 10, secondsAway: 0 }, // below min → null
  { rate: 10, secondsAway: balance.offlineMinSeconds }, // exactly at min → still null (strictly >)
  { rate: 10, secondsAway: balance.offlineMinSeconds + 1 }, // just above min
  { rate: 10, secondsAway: 300 },
  { rate: 10, secondsAway: balance.offlineCapSeconds }, // exactly at cap → not "capped"
  { rate: 10, secondsAway: balance.offlineCapSeconds + 1 }, // just above cap → capped
  { rate: 1_000_000, secondsAway: 10_000 }, // far above cap, huge rate
].map((c) => ({ ...c, expected: computeOffline(c.rate, c.secondsAway) }));

// ── migrate ──────────────────────────────────────────────────────────────
// Save migration became a SHARED rule in PR 4: the server sanitizes every
// uploaded save with this same function, so client and server must agree on
// exactly what a save is. Drift here doesn't just break a screen — it
// silently rewrites a child's progress on every cloud round-trip.
//
// Every case pins a valid `rng` and an explicit `lastSeen`, because migrate's
// fallbacks for those two are deliberately non-deterministic (randomSeed(),
// and `now`). The fallback behaviour itself is covered by src/game/save.test.ts,
// which can assert "a fresh seed appeared" without baking a random number into
// a contract file.
// `freshRng` marks the cases whose input carries no usable rng stream, so
// migrate mints a random seed. Baking that seed into the file would make
// vectors.json churn on every regeneration and turn a contract into noise, so
// the generator nulls it out and the tests assert its shape instead of its
// value. Every other case pins a stream and is compared in full.
const MIGRATE_NOW = 1_754_000_000_000;
const validRng = { seed: 123456789, cursor: 42 };
const migrateCases = [
  { label: 'empty object → defaults', raw: {}, freshRng: true },
  { label: 'null → defaults', raw: null, freshRng: true },
  { label: 'garbage scalar → defaults', raw: 7, freshRng: true },
  { label: 'a malformed rng stream is replaced, not trusted', raw: { version: 12, lastSeen: MIGRATE_NOW, rng: { seed: 'nope', cursor: -1 } }, freshRng: true },
  {
    label: 'v1 single fingerLevel folds into the upgrades map',
    raw: { version: 1, fingerLevel: 9, goo: 500, lastSeen: MIGRATE_NOW, rng: validRng },
  },
  {
    label: 'pre-v6 additive creature levels are remapped to compounding',
    raw: {
      version: 5,
      characters: { blobby: { level: 94072 }, drippy: { level: 1 } },
      lastSeen: MIGRATE_NOW,
      rng: validRng,
    },
  },
  {
    label: 'legacy shiny:true becomes evolution stage 1',
    raw: {
      version: 11,
      characters: { blobby: { level: 200, shiny: true } },
      lastSeen: MIGRATE_NOW,
      rng: validRng,
    },
  },
  {
    label: 'evolution is capped to what the level allows',
    raw: {
      version: 11,
      characters: { blobby: { level: 1, evolution: 99 } },
      lastSeen: MIGRATE_NOW,
      rng: validRng,
    },
  },
  {
    label: 'unknown creature ids and unknown cosmetics are dropped',
    raw: {
      version: 12,
      characters: { blobby: { level: 3 }, 'not-a-creature': { level: 999 } },
      ownedCosmetics: ['definitely-not-a-cosmetic'],
      lastSeen: MIGRATE_NOW,
      rng: validRng,
    },
  },
  {
    label: 'negative and non-finite numbers are clamped, never NaN',
    raw: {
      version: 12,
      goo: -5,
      lifetimeGoo: Number.NaN,
      eggs: -3,
      clicks: 12.9,
      lastSeen: MIGRATE_NOW,
      rng: validRng,
    },
  },
  {
    label: 'equipping an unowned cosmetic falls back to the free default',
    raw: {
      version: 12,
      ownedCosmetics: [],
      equippedBackground: 'bg-that-is-not-owned',
      equippedAccessory: 'acc-that-is-not-owned',
      lastSeen: MIGRATE_NOW,
      rng: validRng,
    },
  },
  {
    label: 'an in-progress rng stream survives untouched',
    raw: { version: 12, lastSeen: MIGRATE_NOW, rng: { seed: 4294967295, cursor: 1000 } },
  },
  {
    label: 'leaderboard entries are trimmed, sorted and de-junked',
    raw: {
      version: 12,
      leaderboard: [
        { name: '  ', clicks: 99 },
        { name: 'גִּיל', clicks: 10 },
        { name: 'דָּנָה', clicks: 50 },
        { name: 'רָן', clicks: -4 },
      ],
      lastSeen: MIGRATE_NOW,
      rng: validRng,
    },
  },
  {
    label: 'invalid achievement ids are dropped',
    raw: { version: 12, achievements: ['not-an-achievement'], lastSeen: MIGRATE_NOW, rng: validRng },
  },
].map((c) => {
  const expected = migrate(c.raw, MIGRATE_NOW);
  const freshRng = 'freshRng' in c && c.freshRng === true;
  return { ...c, freshRng, expected: freshRng ? { ...expected, rng: null } : expected };
});


// ── effectiveClickPower ──────────────────────────────────────────────────
// A tap is worth the upgrade value OR a share of production, whichever is
// larger (see balance.tapProductionShare). The SERVER uses this too, in its
// plausibility ceiling — if the two sides disagreed about what a tap is worth,
// deep players would be flagged for tapping normally. Cases straddle the
// crossover in both directions.
const effectiveClickPowerCases = [
  { label: 'no production — upgrades decide', params: { upgrades: upgrades({ finger: 5 }), achievementStarBonus: 0 }, rate: 0 },
  { label: 'tiny production — upgrades still win', params: { upgrades: upgrades({ finger: 20 }), achievementStarBonus: 0 }, rate: 100 },
  { label: 'huge production — the floor takes over', params: { upgrades: upgrades(), achievementStarBonus: 0 }, rate: 1_000_000 },
  { label: 'deep game — floor well above the upgrades', params: { upgrades: upgrades({ finger: 30, power: 5 }), achievementStarBonus: 0.2 }, rate: 1e12 },
  { label: 'negative production is ignored, never negative pay', params: { upgrades: upgrades({ finger: 3 }), achievementStarBonus: 0 }, rate: -50 },
  { label: 'exactly at the crossover', params: { upgrades: upgrades({ finger: 10 }), achievementStarBonus: 0 }, rate: 0 },
].map((c) => ({ ...c, expected: effectiveClickPower(mods(c.params), c.rate) }));

// ── plausibility (PR 5) ──────────────────────────────────────────────────
// The server runs these to decide whether an uploaded save is physically
// achievable, so client and server MUST agree on the bound to the last
// decimal — a server that computes a slightly different ceiling than the
// client's rules imply would flag honest players.
const PLAUS_NOW = 1_754_000_000_000;
// defaultSaveState mints a RANDOM rng seed, and these cases embed the whole
// save — so leaving it would rewrite vectors.json on every regeneration and
// turn a contract file into noise. The seed is irrelevant to a plausibility
// ceiling; pin it.
const plausBase = { ...defaultSaveState(PLAUS_NOW), rng: { seed: 987_654_321, cursor: 0 } };
const plausMid = {
  ...plausBase,
  characters: { blombo: { level: 60 }, fizzik: { level: 45 }, nono: { level: 30 } },
  upgrades: { ...plausBase.upgrades, finger: 40, power: 12, nurture: 10, autoTap: 20, crit: 8, luck: 4 },
  lifetimeGoo: 5_000_000,
  clicks: 20_000,
} as typeof plausBase;

const plausibilityCeilingCases = [
  { label: 'fresh save, one minute', save: plausBase, elapsed: 60 },
  { label: 'fresh save, interval below the floor is raised to it', save: plausBase, elapsed: 0 },
  { label: 'fresh save, negative interval is floored too', save: plausBase, elapsed: -100 },
  { label: 'mid-game save, one minute', save: plausMid, elapsed: 60 },
  { label: 'mid-game save, one hour', save: plausMid, elapsed: 3600 },
  { label: 'mid-game save, a day', save: plausMid, elapsed: 86_400 },
].map((c) => ({ ...c, expected: plausibilityCeiling(c.save, c.elapsed) }));

const verifySaveDeltaCases = [
  { label: 'first-ever save has nothing to compare against', prev: null, next: plausMid, elapsed: 60 },
  {
    label: 'an honest minute of hard play is within bounds',
    prev: plausMid,
    next: { ...plausMid, lifetimeGoo: plausMid.lifetimeGoo + 12_000_000, clicks: plausMid.clicks + 300 },
    elapsed: 60,
  },
  {
    label: 'a thousandfold overshoot is flagged',
    prev: plausMid,
    next: { ...plausMid, lifetimeGoo: plausMid.lifetimeGoo + 1e15, clicks: plausMid.clicks + 300 },
    elapsed: 60,
  },
  {
    label: 'lifetimeGoo going backwards is flagged',
    prev: plausMid,
    next: { ...plausMid, lifetimeGoo: 1 },
    elapsed: 60,
  },
  {
    label: 'clicks going backwards is flagged',
    prev: plausMid,
    next: { ...plausMid, clicks: 5 },
    elapsed: 60,
  },
  {
    label: 'more taps than a human plus robot hand could make is flagged',
    prev: plausMid,
    next: { ...plausMid, clicks: plausMid.clicks + 100_000 },
    elapsed: 60,
  },
  {
    label: 'a long legitimate absence stays within bounds',
    prev: plausMid,
    next: { ...plausMid, lifetimeGoo: plausMid.lifetimeGoo + 60_000 },
    elapsed: 86_400,
  },
].map((c) => ({ ...c, expected: verifySaveDelta(c.prev, c.next, c.elapsed) }));

// ── milestonesCrossed ────────────────────────────────────────────────────
// We lock the THRESHOLDS crossed (the rule), not the celebratory copy.
const milestonesCrossedCases = [
  { prev: 0, next: 500_000 },
  { prev: 0, next: 1_000_000 },
  { prev: 999_999, next: 1_000_001 },
  { prev: 1_000_000, next: 500_000_000 },
  { prev: 5_000_000_000_000, next: 1e21 },
  { prev: 1e21, next: 1e21 }, // next <= prev → nothing crosses
].map((c) => ({ ...c, expected: milestonesCrossed(c.prev, c.next).map((m) => m.goo) }));

// ── eventStateAt ─────────────────────────────────────────────────────────
const eventTimestamps = [
  0,
  1_000,
  15_000, // mid-window of slot 0
  29_999,
  30_000,
  30_001,
  600_000,
  615_000,
  1_754_000_000_000, // a real-ish epoch ms, well into many slots
];
const eventStateAtCases = eventTimestamps.map((now) => {
  const state = eventStateAt(now);
  return {
    now,
    expected: {
      active: state.active,
      msLeft: state.msLeft,
      event: {
        id: state.event.id,
        incomeMult: state.event.incomeMult,
        clickMult: state.event.clickMult,
        eggCostMult: state.event.eggCostMult,
        luckBonus: state.event.luckBonus,
      },
      next: { id: state.next.id },
    },
    currentEventId: currentEvent(now).id,
  };
});

// ── rng (src/game/rng.ts) — the REAL production PRNG, not the local
// mulberry32 above (that one only exists to feed injected `rng: () => number`
// params for the hatching vectors and is never shipped in src/game/*). This
// category locks src/game/rng.ts itself: a fixed seed's draw sequence, and
// that resuming from a saved {seed, cursor} continues that SAME sequence —
// the exact guarantee the server needs to replay a client's stream. ────────
function genRngDraws(seed: number, count: number) {
  const rng = createRng({ seed, cursor: 0 });
  const values = Array.from({ length: count }, () => rng.next());
  return { seed, count, values, finalState: rng.state() };
}
const rngDrawCases = [1, 42, 123456789, 0xdeadbeef, 999999937].map((seed) => genRngDraws(seed, 20));

function genRngResume(seed: number, cursor: number, count: number) {
  const rng = createRng({ seed, cursor });
  const values = Array.from({ length: count }, () => rng.next());
  return { seed, cursor, count, values, finalState: rng.state() };
}
// Resuming at cursor N must reproduce draws [N..N+count) of the same seed's
// fresh-from-0 sequence — i.e. these should equal a slice of rngDrawCases'
// `values` for the matching seed (asserted directly in the test files too).
const rngResumeCases: { seed: number; cursor: number; count: number; values: number[]; finalState: RngState }[] = [
  genRngResume(1, 5, 15),
  genRngResume(42, 10, 10),
  genRngResume(123456789, 1, 19),
  genRngResume(999999937, 100, 10), // cursor far past the initial 20-draw sample above
];

// ── write ────────────────────────────────────────────────────────────────
const vectors = {
  meta: {
    generatedAt: new Date().toISOString(),
    note:
      'Golden vectors for the shared game core (src/game/*). Generated by ' +
      'scripts/generate-golden.ts — never hand-edit, and never regenerate ' +
      'just to make a failing test pass (see CLAUDE.md). Regenerating after ' +
      'an intentional rule change must show up as a reviewable diff here.',
  },
  achievementRosterSize: achievements.length,
  milestoneCount: milestones.length,
  characterCount: characters.length,
  modifiersFrom: modifiersFromCases,
  clickPower: clickPowerCases,
  autoClicksPerSec: autoClicksPerSecCases,
  charIncome: charIncomeCases,
  evolveIncomeMult: evolveIncomeMultCases,
  ownedCreatureIncome: ownedCreatureIncomeCases,
  creatureContribution: creatureContributionCases,
  creatureIncome: creatureIncomeCases,
  gooPerSec: gooPerSecCases,
  eggCost: eggCostCases,
  wealthPaybackMult: wealthPaybackMultCases,
  creatureLevelCost: creatureLevelCostCases,
  evolveCost: evolveCostCases,
  affordableCreatureLevels: affordableCreatureLevelsCases,
  rollRarity: rollRarityCases,
  pickChar: pickCharCases,
  hatch: hatchCases,
  openEggs: openEggsCases,
  buyableEggs: buyableEggsCases,
  abilityOf: abilityOfCases,
  abilityOfRebirth: abilityOfRebirthCases,
  abilityForType: abilityForTypeCases,
  rebirthGlobalMult: rebirthGlobalMultCases,
  starBonusFor: starBonusForCases,
  isComplete: isCompleteCases,
  computeOffline: computeOfflineCases,
  effectiveClickPower: effectiveClickPowerCases,
  migrate: migrateCases,
  plausibilityCeiling: plausibilityCeilingCases,
  verifySaveDelta: verifySaveDeltaCases,
  milestonesCrossed: milestonesCrossedCases,
  eventStateAt: eventStateAtCases,
  rng: {
    draws: rngDrawCases,
    resume: rngResumeCases,
  },
};

writeFileSync(OUT_PATH, JSON.stringify(vectors, null, 2) + '\n', 'utf-8');

let count = 0;
for (const [key, value] of Object.entries(vectors)) {
  if (Array.isArray(value)) count += value.length;
}
console.log(`Wrote ${OUT_PATH}`);
console.log(`${count} top-level vector cases across ${Object.keys(vectors).length - 4} rule functions.`);
