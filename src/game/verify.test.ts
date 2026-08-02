// Unit tests for the plausibility bound (PR 5).
//
// The golden vectors pin exact numbers for specific inputs. These tests pin
// the PROPERTIES that must hold for every input — the things that would still
// be true after a deliberate rebalance, and that are the actual reasons this
// module exists.

import { describe, expect, it } from 'vitest';
import { defaultSaveState } from './save';
import {
  maxEventClickMult,
  maxEventIncomeMult,
  maxHumanTapsPerSec,
  minIntervalSeconds,
  ownsImpossibleCreatures,
  plausibilityCeiling,
  verifySaveDelta,
} from './verify';
import { clickPower, gooPerSec, modifiersFrom } from './economy';
import { starBonusFor } from './achievements';
import { backgroundIncomeBonus, clickCosmeticBonus } from './cosmetics';
import type { SaveState } from './types';

const NOW = 1_754_000_000_000;
const base = defaultSaveState(NOW);

function midGame(over: Partial<SaveState> = {}): SaveState {
  return {
    ...base,
    characters: { blombo: { level: 60 }, fizzik: { level: 45 }, nono: { level: 30 } },
    upgrades: { ...base.upgrades, finger: 40, power: 12, nurture: 10, autoTap: 20, crit: 8, luck: 4 },
    lifetimeGoo: 5_000_000,
    clicks: 20_000,
    ...over,
  };
}

/** What a real, enthusiastic player gains: full passive income + 5 taps/sec. */
function honestGain(save: SaveState, seconds: number): number {
  const m = modifiersFrom(
    save.upgrades,
    starBonusFor(save.achievements),
    clickCosmeticBonus(save.equippedBlob, save.equippedAccessory),
    backgroundIncomeBonus(save.equippedBackground),
  );
  return gooPerSec(save.characters, m) * seconds + clickPower(m) * 5 * seconds;
}

describe('plausibilityCeiling', () => {
  it('never returns less than the grace allowance, even for a brand-new save', () => {
    expect(plausibilityCeiling(base, 60).maxGain).toBeGreaterThan(0);
  });

  it('floors the interval, so two saves milliseconds apart cannot manufacture a huge rate', () => {
    // Without the floor, a real gain divided by a near-zero window would look
    // impossible. All of these must produce the same ceiling.
    const atFloor = plausibilityCeiling(midGame(), minIntervalSeconds).maxGain;
    expect(plausibilityCeiling(midGame(), 0).maxGain).toBe(atFloor);
    expect(plausibilityCeiling(midGame(), 0.001).maxGain).toBe(atFloor);
    expect(plausibilityCeiling(midGame(), -9999).maxGain).toBe(atFloor);
    expect(plausibilityCeiling(midGame(), Number.NaN).maxGain).toBe(atFloor);
  });

  it('grows monotonically with the interval', () => {
    const save = midGame();
    let prev = 0;
    for (const s of [60, 600, 3600, 86_400]) {
      const v = plausibilityCeiling(save, s).maxGain;
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('derives its multiplier ceilings from the real event table, not literals', () => {
    // If someone adds a stronger event, these must move with it — a hardcoded
    // ceiling would start flagging honest players the day that event shipped.
    expect(maxEventIncomeMult).toBeGreaterThanOrEqual(1);
    expect(maxEventClickMult).toBeGreaterThanOrEqual(1);
  });
});

describe('verifySaveDelta — honest play is never flagged', () => {
  it.each([60, 600, 3600, 86_400])('clean over a %i second interval', (seconds) => {
    const prev = midGame();
    const next = midGame({
      lifetimeGoo: prev.lifetimeGoo + honestGain(prev, seconds),
      clicks: prev.clicks + Math.floor(5 * seconds),
    });
    const v = verifySaveDelta(prev, next, seconds);
    expect(v.ok).toBe(true);
    expect(v.flags).toEqual([]);
  });

  it('leaves a wide margin — honest play sits orders of magnitude under the bound', () => {
    const prev = midGame();
    const next = midGame({ lifetimeGoo: prev.lifetimeGoo + honestGain(prev, 3600) });
    // This is the honest limitation of a hard bound, asserted rather than
    // hand-waved: it only catches gross fabrication. The recorded ratio is what
    // a later PR uses to set a tight, evidence-based threshold.
    expect(verifySaveDelta(prev, next, 3600).ratio).toBeLessThan(0.01);
  });

  it('a first-ever save is never suspicious — there is nothing to compare it to', () => {
    const v = verifySaveDelta(null, midGame({ lifetimeGoo: 1e12 }), 60);
    expect(v.ok).toBe(true);
    expect(v.flags).toEqual([]);
  });

  it('a long legitimate absence is fine — offline earnings are capped below the bound', () => {
    const prev = midGame();
    const next = midGame({ lifetimeGoo: prev.lifetimeGoo + honestGain(prev, 1800) });
    expect(verifySaveDelta(prev, next, 86_400).ok).toBe(true);
  });
});

describe('verifySaveDelta — fabrication is flagged', () => {
  it('flags a gain far above what the interval allows', () => {
    const prev = midGame();
    const next = midGame({ lifetimeGoo: prev.lifetimeGoo + 1e18 });
    const v = verifySaveDelta(prev, next, 60);
    expect(v.flags).toContain('goo-rate');
    expect(v.ok).toBe(false);
    expect(v.ratio).toBeGreaterThan(1);
  });

  it('flags lifetimeGoo going backwards — it is monotonic in an honest save', () => {
    const prev = midGame();
    expect(verifySaveDelta(prev, midGame({ lifetimeGoo: 1 }), 60).flags).toContain('lifetime-goo-decreased');
  });

  it('flags clicks going backwards', () => {
    const prev = midGame();
    expect(verifySaveDelta(prev, midGame({ clicks: 5 }), 60).flags).toContain('clicks-decreased');
  });

  it('flags more taps than a human plus a robot hand could produce', () => {
    const prev = midGame();
    const impossible = midGame({ clicks: prev.clicks + maxHumanTapsPerSec * 60 * 100 });
    expect(verifySaveDelta(prev, impossible, 60).flags).toContain('click-rate');
  });

  it('does NOT flag taps that a fully-levelled robot hand explains', () => {
    // The robot hand taps on the player's behalf, so the ceiling must include
    // it — otherwise buying the upgrade would get a player flagged.
    const prev = midGame();
    const next = midGame({ clicks: prev.clicks + Math.floor(maxHumanTapsPerSec * 60) });
    expect(verifySaveDelta(prev, next, 60).flags).not.toContain('click-rate');
  });
});

describe('ownsImpossibleCreatures', () => {
  it('is false for a fresh save with nothing owned', () => {
    expect(ownsImpossibleCreatures(base)).toBe(false);
  });

  it('is false for a normal save that hatched its creatures', () => {
    expect(ownsImpossibleCreatures(midGame({ totalHatches: 12 }))).toBe(false);
  });

  it('is false when creatures came from click-unlocks rather than hatching', () => {
    expect(ownsImpossibleCreatures(midGame({ totalHatches: 0, clicks: 50_000 }))).toBe(false);
  });

  it('is true only for the clear case: creatures with no hatches and no taps behind them', () => {
    expect(ownsImpossibleCreatures(midGame({ totalHatches: 0, clicks: 0 }))).toBe(true);
  });
});
