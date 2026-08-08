// Tests for the rebirth action (the "mastering" loop). The pure math is locked
// by golden vectors; what matters here is the ACTION's gating and effect —
// it must only fire at max evolution, reset the creature, bank a rebirth, and
// refuse to run past the cap (a stale UI must never over-rebirth).

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

const { useGame, selectRebirthIncomeBonus, selectCostWealth } = await import('./store');
const { defaultSaveState } = await import('./game/save');
const { maxEvolution, rebirthCap } = await import('./game/balance');
const { rebirthCost } = await import('./game/economy');

const NOW = 1_754_000_000_000;

beforeEach(() => {
  store = {};
  useGame.setState({ ...defaultSaveState(NOW), loaded: true });
});

describe('rebirthCreature', () => {
  const RICH = 1e30; // enough goo to afford the rebirth cost in these tests

  it('resets a max-evolved creature to level 1 / stage 0 and banks a rebirth', () => {
    useGame.setState({ characters: { blombo: { level: 137, evolution: maxEvolution } }, goo: RICH });
    useGame.getState().rebirthCreature('blombo');
    const held = useGame.getState().characters.blombo;
    expect(held).toEqual({ level: 1, rebirths: 1 });
  });

  it('stacks rebirths across the loop', () => {
    useGame.setState({ characters: { blombo: { level: 100, evolution: maxEvolution, rebirths: 3 } }, goo: RICH });
    useGame.getState().rebirthCreature('blombo');
    expect(useGame.getState().characters.blombo).toEqual({ level: 1, rebirths: 4 });
  });

  it('costs goo (wealth-scaled) and refuses when you cannot afford it', () => {
    useGame.setState({ characters: { blombo: { level: 100, evolution: maxEvolution } }, goo: 0 });
    useGame.getState().rebirthCreature('blombo');
    // Too poor → no rebirth happened.
    expect(useGame.getState().characters.blombo).toEqual({ level: 100, evolution: maxEvolution });
    // Rich enough → it deducts a positive cost and rebirths. (Modest goo so the
    // deduction is visible — against 1e30 it would round away in float.)
    // Predict the cost from the SAME base "cost wealth" the action prices off
    // (selectCostWealth = gooPerSec with base mods) — NOT selectGooPerSec, which
    // also folds in the live wall-clock EVENT multiplier the action deliberately
    // ignores. Using the wrong rate made this flaky: it failed whenever a goo
    // event happened to be active at test time.
    const rate = selectCostWealth(useGame.getState());
    const cost = rebirthCost(0, rate);
    expect(cost).toBeGreaterThan(0);
    useGame.setState({ goo: cost + 5000 });
    useGame.getState().rebirthCreature('blombo');
    expect(useGame.getState().characters.blombo?.rebirths).toBe(1);
    expect(useGame.getState().goo).toBe(5000);
  });

  it('refuses when the creature is not fully evolved', () => {
    const before = { level: 80, evolution: maxEvolution - 1 };
    useGame.setState({ characters: { blombo: { ...before } } });
    useGame.getState().rebirthCreature('blombo');
    expect(useGame.getState().characters.blombo).toEqual(before);
  });

  it('refuses once the cap is reached — a stale UI cannot over-rebirth', () => {
    useGame.setState({ characters: { blombo: { level: 100, evolution: maxEvolution, rebirths: rebirthCap } } });
    useGame.getState().rebirthCreature('blombo');
    expect(useGame.getState().characters.blombo?.rebirths).toBe(rebirthCap);
  });

  it('does nothing for an unowned creature', () => {
    useGame.setState({ characters: {} });
    expect(() => useGame.getState().rebirthCreature('blombo')).not.toThrow();
    expect(useGame.getState().characters.blombo).toBeUndefined();
  });
});

describe('selectRebirthIncomeBonus (GLOBAL total across the roster)', () => {
  it('is 0 when no creature has been reborn', () => {
    useGame.setState({ characters: { blombo: { level: 20 }, fizzik: { level: 10 } } });
    expect(selectRebirthIncomeBonus(useGame.getState())).toBe(0);
  });

  it('is the SUM of every rebirth × 10%, always on (not weighted by income)', () => {
    // 10 rebirths anywhere → +100% global, regardless of that creature's level
    // or which is the main. A non-reborn creature does NOT dilute it.
    useGame.setState({
      characters: { blombo: { level: 1, rebirths: 10 }, fizzik: { level: 900 } },
      equippedMain: null,
    });
    expect(selectRebirthIncomeBonus(useGame.getState())).toBeCloseTo(1.0, 6);
  });

  it('adds up across creatures', () => {
    useGame.setState({
      characters: { blombo: { level: 5, rebirths: 3 }, fizzik: { level: 5, rebirths: 2 }, nono: { level: 5, rebirths: 4 } },
    });
    expect(selectRebirthIncomeBonus(useGame.getState())).toBeCloseTo(0.9, 6); // 9 rebirths → +90%
  });
});
