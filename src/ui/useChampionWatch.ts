// Watches the global boards for a change at #1 and reacts two ways (owner
// request):
//   • YOU took #1 → a celebratory party (confetti + fanfare + toast), even if
//     you never opened the leaderboard.
//   • Someone ELSE took #1 → everyone in that board's top-10 is challenged with
//     a toast naming them + the category.
//
// The reliability trick: the board only learns a score when it's submitted, and
// submits happen rarely (opening the board, joining, a speed result). So instead
// of waiting for the board to catch up, this watcher compares YOUR LIVE local
// score to the board's current #1; the moment it passes, it pushes your save and
// submits to claim the throne, then celebrates. That single write happens only
// at the actual overtaking moment, so it costs effectively nothing in normal play.
//
// Pull-based and polite: polls the ONE cached /boards endpoint on a slow
// interval, only while the tab is visible and the player has a nickname.

import { useEffect, useRef } from 'react';
import { playMilestone } from '../audio/sfx';
import { fetchBoards, hasGlobalLeaderboard, playerName, submitScore, type GlobalEntry, type Metric } from '../net/leaderboard';
import { pushCheckpoint, useGame } from '../store';

const POLL_MS = 60_000;
const METRICS: Metric[] = ['goo', 'clicks', 'cpm'];
const CATEGORY_HE: Record<Metric, string> = { goo: 'גּוּ', clicks: 'לְחִיצוֹת', cpm: 'מְהִירוּת' };

export interface ChampionToast {
  text: string;
  icon: string;
  tone: 'star' | 'pop';
}

/**
 * Pure decision for the "someone ELSE is the new #1" challenge toast: given a
 * board's current top-10, the leader we last saw, and the player's nickname,
 * return the toast — or null. Null when nothing changed, when there was no
 * previous leader yet (baseline), when the new leader is the player themselves
 * (that celebration is handled by the claim path), or when the player isn't in
 * this board's top-10 (only competitors are told).
 */
export function championNotice(
  metric: Metric,
  list: GlobalEntry[],
  prevLeader: string | null,
  me: string,
): ChampionToast | null {
  const leader = list[0]?.name ?? null;
  if (!leader || leader === prevLeader) return null; // no new champion
  if (prevLeader === null) return null; // first time we've seen this board — baseline only
  if (leader === me) return null; // self-celebration is the claim path's job, not this
  if (!me || !list.some((e) => e.name === me)) return null; // not competing on this board
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

// My standing on a board — persisted across sessions so that opening the app can
// tell me if I LOST ground while I was away (the live watcher only catches
// changes it witnesses; a change that happened offline reads as the baseline).
export type Standing = 'first' | 'top10' | 'out';
export function myStanding(list: GlobalEntry[], me: string): Standing {
  if (!me || list.length === 0) return 'out';
  if (list[0].name === me) return 'first';
  return list.some((e) => e.name === me) ? 'top10' : 'out';
}

/** A toast if my standing DROPPED since last time (used on reconnect). */
export function standingDropToast(metric: Metric, prev: Standing | undefined, cur: Standing): ChampionToast | null {
  if (!prev) return null; // no prior knowledge → baseline, say nothing
  const cat = CATEGORY_HE[metric];
  if (prev !== 'out' && cur === 'out') {
    return { text: `📉 יָרַדְתָּ מֵהַטּוֹפּ 10 בְּ${cat} בִּזְמַן שֶׁלֹּא הָיִיתָ. חֲזֹר לְטַפֵּס!`, icon: '📉', tone: 'pop' };
  }
  if (prev === 'first' && cur !== 'first') {
    return { text: `😮 עָקְפוּ אוֹתְךָ בְּ${cat} בִּזְמַן שֶׁלֹּא הָיִיתָ! חֲזֹר לַמָּקוֹם הָרִאשׁוֹן`, icon: '⚔️', tone: 'pop' };
  }
  return null;
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
function saveMyStatus(s: Record<Metric, Standing>): void {
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
  const firstPoll = useRef(true);

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
      if (!me) return; // not on any board → nothing could concern this player

      const boards = await fetchBoards();
      if (!boards || !alive) return;
      const s = useGame.getState();

      const prevStatus = firstPoll.current ? loadMyStatus() : null; // cross-session, first poll only
      const nextStatus = {} as Record<Metric, Standing>;

      for (const metric of METRICS) {
        const list = boards[metric] ?? [];
        const prev = lastLeader.current[metric];
        nextStatus[metric] = myStanding(list, me);

        // On the first poll of a session: did I lose ground while I was away?
        // (Fills the gap the live watcher can't see — changes that happened
        // offline read as the baseline otherwise.)
        if (prevStatus) {
          const drop = standingDropToast(metric, prevStatus[metric], nextStatus[metric]);
          if (drop) pushToast(drop);
        }

        // Have I just overtaken the visible #1? Claim it (once — `prev !== me`
        // guards against the 30s /boards cache re-triggering before it refreshes).
        if (prev !== me && surpassedLeader(list, myValueFor(metric, s), me)) {
          lastLeader.current[metric] = me; // one claim attempt per throne
          await pushCheckpoint(); // ensure the cloud save carries my latest score
          const res = await submitScore(me); // claim it on the server
          if (!alive) return;
          if (res && res[metric]?.rank === 1) {
            celebrateSelf(metric); // only if the server agrees
            nextStatus[metric] = 'first';
          }
          continue;
        }

        const notice = championNotice(metric, list, prev, me);
        lastLeader.current[metric] = list[0]?.name ?? null;
        if (notice) pushToast(notice);
      }

      saveMyStatus(nextStatus);
      firstPoll.current = false;
    };

    void check();
    const id = window.setInterval(() => void check(), POLL_MS);
    // Re-check the moment the tab becomes visible again (a throne may have
    // changed while it was hidden and polling was paused).
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
