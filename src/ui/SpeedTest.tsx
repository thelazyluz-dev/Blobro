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

import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { playBonus, playCrit, playMilestone, playPurchase, playRainDrop } from '../audio/sfx';
import { cpmWindowMs } from '../game/cpm';
import { formatGoo } from '../game/format';
import { pushCheckpoint, useGame } from '../store';
import { fetchMyRank, hasGlobalLeaderboard, playerName, submitScore } from '../net/leaderboard';
import { haptic } from './haptics';
import { useReducedMotion } from './useReducedMotion';

const WINDOW_S = Math.round(cpmWindowMs / 1000);
const MILESTONE_EVERY = 50; // a little zap + buzz + flash every N taps
// Live taps/sec at which the "heat" meter is full and the ring/flame max out.
// ~12/sec is a hot sustained pace well short of the multi-finger ceiling.
const HEAT_REF_CPS = 12;

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
        <span className="text-bone">{phase === 'countdown' ? 'מַתְכּוֹנֵן…' : 'אֶתְגָּר…'}</span>
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
      <span className="text-bone">אֶתְגָּר הַמְּהִירוּת</span>
    </button>
  );
}

/** True while a test is counting down or running (used to lift the blob above the dim). */
export function useSpeedActive() {
  return useGame((s) => s.speedPhase === 'countdown' || s.speedPhase === 'running');
}

/**
 * Focus mode. Rendered via a PORTAL to <body> so it escapes the app's flex-column
 * stacking contexts (the header at z-30 and the bottom nav sit ABOVE <main>, so
 * an in-main overlay left those regions un-dimmed and their taps uncounted).
 * From the body it can:
 *   • DARKEN everything — header, bottom bar, every button — via a spotlight dim
 *     with a transparent hole over the blob (so the blob stays bright);
 *   • count a tap ANYWHERE on screen via one full-screen surface above it all;
 *   • leave only the cancel button live, with a "buttons are locked" note.
 * The ring + spotlight are positioned on the real blob via `blobRef`.
 */
export function SpeedFocusOverlay({
  onTap,
  blobRef,
}: {
  onTap: (e: ReactPointerEvent<Element>) => void;
  blobRef: RefObject<HTMLButtonElement | null>;
}) {
  const phase = useGame((s) => s.speedPhase);
  const taps = useGame((s) => s.speedTaps);
  const bestCpm = useGame((s) => s.bestCpm);
  const cancelSpeed = useGame((s) => s.cancelSpeed);
  const reduced = useReducedMotion();
  const [secLeft, setSecLeft] = useState(WINDOW_S);
  const [frac, setFrac] = useState(1); // fraction of time LEFT (ring drain)
  const [count, setCount] = useState(3); // 3·2·1 (0 → GO!)
  const [flash, setFlash] = useState(0); // last 50-tap milestone flashed
  const [countKey, setCountKey] = useState(0); // bumps at each milestone → count pops
  const [liveCps, setLiveCps] = useState(0); // taps/sec over a short rolling window
  const flashRef = useRef(0);
  const cpsSamples = useRef<{ t: number; taps: number }[]>([]); // rolling (time, taps) buffer

  // Running: one 100ms ticker drives the timer text, the ring drain AND the live
  // taps/sec readout. Live CPS is sampled here (reading the store's speedTaps),
  // so it never touches the hot tap path — the counter is updated where taps are
  // already registered, and we just measure the slope over a ~1.2s window.
  useEffect(() => {
    if (phase !== 'running') {
      setSecLeft(WINDOW_S);
      setFrac(1);
      setLiveCps(0);
      cpsSamples.current = [];
      return;
    }
    const id = window.setInterval(() => {
      const now = Date.now();
      const left = useGame.getState().speedEndsAt - now;
      setSecLeft(Math.max(0, Math.ceil(left / 1000)));
      if (!reduced) setFrac(Math.max(0, Math.min(1, left / cpmWindowMs)));
      // Live taps/sec: slope of speedTaps across the last ~1.2s of samples.
      const tapsNow = useGame.getState().speedTaps;
      const buf = cpsSamples.current;
      buf.push({ t: now, taps: tapsNow });
      while (buf.length > 1 && now - buf[0].t > 1200) buf.shift();
      const dt = (now - buf[0].t) / 1000;
      setLiveCps(dt > 0.15 ? Math.max(0, (tapsNow - buf[0].taps) / dt) : 0);
      if (left <= 0) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, reduced]);

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
      setCountKey(milestone); // re-key the count so it pops once per milestone
      const t = window.setTimeout(() => setFlash(0), 650);
      return () => window.clearTimeout(t);
    }
  }, [taps, phase]);

  if ((phase !== 'countdown' && phase !== 'running') || typeof document === 'undefined') return null;

  const running = phase === 'running';
  const urgent = running && secLeft <= 5;
  const elapsed = Math.max(0.001, WINDOW_S - secLeft);
  const projected = running ? Math.round((taps / elapsed) * WINDOW_S) : 0;
  const ahead = running && bestCpm > 0 && projected >= bestCpm;
  // Heat 0..1 from the live pace — drives the meter and warms the ring/flame.
  const heat = Math.max(0, Math.min(1, liveCps / HEAT_REF_CPS));
  const hot = heat > 0.75;

  // Put the spotlight + ring on the ACTUAL blob (fresh each render/tick).
  const rect = blobRef.current?.getBoundingClientRect();
  const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const cy = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.46;
  const rad = rect ? rect.width / 2 : 130;

  const R = 46;
  const C = 2 * Math.PI * R;
  const ringColor = frac > 0.5 ? '#00E5FF' : frac > 0.25 ? '#FFD84D' : '#FF2E88';

  return createPortal(
    <>
      {/* Spotlight dim — darkens EVERYTHING (header, bottom bar, every button)
          except a hole over the blob, so it reads clearly as "focus mode; the
          rest is inactive". */}
      <div
        className="pointer-events-none fixed inset-0 z-[70]"
        aria-hidden
        style={{
          background: `radial-gradient(circle at ${cx}px ${cy}px, transparent ${rad - 4}px, rgba(9,5,20,0.82) ${rad + 46}px)`,
        }}
      />
      {/* One full-screen tap surface ABOVE everything — a tap on ANY spot counts.
          touch-none => the browser never steals a finger for scroll/zoom, so EVERY
          simultaneous pointer (up to 10 fingers) fires its own pointerdown here. */}
      <div
        className="fixed inset-0 z-[71] touch-none select-none"
        onPointerDown={onTap}
        aria-label="הַקֵּשׁ בְּכָל מָקוֹם"
        role="button"
      />
      {/* Countdown ring, centred on the blob. */}
      <svg
        viewBox="0 0 100 100"
        className="pointer-events-none fixed z-[71]"
        style={{ left: cx, top: cy, width: 300, height: 300, transform: 'translate(-50%,-50%) rotate(-90deg)' }}
        aria-hidden
      >
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={ringColor}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          style={{
            // The ring glows brighter the faster you tap — heat feeds the blur.
            filter: `drop-shadow(0 0 ${reduced ? 6 : 6 + heat * 12}px ${ringColor})`,
            transition: reduced ? undefined : 'stroke 0.4s linear',
          }}
        />
      </svg>
      {/* Final-seconds edge pulse — a red vignette that breathes in the last 5s.
          pointer-events-none, so it never blocks a tap. */}
      {urgent && (
        <div
          className={`pointer-events-none fixed inset-0 z-[72] ${reduced ? '' : 'anim-edge-pulse'}`}
          aria-hidden
          style={{ boxShadow: 'inset 0 0 90px 18px rgba(255,46,136,0.55)' }}
        />
      )}
      {/* Center HUD, on a solid gradient so it's never hidden behind the header.
          Timer + big count + heat bar, grouped high. pointer-events-none — taps
          fall straight through it to the surface below, so it NEVER steals a
          finger. Top padding clears the notch/status bar. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[72] flex flex-col items-center gap-1.5 bg-gradient-to-b from-void via-void/95 to-transparent px-4 pb-10"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
      >
        {running ? (
          <>
            <div className={`font-display text-6xl leading-none tabular ${urgent ? 'anim-count-pop text-hot' : 'text-cy'}`}>
              0:{String(secLeft).padStart(2, '0')}
            </div>
            {/* Live tap count — big, and pops once at each 50-tap milestone. */}
            <div key={countKey} className="anim-count-pop mt-1 font-display text-7xl leading-none tabular text-bone">
              {taps}
            </div>
            <div className="-mt-0.5 text-xs tracking-wide text-bone/55">הַקָּשׁוֹת</div>
            {/* Heat meter — wide + prominent; fills with your live pace and warms
                the ring/flame with it. */}
            <div className="mt-2 h-3 w-60 max-w-[80vw] overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${heat * 100}%`,
                  background: 'linear-gradient(90deg,#00E5FF,#FFD84D,#FF2E88)',
                  transition: reduced ? undefined : 'width 0.15s linear',
                }}
              />
            </div>
            {bestCpm > 0 &&
              (ahead ? (
                <div className="anim-breathe font-display text-sm text-goo">🔥 מוֹבִיל עַל הַשִּׂיא ({bestCpm})!</div>
              ) : (
                <div className="text-xs text-bone/45">שִׂיא לִשְׁבֹּר: {bestCpm}</div>
              ))}
          </>
        ) : (
          <div className="anim-count-pop font-display text-8xl text-cy" key={count}>
            {count > 0 ? count : 'GO!'}
          </div>
        )}
      </div>
      {/* Live rate + projected — in the two top corners (the "dead space" beside
          the status bar) so they're big and never crowd the center column. Placed
          AFTER the center block so its gradient never paints over them. Both
          pointer-events-none. RTL: `start` = right. */}
      {running && (
        <>
          <div
            className="pointer-events-none fixed z-[72] flex flex-col items-center rounded-2xl bg-black/55 px-3 py-1.5 ring-1 ring-cy/30"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)', insetInlineStart: '10px' }}
          >
            <span className="text-[10px] tracking-wide text-bone/50">קֶצֶב</span>
            <span className={`font-display text-3xl leading-none tabular ${hot ? 'text-hot' : 'text-goo'}`}>
              {hot ? '🔥' : '⚡'}
              {liveCps.toFixed(1)}
            </span>
            <span className="text-[10px] text-bone/40">לְשְׁנִיָּה</span>
          </div>
          <div
            className="pointer-events-none fixed z-[72] flex flex-col items-center rounded-2xl bg-black/55 px-3 py-1.5 ring-1 ring-bone/20"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)', insetInlineEnd: '10px' }}
          >
            <span className="text-[10px] tracking-wide text-bone/50">צֶפִי</span>
            <span className="font-display text-3xl leading-none tabular text-cy">~{projected}</span>
            <span className="text-[10px] text-bone/40">בְּדַקָּה</span>
          </div>
        </>
      )}
      {/* Milestone flash — big, cheap, fades. */}
      {flash > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-1/3 z-[72] text-center">
          <span className="anim-count-pop font-display text-6xl text-goo text-glow-pop">🔥 {flash}!</span>
        </div>
      )}
      {/* Cancel is the ONLY live control — pinned to the very bottom edge (clear
          of the whole tapping area), with a note that the rest is locked. */}
      {/* pointer-events-none on the CONTAINER so its full width doesn't block taps
          in the bottom strip — only the button itself is live (re-enabled below),
          everything else there still counts as a tap. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-[73] flex flex-col items-center gap-1"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)' }}
      >
        <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-[11px] text-bone/50">
          🔒 שְׁאָר הַכַּפְתּוֹרִים נְעוּלִים בַּמִּבְחָן
        </span>
        <button
          type="button"
          onClick={cancelSpeed}
          className="pointer-events-auto rounded-full bg-black/70 px-5 py-1.5 text-sm text-bone/80 ring-1 ring-bone/25 active:scale-95"
        >
          בִּטּוּל ✕
        </button>
      </div>
    </>,
    document.body,
  );
}

/** Fire-and-forget: share the result text, or copy it if the Web Share API is absent. */
async function shareResult(taps: number, isRecord: boolean, avgCps: number, rank: number | null) {
  const head = isRecord ? '🏆 שִׂיא חָדָשׁ בְּאֶתְגָּר הַמְּהִירוּת! ' : '⚡ אֶתְגָּר הַמְּהִירוּת בְּבּלוֹרְבּוֹ! ';
  const pace = ` (${avgCps.toFixed(1)} לְשְׁנִיָּה)`;
  const place = rank ? ` · מָקוֹם ~#${rank} בָּעוֹלָם` : '';
  const text = `${head}עָשִׂיתִי ${taps} הַקָּשׁוֹת בְּדַקָּה${pace}${place} — נַסּוּ לְנַצֵּחַ אוֹתִי 👉 https://bl-or-bo.com`;
  try {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    if (nav.share) {
      await nav.share({ title: 'בלורבו — אֶתְגָּר הַמְּהִירוּת', text });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // User dismissed the share sheet, or clipboard denied — nothing to do.
  }
}

/** Where the player's speed record placed on the global ⚡ board. */
type RankState =
  | { kind: 'loading' }
  | { kind: 'done'; rank: number; total: number }
  | { kind: 'nojoin' } // signed-out / hasn't joined a board yet → offer to join
  | { kind: 'hidden' }; // no backend, offline, or the lookup failed → show nothing

/** The dedicated result screen shown when a minute ends. */
export function SpeedResult() {
  const phase = useGame((s) => s.speedPhase);
  const result = useGame((s) => s.speedResult);
  const bestCpm = useGame((s) => s.bestCpm);
  const armSpeed = useGame((s) => s.armSpeed);
  const cancelSpeed = useGame((s) => s.cancelSpeed);
  const setProgressOpen = useGame((s) => s.setProgressOpen);
  const reduced = useReducedMotion();
  const [rankState, setRankState] = useState<RankState>({ kind: 'hidden' });

  // Look up where this record placed on the ⚡ (cpm) board.
  //  • a NEW record: push the save first (so the server sees the new best), then
  //    submit — submit both writes the record onto the board and returns the
  //    fresh rank.
  //  • a miss: a cheap read-only /rank (no write) for the current standing.
  // Degrades to a "join the board" prompt when signed out, or to nothing when
  // there's no backend / the call fails, so the result never blocks on the net.
  useEffect(() => {
    if (phase !== 'result' || !result) return;
    if (!hasGlobalLeaderboard()) {
      setRankState({ kind: 'hidden' });
      return;
    }
    const name = playerName().trim();
    if (!name) {
      setRankState({ kind: 'nojoin' });
      return;
    }
    let cancelled = false;
    setRankState({ kind: 'loading' });
    (async () => {
      let placed: { rank: number; total: number } | null = null;
      try {
        if (result.isRecord) {
          await pushCheckpoint();
          const s = await submitScore(name);
          if (s?.cpm?.rank) placed = { rank: s.cpm.rank, total: s.total };
        } else {
          const r = await fetchMyRank('cpm');
          if (r) placed = { rank: r.rank, total: r.total };
        }
      } catch {
        /* fall through to hidden */
      }
      if (cancelled) return;
      setRankState(placed ? { kind: 'done', rank: placed.rank, total: placed.total } : { kind: 'hidden' });
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, result]);

  if (phase !== 'result' || !result) return null;
  const { taps, isRecord, reward, avgCps, prevBest } = result;
  const gain = isRecord && prevBest > 0 ? taps - prevBest : 0;
  const openBoard = () => {
    cancelSpeed();
    setProgressOpen(true, 'leaderboard');
  };
  const sharedRank = rankState.kind === 'done' ? rankState.rank : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-6" onClick={cancelSpeed}>
      <div className="surface anim-pop-in w-full max-w-xs rounded-3xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-6xl">{isRecord ? '🏆' : '⚡'}</div>
        <div className={`mt-2 font-display text-2xl ${isRecord ? 'text-pop' : 'text-cy'}`}>
          {isRecord ? 'שִׂיא חָדָשׁ!' : 'סִיּוּם!'}
        </div>
        <div className="mt-3 font-display text-6xl tabular text-goo">{taps}</div>
        <div className="text-sm text-bone/60">הַקָּשׁוֹת בְּדַקָּה</div>
        {/* Average pace — the taps/sec the whole minute averaged. */}
        <div className="mt-1 font-display text-lg tabular text-cy">
          ⚡ {avgCps.toFixed(1)} <span className="text-sm text-bone/50">לְחִיצוֹת לְשְׁנִיָּה</span>
        </div>
        {isRecord ? (
          <div className="mt-3 text-pop">
            +{formatGoo(reward)} גּוּ · פְרֶנְזִי! 🔥
            {gain > 0 && <div className="text-sm text-goo">+{gain} מֵהַשִּׂיא הַקּוֹדֵם</div>}
          </div>
        ) : (
          <div className="mt-3 text-bone/60">הַשִּׂיא שֶׁלְּךָ: {bestCpm}</div>
        )}
        {/* Leaderboard placement (approximate ~#, from the server histogram). */}
        <div className="mt-3 min-h-[2.75rem]">
          {rankState.kind === 'loading' && <div className="text-sm text-bone/40">מְחַשֵּׁב מָקוֹם בַּטַּבְלָה…</div>}
          {rankState.kind === 'done' && (
            <div className={`rounded-2xl bg-cy/10 px-3 py-2 ring-1 ring-cy/30 ${reduced ? '' : 'anim-pop-in'}`}>
              <div className="font-display text-xl text-cy">🏅 מָקוֹם ~#{rankState.rank.toLocaleString('en-US')}</div>
              {rankState.total > 0 && (
                <div className="text-xs text-bone/50">מִתּוֹךְ {rankState.total.toLocaleString('en-US')} בְּאֶתְגָּר הַמְּהִירוּת</div>
              )}
            </div>
          )}
          {rankState.kind === 'nojoin' && (
            <button
              type="button"
              onClick={openBoard}
              className="w-full rounded-2xl bg-cy/10 px-3 py-2 text-sm text-cy ring-1 ring-cy/30 active:scale-95"
            >
              🏅 הִצְטָרֵף לַטַּבְלָה כְּדֵי לִרְאוֹת אֶת הַמָּקוֹם שֶׁלְּךָ
            </button>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={armSpeed}
            className="flex-1 rounded-full bg-cy py-2.5 font-display text-void active:scale-95"
          >
            עוֹד פַּעַם ⚡
          </button>
          <button
            type="button"
            onClick={() => shareResult(taps, isRecord, avgCps, sharedRank)}
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
