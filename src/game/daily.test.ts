import { describe, expect, it } from 'vitest';
import {
  GIFT_CYCLE_DAYS,
  QUEST_POOL,
  bumpQuest,
  claimGift,
  dayKey,
  freshQuestState,
  giftClaimable,
  giftRewardFor,
  nextGiftDay,
  questComplete,
  questStateFor,
  questsForDay,
} from './daily';

const DAY = 86_400_000;
const T0 = 1_700_000_000_000; // an arbitrary fixed instant

describe('the 7-day gift', () => {
  it('is claimable once per UTC day', () => {
    const fresh = { lastGiftDay: 0, giftStreak: 0 };
    expect(giftClaimable(fresh, T0)).toBe(true);
    const claimed = claimGift(fresh, T0);
    expect(giftClaimable(claimed, T0)).toBe(false);
    expect(giftClaimable(claimed, T0 + DAY)).toBe(true);
  });

  it('advances the streak on consecutive days and wraps 7 → 1', () => {
    let s = { lastGiftDay: 0, giftStreak: 0 };
    for (let d = 1; d <= GIFT_CYCLE_DAYS; d++) {
      const now = T0 + (d - 1) * DAY;
      expect(nextGiftDay(s, now)).toBe(d);
      s = claimGift(s, now);
    }
    // Day 8: the cycle starts over.
    expect(nextGiftDay(s, T0 + GIFT_CYCLE_DAYS * DAY)).toBe(1);
  });

  it('forgives a single missed day, resets after two', () => {
    const s = claimGift(claimGift({ lastGiftDay: 0, giftStreak: 0 }, T0), T0 + DAY); // streak day 2
    expect(nextGiftDay(s, T0 + 3 * DAY)).toBe(3); // one day missed — forgiven
    expect(nextGiftDay(s, T0 + 4 * DAY)).toBe(1); // two days missed — back to day 1
  });

  it('day 7 pays an egg; earlier days pay escalating income-seconds', () => {
    expect(giftRewardFor(GIFT_CYCLE_DAYS)).toEqual({ kind: 'egg' });
    const d1 = giftRewardFor(1);
    const d6 = giftRewardFor(6);
    expect(d1.kind).toBe('goo');
    expect(d6.kind).toBe('goo');
    if (d1.kind === 'goo' && d6.kind === 'goo') {
      expect(d6.incomeSeconds).toBeGreaterThan(d1.incomeSeconds);
      expect(d6.minGoo).toBeGreaterThan(d1.minGoo);
    }
  });
});

describe('daily quests', () => {
  it('picks three distinct quests deterministically, same for any player on a given day', () => {
    const day = dayKey(T0);
    const a = questsForDay(day);
    const b = questsForDay(day);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(new Set(a.map((q) => q.id)).size).toBe(3);
    // A different day rotates to a different set.
    expect(questsForDay(day + 1).map((q) => q.id)).not.toEqual(a.map((q) => q.id));
  });

  it('every pool quest appears within a 5-day window', () => {
    const day = dayKey(T0);
    const seen = new Set<string>();
    for (let d = 0; d < QUEST_POOL.length; d++) {
      for (const q of questsForDay(day + d)) seen.add(q.id);
    }
    expect(seen.size).toBe(QUEST_POOL.length);
  });

  it('bumping accumulates and rolls over to a fresh day automatically', () => {
    const taps = QUEST_POOL.find((q) => q.id === 'taps')!;
    let s = freshQuestState(dayKey(T0));
    s = bumpQuest(s, 'taps', taps.target - 100, T0);
    expect(questComplete(s, taps)).toBe(false); // still 100 short
    s = bumpQuest(s, 'taps', 100, T0);
    expect(questComplete(s, taps)).toBe(true);

    // The next day: everything resets, including claims.
    const rolled = questStateFor({ ...s, questsClaimed: ['taps'], questAllClaimed: true }, T0 + DAY);
    expect(rolled.questDay).toBe(dayKey(T0 + DAY));
    expect(rolled.questProgress).toEqual({});
    expect(rolled.questsClaimed).toEqual([]);
    expect(rolled.questAllClaimed).toBe(false);
  });
});
