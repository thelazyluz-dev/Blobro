// Upgrade definitions and pure cost/effect math. Numbers come from balance.ts.

import { critBaseChance, critChanceCap, luckCap, upgradeConfig } from './balance';
import { autoTapFraction, fingerBonus } from './economy';
import { formatGoo } from './format';
import type { UpgradeId, Upgrades } from './types';

export interface UpgradeDef {
  id: UpgradeId;
  nameHe: string;
  icon: string; // emoji
  /** Short description of what one more level does. */
  effectHe: string;
}

export const upgradeDefs: UpgradeDef[] = [
  { id: 'finger', nameHe: 'אֶצְבַּע חֲזָקָה', icon: '👆', effectHe: 'עוֹצְמַת נְגִיעָה — כָּל רָמָה מוֹסִיפָה יוֹתֵר!' },
  { id: 'power', nameHe: 'כּוֹחַ עַל', icon: '💥', effectHe: '+25% לעוצמת הנגיעה' },
  { id: 'autoTap', nameHe: 'יָד רוֹבּוֹטִית', icon: '🤖', effectHe: 'אוֹסֶפֶת עוֹד מֵהַכְנָסַת הַיְצוּרִים!' },
  { id: 'nurture', nameHe: 'טִיפּוּחַ', icon: '💚', effectHe: '+12% לכל היצורים' },
  { id: 'crit', nameHe: 'מַכָּה קְרִיטִית', icon: '⚡', effectHe: '+3% סיכוי למכה ענקית' },
  { id: 'luck', nameHe: 'מַזָּל', icon: '🍀', effectHe: 'סיכוי גבוה יותר ליצורים נדירים' },
];

export const defaultUpgrades: Upgrades = {
  finger: 0,
  power: 0,
  autoTap: 0,
  nurture: 0,
  crit: 0,
  luck: 0,
};

export function upgradeCost(id: UpgradeId, level: number): number {
  const c = upgradeConfig[id];
  return Math.round(c.costBase * Math.pow(c.costGrowth, level));
}

export function upgradeEffectPerLevel(id: UpgradeId): number {
  return upgradeConfig[id].effectPerLevel;
}

/**
 * The upgrade's TOTAL current contribution at `level` — the running sum of
 * everything bought so far, so the player sees "how much is this giving me
 * altogether" next to each upgrade (§ user request).
 */
export function upgradeTotalHe(id: UpgradeId, level: number, tapMult = 1): string {
  const per = upgradeConfig[id].effectPerLevel;
  switch (id) {
    case 'finger':
      return `סה״כ +${formatGoo(fingerBonus(level) * tapMult)} גּוּ לכל נגיעה`;
    case 'power':
      return `סה״כ +${Math.round(level * per * 100)}% לעוצמת הנגיעה`;
    case 'autoTap':
      return `סה״כ +${Math.round(autoTapFraction(level) * 100)}% מהכנסת היצורים`;
    case 'nurture':
      return `סה״כ +${Math.round(level * per * 100)}% לכל היצורים`;
    case 'crit': {
      const chance = Math.min(critChanceCap, critBaseChance + per * level);
      return `סה״כ ${Math.round(chance * 100)}% סיכוי למכה קריטית`;
    }
    case 'luck': {
      const luck = Math.min(luckCap, per * level);
      return `סה״כ +${Math.round(luck * 100)}% מזל ליצורים נדירים`;
    }
  }
}

/**
 * The marginal gain from the level you JUST bought (going level-1 → level).
 * Used for the floating "+X" indication on each purchase (§ user request).
 */
export function upgradeGainHe(id: UpgradeId, level: number, tapMult = 1): string {
  const per = upgradeConfig[id].effectPerLevel;
  switch (id) {
    case 'finger':
      return `+${formatGoo((fingerBonus(level) - fingerBonus(level - 1)) * tapMult)} גּוּ / נגיעה`;
    case 'power':
      return `+${Math.round(per * 100)}% נגיעה`;
    case 'autoTap': {
      const d = Math.round((autoTapFraction(level) - autoTapFraction(level - 1)) * 100);
      return d > 0 ? `+${d}% מהיצורים` : 'יד רובוטית בשיא!';
    }
    case 'nurture':
      return `+${Math.round(per * 100)}% ליצורים`;
    case 'crit': {
      const before = Math.min(critChanceCap, critBaseChance + per * (level - 1));
      const after = Math.min(critChanceCap, critBaseChance + per * level);
      const d = Math.round((after - before) * 100);
      return d > 0 ? `+${d}% קריטי` : 'קריטי בשיא!';
    }
    case 'luck': {
      const before = Math.min(luckCap, per * (level - 1));
      const after = Math.min(luckCap, per * level);
      const d = Math.round((after - before) * 100);
      return d > 0 ? `+${d}% מזל` : 'מזל בשיא!';
    }
  }
}
