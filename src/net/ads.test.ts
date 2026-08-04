// The three-way settle contract of showRewardedAd: exactly ONE of
// onReward / onNoReward / onNoFill fires, whatever order (or how many times)
// Google's callbacks arrive in. This is the logic that decides whether a kid
// gets their reward — the exact kind of callback-race code that regresses
// silently (QA audit).

import { afterEach, describe, expect, it } from 'vitest';
import { showRewardedAd, type RewardedHandlers } from './ads';

type AdBreakOptions = {
  beforeReward?: (showAdFn: () => void) => void;
  adViewed?: () => void;
  adDismissed?: () => void;
  adBreakDone?: (info?: unknown) => void;
};

let captured: AdBreakOptions | null = null;

function install(adBreak: (o: AdBreakOptions) => void): void {
  (globalThis as Record<string, unknown>).window = { adBreak };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  captured = null;
});

function counters(): { h: RewardedHandlers; counts: Record<string, number> } {
  const counts = { reward: 0, noReward: 0, noFill: 0 };
  return {
    counts,
    h: {
      onReward: () => counts.reward++,
      onNoReward: () => counts.noReward++,
      onNoFill: () => counts.noFill++,
    },
  };
}

describe('showRewardedAd settle contract', () => {
  it('returns false with no ad API — caller falls back to the placeholder', () => {
    install(undefined as never);
    delete ((globalThis as Record<string, unknown>).window as Record<string, unknown>).adBreak;
    const { h } = counters();
    expect(showRewardedAd(h)).toBe(false);
  });

  it('watched to the end → exactly one onReward, even when adBreakDone also fires', () => {
    install((o) => (captured = o));
    const { h, counts } = counters();
    expect(showRewardedAd(h)).toBe(true);
    captured!.beforeReward!(() => {});
    captured!.adViewed!();
    captured!.adBreakDone!();
    expect(counts).toEqual({ reward: 1, noReward: 0, noFill: 0 });
  });

  it('an ad played but was dismissed → exactly one onNoReward', () => {
    install((o) => (captured = o));
    const { h, counts } = counters();
    showRewardedAd(h);
    captured!.beforeReward!(() => {});
    captured!.adDismissed!();
    captured!.adBreakDone!();
    expect(counts).toEqual({ reward: 0, noReward: 1, noFill: 0 });
  });

  it('no ad existed at all (adBreakDone alone) → onNoFill, never onNoReward', () => {
    install((o) => (captured = o));
    const { h, counts } = counters();
    showRewardedAd(h);
    captured!.adBreakDone!();
    expect(counts).toEqual({ reward: 0, noReward: 0, noFill: 1 });
  });

  it('double-firing callbacks can never settle twice', () => {
    install((o) => (captured = o));
    const { h, counts } = counters();
    showRewardedAd(h);
    captured!.beforeReward!(() => {});
    captured!.adViewed!();
    captured!.adViewed!();
    captured!.adBreakDone!();
    captured!.adBreakDone!();
    expect(counts).toEqual({ reward: 1, noReward: 0, noFill: 0 });
  });
});
