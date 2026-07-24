// The reveal moment (§7.4) — the game's headline beat.
// Egg shakes → burst in the rarity color → creature drops in → name is stamped.
// Intensity rises with rarity; legendary gets the loud treatment.
// Duplicates are never framed as a loss (§7.3). Honors reduced-motion.

import { useEffect, useState } from 'react';
import { playJingle } from '../audio/synth';
import { charactersById } from '../game/characters';
import { formatGoo } from '../game/format';
import type { HatchOutcome } from '../game/hatching';
import type { CharId } from '../game/types';
import { useGame } from '../store';
import { CharacterBody } from './characters';
import { haptic } from './haptics';
import { rarityBackground, rarityColor, rarityLabelHe, isShareworthy } from './rarity';
import { shareCreature } from './shareCard';
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

  // The creature's jingle sounds the moment it's revealed (§7.4 step 4), along
  // with confetti + a haptic buzz that scale with rarity. muted is read fresh so
  // toggling it mid-reveal never replays the jingle.
  useEffect(() => {
    if (!outcome || stage !== 'revealed') return;
    playJingle(charactersById[outcome.charId].sound, useGame.getState().muted);
    const r = outcome.rarity;
    if (r === 'legendary') {
      useGame.getState().triggerConfetti('rainbow');
      haptic([0, 60, 40, 60, 40, 90]);
    } else if (r === 'rare') {
      useGame.getState().triggerConfetti('confetti');
      haptic([0, 40, 30, 60]);
    } else {
      haptic(30);
    }
  }, [outcome, stage]);

  if (!outcome) return null;

  const def = charactersById[outcome.charId];
  const legendary = outcome.rarity === 'legendary';
  const showBurst = stage === 'revealed';

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black/88 p-6 ${
        showBurst && !reduced ? 'anim-screen-shake' : ''
      }`}
    >
      {stage === 'shaking' ? (
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 120 150" width="176" height="220" className={`glow-goo ${reduced ? '' : 'anim-egg-shake'}`} aria-hidden>
            <ellipse cx="60" cy="82" rx="46" ry="58" fill="#FFF4E0" stroke="#3A1F10" strokeWidth="6" strokeLinejoin="round" />
            <path d="M30 78 l10 -10 l8 10 l10 -12 l9 12 l9 -10 l9 10" fill="none" stroke="#A3FF12" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <ellipse cx="45" cy="58" rx="9" ry="13" fill="#A3FF12" opacity="0.4" />
          </svg>
          <p className="mt-8 font-display text-2xl text-bone/85">הביצה זזה…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-64 w-64 items-center justify-center">
            {!reduced && (
              <>
                <span
                  className="anim-burst absolute inset-0 rounded-full"
                  style={{ background: rarityBackground(outcome.rarity), opacity: legendary ? 0.95 : 0.7 }}
                />
                <span
                  className="anim-ring-out absolute inset-0 rounded-full"
                  style={{ boxShadow: `0 0 0 6px ${rarityColor[outcome.rarity]}` }}
                />
              </>
            )}
            <div
              className="relative flex h-48 w-48 items-center justify-center rounded-[2rem]"
              style={{ background: rarityBackground(outcome.rarity), boxShadow: `0 0 60px -8px ${rarityColor[outcome.rarity]}` }}
            >
              <CharacterBody id={outcome.charId} className={`h-40 w-40 ${reduced ? '' : 'anim-drop-in'}`} />
            </div>
          </div>

          <div
            className="mt-7 inline-block rounded-full px-5 py-1.5 text-sm font-bold text-void"
            style={{ background: rarityBackground(outcome.rarity) }}
          >
            {rarityLabelHe[outcome.rarity]}
          </div>

          <h2
            className="mt-3 font-display text-5xl"
            style={{
              color: legendary ? '#FFD84D' : rarityColor[outcome.rarity],
              textShadow: `0 0 24px ${rarityColor[outcome.rarity]}66`,
            }}
          >
            {def.nameHe}
          </h2>

          <RevealMessage outcome={outcome} />

          {isShareworthy(outcome.rarity) && <ShareButton id={outcome.charId} />}

          <button
            type="button"
            onClick={dismiss}
            className="btn mt-6 bg-cy px-12 py-4 text-xl text-void"
          >
            יֵשׁ!
          </button>
        </div>
      )}
    </div>
  );
}

function ShareButton({ id }: { id: CharId }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await shareCreature(id);
      setDone(true);
      window.setTimeout(() => setDone(false), 2500);
    } catch {
      /* ignore — user can try again */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onShare}
      disabled={busy}
      className="btn mt-6 flex items-center gap-2 bg-hot px-8 py-3 text-lg text-bone glow-hot"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#FFF4E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="9" width="18" height="12" rx="2" />
        <path d="M12 15V3M12 3l-4 4M12 3l4 4" />
      </svg>
      {done ? 'נשמר!' : busy ? 'רגע…' : 'שמור תמונה'}
    </button>
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
