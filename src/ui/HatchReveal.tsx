// The reveal moment (§7.4) — the game's headline beat.
// Egg shakes → burst in the rarity color → creature drops in → name is stamped.
// Intensity rises with rarity; legendary gets the loud treatment.
// Duplicates are never framed as a loss (§7.3). Honors reduced-motion.

import { useEffect, useState } from 'react';
import { charactersById } from '../game/characters';
import { formatGoo } from '../game/format';
import type { HatchOutcome } from '../game/hatching';
import { useGame } from '../store';
import { CharacterBody } from './characters';
import { rarityBackground, rarityColor, rarityLabelHe } from './rarity';
import { useReducedMotion } from './useReducedMotion';

const SHAKE_MS = 950;

export function HatchReveal() {
  const outcome = useGame((s) => s.hatchResult);
  const dismiss = useGame((s) => s.dismissHatch);
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<'shaking' | 'revealed'>('shaking');

  useEffect(() => {
    if (!outcome) return;
    if (reduced) {
      setStage('revealed');
      return;
    }
    setStage('shaking');
    const t = window.setTimeout(() => setStage('revealed'), SHAKE_MS);
    return () => window.clearTimeout(t);
  }, [outcome, reduced]);

  if (!outcome) return null;

  const def = charactersById[outcome.charId];
  const legendary = outcome.rarity === 'legendary';
  const showBurst = stage === 'revealed';

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-6 ${
        showBurst && !reduced ? 'anim-screen-shake' : ''
      }`}
    >
      {stage === 'shaking' ? (
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 120 150" width="160" height="200" className={reduced ? '' : 'anim-egg-shake'} aria-hidden>
            <ellipse cx="60" cy="82" rx="46" ry="58" fill="#FFF4E0" stroke="#3A1F10" strokeWidth="6" strokeLinejoin="round" />
            <path d="M30 78 l10 -10 l8 10 l10 -12 l9 12 l9 -10 l9 10" fill="none" stroke="#A3FF12" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="mt-6 font-display text-xl text-bone/80">הביצה זזה…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-56 w-56 items-center justify-center">
            {!reduced && (
              <span
                className="anim-burst absolute inset-0 rounded-full"
                style={{ background: rarityBackground(outcome.rarity), opacity: legendary ? 0.9 : 0.7 }}
              />
            )}
            <div
              className="relative flex h-44 w-44 items-center justify-center rounded-3xl"
              style={{ background: rarityBackground(outcome.rarity) }}
            >
              <CharacterBody id={outcome.charId} className={`h-36 w-36 ${reduced ? '' : 'anim-drop-in'}`} />
            </div>
          </div>

          <div
            className="mt-6 inline-block rounded-full px-4 py-1 text-sm font-bold text-void"
            style={{ background: rarityBackground(outcome.rarity) }}
          >
            {rarityLabelHe[outcome.rarity]}
          </div>

          <h2
            className="mt-3 font-display text-4xl"
            style={{ color: legendary ? '#FFD84D' : rarityColor[outcome.rarity] }}
          >
            {def.nameHe}
          </h2>

          <RevealMessage outcome={outcome} />

          <button
            type="button"
            onClick={dismiss}
            className="mt-8 rounded-2xl bg-cy px-10 py-4 font-display text-xl text-void active:scale-95"
          >
            יֵשׁ!
          </button>
        </div>
      )}
    </div>
  );
}

function RevealMessage({ outcome }: { outcome: HatchOutcome }) {
  const def = charactersById[outcome.charId];

  if (outcome.kind === 'new') {
    return <p className="mt-3 text-lg text-goo">יצור חדש הצטרף לאוסף!</p>;
  }
  if (outcome.kind === 'levelup') {
    return (
      <p className="mt-3 text-lg text-goo tabular">
        {def.nameHe} התחזק! רמה {outcome.level}
      </p>
    );
  }
  return (
    <p className="mt-3 text-lg text-pop tabular">
      {def.nameHe} במקסימום — קיבלת {formatGoo(outcome.gooReward)} גּוּ
    </p>
  );
}
