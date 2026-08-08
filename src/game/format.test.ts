import { describe, expect, it } from 'vitest';
import { bigScaleNameHe, formatExact, formatGoo, formatGooHero } from './format';

describe('formatGoo — the compact number the whole UI shows', () => {
  it('shows decimals for small values so tiny per-level gains stay visible', () => {
    expect(formatGoo(0)).toBe('0');
    expect(formatGoo(0.06)).toBe('0.06');
    expect(formatGoo(1.28)).toBe('1.28');
    expect(formatGoo(5)).toBe('5'); // trailing zeros trimmed (5.00 -> 5)
    expect(formatGoo(12.5)).toBe('12.5');
    expect(formatGoo(950)).toBe('950');
  });

  it('uses the short-scale suffixes at each tier threshold', () => {
    expect(formatGoo(1_000)).toBe('1K');
    expect(formatGoo(1_200)).toBe('1.2K');
    expect(formatGoo(150_000)).toBe('150K'); // >=100 in a tier drops the decimal
    expect(formatGoo(1e6)).toBe('1M');
    expect(formatGoo(2.1e9)).toBe('2.1B');
    expect(formatGoo(1e12)).toBe('1T');
    expect(formatGoo(1e15)).toBe('1Qa');
    expect(formatGoo(1e33)).toBe('1Dc'); // decillion — the challenge target
    // The ladder now continues past a decillion (no more raw "e36" on screen)
    // all the way to a duotrigintillion, so the whole playable range is named.
    expect(formatGoo(1e36)).toBe('1Ud'); // undecillion
    expect(formatGoo(1e63)).toBe('1Vg'); // vigintillion
    expect(formatGoo(1e99)).toBe('1Dtg'); // duotrigintillion — the top suffix
    expect(formatGoo(1e100)).toBe('10Dtg'); // a googol reads as ten duotrigintillions
  });

  it('falls back to scientific notation only far above the game ceiling', () => {
    // Everything in the playable range (up to MAX_GOO=1e103) stays named.
    expect(formatGoo(1e103)).not.toContain('e+');
    expect(formatGoo(1e123)).toBe('1.00e+123');
  });

  it('handles negatives (a shortfall) with a sign', () => {
    expect(formatGoo(-1_500)).toBe('-1.5K');
    expect(formatGoo(-5)).toBe('-5');
  });

  it('never throws on non-finite input', () => {
    expect(formatGoo(Number.NaN)).toBe('0');
    expect(formatGoo(Infinity)).toBe('0');
  });
});

describe('formatGooHero — the big fixed-width counter', () => {
  it('floors below 1000 and pins 2 decimals above it', () => {
    expect(formatGooHero(999.9)).toBe('999');
    expect(formatGooHero(1_234)).toBe('1.23K');
    expect(formatGooHero(2.396e13)).toBe('23.96T');
  });
  it('goes scientific only far above the game ceiling, and never throws', () => {
    expect(formatGooHero(1e36)).toBe('1.00Ud'); // named, not scientific
    expect(formatGooHero(1e123)).toBe('1.00e+123'); // truly absurd only
    expect(formatGooHero(Number.NaN)).toBe('0');
  });
});

describe('formatExact — the fine-grained ticker beneath the counter', () => {
  it('groups thousands and clamps junk to 0', () => {
    expect(formatExact(1_234_567)).toBe('1,234,567');
    expect(formatExact(-5)).toBe('0');
    expect(formatExact(Number.NaN)).toBe('0');
  });
});

describe('bigScaleNameHe — Hebrew scale names for the "new scale!" banner', () => {
  it('is undefined below quadrillion (K/M/B/T are kid-familiar)', () => {
    expect(bigScaleNameHe(12)).toBeUndefined();
    expect(bigScaleNameHe(14)).toBeUndefined();
  });
  it('floors to the scale base, so 1e15–1e17 all name the same scale', () => {
    expect(bigScaleNameHe(15)).toBeDefined();
    expect(bigScaleNameHe(16)).toBe(bigScaleNameHe(15));
    expect(bigScaleNameHe(17)).toBe(bigScaleNameHe(15));
  });
  it('names distinct scales up to a decillion', () => {
    expect(bigScaleNameHe(33)).toBeDefined();
    expect(bigScaleNameHe(33)).not.toBe(bigScaleNameHe(30));
  });
});
