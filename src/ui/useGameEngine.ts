// Wires the store to the browser: loads the save, runs the passive-income
// tick, and persists on an interval + visibilitychange + beforeunload (§12).

import { useEffect } from 'react';
import { playMagnitude, playMilestone } from '../audio/sfx';
import { speakCompliment } from '../audio/speech';
import { saveIntervalMs } from '../game/balance';
import { milestonesCrossed } from '../game/milestones';
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

  // Celebrate progress: fire an order-of-magnitude "whoosh" every time the goo
  // counter gains a digit, and the full milestone celebration (fact + fanfare +
  // spoken compliment + confetti) when lifetime goo crosses a named milestone.
  useEffect(() => {
    if (!loaded) return;
    const unsub = useGame.subscribe((s, prev) => {
      const next = s.lifetimeGoo;
      const before = prev.lifetimeGoo;
      if (next <= before) return;

      const crossed = milestonesCrossed(before, next);
      const muted = useGame.getState().muted;
      if (crossed.length > 0) {
        // Fire the biggest one crossed in this step.
        const top = crossed[crossed.length - 1];
        if (!useGame.getState().milestone) {
          useGame.getState().showMilestone(top);
          playMilestone(muted);
          useGame.getState().triggerConfetti('rainbow');
          speakCompliment(muted);
        }
        return;
      }

      const beforeMag = Math.floor(Math.log10(Math.max(1, before)));
      const nextMag = Math.floor(Math.log10(Math.max(1, next)));
      if (nextMag > beforeMag && nextMag >= 2) {
        playMagnitude(muted, nextMag);
        useGame.getState().pulseMagnitude();
      }
    });
    return unsub;
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
