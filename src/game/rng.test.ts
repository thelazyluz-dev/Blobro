// Behaviour tests for the seeded outcome-RNG (see rng.ts for the "why").
// The golden-vector tests (golden.test.ts) pin exact values for a fixed
// build of mulberry32; these tests instead pin the CONTRACT the store and
// server both depend on — determinism, resumability, and that it's actually
// a decent uniform generator — independent of the concrete numbers.

import { describe, expect, it } from 'vitest';
import { createRng, randomSeed, type RngState } from './rng';
import { hatch, type HatchContext } from './hatching';

describe('createRng — determinism', () => {
  it('the same {seed, cursor} produces the identical draw sequence', () => {
    const a = createRng({ seed: 777, cursor: 0 });
    const b = createRng({ seed: 777, cursor: 0 });
    const drawsA = Array.from({ length: 25 }, () => a.next());
    const drawsB = Array.from({ length: 25 }, () => b.next());
    expect(drawsA).toEqual(drawsB);
  });

  it('the same {seed, cursor} produces an identical crit sequence', () => {
    const critChance = 0.3;
    const rollCrits = (state: RngState) => {
      const rng = createRng(state);
      return Array.from({ length: 200 }, () => rng.next() < critChance);
    };
    expect(rollCrits({ seed: 55, cursor: 0 })).toEqual(rollCrits({ seed: 55, cursor: 0 }));
  });

  it('the same {seed, cursor} produces identical hatch outcomes', () => {
    const ctx: HatchContext = { owned: {}, sinceRare: 0, totalHatches: 0, luck: 0 };
    const rollHatches = (state: RngState) => {
      const rng = createRng(state);
      return Array.from({ length: 30 }, () => hatch(rng.next, ctx));
    };
    expect(rollHatches({ seed: 4242, cursor: 0 })).toEqual(rollHatches({ seed: 4242, cursor: 0 }));
  });

  it('different seeds produce different sequences', () => {
    const a = createRng({ seed: 1, cursor: 0 });
    const b = createRng({ seed: 2, cursor: 0 });
    const drawsA = Array.from({ length: 25 }, () => a.next());
    const drawsB = Array.from({ length: 25 }, () => b.next());
    expect(drawsA).not.toEqual(drawsB);
  });

  it('different seeds produce different crit sequences over a real sample', () => {
    const roll = (seed: number) => {
      const rng = createRng({ seed, cursor: 0 });
      return Array.from({ length: 500 }, () => rng.next() < 0.3);
    };
    expect(roll(9001)).not.toEqual(roll(9002));
  });
});

describe('createRng — cursor bookkeeping', () => {
  it('advances the cursor by exactly the number of draws consumed', () => {
    const rng = createRng({ seed: 10, cursor: 0 });
    expect(rng.state().cursor).toBe(0);
    for (let i = 1; i <= 17; i++) {
      rng.next();
      expect(rng.state().cursor).toBe(i);
    }
  });

  it('a fresh generator built from a saved state starts counting cursor from there', () => {
    const rng = createRng({ seed: 10, cursor: 100 });
    expect(rng.state().cursor).toBe(100);
    rng.next();
    rng.next();
    expect(rng.state().cursor).toBe(102);
  });

  it('resuming from a saved cursor continues the exact same stream as an uninterrupted run', () => {
    const seed = 314159;
    const full = createRng({ seed, cursor: 0 });
    const fullDraws = Array.from({ length: 40 }, () => full.next());

    // Simulate "play a while, save, reload, keep playing".
    const first = createRng({ seed, cursor: 0 });
    const firstHalf = Array.from({ length: 20 }, () => first.next());
    const savedState = first.state();

    const resumed = createRng(savedState);
    const secondHalf = Array.from({ length: 20 }, () => resumed.next());

    expect([...firstHalf, ...secondHalf]).toEqual(fullDraws);
  });

  it('does not mutate the RngState object passed in (so callers can reuse it safely)', () => {
    const state: RngState = { seed: 5, cursor: 3 };
    const snapshot = { ...state };
    const rng = createRng(state);
    rng.next();
    rng.next();
    expect(state).toEqual(snapshot);
  });
});

describe('createRng — distribution sanity', () => {
  it('draws stay within [0, 1) and average close to 0.5 over a large sample', () => {
    const rng = createRng({ seed: randomSeed(), cursor: 0 });
    const n = 50_000;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const mean = sum / n;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
    // Should actually range broadly across the interval, not cluster.
    expect(min).toBeLessThan(0.01);
    expect(max).toBeGreaterThan(0.99);
  });
});

describe('randomSeed', () => {
  it('produces a value in the 32-bit unsigned range', () => {
    for (let i = 0; i < 50; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(4294967296);
    }
  });
});
