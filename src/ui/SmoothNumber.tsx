// A number that glides toward its target instead of jumping to it.
//
// The economy ticks 10 times a second (see useGameEngine) — cheap for the
// screen as a whole, but a counter STEPPING ten times a second reads as
// stutter where the old per-frame tick read as motion. This restores the
// motion without restoring the cost: the glide re-renders only this leaf
// span at animation speed, while the store — and every other subscriber —
// stays at 10Hz. The rAF loop stops itself whenever the shown value has
// caught up, so an idle screen animates nothing.

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

interface Props {
  value: number;
  format: (v: number) => string;
}

// Exponential approach half-life. Short enough that the display is never
// more than ~one store tick behind reality (a purchase or a crit lands
// essentially instantly), long enough to fill the 100ms between ticks with
// visible movement.
const halfLifeSeconds = 0.09;

export function SmoothNumber({ value, format }: Props) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    if (reduced) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = shownRef.current;
      const diff = value - current;
      // Close enough that no format() could tell the difference → land
      // exactly and stop scheduling frames until the target moves again.
      if (Math.abs(diff) <= Math.max(1e-6, Math.abs(value) * 1e-9)) {
        shownRef.current = value;
        setShown(value);
        return;
      }
      const next = current + diff * (1 - Math.exp((-dt * Math.LN2) / halfLifeSeconds));
      shownRef.current = next;
      setShown(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  return <>{format(reduced ? value : shown)}</>;
}
