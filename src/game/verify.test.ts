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
import { clickPower, effectiveClickPower, gooPerSec, modifiersFrom } from './economy';
import { tapProductionShare } from './balance';
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

  it('folds the equipped-main creature ability in, matching the client (no structural blind spot)', () => {
    // An income/tap ability legitimately raises real earnings, so the ceiling
    // must include it — otherwise equipping a strong creature drifts a real
    // player above a ceiling that can't see the mechanic. galaxo grants income.
    const withoutAbility = midGame({ characters: { galaxo: { level: 50 } }, equippedMain: null });
    const withAbility = midGame({ characters: { galaxo: { level: 50 } }, equippedMain: 'galaxo' });
    expect(plausibilityCeiling(withAbility, 3600).maxGain).toBeGreaterThan(
      plausibilityCeiling(withoutAbility, 3600).maxGain,
    );
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

describe('the tap production floor (balance.tapProductionShare)', () => {
  it('keeps taps worth something no matter how deep the game goes', () => {
    // The reason the floor exists: measured, tap income used to fall to
    // literally 0% of a deep player's earnings. A tap must always be worth
    // SOMETHING relative to what the player produces.
    const deep = midGame({ characters: { blombo: { level: 300, evolution: 4 } } });
    const m = modifiersFrom(
      deep.upgrades,
      starBonusFor(deep.achievements),
      clickCosmeticBonus(deep.equippedBlob, deep.equippedAccessory),
      backgroundIncomeBonus(deep.equippedBackground),
    );
    const passive = gooPerSec(deep.characters, m);
    expect(effectiveClickPower(m, passive)).toBeGreaterThan(clickPower(m));
    expect(effectiveClickPower(m, passive) / passive).toBeCloseTo(tapProductionShare, 10);
  });

  it('never pays less than the upgrades bought, even with no production at all', () => {
    const m = modifiersFrom(base.upgrades, 0, 0, 0);
    expect(effectiveClickPower(m, 0)).toBe(clickPower(m));
  });

  it('is bounded by production, so it cannot run away', () => {
    // A share of production can never exceed production — this is what makes
    // the floor safe where lowering the cost curves was not (that overshot to
    // 1e198 in simulation).
    const m = modifiersFrom(base.upgrades, 0, 0, 0);
    for (const rate of [1e3, 1e9, 1e18]) {
      expect(effectiveClickPower(m, rate)).toBeLessThanOrEqual(rate);
    }
  });

  it('ignores a negative production rate rather than paying negatively', () => {
    const m = modifiersFrom(base.upgrades, 0, 0, 0);
    expect(effectiveClickPower(m, -1e9)).toBe(clickPower(m));
  });
});

describe('rollback annotation', () => {
  // The game itself offers a "restore my other save" button, which legitimately
  // lowers lifetimeGoo — the audit's strongest cheat signal. Without a way to
  // tell the two apart, pressing a button we provided looks exactly like
  // editing a save, and the collected evidence is polluted.
  const prev = midGame();
  const rolledBack = midGame({ lifetimeGoo: 1_000, clicks: 100 });

  it('annotates a claimed rollback ALONGSIDE the decrease, never instead of it', () => {
    const v = verifySaveDelta(prev, rolledBack, 60, { rollbackClaimed: true });
    // The decrease is still recorded. Hiding it would let anyone erase the
    // signal just by asserting the claim.
    expect(v.flags).toContain('lifetime-goo-decreased');
    expect(v.flags).toContain('rollback-claimed');
    expect(v.ok).toBe(false);
  });

  it('does not annotate when the client says nothing', () => {
    expect(verifySaveDelta(prev, rolledBack, 60).flags).not.toContain('rollback-claimed');
  });

  it('does not annotate a claim when nothing actually decreased', () => {
    // A caller asserting "rollback" on a normal push must not gain a label that
    // would let it be filtered out of the data later.
    const grew = midGame({ lifetimeGoo: prev.lifetimeGoo + 1_000, clicks: prev.clicks + 10 });
    expect(verifySaveDelta(prev, grew, 60, { rollbackClaimed: true }).flags).not.toContain('rollback-claimed');
  });

  it('leaves every other verdict field untouched', () => {
    const plain = verifySaveDelta(prev, rolledBack, 60);
    const claimed = verifySaveDelta(prev, rolledBack, 60, { rollbackClaimed: true });
    expect(claimed.gooGain).toBe(plain.gooGain);
    expect(claimed.maxGain).toBe(plain.maxGain);
    expect(claimed.ratio).toBe(plain.ratio);
  });
});

describe('merge annotation (cross-device / pre-auth progress adoption)', () => {
  // A device adopting a bigger save it earned elsewhere lands as one huge
  // lifetimeGoo jump that reads as an impossible rate. The client marks that one
  // push; the flag rides ALONGSIDE the rate flag (never instead), and it's the
  // worker's barring logic that spares it — verify.ts only records the truth.
  const prev = midGame();
  const merged = midGame({ lifetimeGoo: prev.lifetimeGoo + 1e18 }); // a real other-device total

  it('annotates a claimed merge ALONGSIDE the goo-rate flag, never instead of it', () => {
    const v = verifySaveDelta(prev, merged, 60, { mergeClaimed: true });
    expect(v.flags).toContain('goo-rate'); // the ratio still gets recorded for tuning
    expect(v.flags).toContain('merge-claimed');
    expect(v.ok).toBe(false); // still "flagged"; the bar decision lives in the worker
  });

  it('does not annotate when the client says nothing', () => {
    expect(verifySaveDelta(prev, merged, 60).flags).not.toContain('merge-claimed');
  });

  it('does not annotate a claim on a normal push that never tripped a rate flag', () => {
    // "merge" on an ordinary in-bounds gain must not earn a label that could
    // later exempt it — the annotation only rides an actual rate flag.
    const modest = midGame({ lifetimeGoo: prev.lifetimeGoo + 1_000 });
    const v = verifySaveDelta(prev, modest, 60, { mergeClaimed: true });
    expect(v.flags).not.toContain('goo-rate');
    expect(v.flags).not.toContain('merge-claimed');
    expect(v.ok).toBe(true);
  });

  it('also rides a click-rate flag when the merge bumped clicks impossibly', () => {
    const impossible = midGame({
      lifetimeGoo: prev.lifetimeGoo,
      clicks: prev.clicks + maxHumanTapsPerSec * 60 * 100,
    });
    const v = verifySaveDelta(prev, impossible, 60, { mergeClaimed: true });
    expect(v.flags).toContain('click-rate');
    expect(v.flags).toContain('merge-claimed');
  });

  it('leaves the recorded ratio identical to an unannotated verdict', () => {
    const plain = verifySaveDelta(prev, merged, 60);
    const claimed = verifySaveDelta(prev, merged, 60, { mergeClaimed: true });
    expect(claimed.ratio).toBe(plain.ratio);
    expect(claimed.gooGain).toBe(plain.gooGain);
    expect(claimed.maxGain).toBe(plain.maxGain);
  });
});
