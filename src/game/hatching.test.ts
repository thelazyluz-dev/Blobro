// Focused tests for the AD EGG's boosted rarity roll (the rest of hatching is
// pinned by the golden vectors; this table is new and client-only for now).

import { describe, expect, it } from 'vitest';
import { adEggLegendaryChance, adEggRareChance, rarityChances } from './balance';
import { hatch, premiumRollRarity } from './hatching';

describe('premiumRollRarity — the ad egg table', () => {
  it('maps the unit interval to the owner-set odds', () => {
    // 5% legendary, then 10% rare, then the remaining mass.
    expect(premiumRollRarity(0.0)).toBe('legendary');
    expect(premiumRollRarity(adEggLegendaryChance - 1e-9)).toBe('legendary');
    expect(premiumRollRarity(adEggLegendaryChance)).toBe('rare');
    expect(premiumRollRarity(adEggLegendaryChance + adEggRareChance - 1e-9)).toBe('rare');
    expect(premiumRollRarity(0.99)).toBe('common');
  });

  it('splits the leftover mass between common/uncommon at their base ratio', () => {
    const rest = 1 - adEggLegendaryChance - adEggRareChance;
    const uncommonShare = (rest * rarityChances.uncommon) / (rarityChances.common + rarityChances.uncommon);
    const boundary = adEggLegendaryChance + adEggRareChance + uncommonShare;
    expect(premiumRollRarity(boundary - 1e-9)).toBe('uncommon');
    expect(premiumRollRarity(boundary + 1e-9)).toBe('common');
  });

  it('measured frequencies match the table over a large uniform sample', () => {
    const counts = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
    const N = 100_000;
    for (let i = 0; i < N; i++) counts[premiumRollRarity((i + 0.5) / N)] += 1;
    expect(counts.legendary / N).toBeCloseTo(adEggLegendaryChance, 3);
    expect(counts.rare / N).toBeCloseTo(adEggRareChance, 3);
  });
});

describe('hatch with premium: true', () => {
  const ctx = { owned: {}, sinceRare: 3, totalHatches: 10, luck: 0 };

  it('uses the premium table (a mid-roll that would be common is rare here)', () => {
    // u = 0.08: normal roll → common (0.68 band); premium roll → rare.
    const outcome = hatch(() => 0.08, { ...ctx, premium: true });
    expect(outcome.rarity).toBe('rare');
  });

  it('still moves the pity counters like any other hatch', () => {
    const rare = hatch(() => 0.08, { ...ctx, premium: true });
    expect(rare.nextSinceRare).toBe(0); // rare+ resets the pity streak
    expect(rare.nextTotalHatches).toBe(11);

    const common = hatch(() => 0.9, { ...ctx, premium: true });
    expect(common.nextSinceRare).toBe(4); // a common still advances it
  });

  it('ignores pity guarantees — the boosted table IS the rescue', () => {
    // sinceRare far past the pity threshold: a normal roll would force rare+,
    // but the premium egg rolls its own flat table.
    const outcome = hatch(() => 0.9, { ...ctx, sinceRare: 999, premium: true });
    expect(outcome.rarity).toBe('common');
  });
});
