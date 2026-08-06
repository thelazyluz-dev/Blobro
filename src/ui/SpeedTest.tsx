// ⚡ Speed test — a deliberate, fixed-minute tapping challenge (owner request).
//
// Press the button to arm it; the 60-second countdown starts only once you begin
// tapping, and shows the time left, your live tap count, and whether your pace is
// beating your record. It escalates in the final seconds (colour + ticks), and
// at the end a NEW record gets confetti + a goo bonus + a short frenzy —
// otherwise it re-arms so the next tap immediately starts another minute.
//
// Taps are counted by watching the store's `clicks` counter (manual taps only —
// the robot hand never touches it), so the hot tap path is untouched. The result
// feeds the SAME bestCpm record the passive rolling window does (game/cpm.ts).

import { useEffect, useRef, useState } from 'react';
import { playBonus, playCrit, playMilestone, playPurchase, playRainDrop } from '../audio/sfx';
import { cpmWindowMs } from '../game/cpm';
import { formatGoo } from '../game/format';
import { useGame } from '../store';
import { haptic } from './haptics';

type Mode = 'off' | 'armed' | 'running';
const WINDOW_S = cpmWindowMs / 1000;
const MILESTONE_EVERY = 50; // a little zap + buzz every N taps, for encouragement

export function SpeedTest() {
  const clicks = useGame((s) => s.clicks);
  const bestCpm = useGame((s) => s.bestCpm);
  const muted = useGame((s) => s.muted);
  const finishSpeedTest = useGame((s) => s.finishSpeedTest);
  const pushToast = useGame((s) => s.pushToast);
  const triggerConfetti = useGame((s) => s.triggerConfetti);

  const [mode, setMode] = useState<Mode>('off');
  const [remaining, setRemaining] = useState(WINDOW_S);
  const [tapCount, setTapCount] = useState(0);
  const startAt = useRef(0);
  const taps = useRef(0);
  const nextMilestone = useRef(MILESTONE_EVERY);
  const lastClicks = useRef(clicks);
  const lastTick = useRef(-1);

  // Count manual taps from the clicks counter (no change to the tap action) and
  // give a little "keep going" zap at each milestone.
  useEffect(() => {
    const delta = clicks - lastClicks.current;
    lastClicks.current = clicks;
    if (delta <= 0) return;
    if (mode === 'armed') {
      startAt.current = Date.now();
      taps.current = delta;
      nextMilestone.current = MILESTONE_EVERY;
      setTapCount(delta);
      setMode('running');
      playBonus(muted); // GO!
      haptic(20);
    } else if (mode === 'running') {
      taps.current += delta;
      setTapCount(taps.current);
      if (taps.current >= nextMilestone.current) {
        nextMilestone.current += MILESTONE_EVERY;
        playCrit(muted);
        haptic(12);
      }
    }
  }, [clicks, mode, muted]);

  // Countdown, final-seconds tension ticks, and end-of-minute evaluation.
  useEffect(() => {
    if (mode !== 'running') return;
    lastTick.current = -1;
    const id = window.setInterval(() => {
      const left = startAt.current + cpmWindowMs - Date.now();
      if (left > 0) {
        const secs = Math.ceil(left / 1000);
        setRemaining(secs);
        if (secs <= 5 && secs !== lastTick.current) {
          lastTick.current = secs;
          playRainDrop(muted); // ticking clock
          haptic(8);
        }
        return;
      }
      window.clearInterval(id);
      const count = taps.current;
      const { isRecord, reward } = finishSpeedTest(count);
      if (isRecord) {
        playMilestone(muted);
        haptic([0, 40, 30, 60]);
        triggerConfetti('rainbow');
        pushToast({ text: `🎉 שִׂיא חָדָשׁ! ${count} הַקָּשׁוֹת + ${formatGoo(reward)} גּוּ!`, icon: '⚡', tone: 'star' });
      } else {
        playPurchase(muted);
        haptic(15);
        pushToast({ text: `⚡ ${count} הַקָּשׁוֹת — הַשִּׂיא שֶׁלְּךָ ${Math.max(bestCpm, count)}`, icon: '⚡', tone: 'pop' });
      }
      // Re-arm: the next tap starts a fresh minute (immediate for an active tapper).
      taps.current = 0;
      setTapCount(0);
      setRemaining(WINDOW_S);
      setMode('armed');
    }, 200);
    return () => window.clearInterval(id);
  }, [mode, bestCpm, muted, finishSpeedTest, pushToast, triggerConfetti]);

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
        className="anim-breathe inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cy/15 px-3.5 py-1.5 text-sm ring-1 ring-cy/40 active:scale-95"
      >
        <span className="text-cy">⚡</span>
        <span className="text-bone">מִבְחַן מְהִירוּת</span>
      </button>
    );
  }

  // Pace vs record (are you on track to beat it?) + final-seconds tension colour.
  const elapsed = Math.max(0.001, (Date.now() - startAt.current) / 1000);
  const projected = Math.round((taps.current / elapsed) * WINDOW_S);
  const ahead = bestCpm > 0 && projected >= bestCpm;
  const urgent = remaining <= 5;
  const warn = remaining <= 15;
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const clockColor = urgent ? 'text-hot' : warn ? 'text-goo' : 'text-cy';

  return (
    <div
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm ring-1 ${
        urgent ? 'bg-hot/15 ring-hot/50' : 'bg-cy/15 ring-cy/50'
      }`}
    >
      <span className={urgent ? 'text-hot' : 'text-cy'}>⚡</span>
      {mode === 'armed' ? (
        <span className="anim-breathe text-bone">הַתְחֵל לְהַקִּישׁ!</span>
      ) : (
        <span className="tabular text-bone">
          <span className={`font-display ${clockColor}`}>{clock}</span> · {tapCount}
          {ahead && <span className="ms-1 text-goo">🔥 מוֹבִיל</span>}
        </span>
      )}
      <button type="button" onClick={stop} aria-label="סגור מבחן מהירות" className="text-bone/50 active:scale-90">
        ✕
      </button>
    </div>
  );
}
