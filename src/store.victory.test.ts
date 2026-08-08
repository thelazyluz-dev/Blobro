// The decillion victory (endgame moment). winDecillion is the store action the
// game-engine hook calls the first time held goo crosses the win threshold. It
// must grant the exclusive champion crown, open the victory screen, mark the
// 1e33 milestone shown so its regular reveal never stacks, and be idempotent —
// owning the crown IS the persisted "already won" proof (no save migration).

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
const { accessoryById } = await import('./game/cosmetics');
const { decillionWinGoo } = await import('./game/balance');

const NOW = 1_754_000_000_000;

beforeEach(() => {
  store = {};
  useGame.setState({ ...defaultSaveState(NOW), loaded: true });
});

describe('the decillion victory', () => {
  it('the win threshold is the 1e33 decillion and the champion crown is exclusive & free', () => {
    expect(decillionWinGoo).toBe(1e33);
    const crown = accessoryById('acc-champion');
    expect(crown.exclusive).toBe(true); // never sold in the shop
    expect(crown.cost).toBe(0);
    expect(crown.clickBonus).toBeGreaterThan(0);
    expect(crown.incomeBonus).toBeGreaterThan(0);
  });

  it('winDecillion grants the crown, opens the victory screen, and marks 1e33 shown', () => {
    expect(useGame.getState().victory).toBe(false);
    useGame.getState().winDecillion();
    const s = useGame.getState();
    expect(s.ownedCosmetics).toContain('acc-champion');
    expect(s.victory).toBe(true);
    // The regular 1e33 milestone reveal must not also stack on the victory screen.
    expect(s.milestonesShown).toContain(decillionWinGoo);
    expect(s.confettiBursts).toBeGreaterThan(0);
  });

  it('is idempotent — a second win never re-grants or re-opens', () => {
    useGame.getState().winDecillion();
    useGame.getState().dismissVictory();
    const bursts = useGame.getState().confettiBursts;

    useGame.getState().winDecillion(); // already a champion
    const s = useGame.getState();
    expect(s.victory).toBe(false); // did not re-open
    expect(s.confettiBursts).toBe(bursts); // no fresh burst
    expect(s.ownedCosmetics.filter((id) => id === 'acc-champion')).toHaveLength(1);
  });

  it('dismissVictory closes the screen without touching the crown', () => {
    useGame.getState().winDecillion();
    useGame.getState().dismissVictory();
    expect(useGame.getState().victory).toBe(false);
    expect(useGame.getState().ownedCosmetics).toContain('acc-champion'); // kept
  });
});
