// Achievements — many escalating tiers so there's always a next goal. Rewards
// are SPLIT by category (§ user request): collection-mastery ladders grant a
// permanent income % (the "star"); grind ladders grant a one-time goo lump. No
// achievement gives both. Thresholds/rewards come from balance.ts; copy lives
// here. Pure — the store decides when to check.

import {
  achievementGooBase,
  achievementGooGrowth,
  achievementGoals,
  achievementStarPerTier,
} from './balance';
import { collectionOrder } from './characters';
import type { AchievementId } from './types';

const TOTAL_CREATURES = collectionOrder.length;

export type AchievementKind = 'collection' | 'shinies' | 'lifetime' | 'hatches' | 'clicks' | 'bonuses' | 'maxevolved';

export interface AchievementDef {
  id: AchievementId;
  kind: AchievementKind;
  goal: number;
  tier: number; // 1-based difficulty within its category
  nameHe: string;
  icon: string;
  starReward: number; // permanent income bonus fraction (e.g. 0.04 = +4%) — star ladders only
  gooReward: number; // one-time goo grant on unlock — grind ladders only
}

// Which ladders grant the permanent income % (the "star") vs. a one-time goo
// lump. Mastering your collection makes everything you own earn more forever;
// grinding milestones pays out spendable goo. A ladder is one OR the other.
const STAR_KINDS = new Set<AchievementKind>(['collection', 'shinies']);

export interface AchievementContext {
  collectionCount: number;
  shinyCount: number;
  lifetimeGoo: number;
  totalHatches: number;
  clicks: number;
  bonusesCollected: number;
  // Creatures at MAX evolution (stage 4 == level 100). Optional so the many
  // existing context literals default it to 0; only achContextOf supplies it.
  maxEvolvedCount?: number;
}

function shortNum(n: number): string {
  if (n >= 1e12) return `${n / 1e12}T`;
  if (n >= 1e9) return `${n / 1e9}B`;
  if (n >= 1e6) return `${n / 1e6}M`;
  if (n >= 1e3) return `${n / 1e3}K`;
  return `${n}`;
}

const ICON: Record<AchievementKind, string> = {
  collection: '🧩',
  shinies: '✨',
  lifetime: '💰',
  hatches: '🥚',
  clicks: '👆',
  bonuses: '⭐',
  maxevolved: '👑',
};

function nameFor(kind: AchievementKind, goal: number): string {
  switch (kind) {
    case 'collection':
      return goal >= TOTAL_CREATURES ? 'אָסַפְתָּ אֶת כָּל הַיְּצוּרִים!' : `אָסַפְתָּ ${goal} יְצוּרִים`;
    case 'shinies':
      return goal >= TOTAL_CREATURES ? 'כָּל הַיְּצוּרִים מְנַצְנְצִים!' : `${goal} יְצוּרִים מְנַצְנְצִים`;
    case 'lifetime':
      return `צָבַרְתָּ ${shortNum(goal)} גּוּ`;
    case 'hatches':
      return `בָּקַעְתָּ ${shortNum(goal)} בֵּיצִים`;
    case 'clicks':
      return `${shortNum(goal)} לְחִיצוֹת`;
    case 'bonuses':
      return `אָסַפְתָּ ${goal} בּוֹנוּסִים`;
    case 'maxevolved':
      return goal >= TOTAL_CREATURES ? 'כָּל הַיְּצוּרִים בַּשִּׂיא!' : `${goal} יְצוּרִים בַּשִּׂיא`;
  }
}

function build(kind: AchievementKind): AchievementDef[] {
  const givesStar = STAR_KINDS.has(kind);
  return (achievementGoals[kind] as readonly number[]).map((goal, i) => {
    const tier = i + 1;
    return {
      id: `${kind}-${goal}`,
      kind,
      goal,
      tier,
      nameHe: nameFor(kind, goal),
      icon: ICON[kind],
      // Star ladders grant a permanent income %; grind ladders grant one-time goo.
      starReward: givesStar ? achievementStarPerTier * tier : 0,
      gooReward: givesStar ? 0 : Math.round(achievementGooBase * Math.pow(achievementGooGrowth, tier - 1)),
    };
  });
}

export const achievements: AchievementDef[] = [
  ...build('collection'),
  ...build('shinies'),
  ...build('lifetime'),
  ...build('hatches'),
  ...build('clicks'),
  ...build('bonuses'),
  ...build('maxevolved'),
];

const byId = new Map(achievements.map((a) => [a.id, a]));

export function progressValue(def: AchievementDef, ctx: AchievementContext): number {
  switch (def.kind) {
    case 'collection':
      return ctx.collectionCount;
    case 'shinies':
      return ctx.shinyCount;
    case 'lifetime':
      return ctx.lifetimeGoo;
    case 'hatches':
      return ctx.totalHatches;
    case 'clicks':
      return ctx.clicks;
    case 'bonuses':
      return ctx.bonusesCollected;
    case 'maxevolved':
      return ctx.maxEvolvedCount ?? 0;
  }
}

export function isComplete(def: AchievementDef, ctx: AchievementContext): boolean {
  return progressValue(def, ctx) >= def.goal;
}

/** Achievements now complete that aren't in the claimed set yet. */
export function newlyCompleted(
  claimed: ReadonlySet<AchievementId>,
  ctx: AchievementContext,
): AchievementDef[] {
  return achievements.filter((def) => !claimed.has(def.id) && isComplete(def, ctx));
}

/** Total permanent income bonus from all claimed achievements. */
export function starBonusFor(claimedIds: readonly AchievementId[]): number {
  let sum = 0;
  for (const id of claimedIds) sum += byId.get(id)?.starReward ?? 0;
  return sum;
}
