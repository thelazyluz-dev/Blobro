// Click leaderboard. When a backend is configured (src/config.ts →
// LEADERBOARD_API) this shows the GLOBAL table everyone shares; otherwise it
// falls back to an on-device list. Either way it's a live table sorted by taps,
// with the current run shown live and a nickname box.
//
// Privacy: only a nickname + click count are ever sent. A random per-device
// recovery code (localStorage) identifies the row on the server and is never
// shown or returned. No email, no real name, no location — safe for kids.

import { useEffect, useMemo, useState } from 'react';
import { leaderboardNameMaxLen } from '../game/balance';
import { formatExact } from '../game/format';
import {
  fetchTop,
  hasGlobalLeaderboard,
  playerName,
  submitScore,
  type GlobalEntry,
} from '../net/leaderboard';
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
  const [name, setName] = useState(() => playerName());

  const global = hasGlobalLeaderboard();
  // Global rows once fetched; null = not loaded / failed → use local list.
  const [remote, setRemote] = useState<GlobalEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch the global top each time the panel opens.
  useEffect(() => {
    if (!open || !global) return;
    let alive = true;
    setLoading(true);
    fetchTop(50)
      .then((rows) => {
        if (alive) setRemote(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, global]);

  // Build the ranked list: global rows if we have them, else the local list.
  // Always splice in a live "you (now)" row for the current run.
  const rows = useMemo(() => {
    const base =
      global && remote
        ? remote.map((e) => ({ name: e.name, clicks: e.score, you: false }))
        : leaderboard.map((e) => ({ name: e.name, clicks: e.clicks, you: false }));
    base.push({ name: 'אַתָּה (עכשיו)', clicks, you: true });
    return base.sort((a, b) => b.clicks - a.clicks);
  }, [global, remote, leaderboard, clicks]);

  if (!open) return null;

  const submit = async () => {
    const clean = name.trim();
    if (!clean) return;
    addToLeaderboard(clean); // always keep a local copy
    setName(clean);
    if (global) {
      setSaving(true);
      await submitScore(clean, clicks);
      const fresh = await fetchTop(50);
      setRemote(fresh);
      setSaving(false);
    }
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
          {loading && !remote && (
            <div className="py-6 text-center text-sm text-bone/50">טוֹעֵן…</div>
          )}
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

        {/* nickname entry */}
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
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="btn shrink-0 bg-goo px-4 py-2 text-void disabled:opacity-60"
          >
            {saving ? '…' : 'שְׁמֹר'}
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
