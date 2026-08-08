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

        {/* h-11 per tab (not just the row) — a short pill row here would land
            under the 44px touch-target minimum. Five tabs can't fit one row on a
            360px sheet, and a sideways-scrolling row hid tabs off-screen (a kid
            never discovers a tab they can't see) and clipped pills at the edge.
            So: a fixed TWO-ROW grid — three tabs up, two down, everything always
            visible, nothing scrolls. grid-cols-6 with 2/2/2 + 3/3 spans keeps
            both rows perfectly balanced. */}
        <div className="mb-3 grid grid-cols-6 gap-1 rounded-2xl bg-black/30 p-1 ring-1 ring-hairline">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex h-11 items-center justify-center whitespace-nowrap rounded-full px-1 text-xs font-bold transition ${
                i < 3 ? 'col-span-2' : 'col-span-3'
              } ${tab === t.id ? 'bg-cy text-void' : 'text-bone/60'}`}
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
