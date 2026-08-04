import { describe, expect, it } from 'vitest';
import { computeOffline } from './offline';
import { offlineCapSeconds, offlineMinSeconds, offlineRate } from './balance';

describe('computeOffline — the "while you were away" payout', () => {
  it('returns null below or exactly at the minimum away time', () => {
    expect(computeOffline(100, offlineMinSeconds)).toBeNull();
    expect(computeOffline(100, offlineMinSeconds - 1)).toBeNull();
    expect(computeOffline(100, offlineMinSeconds + 1)).not.toBeNull();
  });

  it('returns null when there is no passive income to accrue', () => {
    expect(computeOffline(0, 100_000)).toBeNull();
    expect(computeOffline(-5, 100_000)).toBeNull();
  });

  it('pays rate × time × the reduced offline factor, uncapped below the cap', () => {
    const away = 1000; // < cap
    const r = computeOffline(100, away)!;
    expect(r.capped).toBe(false);
    expect(r.cappedSeconds).toBe(away);
    expect(r.goo).toBe(100 * away * offlineRate);
  });

  it('flips `capped` and clamps the paid seconds once past the cap', () => {
    // Exactly at the cap is NOT "capped" (nothing was lost yet).
    const atCap = computeOffline(100, offlineCapSeconds)!;
    expect(atCap.capped).toBe(false);
    expect(atCap.cappedSeconds).toBe(offlineCapSeconds);

    // One second past the cap: capped, and only cap-seconds are paid.
    const overCap = computeOffline(100, offlineCapSeconds + 1)!;
    expect(overCap.capped).toBe(true);
    expect(overCap.cappedSeconds).toBe(offlineCapSeconds);
    expect(overCap.goo).toBe(100 * offlineCapSeconds * offlineRate);
  });
});
