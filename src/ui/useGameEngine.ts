// Wires the store to the browser: loads the save, runs the passive-income
// tick, and persists on an interval + visibilitychange + beforeunload (§12).

import { useEffect } from 'react';
import { playMagnitude, playMilestone } from '../audio/sfx';
import { speakCompliment, speakName } from '../audio/speech';
import { suspendAudio } from '../audio/synth';
import { googolWinGoo, saveIntervalMs } from '../game/balance';
import { unlockCreatures } from '../game/characters';
import { bigScaleNameHe } from '../game/format';
import { milestonesCrossed } from '../game/milestones';
import { useGame } from '../store';
import { startPowerSaver } from './powerSaver';

// Big-number scales already named this session, so the "you reached quadrillion!"
// toast fires once per scale per session (it only ever triggers on a live
// crossing, so a reload at 1e20 never re-announces scales already passed).
const bigScalesNamed = new Set<number>();

export function useGameEngine(): boolean {
  const loaded = useGame((s) => s.loaded);

  // Load once on mount, and arm the idle battery saver (see ui/powerSaver.ts).
  useEffect(() => {
    startPowerSaver();
    void useGame.getState().loadGame();
  }, []);

  // Passive-income tick on a 100ms interval.
  //
  // The tick is deliberately SLOWER than the frame rate. Writing goo into the
  // store every frame re-rendered the whole active screen at 60Hz for as long
  // as any passive income existed — a constant battery cost on the phones kids
  // actually hold. Income is linear in dt (rates only change on user actions),
  // so crediting the same elapsed time in 100ms slices instead of 16ms slices
  // yields the same goo to the last digit; only the on-screen number updates
  // at 10Hz, which is as fast as a rolling counter reads anyway.
  //
  // It used to be a rAF loop that merely CHECKED the clock each frame — 60-120
  // wakeups a second to do work on 10 of them, a measurable idle battery cost.
  // setInterval wakes exactly when there is work. The trade: intervals keep
  // firing (throttled) in a HIDDEN tab, where rAF paused, and hidden time is
  // already credited on resume by applyAwayEarnings — so hidden ticks must be
  // skipped explicitly or that time would be counted twice.
  useEffect(() => {
    if (!loaded) return;
    let last = performance.now();

    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return; // applyAwayEarnings owns hidden time
      const now = performance.now();
      const dt = Math.min(1, (now - last) / 1000); // clamp long pauses
      last = now;
      useGame.getState().tick(dt);
    }, 100);

    // When we come back to the foreground, reset the clock so the first tick
    // doesn't credit the (clamped) gap twice — applyAwayEarnings covers it.
    const resetClock = () => {
      if (document.visibilityState === 'visible') last = performance.now();
    };
    document.addEventListener('visibilitychange', resetClock);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', resetClock);
    };
  }, [loaded]);

  // Park the audio thread whenever it cannot be heard. The AudioContext used
  // to stay `running` forever once unlocked — a muted or backgrounded game
  // still kept the OS audio pipeline (and its battery cost) alive. Every
  // playback path already resume()s a suspended context on the next audible
  // call, so suspending aggressively is free.
  useEffect(() => {
    if (!loaded) return;
    if (useGame.getState().muted) suspendAudio();
    const unsub = useGame.subscribe((s, prev) => {
      if (s.muted && !prev.muted) suspendAudio();
    });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') suspendAudio();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loaded]);

  // Celebrate progress based on the number shown on the main screen — the
  // current goo counter — as it reaches new highs (§ user request: by the
  // on-screen number, not the hidden lifetime total). Spending and re-earning
  // below your previous peak never re-fires, so it's not spammy.
  useEffect(() => {
    if (!loaded) return;

    // Retroactive win: the live crossing below only fires when goo moves ACROSS
    // the threshold while the tab is open. A player who was ALREADY at or above
    // the win line when this build loaded (e.g. the bar was raised beneath their
    // feet, or they crossed it offline) would never trigger it and would never
    // get the crown. Grant it once here, on load, so every current player who
    // already qualifies is caught up — this is the "update all current players"
    // half of the win. winGoogol is idempotent, so an existing champion is a
    // no-op and this never re-opens the screen after it's been dismissed.
    {
      const s0 = useGame.getState();
      if (s0.goo >= googolWinGoo && !s0.ownedCosmetics.includes('acc-champion')) {
        s0.winGoogol();
        playMilestone(s0.muted);
        speakCompliment(s0.muted);
      }
    }

    let peak = useGame.getState().goo;
    const unsub = useGame.subscribe((s) => {
      const next = s.goo;
      if (next <= peak) return; // no new high → nothing
      const before = peak;
      peak = next;

      const muted = useGame.getState().muted;

      // The googol win — the endgame moment. The first time held goo crosses the
      // win threshold, grant the champion crown and open the victory screen.
      // winGoogol is idempotent (owning the crown is the persisted proof) and
      // marks the 1e100 milestone shown so its regular reveal below never stacks
      // on top of the victory takeover. It fires its own rainbow confetti.
      let victoryFired = false;
      if (
        before < googolWinGoo &&
        next >= googolWinGoo &&
        !useGame.getState().ownedCosmetics.includes('acc-champion')
      ) {
        useGame.getState().winGoogol();
        playMilestone(muted);
        speakCompliment(muted);
        victoryFired = true;
      }

      const crossed = milestonesCrossed(before, next);
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
          const sp = useGame.getState().speedPhase;
          if (sp === 'countdown' || sp === 'running') {
            // Mid speed-test: a full-screen takeover would freeze the tapping.
            // The fact is already marked shown (so it never re-fires); just
            // acknowledge it with a non-blocking toast.
            useGame.getState().pushToast({ text: 'יַעַד גָּדוֹל נִשְׁבַּר! 🏆', icon: '🎉', tone: 'star' });
          } else if (!useGame.getState().milestone && !victoryFired) {
            // The victory takeover already owns this tick — a lower milestone
            // reveal must not stack behind it (only reachable on a huge multi-
            // decade jump, e.g. an admin edit; normal play crosses one at a
            // time). It's already marked shown above, so it never re-fires.
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
    // Grant EVERY owed creature whose tap threshold is met but isn't owned yet.
    // Normal play crosses one threshold per tap (owed has one) — same as before —
    // but a BULK clicks jump (an admin edit, or a cross-device merge) can cross
    // several at once, and the old one-per-change loop (plus the fact the load
    // jump landed before this subscription attached) meant such creatures never
    // unlocked. Reveal only the highest so modals never stack, and never take
    // over the screen mid speed-test.
    const sweep = () => {
      const s = useGame.getState();
      const owed = unlockCreatures.filter(
        (c) => c.unlockClicks != null && s.clicks >= c.unlockClicks && !s.characters[c.id],
      );
      if (owed.length === 0) return;
      const inTest = s.speedPhase === 'countdown' || s.speedPhase === 'running';
      const muted = s.muted;
      owed.forEach((c, i) => {
        const reveal = i === owed.length - 1 && !inTest;
        useGame.getState().grantUnlock(c.id, reveal);
      });
      const top = owed[owed.length - 1];
      if (inTest) {
        useGame.getState().pushToast({ text: `${top.nameHe} נִפְתַּח! ⭐`, icon: '🎉', tone: 'star' });
      } else {
        playMilestone(muted);
        speakName(top.nameHe, muted);
        if (owed.length > 1) {
          useGame.getState().pushToast({ text: `נִפְתְּחוּ ${owed.length} יְצוּרִים! 🎉`, icon: '⭐', tone: 'star' });
        }
      }
    };
    // Initial sweep: catch clicks that were set DURING load (an admin edit or a
    // merge lands as one jump before this subscription is attached).
    sweep();
    const unsub = useGame.subscribe((s, prev) => {
      if (s.clicks === prev.clicks) return;
      sweep();
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
