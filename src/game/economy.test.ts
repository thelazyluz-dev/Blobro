// Guards for the economy rules that are easy to break silently. These are the
// invariants we've actually had to fix or re-tune, so a regression here would be
// felt by real players.

import { describe, expect, it } from 'vitest';
import { autoTapRateCap, autoTapRatePerLevel, globalMultiplier, rebirthCap, rebirthIncomeBonus } from './balance';
import {
  autoClicksPerSec,
  charIncome,
  clickPower,
  creatureLevelCost,
  evolveIncomeMult,
  gooPerSec,
  levelUpToCost,
  modifiersFrom,
  ownedCreatureIncome,
  rebirthIncomeMult,
  wealthPaybackMult,
} from './economy';
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

describe('rebirth income bonus (mastering loop)', () => {
  it('adds +rebirthIncomeBonus per rebirth, ×1 at zero', () => {
    expect(rebirthIncomeMult(0)).toBe(1);
    for (const reb of [1, 4, 10]) {
      expect(rebirthIncomeMult(reb)).toBeCloseTo(1 + rebirthIncomeBonus * reb, 10);
    }
  });

  it('clamps at rebirthCap — a forged count cannot exceed it (anti-cheat)', () => {
    const atCap = rebirthIncomeMult(rebirthCap);
    for (const forged of [rebirthCap + 1, 1000, 1e9]) {
      expect(rebirthIncomeMult(forged)).toBe(atCap);
    }
  });

  it('ownedCreatureIncome folds the bonus through', () => {
    const plain = ownedCreatureIncome('rare', { level: 20 }, 1);
    const reborn = ownedCreatureIncome('rare', { level: 20, rebirths: 5 }, 1);
    expect(reborn).toBeCloseTo(plain * rebirthIncomeMult(5), 6);
  });

  it('a reborn creature still costs a sensible amount to level (not floored to 1)', () => {
    // Regression: the "next level" must carry the same rebirths, or the gain
    // goes negative and the cost floors to 1 goo — the "every level costs 1 goo
    // after a rebirth" bug. A reborn creature should cost MORE (its income, and
    // thus the level's gain, is higher), never a trivial 1.
    const rate = 1e7;
    const plain = creatureLevelCost('rare', { level: 12, evolution: 1 }, mods(), rate);
    const reborn = creatureLevelCost('rare', { level: 12, evolution: 1, rebirths: 3 }, mods(), rate);
    expect(reborn).toBeGreaterThan(1);
    expect(reborn).toBeGreaterThan(plain);
    expect(reborn).toBeCloseTo(plain * rebirthIncomeMult(3), -1);
  });
});
