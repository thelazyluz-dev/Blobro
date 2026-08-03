// Clicks-per-minute record (the ⚡ leaderboard tab). Pure — no window, no
// React, no store — like everything else in src/game.
//
// Only MANUAL taps count: the robot hand's auto-clicks accrue inside the
// engine tick and never pass through here, so the record measures fingers,
// which is the whole point of a taps-per-minute board.

import { maxHumanTapsPerSec } from './verify';

/** The record's window: best number of taps in any rolling 60 seconds. */
export const cpmWindowMs = 60_000;

/**
 * Hard ceiling on a plausible record — the same 25 taps/sec bound the
 * plausibility audit uses, sustained for a full minute. No human sustains
 * this (a fast adult holds ~10/sec in bursts); anything above it in a save is
 * an edited save, and migrate() clamps it out before it can reach a board.
 */
export const maxCpm = maxHumanTapsPerSec * 60;

/**
 * Fold one manual tap into the rolling window.
 *
 * `recent` is the (transient, never saved) list of tap timestamps still
 * inside the window; the returned `cpm` is the window's tap count after this
 * tap — compare it against the stored record. Bounded: the list can never
 * hold more than a minute of taps, and expired entries drop on every call.
 */
export function recordManualTap(recent: number[], now: number): { recent: number[]; cpm: number } {
  const cutoff = now - cpmWindowMs;
  const kept = recent.filter((t) => t > cutoff && t <= now);
  kept.push(now);
  return { recent: kept, cpm: Math.min(kept.length, maxCpm) };
}
