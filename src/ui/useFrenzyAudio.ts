// Plays a looping arpeggio while a click frenzy is active.

import { useEffect, useRef } from 'react';
import { playFrenzyStep } from '../audio/sfx';
import { useGame } from '../store';

export function useFrenzyAudio(): void {
  const frenzyUntil = useGame((s) => s.frenzyUntil);
  const stepRef = useRef(0);

  useEffect(() => {
    if (frenzyUntil <= Date.now()) return;
    const iv = window.setInterval(() => {
      if (Date.now() >= frenzyUntil) {
        window.clearInterval(iv);
        return;
      }
      playFrenzyStep(useGame.getState().muted, stepRef.current++);
    }, 150);
    return () => window.clearInterval(iv);
  }, [frenzyUntil]);
}
