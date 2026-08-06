// ⚡ Speed test — a deliberate, fixed-minute tapping challenge (owner request).
//
// This file is split into a CONTROLLER (the start chip + the effects that watch
// taps, run the countdown and celebrate) and three VIEW layers that read the
// shared runtime from the store so they can render around the blob:
//   • SpeedRing        — a countdown ring drawn around the main blob
//   • SpeedFocusOverlay — a full-screen "focus mode": dims everything but the blob,
//                         with a big timer, live tap count and encouragement
//   • SpeedResult       — a dedicated result screen (record / try-again)
//
// Taps are counted from the store's `clicks` counter (manual taps only — the
// robot hand never touches it), so the hot tap path is untouched. The record
// feeds the SAME bestCpm the passive rolling window does (game/cpm.ts).

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { playBonus, playCrit, playMilestone, playPurchase, playRainDrop } from '../audio/sfx';
import { cpmWindowMs } from '../game/cpm';
import { formatGoo } from '../game/format';
import { useGame } from '../store';
import { haptic } from './haptics';
import { useReducedMotion } from './useReducedMotion';

const WINDOW_S = Math.round(cpmWindowMs / 1000);
const MILESTONE_EVERY = 50; // a little zap + buzz every N taps, for encouragement

/**
 * The start chip AND the renderless controller. It watches manual taps and
 * drives the store's speed runtime (armSpeed / registerSpeedTaps / finalizeSpeed);
 * the visible ring, focus overlay and result screen are separate components that
 * read that runtime.
 */
export function SpeedTest() {
  const phase = useGame((s) => s.speedPhase);
  const clicks = useGame((s) => s.clicks);
  const muted = useGame((s) => s.muted);
  const armSpeed = useGame((s) => s.armSpeed);
  const registerSpeedTaps = useGame((s) => s.registerSpeedTaps);
  const finalizeSpeed = useGame((s) => s.finalizeSpeed);

  const lastClicks = useRef(clicks);
  const nextMilestone = useRef(MILESTONE_EVERY);
  const resultShown = useRef(false);

  // Count manual taps → feed the store. GO! zap on the first tap, a little crit
  // zap at each 50-tap milestone.
  useEffect(() => {
    const delta = clicks - lastClicks.current;
    lastClicks.current = clicks;
    if (delta <= 0) return;
    if (phase === 'armed') {
      nextMilestone.current = MILESTONE_EVERY;
      registerSpeedTaps(delta); // starts the minute
      playBonus(muted); // GO!
      haptic(20);
    } else if (phase === 'running') {
      registerSpeedTaps(delta);
      if (useGame.getState().speedTaps >= nextMilestone.current) {
        nextMilestone.current += MILESTONE_EVERY;
        playCrit(muted);
        haptic(12);
      }
    }
  }, [clicks, phase, muted, registerSpeedTaps]);

  // Countdown: tension ticks in the final 5s, finalize at zero.
  useEffect(() => {
    if (phase !== 'running') return;
    let lastTick = -1;
    const id = window.setInterval(() => {
      const left = useGame.getState().speedEndsAt - Date.now();
      if (left <= 0) {
        window.clearInterval(id);
        finalizeSpeed();
        return;
      }
      const secs = Math.ceil(left / 1000);
      if (secs <= 5 && secs !== lastTick) {
        lastTick = secs;
        playRainDrop(muted); // ticking clock
        haptic(8);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, muted, finalizeSpeed]);

  // Celebrate once when we land on the result screen.
  useEffect(() => {
    if (phase === 'result' && !resultShown.current) {
      resultShown.current = true;
      const r = useGame.getState().speedResult;
      if (r?.isRecord) {
        playMilestone(muted);
        haptic([0, 40, 30, 60]);
        useGame.getState().triggerConfetti('rainbow');
      } else {
        playPurchase(muted);
        haptic(15);
      }
    }
    if (phase !== 'result') resultShown.current = false;
  }, [phase, muted]);

  if (phase !== 'off') {
    // While a test is live the chip is just a compact indicator — the real UI is
    // the ring around the blob + the focus overlay.
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cy/15 px-3.5 py-1.5 text-sm ring-1 ring-cy/40">
        <span className="text-cy">⚡</span>
        <span className="text-bone">{phase === 'armed' ? 'הַתְחֵל לְהַקִּישׁ!' : 'מְהִירוּת…'}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={armSpeed}
      className="anim-breathe inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cy/15 px-3.5 py-1.5 text-sm ring-1 ring-cy/40 active:scale-95"
    >
      <span className="text-cy">⚡</span>
      <span className="text-bone">מִבְחַן מְהִירוּת</span>
    </button>
  );
}

/** True while a test is armed or counting down (used to lift the blob above the dim). */
export function useSpeedActive() {
  return useGame((s) => s.speedPhase === 'armed' || s.speedPhase === 'running');
}

/**
 * The countdown ring, drawn around the main blob (rendered inside the blob's
 * container so it lines up at any size). Drains over the minute and shifts
 * cyan → gold → hot-pink as time runs low.
 */
export function SpeedRing() {
  const phase = useGame((s) => s.speedPhase);
  const reduced = useReducedMotion();
  const [frac, setFrac] = useState(1); // fraction of time LEFT

  useEffect(() => {
    if (phase === 'armed') {
      setFrac(1);
      return;
    }
    if (phase !== 'running' || reduced) return;
    let raf = 0;
    const tick = () => {
      const left = useGame.getState().speedEndsAt - Date.now();
      setFrac(Math.max(0, Math.min(1, left / cpmWindowMs)));
      if (left > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, reduced]);

  if (phase !== 'armed' && phase !== 'running') return null;
  const R = 46;
  const C = 2 * Math.PI * R;
  const color = frac > 0.5 ? '#00E5FF' : frac > 0.25 ? '#FFD84D' : '#FF2E88';
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90"
      style={{ width: 300, height: 300 }}
      aria-hidden
    >
      <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
      <circle
        cx="50"
        cy="50"
        r={R}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - frac)}
        style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: reduced ? undefined : 'stroke 0.4s linear' }}
      />
    </svg>
  );
}

/**
 * Focus mode: dims the rest of the screen (the blob is lifted above this) and
 * shows the big timer, live tap count and a "you're beating your record" hint.
 * The dim itself is purely visual (pointer-events-none) so only the blob is
 * tappable during the minute.
 */
export function SpeedFocusOverlay({ onTap }: { onTap: (e: ReactPointerEvent<Element>) => void }) {
  const phase = useGame((s) => s.speedPhase);
  const taps = useGame((s) => s.speedTaps);
  const bestCpm = useGame((s) => s.bestCpm);
  const cancelSpeed = useGame((s) => s.cancelSpeed);
  const [secLeft, setSecLeft] = useState(WINDOW_S);

  useEffect(() => {
    if (phase !== 'running') {
      setSecLeft(WINDOW_S);
      return;
    }
    const id = window.setInterval(() => {
      setSecLeft(Math.max(0, Math.ceil((useGame.getState().speedEndsAt - Date.now()) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  if (phase !== 'armed' && phase !== 'running') return null;
  const running = phase === 'running';
  const urgent = running && secLeft <= 5;
  // Pace projection — are you on track to beat your record?
  const elapsed = Math.max(0.001, WINDOW_S - secLeft);
  const projected = running ? Math.round((taps / elapsed) * WINDOW_S) : 0;
  const ahead = running && bestCpm > 0 && projected >= bestCpm;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-20 bg-void/70 backdrop-blur-[2px]" aria-hidden />
      {/* The WHOLE screen is the tap target during a test (owner request): a
          full-screen surface behind the blob that fires the same tap handler, so
          a tap anywhere counts. The blob (z-30) sits above it and keeps its own
          feedback; only the cancel button (z-40) is exempt. */}
      <div className="fixed inset-0 z-[25]" onPointerDown={onTap} aria-label="הַקֵּשׁ בְּכָל מָקוֹם" role="button" />
      {/* Top HUD. The solid gradient backing means the timer / "start tapping"
          text is NEVER hidden behind the header the way it was before. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col items-center gap-1 bg-gradient-to-b from-void via-void/95 to-transparent px-4 pb-12 pt-16">
        {running ? (
          <>
            <div className={`font-display text-7xl tabular ${urgent ? 'anim-count-pop text-hot' : 'text-cy'}`}>
              0:{String(secLeft).padStart(2, '0')}
            </div>
            <div className="text-2xl text-bone tabular">
              {taps} <span className="text-bone/60">הַקָּשׁוֹת</span>
            </div>
            {ahead && <div className="anim-breathe font-display text-goo">🔥 מוֹבִיל עַל הַשִּׂיא!</div>}
          </>
        ) : (
          <div className="anim-breathe font-display text-4xl text-cy">הַתְחֵל לְהַקִּישׁ בְּכָל מָקוֹם! ⚡</div>
        )}
      </div>
      {/* The only escape — deliberately low so it never sits under a tapping thumb. */}
      <div className="fixed inset-x-0 bottom-8 z-40 flex justify-center">
        <button
          type="button"
          onClick={cancelSpeed}
          className="rounded-full bg-black/60 px-5 py-2 text-sm text-bone/75 ring-1 ring-bone/25 active:scale-95"
        >
          בִּטּוּל ✕
        </button>
      </div>
    </>
  );
}

/** The dedicated result screen shown when a minute ends. */
export function SpeedResult() {
  const phase = useGame((s) => s.speedPhase);
  const result = useGame((s) => s.speedResult);
  const bestCpm = useGame((s) => s.bestCpm);
  const armSpeed = useGame((s) => s.armSpeed);
  const cancelSpeed = useGame((s) => s.cancelSpeed);

  if (phase !== 'result' || !result) return null;
  const { taps, isRecord, reward } = result;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-6" onClick={cancelSpeed}>
      <div className="surface anim-pop-in w-full max-w-xs rounded-3xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-6xl">{isRecord ? '🏆' : '⚡'}</div>
        <div className={`mt-2 font-display text-2xl ${isRecord ? 'text-pop' : 'text-cy'}`}>
          {isRecord ? 'שִׂיא חָדָשׁ!' : 'סִיּוּם!'}
        </div>
        <div className="mt-3 font-display text-6xl tabular text-goo">{taps}</div>
        <div className="text-sm text-bone/60">הַקָּשׁוֹת בְּדַקָּה</div>
        {isRecord ? (
          <div className="mt-3 text-pop">+{formatGoo(reward)} גּוּ · פְרֶנְזִי! 🔥</div>
        ) : (
          <div className="mt-3 text-bone/60">הַשִּׂיא שֶׁלְּךָ: {bestCpm}</div>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={armSpeed}
            className="flex-1 rounded-full bg-cy py-2.5 font-display text-void active:scale-95"
          >
            עוֹד פַּעַם ⚡
          </button>
          <button
            type="button"
            onClick={cancelSpeed}
            className="flex-1 rounded-full bg-black/30 py-2.5 text-bone ring-1 ring-bone/20 active:scale-95"
          >
            סְגוֹר
          </button>
        </div>
      </div>
    </div>
  );
}
