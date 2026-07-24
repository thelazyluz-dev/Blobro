// Pure economy math. Every earnings value multiplies through globalMultiplier —
// the prestige hook — and through the achievement "star" where relevant.

import {
  baseByRarity,
  charIncomeGrowthPerLevel,
  clickBase,
  eggCostBase,
  eggCostGrowth,
  fingerEffectPerLevel,
  globalMultiplier,
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

/** Passive income from creatures alone (nurture + star + global applied). */
export function creatureIncome(owned: OwnedCharacters, m: Modifiers): number {
  let sum = 0;
  for (const def of characters) {
    const held = owned[def.id];
    if (held) sum += charIncome(def.rarity, held.level);
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
