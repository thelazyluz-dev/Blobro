// Watches the global boards and reacts to how MY standing changes on each of
// them (owner request):
//   • I take #1        → a celebratory party (confetti + fanfare + toast).
//   • I lose #1        → "someone overtook you" toast.
//   • I drop out of top-10 → "you fell out of the top-10" toast.
//   • someone else takes #1 while I'm a top-10 bystander → a challenge toast.
//
// The mechanism: my standing per board (first / top10 / out) is PERSISTED across
// sessions, and every poll compares the current standing to the last known one.
// Because it's a stored transition rather than a live event, it fires reliably
// whether the change happened while I watched, between polls, or while the app
// was closed (on reconnect) — with no baseline spam (the very first observation
// just seeds the store).
//
// Reliability trick for taking #1: the board only learns a score on submit, so
// instead of waiting for it to catch up we compare MY live local score to the
// board's current #1; the moment it passes we push + submit to claim the throne
// (one write, only at that moment), and hold it through the board's ~30s cache
// lag so a stale board never spuriously reads as "I lost it".

import { useEffect, useRef } from 'react';
import { playMilestone } from '../audio/sfx';
import { fetchBoards, hasGlobalLeaderboard, playerName, submitScore, type GlobalEntry, type Metric } from '../net/leaderboard';
import { pushCheckpoint, useGame } from '../store';

const POLL_MS = 20_000;
// After we CLAIM #1 (submit), the /boards cache can lag ~30s and still show the
// old leader. Hold #1 only within this window after a claim so a stale board
// doesn't read as "I lost it" — but NOT indefinitely: on a fresh session (no
// recent claim) we trust the board, so a demotion that happened while away is
// surfaced on entry instead of being masked by an old local score.
const CLAIM_GRACE_MS = 45_000;
const METRICS: Metric[] = ['goo', 'clicks', 'cpm'];
const CATEGORY_HE: Record<Metric, string> = { goo: 'גּוּ', clicks: 'לְחִיצוֹת', cpm: 'מְהִירוּת' };

export interface ChampionToast {
  text: string;
  icon: string;
  tone: 'star' | 'pop';
}

/**
 * The "someone ELSE is the new #1" challenge toast, for a top-10 bystander (not
 * the dethroned player — that's a standing transition). Null on baseline, no
 * change, self, or when the player isn't competing on this board.
 */
export function championNotice(
  metric: Metric,
  list: GlobalEntry[],
  prevLeader: string | null,
  me: string,
): ChampionToast | null {
  const leader = list[0]?.name ?? null;
  if (!leader || leader === prevLeader) return null;
  if (prevLeader === null) return null; // baseline only
  if (leader === me) return null; // my own #1 is a standing transition, handled elsewhere
  if (!me || !list.some((e) => e.name === me)) return null; // not competing here
  return { text: `👑 ${leader} תָּפַס אֶת הַמָּקוֹם הָרִאשׁוֹן בְּ${CATEGORY_HE[metric]}!`, icon: '👑', tone: 'pop' };
}

/** Pure: has my live score passed the board's current #1 (someone other than me)? */
export function surpassedLeader(list: GlobalEntry[], myValue: number, me: string): boolean {
  const top = list[0];
  return !!me && !!top && top.name !== me && myValue > top.score;
}

/** The celebratory toast for the player who just took #1. */
export function selfChampionToast(metric: Metric): ChampionToast {
  return { text: `👑 שָׁבַרְתָּ שִׂיא! תָּפַסְתָּ אֶת הַמָּקוֹם הָרִאשׁוֹן בְּ${CATEGORY_HE[metric]}! 🎉`, icon: '👑', tone: 'star' };
}

/** My live value for a board, straight from the store. */
function myValueFor(metric: Metric, s: { goo: number; clicks: number; bestCpm: number }): number {
  return metric === 'goo' ? s.goo : metric === 'cpm' ? s.bestCpm : s.clicks;
}

// My standing on a board — persisted across sessions so any change (up or down),
// whenever it happened, is caught by comparing to the last stored value.
export type Standing = 'first' | 'top10' | 'out';
export function myStanding(list: GlobalEntry[], me: string): Standing {
  if (!me || list.length === 0) return 'out';
  if (list[0].name === me) return 'first';
  return list.some((e) => e.name === me) ? 'top10' : 'out';
}

export type StandingChange = 'rose' | 'lost-first' | 'dropped-out' | null;
/** Classify a standing transition into the notification it deserves (or none). */
export function standingTransition(prev: Standing, cur: Standing): StandingChange {
  if (prev !== 'first' && cur === 'first') return 'rose'; // took #1
  if (prev !== 'out' && cur === 'out') return 'dropped-out'; // fell out of the top-10
  if (prev === 'first' && cur === 'top10') return 'lost-first'; // overtaken at #1
  return null;
}

/** The toast for a downward standing change ('lost-first' | 'dropped-out'). */
export function standingChangeToast(metric: Metric, change: 'lost-first' | 'dropped-out'): ChampionToast {
  const cat = CATEGORY_HE[metric];
  return change === 'dropped-out'
    ? { text: `📉 יָרַדְתָּ מֵהַטּוֹפּ 10 בְּ${cat}. חֲזֹר לְטַפֵּס!`, icon: '📉', tone: 'pop' }
    : { text: `😮 עָקְפוּ אוֹתְךָ בְּ${cat}! חֲזֹר לַמָּקוֹם הָרִאשׁוֹן`, icon: '⚔️', tone: 'pop' };
}

const STATUS_KEY = 'blorbo.boardStatus';
function loadMyStatus(): Partial<Record<Metric, Standing>> {
  try {
    const raw = JSON.parse(localStorage.getItem(STATUS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}
function saveMyStatus(s: Partial<Record<Metric, Standing>>): void {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function useChampionWatch(): void {
  const pushToast = useGame((s) => s.pushToast);
  const triggerConfetti = useGame((s) => s.triggerConfetti);
  const lastLeader = useRef<Record<Metric, string | null>>({ goo: null, clicks: null, cpm: null });
  const status = useRef<Partial<Record<Metric, Standing>>>(loadMyStatus()); // seeded from last session
  const claimedAt = useRef<Partial<Record<Metric, number>>>({}); // when we last confirmed #1 (this session)

  useEffect(() => {
    if (!hasGlobalLeaderboard()) return;
    let alive = true;

    const celebrateSelf = (metric: Metric) => {
      triggerConfetti('rainbow');
      playMilestone(useGame.getState().muted);
      pushToast(selfChampionToast(metric));
    };

    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const me = playerName().trim();
      if (!me) return; // not on any board → nothing concerns this player

      const boards = await fetchBoards();
      if (!boards || !alive) return;
      const s = useGame.getState();

      for (const metric of METRICS) {
        const list = boards[metric] ?? [];
        const prev = status.current[metric];
        const myVal = myValueFor(metric, s);

        // Resolve my CURRENT standing, accounting for:
        //  (a) CLAIMING #1 the moment my live score passes the visible leader
        //      (push + submit once, only at that transition);
        //  (b) holding #1 through the board's ~30s cache lag — but ONLY within a
        //      short window after a claim, so a stale local score can't mask a
        //      real demotion on a fresh session (that's how a "you were
        //      overtaken" toast reappears when you re-open the game).
        let cur = myStanding(list, me);
        if (cur !== 'first' && surpassedLeader(list, myVal, me)) {
          await pushCheckpoint();
          const res = await submitScore(me);
          if (!alive) return;
          if (res && res[metric]?.rank === 1) cur = 'first';
        } else if (
          cur !== 'first' &&
          prev === 'first' &&
          claimedAt.current[metric] &&
          Date.now() - claimedAt.current[metric]! < CLAIM_GRACE_MS
        ) {
          const top = list[0];
          if (top && top.name !== me && myVal > top.score) cur = 'first'; // still genuinely ahead
        }
        if (cur === 'first') claimedAt.current[metric] = Date.now(); // keep the grace fresh while I lead

        // Notify on a change — but never on the very first observation (baseline).
        if (prev !== undefined) {
          const change = standingTransition(prev, cur);
          if (change === 'rose') celebrateSelf(metric);
          else if (change) pushToast(standingChangeToast(metric, change));
          else {
            // I didn't move; a NEW champion may have emerged (bystander FYI).
            const n = championNotice(metric, list, lastLeader.current[metric], me);
            if (n) pushToast(n);
          }
        }

        lastLeader.current[metric] = list[0]?.name ?? null;
        status.current[metric] = cur;
      }
      saveMyStatus(status.current);
    };

    void check();
    const id = window.setInterval(() => void check(), POLL_MS);
    // Re-check the moment the tab becomes visible again.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pushToast, triggerConfetti]);
}
