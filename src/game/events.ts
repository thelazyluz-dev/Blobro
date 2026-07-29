// Timed global events (§ user request). A different event is active every 10
// minutes, and which one is chosen is derived purely from the wall clock — so
// every player sees the SAME event at the same time, giving a "global event"
// feel with no backend. Pure.

export interface GameEvent {
  id: string;
  nameHe: string;
  descHe: string; // short effect label, e.g. "×2 הכנסה"
  emoji: string;
  color: string; // accent colour for the banner
  incomeMult: number; // multiplies passive income
  clickMult: number; // multiplies tap power
  eggCostMult: number; // multiplies egg price
  luckBonus: number; // added to hatch luck (better rare/legendary odds)
  music?: boolean; // play the 8-bit chiptune loop during this event
}

export const eventPeriodMs = 10 * 60 * 1000; // one event window every 10 minutes
export const eventActiveMs = 30 * 1000; // …and each event lasts just 30 seconds

export const EVENTS: GameEvent[] = [
  {
    id: 'income2x',
    nameHe: 'הַכְנָסָה כְּפוּלָה',
    descHe: '×2 הַכְנָסָה פַּסִּיבִית',
    emoji: '💰',
    color: '#A3FF12',
    incomeMult: 2,
    clickMult: 1,
    eggCostMult: 1,
    luckBonus: 0,
    music: true,
  },
  {
    id: 'click2x',
    nameHe: 'אֶצְבַּע עַל־טִבְעִית',
    descHe: '×2 כֹּחַ לְחִיצָה',
    emoji: '👆',
    color: '#00E5FF',
    incomeMult: 1,
    clickMult: 2,
    eggCostMult: 1,
    luckBonus: 0,
  },
  {
    id: 'cheapEggs',
    nameHe: 'מִבְצַע בֵּיצִים',
    descHe: 'בֵּיצִים בַּחֲצִי מְחִיר',
    emoji: '🥚',
    color: '#FF2E88',
    incomeMult: 1,
    clickMult: 1,
    eggCostMult: 0.5,
    luckBonus: 0,
  },
  {
    id: 'luck',
    nameHe: 'שְׁעַת מַזָּל',
    descHe: 'סִכּוּי גָּבוֹהַּ לִנְדִירִים',
    emoji: '🍀',
    color: '#FFD84D',
    incomeMult: 1,
    clickMult: 1,
    eggCostMult: 1,
    luckBonus: 0.18,
  },
  {
    id: 'income3x',
    nameHe: 'בֶּהָלַת גּוּ',
    descHe: '×3 הַכְנָסָה פַּסִּיבִית',
    emoji: '🔥',
    color: '#FF7A1A',
    incomeMult: 3,
    clickMult: 1,
    eggCostMult: 1,
    luckBonus: 0,
    music: true,
  },
];

// The "no event running" state — all multipliers neutral, no music.
const NEUTRAL: GameEvent = {
  id: 'none',
  nameHe: '',
  descHe: '',
  emoji: '',
  color: '#FFF4E0',
  incomeMult: 1,
  clickMult: 1,
  eggCostMult: 1,
  luckBonus: 0,
};

export interface EventState {
  active: boolean; // is an event running right now (within its 30s window)?
  event: GameEvent; // the active event, or NEUTRAL between events
  next: GameEvent; // the current-or-upcoming event (for the "next" preview)
  msLeft: number; // active: ms until it ends; otherwise: ms until the next one starts
}

/** The event picture at time `now`: which one runs (if any) and the countdown. */
export function eventStateAt(now: number): EventState {
  const slot = Math.floor(now / eventPeriodMs);
  const into = now - slot * eventPeriodMs; // ms elapsed into this 10-minute slot
  const at = (s: number) => EVENTS[((s % EVENTS.length) + EVENTS.length) % EVENTS.length];
  if (into < eventActiveMs) {
    return { active: true, event: at(slot), next: at(slot), msLeft: eventActiveMs - into };
  }
  return { active: false, event: NEUTRAL, next: at(slot + 1), msLeft: eventPeriodMs - into };
}

/** The event whose multipliers apply right now (NEUTRAL between events). */
export function currentEvent(now: number): GameEvent {
  return eventStateAt(now).event;
}
