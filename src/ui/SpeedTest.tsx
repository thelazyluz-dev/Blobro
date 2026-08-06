// ⚡ Speed test — a deliberate, fixed-minute tapping challenge (owner request).
//
// Press the button to arm it; the 60-second countdown only starts once you
// actually begin tapping. When the minute ends: a new record gets a happy toast,
// otherwise it re-arms immediately so the next tap starts another minute. It
// feeds the SAME bestCpm record the passive rolling window does (see
// game/cpm.ts) — this just makes setting it an intentional, on-screen challenge.
//
// Taps are counted by watching the store's `clicks` counter (manual taps only —
// the robot hand never touches it), so the hot tap path is untouched.

import { useEffect, useRef, useState } from 'react';
import { cpmWindowMs } from '../game/cpm';
import { useGame } from '../store';
import { haptic } from './haptics';

type Mode = 'off' | 'armed' | 'running';
const WINDOW_S = cpmWindowMs / 1000;

export function SpeedTest() {
  const clicks = useGame((s) => s.clicks);
  const bestCpm = useGame((s) => s.bestCpm);
  const recordSpeedTest = useGame((s) => s.recordSpeedTest);
  const pushToast = useGame((s) => s.pushToast);

  const [mode, setMode] = useState<Mode>('off');
  const [remaining, setRemaining] = useState(WINDOW_S);
  const [tapCount, setTapCount] = useState(0);
  const startAt = useRef(0);
  const taps = useRef(0);
  const lastClicks = useRef(clicks);

  // Count manual taps from the clicks counter (no change to the tap action).
  useEffect(() => {
    const delta = clicks - lastClicks.current;
    lastClicks.current = clicks;
    if (delta <= 0) return;
    if (mode === 'armed') {
      startAt.current = Date.now();
      taps.current = delta;
      setTapCount(delta);
      setMode('running');
    } else if (mode === 'running') {
      taps.current += delta;
      setTapCount(taps.current);
    }
  }, [clicks, mode]);

  // Countdown + end-of-minute evaluation.
  useEffect(() => {
    if (mode !== 'running') return;
    const id = window.setInterval(() => {
      const left = startAt.current + cpmWindowMs - Date.now();
      if (left > 0) {
        setRemaining(Math.ceil(left / 1000));
        return;
      }
      window.clearInterval(id);
      const count = taps.current;
      const isRecord = recordSpeedTest(count);
      haptic(isRecord ? [0, 40, 30, 60] : 15);
      pushToast(
        isRecord
          ? { text: `🎉 שִׂיא חָדָשׁ! ${count} הַקָּשׁוֹת בְּדַקָּה!`, icon: '⚡', tone: 'star' }
          : { text: `⚡ ${count} הַקָּשׁוֹת — הַשִּׂיא שֶׁלְּךָ ${Math.max(bestCpm, count)}`, icon: '⚡', tone: 'pop' },
      );
      // Re-arm: the next tap starts a fresh minute (immediate for an active tapper).
      taps.current = 0;
      setTapCount(0);
      setRemaining(WINDOW_S);
      setMode('armed');
    }, 200);
    return () => window.clearInterval(id);
  }, [mode, bestCpm, recordSpeedTest, pushToast]);

  const arm = () => {
    taps.current = 0;
    setTapCount(0);
    setRemaining(WINDOW_S);
    setMode('armed');
    haptic(10);
  };
  const stop = () => {
    taps.current = 0;
    setTapCount(0);
    setMode('off');
  };

  if (mode === 'off') {
    return (
      <button
        type="button"
        onClick={arm}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/30 px-3.5 py-1.5 text-sm ring-1 ring-hairline active:scale-95"
      >
        <span className="text-cy">⚡</span>
        <span className="text-bone">מִבְחַן מְהִירוּת</span>
      </button>
    );
  }

  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  return (
    <div className="inline-flex shrink-0 items-center gap-2 rounded-full bg-cy/15 px-3.5 py-1.5 text-sm ring-1 ring-cy/50">
      <span className="text-cy">⚡</span>
      {mode === 'armed' ? (
        <span className="anim-breathe text-bone">הַתְחֵל לְהַקִּישׁ!</span>
      ) : (
        <span className="tabular text-bone">
          <span className="font-display text-cy">{mmss}</span> · {tapCount} הַקָּשׁוֹת
        </span>
      )}
      <button type="button" onClick={stop} aria-label="סגור מבחן מהירות" className="text-bone/50 active:scale-90">
        ✕
      </button>
    </div>
  );
}
