// Achievements (goals + steady dopamine). Thresholds come from balance.ts;
// the copy lives here. Pure — the store decides when to check.

import {
  achievementCollectionGoals,
  achievementHatchGoals,
  achievementLifetimeGoals,
} from './balance';
import type { AchievementId } from './types';

export type AchievementKind = 'collection' | 'lifetime' | 'hatches';

export interface AchievementDef {
  id: AchievementId;
  kind: AchievementKind;
  goal: number;
  nameHe: string;
  icon: string;
}

export interface AchievementContext {
  collectionCount: number;
  lifetimeGoo: number;
  totalHatches: number;
}

function collectionName(goal: number): string {
  if (goal >= 10) return 'אוֹסֵף עַל — כל היצורים!';
  return `אספת ${goal} יצורים`;
}

export const achievements: AchievementDef[] = [
  ...achievementCollectionGoals.map<AchievementDef>((goal) => ({
    id: `collection-${goal}`,
    kind: 'collection',
    goal,
    nameHe: collectionName(goal),
    icon: '🧩',
  })),
  ...achievementLifetimeGoals.map<AchievementDef>((goal) => ({
    id: `lifetime-${goal}`,
    kind: 'lifetime',
    goal,
    nameHe: `צברת ${goal >= 1_000_000 ? 'מיליון' : goal.toLocaleString('en-US')} גּוּ`,
    icon: '💰',
  })),
  ...achievementHatchGoals.map<AchievementDef>((goal) => ({
    id: `hatches-${goal}`,
    kind: 'hatches',
    goal,
    nameHe: `בקעת ${goal} ביצים`,
    icon: '🥚',
  })),
];

export function progressValue(def: AchievementDef, ctx: AchievementContext): number {
  switch (def.kind) {
    case 'collection':
      return ctx.collectionCount;
    case 'lifetime':
      return ctx.lifetimeGoo;
    case 'hatches':
      return ctx.totalHatches;
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
