// #1 — displaying a creature (turning its ability on) must NOT change what its
// upgrades/evolutions cost. The ability is a pure income win: income goes up,
// the price stays put. Regression guard for the tester report that selecting a
// creature to the main screen raised its upgrade price.

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

const { useGame, selectGooPerSec } = await import('./store');
const { defaultSaveState } = await import('./game/save');

const NOW = 1_754_000_000_000;
const RICH = 1e12;

// blombo is a common creature whose ability type is 'income' — the exact case
// from the report (an income-boosting creature shown on screen).
const setup = (equippedMain: string | null) => {
  useGame.setState({
    ...defaultSaveState(NOW),
    loaded: true,
    goo: RICH,
    characters: { blombo: { level: 20 } },
    equippedMain: equippedMain as never,
  });
};

// How much a single action deducts from the bank.
const spent = (action: () => void) => {
  const before = useGame.getState().goo;
  action();
  return before - useGame.getState().goo;
};

beforeEach(() => {
  store = {};
});

describe('pricing is independent of which creature is displayed', () => {
  it('level-up costs the same whether or not the creature is on screen', () => {
    setup(null);
    const costOff = spent(() => useGame.getState().levelUpCreature('blombo'));

    setup('blombo');
    const costOn = spent(() => useGame.getState().levelUpCreature('blombo'));

    expect(costOff).toBeGreaterThan(0);
    expect(costOn).toBe(costOff);
  });

  it('evolution costs the same whether or not the creature is on screen', () => {
    // Put blombo at its first evolution threshold so evolveCreature fires.
    const atThreshold = () => useGame.setState({ characters: { blombo: { level: 200 } }, goo: RICH });

    setup(null);
    atThreshold();
    const costOff = spent(() => useGame.getState().evolveCreature('blombo'));

    setup('blombo');
    atThreshold();
    const costOn = spent(() => useGame.getState().evolveCreature('blombo'));

    expect(costOff).toBeGreaterThan(0);
    expect(costOn).toBe(costOff);
  });

  it('still grants the income bonus when displayed (the ability is not disabled)', () => {
    setup(null);
    const rateOff = selectGooPerSec(useGame.getState());

    setup('blombo');
    const rateOn = selectGooPerSec(useGame.getState());

    // Displaying the income creature really does raise the shown rate...
    expect(rateOn).toBeGreaterThan(rateOff);
  });
});
