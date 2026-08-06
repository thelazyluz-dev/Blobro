// ⚡ Speed test — a deliberate, fixed-minute tapping challenge (owner request).
//
// This file is split into a CONTROLLER (the start chip + the effects that run the
// 3·2·1·GO countdown, watch taps, tick tension and celebrate) and view layers
// that read the shared runtime from the store so they can render around the blob:
//   • SpeedRing         — a countdown ring drawn around the main blob
//   • SpeedFocusOverlay — full-screen "focus mode": dims all but the blob, big
//                         timer, live tap count, 3·2·1·GO, milestone flashes
//   • SpeedResult       — a dedicated result screen (record / try-again / share)
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
const MILESTONE_EVERY = 50; // a little zap + buzz + flash every N taps

/**
 * The start chip AND the renderless controller. It runs the countdown, watches
 * manual taps and drives the store's speed runtime; the ring, focus overlay and
 * result screen are separate components that read that runtime.
 */
export function SpeedTest() {
  const phase = useGame((s) => s.speedPhase);
  const clicks = useGame((s) => s.clicks);
  const muted = useGame((s) => s.muted);
  const armSpeed = useGame((s) => s.armSpeed);
  const beginSpeedTest = useGame((s) => s.beginSpeedTest);
  const registerSpeedTaps = useGame((s) => s.registerSpeedTaps);
  const finalizeSpeed = useGame((s) => s.finalizeSpeed);

  const lastClicks = useRef(clicks);
  const nextMilestone = useRef(MILESTONE_EVERY);
  const resultShown = useRef(false);

  // Count manual taps → feed the store; a crit zap at each 50-tap milestone.
  useEffect(() => {
    const delta = clicks - lastClicks.current;
    lastClicks.current = clicks;
    if (delta <= 0 || phase !== 'running') return;
    registerSpeedTaps(delta);
    if (useGame.getState().speedTaps >= nextMilestone.current) {
      nextMilestone.current += MILESTONE_EVERY;
      playCrit(muted);
      haptic(12);
    }
  }, [clicks, phase, muted, registerSpeedTaps]);

  // 3·2·1·GO countdown → start the minute.
  useEffect(() => {
    if (phase !== 'countdown') return;
    nextMilestone.current = MILESTONE_EVERY;
    let lastN = -1;
    const id = window.setInterval(() => {
      const left = useGame.getState().speedEndsAt - Date.now();
      if (left <= 0) {
        window.clearInterval(id);
        beginSpeedTest();
        playBonus(muted); // GO!
        haptic([0, 20, 20, 40]);
        return;
      }
      const n = Math.ceil(left / 1000);
      if (n !== lastN) {
        lastN = n;
        playRainDrop(muted); // 3.. 2.. 1..
        haptic(8);
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [phase, muted, beginSpeedTest]);

  // Countdown-to-zero: tension ticks in the final 10s (heartbeat in the last 3),
  // finalize at zero.
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
      if (secs <= 10 && secs !== lastTick) {
        lastTick = secs;
        playRainDrop(muted);
        haptic(secs <= 3 ? [0, 10, 40, 10] : 8); // heartbeat in the final 3s
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
        <span className="text-bone">{phase === 'countdown' ? 'מַתְכּוֹנֵן…' : 'מְהִירוּת…'}</span>
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

/** True while a test is counting down or running (used to lift the blob above the dim). */
export function useSpeedActive() {
  return useGame((s) => s.speedPhase === 'countdown' || s.speedPhase === 'running');
}

/**
 * The countdown ring, drawn around the main blob. Full during the 3·2·1, then
 * drains over the minute, shifting cyan → gold → hot-pink as time runs low.
 */
export function SpeedRing() {
  const phase = useGame((s) => s.speedPhase);
  const reduced = useReducedMotion();
  const [frac, setFrac] = useState(1); // fraction of time LEFT

  useEffect(() => {
    if (phase !== 'running') {
      setFrac(1);
      return;
    }
    if (reduced) return;
    // A countdown ring doesn't need 60fps — a ~10fps interval drains it just as
    // smoothly with a fraction of the re-renders (matters while the whole screen
    // is being tapped hard).
    const id = window.setInterval(() => {
      const left = useGame.getState().speedEndsAt - Date.now();
      setFrac(Math.max(0, Math.min(1, left / cpmWindowMs)));
      if (left <= 0) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, reduced]);

  if (phase !== 'countdown' && phase !== 'running') return null;
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
 * shows the 3·2·1·GO, the big timer, live tap count, "beat your record" hint and
 * a milestone flash. The dim is visual-only (pointer-events-none) so only the
 * blob taps — but a full-screen surface behind it makes the WHOLE screen a tap
 * target during the run.
 */
export function SpeedFocusOverlay({ onTap }: { onTap: (e: ReactPointerEvent<Element>) => void }) {
  const phase = useGame((s) => s.speedPhase);
  const taps = useGame((s) => s.speedTaps);
  const bestCpm = useGame((s) => s.bestCpm);
  const cancelSpeed = useGame((s) => s.cancelSpeed);
  const [secLeft, setSecLeft] = useState(WINDOW_S);
  const [count, setCount] = useState(3); // 3·2·1 (0 → GO!)
  const [flash, setFlash] = useState(0); // last 50-tap milestone flashed
  const flashRef = useRef(0);

  // Live timer while running.
  useEffect(() => {
    if (phase !== 'running') {
      setSecLeft(WINDOW_S);
      return;
    }
    const id = window.setInterval(() => {
      setSecLeft(Math.max(0, Math.ceil((useGame.getState().speedEndsAt - Date.now()) / 1000)));
    }, 200);
    return () => window.clearInterval(id);
  }, [phase]);

  // Live 3·2·1·GO number while counting down.
  useEffect(() => {
    if (phase !== 'countdown') return;
    const id = window.setInterval(() => {
      setCount(Math.max(0, Math.ceil((useGame.getState().speedEndsAt - Date.now()) / 1000)));
    }, 80);
    return () => window.clearInterval(id);
  }, [phase]);

  // Milestone flash — a single fading text at each 50 (no particles, stays cheap).
  useEffect(() => {
    if (phase !== 'running') {
      flashRef.current = 0;
      return;
    }
    const milestone = Math.floor(taps / MILESTONE_EVERY) * MILESTONE_EVERY;
    if (milestone >= MILESTONE_EVERY && milestone !== flashRef.current) {
      flashRef.current = milestone;
      setFlash(milestone);
      const t = window.setTimeout(() => setFlash(0), 650);
      return () => window.clearTimeout(t);
    }
  }, [taps, phase]);

  if (phase !== 'countdown' && phase !== 'running') return null;
  const running = phase === 'running';
  const urgent = running && secLeft <= 5;
  const elapsed = Math.max(0.001, WINDOW_S - secLeft);
  const projected = running ? Math.round((taps / elapsed) * WINDOW_S) : 0;
  const ahead = running && bestCpm > 0 && projected >= bestCpm;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-20 bg-void/70 backdrop-blur-[2px]" aria-hidden />
      {/* Whole-screen tap surface (owner request) — a tap ANYWHERE counts. */}
      <div className="fixed inset-0 z-[25]" onPointerDown={onTap} aria-label="הַקֵּשׁ בְּכָל מָקוֹם" role="button" />
      {/* Top HUD, on a solid gradient so it's never hidden behind the header. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col items-center gap-1 bg-gradient-to-b from-void via-void/95 to-transparent px-4 pb-12 pt-16">
        {running ? (
          <>
            <div className={`font-display text-7xl tabular ${urgent ? 'anim-count-pop text-hot' : 'text-cy'}`}>
              0:{String(secLeft).padStart(2, '0')}
            </div>
            <div className="text-2xl text-bone tabular">
              {taps} <span className="text-bone/60">הַקָּשׁוֹת</span>
            </div>
            {bestCpm > 0 &&
              (ahead ? (
                <div className="anim-breathe font-display text-goo">🔥 מוֹבִיל עַל הַשִּׂיא ({bestCpm})!</div>
              ) : (
                <div className="text-sm text-bone/50">שִׂיא לִשְׁבֹּר: {bestCpm}</div>
              ))}
          </>
        ) : (
          <div className="anim-count-pop font-display text-8xl text-cy" key={count}>
            {count > 0 ? count : 'GO!'}
          </div>
        )}
      </div>
      {/* Milestone flash — big, cheap, fades. */}
      {flash > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-1/3 z-40 text-center">
          <span className="anim-count-pop font-display text-6xl text-goo text-glow-pop">🔥 {flash}!</span>
        </div>
      )}
      {/* The only escape — kept ABOVE the bottom nav so it's never hidden by it. */}
      <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center">
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

/** Fire-and-forget: share the result text, or copy it if the Web Share API is absent. */
async function shareResult(taps: number, isRecord: boolean) {
  const text = `${isRecord ? '🏆 שִׂיא חָדָשׁ! ' : ''}עָשִׂיתִי ${taps} הַקָּשׁוֹת בְּדַקָּה בְּבּלוֹרְבּוֹ! ⚡ https://bl-or-bo.com`;
  try {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    if (nav.share) {
      await nav.share({ title: 'בלורבו — מבחן מהירות', text });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // User dismissed the share sheet, or clipboard denied — nothing to do.
  }
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
            onClick={() => shareResult(taps, isRecord)}
            className="rounded-full bg-goo/20 px-4 py-2.5 text-goo ring-1 ring-goo/40 active:scale-95"
            aria-label="שתף תוצאה"
          >
            שַׁתֵּף 📤
          </button>
        </div>
        <button
          type="button"
          onClick={cancelSpeed}
          className="mt-2 w-full rounded-full bg-black/30 py-2 text-sm text-bone/70 ring-1 ring-bone/20 active:scale-95"
        >
          סְגוֹר
        </button>
      </div>
    </div>
  );
}
