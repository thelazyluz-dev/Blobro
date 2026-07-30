// Pure economy math. Every earnings value multiplies through globalMultiplier —
// the prestige hook — and through the achievement "star" where relevant.

import {
  autoTapRateCap,
  autoTapRatePerLevel,
  baseByRarity,
  charIncomeGrowth,
  clickBase,
  creatureLevelPaybackSeconds,
  critBaseChance,
  critChanceCap,
  eggCostBase,
  eggCostGrowth,
  evolveMultiplierByStage,
  evolvePaybackSeconds,
  maxEvolution,
  fingerBonusBase,
  fingerBonusGrowth,
  globalMultiplier,
  luckCap,
  paybackMultMax,
  paybackMultMin,
  paybackPivotRate,
  paybackSlopePerDecade,
  upgradeConfig,
} from './balance';
import { characters, incomeMultOf } from './characters';
import type { Modifiers, OwnedCharacters, Rarity, Upgrades } from './types';

/**
 * Derive all active modifiers from the upgrades map and the summed achievement
 * income bonus (each claimed achievement contributes a bonus scaled by its
 * difficulty — see game/achievements.ts).
 */
export function modifiersFrom(
  upgrades: Upgrades,
  achievementStarBonus: number,
  clickCosmeticBonus = 0,
  incomeCosmeticBonus = 0,
): Modifiers {
  return {
    fingerLevel: upgrades.finger,
    clickMultiplier: (1 + upgradeConfig.power.effectPerLevel * upgrades.power) * (1 + clickCosmeticBonus),
    incomeMultiplier: (1 + upgradeConfig.nurture.effectPerLevel * upgrades.nurture) * (1 + incomeCosmeticBonus),
    starMultiplier: 1 + achievementStarBonus,
    critChance: Math.min(critChanceCap, critBaseChance + upgradeConfig.crit.effectPerLevel * upgrades.crit),
    luck: Math.min(luckCap, upgradeConfig.luck.effectPerLevel * upgrades.luck),
  };
}

/**
 * Bonus to the tap base from the "strong finger" upgrade. Compounds per level
 * (0 at level 0), so higher levels add far more than a flat +1 — keeping the
 * upgrade worth buying as costs climb.
 */
export function fingerBonus(level: number): number {
  return fingerBonusBase * (Math.pow(fingerBonusGrowth, level) - 1);
}

/** Goo earned per manual tap (before any active frenzy). */
export function clickPower(m: Modifiers): number {
  return (
    (clickBase + fingerBonus(m.fingerLevel)) *
    m.clickMultiplier *
    m.starMultiplier *
    globalMultiplier
  );
}

/** The robot hand's auto-tap rate (taps/second) at a given upgrade level (capped). */
export function autoClicksPerSec(level: number): number {
  return Math.min(autoTapRateCap, autoTapRatePerLevel * level);
}

/** charIncome = baseByRarity × charIncomeGrowth^(level − 1) — compounding per
 * level. Exponent is guarded so an absurd level can never overflow to Infinity. */
export function charIncome(rarity: Rarity, level: number): number {
  return baseByRarity[rarity] * Math.pow(charIncomeGrowth, Math.min(level - 1, 3000));
}

/** Income × for a creature's evolution stage (0 = none). */
export function evolveIncomeMult(evolution = 0): number {
  return evolveMultiplierByStage[Math.min(Math.max(0, evolution), maxEvolution)] ?? 1;
}

/** A single owned creature's income, including its evolution (shiny) bonus and
 * its per-creature income multiplier (1 for egg creatures, higher for unlocks). */
export function ownedCreatureIncome(
  rarity: Rarity,
  held: { level: number; evolution?: number },
  incomeMult = 1,
): number {
  return charIncome(rarity, held.level) * evolveIncomeMult(held.evolution) * incomeMult;
}

/**
 * What ONE owned creature actually adds to goo/sec, with every automation
 * multiplier folded in (nurture + star + prestige + the robot hand). This is
 * the honest "this creature earns X/sec" number the collection shows — the raw
 * ownedCreatureIncome alone understates it, which looked like a bug.
 */
export function creatureContribution(
  rarity: Rarity,
  held: { level: number; evolution?: number },
  m: Modifiers,
  incomeMult = 1,
): number {
  return (
    ownedCreatureIncome(rarity, held, incomeMult) *
    m.incomeMultiplier *
    m.starMultiplier *
    globalMultiplier
  );
}

/** Passive income from creatures alone (nurture + star + global applied). Each
 * creature's own income multiplier is folded in (unlocks earn more). */
export function creatureIncome(owned: OwnedCharacters, m: Modifiers): number {
  let sum = 0;
  for (const def of characters) {
    const held = owned[def.id];
    if (held) sum += ownedCreatureIncome(def.rarity, held, incomeMultOf(def));
  }
  return sum * m.incomeMultiplier * m.starMultiplier * globalMultiplier;
}

/**
 * Passive goo per second — creature income ONLY (star + prestige already folded
 * in). The robot hand is no longer here: it's an auto-clicker on the tap side,
 * accounted for separately (see autoClicksPerSec + the game tick).
 */
export function gooPerSec(owned: OwnedCharacters, m: Modifiers): number {
  return creatureIncome(owned, m);
}

/** eggCost(n) = round(45 × 1.11 ^ n), n = eggs already hatched */
export function eggCost(n: number): number {
  return Math.round(eggCostBase * Math.pow(eggCostGrowth, n));
}

/**
 * Wealth-scaled payback multiplier (see balance.ts). Cheap when poor, pricier
 * when rich, so growth decelerates gracefully at the top end. Pass the player's
 * current passive goo/sec as the wealth reference.
 */
export function wealthPaybackMult(gooPerSecValue: number): number {
  const r = Math.max(1, gooPerSecValue);
  const mult = 1 + paybackSlopePerDecade * Math.log10(r / paybackPivotRate);
  return Math.min(paybackMultMax, Math.max(paybackMultMin, mult));
}

/**
 * Goo cost to level a creature from its current level → +1. Priced as a number
 * of seconds of the EXTRA income that level grants (all multipliers folded in),
 * where that second-count scales with the player's wealth (`gooPerSecValue`) —
 * so the price-to-payoff ratio is gentle early and steep late.
 */
export function creatureLevelCost(
  rarity: Rarity,
  held: { level: number; evolution?: number },
  m: Modifiers,
  gooPerSecValue: number,
  incomeMult = 1,
): number {
  const gain =
    creatureContribution(rarity, { level: held.level + 1, evolution: held.evolution }, m, incomeMult) -
    creatureContribution(rarity, held, m, incomeMult);
  return Math.max(1, Math.round(gain * creatureLevelPaybackSeconds * wealthPaybackMult(gooPerSecValue)));
}

/** Goo cost to evolve to the next stage — a wealth-scaled payback of the boost. */
export function evolveCost(
  rarity: Rarity,
  held: { level: number; evolution?: number },
  m: Modifiers,
  gooPerSecValue: number,
  incomeMult = 1,
): number {
  const stage = held.evolution ?? 0;
  const gain =
    creatureContribution(rarity, { level: held.level, evolution: stage + 1 }, m, incomeMult) -
    creatureContribution(rarity, held, m, incomeMult);
  return Math.max(1, Math.round(gain * evolvePaybackSeconds * wealthPaybackMult(gooPerSecValue)));
}

/**
 * How many consecutive levels the player could buy for one creature with `goo`
 * on hand — the number shown as the little badge on its collection tile.
 * (Capped so a huge bank doesn't buy a runaway number in one press.)
 */
export function affordableCreatureLevels(
  rarity: Rarity,
  held: { level: number; evolution?: number },
  m: Modifiers,
  goo: number,
  gooPerSecValue: number,
  incomeMult = 1,
): number {
  let count = 0;
  let spent = 0;
  while (count < 999) {
    const cost = creatureLevelCost(rarity, { level: held.level + count, evolution: held.evolution }, m, gooPerSecValue, incomeMult);
    if (spent + cost > goo) break;
    spent += cost;
    count += 1;
  }
  return count;
}
