// Achievements overlay — goals, progress, and hand-collected rewards. A finished
// badge is not auto-granted: it waits here as "ready to collect", and the player
// taps it to claim its permanent income star + goo grant. Ready badges sit on
// top, then the next goal per category, then the trophy shelf of claimed ones.

import { useMemo } from 'react';
import { playAchievement } from '../audio/sfx';
import { achievements, progressValue, starBonusFor } from '../game/achievements';
import { formatGoo } from '../game/format';
import { selectAchContext, selectClaimableIds, useGame } from '../store';
import { haptic } from './haptics';

export function AchievementsButton() {
  const setOpen = useGame((s) => s.setAchievementsOpen);
  const claimedCount = useGame((s) => s.achievements.length);
  const readyCount = useGame((s) => selectClaimableIds(s).size);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="הישגים"
      className={`absolute end-3 top-3 z-30 flex h-11 items-center gap-1 rounded-full bg-black/40 px-3 ring-1 active:scale-90 ${
        readyCount > 0 ? 'anim-breathe ring-pop' : 'ring-hairline'
      }`}
    >
      <span className="text-lg">🏆</span>
      <span className="font-display text-sm text-pop tabular">{claimedCount}</span>
      {readyCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-pop px-1 text-xs font-bold text-void tabular">
          {readyCount}
        </span>
      )}
    </button>
  );
}

export function AchievementsOverlay() {
  const open = useGame((s) => s.achievementsOpen);
  const setOpen = useGame((s) => s.setAchievementsOpen);
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

  if (!open) return null;

  const claimedSet = new Set(claimed);
  const starPct = Math.round(starBonusFor(claimed) * 100);
  const readyCount = claimableIds.size;

  const onClaim = (id: string) => {
    claimAchievement(id);
    const muted = useGame.getState().muted;
    playAchievement(muted);
    haptic([0, 30, 20, 40]);
    useGame.getState().triggerConfetti('stars');
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-6"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="surface anim-pop-in flex max-h-[86vh] w-full max-w-sm flex-col rounded-3xl p-5"
        style={{ boxShadow: '0 0 0 2px #FFD84D, 0 24px 60px -20px #000' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-1 text-center font-display text-3xl text-bone">🏆 הִשֵּׂגִים</div>
        <div className="mb-3 text-center text-sm text-goo">
          {claimed.length} נֶאֶסְפוּ · בּוֹנוּס פְּעִיל +{starPct}% לכל הגּוּ
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
            className="btn mb-3 w-full bg-pop py-2.5 text-base text-void"
          >
            אֱסוֹף הַכֹּל ({readyCount}) 🎁
          </button>
        )}

        <div className="flex flex-col gap-2 overflow-y-auto pe-1">
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
                    <div className="mt-1 text-[10px] text-cy">
                      פרס: +{Math.round(a.starReward * 100)}% הכנסה · {formatGoo(a.gooReward)} גּוּ
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

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn mt-4 w-full bg-cy py-3 text-lg text-void"
        >
          סְגוֹר
        </button>
      </div>
    </div>
  );
}
