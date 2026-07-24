// Pure economy math (§6). Every earnings value multiplies through
// globalMultiplier — the prestige hook.

import {
  baseByRarity,
  charIncomeGrowthPerLevel,
  clickBase,
  eggCostBase,
  eggCostGrowth,
  fingerCostBase,
  fingerCostGrowth,
  fingerEffectPerLevel,
  globalMultiplier,
} from './balance';
import { characters } from './characters';
import type { OwnedCharacters, Rarity } from './types';

/** clickPower = (1 + fingerLevel) × globalMultiplier */
export function clickPower(fingerLevel: number): number {
  return (clickBase + fingerLevel * fingerEffectPerLevel) * globalMultiplier;
}

/** cost(level) = round(25 × 1.6 ^ level) */
export function fingerCost(level: number): number {
  return Math.round(fingerCostBase * Math.pow(fingerCostGrowth, level));
}

/** charIncome = baseByRarity × (1 + 0.25 × (level − 1)) */
export function charIncome(rarity: Rarity, level: number): number {
  return baseByRarity[rarity] * (1 + charIncomeGrowthPerLevel * (level - 1));
}

/** gooPerSec = Σ charIncome × globalMultiplier */
export function gooPerSec(owned: OwnedCharacters): number {
  let sum = 0;
  for (const def of characters) {
    const held = owned[def.id];
    if (held) sum += charIncome(def.rarity, held.level);
  }
  return sum * globalMultiplier;
}

/** eggCost(n) = round(50 × 1.12 ^ n), n = eggs already hatched */
export function eggCost(n: number): number {
  return Math.round(eggCostBase * Math.pow(eggCostGrowth, n));
}
