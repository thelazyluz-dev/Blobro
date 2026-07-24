// Achievements overlay — goals + progress + rewards. Achievements auto-claim
// (store.syncAchievements); this shows state. To avoid a giant wall, it lists
// every completed achievement plus the next unfinished goal in each category,
// so there's always a visible next target.

import { useMemo } from 'react';
import { achievements, progressValue, starBonusFor, type AchievementContext } from '../game/achievements';
import { formatGoo } from '../game/format';
import { useGame } from '../store';

export function AchievementsButton() {
  const setOpen = useGame((s) => s.setAchievementsOpen);
  const count = useGame((s) => s.achievements.length);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="הישגים"
      className="absolute end-3 top-3 z-30 flex h-11 items-center gap-1 rounded-full bg-black/40 px-3 ring-1 ring-hairline active:scale-90"
    >
      <span className="text-lg">🏆</span>
      <span className="font-display text-sm text-pop tabular">{count}</span>
    </button>
  );
}

export function AchievementsOverlay() {
  const open = useGame((s) => s.achievementsOpen);
  const setOpen = useGame((s) => s.setAchievementsOpen);
  const characters = useGame((s) => s.characters);
  const lifetimeGoo = useGame((s) => s.lifetimeGoo);
  const totalHatches = useGame((s) => s.totalHatches);
  const clicks = useGame((s) => s.clicks);
  const bonusesCollected = useGame((s) => s.bonusesCollected);
  const claimed = useGame((s) => s.achievements);

  const ctx: AchievementContext = useMemo(
    () => ({
      collectionCount: Object.keys(characters).length,
      shinyCount: Object.values(characters).filter((c) => c?.shiny).length,
      lifetimeGoo,
      totalHatches,
      clicks,
      bonusesCollected,
    }),
    [characters, lifetimeGoo, totalHatches, clicks, bonusesCollected],
  );

  // Completed + the next unfinished goal per category.
  const shown = useMemo(() => {
    const claimedSet = new Set(claimed);
    const nextSeen = new Set<string>();
    return achievements.filter((a) => {
      if (claimedSet.has(a.id)) return true;
      if (nextSeen.has(a.kind)) return false;
      nextSeen.add(a.kind);
      return true;
    });
  }, [claimed]);

  if (!open) return null;

  const claimedSet = new Set(claimed);
  const starPct = Math.round(starBonusFor(claimed) * 100);

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
          {claimed.length} הושגו · בּוֹנוּס פְּעִיל +{starPct}% לכל הגּוּ
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto pe-1">
          {shown.map((a) => {
            const done = claimedSet.has(a.id);
            const value = progressValue(a, ctx);
            const pct = Math.min(100, (value / a.goal) * 100);
            return (
              <div
                key={a.id}
                className={`rounded-2xl p-3 ring-1 ${done ? 'bg-pop/15 ring-pop/40' : 'bg-black/25 ring-hairline'}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-2xl ${done ? '' : 'opacity-40 grayscale'}`}>{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${done ? 'text-bone' : 'text-bone/70'}`}>{a.nameHe}</div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                      <div
                        className={`h-full rounded-full ${done ? 'bg-pop' : 'bg-cy'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-cy">
                      פרס: +{Math.round(a.starReward * 100)}% הכנסה · {formatGoo(a.gooReward)} גּוּ
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-bone/50 tabular">
                    {done ? '✓' : `${formatGoo(value)}/${formatGoo(a.goal)}`}
                  </div>
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
