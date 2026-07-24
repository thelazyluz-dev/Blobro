// Achievements — many escalating tiers so there's always a next goal. Each
// achievement's reward scales with its tier (difficulty): a permanent income
// bonus (star) plus a one-time goo grant. Thresholds/rewards come from
// balance.ts; copy lives here. Pure — the store decides when to check.

import {
  achievementGooBase,
  achievementGooGrowth,
  achievementGoals,
  achievementStarPerTier,
} from './balance';
import type { AchievementId } from './types';

export type AchievementKind = 'collection' | 'shinies' | 'lifetime' | 'hatches' | 'clicks' | 'bonuses';

export interface AchievementDef {
  id: AchievementId;
  kind: AchievementKind;
  goal: number;
  tier: number; // 1-based difficulty within its category
  nameHe: string;
  icon: string;
  starReward: number; // permanent income bonus fraction (e.g. 0.04 = +4%)
  gooReward: number; // one-time goo grant on unlock
}

export interface AchievementContext {
  collectionCount: number;
  shinyCount: number;
  lifetimeGoo: number;
  totalHatches: number;
  clicks: number;
  bonusesCollected: number;
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
};

function nameFor(kind: AchievementKind, goal: number): string {
  switch (kind) {
    case 'collection':
      return goal >= 10 ? 'אספת את כל היצורים!' : `אספת ${goal} יצורים`;
    case 'shinies':
      return goal >= 10 ? 'כל היצורים מנצנצים!' : `${goal} יצורים מנצנצים`;
    case 'lifetime':
      return `צברת ${shortNum(goal)} גּוּ`;
    case 'hatches':
      return `בקעת ${shortNum(goal)} ביצים`;
    case 'clicks':
      return `${shortNum(goal)} לחיצות`;
    case 'bonuses':
      return `אספת ${goal} בונוסים`;
  }
}

function build(kind: AchievementKind): AchievementDef[] {
  return (achievementGoals[kind] as readonly number[]).map((goal, i) => {
    const tier = i + 1;
    return {
      id: `${kind}-${goal}`,
      kind,
      goal,
      tier,
      nameHe: nameFor(kind, goal),
      icon: ICON[kind],
      starReward: achievementStarPerTier * tier,
      gooReward: Math.round(achievementGooBase * Math.pow(achievementGooGrowth, tier - 1)),
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
