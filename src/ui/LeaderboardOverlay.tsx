// Global click/goo leaderboard content. Toggle between two boards: leaders by
// physical taps, and leaders by total goo. Shows the top 10 plus YOUR own row
// and rank pinned below — even at #5000. Your nickname is chosen once (the
// welcome / a first-time join here); it isn't edited from this screen, and
// there's no counter-reset here — starting over is the "new game" reset in
// Settings.
//
// Privacy: only a nickname + scores are sent. A random per-device recovery
// code identifies the row on the server and is never shown or returned. No PII.
//
// Hosted as one tab inside ProgressOverlay (see ProgressOverlay.tsx), so this
// file owns no backdrop/close button of its own. `active` tells it whether its
// tab is the one currently on screen — the fetch-on-open effects key off that
// instead of an overlay's own open flag.

import { useEffect, useMemo, useState } from 'react';
import { leaderboardNameMaxLen } from '../game/balance';
import { formatExact, formatGoo } from '../game/format';
import { isCleanNickname } from '../game/profanity';
import {
  fetchTop,
  hasGlobalLeaderboard,
  markNicknameAsked,
  playerName,
  submitScore,
  type GlobalEntry,
  type Metric,
  type SubmitResult,
} from '../net/leaderboard';
import { useGame } from '../store';

const TOP_N = 10;

const METRIC_LABEL: Record<Metric, string> = { clicks: 'לְחִיצוֹת 👆', goo: 'גּוּ 🟢', cpm: 'לְחִיצוֹת לְדַקָּה ⚡' };
// One contextual line under the metric toggle: kids can't tell what each board
// ranks by (goo held now vs. earned ever, a per-minute record vs. a total), so
// the line names exactly what the SELECTED board measures.
const METRIC_HELP: Record<Metric, string> = {
  clicks: 'כַּמָּה לְחִיצוֹת לָחַצְתָּ סַךְ הַכֹּל — אֵי פַּעַם',
  goo: 'כַּמָּה גּוּ יֵשׁ לְךָ עַכְשָׁיו בַּיָּד (יוֹרֵד כְּשֶׁקּוֹנִים)',
  cpm: 'שִׂיא הַלְּחִיצוֹת הַיְּדָנִיּוֹת שֶׁלְּךָ בְּדַקָּה אַחַת',
};
const fmt = (m: Metric, v: number) => (m === 'goo' ? formatGoo(v) : formatExact(v));

function rankBadgeClass(i: number): string {
  return i === 0
    ? 'bg-pop text-void'
    : i === 1
      ? 'bg-bone/70 text-void'
      : i === 2
        ? 'bg-hot text-bone'
        : 'bg-black/40 text-bone/70';
}

export function LeaderboardContent({ active }: { active: boolean }) {
  const clicks = useGame((s) => s.clicks);
  const goo = useGame((s) => s.goo);
  const bestCpm = useGame((s) => s.bestCpm);
  const leaderboard = useGame((s) => s.leaderboard);

  const global = hasGlobalLeaderboard();
  const [metric, setMetric] = useState<Metric>('clicks');
  const [remote, setRemote] = useState<GlobalEntry[] | null>(null);
  const [myRanks, setMyRanks] = useState<SubmitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [joinName, setJoinName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const savedName = global ? playerName() : '';
  const joined = !!savedName;

  // On open: if already joined, push current scores so both ranks are fresh.
  useEffect(() => {
    if (!active || !global || !joined) return;
    let alive = true;
    (async () => {
      const s = useGame.getState();
      const res = await submitScore(savedName, s.clicks, s.goo);
      if (alive && res) setMyRanks(res);
    })();
    return () => {
      alive = false;
    };
  }, [active, global, joined, savedName]);

  // On open + whenever the metric toggles: load that board's top list.
  useEffect(() => {
    if (!active || !global) return;
    let alive = true;
    setLoading(true);
    setRemote(null); // drop stale rows so we never format one metric's values as the other's
    fetchTop(metric, TOP_N)
      .then((rows) => {
        if (alive) setRemote(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active, global, metric]);

  // Local (no-backend) fallback: just the live current run, sorted in.
  const localRows = useMemo(() => {
    const base = leaderboard.map((e) => ({ name: e.name, clicks: e.clicks, you: false }));
    base.push({ name: 'אַתָּה (עכשיו)', clicks, you: true });
    return base.sort((a, b) => b.clicks - a.clicks);
  }, [leaderboard, clicks]);

  const myRank = myRanks ? myRanks[metric] : null;
  // clicks and cpm are records — the freshest of server/live wins. goo is the
  // CURRENT balance (owner decision: the board shows what you hold, so
  // spending is a real trade-off), and the live number is always the truth —
  // the server's copy is just an older snapshot of the same thing.
  const myValue =
    metric === 'goo' ? goo : metric === 'cpm' ? Math.max(myRank?.best ?? 0, bestCpm) : Math.max(myRank?.best ?? 0, clicks);

  const join = async () => {
    const clean = joinName.trim();
    if (!clean) return;
    if (!isCleanNickname(clean)) {
      setJoinError('הַכִּנּוּי לֹא מַתְאִים — נַסּוּ אַחֵר 🙂');
      return;
    }
    setJoining(true);
    const s = useGame.getState();
    const res = await submitScore(clean, s.clicks, s.goo);
    markNicknameAsked();
    if (res) setMyRanks(res);
    const top = await fetchTop(metric, TOP_N);
    setRemote(top);
    setJoining(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-center text-xs text-bone/50">
        {global ? '🌍 טַבְלָה עוֹלָמִית — כֻּלָּם רוֹאִים' : 'נשמר במכשיר בלבד'}
      </div>

      {/* Metric toggle: taps, held goo, and the taps-per-minute record. */}
      {global && (
        <div className="mb-3 mt-2 flex gap-1 rounded-full bg-black/30 p-1 ring-1 ring-hairline">
          {(['clicks', 'goo', 'cpm'] as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`flex-1 rounded-full py-1.5 text-sm font-bold transition ${
                metric === m ? 'bg-cy text-void' : 'text-bone/60'
              }`}
            >
              {m === 'clicks' ? '👆 לְחִיצוֹת' : m === 'goo' ? '🟢 גּוּ' : '⚡ לְדַקָּה'}
            </button>
          ))}
        </div>
      )}

      {global && (
        <div className="mb-1 text-center text-[11px] leading-relaxed text-bone/45">{METRIC_HELP[metric]}</div>
      )}

      <div className="mb-1 mt-2 flex items-center gap-3 px-3 text-[11px] font-bold text-bone/55">
        <span className="w-8 shrink-0 text-center">#</span>
        <span className="flex-1">שֵׁם</span>
        <span className="shrink-0">{global ? METRIC_LABEL[metric] : METRIC_LABEL.clicks}</span>
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
                  <span className={`flex h-7 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm ${rankBadgeClass(i)}`}>
                    {i + 1}
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${isMe ? 'text-cy' : 'text-bone'}`}>{r.name}</span>
                  <span className="shrink-0 font-display text-pop tabular" dir="ltr">
                    {fmt(metric, r.score)}
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
              <span className={`flex h-7 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm ${rankBadgeClass(i)}`}>
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

      {/* Your own pinned row — visible even at #5000, unless you're already in
          the top list above. */}
      {joined && !(myRank && myRank.rank <= TOP_N) && (
        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-cy/15 px-3 py-2 ring-2 ring-cy">
          <span className="flex h-7 shrink-0 items-center justify-center rounded-full bg-cy px-2 font-display text-sm text-void">
            {myRank ? `#${myRank.rank}` : '—'}
          </span>
          <span className="min-w-0 flex-1 truncate text-cy">אַתָּה ({savedName})</span>
          <span className="shrink-0 font-display text-pop tabular" dir="ltr">
            {fmt(metric, myValue)}
          </span>
        </div>
      )}
      {joined && myRank && myRank.rank > 0 && (myRanks?.total ?? 0) > 0 && (
        <div className="mt-1 text-center text-[11px] text-bone/45">
          מְקוֹם {myRank.rank} מִתּוֹךְ {myRanks?.total} שַׂחְקָנִים
        </div>
      )}

      {/* First-time join (only when no nickname yet). Not an edit box — once you
          have a name it lives on until a "new game" reset. */}
      {global && !joined && (
        <>
          <div className="mt-3 text-center text-xs text-cy">בְּחַר כִּנּוּי כְּדֵי לְהִצְטָרֵף לַטַּבְלָה! 👇</div>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={joinName}
              onChange={(e) => {
                setJoinName(e.target.value);
                if (joinError) setJoinError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              maxLength={leaderboardNameMaxLen}
              placeholder="הכניסו כינוי…"
              className="min-w-0 flex-1 rounded-2xl bg-black/40 px-3 py-2 text-bone outline-none ring-1 ring-hairline placeholder:text-bone/40 focus:ring-2 focus:ring-cy"
            />
            <button
              type="button"
              onClick={join}
              disabled={joining}
              className="btn shrink-0 bg-goo px-4 py-2 text-void disabled:opacity-60"
            >
              {joining ? '…' : 'הִצְטָרֵף!'}
            </button>
          </div>
          {joinError && <p className="mt-1 text-center text-sm text-hot">{joinError}</p>}
        </>
      )}
    </div>
  );
}
