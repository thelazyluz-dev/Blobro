// Offline earnings (§8). Pure.

import { offlineCapSeconds, offlineMinSeconds, offlineRate } from './balance';

export interface OfflineReport {
  secondsAway: number; // raw seconds away
  cappedSeconds: number; // seconds actually paid for (capped)
  goo: number; // goo earned
  capped: boolean; // true if the away time hit the cap
}

/**
 * offlineGoo = gooPerSec × min(secondsAway, cap) × rate
 * Returns null when the player wasn't away long enough to earn anything.
 */
export function computeOffline(gooPerSecValue: number, secondsAway: number): OfflineReport | null {
  if (secondsAway <= offlineMinSeconds || gooPerSecValue <= 0) return null;
  const cappedSeconds = Math.min(secondsAway, offlineCapSeconds);
  const goo = gooPerSecValue * cappedSeconds * offlineRate;
  if (goo <= 0) return null;
  return {
    secondsAway,
    cappedSeconds,
    goo,
    capped: secondsAway > offlineCapSeconds,
  };
}
