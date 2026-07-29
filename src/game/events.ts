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
}

export const eventPeriodMs = 10 * 60 * 1000; // a new event every 10 minutes

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
  },
];

export interface ActiveEvent {
  event: GameEvent;
  startedAt: number; // epoch ms this event window began
  endsAt: number; // epoch ms it flips to the next one
  index: number;
}

/** Which event is active at time `now`, and when it started/ends. */
export function activeEventAt(now: number): ActiveEvent {
  const index = Math.floor(now / eventPeriodMs);
  const event = EVENTS[((index % EVENTS.length) + EVENTS.length) % EVENTS.length];
  const startedAt = index * eventPeriodMs;
  return { event, startedAt, endsAt: startedAt + eventPeriodMs, index };
}

/** Just the current event's multipliers — a convenient hot-path accessor. */
export function currentEvent(now: number): GameEvent {
  return activeEventAt(now).event;
}
