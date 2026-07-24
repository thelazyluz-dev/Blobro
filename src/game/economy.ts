// Pure economy math. Every earnings value multiplies through globalMultiplier —
// the prestige hook — and through the achievement "star" where relevant.

import {
  baseByRarity,
  charIncomeGrowthPerLevel,
  clickBase,
  critBaseChance,
  critChanceCap,
  eggCostBase,
  eggCostGrowth,
  evolveIncomeMultiplier,
  fingerEffectPerLevel,
  globalMultiplier,
  luckCap,
  starPerAchievement,
  upgradeConfig,
} from './balance';
import { characters } from './characters';
import type { Modifiers, OwnedCharacters, Rarity, Upgrades } from './types';

/** The achievement income star: 1 + starPerAchievement × claimedCount. */
export function starMultiplier(claimedCount: number): number {
  return 1 + starPerAchievement * claimedCount;
}

/** Derive all active modifiers from the upgrades map and achievement count. */
export function modifiersFrom(upgrades: Upgrades, achievementCount: number): Modifiers {
  return {
    fingerLevel: upgrades.finger,
    clickMultiplier: 1 + upgradeConfig.power.effectPerLevel * upgrades.power,
    incomeMultiplier: 1 + upgradeConfig.nurture.effectPerLevel * upgrades.nurture,
    autoTapRate: upgradeConfig.autoTap.effectPerLevel * upgrades.autoTap,
    starMultiplier: starMultiplier(achievementCount),
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

/** charIncome = baseByRarity × (1 + 0.25 × (level − 1)) */
export function charIncome(rarity: Rarity, level: number): number {
  return baseByRarity[rarity] * (1 + charIncomeGrowthPerLevel * (level - 1));
}

/** A single owned creature's income, including its shiny (evolved) bonus. */
export function ownedCreatureIncome(rarity: Rarity, held: { level: number; shiny?: boolean }): number {
  const base = charIncome(rarity, held.level);
  return held.shiny ? base * evolveIncomeMultiplier : base;
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

/** Total goo per second: creatures + the robot hand's automatic taps. */
export function gooPerSec(owned: OwnedCharacters, m: Modifiers): number {
  return creatureIncome(owned, m) + m.autoTapRate * clickPower(m);
}

/** eggCost(n) = round(45 × 1.11 ^ n), n = eggs already hatched */
export function eggCost(n: number): number {
  return Math.round(eggCostBase * Math.pow(eggCostGrowth, n));
}
