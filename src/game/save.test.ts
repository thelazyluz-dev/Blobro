// Save migration is the highest-stakes pure code in the game: a mistake here
// wipes a real child's progress. These tests pin the guarantees.

import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, defaultSaveState, migrate } from './save';
import { maxCpm } from './cpm';
import { DEFAULT_BLOB } from './cosmetics';

const NOW = 1_700_000_000_000;

/** A save in the pre-equippedMain / pre-milestonesShown (v9) shape. */
const v9Save = {
  version: 9,
  goo: 123456,
  lifetimeGoo: 999999,
  upgrades: { finger: 5, power: 3, autoTap: 4, nurture: 2, crit: 1, luck: 1 },
  characters: { blombo: { level: 12 }, fizzik: { level: 30, evolution: 1 } },
  eggs: 3,
  totalHatches: 20,
  sinceRare: 2,
  bonusesCollected: 9,
  clicks: 4321,
  leaderboard: [{ name: 'ישן', clicks: 100 }],
  achievements: [],
  ownedCosmetics: ['blob-goo', 'bg-aurora', 'acc-none', 'sound-classic', 'blob-bubble'],
  equippedBlob: 'blob-bubble',
  equippedBackground: 'bg-aurora',
  equippedAccessory: 'acc-none',
  equippedSound: 'sound-classic',
  lastSeen: NOW,
  muted: false,
};

describe('migrate', () => {
  it('keeps every bit of progress from an old save', () => {
    const s = migrate(v9Save, NOW);
    expect(s.version).toBe(CURRENT_VERSION);
    expect(s.goo).toBe(123456);
    expect(s.lifetimeGoo).toBe(999999);
    expect(s.clicks).toBe(4321);
    expect(s.eggs).toBe(3);
    expect(s.totalHatches).toBe(20);
    expect(s.bonusesCollected).toBe(9);
    expect(s.upgrades).toEqual(v9Save.upgrades);
    expect(s.characters.blombo?.level).toBe(12);
    expect(s.characters.fizzik?.level).toBe(30);
  });

  it('defaults the fields that old saves never had', () => {
    const s = migrate(v9Save, NOW);
    expect(s.equippedMain).toBeNull();
    expect(s.milestonesShown).toEqual([]);
  });

  it('normalizes a retired blob skin back to the starter blob', () => {
    const s = migrate(v9Save, NOW);
    expect(s.equippedBlob).toBe(DEFAULT_BLOB);
  });

  it('never throws on garbage, and falls back to a fresh save', () => {
    for (const junk of [null, undefined, 0, 'nope', [], { version: 'x' }]) {
      expect(() => migrate(junk, NOW)).not.toThrow();
    }
    expect(migrate(null, NOW).goo).toBe(0);
  });

  it('drops unknown creature ids and clamps negative numbers', () => {
    const s = migrate(
      { ...v9Save, goo: -500, clicks: -3, characters: { notARealCreature: { level: 9 }, blombo: { level: 4 } } },
      NOW,
    );
    expect(s.goo).toBe(0);
    expect(s.clicks).toBe(0);
    expect(Object.keys(s.characters)).toEqual(['blombo']);
  });

  it('caps evolution to what the creature level actually allows', () => {
    // level 7 is below the first evolve threshold, so stage must clamp to 0
    const s = migrate({ ...v9Save, characters: { fizzik: { level: 7, evolution: 3 } } }, NOW);
    expect(s.characters.fizzik?.evolution ?? 0).toBe(0);
  });

  it('keeps only real milestone thresholds', () => {
    const s = migrate({ ...v9Save, milestonesShown: [1e6, 'bad', null, 1e9] }, NOW);
    expect(s.milestonesShown).toEqual([1e6, 1e9]);
  });

  it('round-trips its own output unchanged', () => {
    const once = migrate(v9Save, NOW);
    const twice = migrate(once, NOW);
    expect(twice).toEqual(once);
  });

  describe('v13: taps-per-minute record + the goo ≤ lifetime invariant', () => {
    it('a pre-v13 save gets bestCpm 0, everything else untouched', () => {
      const s = migrate(v9Save, NOW);
      expect(s.bestCpm).toBe(0);
      expect(s.goo).toBe(123456);
    });

    it('an impossible bestCpm is clamped to the physical ceiling', () => {
      expect(migrate({ ...v9Save, bestCpm: 999_999 }, NOW).bestCpm).toBe(maxCpm);
      expect(migrate({ ...v9Save, bestCpm: -5 }, NOW).bestCpm).toBe(0);
      expect(migrate({ ...v9Save, bestCpm: 480 }, NOW).bestCpm).toBe(480);
    });

    it('held goo above lifetime RAISES lifetime — the player is never cut down', () => {
      // The board ranks by held goo, so an edited save could otherwise carry a
      // fortune next to a tiny, audit-clean lifetime. Raising lifetime turns
      // that fortune into a lifetime jump — the delta the audit measures.
      const s = migrate({ ...v9Save, goo: 5_000_000, lifetimeGoo: 10 }, NOW);
      expect(s.goo).toBe(5_000_000); // progress kept in full
      expect(s.lifetimeGoo).toBe(5_000_000); // invariant restored upward
    });
  });

  it('a fresh save is already current', () => {
    expect(defaultSaveState(NOW).version).toBe(CURRENT_VERSION);
    // rng gets a fresh random seed each call, so compare everything else.
    const { rng: _r1, ...freshRest } = defaultSaveState(NOW);
    const { rng: _r2, ...migratedRest } = migrate(defaultSaveState(NOW), NOW);
    expect(migratedRest).toEqual(freshRest);
  });

  describe('rng stream (PR 2: deterministic outcome randomness)', () => {
    it('a fresh save gets a valid rng stream at cursor 0', () => {
      const s = defaultSaveState(NOW);
      expect(Number.isInteger(s.rng.seed)).toBe(true);
      expect(s.rng.seed).toBeGreaterThanOrEqual(0);
      expect(s.rng.seed).toBeLessThan(4294967296);
      expect(s.rng.cursor).toBe(0);
    });

    it('an old save with no rng field gets a fresh valid stream, not a crash', () => {
      const s = migrate(v9Save, NOW);
      expect(Number.isInteger(s.rng.seed)).toBe(true);
      expect(s.rng.cursor).toBe(0);
    });

    it('a malformed rng field is sanitized to a fresh stream instead of throwing', () => {
      for (const junk of [null, 'nope', 42, {}, { seed: 'x', cursor: 0 }, { seed: 1, cursor: -5 }, { seed: NaN, cursor: 0 }]) {
        expect(() => migrate({ ...v9Save, rng: junk }, NOW)).not.toThrow();
        const s = migrate({ ...v9Save, rng: junk }, NOW);
        expect(Number.isInteger(s.rng.seed)).toBe(true);
        expect(s.rng.cursor).toBeGreaterThanOrEqual(0);
      }
    });

    it('round-trips an in-progress stream exactly (this is what closes save-scumming)', () => {
      const withProgress = { ...v9Save, rng: { seed: 123456, cursor: 789 } };
      const s = migrate(withProgress, NOW);
      expect(s.rng).toEqual({ seed: 123456, cursor: 789 });
      // Migrating again (simulating a reload) must not reset or re-roll it.
      const again = migrate(s, NOW);
      expect(again.rng).toEqual({ seed: 123456, cursor: 789 });
    });
  });
});
