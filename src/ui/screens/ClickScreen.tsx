// Screen 1 — the main clicker (§10.1). Glowing goo blob, floating +N, goo
// particles, a live rate, plus the golden bonus and click-frenzy pull mechanics.
// All motion honors reduced-motion.

import { useEffect, useRef, useState } from 'react';
import { playBonus, playClick, playCrit, playRainDrop } from '../../audio/sfx';
import {
  bonusIntervalMaxMs,
  bonusIntervalMinMs,
  bonusLifetimeMs,
  comboMilestones,
  comboRepeatEvery,
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
import { formatExact, formatGoo, formatGooHero } from '../../game/format';
import { accessoryById, blobById } from '../../game/cosmetics';
import { selectClickPower, selectGooPerSec, selectStarBonus, useGame } from '../../store';
import { haptic } from '../haptics';
import { MainBlob } from '../MainBlob';
import { useReducedMotion } from '../useReducedMotion';

const COMBO_WINDOW_MS = comboWindowMs;

interface Floater {
  id: number;
  x: number;
  y: number;
  amount: number;
  frenzy: boolean;
  crit: boolean;
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
}

let uid = 0;
const PARTICLE_COLORS = ['#A3FF12', '#FFD84D', '#00E5FF'];
const FRENZY_COLORS = ['#FF2E88', '#FFD84D', '#00E5FF', '#A3FF12'];

export function ClickScreen() {
  const goo = useGame((s) => s.goo);
  const rate = useGame(selectGooPerSec);
  const perClick = useGame(selectClickPower);
  const starBonus = useGame(selectStarBonus);
  const click = useGame((s) => s.click);
  const collectBonus = useGame((s) => s.collectBonus);
  const grantGoo = useGame((s) => s.grantGoo);
  const frenzyUntil = useGame((s) => s.frenzyUntil);
  const blobColors = useGame((s) => blobById(s.equippedBlob).colors);
  const blobShape = useGame((s) => blobById(s.equippedBlob).shape);
  const accessoryArt = useGame((s) => accessoryById(s.equippedAccessory).art);
  const reduced = useReducedMotion();

  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [squash, setSquash] = useState(false);
  const [pop, setPop] = useState(false);
  const [bonus, setBonus] = useState<{ id: number; top: number } | null>(null);
  const [rain, setRain] = useState<RainDrop[]>([]);
  const [dropFloaters, setDropFloaters] = useState<{ id: number; x: number; y: number; amount: number }[]>([]);
  const [rainBonus, setRainBonus] = useState<{ id: number; amount: number } | null>(null);
  const rainStats = useRef({ popped: 0, sum: 0, total: 0 });
  const rainBonusTimer = useRef<number>();
  const [critFlash, setCritFlash] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [combo, setCombo] = useState(0);
  const [comboBurst, setComboBurst] = useState<{ id: number; milestone: number; amount: number } | null>(null);
  const comboBurstTimer = useRef<number>();
  const blobRef = useRef<HTMLButtonElement>(null);
  const popTimer = useRef<number>();
  const spawnRef = useRef<number>();
  const lifeRef = useRef<number>();
  const scheduleRef = useRef<() => void>(() => {});
  const rainTimer = useRef<number>();
  const rainClear = useRef<number>();
  const critFlashTimer = useRef<number>();
  const comboRef = useRef({ count: 0, last: 0 });
  const comboTimer = useRef<number>();
  // Latest income values, read when a rain event spawns.
  const rateRef = useRef(rate);
  const clickRef = useRef(perClick);
  rateRef.current = rate;
  clickRef.current = perClick;

  const frenzyActive = frenzyUntil > nowTs;

  // Keep frenzy state fresh so the visuals turn off exactly when it ends.
  useEffect(() => {
    if (frenzyUntil <= Date.now()) return;
    const iv = window.setInterval(() => {
      setNowTs(Date.now());
      if (Date.now() >= frenzyUntil) window.clearInterval(iv);
    }, 150);
    return () => window.clearInterval(iv);
  }, [frenzyUntil]);

  // Counter pop on change.
  useEffect(() => {
    if (reduced) return;
    setPop(true);
    window.clearTimeout(popTimer.current);
    popTimer.current = window.setTimeout(() => setPop(false), 200);
    return () => window.clearTimeout(popTimer.current);
  }, [goo, reduced]);

  // Golden-bonus spawn loop (only alive while this screen is mounted).
  useEffect(() => {
    const schedule = () => {
      const wait = bonusIntervalMinMs + Math.random() * (bonusIntervalMaxMs - bonusIntervalMinMs);
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

  const handleClick = (e: React.PointerEvent<HTMLButtonElement>) => {
    const { gain, frenzy, crit } = click();

    // Combo: consecutive rapid taps build up, driving pitch and particle count.
    const t = performance.now();
    const c = comboRef.current;
    c.count = t - c.last < COMBO_WINDOW_MS ? c.count + 1 : 1;
    c.last = t;
    setCombo(c.count);
    window.clearTimeout(comboTimer.current);
    comboTimer.current = window.setTimeout(() => {
      comboRef.current.count = 0;
      setCombo(0);
    }, COMBO_WINDOW_MS + 150);

    // Combo milestone: cash in the whole streak — a lump sum worth
    // (milestone × current tap value). Early ramp, then every comboRepeatEvery
    // forever, so long streaks keep paying past 1000.
    const isMilestone =
      comboMilestones.includes(c.count) ||
      (c.count >= comboRepeatEvery && c.count % comboRepeatEvery === 0);
    if (isMilestone) {
      const amount = c.count * clickRef.current;
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
    if (crit) {
      playCrit(muted);
      haptic([0, 30, 20, 50]);
    } else {
      playClick(muted, frenzy ? c.count + 8 : c.count);
      if (frenzy) haptic(12);
    }

    if (reduced) return;

    if (crit) {
      setCritFlash(true);
      window.clearTimeout(critFlashTimer.current);
      critFlashTimer.current = window.setTimeout(() => setCritFlash(false), 300);
    }

    setSquash(true);
    window.setTimeout(() => setSquash(false), 180);

    const rect = blobRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;

    const fid = ++uid;
    setFloaters((prev) => [...prev, { id: fid, x, y, amount: gain, frenzy, crit }]);
    window.setTimeout(() => setFloaters((prev) => prev.filter((f) => f.id !== fid)), crit ? 900 : 700);

    const count = (frenzy ? 9 : 5) + (crit ? 8 : 0) + Math.min(6, Math.floor(c.count / 3));
    const palette = crit ? ['#FFD84D', '#FFF4E0', '#FF2E88'] : frenzy ? FRENZY_COLORS : PARTICLE_COLORS;
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
      });
    }
    setParticles((prev) => [...prev, ...next]);
    const ids = new Set(next.map((p) => p.id));
    window.setTimeout(() => setParticles((prev) => prev.filter((p) => !ids.has(p.id))), 600);
  };

  return (
    <div className="anim-tab-in relative flex h-full flex-col items-center justify-between overflow-hidden px-6 py-8">
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
            className={reduced ? 'block' : 'anim-rain-fall block'}
            style={{ '--fall': `${d.fall}s`, animationDelay: `${d.delay}s` } as React.CSSProperties}
          >
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

      <header className="mt-2 text-center">
        <div
          className={`font-display text-7xl leading-none tabular text-glow-pop ${
            frenzyActive ? 'text-hot' : 'text-pop'
          } ${pop ? 'anim-count-pop' : ''}`}
        >
          {formatGooHero(goo)}
        </div>
        <div className="mt-1 text-sm tracking-wide text-bone/60">גּוּ</div>
        {goo >= 1000 && (
          <div className="mt-0.5 text-sm text-bone/60 tabular" dir="ltr">
            {formatExact(goo)}
          </div>
        )}
        <div className="mt-3 flex items-center justify-center gap-2">
          <div className="inline-block rounded-full bg-black/25 px-4 py-1 text-base text-goo tabular ring-hairline">
            {formatGoo(rate)} גּוּ/שנייה
          </div>
          {starBonus > 0 && (
            <div
              className="inline-block rounded-full bg-goo/15 px-3 py-1 text-base font-bold text-goo tabular ring-1 ring-goo/40"
              title="בונוס הכנסה קבוע מהישגים — חל על לחיצות והכנסה פאסיבית"
            >
              ⭐ +{Math.round(starBonus * 100)}%
            </div>
          )}
        </div>
      </header>

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
          {combo >= 4 && (
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
            <MainBlob colors={blobColors} shape={blobShape} accessory={accessoryArt} className="h-[252px] w-[252px]" />
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
        </button>

        {bonus && <GoldenBonus key={bonus.id} top={bonus.top} reduced={reduced} onCollect={onBonus} />}
      </div>

      <p className="mb-2 text-center text-sm text-bone/55">
        לוחצים על הבלוב — צוברים גּוּ! ({formatGoo(perClick)} לכל נגיעה)
      </p>
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
