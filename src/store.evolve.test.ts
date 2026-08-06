// Tests for the one-press "level up to the evolution threshold, then evolve"
// action. What matters: it only fires when the player can afford BOTH the
// missing levels and the evolution, it lands the creature exactly at the
// threshold with the next evolution stage, and it deducts the whole sum.

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

const { useGame, selectGooPerSec, selectMods } = await import('./store');
const { defaultSaveState } = await import('./game/save');
const { evolveLevels } = await import('./game/balance');
const { levelUpToCost, evolveCost } = await import('./game/economy');
const { charactersById, incomeMultOf } = await import('./game/characters');

const NOW = 1_754_000_000_000;

beforeEach(() => {
  store = {};
  useGame.setState({ ...defaultSaveState(NOW), loaded: true });
});

// blombo (common, egg): first evolution threshold is evolveLevels[0].
const combinedCost = (level: number) => {
  const s = useGame.getState();
  useGame.setState({ characters: { blombo: { level } } });
  const s2 = useGame.getState();
  const m = selectMods(s2);
  const rate = selectGooPerSec(s2);
  const im = incomeMultOf(charactersById.blombo);
  const target = evolveLevels[0];
  const cost = levelUpToCost('common', { level }, target, m, rate, im) + evolveCost('common', { level: target }, m, rate, im);
  useGame.setState({ characters: s.characters });
  return { cost, target };
};

describe('evolveWithLevelUp', () => {
  it('levels the creature to the threshold and evolves, deducting the whole sum', () => {
    const { cost, target } = combinedCost(1);
    useGame.setState({ characters: { blombo: { level: 1 } }, goo: cost + 1000 });
    useGame.getState().evolveWithLevelUp('blombo');
    const held = useGame.getState().characters.blombo;
    expect(held?.level).toBe(target);
    expect(held?.evolution).toBe(1);
    expect(useGame.getState().goo).toBe(1000);
  });

  it('does nothing when the player cannot afford both the levels and the evolution', () => {
    const { cost } = combinedCost(1);
    useGame.setState({ characters: { blombo: { level: 1 } }, goo: cost - 1 });
    useGame.getState().evolveWithLevelUp('blombo');
    const held = useGame.getState().characters.blombo;
    expect(held).toEqual({ level: 1 });
    expect(useGame.getState().goo).toBe(cost - 1);
  });

  it('does nothing at max evolution', () => {
    useGame.setState({ characters: { blombo: { level: 100, evolution: evolveLevels.length } }, goo: 1e18 });
    useGame.getState().evolveWithLevelUp('blombo');
    expect(useGame.getState().characters.blombo?.evolution).toBe(evolveLevels.length);
  });
});
