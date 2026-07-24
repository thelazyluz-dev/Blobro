// Screen 1 — the main clicker (§10.1). Glowing goo blob, floating +N, goo-droplet
// particles, live rate. All motion honors reduced-motion.

import { useEffect, useRef, useState } from 'react';
import { formatGoo } from '../../game/format';
import { selectClickPower, selectGooPerSec, useGame } from '../../store';
import { useReducedMotion } from '../useReducedMotion';

interface Floater {
  id: number;
  x: number;
  y: number;
  amount: number;
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

export function ClickScreen() {
  const goo = useGame((s) => s.goo);
  const rate = useGame(selectGooPerSec);
  const perClick = useGame(selectClickPower);
  const click = useGame((s) => s.click);
  const reduced = useReducedMotion();

  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [squash, setSquash] = useState(false);
  const [pop, setPop] = useState(false);
  const blobRef = useRef<HTMLButtonElement>(null);
  const popTimer = useRef<number>();

  // Pop the counter whenever goo changes (kept brief, retriggerable).
  useEffect(() => {
    if (reduced) return;
    setPop(true);
    window.clearTimeout(popTimer.current);
    popTimer.current = window.setTimeout(() => setPop(false), 200);
    return () => window.clearTimeout(popTimer.current);
  }, [goo, reduced]);

  const handleClick = (e: React.PointerEvent<HTMLButtonElement>) => {
    const gain = click();
    if (reduced) return;

    setSquash(true);
    window.setTimeout(() => setSquash(false), 180);

    const rect = blobRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;

    const fid = ++uid;
    setFloaters((prev) => [...prev, { id: fid, x, y, amount: gain }]);
    window.setTimeout(() => setFloaters((prev) => prev.filter((f) => f.id !== fid)), 700);

    // Fling a few goo droplets from the blob centre.
    const next: Particle[] = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.8 - 0.4;
      const dist = 70 + Math.random() * 55;
      next.push({
        id: ++uid,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 20,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        size: 8 + Math.random() * 8,
      });
    }
    setParticles((prev) => [...prev, ...next]);
    const ids = new Set(next.map((p) => p.id));
    window.setTimeout(() => setParticles((prev) => prev.filter((p) => !ids.has(p.id))), 600);
  };

  return (
    <div className="anim-tab-in flex h-full flex-col items-center justify-between px-6 py-8">
      <header className="mt-2 text-center">
        <div
          className={`font-display text-7xl text-pop tabular leading-none text-glow-pop ${
            pop ? 'anim-count-pop' : ''
          }`}
        >
          {formatGoo(goo)}
        </div>
        <div className="mt-1 text-sm tracking-wide text-bone/60">גּוּ</div>
        <div className="mt-4 inline-block rounded-full bg-black/25 px-4 py-1 text-base text-goo tabular ring-hairline">
          {formatGoo(rate)} גּוּ/שנייה
        </div>
      </header>

      <div className="relative flex flex-1 items-center justify-center">
        {/* Ambient glow behind the blob */}
        <div
          className={`pointer-events-none absolute h-72 w-72 rounded-full ${reduced ? '' : 'anim-breathe'}`}
          style={{ background: 'radial-gradient(circle, rgba(163,255,18,0.35), transparent 65%)' }}
        />

        <button
          ref={blobRef}
          type="button"
          onPointerDown={handleClick}
          aria-label="לחיצה על הבלוב"
          className="relative touch-none select-none rounded-full outline-none focus-visible:ring-4 focus-visible:ring-cy"
        >
          <span
            className={`block glow-goo ${squash ? 'anim-squash' : reduced ? '' : 'anim-idle'}`}
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

          {/* Goo droplets */}
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

          {/* +N floaters */}
          {floaters.map((f) => (
            <span
              key={f.id}
              className="anim-float-up pointer-events-none absolute font-display text-3xl text-pop tabular text-glow-pop"
              style={{ left: f.x, top: f.y }}
            >
              +{formatGoo(f.amount)}
            </span>
          ))}
        </button>
      </div>

      <p className="mb-2 text-center text-sm text-bone/55">
        לוחצים על הבלוב — צוברים גּוּ! ({formatGoo(perClick)} לכל נגיעה)
      </p>
    </div>
  );
}
