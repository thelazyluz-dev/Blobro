// The NaN firewall. A single non-finite number reaching goo/lifetimeGoo is
// the worst corruption the game has: it spreads through every derived value,
// JSON-serializes to null, and the next load's sanitizer reads null as 0 — a
// total, silent wipe of the player's progress. Three layers stop it:
// tick() refuses a non-finite gain at the source, and both save writers
// (local persist + cloud checkpoint) refuse to overwrite a good save with a
// poisoned snapshot.

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { useGame } = await import('./store');
const { defaultSaveState } = await import('./game/save');

const NOW = 1_754_000_000_000;

beforeEach(() => {
  store = {};
  useGame.setState({ ...defaultSaveState(NOW), loaded: true });
});

describe('tick() refuses non-finite gains', () => {
  it('a corrupted creature level (NaN) leaves goo and lifetimeGoo untouched', () => {
    useGame.setState({
      goo: 500,
      lifetimeGoo: 1000,
      characters: { blombo: { level: Number.NaN } },
    });
    useGame.getState().tick(0.1);
    expect(useGame.getState().goo).toBe(500);
    expect(useGame.getState().lifetimeGoo).toBe(1000);
  });

  it('an Infinity in the chain is refused the same way', () => {
    // (An Infinity creature LEVEL is already neutralised upstream by the level
    // cap, which clamps it to a finite level — so drive Infinity through dt,
    // which multiplies straight into the gain.)
    useGame.setState({
      goo: 500,
      lifetimeGoo: 1000,
      characters: { blombo: { level: 1 } },
    });
    useGame.getState().tick(Number.POSITIVE_INFINITY);
    expect(useGame.getState().goo).toBe(500);
    expect(useGame.getState().lifetimeGoo).toBe(1000);
  });

  it('a healthy tick still earns (the guard must not overcorrect)', () => {
    useGame.setState({ goo: 0, lifetimeGoo: 0, characters: { blombo: { level: 1 } } });
    useGame.getState().tick(1);
    expect(useGame.getState().goo).toBeGreaterThan(0);
    expect(Number.isFinite(useGame.getState().goo)).toBe(true);
  });
});

describe('saveGame() never overwrites a good save with a poisoned one', () => {
  it('skips the write when goo is NaN, keeping the previous save intact', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      useGame.setState({ goo: 100, lifetimeGoo: 100 });
      await useGame.getState().saveGame();
      const good = store.state as { goo: number };
      expect(good.goo).toBe(100);

      useGame.setState({ goo: Number.NaN });
      await useGame.getState().saveGame();
      // The poisoned snapshot must NOT have replaced the good one.
      expect((store.state as { goo: number }).goo).toBe(100);
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });

  it('skips the write when lifetimeGoo is Infinity', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      useGame.setState({ goo: 7, lifetimeGoo: 7 });
      await useGame.getState().saveGame();

      useGame.setState({ lifetimeGoo: Number.POSITIVE_INFINITY });
      await useGame.getState().saveGame();
      expect((store.state as { lifetimeGoo: number }).lifetimeGoo).toBe(7);
    } finally {
      err.mockRestore();
    }
  });
});
