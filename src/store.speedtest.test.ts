// The speed-test result feeds the SAME bestCpm record, clamped to the physical
// ceiling so an over-count can't reach the board.

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
const { maxCpm } = await import('./game/cpm');

beforeEach(() => {
  store = {};
  useGame.setState({ ...defaultSaveState(Date.now()), loaded: true, bestCpm: 100 });
});

describe('recordSpeedTest', () => {
  it('sets a new record and reports it', () => {
    const isRecord = useGame.getState().recordSpeedTest(250);
    expect(isRecord).toBe(true);
    expect(useGame.getState().bestCpm).toBe(250);
  });

  it('does not lower an existing record', () => {
    const isRecord = useGame.getState().recordSpeedTest(80);
    expect(isRecord).toBe(false);
    expect(useGame.getState().bestCpm).toBe(100);
  });

  it('clamps an implausible count to the physical ceiling (anti-cheat)', () => {
    useGame.getState().recordSpeedTest(1e9);
    expect(useGame.getState().bestCpm).toBe(maxCpm);
  });
});
