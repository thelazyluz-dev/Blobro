// Summary shown after a bulk hatch (×10 / all): what you got, grouped and
// celebrated. Plays a sound + confetti scaled to the best pull.

import { useEffect } from 'react';
import { playAchievement, playBonus } from '../audio/sfx';
import { charactersById } from '../game/characters';
import { formatGoo } from '../game/format';
import type { Rarity } from '../game/types';
import { useGame } from '../store';
import { CharacterBody } from './characters';
import { haptic } from './haptics';
import { rarityColor, rarityLabelHe } from './rarity';

const RARITY_ORDER: Rarity[] = ['legendary', 'rare', 'uncommon', 'common'];

export function MultiHatchResult() {
  const result = useGame((s) => s.multiHatchResult);
  const dismiss = useGame((s) => s.dismissMultiHatch);

  useEffect(() => {
    if (!result) return;
    const muted = useGame.getState().muted;
    const best = result.bestRarity;
    if (best === 'legendary') {
      playAchievement(muted);
      useGame.getState().triggerConfetti('rainbow');
      haptic([0, 60, 40, 80]);
    } else if (best === 'rare') {
      playAchievement(muted);
      useGame.getState().triggerConfetti('confetti');
      haptic([0, 40, 30, 60]);
    } else {
      playBonus(muted);
      useGame.getState().triggerConfetti('stars');
      haptic(30);
    }
  }, [result]);

  if (!result) return null;

  const totalLevels = Object.values(result.levelUps).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6">
      <div
        className="surface anim-pop-in flex max-h-[86vh] w-full max-w-sm flex-col rounded-3xl p-5 text-center"
        style={{ boxShadow: '0 0 0 2px #FFD84D, 0 24px 60px -20px #000' }}
      >
        <h2 className="font-display text-3xl text-bone">
          בָּקַעְתָּ {result.count} בֵּיצִים!
        </h2>

        {/* rarity tally chips */}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {RARITY_ORDER.filter((r) => result.rarityTally[r] > 0).map((r) => (
            <span
              key={r}
              className="rounded-full px-3 py-1 text-xs font-bold text-void tabular"
              style={{ background: rarityColor[r] }}
            >
              {rarityLabelHe[r]} ×{result.rarityTally[r]}
            </span>
          ))}
        </div>

        {/* new creatures */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {result.newIds.length > 0 ? (
            <>
              <div className="mb-2 text-sm text-goo">יְצוּרִים חֲדָשִׁים!</div>
              <div className="grid grid-cols-3 gap-2">
                {result.newIds.map((id) => {
                  const def = charactersById[id];
                  return (
                    <div
                      key={id}
                      className="flex flex-col items-center rounded-2xl p-1"
                      style={{ boxShadow: `inset 0 0 0 2px ${rarityColor[def.rarity]}` }}
                    >
                      <CharacterBody id={id} className="h-12 w-12" />
                      <span className="mt-1 max-w-full truncate px-1 text-[10px] text-bone/80">
                        {def.nameHe}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="py-4 text-sm text-bone/60">היצורים שלך התחזקו! 💪</div>
          )}
        </div>

        {/* level-ups + goo summary */}
        <div className="mt-3 space-y-1 text-sm">
          {totalLevels > 0 && (
            <div className="text-cy tabular">היצורים עלו {totalLevels} רמות</div>
          )}
          {result.gooFromDupes > 0 && (
            <div className="text-pop tabular">+{formatGoo(result.gooFromDupes)} גּוּ מכפילויות</div>
          )}
          <div className="text-bone/50 tabular">עלות: {formatGoo(result.spent)} גּוּ</div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="btn mt-4 w-full bg-cy py-3 text-xl text-void"
        >
          יֵשׁ!
        </button>
      </div>
    </div>
  );
}
