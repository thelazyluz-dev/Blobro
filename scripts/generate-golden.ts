// Generates src/game/__golden__/vectors.json — the golden-vector contract
// that locks the shared game rules (see CLAUDE.md, "Direction:
// server-authoritative rebuild"). Run with `npm run golden:generate`.
//
// This script is the ONLY place a PRNG algorithm is implemented for the
// contract tests: the seeded functions (rollRarity/pickChar/hatch/openEggs)
// take `rng: () => number` as a real parameter, so instead of asking the test
// files to reimplement mulberry32 to "replay" a seed, we record the EXACT
// sequence of random draws each call actually consumed and bake that
// sequence into the vectors. src/game/golden.test.ts and
// worker/test/golden.test.ts then just pop numbers off that recorded array —
// no PRNG in src/game, ever (see the brief: "do NOT add it to src/game/").
//
// Never run this to "make a failing test pass" — if a golden value changes,
// that's a business-rule change that must be visible and justified in the
// PR diff (see CLAUDE.md).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as balance from '../src/game/balance';
import { abilityOf } from '../src/game/abilities';
import { achievements, isComplete, starBonusFor } from '../src/game/achievements';
import { characters } from '../src/game/characters';
import {
  affordableCreatureLevels,
  autoClicksPerSec,
  charIncome,
  clickPower,
  creatureContribution,
  creatureIncome,
  creatureLevelCost,
  eggCost,
  evolveCost,
  evolveIncomeMult,
  gooPerSec,
  modifiersFrom,
  ownedCreatureIncome,
  wealthPaybackMult,
} from '../src/game/economy';
import { currentEvent, eventStateAt } from '../src/game/events';
import { buyableEggs, hatch, openEggs, pickChar, rollRarity } from '../src/game/hatching';
import { milestones, milestonesCrossed } from '../src/game/milestones';
import { computeOffline } from '../src/game/offline';
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
  held: { level: number; evolution?: number };
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

const creatureLevelCostCases = wealthLevels.map((gooPerSecValue) => ({
  ...levelCostHeld,
  modParams: modParamsForCosts,
  gooPerSecValue,
  incomeMult: 1,
  expected: creatureLevelCost(levelCostHeld.rarity, levelCostHeld.held, mods(modParamsForCosts), gooPerSecValue, 1),
}));

const evolveCostCases = wealthLevels.map((gooPerSecValue) => ({
  ...evolveCostHeld,
  modParams: modParamsForCosts,
  gooPerSecValue,
  incomeMult: 2,
  expected: evolveCost(evolveCostHeld.rarity, evolveCostHeld.held, mods(modParamsForCosts), gooPerSecValue, 2),
}));

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

// ── abilityOf — every creature ───────────────────────────────────────────
const abilityOfCases = characters.map((def) => ({
  id: def.id,
  rarity: def.rarity,
  expected: abilityOf(def.id, def.rarity),
}));

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
  starBonusFor: starBonusForCases,
  isComplete: isCompleteCases,
  computeOffline: computeOfflineCases,
  milestonesCrossed: milestonesCrossedCases,
  eventStateAt: eventStateAtCases,
};

writeFileSync(OUT_PATH, JSON.stringify(vectors, null, 2) + '\n', 'utf-8');

let count = 0;
for (const [key, value] of Object.entries(vectors)) {
  if (Array.isArray(value)) count += value.length;
}
console.log(`Wrote ${OUT_PATH}`);
console.log(`${count} top-level vector cases across ${Object.keys(vectors).length - 4} rule functions.`);
