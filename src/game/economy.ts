// Pure economy math. Every earnings value multiplies through globalMultiplier —
// the prestige hook — and through the achievement "star" where relevant.

import {
  autoTapFractionCap,
  autoTapFractionPerLevel,
  baseByRarity,
  charIncomeGrowthPerLevel,
  clickBase,
  creatureLevelCostBase,
  creatureLevelCostGrowth,
  critBaseChance,
  critChanceCap,
  eggCostBase,
  eggCostGrowth,
  evolveIncomeMultiplier,
  fingerEffectPerLevel,
  globalMultiplier,
  luckCap,
  upgradeConfig,
} from './balance';
import { characters } from './characters';
import type { Modifiers, OwnedCharacters, Rarity, Upgrades } from './types';

/**
 * Derive all active modifiers from the upgrades map and the summed achievement
 * income bonus (each claimed achievement contributes a bonus scaled by its
 * difficulty — see game/achievements.ts).
 */
export function modifiersFrom(upgrades: Upgrades, achievementStarBonus: number): Modifiers {
  return {
    fingerLevel: upgrades.finger,
    clickMultiplier: 1 + upgradeConfig.power.effectPerLevel * upgrades.power,
    incomeMultiplier: 1 + upgradeConfig.nurture.effectPerLevel * upgrades.nurture,
    autoTapFraction: Math.min(autoTapFractionCap, autoTapFractionPerLevel * upgrades.autoTap),
    starMultiplier: 1 + achievementStarBonus,
    critChance: Math.min(critChanceCap, critBaseChance + upgradeConfig.crit.effectPerLevel * upgrades.crit),
    luck: Math.min(luckCap, upgradeConfig.luck.effectPerLevel * upgrades.luck),
  };
}

/** Goo earned per manual tap (before any active frenzy). */
export function clickPower(m: Modifiers): number {
  return (
    (clickBase + m.fingerLevel * fingerEffectPerLevel) *
    m.clickMultiplier *
    m.starMultiplier *
    globalMultiplier
  );
}

/** The robot hand's harvest fraction at a given upgrade level (capped). */
export function autoTapFraction(level: number): number {
  return Math.min(autoTapFractionCap, autoTapFractionPerLevel * level);
}

/** charIncome = baseByRarity × (1 + 0.4 × (level − 1)) */
export function charIncome(rarity: Rarity, level: number): number {
  return baseByRarity[rarity] * (1 + charIncomeGrowthPerLevel * (level - 1));
}

/** A single owned creature's income, including its shiny (evolved) bonus. */
export function ownedCreatureIncome(rarity: Rarity, held: { level: number; shiny?: boolean }): number {
  const base = charIncome(rarity, held.level);
  return held.shiny ? base * evolveIncomeMultiplier : base;
}

/**
 * What ONE owned creature actually adds to goo/sec, with every automation
 * multiplier folded in (nurture + star + prestige + the robot hand). This is
 * the honest "this creature earns X/sec" number the collection shows — the raw
 * ownedCreatureIncome alone understates it, which looked like a bug.
 */
export function creatureContribution(
  rarity: Rarity,
  held: { level: number; shiny?: boolean },
  m: Modifiers,
): number {
  return (
    ownedCreatureIncome(rarity, held) *
    m.incomeMultiplier *
    m.starMultiplier *
    globalMultiplier *
    (1 + m.autoTapFraction)
  );
}

/** Passive income from creatures alone (nurture + star + global applied). */
export function creatureIncome(owned: OwnedCharacters, m: Modifiers): number {
  let sum = 0;
  for (const def of characters) {
    const held = owned[def.id];
    if (held) sum += ownedCreatureIncome(def.rarity, held);
  }
  return sum * m.incomeMultiplier * m.starMultiplier * globalMultiplier;
}

/**
 * Total goo per second: creature income, amplified by the robot hand which
 * harvests an extra fraction of it. Both are automation — independent of the
 * click upgrades (finger/power/crit), which only affect manual taps. The star
 * and prestige are already folded into creatureIncome.
 */
export function gooPerSec(owned: OwnedCharacters, m: Modifiers): number {
  return creatureIncome(owned, m) * (1 + m.autoTapFraction);
}

/** eggCost(n) = round(45 × 1.11 ^ n), n = eggs already hatched */
export function eggCost(n: number): number {
  return Math.round(eggCostBase * Math.pow(eggCostGrowth, n));
}

/** Goo cost to level a creature from `level` → `level + 1`. */
export function creatureLevelCost(rarity: Rarity, level: number): number {
  return Math.round(creatureLevelCostBase[rarity] * Math.pow(creatureLevelCostGrowth, level - 1));
}

/**
 * How many consecutive levels the player could buy for one creature with `goo`
 * on hand — the number shown as the little badge on its collection tile.
 */
export function affordableCreatureLevels(rarity: Rarity, level: number, goo: number): number {
  let count = 0;
  let spent = 0;
  let lvl = level;
  while (count < 999) {
    const cost = creatureLevelCost(rarity, lvl);
    if (spent + cost > goo) break;
    spent += cost;
    lvl += 1;
    count += 1;
  }
  return count;
}
