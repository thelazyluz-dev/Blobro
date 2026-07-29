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

  // Passive-income tick via requestAnimationFrame. rAF is throttled/paused while
  // the tab is hidden, so foreground time is handled here and BACKGROUND time is
  // credited on resume via applyAwayEarnings (see below).
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

    // When we come back to the foreground, reset the clock so the first frame
    // doesn't credit the (clamped) gap twice — applyAwayEarnings covers it.
    const resetClock = () => {
      if (document.visibilityState === 'visible') last = performance.now();
    };
    document.addEventListener('visibilitychange', resetClock);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', resetClock);
    };
  }, [loaded]);

  // Persistence + background-earning: save on hide, and on resume credit the
  // time spent hidden so a locked phone / app-switch keeps earning (capped).
  useEffect(() => {
    if (!loaded) return;
    const save = () => void useGame.getState().saveGame();
    let hiddenAt = 0;

    const interval = window.setInterval(save, saveIntervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        save();
      } else if (hiddenAt > 0) {
        const seconds = (Date.now() - hiddenAt) / 1000;
        hiddenAt = 0;
        useGame.getState().applyAwayEarnings(seconds);
      }
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
