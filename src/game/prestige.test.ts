import { describe, expect, it } from 'vitest';
import { prestigeCrystalBonus, prestigeCrystalsPerDecade, prestigeFirstCrystalGoo } from './balance';
import {
  applyPrestige,
  canPrestige,
  crystalsFor,
  crystalsGained,
  gooToNextCrystal,
  prestigeMultiplierFor,
} from './prestige';
import { defaultSaveState } from './save';

const NOW = 1_700_000_000_000;

describe('crystalsFor — the log curve', () => {
  it('nothing below the first-crystal threshold', () => {
    expect(crystalsFor(0)).toBe(0);
    expect(crystalsFor(prestigeFirstCrystalGoo - 1)).toBe(0);
  });

  it('first crystal exactly at the threshold, +N per decade after', () => {
    expect(crystalsFor(prestigeFirstCrystalGoo)).toBe(1);
    expect(crystalsFor(prestigeFirstCrystalGoo * 10)).toBe(prestigeCrystalsPerDecade + 1);
    expect(crystalsFor(prestigeFirstCrystalGoo * 100)).toBe(prestigeCrystalsPerDecade * 2 + 1);
    // Anchor from the calibration table, at the raised 1e10 threshold:
    // 1e15 = five decades above 1e10 → 5×5 + 1 = 26 crystals.
    expect(crystalsFor(1e15)).toBe(26);
  });

  it('is monotonic — more lifetime never means fewer crystals', () => {
    let prev = 0;
    for (let e = 6; e <= 24; e += 0.25) {
      const c = crystalsFor(Math.pow(10, e));
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it('never returns garbage on bad input', () => {
    expect(crystalsFor(NaN)).toBe(0);
    expect(crystalsFor(Infinity)).toBe(0);
    expect(crystalsFor(-5)).toBe(0);
  });
});

describe('the roll', () => {
  const deepSave = () => ({
    ...defaultSaveState(NOW),
    goo: 5e9,
    lifetimeGoo: 2.2e10, // → 7 crystals
    bestCpm: 400,
    clicks: 12_000,
    eggs: 3,
    totalHatches: 50,
    sinceRare: 9,
    characters: { blombo: { level: 40 }, fizzik: { level: 22, evolution: 1 } } as const,
    upgrades: { finger: 10, power: 5, autoTap: 4, nurture: 3, crit: 2, luck: 1 },
    achievements: ['clicks-100'],
    ownedCosmetics: ['blob-goo', 'bg-aurora', 'acc-tophat'],
    milestonesShown: [1e6, 1e9],
    lastGiftDay: 20_000,
    giftStreak: 3,
  });

  it('gained = justified minus owned; canPrestige needs at least one', () => {
    const s = deepSave();
    expect(crystalsGained(s)).toBe(crystalsFor(s.lifetimeGoo));
    expect(canPrestige(s)).toBe(true);
    const alreadyRolled = { ...s, prestigeCrystals: crystalsFor(s.lifetimeGoo) };
    expect(crystalsGained(alreadyRolled)).toBe(0);
    expect(canPrestige(alreadyRolled)).toBe(false);
  });

  it('resets the run and keeps the permanent things', () => {
    const before = deepSave();
    const after = applyPrestige(before, NOW);

    // reset:
    expect(after.goo).toBe(0);
    expect(after.characters).toEqual({});
    expect(after.upgrades).toEqual(defaultSaveState(NOW).upgrades);
    expect(after.eggs).toBe(0);
    expect(after.totalHatches).toBe(0); // egg prices are cheap again
    expect(after.sinceRare).toBe(0);
    expect(after.equippedMain).toBeNull();

    // kept:
    expect(after.lifetimeGoo).toBe(before.lifetimeGoo); // NEVER reset — the audit relies on it
    expect(after.clicks).toBe(before.clicks);
    expect(after.bestCpm).toBe(before.bestCpm);
    expect(after.achievements).toEqual(before.achievements);
    expect(after.ownedCosmetics).toEqual(before.ownedCosmetics);
    expect(after.milestonesShown).toEqual(before.milestonesShown);
    expect(after.lastGiftDay).toBe(before.lastGiftDay);

    // gained:
    expect(after.prestigeCrystals).toBe(crystalsFor(before.lifetimeGoo));
    expect(after.prestigeCount).toBe(1);
  });

  it('rolling twice without new lifetime gains nothing more', () => {
    const once = applyPrestige(deepSave(), NOW);
    expect(canPrestige(once)).toBe(false);
    const twice = applyPrestige(once, NOW);
    expect(twice.prestigeCrystals).toBe(once.prestigeCrystals);
  });
});

describe('the bonus and the next-crystal countdown', () => {
  it('each crystal adds its bonus', () => {
    expect(prestigeMultiplierFor(0)).toBe(1);
    expect(prestigeMultiplierFor(7)).toBeCloseTo(1 + 7 * prestigeCrystalBonus, 10);
  });

  it('gooToNextCrystal inverts the curve exactly', () => {
    // Just under the first crystal: the gap to the threshold itself.
    expect(gooToNextCrystal({ lifetimeGoo: prestigeFirstCrystalGoo / 2, prestigeCrystals: 0 })).toBe(
      prestigeFirstCrystalGoo / 2,
    );
    // Crossing the promised amount always yields another crystal.
    for (const L of [1e9, 3e9, 1e10, 7e11, 1e15]) {
      const have = crystalsFor(L);
      const need = gooToNextCrystal({ lifetimeGoo: L, prestigeCrystals: have });
      expect(crystalsFor(L + need + 1)).toBeGreaterThan(have);
    }
  });
});
