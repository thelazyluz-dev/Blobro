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

describe('finishSpeedTest', () => {
  it('sets a new record, pays an income-scaled goo bonus, and lights a frenzy', () => {
    const before = useGame.getState().goo;
    const { isRecord, reward } = useGame.getState().finishSpeedTest(250);
    expect(isRecord).toBe(true);
    expect(useGame.getState().bestCpm).toBe(250);
    expect(reward).toBeGreaterThanOrEqual(100); // floored
    expect(useGame.getState().goo).toBe(before + reward);
    expect(useGame.getState().frenzyUntil).toBeGreaterThan(Date.now());
  });

  it('pays nothing and keeps the record for a non-record minute', () => {
    const before = useGame.getState().goo;
    const { isRecord, reward } = useGame.getState().finishSpeedTest(80);
    expect(isRecord).toBe(false);
    expect(reward).toBe(0);
    expect(useGame.getState().bestCpm).toBe(100);
    expect(useGame.getState().goo).toBe(before);
  });

  it('clamps an implausible count to the physical ceiling (anti-cheat)', () => {
    useGame.getState().finishSpeedTest(1e9);
    expect(useGame.getState().bestCpm).toBe(maxCpm);
  });
});

describe('speed-test phase machine', () => {
  it('arms, starts the minute on the first tap, accrues, then shows a result', () => {
    const g = () => useGame.getState();
    g().armSpeed();
    expect(g().speedPhase).toBe('armed');
    expect(g().speedTaps).toBe(0);

    // First tap starts the countdown.
    g().registerSpeedTaps(1);
    expect(g().speedPhase).toBe('running');
    expect(g().speedTaps).toBe(1);
    expect(g().speedEndsAt).toBeGreaterThan(Date.now());

    // Further taps accrue.
    g().registerSpeedTaps(9);
    expect(g().speedTaps).toBe(10);

    // Finalizing folds the count into the record and opens the result screen.
    g().registerSpeedTaps(240); // total 250 > bestCpm 100
    g().finalizeSpeed();
    expect(g().speedPhase).toBe('result');
    expect(g().speedResult?.taps).toBe(250);
    expect(g().speedResult?.isRecord).toBe(true);
    expect(g().bestCpm).toBe(250);
  });

  it('does not count taps before it is armed, and cancel returns to off', () => {
    const g = () => useGame.getState();
    g().cancelSpeed();
    expect(g().speedPhase).toBe('off');
    g().registerSpeedTaps(50); // ignored while off
    expect(g().speedTaps).toBe(0);
    expect(g().speedPhase).toBe('off');

    g().armSpeed();
    g().registerSpeedTaps(5);
    g().cancelSpeed();
    expect(g().speedPhase).toBe('off');
    expect(g().speedTaps).toBe(0);
    expect(g().speedResult).toBeNull();
  });
});
