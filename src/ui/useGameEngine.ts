// Wires the store to the browser: loads the save, runs the passive-income
// tick, and persists on an interval + visibilitychange + beforeunload (§12).

import { useEffect } from 'react';
import { saveIntervalMs } from '../game/balance';
import { useGame } from '../store';

export function useGameEngine(): boolean {
  const loaded = useGame((s) => s.loaded);

  // Load once on mount.
  useEffect(() => {
    void useGame.getState().loadGame();
  }, []);

  // Passive-income tick via requestAnimationFrame.
  useEffect(() => {
    if (!loaded) return;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(1, (now - last) / 1000); // clamp long pauses
      last = now;
      if (dt > 0) useGame.getState().tick(dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [loaded]);

  // Persistence: interval + on hide + on unload.
  useEffect(() => {
    if (!loaded) return;
    const save = () => void useGame.getState().saveGame();

    const interval = window.setInterval(save, saveIntervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', save);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', save);
      save();
    };
  }, [loaded]);

  return loaded;
}
