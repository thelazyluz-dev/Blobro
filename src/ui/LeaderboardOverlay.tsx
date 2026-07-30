// Click leaderboard. When a backend is configured (src/config.ts →
// LEADERBOARD_API) this shows the GLOBAL table everyone shares: the top 10, plus
// YOUR own row and rank pinned below — even if you're #5000. First-timers pick a
// nickname and join instantly. Without a backend it falls back to an on-device
// list. Either way it's sorted by taps.
//
// Privacy: only a nickname + click count are ever sent. A random per-device
// recovery code (localStorage) identifies the row on the server and is never
// shown or returned. No email, no real name, no location — safe for kids.

import { useEffect, useMemo, useState } from 'react';
import { leaderboardNameMaxLen } from '../game/balance';
import { formatExact } from '../game/format';
import {
  fetchRank,
  fetchTop,
  hasGlobalLeaderboard,
  playerName,
  submitScore,
  type GlobalEntry,
  type RankInfo,
} from '../net/leaderboard';
import { useGame } from '../store';

const TOP_N = 10;

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

function rankBadgeClass(i: number): string {
  return i === 0
    ? 'bg-pop text-void'
    : i === 1
      ? 'bg-bone/70 text-void'
      : i === 2
        ? 'bg-hot text-bone'
        : 'bg-black/40 text-bone/70';
}

export function LeaderboardOverlay() {
  const open = useGame((s) => s.leaderboardOpen);
  const setOpen = useGame((s) => s.setLeaderboardOpen);
  const clicks = useGame((s) => s.clicks);
  const leaderboard = useGame((s) => s.leaderboard);
  const addToLeaderboard = useGame((s) => s.addToLeaderboard);
  const resetClicks = useGame((s) => s.resetClicks);
  const [name, setName] = useState(() => playerName());

  const global = hasGlobalLeaderboard();
  const [remote, setRemote] = useState<GlobalEntry[] | null>(null);
  const [myRank, setMyRank] = useState<RankInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // On open (global): refresh the top list, and if the player already joined,
  // auto-submit their current taps so their rank is always up to date.
  useEffect(() => {
    if (!open || !global) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const saved = playerName();
      let rank: RankInfo | null = null;
      if (saved) {
        rank = (await submitScore(saved, useGame.getState().clicks)) ?? (await fetchRank());
      }
      const top = await fetchTop(TOP_N);
      if (!alive) return;
      setMyRank(rank);
      setRemote(top);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [open, global]);

  // Local-only ranked rows (no backend): the old on-device behaviour.
  const localRows = useMemo(() => {
    const base = leaderboard.map((e) => ({ name: e.name, clicks: e.clicks, you: false }));
    base.push({ name: 'אַתָּה (עכשיו)', clicks, you: true });
    return base.sort((a, b) => b.clicks - a.clicks);
  }, [leaderboard, clicks]);

  if (!open) return null;

  const savedName = playerName();
  const joined = global && !!savedName; // already on the global table
  // What to show as "your" score: whichever is higher of your submitted best and
  // your live tap count (you may have kept tapping since the last submit).
  const myScore = Math.max(myRank?.score ?? 0, clicks);

  const submit = async () => {
    const clean = name.trim();
    if (!clean) return;
    addToLeaderboard(clean); // keep a local copy too
    setName(clean);
    if (!global) return;
    setSaving(true);
    const rank = await submitScore(clean, useGame.getState().clicks);
    const top = await fetchTop(TOP_N);
    setMyRank(rank);
    setRemote(top);
    setSaving(false);
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
        <div className="mb-2 text-center text-xs text-bone/50">
          {global ? '🌍 טַבְלָה עוֹלָמִית — כֻּלָּם רוֹאִים' : 'נשמר במכשיר בלבד'}
        </div>

        <div className="mb-1 flex items-center gap-3 px-3 text-[11px] font-bold text-bone/55">
          <span className="w-7 shrink-0 text-center">#</span>
          <span className="flex-1">שֵׁם</span>
          <span className="shrink-0">לְחִיצוֹת 👆</span>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-1">
          {global ? (
            <>
              {loading && !remote && <div className="py-6 text-center text-sm text-bone/50">טוֹעֵן…</div>}
              {remote && remote.length === 0 && !loading && (
                <div className="py-6 text-center text-sm text-bone/50">עוֹד אַף אֶחָד לֹא בַּטַּבְלָה — תִּהְיֶה הָרִאשׁוֹן! 🥇</div>
              )}
              {(remote ?? []).map((r, i) => {
                const isMe = joined && myRank?.rank === i + 1;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                      isMe ? 'bg-cy/15 ring-2 ring-cy' : 'bg-black/25 ring-1 ring-hairline'
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-sm ${rankBadgeClass(i)}`}>
                      {i + 1}
                    </span>
                    <span className={`min-w-0 flex-1 truncate ${isMe ? 'text-cy' : 'text-bone'}`}>{r.name}</span>
                    <span className="shrink-0 font-display text-pop tabular" dir="ltr">
                      {formatExact(r.score)}
                    </span>
                  </div>
                );
              })}
            </>
          ) : (
            localRows.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                  r.you ? 'bg-cy/15 ring-2 ring-cy' : 'bg-black/25 ring-1 ring-hairline'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-sm ${rankBadgeClass(i)}`}>
                  {i + 1}
                </span>
                <span className={`min-w-0 flex-1 truncate ${r.you ? 'text-cy' : 'text-bone'}`}>{r.name}</span>
                <span className="shrink-0 font-display text-pop tabular" dir="ltr">
                  {formatExact(r.clicks)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Your own pinned row — always visible, even if you're #5000. Only when
            you've joined and you're NOT already shown inside the top list. */}
        {joined && !(myRank && myRank.rank <= TOP_N) && (
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-cy/15 px-3 py-2 ring-2 ring-cy">
            <span className="flex h-7 shrink-0 items-center justify-center rounded-full bg-cy px-2 font-display text-sm text-void">
              {myRank ? `#${myRank.rank}` : '—'}
            </span>
            <span className="min-w-0 flex-1 truncate text-cy">אַתָּה ({savedName})</span>
            <span className="shrink-0 font-display text-pop tabular" dir="ltr">
              {formatExact(myScore)}
            </span>
          </div>
        )}
        {joined && myRank && myRank.total > 0 && (
          <div className="mt-1 text-center text-[11px] text-bone/45">מְקוֹם {myRank.rank} מִתּוֹךְ {myRank.total} שַׂחְקָנִים</div>
        )}

        {/* Nickname entry — "join" for first-timers, "update" once you have one. */}
        {global && !joined && (
          <div className="mt-3 text-center text-xs text-cy">בְּחַר כִּנּוּי כְּדֵי לְהִצְטָרֵף לַטַּבְלָה! 👇</div>
        )}
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            maxLength={leaderboardNameMaxLen}
            placeholder="הכניסו כינוי…"
            className="min-w-0 flex-1 rounded-2xl bg-black/40 px-3 py-2 text-bone outline-none ring-1 ring-hairline placeholder:text-bone/40 focus:ring-2 focus:ring-cy"
          />
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="btn shrink-0 bg-goo px-4 py-2 text-void disabled:opacity-60"
          >
            {saving ? '…' : joined ? 'עַדְכֵּן' : global ? 'הִצְטָרֵף!' : 'שְׁמֹר'}
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
