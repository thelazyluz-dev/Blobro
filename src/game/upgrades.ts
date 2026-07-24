// Upgrade definitions and pure cost/effect math. Numbers come from balance.ts.

import { upgradeConfig } from './balance';
import type { UpgradeId, Upgrades } from './types';

export interface UpgradeDef {
  id: UpgradeId;
  nameHe: string;
  icon: string; // emoji
  /** Short description of what one more level does. */
  effectHe: string;
}

export const upgradeDefs: UpgradeDef[] = [
  { id: 'finger', nameHe: 'אֶצְבַּע חֲזָקָה', icon: '👆', effectHe: '+1 גּוּ לכל נגיעה' },
  { id: 'power', nameHe: 'כּוֹחַ עַל', icon: '💥', effectHe: '+25% לעוצמת הנגיעה' },
  { id: 'autoTap', nameHe: 'יָד רוֹבּוֹטִית', icon: '🤖', effectHe: 'לוחצת לבד! +0.4 נגיעות בשנייה' },
  { id: 'nurture', nameHe: 'טִיפּוּחַ', icon: '💚', effectHe: '+12% לכל היצורים' },
];

export const defaultUpgrades: Upgrades = { finger: 0, power: 0, autoTap: 0, nurture: 0 };

export function upgradeCost(id: UpgradeId, level: number): number {
  const c = upgradeConfig[id];
  return Math.round(c.costBase * Math.pow(c.costGrowth, level));
}

export function upgradeEffectPerLevel(id: UpgradeId): number {
  return upgradeConfig[id].effectPerLevel;
}
