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
  eggCostKnee,
  eggCostGrowthLate,
  evolveMultiplierByStage,
  evolvePaybackSeconds,
  evolveRarityCostMult,
  maxEvolution,
  fingerBonusBase,
  fingerBonusGrowth,
  globalMultiplier,
  luckCap,
  paybackMultMax,
  paybackMultMin,
  paybackPivotRate,
  paybackGrowthPerDecade,
  prestigeCrystalBonus,
  rebirthCap,
  rebirthCostGrowth,
  rebirthCostSeconds,
  rebirthGlobalCap,
  rebirthIncomeBonus,
  tapProductionShare,
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
  prestigeCrystals = 0,
): Modifiers {
  return {
    fingerLevel: upgrades.finger,
    clickMultiplier: (1 + upgradeConfig.power.effectPerLevel * upgrades.power) * (1 + clickCosmeticBonus),
    incomeMultiplier: (1 + upgradeConfig.nurture.effectPerLevel * upgrades.nurture) * (1 + incomeCosmeticBonus),
    starMultiplier: 1 + achievementStarBonus,
    prestigeMultiplier: 1 + Math.max(0, prestigeCrystals) * prestigeCrystalBonus,
    // Global rebirth bonus depends on the whole roster, which modifiersFrom
    // doesn't see — the caller (modsOf / verify's modsFor) sets this from
    // rebirthGlobalMult(characters). Default 1 = no rebirths.
    rebirthMultiplier: 1,
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
    m.prestigeMultiplier *
    globalMultiplier
  );
}

/**
 * What a tap is ACTUALLY worth: the upgrade-driven value, or a small share of
 * the player's own production, whichever is larger (see tapProductionShare for
 * why the floor exists at all).
 *
 * Deliberately a separate function rather than a change to clickPower: the
 * upgrade screen still wants to show what the upgrades themselves bought, and
 * keeping clickPower pure of the player's income keeps its own contract — and
 * its golden vectors — untouched.
 */
export function effectiveClickPower(m: Modifiers, gooPerSecValue: number): number {
  // A tap is worth what the upgrades bought PLUS a share of production — added,
  // not max()'d. The old max() meant that once income outgrew the raw upgrade
  // value, buying a finger/power level (or equipping a click-champion creature)
  // changed nothing: the tap was pinned to a flat 3% of income and every click
  // bonus was wasted. Adding the two guarantees the opposite — EVERY improvement
  // is felt: finger/power/star/rebirth all lift `clickPower`, income upgrades
  // lift the production share, and the click multiplier (power, click
  // accessories, a click-specialist creature) amplifies that share so a
  // "click champion" visibly shines. The share still keeps taps relevant no
  // matter how deep the game goes.
  const fromUpgrades = clickPower(m);
  const fromProduction = Math.max(0, gooPerSecValue) * tapProductionShare * m.clickMultiplier;
  return fromUpgrades + fromProduction;
}

/** The robot hand's auto-tap rate (taps/second) at a given upgrade level (capped). */
export function autoClicksPerSec(level: number): number {
  return Math.min(autoTapRateCap, autoTapRatePerLevel * level);
}

/**
 * The last robot-hand level that still raises the rate. Past it the cap makes
 * every level a dead purchase, so the shop must stop selling there — the cap
 * itself stays, protecting the audit ceiling from edited saves with absurd
 * autoTap levels.
 */
export const autoTapMaxLevel = Math.round(autoTapRateCap / autoTapRatePerLevel);

/**
 * The last crit/luck level that still moves the number. Both effects clamp
 * (critChanceCap, luckCap), so past these levels a purchase is pure dead money —
 * the shop must stop selling there, exactly like autoTap. The caps themselves
 * stay (they protect the audit ceiling from edited saves).
 */
export const critMaxLevel = Math.ceil((critChanceCap - critBaseChance) / upgradeConfig.crit.effectPerLevel);
export const luckMaxLevel = Math.ceil(luckCap / upgradeConfig.luck.effectPerLevel);

/** charIncome = baseByRarity × charIncomeGrowth^(level − 1) — compounding per
 * level. Exponent is guarded so an absurd level can never overflow to Infinity. */
export function charIncome(rarity: Rarity, level: number): number {
  return baseByRarity[rarity] * Math.pow(charIncomeGrowth, Math.min(level - 1, 3000));
}

/** Income × for a creature's evolution stage (0 = none). */
export function evolveIncomeMult(evolution = 0): number {
  return evolveMultiplierByStage[Math.min(Math.max(0, evolution), maxEvolution)] ?? 1;
}

/**
 * Total rebirths across the whole roster that count toward the GLOBAL income
 * bonus. Each creature is clamped to rebirthCap (its own ability cap), and the
 * SUM is clamped to rebirthGlobalCap — both clamps live HERE, in the shared pure
 * rule, so the game and the anti-cheat ceiling agree and a forged save can't
 * inflate income past the cap.
 */
export function totalRebirths(owned: OwnedCharacters): number {
  let sum = 0;
  for (const def of characters) {
    const r = owned[def.id]?.rebirths;
    if (r && Number.isFinite(r)) sum += Math.min(Math.max(0, Math.floor(r)), rebirthCap);
  }
  return Math.min(sum, rebirthGlobalCap);
}

/**
 * The GLOBAL income multiplier from rebirths: +rebirthIncomeBonus per counted
 * rebirth, applied to ALL passive income, always — regardless of which creature
 * is the main or what level a reborn creature currently sits at. This is what
 * makes rebirthing feel rewarding the moment you do it.
 */
export function rebirthGlobalMult(owned: OwnedCharacters): number {
  return 1 + totalRebirths(owned) * rebirthIncomeBonus;
}

/**
 * Goo cost of the NEXT rebirth on a creature that has already been reborn
 * `rebirthsSoFar` times, given the player's current total income/sec. Priced as
 * seconds of income (wealth-scaled) escalating per rebirth, so rebirthing is a
 * real, paced investment at any depth rather than a free spam once you're rich.
 */
export function rebirthCost(rebirthsSoFar: number, gooPerSecValue: number): number {
  const n = Math.max(0, Math.floor(rebirthsSoFar));
  const rate = Math.max(0, gooPerSecValue);
  return Math.max(1, Math.round(rate * rebirthCostSeconds * Math.pow(rebirthCostGrowth, n)));
}

/** A single owned creature's income, including its evolution (shiny) bonus and
 * its per-creature income multiplier (1 for egg creatures, higher for unlocks). */
export function ownedCreatureIncome(
  rarity: Rarity,
  held: { level: number; evolution?: number },
  incomeMult = 1,
): number {
  // Rebirth income is GLOBAL now (see rebirthGlobalMult, folded via
  // m.rebirthMultiplier in creatureIncome) — no longer a per-creature factor.
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
  held: { level: number; evolution?: number; rebirths?: number },
  m: Modifiers,
  incomeMult = 1,
): number {
  return (
    ownedCreatureIncome(rarity, held, incomeMult) *
    m.incomeMultiplier *
    m.starMultiplier *
    m.prestigeMultiplier *
    m.rebirthMultiplier *
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
  return sum * m.incomeMultiplier * m.starMultiplier * m.prestigeMultiplier * m.rebirthMultiplier * globalMultiplier;
}

/**
 * Passive goo per second — creature income ONLY (star + prestige already folded
 * in). The robot hand is no longer here: it's an auto-clicker on the tap side,
 * accounted for separately (see autoClicksPerSec + the game tick).
 */
export function gooPerSec(owned: OwnedCharacters, m: Modifiers): number {
  return creatureIncome(owned, m);
}

/**
 * eggCost(n), n = eggs already acquired. Two-phase (see balance.ts): the steep
 * `eggCostGrowth` curve for the first `eggCostKnee` eggs, then the gentle
 * `eggCostGrowthLate` — so early eggs stay a real investment (no spam-hatching to
 * the full collection) while the far tail no longer outruns the whole economy.
 */
export function eggCost(n: number): number {
  if (n <= eggCostKnee) return Math.round(eggCostBase * Math.pow(eggCostGrowth, n));
  const atKnee = eggCostBase * Math.pow(eggCostGrowth, eggCostKnee);
  return Math.round(atKnee * Math.pow(eggCostGrowthLate, n - eggCostKnee));
}

/**
 * Wealth-scaled payback multiplier (see balance.ts). Cheap when poor, pricier
 * when rich, so growth decelerates gracefully at the top end. Pass the player's
 * current passive goo/sec as the wealth reference.
 */
export function wealthPaybackMult(gooPerSecValue: number): number {
  const r = Math.max(1, gooPerSecValue);
  const mult = Math.pow(paybackGrowthPerDecade, Math.log10(r / paybackPivotRate));
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
  held: { level: number; evolution?: number; rebirths?: number },
  m: Modifiers,
  gooPerSecValue: number,
  incomeMult = 1,
): number {
  // Spread `held` so the "next level" carries the SAME rebirths (and evolution)
  // as now — otherwise the next-level income drops the rebirth bonus, the gain
  // goes negative, and the cost floors to 1 goo. That was the "every level costs
  // 1 goo after a rebirth" bug.
  const gain =
    creatureContribution(rarity, { ...held, level: held.level + 1 }, m, incomeMult) -
    creatureContribution(rarity, held, m, incomeMult);
  return Math.max(1, Math.round(gain * creatureLevelPaybackSeconds * wealthPaybackMult(gooPerSecValue)));
}

/** Goo cost to evolve to the next stage — a wealth-scaled payback of the boost. */
export function evolveCost(
  rarity: Rarity,
  held: { level: number; evolution?: number; rebirths?: number },
  m: Modifiers,
  gooPerSecValue: number,
  incomeMult = 1,
): number {
  const stage = held.evolution ?? 0;
  // Spread `held` so the next stage keeps the same rebirths — same reason as
  // creatureLevelCost (a dropped rebirth bonus would poison the gain).
  const gain =
    creatureContribution(rarity, { ...held, evolution: stage + 1 }, m, incomeMult) -
    creatureContribution(rarity, held, m, incomeMult);
  return Math.max(
    1,
    Math.round(gain * evolvePaybackSeconds * wealthPaybackMult(gooPerSecValue) * evolveRarityCostMult[rarity]),
  );
}

/**
 * How many consecutive levels the player could buy for one creature with `goo`
 * on hand — the number shown as the little badge on its collection tile.
 * (Capped so a huge bank doesn't buy a runaway number in one press.)
 *
 * `maxCount` bounds the loop. It defaults to 999 (the real "level up to max"
 * count used by the store action, and what every golden vector pins). The grid
 * badge, which only ever shows up to "99+", passes a small cap so a rich player
 * doesn't pay for ~999 cost computations per tile on every 10Hz passive tick —
 * that recompute, ×25 tiles, was a real collection-tab frame drain.
 */
export function affordableCreatureLevels(
  rarity: Rarity,
  held: { level: number; evolution?: number; rebirths?: number },
  m: Modifiers,
  goo: number,
  gooPerSecValue: number,
  incomeMult = 1,
  maxCount = 999,
): number {
  let count = 0;
  let spent = 0;
  while (count < maxCount) {
    const cost = creatureLevelCost(rarity, { ...held, level: held.level + count }, m, gooPerSecValue, incomeMult);
    if (spent + cost > goo) break;
    spent += cost;
    count += 1;
  }
  return count;
}

/**
 * Total goo to raise a creature from its current level up to (and reaching)
 * `targetLevel`. Sum of the per-level costs; a fixed wealth reference
 * (gooPerSecValue) is used for the whole batch, exactly like levelUpCreatureMax.
 * Returns 0 if the creature is already at/above the target. Used by the
 * "level up to the threshold and evolve in one press" convenience.
 */
export function levelUpToCost(
  rarity: Rarity,
  held: { level: number; evolution?: number; rebirths?: number },
  targetLevel: number,
  m: Modifiers,
  gooPerSecValue: number,
  incomeMult = 1,
): number {
  let total = 0;
  for (let level = held.level; level < targetLevel; level++) {
    total += creatureLevelCost(rarity, { ...held, level }, m, gooPerSecValue, incomeMult);
  }
  return total;
}
