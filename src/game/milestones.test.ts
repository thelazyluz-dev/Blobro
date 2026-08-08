import { describe, expect, it } from 'vitest';
import { milestones, milestonesCrossed } from './milestones';

describe('milestonesCrossed — which "did you know" facts fire on a goo jump', () => {
  it('returns nothing when goo did not advance', () => {
    expect(milestonesCrossed(1e6, 1e6)).toEqual([]);
    expect(milestonesCrossed(1e6, 5e5)).toEqual([]);
  });

  it('includes a milestone when the jump lands exactly on it (inclusive upper bound)', () => {
    const crossed = milestonesCrossed(0, 1e6);
    expect(crossed.some((m) => m.goo === 1e6)).toBe(true);
  });

  it('excludes a milestone the run already sits on (exclusive lower bound — fires once)', () => {
    // Starting AT 1e6 and growing must not re-fire the 1e6 fact.
    const crossed = milestonesCrossed(1e6, 2e6);
    expect(crossed.some((m) => m.goo === 1e6)).toBe(false);
  });

  it('returns everything crossed in one big jump, ascending (biggest last)', () => {
    const crossed = milestonesCrossed(0, 1e12);
    expect(crossed.length).toBeGreaterThan(1);
    for (let i = 1; i < crossed.length; i++) {
      expect(crossed[i].goo).toBeGreaterThan(crossed[i - 1].goo);
    }
  });

  it('reaches the decillion flagship (the "first to a decillion" target)', () => {
    expect(milestones.some((m) => m.goo === 1e33)).toBe(true);
    expect(milestonesCrossed(6e23, 1e33).some((m) => m.goo === 1e33)).toBe(true);
  });

  it('crowns the climb with the googol ending (the game-win summit)', () => {
    // The final milestone IS the win threshold (balance.googolWinGoo = 1e100),
    // so crossing it fires the same celebration the victory screen owns.
    expect(milestones.some((m) => m.goo === 1e100)).toBe(true);
    expect(milestones[milestones.length - 1].goo).toBe(1e100); // the last, biggest fact
    expect(milestonesCrossed(1e90, 1e100).some((m) => m.goo === 1e100)).toBe(true);
  });

  it('every milestone has nikud-bearing title copy and a fact', () => {
    for (const m of milestones) {
      expect(m.titleHe.length).toBeGreaterThan(0);
      expect(m.factHe.length).toBeGreaterThan(0);
      // nikud (combining marks U+0591–U+05C7) present on the kid-read title
      expect(/[֑-ׇ]/.test(m.titleHe)).toBe(true);
    }
  });
});
