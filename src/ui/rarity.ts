// Rarity → presentation mapping (§11). Kept in the UI layer.

import type { Rarity } from '../game/types';

export const rarityLabelHe: Record<Rarity, string> = {
  common: 'נָפוֹץ',
  uncommon: 'לֹא נָפוֹץ',
  rare: 'נָדִיר',
  legendary: 'אַגָּדִי',
};

/** Solid accent color per rarity (legendary uses --pop as its solid stand-in). */
export const rarityColor: Record<Rarity, string> = {
  common: '#00E5FF', // --cy
  uncommon: '#A3FF12', // --goo
  rare: '#FF2E88', // --hot
  legendary: '#FFD84D', // --pop
};

/** CSS background for a rarity's "burst" / badge; legendary is a gradient. */
export function rarityBackground(rarity: Rarity): string {
  if (rarity === 'legendary') {
    return 'linear-gradient(135deg, #FFD84D 0%, #FF2E88 100%)';
  }
  return rarityColor[rarity];
}

export function isShareworthy(rarity: Rarity): boolean {
  return rarity === 'rare' || rarity === 'legendary';
}
