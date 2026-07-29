// The big-number milestone celebration (§ user request). When lifetime goo
// crosses a curated milestone, this takes over the screen with the amount, a
// real-world fact that makes the number *mean* something, and a share button so
// the moment can go straight to family & friends. Honors reduced-motion.

import { useState } from 'react';
import { collectionOrder } from '../game/characters';
import { formatGooHero } from '../game/format';
import { useGame } from '../store';
import { shareProgress } from './shareCard';
import { useReducedMotion } from './useReducedMotion';

export function MilestoneReveal() {
  const milestone = useGame((s) => s.milestone);
  const dismiss = useGame((s) => s.dismissMilestone);
  const goo = useGame((s) => s.goo);
  const characters = useGame((s) => s.characters);
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!milestone) return null;

  const collectionCount = collectionOrder.filter((id) => characters[id]).length;

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await shareProgress({
        goo,
        collectionCount,
        total: collectionOrder.length,
        titleHe: `${milestone.emoji} ${milestone.titleHe}`,
        factHe: milestone.factHe,
      });
      setDone(true);
      window.setTimeout(() => setDone(false), 2500);
    } catch {
      /* ignore — can retry */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden p-6 text-center ${
        reduced ? '' : 'anim-screen-shake'
      }`}
      style={{ backgroundColor: 'rgba(6,2,14,0.95)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`pointer-events-none absolute inset-0 ${reduced ? '' : 'anim-burst'}`}
        style={{ background: 'radial-gradient(circle at 50% 42%, rgba(255,216,77,0.35), rgba(255,46,136,0.18) 45%, transparent 70%)' }}
        aria-hidden
      />

      <div className={`relative flex flex-col items-center ${reduced ? '' : 'anim-pop-in'}`}>
        <div className="text-7xl">{milestone.emoji}</div>
        <h2
          className="mt-3 font-display text-5xl text-gold"
          style={{ color: '#FFD84D', textShadow: '0 0 28px rgba(255,216,77,0.5)' }}
        >
          {milestone.titleHe}
        </h2>

        <div className="mt-5 font-display text-6xl tabular text-goo text-glow-pop">
          {formatGooHero(goo)}
        </div>
        <div className="mt-1 text-sm text-bone/60">גּוּ</div>

        <p className="mx-auto mt-6 max-w-[18rem] text-lg leading-relaxed text-cy">
          {milestone.factHe}
        </p>

        <button
          type="button"
          onClick={onShare}
          disabled={busy}
          className="btn mt-8 flex items-center gap-2 bg-hot px-8 py-3 text-lg text-bone glow-hot"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#FFF4E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="9" width="18" height="12" rx="2" />
            <path d="M12 15V3M12 3l-4 4M12 3l4 4" />
          </svg>
          {done ? 'נשמר!' : busy ? 'רגע…' : 'שַׁתֵּף אֶת הַהֶשֵּׂג!'}
        </button>

        <button type="button" onClick={dismiss} className="btn mt-3 bg-cy px-12 py-3 text-xl text-void">
          יֵשׁ!
        </button>
      </div>
    </div>
  );
}
