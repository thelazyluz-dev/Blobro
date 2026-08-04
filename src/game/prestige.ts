// Prestige — "גלגול מחדש" (the owner-approved v2 of the globalMultiplier
// hook). Pure — no window, no React, no store.
//
// The loop: reset the run (goo, creatures, upgrades, eggs, the egg price
// curve) in exchange for 💎 crystals that boost ALL earnings forever.
// Crystals are a function of TOTAL lifetime goo — strategy-proof, see
// balance.ts — and lifetime itself is NEVER reset: it is "everything ever
// earned", the audit relies on it being monotonic, and it is exactly the
// thing prestige is being paid out against.

import { defaultUpgrades } from './upgrades';
import { prestigeCrystalBonus, prestigeCrystalsPerDecade, prestigeFirstCrystalGoo } from './balance';
import type { SaveState } from './types';

/** Total crystals a given lifetime-goo justifies. Monotonic in lifetime. */
export function crystalsFor(lifetimeGoo: number): number {
  if (!Number.isFinite(lifetimeGoo) || lifetimeGoo < prestigeFirstCrystalGoo) return 0;
  return Math.floor(Math.log10(lifetimeGoo / prestigeFirstCrystalGoo) * prestigeCrystalsPerDecade) + 1;
}

/** The multiplier `crystals` grants (applied to income AND taps). */
export function prestigeMultiplierFor(crystals: number): number {
  return 1 + Math.max(0, crystals) * prestigeCrystalBonus;
}

/** Crystals a roll RIGHT NOW would add. 0 = nothing to gain yet. */
export function crystalsGained(save: Pick<SaveState, 'lifetimeGoo' | 'prestigeCrystals'>): number {
  return Math.max(0, crystalsFor(save.lifetimeGoo) - save.prestigeCrystals);
}

/** A roll is offered only when it actually pays. */
export function canPrestige(save: Pick<SaveState, 'lifetimeGoo' | 'prestigeCrystals'>): boolean {
  return crystalsGained(save) >= 1;
}

/** Lifetime goo still needed before ANOTHER crystal exists (0 = one is waiting). */
export function gooToNextCrystal(save: Pick<SaveState, 'lifetimeGoo' | 'prestigeCrystals'>): number {
  const have = crystalsFor(save.lifetimeGoo);
  // Invert the curve: crystal n exists from firstGoo × 10^((n-1)/perDecade).
  const nextAt = prestigeFirstCrystalGoo * Math.pow(10, have / prestigeCrystalsPerDecade);
  return Math.max(0, nextAt - save.lifetimeGoo);
}

/**
 * Progress (0..1) toward the NEXT crystal, measured in log space — goo grows
 * exponentially, so a linear-in-goo bar would sit near empty for almost the
 * whole band and then snap full. The log measure fills the bar evenly, which
 * is the point of the UI: it gives "one crystal at a time" a visible heartbeat
 * without changing the strategy-proof payout (crystals are still a pure
 * function of lifetime).
 */
export function prestigeProgress(save: Pick<SaveState, 'lifetimeGoo'>): number {
  const life = save.lifetimeGoo;
  if (!Number.isFinite(life) || life <= 0) return 0;
  // Before the first crystal there is no lower band — fill toward that threshold.
  if (life < prestigeFirstCrystalGoo) return Math.max(0, Math.min(1, life / prestigeFirstCrystalGoo));
  const decades = Math.log10(life / prestigeFirstCrystalGoo) * prestigeCrystalsPerDecade;
  return Math.max(0, Math.min(1, decades - Math.floor(decades)));
}

/**
 * The roll itself: a pure SaveState → SaveState transform.
 *
 * RESET (the fresh run): held goo, creatures, upgrades, egg inventory, the
 * egg price curve (totalHatches) and the pity streak.
 * KEPT (forever): lifetime goo (see header), lifetimeHatches (so the hatch
 * achievement ladder never rewinds — only the egg-price totalHatches resets),
 * clicks + bestCpm (leaderboard records), achievements and their bonus, all
 * cosmetics, milestones already celebrated (each fact shows once, ever —
 * product rule), the daily loop, the ad-egg cooldown, the local leaderboard,
 * and the rng stream.
 */
export function applyPrestige(save: SaveState, _now: number): SaveState {
  return {
    ...save,
    goo: 0,
    characters: {},
    upgrades: { ...defaultUpgrades },
    eggs: 0,
    totalHatches: 0,
    sinceRare: 0,
    equippedMain: null, // the shown creature no longer exists
    prestigeCrystals: crystalsFor(save.lifetimeGoo),
    prestigeCount: save.prestigeCount + 1,
  };
}
