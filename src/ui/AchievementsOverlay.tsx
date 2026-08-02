// Achievements content — goals, progress, and hand-collected rewards. A
// finished badge is not auto-granted: it waits here as "ready to collect", and
// the player taps it to claim its permanent income star + goo grant. Ready
// badges sit on top, then the next goal per category, then the trophy shelf
// of claimed ones. Hosted as one tab inside ProgressOverlay (see
// ProgressOverlay.tsx), so this file owns no backdrop/close button of its own.

import { useMemo } from 'react';
import { playAchievement } from '../audio/sfx';
import { achievements, progressValue, starBonusFor } from '../game/achievements';
import { formatGoo } from '../game/format';
import { selectAchContext, selectClaimableIds, useGame } from '../store';
import { haptic } from './haptics';

export function AchievementsContent() {
  const claimed = useGame((s) => s.achievements);
  const ctx = useGame(selectAchContext);
  const claimableIds = useGame(selectClaimableIds);
  const claimAchievement = useGame((s) => s.claimAchievement);
  const claimAll = useGame((s) => s.claimAllAchievements);

  // Ready-to-collect on top, then the next target per category, then claimed.
  const shown = useMemo(() => {
    const claimedSet = new Set(claimed);
    const ready = achievements.filter((a) => claimableIds.has(a.id));
    const nextSeen = new Set<string>();
    const next = achievements.filter((a) => {
      if (claimedSet.has(a.id) || claimableIds.has(a.id)) return false;
      if (nextSeen.has(a.kind)) return false;
      nextSeen.add(a.kind);
      return true;
    });
    const done = achievements.filter((a) => claimedSet.has(a.id));
    return [...ready, ...next, ...done];
  }, [claimed, claimableIds]);

  const claimedSet = new Set(claimed);
  const starPct = Math.round(starBonusFor(claimed) * 100);
  const starClaimedCount = achievements.filter((a) => a.starReward > 0 && claimedSet.has(a.id)).length;
  const readyCount = claimableIds.size;

  const onClaim = (id: string) => {
    claimAchievement(id);
    const muted = useGame.getState().muted;
    playAchievement(muted);
    haptic([0, 30, 20, 40]);
    useGame.getState().triggerConfetti('stars');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-goo/15 px-3 py-2 text-center ring-1 ring-goo/40">
        <div className="font-display text-2xl text-goo tabular">בּוֹנוּס פָּעִיל: +{starPct}%</div>
        <div className="text-[11px] text-bone/70">
          לְכָל הַהַכְנָסָה (לְחִיצוֹת + פָּסִיבִי) · מֵאִסּוּף וְאֶבּוֹלוּצְיָה שֶׁל יְצוּרִים
          {starClaimedCount > 0 ? ` (${starClaimedCount})` : ''}
        </div>
      </div>

      {readyCount > 1 && (
        <button
          type="button"
          onClick={() => {
            claimAll();
            const muted = useGame.getState().muted;
            playAchievement(muted);
            haptic([0, 40, 30, 60]);
            useGame.getState().triggerConfetti('confetti');
          }}
          className="btn w-full bg-pop py-2.5 text-base text-void"
        >
          אֱסוֹף הַכֹּל ({readyCount}) 🎁
        </button>
      )}

      <div className="flex flex-col gap-2">
        {shown.map((a) => {
          const done = claimedSet.has(a.id);
          const ready = claimableIds.has(a.id);
          const value = progressValue(a, ctx);
          const pct = Math.min(100, (value / a.goal) * 100);
          return (
            <div
              key={a.id}
              className={`rounded-2xl p-3 ring-1 ${
                ready
                  ? 'anim-breathe bg-pop/25 ring-pop'
                  : done
                    ? 'bg-pop/10 ring-pop/30'
                    : 'bg-black/25 ring-hairline'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`text-2xl ${done || ready ? '' : 'opacity-40 grayscale'}`}>{a.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${done || ready ? 'text-bone' : 'text-bone/70'}`}>{a.nameHe}</div>
                  {!ready && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                      <div
                        className={`h-full rounded-full ${done ? 'bg-pop' : 'bg-cy'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  <div className="mt-1 text-[11px]">
                    {a.starReward > 0 ? (
                      <span className="text-goo">⭐ +{Math.round(a.starReward * 100)}% הכנסה לתמיד</span>
                    ) : (
                      <span className="text-pop">💰 {formatGoo(a.gooReward)} גּוּ חַד־פַּעֲמִי</span>
                    )}
                  </div>
                </div>
                {ready ? (
                  <button
                    type="button"
                    onClick={() => onClaim(a.id)}
                    className="btn shrink-0 bg-goo px-4 py-2 text-sm font-bold text-void glow-goo"
                  >
                    קַבֵּל!
                  </button>
                ) : (
                  <div className="shrink-0 text-xs text-bone/50 tabular">
                    {done ? '✓' : `${formatGoo(value)}/${formatGoo(a.goal)}`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
