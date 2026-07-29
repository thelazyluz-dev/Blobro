// Summary shown after a bulk hatch (×10 / all): every creature that came out,
// grouped and celebrated. Plays a sound + confetti + speaks the rarest name.

import { useEffect, useMemo } from 'react';
import { playAchievement, playBonus } from '../audio/sfx';
import { speakName } from '../audio/speech';
import { charactersById } from '../game/characters';
import { creatureContribution } from '../game/economy';
import { formatGoo } from '../game/format';
import type { CharId, Rarity } from '../game/types';
import { selectMods, useGame } from '../store';
import { CharacterBody } from './characters';
import { haptic } from './haptics';
import { rarityColor, rarityLabelHe } from './rarity';

const RARITY_ORDER: Rarity[] = ['legendary', 'rare', 'uncommon', 'common'];
const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3 };

export function MultiHatchResult() {
  const result = useGame((s) => s.multiHatchResult);
  const dismiss = useGame((s) => s.dismissMultiHatch);
  const m = useGame(selectMods);

  // Every creature pulled, rarest first, then by count.
  const pulled = useMemo(() => {
    if (!result) return [];
    return (Object.keys(result.charTally) as CharId[])
      .map((id) => ({ id, count: result.charTally[id] ?? 0, rarity: charactersById[id].rarity }))
      .sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.count - a.count);
  }, [result]);

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
    // Announce the rarest creature by name.
    if (pulled[0]) {
      window.setTimeout(() => speakName(charactersById[pulled[0].id].nameHe, useGame.getState().muted), 360);
    }
  }, [result, pulled]);

  if (!result) return null;

  const totalLevels = Object.values(result.levelUps).reduce((a, b) => a + (b ?? 0), 0);
  const newSet = new Set(result.newIds);

  // Extra passive income this batch bought — each creature's true goo/sec gain
  // (all automation multipliers folded in) from the levels or first appearance
  // it got here, so the payoff matches the rate shown elsewhere.
  const incomeGained = (Object.keys(result.charTally) as CharId[]).reduce((sum, id) => {
    const held = result.owned[id];
    if (!held) return sum;
    const rarity = charactersById[id].rarity;
    const gainedLevels = (result.levelUps[id] ?? 0) + (newSet.has(id) ? 1 : 0);
    const prevLevel = held.level - gainedLevels;
    const before = prevLevel >= 1 ? creatureContribution(rarity, { level: prevLevel, evolution: held.evolution }, m) : 0;
    return sum + (creatureContribution(rarity, held, m) - before);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6">
      <div
        className="surface anim-pop-in flex max-h-[88vh] w-full max-w-sm flex-col rounded-3xl p-5 text-center"
        style={{ boxShadow: '0 0 0 2px #FFD84D, 0 24px 60px -20px #000' }}
      >
        <h2 className="font-display text-3xl text-bone">בָּקַעְתָּ {result.count} בֵּיצִים!</h2>

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

        {/* every creature that came out */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          <div className="mb-2 text-sm text-bone/70">כָּל הַיְצוּרִים שֶׁנִּפְתְּחוּ</div>
          <div className="grid grid-cols-3 gap-2 pe-1">
            {pulled.map(({ id, count }) => {
              const def = charactersById[id];
              const isNew = newSet.has(id);
              return (
                <div
                  key={id}
                  className="relative flex flex-col items-center rounded-2xl p-1"
                  style={{ boxShadow: `inset 0 0 0 2px ${rarityColor[def.rarity]}` }}
                >
                  {isNew && (
                    <span className="absolute start-1 top-1 rounded-full bg-goo px-1.5 text-[9px] font-bold text-void">
                      חָדָשׁ
                    </span>
                  )}
                  <span className="absolute end-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] font-bold text-bone tabular">
                    ×{count}
                  </span>
                  <CharacterBody id={id} className="h-12 w-12" />
                  <span className="mt-1 max-w-full truncate px-1 text-[10px] text-bone/80">{def.nameHe}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* summary numbers */}
        <div className="mt-3 space-y-1 text-sm">
          {totalLevels > 0 && <div className="text-cy tabular">היצורים עלו {totalLevels} רמות</div>}
          {incomeGained > 0 && (
            <div className="text-goo tabular">+{formatGoo(incomeGained)} גּוּ/שנייה נוֹסָף</div>
          )}
          {result.spent > 0 && (
            <div className="text-bone/50 tabular">עלות: {formatGoo(result.spent)} גּוּ</div>
          )}
        </div>

        <button type="button" onClick={dismiss} className="btn mt-4 w-full bg-cy py-3 text-xl text-void">
          יֵשׁ!
        </button>
      </div>
    </div>
  );
}
