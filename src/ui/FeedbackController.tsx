// Renderless: turns state changes into celebratory sound, confetti and haptics.
// Centralizes achievement + bonus feedback (the reveal handles its own).

import { useEffect, useRef } from 'react';
import { playAchievement, playBonus } from '../audio/sfx';
import { useGame } from '../store';
import { haptic } from './haptics';

export function FeedbackController() {
  const achievements = useGame((s) => s.achievements.length);
  const bonuses = useGame((s) => s.bonusesCollected);
  const prev = useRef({ achievements, bonuses, ready: false });

  useEffect(() => {
    const p = prev.current;
    // Skip the very first run (initial load / seeded state).
    if (!p.ready) {
      prev.current = { achievements, bonuses, ready: true };
      return;
    }
    const muted = useGame.getState().muted;
    if (achievements > p.achievements) {
      playAchievement(muted);
      useGame.getState().triggerConfetti('confetti');
      haptic([0, 40, 30, 60]);
    }
    if (bonuses > p.bonuses) {
      playBonus(muted);
      useGame.getState().triggerConfetti('stars');
      haptic([0, 25, 20, 40]);
    }
    prev.current = { achievements, bonuses, ready: true };
  }, [achievements, bonuses]);

  return null;
}
