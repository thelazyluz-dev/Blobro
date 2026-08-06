// Watches the global boards and, when the #1 spot changes on any of them, shows
// a toast to everyone in that board's top-10: "there's a new champion, their
// name, and which category" (owner request).
//
// Pull-based, by design: it polls the ONE cached /boards endpoint (all three
// boards' top-10) on a slow interval, and only while the tab is visible and the
// player actually has a nickname (so a non-competing player never polls). The
// first poll only establishes a baseline — no toast for scores that were already
// standing when you opened the app (championNotice returns null when there is no
// previous leader to compare against).

import { useEffect, useRef } from 'react';
import { fetchBoards, hasGlobalLeaderboard, playerName, type GlobalEntry, type Metric } from '../net/leaderboard';
import { useGame } from '../store';

const POLL_MS = 60_000;
const METRICS: Metric[] = ['goo', 'clicks', 'cpm'];
const CATEGORY_HE: Record<Metric, string> = { goo: 'גּוּ', clicks: 'לְחִיצוֹת', cpm: 'מְהִירוּת' };

export interface ChampionToast {
  text: string;
  icon: string;
  tone: 'star' | 'pop';
}

/**
 * Pure decision: given a board's current top-10, the leader we last saw, and the
 * player's nickname, return the toast to show — or null. Null when nothing
 * changed, when there was no previous leader yet (baseline), or when the player
 * isn't in THIS board's top-10 (only the competitors are told).
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
  if (!me || !list.some((e) => e.name === me)) return null; // not competing on this board
  const cat = CATEGORY_HE[metric];
  return leader === me
    ? { text: `🎉 תָּפַסְתָּ אֶת הַמָּקוֹם הָרִאשׁוֹן בְּ${cat}!`, icon: '👑', tone: 'star' }
    : { text: `👑 ${leader} תָּפַס אֶת הַמָּקוֹם הָרִאשׁוֹן בְּ${cat}!`, icon: '👑', tone: 'pop' };
}

export function useChampionWatch(): void {
  const pushToast = useGame((s) => s.pushToast);
  const lastLeader = useRef<Record<Metric, string | null>>({ goo: null, clicks: null, cpm: null });

  useEffect(() => {
    if (!hasGlobalLeaderboard()) return;
    let alive = true;

    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const me = playerName().trim();
      if (!me) return; // not on any board → nothing could concern this player

      const boards = await fetchBoards();
      if (!boards || !alive) return;

      for (const metric of METRICS) {
        const list = boards[metric] ?? [];
        const notice = championNotice(metric, list, lastLeader.current[metric], me);
        lastLeader.current[metric] = list[0]?.name ?? null;
        if (notice) pushToast(notice);
      }
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
  }, [pushToast]);
}
