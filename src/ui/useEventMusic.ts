// Plays the 8-bit chiptune loop while a "music" event is active (and not muted).
// The loop is stepped on an interval, mirroring useFrenzyAudio.

import { useEffect } from 'react';
import { MUSIC_STEP_MS, playMusicStep } from '../audio/sfx';
import { currentEvent } from '../game/events';
import { useGame } from '../store';

export function useEventMusic(): void {
  const muted = useGame((s) => s.muted);
  useEffect(() => {
    if (muted) return;
    let step = 0;
    const iv = window.setInterval(() => {
      if (!currentEvent(Date.now()).music) {
        step = 0; // restart the loop cleanly next time a music event begins
        return;
      }
      playMusicStep(false, step);
      step += 1;
    }, MUSIC_STEP_MS);
    return () => window.clearInterval(iv);
  }, [muted]);
}
