// The celebration when a click-unlock creature is earned (§ user request:
// "full reveal celebration"). Distinct from egg hatching — no egg to crack;
// the creature bursts in with its rarity colours. Honors reduced-motion.

import { charactersById } from '../game/characters';
import { formatExact } from '../game/format';
import { useGame } from '../store';
import { CharacterBody } from './characters';
import { rarityBackground, rarityColor, rarityLabelHe } from './rarity';
import { useReducedMotion } from './useReducedMotion';

export function UnlockReveal() {
  const id = useGame((s) => s.unlockReveal);
  const dismiss = useGame((s) => s.dismissUnlock);
  const reduced = useReducedMotion();
  if (!id) return null;

  const def = charactersById[id];
  const color = rarityColor[def.rarity];
  const legendary = def.rarity === 'legendary';

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden p-6 text-center ${
        reduced ? '' : 'anim-screen-shake'
      }`}
      style={{ backgroundColor: 'rgba(6,2,14,0.95)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="font-display text-lg tracking-wide text-cy">💪 פָּתַחְתָּ בִּזְכוּת הַלְּחִיצוֹת!</div>
      <div className="mt-1 font-display text-3xl" style={{ color: legendary ? '#FFD84D' : color }}>
        דְּמוּת חֲדָשָׁה!
      </div>

      <div className="relative mt-6 flex h-56 w-56 items-center justify-center">
        {!reduced && (
          <>
            <span className="anim-burst absolute inset-0 rounded-full" style={{ background: rarityBackground(def.rarity), opacity: legendary ? 0.95 : 0.7 }} />
            <span className="anim-ring-out absolute inset-0 rounded-full" style={{ boxShadow: `0 0 0 6px ${color}` }} />
          </>
        )}
        <div
          className="relative flex h-44 w-44 items-center justify-center rounded-[2rem]"
          style={{ background: rarityBackground(def.rarity), boxShadow: `0 0 60px -8px ${color}` }}
        >
          <CharacterBody id={id} className={`h-36 w-36 ${reduced ? '' : 'anim-drop-in'}`} />
        </div>
      </div>

      <div
        className="mt-6 inline-block rounded-full px-5 py-1.5 text-sm font-bold text-void"
        style={{ background: rarityBackground(def.rarity) }}
      >
        {rarityLabelHe[def.rarity]}
      </div>
      <h2 className="mt-3 font-display text-5xl" style={{ color: legendary ? '#FFD84D' : color, textShadow: `0 0 24px ${color}66` }}>
        {def.nameHe}
      </h2>
      <p className="mx-auto mt-2 max-w-[16rem] text-sm text-bone/75">{def.descHe}</p>
      {def.unlockClicks != null && (
        <p className="mt-2 text-xs text-cy tabular">נִפְתְּחָה אַחֲרֵי {formatExact(def.unlockClicks)} לְחִיצוֹת! 👆</p>
      )}

      <button type="button" onClick={dismiss} className="btn mt-6 bg-cy px-12 py-4 text-xl text-void">
        יֵשׁ!
      </button>
    </div>
  );
}
