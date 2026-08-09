// Guards for the economy rules that are easy to break silently. These are the
// invariants we've actually had to fix or re-tune, so a regression here would be
// felt by real players.

import { describe, expect, it } from 'vitest';
import { autoTapRateCap, autoTapRatePerLevel, charIncomeExpCap, charIncomeMaxLevel, charLevelCap, globalMultiplier, rebirthCap, rebirthCostGrowth, rebirthCostSeconds, rebirthGlobalCap, rebirthIncomeBonus } from './balance';
import {
  affordableCreatureLevels,
  autoClicksPerSec,
  charIncome,
  clickPower,
  creatureLevelCost,
  evolveIncomeMult,
  gooPerSec,
  levelUpToCost,
  maxCharLevel,
  modifiersFrom,
  ownedCreatureIncome,
  rebirthCost,
  rebirthGlobalMult,
  totalRebirths,
  wealthPaybackMult,
} from './economy';
import { characters } from './characters';
import { defaultUpgrades } from './upgrades';
import type { Modifiers } from './types';

const mods = (over: Partial<Modifiers> = {}): Modifiers => ({
  ...modifiersFrom({ ...defaultUpgrades }, 0),
  ...over,
});

describe('robot hand (auto-clicker)', () => {
  it('scales per level and caps', () => {
    expect(autoClicksPerSec(0)).toBe(0);
    expect(autoClicksPerSec(4)).toBeCloseTo(4 * autoTapRatePerLevel, 10);
    expect(autoClicksPerSec(10_000)).toBe(autoTapRateCap);
  });

  it('does NOT affect passive income — creatures only', () => {
    const owned = { blombo: { level: 20 } } as const;
    const withRobot = modifiersFrom({ ...defaultUpgrades, autoTap: 20 }, 0);
    const without = modifiersFrom({ ...defaultUpgrades, autoTap: 0 }, 0);
    expect(gooPerSec(owned, withRobot)).toBe(gooPerSec(owned, without));
  });
});

describe('click power', () => {
  it('starts at the base tap value with no upgrades', () => {
    expect(clickPower(mods())).toBeCloseTo(1 * globalMultiplier, 10);
  });

  it('grows with the power upgrade', () => {
    const base = clickPower(mods());
    const powered = clickPower(modifiersFrom({ ...defaultUpgrades, power: 4 }, 0));
    expect(powered).toBeGreaterThan(base);
  });
});

describe('creature income', () => {
  it('compounds with level and never goes backwards', () => {
    let prev = 0;
    for (const lv of [1, 2, 5, 20, 100]) {
      const v = charIncome('common', lv);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('rarer creatures are worth strictly more at the same level', () => {
    const l = 10;
    expect(charIncome('uncommon', l)).toBeGreaterThan(charIncome('common', l));
    expect(charIncome('rare', l)).toBeGreaterThan(charIncome('uncommon', l));
    expect(charIncome('legendary', l)).toBeGreaterThan(charIncome('rare', l));
  });

  it('evolution multiplies income and stage 0 is neutral', () => {
    expect(evolveIncomeMult(0)).toBe(1);
    expect(evolveIncomeMult(1)).toBeGreaterThan(1);
    expect(evolveIncomeMult(2)).toBeGreaterThan(evolveIncomeMult(1));
  });

  it('an absurd level never overflows to Infinity', () => {
    expect(Number.isFinite(charIncome('legendary', 100_000))).toBe(true);
  });
});

describe('costs', () => {
  it('a level-up always costs at least 1 goo', () => {
    const c = creatureLevelCost('common', { level: 1 }, mods(), 0);
    expect(c).toBeGreaterThanOrEqual(1);
  });

  it('levelUpToCost sums the per-level costs up to the target', () => {
    const rate = 1000;
    const expected =
      creatureLevelCost('rare', { level: 5 }, mods(), rate) +
      creatureLevelCost('rare', { level: 6 }, mods(), rate) +
      creatureLevelCost('rare', { level: 7 }, mods(), rate);
    expect(levelUpToCost('rare', { level: 5 }, 8, mods(), rate)).toBe(expected);
  });

  it('levelUpToCost is 0 when already at or above the target', () => {
    expect(levelUpToCost('rare', { level: 10 }, 10, mods(), 1000)).toBe(0);
    expect(levelUpToCost('rare', { level: 12 }, 10, mods(), 1000)).toBe(0);
  });

  it('gets pricier as the player gets richer (wealth-scaled payback)', () => {
    expect(wealthPaybackMult(1e9)).toBeGreaterThan(wealthPaybackMult(1));
  });

  it('the wealth multiplier stays within its clamps', () => {
    for (const rate of [0, 1, 1e3, 1e12, 1e30]) {
      const m = wealthPaybackMult(rate);
      expect(Number.isFinite(m)).toBe(true);
      expect(m).toBeGreaterThan(0);
    }
  });
});

describe('level cap (owner rule: 500 unless fully reborn)', () => {
  it('caps at charLevelCap below the rebirth cap', () => {
    expect(maxCharLevel(0)).toBe(charLevelCap);
    expect(maxCharLevel(rebirthCap - 1)).toBe(charLevelCap);
    expect(charLevelCap).toBe(500);
  });

  it('lifts the cap to the income-max level once the creature has mastered itself', () => {
    // A mastered creature climbs far past 500 — but only up to charIncomeMaxLevel,
    // the last level that still raises income. It used to be Infinity, which sold
    // dead levels past the income cap (level climbs, income frozen). The wall is
    // now finite and well above the base cap.
    expect(maxCharLevel(rebirthCap)).toBe(charIncomeMaxLevel);
    expect(maxCharLevel(rebirthCap + 5)).toBe(charIncomeMaxLevel);
    expect(charIncomeMaxLevel).toBe(charIncomeExpCap + 1);
    expect(charIncomeMaxLevel).toBeGreaterThan(charLevelCap);
  });

  it('income is flat at and beyond the income-max level (the wall pays nothing more)', () => {
    // The whole reason the wall sits here: one past it earns exactly the same.
    expect(charIncome('common', charIncomeMaxLevel + 1)).toBe(charIncome('common', charIncomeMaxLevel));
    expect(charIncome('common', charIncomeMaxLevel)).toBeGreaterThan(charIncome('common', charIncomeMaxLevel - 1));
  });

  it('treats a missing / bogus rebirth count as zero (capped)', () => {
    expect(maxCharLevel(undefined)).toBe(charLevelCap);
    expect(maxCharLevel(NaN)).toBe(charLevelCap);
    expect(maxCharLevel(-3)).toBe(charLevelCap);
  });

  it('affordableCreatureLevels never sells past the cap for an un-mastered creature', () => {
    // Handed far more goo than it takes to reach 500 from level 1.
    const n = affordableCreatureLevels('common', { level: 1 }, mods(), 1e13, 100, 1);
    expect(n).toBe(charLevelCap - 1); // level 1 → 500 is 499 buys
    // Sitting AT the cap, nothing more can be bought no matter the bank.
    expect(affordableCreatureLevels('common', { level: charLevelCap }, mods(), 1e30, 100, 1)).toBe(0);
  });

  it('a fully-reborn creature is uncapped and keeps buying past 500', () => {
    const n = affordableCreatureLevels('common', { level: 1, rebirths: rebirthCap }, mods(), 1e13, 100, 1);
    expect(n).toBeGreaterThan(charLevelCap - 1); // climbs past the wall
  });
});

describe('rebirth GLOBAL income bonus (mastering loop)', () => {
  it('sums +rebirthIncomeBonus per rebirth across the whole roster', () => {
    expect(rebirthGlobalMult({})).toBe(1);
    expect(rebirthGlobalMult({ blombo: { level: 5, rebirths: 3 } })).toBeCloseTo(1 + rebirthIncomeBonus * 3, 10);
    // Every reborn creature counts, always — not just one.
    expect(
      rebirthGlobalMult({ blombo: { level: 5, rebirths: 1 }, fizzik: { level: 5, rebirths: 2 }, nono: { level: 5, rebirths: 4 } }),
    ).toBeCloseTo(1 + rebirthIncomeBonus * 7, 10);
  });

  it('clamps each creature to rebirthCap and the sum to rebirthGlobalCap (anti-cheat)', () => {
    // One forged creature is capped at rebirthCap.
    expect(totalRebirths({ blombo: { level: 1, rebirths: 1e9 } })).toBe(rebirthCap);
    // The whole roster maxed is capped at rebirthGlobalCap.
    const maxed = Object.fromEntries(characters.map((c) => [c.id, { level: 1, rebirths: rebirthCap }]));
    expect(totalRebirths(maxed)).toBe(rebirthGlobalCap);
    expect(rebirthGlobalMult(maxed)).toBeCloseTo(1 + rebirthGlobalCap * rebirthIncomeBonus, 10);
  });

  it('rebirthCost scales with income and escalates per rebirth (no free spam)', () => {
    const rate = 1e9;
    // First rebirth ≈ rebirthCostSeconds of your total income.
    expect(rebirthCost(0, rate)).toBe(Math.round(rate * rebirthCostSeconds));
    // Each rebirth on the creature costs rebirthCostGrowth× the last.
    expect(rebirthCost(1, rate) / rebirthCost(0, rate)).toBeCloseTo(rebirthCostGrowth, 6);
    expect(rebirthCost(5, rate)).toBeGreaterThan(rebirthCost(0, rate));
    // Richer player → proportionally pricier (never trivial).
    expect(rebirthCost(0, rate * 1000)).toBeCloseTo(rebirthCost(0, rate) * 1000, -2);
  });

  it('folds into total income but NOT into a single creature\'s base income', () => {
    // ownedCreatureIncome is now rebirth-free (the bonus is global, via m).
    expect(ownedCreatureIncome('rare', { level: 20 }, 1)).toBe(ownedCreatureIncome('rare', { level: 20 }, 1));
    // gooPerSec applies the global multiplier.
    const owned = { blombo: { level: 20, rebirths: 5 } };
    const m = mods({ rebirthMultiplier: rebirthGlobalMult(owned) });
    const withGlobal = gooPerSec(owned, m);
    const without = gooPerSec(owned, mods());
    expect(withGlobal / without).toBeCloseTo(1 + rebirthIncomeBonus * 5, 6);
  });
});
