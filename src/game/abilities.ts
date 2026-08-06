// Creature abilities (the "big idea", phase 2). The creature you set as your
// main-screen star grants a themed bonus, scaled by its rarity. Pure data +
// helpers so it can be tested and (later) shared with the server.
//
// Six thematic types; each creature is assigned the one that fits its character.
// Only ONE ability is active at a time — whichever creature is your equipped main.

import { abilityRebirthBonus, rebirthCap } from './balance';
import type { CharId, Rarity } from './types';

export type AbilityType = 'tap' | 'income' | 'crit' | 'luck' | 'combo' | 'bonus';

export interface Ability {
  type: AbilityType;
  value: number; // fraction (e.g. 0.15 = +15%) or chance-points for crit/luck
}

/** UI metadata per ability type. `pct` is the rounded percentage to show. */
export const ABILITY_META: Record<AbilityType, { icon: string; nameHe: string; descHe: (pct: number) => string }> = {
  tap: { icon: '👆', nameHe: 'עוֹצְמַת נְגִיעָה', descHe: (p) => `+${p}% לְכָל נְגִיעָה` },
  income: { icon: '🟢', nameHe: 'הַכְנָסָה', descHe: (p) => `+${p}% הַכְנָסָה פַּסִּיבִית` },
  crit: { icon: '⚡', nameHe: 'מַכָּה קְרִיטִית', descHe: (p) => `+${p}% סִיכּוּי לְמַכָּה קְרִיטִית` },
  luck: { icon: '🍀', nameHe: 'מַזָּל', descHe: (p) => `+${p}% מַזָּל לִיצוּרִים נְדִירִים` },
  combo: { icon: '🔥', nameHe: 'קוֹמְבּוֹ', descHe: (p) => `+${p}% מִבּוֹנוּס הַקּוֹמְבּוֹ` },
  bonus: { icon: '🎁', nameHe: 'בּוֹנוּס זָהָב', descHe: (p) => `+${p}% מִתְּפִיסַת הַבָּלוֹב הַזָּהֹב` },
};

const TIER: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3 };

// Per-type magnitude by rarity tier [common, uncommon, rare, legendary].
const VALUES: Record<AbilityType, [number, number, number, number]> = {
  tap: [0.08, 0.15, 0.25, 0.4],
  income: [0.08, 0.15, 0.25, 0.4],
  crit: [0.02, 0.04, 0.07, 0.12], // chance points added
  luck: [0.05, 0.1, 0.18, 0.3],
  combo: [0.15, 0.3, 0.5, 0.8],
  bonus: [0.15, 0.3, 0.5, 0.8],
};

// Thematic assignment — each creature's ability fits its personality.
export const ABILITY_TYPE_BY_ID: Record<CharId, AbilityType> = {
  // Common (egg)
  blombo: 'income',
  fizzik: 'tap',
  nono: 'luck',
  grumpolo: 'crit',
  bubbo: 'bonus',
  // Uncommon (egg)
  skwibbly: 'combo',
  tikko: 'tap',
  mumbo: 'income',
  kaktuki: 'crit',
  // Rare (egg)
  zapparoo: 'crit',
  chompolino: 'tap',
  flamo: 'tap',
  kristalo: 'luck',
  // Legendary (egg)
  gigablorf: 'income',
  dragapuf: 'tap',
  galaxo: 'income',
  // Click-unlock
  dondonu: 'bonus',
  romrom: 'combo',
  gongoni: 'luck',
  mataru: 'income',
  gefenaou: 'bonus',
  tapuzi: 'tap',
  oziouh: 'tap',
  baraku: 'crit',
  idanosau: 'income',
};

// Per-creature ability-value overrides (fraction), for creatures whose ability
// is intentionally off the standard rarity curve. Tapuzi is the "click-power
// champion": an EXTREME tap bonus (double taps) that far exceeds a normal rare's
// +25% — the reward for grinding it out at 50k taps. Everything not listed here
// uses the rarity-tiered VALUES table, so existing creatures stay byte-identical.
export const ABILITY_VALUE_OVERRIDE: Partial<Record<CharId, number>> = {
  tapuzi: 3.0, // +300% click power (×4) when displayed — "extreme", as the owner asked
};

/**
 * The ability a given creature grants when equipped as the main.
 *
 * `rebirths` (the mastering loop) permanently strengthens the ability:
 * value = base × (1 + abilityRebirthBonus × rebirths). The count is clamped to
 * rebirthCap HERE — in the shared pure rule — so the game and the anti-cheat
 * ceiling (verify.ts) compute the exact same value, and a forged rebirth count
 * can never inflate power past the cap. Default 0 keeps every existing caller
 * (and golden vector) byte-identical.
 */
export function abilityOf(id: CharId, rarity: Rarity, rebirths = 0): Ability {
  const type = ABILITY_TYPE_BY_ID[id] ?? 'income';
  const reb = Number.isFinite(rebirths) ? Math.min(Math.max(0, Math.floor(rebirths)), rebirthCap) : 0;
  const base = ABILITY_VALUE_OVERRIDE[id] ?? VALUES[type][TIER[rarity]];
  return { type, value: base * (1 + abilityRebirthBonus * reb) };
}

/** Percentage to display for an ability value. */
export function abilityPct(a: Ability): number {
  return Math.round(a.value * 100);
}
