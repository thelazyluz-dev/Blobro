import { describe, it, expect } from 'vitest';
import { achievements, isComplete, newlyCompleted, progressValue, starBonusFor } from './achievements';
import type { AchievementContext } from './achievements';
import { collectionOrder } from './characters';

const TOTAL = collectionOrder.length; // 25

// A zeroed context; spread over to exercise one field at a time.
const zero: AchievementContext = {
  collectionCount: 0,
  shinyCount: 0,
  lifetimeGoo: 0,
  totalHatches: 0,
  clicks: 0,
  bonusesCollected: 0,
};

describe('achievement ladders', () => {
  it('pins the session-tuned ladder values (a balance.ts typo must not slip through)', () => {
    const goals = (k: string) =>
      achievements.filter((a) => a.kind === k).map((a) => a.goal);
    expect(goals('maxevolved')).toEqual([1, 3, 6, 12, 24, 25]);
    expect(Math.max(...goals('lifetime'))).toBe(1e33); // the "first to a decillion" challenge target
  });

  it('collection and shinies run all the way to every creature', () => {
    const topCollection = Math.max(...achievements.filter((a) => a.kind === 'collection').map((a) => a.goal));
    const topShinies = Math.max(...achievements.filter((a) => a.kind === 'shinies').map((a) => a.goal));
    expect(topCollection).toBe(TOTAL); // was capped at 16 — the click-unlock grind now pays
    expect(topShinies).toBe(TOTAL);
  });

  it('the top collection/shinies tiers announce "everything" (nameFor all-branch fires)', () => {
    const topCollection = achievements.find((a) => a.kind === 'collection' && a.goal === TOTAL)!;
    const topShinies = achievements.find((a) => a.kind === 'shinies' && a.goal === TOTAL)!;
    expect(topCollection.nameHe).toContain('כָּל');
    expect(topShinies.nameHe).toContain('כָּל');
  });
});

describe('progressValue reads the matching context field', () => {
  it('each kind maps to its own counter, nothing crosses over', () => {
    const byKind = (k: string) => achievements.find((a) => a.kind === k)!;
    expect(progressValue(byKind('collection'), { ...zero, collectionCount: 7 })).toBe(7);
    expect(progressValue(byKind('shinies'), { ...zero, shinyCount: 3 })).toBe(3);
    expect(progressValue(byKind('lifetime'), { ...zero, lifetimeGoo: 1234 })).toBe(1234);
    // hatches reads totalHatches — the field the store now feeds from
    // lifetimeHatches so prestige never rewinds this ladder.
    expect(progressValue(byKind('hatches'), { ...zero, totalHatches: 42 })).toBe(42);
    expect(progressValue(byKind('clicks'), { ...zero, clicks: 99 })).toBe(99);
    expect(progressValue(byKind('bonuses'), { ...zero, bonusesCollected: 12 })).toBe(12);
    // maxevolved reads maxEvolvedCount (creatures at stage 4) — the level-100 grind.
    expect(progressValue(byKind('maxevolved'), { ...zero, maxEvolvedCount: 5 })).toBe(5);
  });
});

describe('completion + rewards', () => {
  it('isComplete triggers exactly at the goal', () => {
    const first = achievements.find((a) => a.kind === 'clicks')!;
    expect(isComplete(first, { ...zero, clicks: first.goal - 1 })).toBe(false);
    expect(isComplete(first, { ...zero, clicks: first.goal })).toBe(true);
  });

  it('newlyCompleted excludes already-claimed ids', () => {
    const ctx = { ...zero, clicks: 1_000_000, collectionCount: TOTAL };
    const all = newlyCompleted(new Set(), ctx).map((a) => a.id);
    expect(all.length).toBeGreaterThan(0);
    const someId = all[0];
    const withOneClaimed = newlyCompleted(new Set([someId]), ctx).map((a) => a.id);
    expect(withOneClaimed).not.toContain(someId);
  });

  it('starBonusFor sums only the star ladders (collection + shinies)', () => {
    const grindId = achievements.find((a) => a.kind === 'clicks')!.id;
    expect(starBonusFor([grindId])).toBe(0); // grind ladders pay goo, not star
    const starId = achievements.find((a) => a.kind === 'collection')!.id;
    expect(starBonusFor([starId])).toBeGreaterThan(0);
  });
});
