// Full-screen confetti burst for big moments. Listens to the store's confetti
// counter and spawns a short-lived shower of colored pieces (pure CSS motion).
// Honors reduced-motion by skipping the animation entirely.

import { useEffect, useState } from 'react';
import { useGame, type ConfettiKind } from '../store';
import { useReducedMotion } from './useReducedMotion';

interface Piece {
  id: number;
  left: number;
  color: string;
  delay: number;
  duration: number;
  rotate: number;
  size: number;
  round: boolean;
}

const PALETTES: Record<ConfettiKind, string[]> = {
  confetti: ['#A3FF12', '#FF2E88', '#FFD84D', '#00E5FF', '#FFF4E0'],
  stars: ['#FFD84D', '#FF2E88', '#FFF4E0'],
  rainbow: ['#FF2E88', '#FFD84D', '#A3FF12', '#00E5FF', '#B36BFF'],
};

let pieceId = 0;

// Hard ceiling on how many pieces animate at once. Bursts accumulate (a rapid
// string of celebrations — e.g. evolving many creatures quickly — fires many
// triggerConfetti calls inside the 2.4s cleanup window), and without a cap the
// on-screen node count grows unbounded and the frame rate collapses. Keeping the
// newest MAX_PIECES bounds the work regardless of how fast the player evolves.
const MAX_PIECES = 90;

export function Confetti() {
  const bursts = useGame((s) => s.confettiBursts);
  const kind = useGame((s) => s.confettiKind);
  const reduced = useReducedMotion();
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (bursts === 0 || reduced) return;
    const palette = PALETTES[kind];
    const count = kind === 'rainbow' ? 46 : 30;
    const batch: Piece[] = Array.from({ length: count }, () => ({
      id: ++pieceId,
      left: Math.random() * 100,
      color: palette[Math.floor(Math.random() * palette.length)],
      delay: Math.random() * 0.25,
      duration: 1.3 + Math.random() * 0.9,
      rotate: Math.random() * 720 - 360,
      size: 8 + Math.random() * 10,
      round: Math.random() < 0.4,
    }));
    setPieces((prev) => {
      const next = [...prev, ...batch];
      return next.length > MAX_PIECES ? next.slice(next.length - MAX_PIECES) : next;
    });
    const ids = new Set(batch.map((p) => p.id));
    const t = window.setTimeout(
      () => setPieces((prev) => prev.filter((p) => !ids.has(p.id))),
      2400,
    );
    return () => window.clearTimeout(t);
  }, [bursts, kind, reduced]);

  if (pieces.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="anim-confetti absolute top-[-6%]"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: p.round ? '9999px' : '2px',
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--spin': `${p.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
