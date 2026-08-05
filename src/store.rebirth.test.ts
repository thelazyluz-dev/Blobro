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

const { useGame } = await import('./store');
const { defaultSaveState } = await import('./game/save');
const { maxEvolution, rebirthCap } = await import('./game/balance');

const NOW = 1_754_000_000_000;

beforeEach(() => {
  store = {};
  useGame.setState({ ...defaultSaveState(NOW), loaded: true });
});

describe('rebirthCreature', () => {
  it('resets a max-evolved creature to level 1 / stage 0 and banks a rebirth', () => {
    useGame.setState({ characters: { blombo: { level: 137, evolution: maxEvolution } } });
    useGame.getState().rebirthCreature('blombo');
    const held = useGame.getState().characters.blombo;
    expect(held).toEqual({ level: 1, rebirths: 1 });
  });

  it('stacks rebirths across the loop', () => {
    useGame.setState({ characters: { blombo: { level: 100, evolution: maxEvolution, rebirths: 3 } } });
    useGame.getState().rebirthCreature('blombo');
    expect(useGame.getState().characters.blombo).toEqual({ level: 1, rebirths: 4 });
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
