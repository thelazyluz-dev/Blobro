// Achievement goo rewards scale with income: a grind badge pays the larger of
// its fixed grant and ~N seconds of the player's current income, so it stays
// meaningful deep into the game. Star badges still pay a permanent % (no goo).

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
const { achievementGooBase } = await import('./game/balance');

const NOW = 1_754_000_000_000;

beforeEach(() => {
  store = {};
  useGame.setState({ ...defaultSaveState(NOW), loaded: true });
});

describe('income-scaled achievement rewards', () => {
  it('a fresh (no-income) player still gets the fixed base reward', () => {
    useGame.setState({ characters: {}, clicks: 100, goo: 0, achievements: [] });
    useGame.getState().claimAchievement('clicks-100'); // grind ladder, tier 1
    expect(useGame.getState().goo).toBe(achievementGooBase);
  });

  it('a rich player gets far more than the fixed base (scaled by income)', () => {
    // A high-level creature → large passive income → the income floor dominates.
    useGame.setState({ characters: { blombo: { level: 800 } }, clicks: 100, goo: 0, achievements: [] });
    useGame.getState().claimAchievement('clicks-100');
    const paid = useGame.getState().goo;
    expect(paid).toBeGreaterThan(achievementGooBase * 100); // clearly income-scaled, not the flat 200
  });

  it('a star ladder badge pays no goo (it grants a permanent %)', () => {
    // Own 4 creatures so collection-4 (a star ladder) is complete.
    useGame.setState({
      characters: { blombo: { level: 1 }, fizzik: { level: 1 }, nono: { level: 1 }, grumpolo: { level: 1 } },
      goo: 0,
      achievements: [],
    });
    useGame.getState().claimAchievement('collection-4');
    expect(useGame.getState().achievements).toContain('collection-4');
    expect(useGame.getState().goo).toBe(0); // star badge → no goo
  });
});
