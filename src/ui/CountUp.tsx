// Counts a number up from 0 → target for the "welcome back" reveal (§8).
// Honors reduced-motion by showing the final value immediately.

import { useEffect, useState } from 'react';
import { formatGoo } from '../game/format';
import { useReducedMotion } from './useReducedMotion';

interface Props {
  target: number;
  durationMs?: number;
}

export function CountUp({ target, durationMs = 1200 }: Props) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);

  return <span className="tabular">{formatGoo(value)}</span>;
}
