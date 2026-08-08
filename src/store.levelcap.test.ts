// Level cap (§ owner rule): a creature can be leveled up to charLevelCap (500);
// to climb past it the creature must have mastered itself — reached the rebirth
// cap. These pin the store actions that spend goo on levels honouring that wall:
// single level-up, level-up-max, and the roster-wide upgrade-all.

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
vi.mock('./net/save', async () => {
  const actual = await vi.importActual<typeof import('./net/save')>('./net/save');
  return { ...actual, fetchCloudSave: async () => null, pushCloudSave: async () => ({ ok: false, conflict: null }) };
});

const { useGame } = await import('./store');
const { defaultSaveState } = await import('./game/save');
const { charLevelCap, rebirthCap } = await import('./game/balance');

const NOW = 1_754_000_000_000;
const RICH = 1e30; // enough goo that only the cap (never affordability) can bind

beforeEach(() => {
  store = {};
  useGame.setState({ ...defaultSaveState(NOW), loaded: true });
});

describe('single level-up respects the cap', () => {
  it('does nothing (no level, no spend) once a non-mastered creature is at the cap', () => {
    useGame.setState({ characters: { blombo: { level: charLevelCap } }, goo: RICH });
    useGame.getState().levelUpCreature('blombo');
    expect(useGame.getState().characters.blombo!.level).toBe(charLevelCap); // unchanged
    expect(useGame.getState().goo).toBe(RICH); // no goo spent
  });

  it('still levels normally below the cap', () => {
    useGame.setState({ characters: { blombo: { level: 10 } }, goo: RICH });
    useGame.getState().levelUpCreature('blombo');
    expect(useGame.getState().characters.blombo!.level).toBe(11);
  });

  it('lets a fully-reborn creature climb past the cap', () => {
    useGame.setState({ characters: { blombo: { level: charLevelCap, rebirths: rebirthCap } }, goo: RICH });
    useGame.getState().levelUpCreature('blombo');
    expect(useGame.getState().characters.blombo!.level).toBe(charLevelCap + 1); // past the wall
  });
});

describe('level-up-max respects the cap', () => {
  it('stops a non-mastered creature exactly at the cap', () => {
    useGame.setState({ characters: { blombo: { level: 490 } }, goo: RICH });
    useGame.getState().levelUpCreatureMax('blombo');
    expect(useGame.getState().characters.blombo!.level).toBe(charLevelCap);
  });

  it('carries a fully-reborn creature past the cap', () => {
    useGame.setState({ characters: { blombo: { level: 490, rebirths: rebirthCap } }, goo: RICH });
    useGame.getState().levelUpCreatureMax('blombo');
    expect(useGame.getState().characters.blombo!.level).toBeGreaterThan(charLevelCap);
  });
});

describe('upgrade-all skips creatures at their cap', () => {
  it('never pushes a non-mastered creature past the cap, but still climbs a reborn one', () => {
    useGame.setState({
      characters: {
        blombo: { level: charLevelCap }, // capped — must be skipped
        fizzik: { level: charLevelCap, rebirths: rebirthCap }, // mastered — may climb
      },
      goo: RICH,
      upgradeAllReadyAt: 0,
    });
    useGame.getState().upgradeAllCreatures();
    const s = useGame.getState();
    expect(s.characters.blombo!.level).toBe(charLevelCap); // untouched at the wall
    expect(s.characters.fizzik!.level).toBeGreaterThan(charLevelCap); // climbed past it
  });
});
