// The Hall of Champions — the endgame roll of honour. Everyone who reached the
// decillion victory summit (see EG-2 / winDecillion), earliest first: the
// pioneers head the list and their place never shifts as newcomers arrive.
//
// Hosted as one tab inside ProgressOverlay (see ProgressOverlay.tsx), so this
// file owns no backdrop/close button of its own. `active` tells it whether its
// tab is on screen — the fetch keys off that.
//
// Privacy: the board shows a chosen nickname only (never a real name); an
// account that never picked a leaderboard nickname shows a kid-safe default,
// exactly as the server returns it.

import { useEffect, useState } from 'react';
import { playerName } from '../net/leaderboard';
import { fetchChampions, hasGlobalLeaderboard, type ChampionEntry } from '../net/leaderboard';

// Short Hebrew date for "won on" — day + month, plus year so an old champion
// reads unambiguously. Falls back to nothing if the environment lacks Intl.
function wonOnHe(ms: number): string {
  try {
    return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
  } catch {
    return '';
  }
}

function rankBadgeClass(i: number): string {
  return i === 0
    ? 'bg-pop text-void'
    : i === 1
      ? 'bg-bone/70 text-void'
      : i === 2
        ? 'bg-hot text-bone'
        : 'bg-black/40 text-bone/70';
}

export function ChampionsContent({ active }: { active: boolean }) {
  const global = hasGlobalLeaderboard();
  const [rows, setRows] = useState<ChampionEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const savedName = global ? playerName() : '';

  useEffect(() => {
    if (!active || !global) return;
    let alive = true;
    setLoading(true);
    fetchChampions()
      .then((r) => {
        if (alive) setRows(r);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active, global]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-center text-xs text-bone/50">👑 מִי שֶׁהִגִּיעַ לְדֶצִילְיוֹן וְנִצַּח אֶת הַמִּשְׂחָק</div>

      <div className="mb-1 mt-3 flex items-center gap-3 px-3 text-[11px] font-bold text-bone/55">
        <span className="w-8 shrink-0 text-center">#</span>
        <span className="flex-1">שֵׁם</span>
        <span className="shrink-0">מָתַי נִצַּח</span>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-1">
        {!global && <div className="py-6 text-center text-sm text-bone/50">הֵיכַל הָאַלּוּפִים זָמִין רַק עִם חִבּוּר לָרֶשֶׁת.</div>}
        {global && loading && !rows && <div className="py-6 text-center text-sm text-bone/50">טוֹעֵן…</div>}
        {global && rows && rows.length === 0 && !loading && (
          <div className="py-8 text-center text-sm leading-relaxed text-bone/50">
            עוֹד אַף אֶחָד לֹא הִגִּיעַ לַדֶּצִילְיוֹן.
            <br />
            תִּהְיֶה הָאַלּוּף הָרִאשׁוֹן! 👑
          </div>
        )}
        {global &&
          (rows ?? []).map((r, i) => {
            const isMe = !!savedName && r.name === savedName;
            const when = wonOnHe(r.wonAt);
            return (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                  isMe ? 'bg-cy/15 ring-2 ring-cy' : 'bg-black/25 ring-1 ring-hairline'
                }`}
              >
                <span className={`flex h-7 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm ${rankBadgeClass(i)}`}>
                  {r.rank}
                </span>
                <span className={`min-w-0 flex-1 truncate ${isMe ? 'text-cy' : 'text-bone'}`}>
                  <span className="me-1">👑</span>
                  {r.name}
                </span>
                {when && (
                  <span className="shrink-0 text-[11px] text-bone/55 tabular" dir="ltr">
                    {when}
                  </span>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
