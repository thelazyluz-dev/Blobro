// Groups — private friend/family/class boards. One tab inside ProgressOverlay
// (see ProgressOverlay.tsx), so this file owns no backdrop/close button of its
// own; `active` tells it whether its tab is on screen and the fetches key off
// that, like the leaderboard and champions tabs do.
//
// Privacy: a group's board is visible to its members only, and a group is
// reachable only via its code/link — there is no public group directory. Rows
// show board nicknames (never real names), same as the global leaderboard.

import { useEffect, useState } from 'react';
import { formatExact, formatGoo } from '../game/format';
import { isCleanNickname } from '../game/profanity';
import {
  createGroup,
  fetchGroupBoard,
  fetchMyGroups,
  groupInviteLink,
  groupNameMaxLen,
  groupNameMinLen,
  hasGroupsBackend,
  joinGroup,
  leaveGroup,
  type GroupBoard,
  type GroupError,
  type GroupId,
  type GroupInfo,
  type GroupMetric,
} from '../net/groups';
import { useGame } from '../store';
import { haptic } from './haptics';

const METRIC_LABEL: Record<GroupMetric, string> = { clicks: 'לְחִיצוֹת 👆', goo: 'גּוּ 🟢', cpm: 'לְחִיצוֹת לְדַקָּה ⚡' };
const fmt = (m: GroupMetric, v: number) => (m === 'goo' ? formatGoo(v) : formatExact(v));

// Every refusal the server can name, in kid-friendly Hebrew.
const ERROR_TEXT: Record<GroupError, string> = {
  full: 'הַקְּבוּצָה מְלֵאָה 😢',
  'not-found': 'קוֹד לֹא נָכוֹן — בִּדְקוּ שׁוּב',
  'too-many-groups': 'אַתֶּם כְּבָר בְּ־10 קְבוּצוֹת',
  'bad-name': 'הַשֵּׁם לֹא מַתְאִים — נַסּוּ אַחֵר 🙂',
};
const NETWORK_ERROR = 'מַשֶּׁהוּ הִשְׁתַּבֵּשׁ — נַסּוּ שׁוּב';

function rankBadgeClass(i: number): string {
  return i === 0
    ? 'bg-pop text-void'
    : i === 1
      ? 'bg-bone/70 text-void'
      : i === 2
        ? 'bg-hot text-bone'
        : 'bg-black/40 text-bone/70';
}

/** Share the group invite via the OS sheet, falling back to clipboard. */
async function shareGroupInvite(groupName: string, link: string): Promise<'shared' | 'copied' | 'none'> {
  const text = `בּוֹאוּ לַקְּבוּצָה שֶׁלִּי ״${groupName}״ בְּבּלוֹרְבּוֹ! 👥 ${link}`;
  try {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    if (nav.share) {
      await nav.share({ title: 'בלורבו', text });
      return 'shared';
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    /* dismissed / denied — nothing to do */
  }
  return 'none';
}

export function GroupsContent({ active }: { active: boolean }) {
  const backend = hasGroupsBackend();
  const referralCode = useGame((s) => s.referralCode);

  const [groups, setGroups] = useState<GroupInfo[] | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedId, setSelectedId] = useState<GroupId | null>(null);
  const [metric, setMetric] = useState<GroupMetric>('clicks');
  const [board, setBoard] = useState<GroupBoard | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);

  // Create / join forms (the empty state).
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // Share / copy / leave affordances for the selected group.
  const [shared, setShared] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  // Leaving is destructive-ish (you drop off the board), so it takes a
  // deliberate second tap to confirm — same pattern as the rebirth button.
  const [confirmLeave, setConfirmLeave] = useState(false);

  // On tab open: load my groups. Re-runs on each open so a join made elsewhere
  // (the auto-join toast, another device) shows up without a manual refresh.
  useEffect(() => {
    if (!active || !backend) return;
    let alive = true;
    setLoadingGroups(true);
    fetchMyGroups()
      .then((gs) => {
        if (alive && gs) setGroups(gs);
      })
      .finally(() => {
        if (alive) setLoadingGroups(false);
      });
    return () => {
      alive = false;
    };
  }, [active, backend]);

  // Keep the selection valid: pick the first group when none is selected, and
  // drop a selection whose group is gone (left / removed).
  const selected = groups?.find((g) => g.id === selectedId) ?? groups?.[0] ?? null;

  // Load the selected group's board on open + group/metric change.
  useEffect(() => {
    if (!active || !backend || !selected) return;
    let alive = true;
    setLoadingBoard(true);
    setBoard(null); // drop stale rows so one metric's values never render as another's
    fetchGroupBoard(selected.id, metric)
      .then((b) => {
        if (alive) setBoard(b);
      })
      .finally(() => {
        if (alive) setLoadingBoard(false);
      });
    return () => {
      alive = false;
    };
    // selected?.id (not the object) — refetch only when the group actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, backend, selected?.id, metric]);

  // Reset the transient tap states when switching groups.
  useEffect(() => {
    setConfirmLeave(false);
    setShared(false);
    setCodeCopied(false);
  }, [selected?.id]);

  const refreshGroups = async (selectId?: GroupId) => {
    const gs = await fetchMyGroups();
    if (gs) {
      setGroups(gs);
      if (selectId !== undefined) setSelectedId(selectId);
    }
  };

  const onCreate = async () => {
    const clean = createName.trim();
    if (!clean || busy) return;
    if (clean.length < groupNameMinLen || !isCleanNickname(clean)) {
      setFormError(ERROR_TEXT['bad-name']);
      return;
    }
    setBusy(true);
    setFormError('');
    const res = await createGroup(clean);
    setBusy(false);
    if (!res) {
      setFormError(NETWORK_ERROR);
      return;
    }
    if ('error' in res) {
      setFormError(ERROR_TEXT[res.error]);
      return;
    }
    setCreateName('');
    haptic([0, 30, 20, 40]);
    await refreshGroups(res.id);
  };

  const onJoin = async () => {
    const code = joinCode.trim();
    if (!code || busy) return;
    setBusy(true);
    setFormError('');
    const res = await joinGroup(code);
    setBusy(false);
    if (!res) {
      setFormError(NETWORK_ERROR);
      return;
    }
    if ('error' in res) {
      setFormError(ERROR_TEXT[res.error]);
      return;
    }
    setJoinCode('');
    haptic([0, 30, 20, 40]);
    await refreshGroups(res.id);
  };

  const onShare = async () => {
    if (!selected) return;
    haptic(12);
    const r = await shareGroupInvite(selected.name, groupInviteLink(referralCode, selected.code));
    if (r === 'copied') {
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    }
  };

  const onCopyCode = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard?.writeText(selected.code);
      setCodeCopied(true);
      haptic(8);
      window.setTimeout(() => setCodeCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const onLeave = async () => {
    if (!selected) return;
    if (!confirmLeave) {
      setConfirmLeave(true); // first tap arms the confirm
      return;
    }
    setConfirmLeave(false);
    const ok = await leaveGroup(selected.id);
    if (ok) {
      setSelectedId(null);
      await refreshGroups();
    }
  };

  const hasGroups = !!groups && groups.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-center text-xs text-bone/50">👥 טַבְלָה פְּרָטִית — רַק חַבְרֵי הַקְּבוּצָה רוֹאִים</div>

      {!backend && <div className="py-6 text-center text-sm text-bone/50">קְבוּצוֹת זְמִינוֹת רַק עִם חִבּוּר לָרֶשֶׁת.</div>}

      {backend && loadingGroups && groups === null && (
        <div className="py-6 text-center text-sm text-bone/50">טוֹעֵן…</div>
      )}

      {/* ---- No groups yet: a warm empty state with create + join. ---- */}
      {backend && groups !== null && !hasGroups && (
        <div className="min-h-0 flex-1 overflow-y-auto pe-1">
          <div className="mt-4 text-center text-3xl">👨‍👩‍👧‍👦</div>
          <p className="mt-2 text-center text-base leading-relaxed text-bone/80">
            הִתְחָרוּ מוּל הַחֲבֵרִים וְהַמִּשְׁפָּחָה!
          </p>

          <div className="mt-4 text-center text-xs text-cy">תְּנוּ שֵׁם לַקְּבוּצָה שֶׁלָּכֶם 👇</div>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={createName}
              onChange={(e) => {
                setCreateName(e.target.value);
                if (formError) setFormError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && onCreate()}
              maxLength={groupNameMaxLen}
              placeholder="שֵׁם הַקְּבוּצָה…"
              className="min-w-0 flex-1 rounded-2xl bg-black/40 px-3 py-2 text-bone outline-none ring-1 ring-hairline placeholder:text-bone/40 focus:ring-2 focus:ring-cy"
            />
            <button
              type="button"
              onClick={onCreate}
              disabled={busy}
              className="btn shrink-0 bg-goo px-4 py-2 text-void disabled:opacity-60"
            >
              {busy ? '…' : 'צֹר קְבוּצָה 👥'}
            </button>
          </div>

          <div className="mt-5 text-center text-xs text-cy">יֵשׁ לָכֶם קוֹד? הִצְטָרְפוּ! 👇</div>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value);
                if (formError) setFormError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && onJoin()}
              dir="ltr"
              maxLength={40}
              placeholder="קוֹד קְבוּצָה…"
              className="min-w-0 flex-1 rounded-2xl bg-black/40 px-3 py-2 text-center text-bone outline-none ring-1 ring-hairline placeholder:text-bone/40 focus:ring-2 focus:ring-cy"
            />
            <button
              type="button"
              onClick={onJoin}
              disabled={busy}
              className="btn shrink-0 bg-cy px-4 py-2 text-void disabled:opacity-60"
            >
              {busy ? '…' : 'הִצְטָרֵף!'}
            </button>
          </div>

          {formError && <p className="mt-2 text-center text-sm text-hot">{formError}</p>}
        </div>
      )}

      {/* ---- Member of at least one group: picker + board + invite. ---- */}
      {backend && hasGroups && selected && (
        <>
          {groups.length > 1 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {groups.map((g) => (
                <button
                  key={String(g.id)}
                  type="button"
                  onClick={() => setSelectedId(g.id)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold transition ${
                    g.id === selected.id ? 'bg-cy text-void' : 'bg-black/30 text-bone/60 ring-1 ring-hairline'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {/* Metric toggle — same three boards as the global leaderboard. */}
          <div className="mb-2 mt-2 flex gap-1 rounded-full bg-black/30 p-1 ring-1 ring-hairline">
            {(['clicks', 'goo', 'cpm'] as GroupMetric[]).map((m) => (
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

          <div className="mb-1 flex items-center gap-3 px-3 text-[11px] font-bold text-bone/55">
            <span className="w-8 shrink-0 text-center">#</span>
            <span className="flex-1">שֵׁם</span>
            <span className="shrink-0">{METRIC_LABEL[metric]}</span>
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-1">
            {loadingBoard && !board && <div className="py-6 text-center text-sm text-bone/50">טוֹעֵן…</div>}
            {!loadingBoard && !board && (
              <div className="py-6 text-center text-sm text-bone/50">{NETWORK_ERROR}</div>
            )}
            {(board?.entries ?? []).map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                  r.me ? 'bg-cy/15 ring-2 ring-cy' : 'bg-black/25 ring-1 ring-hairline'
                }`}
              >
                <span className={`flex h-7 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm ${rankBadgeClass(i)}`}>
                  {i + 1}
                </span>
                <span className={`min-w-0 flex-1 truncate ${r.me ? 'text-cy' : 'text-bone'}`}>{r.name}</span>
                <span className="shrink-0 font-display text-pop tabular" dir="ltr">
                  {fmt(metric, r.score)}
                </span>
              </div>
            ))}
          </div>

          {/* Invite: OS share sheet (or copy), plus the raw code for kids who
              share it out loud at school instead of sending a link. */}
          <button
            type="button"
            onClick={onShare}
            className="btn mt-2 w-full bg-goo py-2.5 text-base text-void"
          >
            {shared ? 'הֻעְתַּק! ✓' : 'הַזְמֵן לַקְּבוּצָה 📤'}
          </button>
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-bone/60">
            <span>קוֹד הַקְּבוּצָה:</span>
            <span className="rounded-full bg-black/40 px-2.5 py-1 font-display text-sm text-bone ring-1 ring-hairline tabular" dir="ltr">
              {selected.code}
            </span>
            <button
              type="button"
              onClick={onCopyCode}
              className="rounded-full bg-black/40 px-2.5 py-1 text-bone/80 ring-1 ring-hairline active:scale-95"
            >
              {codeCopied ? '✓' : 'הַעְתֵּק'}
            </button>
          </div>

          <button
            type="button"
            onClick={onLeave}
            className={`mt-2 w-full py-1.5 text-xs active:scale-95 ${confirmLeave ? 'font-bold text-hot' : 'text-bone/40'}`}
          >
            {confirmLeave ? 'בְּטוּחִים? לִלְחֹץ שׁוּב כְּדֵי לַעֲזֹב' : 'עֲזֹב קְבוּצָה'}
          </button>
        </>
      )}
    </div>
  );
}
