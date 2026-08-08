// "My Progress" — one modal, three tabs: stats, achievements, leaderboard.
// Replaces three separate top-bar buttons/overlays with one destination for
// "how am I doing", now that account/sound/reset have moved to Settings.
//
// The button keeps the achievements affordance from the old AchievementsButton
// (breathing ring + claim-count badge) — a claimable badge is a real "you have
// something to collect" signal and must survive this refactor. Opening while
// something is claimable jumps straight to the achievements tab so the player
// doesn't have to hunt for it.

import { selectClaimableIds, useGame, type ProgressTab } from '../store';
import { AchievementsContent } from './AchievementsOverlay';
import { ChampionsContent } from './ChampionsOverlay';
import { GroupsContent } from './GroupsOverlay';
import { LeaderboardContent } from './LeaderboardOverlay';
import { StatsContent } from './StatsOverlay';

const TABS: Array<{ id: ProgressTab; label: string }> = [
  { id: 'stats', label: 'סְטָטִיסְטִיקוֹת' },
  { id: 'achievements', label: 'הִישֵּׂגִים' },
  { id: 'leaderboard', label: 'טַבְלָה' },
  { id: 'groups', label: '👥 קְבוּצוֹת' },
  { id: 'champions', label: '👑 אַלּוּפִים' },
];

export function ProgressButton() {
  const setOpen = useGame((s) => s.setProgressOpen);
  const claimedCount = useGame((s) => s.achievements.length);
  const readyCount = useGame((s) => selectClaimableIds(s).size);

  return (
    <button
      type="button"
      onClick={() => setOpen(true, 'leaderboard')}
      aria-label="ההתקדמות שלי"
      className={`flex h-11 shrink-0 items-center gap-1 rounded-full bg-black/40 px-3 ring-1 active:scale-90 ${
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

export function ProgressOverlay() {
  const open = useGame((s) => s.progressOpen);
  const setOpen = useGame((s) => s.setProgressOpen);
  const tab = useGame((s) => s.progressTab);
  const setTab = useGame((s) => s.setProgressTab);

  if (!open) return null;

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
        <div className="mb-3 text-center font-display text-3xl text-bone">🏆 הַהִתְקַדְּמוּת שֶׁלִּי</div>

        {/* h-11 per tab (not just the row) — a short pill row here would read fine
            visually but land under the 44px touch-target minimum. Five tabs no
            longer fit a 360px-wide sheet, so the ROW scrolls sideways instead of
            squeezing: each pill keeps its natural width (shrink-0, no wrap) and
            still grows to fill the row when there IS room. */}
        <div className="mb-3 flex gap-1 overflow-x-auto rounded-full bg-black/30 p-1 ring-1 ring-hairline">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex h-11 flex-1 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2 text-xs font-bold transition ${
                tab === t.id ? 'bg-cy text-void' : 'text-bone/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {tab === 'stats' && (
            <div className="min-h-0 flex-1 overflow-y-auto pe-1">
              <StatsContent />
            </div>
          )}
          {tab === 'achievements' && (
            <div className="min-h-0 flex-1 overflow-y-auto pe-1">
              <AchievementsContent />
            </div>
          )}
          {tab === 'leaderboard' && <LeaderboardContent active={open && tab === 'leaderboard'} />}
          {tab === 'groups' && <GroupsContent active={open && tab === 'groups'} />}
          {tab === 'champions' && <ChampionsContent active={open && tab === 'champions'} />}
        </div>

        <button type="button" onClick={() => setOpen(false)} className="btn mt-4 w-full bg-cy py-3 text-lg text-void">
          סְגוֹר
        </button>
      </div>
    </div>
  );
}
