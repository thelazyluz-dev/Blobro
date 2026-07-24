// Screen 1 — the main clicker (§10.1). Glowing goo blob, floating +N, goo
// particles, a live rate, plus the golden bonus and click-frenzy pull mechanics.
// All motion honors reduced-motion.

import { useEffect, useRef, useState } from 'react';
import {
  bonusIntervalMaxMs,
  bonusIntervalMinMs,
  bonusLifetimeMs,
  frenzyMultiplier,
} from '../../game/balance';
import { formatGoo } from '../../game/format';
import { selectClickPower, selectGooPerSec, useGame } from '../../store';
import { useReducedMotion } from '../useReducedMotion';

interface Floater {
  id: number;
  x: number;
  y: number;
  amount: number;
  frenzy: boolean;
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
  const click = useGame((s) => s.click);
  const collectBonus = useGame((s) => s.collectBonus);
  const frenzyUntil = useGame((s) => s.frenzyUntil);
  const reduced = useReducedMotion();

  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [squash, setSquash] = useState(false);
  const [pop, setPop] = useState(false);
  const [bonus, setBonus] = useState<{ id: number; top: number } | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const blobRef = useRef<HTMLButtonElement>(null);
  const popTimer = useRef<number>();
  const spawnRef = useRef<number>();
  const lifeRef = useRef<number>();
  const scheduleRef = useRef<() => void>(() => {});

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

  const handleClick = (e: React.PointerEvent<HTMLButtonElement>) => {
    const { gain, frenzy } = click();
    if (reduced) return;

    setSquash(true);
    window.setTimeout(() => setSquash(false), 180);

    const rect = blobRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;

    const fid = ++uid;
    setFloaters((prev) => [...prev, { id: fid, x, y, amount: gain, frenzy }]);
    window.setTimeout(() => setFloaters((prev) => prev.filter((f) => f.id !== fid)), 700);

    const count = frenzy ? 9 : 5;
    const palette = frenzy ? FRENZY_COLORS : PARTICLE_COLORS;
    const next: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.8 - 0.4;
      const dist = 70 + Math.random() * (frenzy ? 90 : 55);
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
      <header className="mt-2 text-center">
        <div
          className={`font-display text-7xl leading-none tabular text-glow-pop ${
            frenzyActive ? 'text-hot' : 'text-pop'
          } ${pop ? 'anim-count-pop' : ''}`}
        >
          {formatGoo(goo)}
        </div>
        <div className="mt-1 text-sm tracking-wide text-bone/60">גּוּ</div>
        <div className="mt-4 inline-block rounded-full bg-black/25 px-4 py-1 text-base text-goo tabular ring-hairline">
          {formatGoo(rate)} גּוּ/שנייה
        </div>
      </header>

      {frenzyActive && (
        <div className="anim-bonus-pulse pointer-events-none absolute inset-x-0 top-40 z-10 text-center">
          <span className="rounded-full bg-hot px-4 py-1 font-display text-lg text-bone glow-hot">
            ×{frenzyMultiplier} טֵרוּף!
          </span>
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
          <span
            className={`block ${frenzyActive ? 'glow-hot' : 'glow-goo'} ${
              squash ? 'anim-squash' : reduced ? '' : 'anim-idle'
            }`}
            style={{ willChange: 'transform' }}
          >
            <svg viewBox="0 0 200 200" width="248" height="248" aria-hidden>
              <ellipse cx="100" cy="110" rx="84" ry="78" fill="#A3FF12" stroke="#3A1F10" strokeWidth="7" strokeLinejoin="round" />
              <ellipse cx="74" cy="72" rx="20" ry="12" fill="#FFF4E0" opacity="0.25" />
              <circle cx="76" cy="96" r="14" fill="#1A0B2E" />
              <circle cx="128" cy="92" r="14" fill="#1A0B2E" />
              <circle cx="81" cy="91" r="4.5" fill="#FFF4E0" />
              <circle cx="133" cy="87" r="4.5" fill="#FFF4E0" />
              <path d="M70 132 Q100 158 132 130" fill="none" stroke="#1A0B2E" strokeWidth="7" strokeLinecap="round" />
              <ellipse cx="60" cy="132" rx="9" ry="6" fill="#FF2E88" opacity="0.55" />
              <ellipse cx="142" cy="130" rx="9" ry="6" fill="#FF2E88" opacity="0.55" />
            </svg>
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
              className={`anim-float-up pointer-events-none absolute font-display tabular text-glow-pop ${
                f.frenzy ? 'text-4xl text-hot' : 'text-3xl text-pop'
              }`}
              style={{ left: f.x, top: f.y }}
            >
              +{formatGoo(f.amount)}
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
