// Screen 1 — the main clicker (§10.1). Big goo blob, floating +N, live rate.

import { useRef, useState } from 'react';
import { formatGoo } from '../../game/format';
import { selectClickPower, selectGooPerSec, useGame } from '../../store';
import { useReducedMotion } from '../useReducedMotion';

interface Floater {
  id: number;
  x: number;
  y: number;
  amount: number;
}

let floaterId = 0;

export function ClickScreen() {
  const goo = useGame((s) => s.goo);
  const rate = useGame(selectGooPerSec);
  const perClick = useGame(selectClickPower);
  const click = useGame((s) => s.click);
  const reduced = useReducedMotion();

  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [squash, setSquash] = useState(false);
  const blobRef = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.PointerEvent<HTMLButtonElement>) => {
    const gain = click();

    if (!reduced) {
      setSquash(true);
      window.setTimeout(() => setSquash(false), 180);

      const rect = blobRef.current?.getBoundingClientRect();
      const x = rect ? e.clientX - rect.left : 0;
      const y = rect ? e.clientY - rect.top : 0;
      const id = ++floaterId;
      setFloaters((prev) => [...prev, { id, x, y, amount: gain }]);
      window.setTimeout(() => {
        setFloaters((prev) => prev.filter((f) => f.id !== id));
      }, 700);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-between px-6 py-8">
      <header className="mt-2 text-center">
        <div className="font-display text-6xl text-pop tabular leading-none">{formatGoo(goo)}</div>
        <div className="mt-1 text-sm text-bone/70">גּוּ</div>
        <div className="mt-3 text-lg text-goo tabular">{formatGoo(rate)} גּוּ/שנייה</div>
      </header>

      <div className="relative flex flex-1 items-center justify-center">
        <button
          ref={blobRef}
          type="button"
          onPointerDown={handleClick}
          aria-label="לחיצה על הבלוב"
          className="relative touch-none select-none rounded-full outline-none focus-visible:ring-4 focus-visible:ring-cy"
        >
          <span
            className={`block ${squash ? 'anim-squash' : reduced ? '' : 'anim-idle'}`}
            style={{ willChange: 'transform' }}
          >
            <svg viewBox="0 0 200 200" width="240" height="240" aria-hidden>
              <ellipse cx="100" cy="110" rx="84" ry="78" fill="#A3FF12" stroke="#3A1F10" strokeWidth="7" strokeLinejoin="round" />
              <circle cx="76" cy="96" r="14" fill="#1A0B2E" />
              <circle cx="128" cy="92" r="14" fill="#1A0B2E" />
              <circle cx="81" cy="91" r="4.5" fill="#FFF4E0" />
              <circle cx="133" cy="87" r="4.5" fill="#FFF4E0" />
              <path d="M70 132 Q100 158 132 130" fill="none" stroke="#1A0B2E" strokeWidth="7" strokeLinecap="round" />
              <ellipse cx="60" cy="132" rx="9" ry="6" fill="#FF2E88" opacity="0.55" />
              <ellipse cx="142" cy="130" rx="9" ry="6" fill="#FF2E88" opacity="0.55" />
            </svg>
          </span>

          {floaters.map((f) => (
            <span
              key={f.id}
              className="anim-float-up pointer-events-none absolute font-display text-2xl text-pop tabular"
              style={{ left: f.x, top: f.y }}
            >
              +{formatGoo(f.amount)}
            </span>
          ))}
        </button>
      </div>

      <p className="mb-2 text-center text-sm text-bone/60">
        לוחצים על הבלוב — צוברים גּוּ! ({formatGoo(perClick)} לכל נגיעה)
      </p>
    </div>
  );
}
