// Screen 1 — the main clicker (§10.1). Glowing goo blob, floating +N, goo
// particles, a live rate, plus the golden bonus and click-frenzy pull mechanics.
// All motion honors reduced-motion.

import { useEffect, useRef, useState } from 'react';
import { playBonus, playClick, playRainDrop } from '../../audio/sfx';
import {
  bonusIntervalMaxMs,
  bonusIntervalMinMs,
  bonusLifetimeMs,
  firstBonusDelayMaxMs,
  firstBonusDelayMinMs,
  comboMilestones,
  comboRepeatEvery,
  comboRewardMult,
  comboWindowMs,
  frenzyMultiplier,
  rainAllBonusMult,
  rainDropClickMult,
  rainDropCount,
  rainDropIncomeSeconds,
  rainDropMinGoo,
  rainDurationMs,
  rainIntervalMaxMs,
  rainIntervalMinMs,
} from '../../game/balance';
import { bigScaleNameHe, formatExact, formatGoo, formatGooHero } from '../../game/format';
import { autoClicksPerSec } from '../../game/economy';
import { DEFAULT_BLOB, accessoryById, blobById } from '../../game/cosmetics';
import { selectActiveAbilities, selectClickPower, selectComboMelody, selectGooPerSec, useGame } from '../../store';
import { haptic } from '../haptics';
import { SmoothNumber } from '../SmoothNumber';
import { BonusButton } from '../AdBonus';
import { CharacterBody } from '../characters';
import { AccessoryOverlay, MainBlob } from '../MainBlob';
import { SpeedFocusOverlay, SpeedResult, SpeedTest, useSpeedActive } from '../SpeedTest';
import { useReducedMotion } from '../useReducedMotion';

const COMBO_WINDOW_MS = comboWindowMs;

interface Floater {
  id: number;
  x: number;
  y: number;
  amount: number;
  frenzy: boolean;
  crit: boolean;
  expiry: number; // performance.now() ms when the single sweeper drops it
}
interface RainDrop {
  id: number;
  left: number;
  fall: number;
  delay: number;
  reward: number;
}
interface Particle {
  id: number;
  dx: number;
  dy: number;
  color: string;
  size: number;
  expiry: number; // performance.now() ms when the single sweeper drops it
}

let uid = 0;
const PARTICLE_COLORS = ['#A3FF12', '#FFD84D', '#00E5FF'];
const FRENZY_COLORS = ['#FF2E88', '#FFD84D', '#00E5FF', '#A3FF12'];

// Fast-tapping performance budget (the ~3000+ CPM jank fix). At 50 taps/sec the
// old path spawned 5–23 particles PER tap plus a floater, a squash, a combo
// re-render and a getBoundingClientRect EACH — hundreds of animating nodes and
// dozens of re-renders a second. These bound it: heavy visuals fire at most
// ~20×/sec, never more than a fixed number live at once, and one sweeper (not a
// timer per tap) reaps them. The tap's goo + sound + combo still fire every tap.
const HEAVY_VISUAL_MIN_MS = 50; // ≤ ~20 particle/floater bursts per second
const COMBO_RENDER_MIN_MS = 90; // coalesce the combo counter to ~10 updates/sec
const MAX_PARTICLES = 48; // hard cap on concurrent tap particles
const MAX_FLOATERS = 12; // hard cap on concurrent tap floaters

// The goo counter is the ONLY part of this ~700-line screen that changes at
// tick rate (10Hz whenever creatures are earning). Subscribing the screen
// itself to s.goo re-rendered ALL of it on every tick, forever — a constant
// battery cost on an idle phone. The counter lives in this leaf instead, so
// a tick re-renders these few spans and nothing else.
function GooHeader({ frenzyActive }: { frenzyActive: boolean }) {
  const goo = useGame((s) => s.goo);
  const reduced = useReducedMotion();
  const [pop, setPop] = useState(false);
  const popTimer = useRef<number>();

  // Counter pop on change.
  useEffect(() => {
    if (reduced) return;
    setPop(true);
    window.clearTimeout(popTimer.current);
    popTimer.current = window.setTimeout(() => setPop(false), 200);
    return () => window.clearTimeout(popTimer.current);
  }, [goo, reduced]);

  return (
    <header className="mt-2 text-center">
      {/* Deliberately NOT a button. It used to open the number legend, but it
          is a ~200x96 target sitting directly above the blob, so a tap that
          landed a little high opened a modal instead of scoring — on the main
          screen, where nearly every tap in the game happens. The legend moved
          to the info row at the bottom, out of the tap path. */}
      <div role="status" aria-label="מוֹנֶה גּוּ" className="mx-auto block">
        <div
          className={`font-display text-7xl leading-none tabular text-glow-pop ${
            frenzyActive ? 'text-hot' : 'text-pop'
          } ${pop ? 'anim-count-pop' : ''}`}
        >
          <SmoothNumber value={goo} format={formatGooHero} />
        </div>
        <div className="mt-1 text-sm tracking-wide text-bone/60">גּוּ</div>
      </div>
      {goo >= 1000 && (
        <div className="mt-0.5 text-sm text-bone/60 tabular" dir="ltr">
          <SmoothNumber value={goo} format={formatExact} />
        </div>
      )}
    </header>
  );
}

export function ClickScreen() {
  const rate = useGame(selectGooPerSec);
  const perClick = useGame(selectClickPower);
  const comboMelody = useGame(selectComboMelody);
  const click = useGame((s) => s.click);
  const collectBonus = useGame((s) => s.collectBonus);
  const grantGoo = useGame((s) => s.grantGoo);
  const autoTapLevel = useGame((s) => s.upgrades.autoTap);
  const clicks = useGame((s) => s.clicks);
  const nicknameOpen = useGame((s) => s.nicknameOpen);
  const activeAbilities = useGame(selectActiveAbilities);
  const frenzyUntil = useGame((s) => s.frenzyUntil);
  // The starter blob is always our original green one (skins are retired).
  const { colors: blobColors, shape: blobShape } = blobById(DEFAULT_BLOB);
  const accessoryArt = useGame((s) => accessoryById(s.equippedAccessory).art);
  // The chosen main creature — shown only if the player actually owns it,
  // otherwise we fall back to the classic green blob.
  const mainCreature = useGame((s) => (s.equippedMain && s.characters[s.equippedMain] ? s.equippedMain : null));
  const mainEvolution = useGame((s) => (s.equippedMain ? (s.characters[s.equippedMain]?.evolution ?? 0) : 0));
  const mainRebirths = useGame((s) => (s.equippedMain ? (s.characters[s.equippedMain]?.rebirths ?? 0) : 0));
  const reduced = useReducedMotion();
  const speedActive = useSpeedActive(); // speed test armed/running → focus mode

  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [autoFloaters, setAutoFloaters] = useState<{ id: number; amount: number }[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [squash, setSquash] = useState(false);
  const [bonus, setBonus] = useState<{ id: number; top: number } | null>(null);
  const [rain, setRain] = useState<RainDrop[]>([]);
  const [dropFloaters, setDropFloaters] = useState<{ id: number; x: number; y: number; amount: number }[]>([]);
  const [rainBonus, setRainBonus] = useState<{ id: number; amount: number } | null>(null);
  const rainStats = useRef({ popped: 0, sum: 0, total: 0 });
  const rainBonusTimer = useRef<number>();
  const [critFlash, setCritFlash] = useState(false);
  const [magFlash, setMagFlash] = useState(false);
  const [magBanner, setMagBanner] = useState<{ id: number; exp: number } | null>(null);
  const magBannerTimer = useRef<number>();
  const magnitudePulse = useGame((s) => s.magnitudePulse);
  const magnitudeExp = useGame((s) => s.magnitudeExp);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [combo, setCombo] = useState(0);
  const [comboBurst, setComboBurst] = useState<{ id: number; milestone: number; amount: number } | null>(null);
  const comboBurstTimer = useRef<number>();
  const blobRef = useRef<HTMLButtonElement>(null);
  const spawnRef = useRef<number>();
  const firstBonusRef = useRef(true); // the session's first bonus comes early for new players
  const lifeRef = useRef<number>();
  const scheduleRef = useRef<() => void>(() => {});
  const rainTimer = useRef<number>();
  const rainClear = useRef<number>();
  const critFlashTimer = useRef<number>();
  const comboRef = useRef({ count: 0, last: 0 });
  const comboTimer = useRef<number>();
  // Fast-tapping perf: throttle heavy visuals + the combo counter, and cache the
  // blob's rect so a tap never forces a layout read (see HEAVY_VISUAL_MIN_MS).
  const lastHeavyRef = useRef(0);
  const lastComboRenderRef = useRef(0);
  const blobRectRef = useRef<DOMRect | null>(null);
  // Latest income values, read when a rain event spawns.
  const rateRef = useRef(rate);
  const clickRef = useRef(perClick);
  rateRef.current = rate;
  clickRef.current = perClick;

  const frenzyActive = frenzyUntil > nowTs;

  // The robot hand auto-clicks: goo/sec = tap value × auto-taps/sec. Shown as a
  // persistent badge so it's obvious it's working.
  const robotPerSec = perClick * autoClicksPerSec(autoTapLevel);

  // Keep frenzy state fresh so the visuals turn off exactly when it ends.
  useEffect(() => {
    if (frenzyUntil <= Date.now()) return;
    const iv = window.setInterval(() => {
      setNowTs(Date.now());
      if (Date.now() >= frenzyUntil) window.clearInterval(iv);
    }, 150);
    return () => window.clearInterval(iv);
  }, [frenzyUntil]);

  // Order-of-magnitude crossing: a "spaceship accelerating" burst — bloom + warp
  // lines + a launch banner + a building thrust rumble, so every new digit
  // really lands. Non-blocking and self-clearing; it never gates a tap.
  useEffect(() => {
    if (magnitudePulse === 0) return;
    haptic([0, 25, 15, 45, 15, 70]); // a rumble that builds, like thrust
    if (reduced) return;
    setMagFlash(true);
    setMagBanner({ id: magnitudePulse, exp: magnitudeExp });
    const tf = window.setTimeout(() => setMagFlash(false), 900);
    window.clearTimeout(magBannerTimer.current);
    magBannerTimer.current = window.setTimeout(() => setMagBanner(null), 1300);
    return () => window.clearTimeout(tf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magnitudePulse]);

  // Visible robotic hand: while the auto-clicker is owned, a 🤖 +N floats up from
  // the blob every few seconds so you can SEE it tapping for you (purely visual;
  // the goo itself accrues via the tick).
  useEffect(() => {
    if (reduced) return;
    const iv = window.setInterval(() => {
      const s = useGame.getState();
      const rate = selectClickPower(s) * autoClicksPerSec(s.upgrades.autoTap); // goo/sec the hand taps
      const amount = rate * 3; // shown per ~3s
      if (amount <= 0) return;
      const id = ++uid;
      setAutoFloaters((prev) => [...prev, { id, amount }]);
      window.setTimeout(() => setAutoFloaters((prev) => prev.filter((x) => x.id !== id)), 1100);
    }, 3000);
    return () => window.clearInterval(iv);
  }, [reduced]);

  // Cache the blob's rect so a tap never has to call getBoundingClientRect
  // (a forced layout read interleaved with DOM writes = jank at high tap rates).
  // The blob doesn't move while you play, so we only refresh it on resize/scroll.
  useEffect(() => {
    const refresh = () => {
      blobRectRef.current = blobRef.current?.getBoundingClientRect() ?? null;
    };
    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, []);

  // One sweeper reaps expired tap particles/floaters, instead of a setTimeout per
  // spawn (50+ timers/sec while drumming). Returning the SAME array when nothing
  // expired lets React bail out, so an idle screen never re-renders from this.
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      const now = performance.now();
      setParticles((prev) => {
        if (!prev.length) return prev;
        const next = prev.filter((p) => p.expiry > now);
        return next.length === prev.length ? prev : next;
      });
      setFloaters((prev) => {
        if (!prev.length) return prev;
        const next = prev.filter((f) => f.expiry > now);
        return next.length === prev.length ? prev : next;
      });
    }, 150);
    return () => window.clearInterval(id);
  }, [reduced]);

  // Golden-bonus spawn loop (only alive while this screen is mounted).
  useEffect(() => {
    const schedule = () => {
      // A brand-new player gets their first bonus fast, so the thin opening
      // stretch has a scheduled payoff. Gated on being genuinely new (few taps,
      // few bonuses) so an established player can't farm it by re-entering the
      // tab; everyone else gets the normal 42-88s pacing.
      const g = useGame.getState();
      const early = firstBonusRef.current && g.clicks < 150 && g.bonusesCollected < 3;
      firstBonusRef.current = false;
      const wait = early
        ? firstBonusDelayMinMs + Math.random() * (firstBonusDelayMaxMs - firstBonusDelayMinMs)
        : bonusIntervalMinMs + Math.random() * (bonusIntervalMaxMs - bonusIntervalMinMs);
      spawnRef.current = window.setTimeout(() => {
        setBonus({ id: ++uid, top: 20 + Math.random() * 48 });
        lifeRef.current = window.setTimeout(() => {
          setBonus(null);
          schedule();
        }, bonusLifetimeMs);
      }, wait);
    };
    scheduleRef.current = schedule;
    schedule();
    return () => {
      window.clearTimeout(spawnRef.current);
      window.clearTimeout(lifeRef.current);
    };
  }, []);

  const onBonus = () => {
    window.clearTimeout(lifeRef.current);
    collectBonus();
    setBonus(null);
    scheduleRef.current();
  };

  // Goo-rain event: a burst of tappable drops falls down the screen.
  useEffect(() => {
    const schedule = () => {
      const wait = rainIntervalMinMs + Math.random() * (rainIntervalMaxMs - rainIntervalMinMs);
      rainTimer.current = window.setTimeout(() => {
        const reward = Math.max(
          Math.round(rateRef.current * rainDropIncomeSeconds),
          Math.round(clickRef.current * rainDropClickMult),
          rainDropMinGoo,
        );
        const drops: RainDrop[] = Array.from({ length: rainDropCount }, () => ({
          id: ++uid,
          left: 6 + Math.random() * 88,
          fall: (rainDurationMs / 1000) * (0.7 + Math.random() * 0.5),
          delay: Math.random() * (rainDurationMs / 1000) * 0.7,
          reward,
        }));
        rainStats.current = { popped: 0, sum: 0, total: drops.length };
        setRain(drops);
        rainClear.current = window.setTimeout(() => {
          setRain([]);
          schedule();
        }, rainDurationMs + 1500);
      }, wait);
    };
    schedule();
    return () => {
      window.clearTimeout(rainTimer.current);
      window.clearTimeout(rainClear.current);
      window.clearTimeout(rainBonusTimer.current);
    };
  }, []);

  const onDrop = (e: React.PointerEvent, id: number, reward: number) => {
    setRain((prev) => prev.filter((d) => d.id !== id));
    grantGoo(reward);
    const muted = useGame.getState().muted;
    playRainDrop(muted);

    // Show the value floating up from where it was tapped.
    const fid = ++uid;
    setDropFloaters((prev) => [...prev, { id: fid, x: e.clientX, y: e.clientY, amount: reward }]);
    window.setTimeout(() => setDropFloaters((prev) => prev.filter((f) => f.id !== fid)), 700);

    // Track progress toward catching the whole burst.
    const st = rainStats.current;
    st.popped += 1;
    st.sum += reward;
    if (st.total > 0 && st.popped >= st.total) {
      const bonus = Math.round(st.sum * (rainAllBonusMult - 1));
      st.total = 0; // guard against a double-award
      grantGoo(bonus);
      useGame.getState().triggerConfetti('confetti');
      playBonus(muted);
      haptic([0, 40, 30, 60, 30, 90]);
      setRainBonus({ id: fid, amount: bonus });
      window.clearTimeout(rainBonusTimer.current);
      rainBonusTimer.current = window.setTimeout(() => setRainBonus(null), 1800);
    }
  };

  // Widened to any Element so the speed-test full-screen tap surface can reuse
  // the exact same handler (sound, combo, haptics, floater) — during a test the
  // WHOLE screen is a tap target, not just the blob.
  const handleClick = (e: React.PointerEvent<Element>) => {
    const { gain, frenzy, crit } = click();

    // Combo: consecutive rapid taps build up, driving pitch and particle count.
    const t = performance.now();
    const c = comboRef.current;
    // A missed window HALVES the streak instead of zeroing it, so a kid who
    // pauses to watch the blob keeps most of their progress toward the payouts
    // (they reward steady tapping without demanding metronomic, bot-like taps).
    c.count = t - c.last < COMBO_WINDOW_MS ? c.count + 1 : Math.max(1, Math.floor(c.count / 2));
    c.last = t;
    // Coalesce the combo-counter re-render to ~10/sec: the exact number ticking
    // 50×/sec re-rendered the whole screen; the pitch/particle count read the ref
    // (c.count) directly, so only the on-screen "×N" chip needs this, and a
    // sub-100ms lag on it is invisible.
    if (t - lastComboRenderRef.current > COMBO_RENDER_MIN_MS) {
      lastComboRenderRef.current = t;
      setCombo(c.count);
    }
    window.clearTimeout(comboTimer.current);
    comboTimer.current = window.setTimeout(() => {
      comboRef.current.count = 0;
      setCombo(0);
    }, COMBO_WINDOW_MS + 150);

    // Combo milestone: cash in the whole streak — a lump sum worth
    // (milestone × current tap value). Early ramp, then every comboRepeatEvery
    // forever, so long streaks keep paying past 1000.
    // During a speed test the WHOLE screen is a tap target and taps come fast —
    // the combo-milestone confetti + burst on top of that is what made it lag.
    // The test has its own feedback (ring, counter, 50-tap zaps), so skip it.
    const isMilestone =
      !speedActive &&
      (comboMilestones.includes(c.count) ||
        (c.count >= comboRepeatEvery && c.count % comboRepeatEvery === 0));
    if (isMilestone) {
      const comboAb = activeAbilities.find((a) => a.type === 'combo');
      const comboMult = comboAb ? 1 + comboAb.value : 1;
      const amount = c.count * clickRef.current * comboRewardMult * comboMult;
      grantGoo(amount);
      const m = useGame.getState().muted;
      playBonus(m);
      useGame.getState().triggerConfetti('confetti');
      haptic([0, 40, 30, 60, 30, 90]);
      setComboBurst({ id: ++uid, milestone: c.count, amount });
      window.clearTimeout(comboBurstTimer.current);
      comboBurstTimer.current = window.setTimeout(() => setComboBurst(null), 1500);
    }

    const muted = useGame.getState().muted;
    // One entry point: playClick decides whether a crit is a standalone zap or
    // an accent on the melody's own note, so a bought melody is never silenced
    // by a lucky tap (see clickSoundFor).
    playClick(muted, frenzy ? c.count + 8 : c.count, comboMelody, crit);
    if (crit) haptic([0, 30, 20, 50]);
    else if (frenzy) haptic(12);

    // Skip the crit flash / squash / floaters / particles during a speed test:
    // at speed-test tap rates (5–19 particles PER tap) these saturate the main
    // thread — the very lag testers reported. The countdown ring + live counter
    // carry the feedback instead.
    if (reduced || speedActive) return;

    // Throttle the heavy visuals to ~20/sec. At 3000+ CPM (50 taps/sec) the
    // per-tap particle burst + floater + squash + crit flash was the jank; the
    // eye can't tell 50 bursts/sec from 20, so we simply skip the visual work on
    // taps that land inside the window. The goo, sound and combo above still ran.
    if (t - lastHeavyRef.current < HEAVY_VISUAL_MIN_MS) return;
    lastHeavyRef.current = t;

    if (crit) {
      setCritFlash(true);
      window.clearTimeout(critFlashTimer.current);
      critFlashTimer.current = window.setTimeout(() => setCritFlash(false), 300);
    }

    setSquash(true);
    window.setTimeout(() => setSquash(false), 180);

    // Cached rect (refreshed on resize/scroll) — no layout read on the tap path.
    const rect = blobRectRef.current;
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;

    const now = t;
    const fExpiry = now + (crit ? 900 : 700);
    // Cap concurrent floaters — drop the oldest rather than grow without bound.
    setFloaters((prev) => {
      const f: Floater = { id: ++uid, x, y, amount: gain, frenzy, crit, expiry: fExpiry };
      const base = prev.length >= MAX_FLOATERS ? prev.slice(prev.length - MAX_FLOATERS + 1) : prev;
      return [...base, f];
    });

    const count = (frenzy ? 9 : 5) + (crit ? 8 : 0) + Math.min(6, Math.floor(c.count / 3));
    const palette = crit ? ['#FFD84D', '#FFF4E0', '#FF2E88'] : frenzy ? FRENZY_COLORS : PARTICLE_COLORS;
    const pExpiry = now + 600;
    const next: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.8 - 0.4;
      const dist = 70 + Math.random() * (crit ? 130 : frenzy ? 90 : 55);
      next.push({
        id: ++uid,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 20,
        color: palette[i % palette.length],
        size: 8 + Math.random() * (frenzy ? 12 : 8),
        expiry: pExpiry,
      });
    }
    // Cap concurrent particles — keep only the most recent MAX_PARTICLES.
    setParticles((prev) => {
      const merged = prev.length + next.length > MAX_PARTICLES ? [...prev, ...next].slice(-MAX_PARTICLES) : [...prev, ...next];
      return merged;
    });
  };

  return (
    <div className="anim-tab-in relative flex h-full flex-col items-center justify-between overflow-hidden px-6 py-8">
      {/* The WHOLE screen is a tap target (owner request — it's more fun than
          hunting for the blob). A transparent surface sits ABOVE the blob and
          all the empty space but BELOW every real control: a tap anywhere that
          isn't a button routes here and runs the exact same handler the blob
          uses, so the blob still squashes and spits particles wherever you
          tap. Everything interactive — rain drops, the golden bonus and the
          bottom buttons (all z ≥ 10) plus the top bar and nav (separate
          layers) — sits above it and keeps its own tap. The blob <button>
          stays for accessibility/labelling; it just no longer needs to be hit
          directly. Skipped during a speed test, which brings its own
          full-screen tap surface (SpeedFocusOverlay). */}
      {!speedActive && (
        <div
          className="absolute inset-0 z-[5] touch-none select-none"
          onPointerDown={handleClick}
          aria-hidden
        />
      )}
      {frenzyActive && !reduced && (
        <div
          className="anim-vignette pointer-events-none absolute inset-0 z-0"
          style={{ boxShadow: 'inset 0 0 90px 20px rgba(255,46,136,0.55)' }}
          aria-hidden
        />
      )}
      {critFlash && !reduced && (
        <div
          className="anim-crit-flash pointer-events-none absolute inset-0 z-10"
          style={{ background: 'radial-gradient(circle, rgba(255,216,77,0.6), transparent 70%)' }}
          aria-hidden
        />
      )}
      {magFlash && !reduced && (
        <>
          <div
            className="anim-mag-flash pointer-events-none absolute inset-0 z-10"
            style={{ background: 'radial-gradient(circle at 50% 60%, rgba(163,255,18,0.85), rgba(0,229,255,0.45) 42%, transparent 74%)' }}
            aria-hidden
          />
          <div className="anim-warp pointer-events-none absolute inset-0 z-10" aria-hidden />
        </>
      )}
      {magBanner && !reduced && (
        <div
          key={magBanner.id}
          className="anim-mag-banner pointer-events-none absolute inset-x-0 top-40 z-30 text-center"
        >
          <div className="font-display text-6xl text-goo text-glow-pop">
            🚀 {formatGoo(Math.pow(10, magBanner.exp))}!
          </div>
          {/* From 1e15 up the suffix is letter-soup (Qa/Qi/Sx) for a kid — name
              the scale in Hebrew right on the banner, every crossing. */}
          {bigScaleNameHe(magBanner.exp) && (
            <div className="mt-1 font-display text-3xl text-cy">{bigScaleNameHe(magBanner.exp)}!</div>
          )}
        </div>
      )}

      {/* Goo rain: tappable drops fall down the whole screen. */}
      {rain.map((d) => (
        <button
          key={d.id}
          type="button"
          aria-label="טיפת גּוּ"
          onPointerDown={(e) => onDrop(e, d.id, d.reward)}
          className="absolute top-0 z-20 -translate-x-1/2"
          style={{ left: `${d.left}%` }}
        >
          <span
            className={reduced ? 'block p-2' : 'anim-rain-fall block p-2'}
            style={{ '--fall': `${d.fall}s`, animationDelay: `${d.delay}s` } as React.CSSProperties}
          >
            {/* p-2 on this (transformed) span, not the button, gives the falling
                drop a ≥44px hit area small hands can actually catch — the button's
                own box stays at top:0 and never follows the drop down. */}
            <svg viewBox="0 0 40 52" width="34" height="44" aria-hidden style={{ filter: 'drop-shadow(0 0 8px rgba(163,255,18,0.7))' }}>
              <path d="M20 2 C20 2 4 24 4 34 a16 16 0 0 0 32 0 C36 24 20 2 20 2 Z" fill="#A3FF12" stroke="#3A1F10" strokeWidth="3" strokeLinejoin="round" />
              <ellipse cx="14" cy="28" rx="4" ry="6" fill="#FFF4E0" opacity="0.6" />
            </svg>
          </span>
        </button>
      ))}

      {/* Value floating up from each caught drop. */}
      {dropFloaters.map((f) => (
        <span
          key={f.id}
          className={`pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-display text-2xl tabular text-goo text-glow-pop ${
            reduced ? '' : 'anim-float-up'
          }`}
          style={{ left: f.x, top: f.y }}
        >
          +{formatGoo(f.amount)}
        </span>
      ))}

      {/* "Caught them all" completion bonus. */}
      {rainBonus && (
        <div
          key={rainBonus.id}
          className={`pointer-events-none absolute inset-x-0 top-44 z-30 text-center ${reduced ? '' : 'anim-pop-in'}`}
        >
          <div className="font-display text-4xl text-cy text-glow-pop">🌧️ כָּל הַטִּפּוֹת!</div>
          <div className="mt-1 font-display text-3xl text-goo">בּוֹנוּס +{formatGoo(rainBonus.amount)}</div>
        </div>
      )}

      <GooHeader frenzyActive={frenzyActive} />

      {frenzyActive && (
        <div className="anim-bonus-pulse pointer-events-none absolute inset-x-0 top-40 z-10 text-center">
          <span className="rounded-full bg-hot px-4 py-1 font-display text-lg text-bone glow-hot">
            ×{frenzyMultiplier} טֵרוּף!
          </span>
        </div>
      )}

      {comboBurst && (
        <div
          key={comboBurst.id}
          className={`pointer-events-none absolute inset-x-0 top-32 z-30 text-center ${reduced ? '' : 'anim-pop-in'}`}
        >
          <div className="font-display text-4xl text-cy text-glow-pop">
            קוֹמְבּוֹ ×{comboBurst.milestone}!
          </div>
          <div className="mt-1 font-display text-3xl text-goo">+{formatGoo(comboBurst.amount)}</div>
        </div>
      )}

      <div className="relative flex flex-1 items-center justify-center">
        <div
          className={`pointer-events-none absolute h-72 w-72 rounded-full ${reduced ? '' : 'anim-breathe'}`}
          style={{
            background: frenzyActive
              ? 'radial-gradient(circle, rgba(255,46,136,0.4), transparent 65%)'
              : 'radial-gradient(circle, rgba(163,255,18,0.35), transparent 65%)',
          }}
        />

        <button
          ref={blobRef}
          type="button"
          onPointerDown={handleClick}
          aria-label="לחיצה על הבלוב"
          className="relative touch-none select-none rounded-full outline-none focus-visible:ring-4 focus-visible:ring-cy"
        >
          {combo >= 4 && !comboBurst && (
            <span
              className="anim-count-pop pointer-events-none absolute -top-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-cy px-3 py-0.5 font-display text-sm text-void"
              style={{ boxShadow: '0 0 16px rgba(0,229,255,0.7)' }}
            >
              קוֹמְבּוֹ ×{combo}
            </span>
          )}
          <span
            className={`block ${frenzyActive ? (reduced ? 'glow-hot' : 'anim-hue-spin') : 'glow-goo'} ${
              squash ? 'anim-squash' : reduced ? '' : 'anim-idle'
            }`}
            style={{ willChange: 'transform' }}
          >
            {mainCreature ? (
              // Creature on the main screen — the worn accessory layers on top.
              <span className="relative block h-[252px] w-[252px]">
                {/* Mastery indicator for a reborn creature: a soft rotating
                    halo ring behind it + a count badge — a pretty signal, not
                    just text (owner request). Both purely decorative. */}
                {mainRebirths > 0 && (
                  <>
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute -inset-2 rounded-full ${reduced ? '' : 'anim-rebirth-halo'}`}
                      style={{
                        background: 'conic-gradient(from 0deg,#33E1FF,#FF2E88,#FFD84D,#33E1FF)',
                        WebkitMask: 'radial-gradient(farthest-side,transparent calc(100% - 9px),#000 calc(100% - 8px))',
                        mask: 'radial-gradient(farthest-side,transparent calc(100% - 9px),#000 calc(100% - 8px))',
                        opacity: 0.9,
                      }}
                    />
                    <span
                      className="anim-breathe pointer-events-none absolute -top-1 end-0 z-20 flex items-center gap-0.5 rounded-full px-2 py-0.5 font-display text-sm text-void"
                      style={{ background: 'linear-gradient(135deg,#33E1FF,#FF2E88)', boxShadow: '0 0 16px -2px #FF2E88' }}
                    >
                      🔄 {mainRebirths}
                    </span>
                  </>
                )}
                <CharacterBody id={mainCreature} className="h-full w-full" evolution={mainEvolution} />
                {/* Creatures sit lower in their box than the classic blob does,
                    so the accessory is nudged down and in a touch — otherwise a
                    tall hat pokes out above the creature and hits the counter. */}
                <AccessoryOverlay
                  art={accessoryArt}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{ transform: 'translateY(7%) scale(0.88)' }}
                />
              </span>
            ) : (
              <MainBlob colors={blobColors} shape={blobShape} accessory={accessoryArt} className="h-[252px] w-[252px]" />
            )}
          </span>

          {particles.map((p) => (
            <span
              key={p.id}
              className="anim-particle pointer-events-none absolute left-1/2 top-1/2 rounded-full"
              style={
                {
                  width: p.size,
                  height: p.size,
                  background: p.color,
                  '--dx': `${p.dx}px`,
                  '--dy': `${p.dy}px`,
                } as React.CSSProperties
              }
            />
          ))}

          {floaters.map((f) => (
            <span
              key={f.id}
              className={`anim-float-up pointer-events-none absolute whitespace-nowrap font-display tabular text-glow-pop ${
                f.crit
                  ? 'text-5xl text-pop'
                  : f.frenzy
                    ? 'text-4xl text-hot'
                    : 'text-3xl text-pop'
              }`}
              style={{ left: f.x, top: f.y }}
            >
              {f.crit ? 'קְרִיטִי! ' : ''}+{formatGoo(f.amount)}
            </span>
          ))}

          {/* Robotic-hand auto-taps — float up from the top of the blob. */}
          {autoFloaters.map((f) => (
            <span
              key={f.id}
              className="anim-float-up pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap font-display text-xl text-cy"
              style={{ textShadow: '0 2px 8px #000' }}
            >
              🤖 +{formatGoo(f.amount)}
            </span>
          ))}
        </button>

        {bonus && <GoldenBonus key={bonus.id} top={bonus.top} reduced={reduced} onCollect={onBonus} />}

        {/* First-verb hint: a pointing finger that taps ON the blob so a pre-reader
            learns the core action without words. Dies on the very first tap
            (clicks === 0), so it can never nag. Hidden under the nickname dialog.
            Under reduced-motion it stays as a STATIC finger — the reduced-motion
            kid still gets the affordance (the blob and text hint alone give none).
            pointer-events-none so it never eats the tap it's teaching. */}
        {clicks === 0 && !nicknameOpen && (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2"
            style={{ marginTop: 44 }}
            aria-hidden
          >
            <span
              className={`block text-5xl ${reduced ? '' : 'anim-tap-hint'}`}
              style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.65))' }}
            >
              👆
            </span>
          </div>
        )}
      </div>

      {/* All the earning numbers live BELOW the creature, so nothing ever
          overlaps it: what you earn per second (creatures + robot, with the
          active bonuses as small badges) and what a tap is worth. Tapping the
          rate opens the stats panel for the full breakdown. */}
      {/* z-10 lifts this whole row above the full-screen tap surface (z-5) so
          the bonus/info/speed buttons keep their own taps. */}
      <div className="relative z-10 mb-3 flex w-full flex-col items-center gap-1.5">
        {clicks < 100 && (
          <p className="text-center text-sm text-bone/55">לוֹחֲצִים בְּכָל מָקוֹם — צוֹבְרִים גּוּ!</p>
        )}
        {/* One flow row: the bonus button and a compact info button holding the
            two numbers that matter. Tapping the info button opens the full
            breakdown plus a legend explaining every icon. Nothing floats, so
            nothing can overlap the creature on any screen size. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <BonusButton />
          <button
            type="button"
            onClick={() => useGame.getState().setInfoOpen(true)}
            aria-label="מידע על ההכנסות"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-black/30 px-3.5 py-1.5 text-sm tabular ring-1 ring-hairline active:scale-95"
          >
            <span className="text-goo">{formatGoo(rate + robotPerSec)}/ש׳</span>
            <span className="text-pop">👆 {formatGoo(perClick)}</span>
            <span className="text-cy">ℹ️</span>
          </button>
          <SpeedTest />
        </div>
      </div>

      {/* Speed-test focus mode + result screen (fixed overlays; render nothing
          unless a test is active). During a test the whole screen taps via the
          same handler the blob uses. */}
      <SpeedFocusOverlay onTap={handleClick} blobRef={blobRef} />
      <SpeedResult />
    </div>
  );
}

function GoldenBonus({
  top,
  reduced,
  onCollect,
}: {
  top: number;
  reduced: boolean;
  onCollect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCollect}
      aria-label="בונוס זהב"
      className="absolute z-20 -translate-x-1/2"
      style={{ top: `${top}%`, left: '50%' }}
    >
      <span className={`block ${reduced ? '' : 'anim-bonus-drift'}`} style={{ '--drift': `${bonusLifetimeMs}ms` } as React.CSSProperties}>
        <span className={`block ${reduced ? '' : 'anim-bonus-pulse'}`} style={{ filter: 'drop-shadow(0 0 20px rgba(255,216,77,0.8))' }}>
          <svg viewBox="0 0 100 100" width="84" height="84" aria-hidden>
            <circle cx="50" cy="52" r="34" fill="#FFD84D" stroke="#3A1F10" strokeWidth="5" />
            <circle cx="41" cy="46" r="5" fill="#1A0B2E" />
            <circle cx="59" cy="46" r="5" fill="#1A0B2E" />
            <path d="M40 60 Q50 70 60 60" fill="none" stroke="#1A0B2E" strokeWidth="5" strokeLinecap="round" />
            <path d="M50 6 l4 10 l11 1 l-8 8 l2 11 l-9 -6 l-9 6 l2 -11 l-8 -8 l11 -1 Z" fill="#FF2E88" stroke="#3A1F10" strokeWidth="3" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
    </button>
  );
}
