// Wires the store to the browser: loads the save, runs the passive-income
// tick, and persists on an interval + visibilitychange + beforeunload (§12).

import { useEffect } from 'react';
import { playMagnitude, playMilestone } from '../audio/sfx';
import { speakCompliment, speakName } from '../audio/speech';
import { saveIntervalMs } from '../game/balance';
import { unlockCreatures } from '../game/characters';
import { bigScaleNameHe } from '../game/format';
import { milestonesCrossed } from '../game/milestones';
import { useGame } from '../store';

// Big-number scales already named this session, so the "you reached quadrillion!"
// toast fires once per scale per session (it only ever triggers on a live
// crossing, so a reload at 1e20 never re-announces scales already passed).
const bigScalesNamed = new Set<number>();

export function useGameEngine(): boolean {
  const loaded = useGame((s) => s.loaded);

  // Load once on mount.
  useEffect(() => {
    void useGame.getState().loadGame();
  }, []);

  // Passive-income tick via requestAnimationFrame. rAF is throttled/paused while
  // the tab is hidden, so foreground time is handled here and BACKGROUND time is
  // credited on resume via applyAwayEarnings (see below).
  //
  // The tick is deliberately SLOWER than the frame rate. Writing goo into the
  // store every frame re-rendered the whole active screen at 60Hz for as long
  // as any passive income existed — a constant battery cost on the phones kids
  // actually hold. Income is linear in dt (rates only change on user actions),
  // so crediting the same elapsed time in 100ms slices instead of 16ms slices
  // yields the same goo to the last digit; only the on-screen number updates
  // at 10Hz, which is as fast as a rolling counter reads anyway. rAF stays the
  // scheduler (it pauses when hidden, which the away-earnings flow relies on);
  // frames between ticks just accumulate time.
  useEffect(() => {
    if (!loaded) return;
    const displayTickMs = 100;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      if (now - last >= displayTickMs) {
        const dt = Math.min(1, (now - last) / 1000); // clamp long pauses
        last = now;
        useGame.getState().tick(dt);
      }
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
      // Whether a milestone reveal actually fired this tick — it owns the
      // moment when it does. It must NOT swallow the magnitude bookkeeping
      // below: milestones sit on exact round numbers (1e6, 1e9, 1e12, 1e21…),
      // so an early return here deterministically killed the burst AND the
      // one-time Hebrew scale-name toast on exactly the crossings that matter
      // most (playtest-verified: "סֶקְסְטִילְיוֹן" could never fire at all).
      let milestoneFired = false;
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
            milestoneFired = true;
          }
        }
      }

      const beforeMag = Math.floor(Math.log10(Math.max(1, before)));
      const nextMag = Math.floor(Math.log10(Math.max(1, next)));
      if (nextMag > beforeMag && nextMag >= 2) {
        // When a milestone reveal fired this tick, its full-screen takeover is
        // the celebration — skip the burst and its sound (they'd be buried
        // under the overlay and stack audio), but never skip the toast below.
        if (!milestoneFired) {
          playMagnitude(muted, nextMag);
          useGame.getState().pulseMagnitude(nextMag);
        }
        // The first time a session reaches a hard-to-read big scale (quadrillion
        // and up, where the HUD shows "1Qa"), name it in Hebrew so the number
        // means something — reusing the toast the rest of the game celebrates in.
        const scale = bigScaleNameHe(nextMag);
        const tier = Math.floor(nextMag / 3) * 3;
        if (scale && !bigScalesNamed.has(tier)) {
          bigScalesNamed.add(tier);
          useGame.getState().pushToast({ text: `${scale}! 🚀`, icon: '🎉', tone: 'star' });
        }
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
