// The come-back-tomorrow loop: a 7-day escalating gift and three daily
// quests. Pure — no window, no React, no store — like everything in src/game.
//
// Time is measured in UTC day numbers. For the Israeli audience that flips
// the "new day" at 02:00–03:00 local, which is BETTER than midnight for a
// kids' game: a child playing at 23:50 doesn't watch the day roll over
// mid-session. No PRNG anywhere — the day's quests are the same for every
// player (a shared "today" is part of the fun), picked by rotation.

import {
  dailyGiftIncomeSeconds,
  dailyGiftMinGoo,
  dailyQuestAllBonusMinGoo,
  dailyQuestAllBonusSeconds,
  dailyQuestIncomeSeconds,
  dailyQuestMinGoo,
} from './balance';

export const GIFT_CYCLE_DAYS = 7;

/** UTC day number — the calendar unit for both the gift streak and quests. */
export function dayKey(now: number): number {
  return Math.floor(now / 86_400_000);
}

// ── The 7-day gift ──────────────────────────────────────────────────────────

export interface DailyGiftState {
  /** dayKey of the last claimed gift; 0 = never claimed. */
  lastGiftDay: number;
  /** Position in the 7-day cycle of the LAST claim (1..7); 0 = never. */
  giftStreak: number;
}

export type GiftReward = { kind: 'goo'; incomeSeconds: number; minGoo: number } | { kind: 'egg' };

/** True when today's gift has not been claimed yet. */
export function giftClaimable(state: DailyGiftState, now: number): boolean {
  return state.lastGiftDay < dayKey(now);
}

/**
 * The cycle day (1..7) the NEXT claim will land on.
 *
 * Claimed yesterday → the streak advances. A single missed day is forgiven —
 * kids get sick, phones get confiscated — the streak only resets after two
 * or more missed days. After day 7 the cycle wraps to day 1.
 */
export function nextGiftDay(state: DailyGiftState, now: number): number {
  const today = dayKey(now);
  const gap = today - state.lastGiftDay;
  if (state.giftStreak <= 0 || gap > 2) return 1;
  return (state.giftStreak % GIFT_CYCLE_DAYS) + 1;
}

/** What the given cycle day (1..7) pays. Day 7 is the egg. */
export function giftRewardFor(cycleDay: number): GiftReward {
  if (cycleDay >= GIFT_CYCLE_DAYS) return { kind: 'egg' };
  const idx = Math.min(Math.max(1, cycleDay), dailyGiftIncomeSeconds.length) - 1;
  return {
    kind: 'goo',
    incomeSeconds: dailyGiftIncomeSeconds[idx],
    minGoo: dailyGiftMinGoo * cycleDay,
  };
}

/** The state after claiming today's gift. Call only when giftClaimable. */
export function claimGift(state: DailyGiftState, now: number): DailyGiftState {
  return { lastGiftDay: dayKey(now), giftStreak: nextGiftDay(state, now) };
}

// ── Daily quests ────────────────────────────────────────────────────────────

export type QuestId = 'taps' | 'hatches' | 'bonuses' | 'upgrades' | 'levels' | 'eggs' | 'evolve' | 'crits';

export interface QuestDef {
  id: QuestId;
  nameHe: string; // with nikud — kids read it
  icon: string;
  target: number;
}

/**
 * The full pool. Three of these are live on any given day.
 *
 * Targets are sized so each quest is several minutes of real play, never a
 * drive-by (owner: a quest you finish in under a minute doesn't feel like one —
 * these were bumped up a second time to enforce that floor). The golden bonus
 * spawns every 42–88s, so seven of them is ~7 minutes of active play; 800 taps
 * is a solid tapping stretch; six eggs cost real (escalating) goo.
 */
// A wider pool means the deterministic day-rotation (see questsForDay) takes
// longer to repeat: at 5 types the whole 3-of-5 sequence looped every 5 days —
// a returning kid saw every combination inside a week. Eight types push that to
// an 8-day cycle with a much larger combination space. Each new counter is
// bumped at exactly one store action (buyEgg/buyEggsMax, evolveCreature, and a
// crit tap in click()). Kept everyone's "same quests today" shared design.
export const QUEST_POOL: QuestDef[] = [
  { id: 'taps', nameHe: 'לִלְחֹץ 800 פְּעָמִים', icon: '👆', target: 800 },
  { id: 'hatches', nameHe: 'לִבְקֹעַ 6 בֵּיצִים', icon: '🥚', target: 6 },
  { id: 'bonuses', nameHe: 'לֶאֱסֹף 7 בּוֹנוּסִים', icon: '🎁', target: 7 },
  { id: 'upgrades', nameHe: 'לִקְנוֹת 20 שִׁדְרוּגִים', icon: '⬆️', target: 20 },
  { id: 'levels', nameHe: 'לְאַמֵּן יְצוּרִים 65 רָמוֹת', icon: '🐾', target: 65 },
  { id: 'eggs', nameHe: 'לִקְנוֹת 5 בֵּיצִים', icon: '🛒', target: 5 },
  { id: 'evolve', nameHe: 'לְפַתֵּחַ 3 יְצוּרִים', icon: '✨', target: 3 },
  { id: 'crits', nameHe: 'לְהַנְחִית 20 מַכּוֹת עָצְמָה', icon: '⚡', target: 20 },
];

/** Today's three quests — a deterministic rotation, identical for everyone. */
export function questsForDay(day: number): QuestDef[] {
  const start = ((day % QUEST_POOL.length) + QUEST_POOL.length) % QUEST_POOL.length;
  return [0, 1, 2].map((i) => QUEST_POOL[(start + i) % QUEST_POOL.length]);
}

export interface DailyQuestState {
  /** dayKey this progress belongs to — a new day resets everything below. */
  questDay: number;
  /** Progress counters for today's quests, keyed by QuestId. */
  questProgress: Partial<Record<QuestId, number>>;
  /** Quests whose reward was already collected today. */
  questsClaimed: QuestId[];
  /** The finish-all-three bonus was collected today. */
  questAllClaimed: boolean;
}

export function freshQuestState(day: number): DailyQuestState {
  return { questDay: day, questProgress: {}, questsClaimed: [], questAllClaimed: false };
}

/** Roll the state to `now`'s day if it belongs to an earlier one. */
export function questStateFor(state: DailyQuestState, now: number): DailyQuestState {
  const today = dayKey(now);
  return state.questDay === today ? state : freshQuestState(today);
}

/** Progress counter for a quest, capped at its target. */
export function questProgressOf(state: DailyQuestState, def: QuestDef): number {
  return Math.min(state.questProgress[def.id] ?? 0, def.target);
}

export function questComplete(state: DailyQuestState, def: QuestDef): boolean {
  return (state.questProgress[def.id] ?? 0) >= def.target;
}

export const questReward = { incomeSeconds: dailyQuestIncomeSeconds, minGoo: dailyQuestMinGoo };
export const questAllBonus = { incomeSeconds: dailyQuestAllBonusSeconds, minGoo: dailyQuestAllBonusMinGoo };

/** Count `n` toward one of today's counters (also handles the day rollover). */
export function bumpQuest(state: DailyQuestState, id: QuestId, n: number, now: number): DailyQuestState {
  const s = questStateFor(state, now);
  return { ...s, questProgress: { ...s.questProgress, [id]: (s.questProgress[id] ?? 0) + n } };
}

// ── Cross-copy reconciliation ───────────────────────────────────────────────

/** The daily fields as they ride inside a SaveState. */
export interface DailyClaimState extends DailyGiftState, DailyQuestState {}

/**
 * Merge the daily-claim state of two copies of the same account's save,
 * always keeping the MOST-CLAIMED picture.
 *
 * Why this exists: when the cloud copy wins the load-time merge (or was
 * written by an older deploy whose migrate() didn't know these fields yet),
 * adopting it wholesale would rewind lastGiftDay / questsClaimed — and a
 * rewound claim is both an annoyance ("I already did these!") and an
 * exploit (claim, kill the app before the push, reload, claim again). Claim
 * state is monotonic within a day, so "further along wins" is always right:
 * the later gift claim wins outright, the later quest day wins outright, and
 * within the same day progress is per-counter max, claims are the union.
 */
export function mergeDailyClaims(a: DailyClaimState, b: DailyClaimState): DailyClaimState {
  const gift =
    a.lastGiftDay > b.lastGiftDay || (a.lastGiftDay === b.lastGiftDay && a.giftStreak >= b.giftStreak) ? a : b;

  let quests: DailyQuestState;
  if (a.questDay !== b.questDay) {
    quests = a.questDay > b.questDay ? a : b;
  } else {
    const questProgress: Partial<Record<QuestId, number>> = {};
    for (const def of QUEST_POOL) {
      const v = Math.max(a.questProgress[def.id] ?? 0, b.questProgress[def.id] ?? 0);
      if (v > 0) questProgress[def.id] = v;
    }
    quests = {
      questDay: a.questDay,
      questProgress,
      questsClaimed: [...new Set([...a.questsClaimed, ...b.questsClaimed])],
      questAllClaimed: a.questAllClaimed || b.questAllClaimed,
    };
  }

  return {
    lastGiftDay: gift.lastGiftDay,
    giftStreak: gift.giftStreak,
    questDay: quests.questDay,
    questProgress: quests.questProgress,
    questsClaimed: quests.questsClaimed,
    questAllClaimed: quests.questAllClaimed,
  };
}
