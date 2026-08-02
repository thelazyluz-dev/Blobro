// Tests for displaced-save recovery.
//
// The cloud merge picks a winner by lifetimeGoo and stashes the loser. That
// stash is the last line of defence behind the owner's #1 rule — never drop a
// player's progress — so the thing worth proving here is not that restore
// "works", but that it CANNOT LOSE ANYTHING: it swaps, so whatever it replaces
// becomes the new stash and the player can go back and forth forever.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// An in-memory stand-in for the IndexedDB layer, so the store's real
// restore logic runs against real read/write behaviour.
let store: Record<string, unknown> = {};
vi.mock('./persistence', () => ({
  loadRaw: async () => store.state,
  persist: async (s: unknown) => {
    store.state = s;
  },
  backupLocal: async (s: unknown) => {
    store.localBackup = s;
  },
  loadBackup: async () => store.localBackup,
}));

vi.mock('./net/save', async () => {
  const actual = await vi.importActual<typeof import('./net/save')>('./net/save');
  return { ...actual, fetchCloudSave: async () => null, pushCloudSave: async () => ({ ok: false, conflict: null }) };
});

const { useGame } = await import('./store');
const { defaultSaveState } = await import('./game/save');
const { accessories, backgroundSkins } = await import('./game/cosmetics');

const NOW = 1_754_000_000_000;

function saveWith(lifetimeGoo: number, clicks: number) {
  return { ...defaultSaveState(NOW), lifetimeGoo, goo: lifetimeGoo, clicks };
}

beforeEach(() => {
  store = {};
  useGame.setState({ loaded: true, backupAvailable: null });
});

afterEach(() => {
  useGame.setState({ loaded: false, backupAvailable: null });
});

describe('restoreBackup', () => {
  it('does nothing, and clears the offer, when there is no stash', async () => {
    useGame.setState({ lifetimeGoo: 500, backupAvailable: { lifetimeGoo: 9, savedAt: NOW } });
    await useGame.getState().restoreBackup();
    expect(useGame.getState().lifetimeGoo).toBe(500);
    expect(useGame.getState().backupAvailable).toBeNull();
  });

  it('brings the stashed save back into play', async () => {
    store.localBackup = saveWith(999_000, 4_321);
    useGame.setState({ lifetimeGoo: 100, goo: 100, clicks: 7 });

    await useGame.getState().restoreBackup();

    expect(useGame.getState().lifetimeGoo).toBe(999_000);
    expect(useGame.getState().clicks).toBe(4_321);
  });

  it('SWAPS rather than overwrites — the replaced save becomes the new stash', async () => {
    store.localBackup = saveWith(999_000, 4_321);
    useGame.setState({ lifetimeGoo: 100, goo: 100, clicks: 7 });

    await useGame.getState().restoreBackup();

    // What was on screen a moment ago is now the thing on offer.
    expect(useGame.getState().backupAvailable?.lifetimeGoo).toBe(100);
    expect((store.localBackup as { lifetimeGoo: number }).lifetimeGoo).toBe(100);
  });

  it('is fully reversible — restoring twice returns exactly where you started', async () => {
    store.localBackup = saveWith(999_000, 4_321);
    useGame.setState({ lifetimeGoo: 100, goo: 100, clicks: 7 });

    await useGame.getState().restoreBackup();
    await useGame.getState().restoreBackup();

    expect(useGame.getState().lifetimeGoo).toBe(100);
    expect(useGame.getState().clicks).toBe(7);
    // …and the other save is still there, still one press away.
    expect(useGame.getState().backupAvailable?.lifetimeGoo).toBe(999_000);
  });

  it('persists the restored save, so a reload keeps it', async () => {
    store.localBackup = saveWith(999_000, 4_321);
    useGame.setState({ lifetimeGoo: 100, goo: 100, clicks: 7 });

    await useGame.getState().restoreBackup();

    expect((store.state as { lifetimeGoo: number }).lifetimeGoo).toBe(999_000);
  });

  it('sanitizes a corrupted stash instead of trusting it', async () => {
    // A stash is just bytes on the device; it goes through migrate() like any
    // other save rather than being spread into state raw.
    store.localBackup = { version: 12, lifetimeGoo: -5, clicks: Number.NaN, characters: { 'not-real': { level: 9 } } };
    useGame.setState({ lifetimeGoo: 100, clicks: 7 });

    await useGame.getState().restoreBackup();

    expect(useGame.getState().lifetimeGoo).toBe(0);
    expect(useGame.getState().clicks).toBe(0);
    expect(useGame.getState().characters['not-real' as never]).toBeUndefined();
  });
});

describe('buyCosmetic — the tap gate is a rule, not a button state', () => {
  it('refuses a gated item on wealth alone', async () => {
    const gated = [...backgroundSkins, ...accessories].find((c) => (c.requiresClicks ?? 0) > 0)!;
    useGame.setState({ goo: Number.MAX_SAFE_INTEGER, clicks: 0, ownedCosmetics: [] });

    useGame.getState().buyCosmetic(gated.id);

    // Infinite goo must not be enough — this is called directly, bypassing the
    // shop UI entirely, because the UI is only one caller of the rule.
    expect(useGame.getState().ownedCosmetics).not.toContain(gated.id);
    expect(useGame.getState().goo).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('allows it once the taps are there', () => {
    const gated = [...backgroundSkins, ...accessories].find((c) => (c.requiresClicks ?? 0) > 0)!;
    useGame.setState({ goo: Number.MAX_SAFE_INTEGER, clicks: gated.requiresClicks!, ownedCosmetics: [] });

    useGame.getState().buyCosmetic(gated.id);

    expect(useGame.getState().ownedCosmetics).toContain(gated.id);
  });

  it('still refuses when the taps are there but the goo is not', () => {
    const gated = [...backgroundSkins, ...accessories].find((c) => (c.requiresClicks ?? 0) > 0)!;
    useGame.setState({ goo: 0, clicks: gated.requiresClicks!, ownedCosmetics: [] });

    useGame.getState().buyCosmetic(gated.id);

    expect(useGame.getState().ownedCosmetics).not.toContain(gated.id);
  });
});
