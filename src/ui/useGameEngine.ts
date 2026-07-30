// Wires the store to the browser: loads the save, runs the passive-income
// tick, and persists on an interval + visibilitychange + beforeunload (§12).

import { useEffect } from 'react';
import { playMagnitude, playMilestone } from '../audio/sfx';
import { speakCompliment, speakName } from '../audio/speech';
import { saveIntervalMs } from '../game/balance';
import { unlockCreatures } from '../game/characters';
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

  // Celebrate progress based on the number shown on the main screen — the
  // current goo counter — as it reaches new highs (§ user request: by the
  // on-screen number, not the hidden lifetime total). Spending and re-earning
  // below your previous peak never re-fires, so it's not spammy.
  useEffect(() => {
    if (!loaded) return;
    let peak = useGame.getState().goo;
    const unsub = useGame.subscribe((s) => {
      const next = s.goo;
      if (next <= peak) return; // no new high → nothing
      const before = peak;
      peak = next;

      const crossed = milestonesCrossed(before, next);
      const muted = useGame.getState().muted;
      if (crossed.length > 0) {
        // Each fact is celebrated only ONCE, ever (persisted) — spending and
        // re-earning across sessions never repeats a milestone.
        const shown = new Set(useGame.getState().milestonesShown);
        const fresh = crossed.filter((m) => !shown.has(m.goo));
        if (fresh.length > 0) {
          // Mark all newly-passed milestones so none re-fire, show the biggest.
          useGame.getState().markMilestonesShown(fresh.map((m) => m.goo));
          const top = fresh[fresh.length - 1];
          if (!useGame.getState().milestone) {
            useGame.getState().showMilestone(top);
            playMilestone(muted);
            useGame.getState().triggerConfetti('rainbow');
            speakCompliment(muted);
          }
        }
        return;
      }

      const beforeMag = Math.floor(Math.log10(Math.max(1, before)));
      const nextMag = Math.floor(Math.log10(Math.max(1, next)));
      if (nextMag > beforeMag && nextMag >= 2) {
        playMagnitude(muted, nextMag);
        useGame.getState().pulseMagnitude(nextMag);
      }
    });
    return unsub;
  }, [loaded]);

  // Click-unlock creatures: when total taps reach a creature's threshold, unlock
  // it with a full celebration (rarer creatures need many more taps).
  useEffect(() => {
    if (!loaded) return;
    const unsub = useGame.subscribe((s, prev) => {
      if (s.clicks === prev.clicks) return;
      for (const c of unlockCreatures) {
        if (c.unlockClicks != null && s.clicks >= c.unlockClicks && !s.characters[c.id]) {
          useGame.getState().grantUnlock(c.id, true);
          const muted = useGame.getState().muted;
          playMilestone(muted);
          speakName(c.nameHe, muted);
          break; // one at a time (taps increment by one)
        }
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
