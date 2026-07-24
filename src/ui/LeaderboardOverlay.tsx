// Local, on-device click leaderboard (§ privacy: nothing here is ever uploaded —
// names + scores live only in this device's IndexedDB). A live table sorted by
// number of taps, with the current run shown live and a name-entry box.

import { useMemo, useState } from 'react';
import { leaderboardNameMaxLen } from '../game/balance';
import { formatExact } from '../game/format';
import { useGame } from '../store';

export function LeaderboardButton() {
  const setOpen = useGame((s) => s.setLeaderboardOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="טבלת מובילים"
      className="absolute end-3 top-16 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-lg ring-1 ring-hairline active:scale-90"
    >
      🏅
    </button>
  );
}

export function LeaderboardOverlay() {
  const open = useGame((s) => s.leaderboardOpen);
  const setOpen = useGame((s) => s.setLeaderboardOpen);
  const clicks = useGame((s) => s.clicks);
  const leaderboard = useGame((s) => s.leaderboard);
  const addToLeaderboard = useGame((s) => s.addToLeaderboard);
  const resetClicks = useGame((s) => s.resetClicks);
  const [name, setName] = useState('');

  // Merge the live current run into the ranked list.
  const rows = useMemo(() => {
    const list = leaderboard.map((e) => ({ ...e, you: false }));
    list.push({ name: 'אַתָּה (עכשיו)', clicks, you: true });
    return list.sort((a, b) => b.clicks - a.clicks);
  }, [leaderboard, clicks]);

  if (!open) return null;

  const submit = () => {
    if (!name.trim()) return;
    addToLeaderboard(name);
    setName('');
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
        <div className="text-center font-display text-3xl text-bone">🏅 טַבְלַת מוֹבִילִים</div>
        <div className="mb-3 text-center text-xs text-bone/50">לפי מספר לחיצות · נשמר במכשיר בלבד</div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-1">
          {rows.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                r.you ? 'bg-cy/15 ring-2 ring-cy' : 'bg-black/25 ring-1 ring-hairline'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-sm ${
                  i === 0 ? 'bg-pop text-void' : i === 1 ? 'bg-bone/70 text-void' : i === 2 ? 'bg-hot text-bone' : 'bg-black/40 text-bone/70'
                }`}
              >
                {i + 1}
              </span>
              <span className={`min-w-0 flex-1 truncate ${r.you ? 'text-cy' : 'text-bone'}`}>{r.name}</span>
              <span className="shrink-0 font-display text-pop tabular" dir="ltr">
                {formatExact(r.clicks)}
              </span>
            </div>
          ))}
        </div>

        {/* name entry — local only */}
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            maxLength={leaderboardNameMaxLen}
            placeholder="הכניסו כינוי…"
            className="min-w-0 flex-1 rounded-2xl bg-black/40 px-3 py-2 text-bone outline-none ring-1 ring-hairline placeholder:text-bone/40 focus:ring-2 focus:ring-cy"
          />
          <button type="button" onClick={submit} className="btn shrink-0 bg-goo px-4 py-2 text-void">
            שְׁמֹר
          </button>
        </div>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={resetClicks}
            className="btn flex-1 bg-black/30 py-2 text-sm text-bone ring-1 ring-hairline"
          >
            שַׂחְקָן חָדָשׁ (אפס מונה)
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn flex-1 bg-cy py-2 text-void">
            סְגוֹר
          </button>
        </div>
      </div>
    </div>
  );
}
