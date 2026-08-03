import { describe, expect, it } from 'vitest';
import { cpmWindowMs, maxCpm, recordManualTap } from './cpm';

describe('recordManualTap — the rolling one-minute record', () => {
  it('counts taps inside the window', () => {
    let recent: number[] = [];
    let cpm = 0;
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) {
      ({ recent, cpm } = recordManualTap(recent, t0 + i * 100));
    }
    expect(cpm).toBe(10);
    expect(recent).toHaveLength(10);
  });

  it('drops taps once they leave the window', () => {
    const t0 = 1_000_000;
    let state = recordManualTap([], t0);
    state = recordManualTap(state.recent, t0 + 1_000);
    // A minute later, both earlier taps have aged out — only the new one counts.
    state = recordManualTap(state.recent, t0 + cpmWindowMs + 1_001);
    expect(state.cpm).toBe(1);
    expect(state.recent).toHaveLength(1);
  });

  it('a tap exactly on the window edge no longer counts', () => {
    const t0 = 1_000_000;
    const first = recordManualTap([], t0);
    const later = recordManualTap(first.recent, t0 + cpmWindowMs);
    expect(later.cpm).toBe(1); // the t0 tap is exactly cutoff-old → out
  });

  it('never reports above the physical ceiling', () => {
    // Simulate an inhuman burst: far more taps than maxCpm inside one window.
    let recent: number[] = [];
    let cpm = 0;
    for (let i = 0; i < maxCpm + 100; i++) {
      ({ recent, cpm } = recordManualTap(recent, 1_000_000 + i));
    }
    expect(cpm).toBe(maxCpm);
  });

  it('ignores timestamps from the future (a clock that jumped back)', () => {
    const t0 = 1_000_000;
    const withFuture = recordManualTap([t0 + 50_000], t0);
    expect(withFuture.cpm).toBe(1); // only the tap being recorded now
  });
});
