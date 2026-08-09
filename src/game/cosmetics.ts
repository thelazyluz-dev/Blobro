// Shop cosmetics — data only (pure). Three categories bought with goo:
//  • blob skins   — the look (distinct SHAPE + colours) of the main clickable
//  • backgrounds  — the screen's colour theme
//  • accessories  — something worn on the blob (hat, glasses…)
// Each carries a small bonus. Prices range from cheap to deliberately
// out-of-reach, so there's always something big to save toward.

export type CosmeticKind = 'blob' | 'background' | 'accessory' | 'sound';
export type BlobShape = 'goo' | 'round' | 'star' | 'ghost' | 'spiky' | 'heart';
export type AccessoryArt = 'none' | 'hat' | 'glasses' | 'bow' | 'crown' | 'halo' | 'sparkles' | 'wings' | 'medal' | 'medal-gold';

/**
 * Taps a player must have made — ever — before an item can be bought at all.
 *
 * Goo prices alone cannot keep the shop interesting, because income grows
 * exponentially without bound while a price is a fixed number: whatever it is,
 * it becomes pocket change. Measured, a deep player could buy the entire shop
 * in an afternoon.
 *
 * Taps can't be out-earned. The counter only moves on a real physical tap (the
 * robot hand deliberately does NOT feed it — see store.click), so this is a
 * genuine "you have actually played this game" gate that no amount of wealth
 * short-circuits. Thresholds sit alongside the creature click-unlock ladder in
 * game/characters.ts so the two progressions read as one.
 *
 * Nothing is SPENT here, only required. Spending taps would corrupt three
 * things at once: the leaderboard metric, the click achievements, and the
 * server's anti-cheat, which treats a falling tap count as evidence of an
 * edited save.
 */
export type ClickRequirement = number;

export interface BlobSkin {
  id: string;
  kind: 'blob';
  nameHe: string;
  cost: number;
  requiresClicks?: ClickRequirement;
  clickBonus: number; // fraction added to tap power
  shape: BlobShape;
  colors: { body: string; belly: string; highlight: string; arm: string };
}

export interface BackgroundSkin {
  id: string;
  kind: 'background';
  nameHe: string;
  cost: number;
  requiresClicks?: ClickRequirement;
  incomeBonus: number; // fraction added to passive income
  gradient: string; // CSS background-image for the full-screen layer
}

export interface Accessory {
  id: string;
  kind: 'accessory';
  nameHe: string;
  cost: number;
  requiresClicks?: ClickRequirement;
  clickBonus: number; // fraction added to tap power (stacks with the blob)
  incomeBonus?: number; // fraction added to PASSIVE income while worn (default 0)
  art: AccessoryArt;
  // Not sold in the shop — awarded (e.g. the referral medals). Owned + equipped
  // through the exact same paths as any accessory; just filtered out of the shop.
  exclusive?: boolean;
}

export interface SoundSkin {
  id: string;
  kind: 'sound';
  nameHe: string;
  cost: number;
  requiresClicks?: ClickRequirement;
  melody: number[]; // the 8-bit combo melody (note frequencies in Hz) this pack plays
}

export type Cosmetic = BlobSkin | BackgroundSkin | Accessory | SoundSkin;

export const DEFAULT_BLOB = 'blob-goo';
export const DEFAULT_BACKGROUND = 'bg-aurora';
export const DEFAULT_ACCESSORY = 'acc-none';
export const DEFAULT_SOUND = 'sound-classic';

export const blobSkins: BlobSkin[] = [
  {
    id: DEFAULT_BLOB,
    kind: 'blob',
    nameHe: 'בְּלוֹב יָרֹק',
    cost: 0,
    clickBonus: 0,
    shape: 'goo',
    colors: { body: '#A3FF12', belly: '#7FCC0E', highlight: '#C6FF6E', arm: '#A3FF12' },
  },
  {
    id: 'blob-bubble',
    kind: 'blob',
    nameHe: 'כַּדּוּר תּוּתִי',
    cost: 25_000,
    clickBonus: 0.08,
    shape: 'round',
    colors: { body: '#FF63A6', belly: '#E24A8C', highlight: '#FF9AC7', arm: '#FF63A6' },
  },
  {
    id: 'blob-aqua',
    kind: 'blob',
    nameHe: 'רוּחַ יָם',
    cost: 600_000,
    clickBonus: 0.14,
    shape: 'ghost',
    colors: { body: '#7FE9FF', belly: '#4FC8E6', highlight: '#CFF7FF', arm: '#7FE9FF' },
  },
  {
    id: 'blob-gold',
    kind: 'blob',
    nameHe: 'כּוֹכָב זָהָב',
    cost: 18_000_000,
    clickBonus: 0.22,
    shape: 'star',
    colors: { body: '#FFD84D', belly: '#E0B62A', highlight: '#FFEDA0', arm: '#FFD84D' },
  },
  {
    id: 'blob-grape',
    kind: 'blob',
    nameHe: 'לֵב עֲנָבִים',
    cost: 600_000_000,
    clickBonus: 0.3,
    shape: 'heart',
    colors: { body: '#9B5DE5', belly: '#7A3FB0', highlight: '#C9A6F0', arm: '#9B5DE5' },
  },
  {
    id: 'blob-flame',
    kind: 'blob',
    nameHe: 'שֶׁמֶשׁ לוֹהֶטֶת',
    cost: 25_000_000_000,
    clickBonus: 0.38,
    shape: 'spiky',
    colors: { body: '#FF7A1A', belly: '#E85D00', highlight: '#FFC27A', arm: '#FF7A1A' },
  },
  {
    id: 'blob-crystal',
    kind: 'blob',
    nameHe: 'כּוֹכַב קְרִיסְטָל',
    cost: 1_200_000_000_000,
    clickBonus: 0.46,
    shape: 'star',
    colors: { body: '#00E5FF', belly: '#00B4CC', highlight: '#BEF9FF', arm: '#00E5FF' },
  },
  {
    id: 'blob-cosmic',
    kind: 'blob',
    nameHe: 'כַּדּוּר קוֹסְמִי',
    cost: 80_000_000_000_000,
    clickBonus: 0.55,
    shape: 'round',
    colors: { body: '#3A2B7A', belly: '#241a52', highlight: '#8A6BE0', arm: '#5B3FA0' },
  },
];

export const backgroundSkins: BackgroundSkin[] = [
  {
    id: DEFAULT_BACKGROUND,
    kind: 'background',
    nameHe: 'זֹהַר סָגֹל',
    cost: 0,
    incomeBonus: 0,
    gradient:
      'radial-gradient(70% 55% at 82% 8%, rgba(255,46,136,0.30), transparent 60%),' +
      'radial-gradient(65% 55% at 12% 92%, rgba(0,229,255,0.28), transparent 60%),' +
      'radial-gradient(95% 65% at 50% 50%, rgba(155,93,229,0.18), transparent 72%),' +
      'linear-gradient(155deg, rgba(163,255,18,0.07), transparent 42%)',
  },
  {
    id: 'bg-ocean',
    kind: 'background',
    nameHe: 'מַעֲמַקֵּי יָם',
    cost: 30_000,
    incomeBonus: 0.08,
    gradient:
      'linear-gradient(180deg, rgba(0,190,225,0.30) 0%, rgba(10,55,150,0.50) 68%, rgba(3,12,55,0.62) 100%),' +
      'radial-gradient(65% 32% at 50% 0%, rgba(130,245,255,0.40), transparent 62%),' +
      'radial-gradient(28% 45% at 28% 55%, rgba(0,255,210,0.16), transparent 62%),' +
      'repeating-linear-gradient(102deg, rgba(190,250,255,0.05) 0 5px, transparent 5px 42px)',
  },
  {
    id: 'bg-sunset',
    kind: 'background',
    nameHe: 'שְׁקִיעָה',
    cost: 750_000,
    requiresClicks: 3_000,
    incomeBonus: 0.14,
    gradient:
      'linear-gradient(180deg, rgba(55,18,95,0.55) 0%, rgba(190,55,120,0.42) 42%, rgba(255,135,60,0.46) 74%, rgba(255,205,110,0.52) 100%),' +
      'radial-gradient(32% 22% at 50% 84%, rgba(255,246,185,0.75), transparent 60%)',
  },
  {
    id: 'bg-forest',
    kind: 'background',
    nameHe: 'יַעַר קָסוּם',
    cost: 22_000_000,
    requiresClicks: 12_000,
    incomeBonus: 0.2,
    gradient:
      'radial-gradient(65% 55% at 80% 12%, rgba(163,255,18,0.32), transparent 60%),' +
      'radial-gradient(65% 55% at 12% 88%, rgba(0,195,115,0.36), transparent 60%),' +
      'radial-gradient(42% 32% at 46% 46%, rgba(255,232,120,0.16), transparent 64%),' +
      'repeating-linear-gradient(118deg, rgba(220,255,180,0.05) 0 4px, transparent 4px 48px)',
  },
  {
    id: 'bg-galaxy',
    kind: 'background',
    nameHe: 'גָּלַקְסִיָּה',
    cost: 3_000_000_000,
    requiresClicks: 40_000,
    incomeBonus: 0.26,
    gradient:
      'radial-gradient(1.5px 1.5px at 20% 30%, #fff, transparent),' +
      'radial-gradient(1.5px 1.5px at 70% 20%, #fff, transparent),' +
      'radial-gradient(1px 1px at 40% 70%, #cbe, transparent),' +
      'radial-gradient(2px 2px at 85% 65%, #fff, transparent),' +
      'radial-gradient(1.5px 1.5px at 55% 45%, #fff, transparent),' +
      'radial-gradient(1px 1px at 32% 86%, #fff, transparent),' +
      'radial-gradient(1.5px 1.5px at 90% 38%, #e6ccff, transparent),' +
      'radial-gradient(1px 1px at 12% 55%, #fff, transparent),' +
      'radial-gradient(78% 60% at 74% 20%, rgba(180,80,230,0.42), transparent 60%),' +
      'radial-gradient(78% 60% at 22% 84%, rgba(0,110,255,0.36), transparent 60%),' +
      'radial-gradient(45% 42% at 50% 50%, rgba(255,80,180,0.16), transparent 66%)',
  },
  {
    id: 'bg-neon',
    kind: 'background',
    nameHe: 'רֶשֶׁת נֵאוֹן',
    cost: 400_000_000_000,
    requiresClicks: 100_000,
    incomeBonus: 0.32,
    gradient:
      'repeating-linear-gradient(0deg, rgba(0,229,255,0.13) 0 1px, transparent 1px 38px),' +
      'repeating-linear-gradient(90deg, rgba(255,46,136,0.13) 0 1px, transparent 1px 38px),' +
      'radial-gradient(72% 55% at 50% 22%, rgba(163,255,18,0.16), transparent 66%),' +
      'radial-gradient(65% 55% at 50% 102%, rgba(255,46,136,0.22), transparent 60%)',
  },
  {
    id: 'bg-candy',
    kind: 'background',
    nameHe: 'סֻכָּרִיָּה',
    cost: 60_000_000_000_000,
    requiresClicks: 100_000,
    incomeBonus: 0.4,
    gradient:
      'conic-gradient(from 20deg at 50% 40%, rgba(255,46,136,0.34), rgba(0,229,255,0.34), rgba(255,216,77,0.34), rgba(163,255,18,0.34), rgba(155,93,229,0.34), rgba(255,46,136,0.34)),' +
      'radial-gradient(52% 42% at 50% 42%, rgba(255,255,255,0.14), transparent 62%)',
  },
  {
    id: 'bg-lava',
    kind: 'background',
    nameHe: 'לָבָה',
    cost: 9_000_000_000_000_000,
    requiresClicks: 200_000,
    incomeBonus: 0.5,
    gradient:
      'radial-gradient(98% 55% at 50% 106%, rgba(255,110,0,0.58), transparent 60%),' +
      'radial-gradient(45% 35% at 24% 82%, rgba(255,45,12,0.52), transparent 60%),' +
      'radial-gradient(45% 35% at 76% 88%, rgba(255,170,0,0.46), transparent 60%),' +
      'radial-gradient(30% 20% at 50% 96%, rgba(255,242,185,0.55), transparent 55%),' +
      'linear-gradient(180deg, rgba(28,0,6,0.62), transparent 42%)',
  },
  // Premium backgrounds — a real passive-income bonus, placed in the ladder by
  // price (prism between forest and galaxy; diamond between candy and lava).
  {
    id: 'bg-prism',
    kind: 'background',
    nameHe: 'פְּרִיזְמָה',
    cost: 1_500_000_000,
    requiresClicks: 30_000,
    incomeBonus: 0.23,
    gradient:
      'conic-gradient(from 210deg at 30% 20%, rgba(0,229,255,0.34), rgba(155,93,229,0.30), rgba(255,46,136,0.28), rgba(0,229,255,0.34)),' +
      'radial-gradient(60% 45% at 72% 82%, rgba(190,249,255,0.22), transparent 62%),' +
      'linear-gradient(150deg, rgba(0,229,255,0.10), transparent 46%)',
  },
  {
    id: 'bg-diamond',
    kind: 'background',
    nameHe: 'יַהֲלוֹם',
    cost: 300_000_000_000_000,
    requiresClicks: 150_000,
    incomeBonus: 0.46,
    gradient:
      'repeating-linear-gradient(60deg, rgba(190,249,255,0.10) 0 2px, transparent 2px 26px),' +
      'repeating-linear-gradient(-60deg, rgba(0,229,255,0.10) 0 2px, transparent 2px 26px),' +
      'radial-gradient(70% 55% at 50% 18%, rgba(200,250,255,0.28), transparent 64%),' +
      'radial-gradient(65% 55% at 50% 104%, rgba(120,180,255,0.24), transparent 60%)',
  },
];

export const accessories: Accessory[] = [
  { id: DEFAULT_ACCESSORY, kind: 'accessory', nameHe: 'בְּלִי', cost: 0, clickBonus: 0, art: 'none' },
  { id: 'acc-hat', kind: 'accessory', nameHe: 'כּוֹבַע מְסִבָּה', cost: 60_000, clickBonus: 0.05, art: 'hat' },
  { id: 'acc-glasses', kind: 'accessory', nameHe: 'מִשְׁקְפֵי שֶׁמֶשׁ', cost: 1_500_000,
    requiresClicks: 5_000, clickBonus: 0.08, art: 'glasses' },
  { id: 'acc-bow', kind: 'accessory', nameHe: 'פַּפְּיוֹן', cost: 120_000_000,
    requiresClicks: 20_000, clickBonus: 0.12, art: 'bow' },
  { id: 'acc-crown', kind: 'accessory', nameHe: 'כֶּתֶר מֶלֶךְ', cost: 25_000_000_000,
    requiresClicks: 70_000, clickBonus: 0.2, art: 'crown' },
  { id: 'acc-halo', kind: 'accessory', nameHe: 'הִילָה', cost: 8_000_000_000_000,
    requiresClicks: 180_000, clickBonus: 0.28, art: 'halo' },
  // Premium late-game accessories — a real tap bonus, slotted into the ladder by
  // price (sparkles between crown and halo; aura at the very top).
  { id: 'acc-sparkles', kind: 'accessory', nameHe: 'נִצְנוּצֵי קְרִיסְטָל', cost: 250_000_000_000,
    requiresClicks: 90_000, clickBonus: 0.22, art: 'sparkles' },
  // Was a full jeweled "aura" ring — retired because it visually collided with
  // the rebirth mastery halo on the main screen. Same id/price/bonus (owners
  // keep it), now crystal WINGS: premium, and lateral so it never fights a ring.
  { id: 'acc-aura', kind: 'accessory', nameHe: 'כַּנְפֵי קְרִיסְטָל', cost: 40_000_000_000_000,
    requiresClicks: 220_000, clickBonus: 0.34, art: 'wings' },
  // Referral medals — NOT sold; awarded for bringing friends (see the referral
  // system). The strongest accessories in the game, on purpose: choosing to WEAR
  // one is the reward — a big passive-income lift AND a tap multiplier — traded
  // against whatever cosmetic you'd otherwise wear. incomeBonus rides the same
  // income path as a background; clickBonus the same tap path as any accessory,
  // so both are already anti-cheat-mirrored in verify.ts.
  { id: 'acc-referral', kind: 'accessory', nameHe: 'מֶדַלְיַת חֲבֵרִים', cost: 0,
    clickBonus: 1.0, incomeBonus: 0.25, art: 'medal', exclusive: true },
  { id: 'acc-referral-gold', kind: 'accessory', nameHe: 'מֶדַלְיַת זָהָב', cost: 0,
    clickBonus: 2.0, incomeBonus: 0.5, art: 'medal-gold', exclusive: true },
  // The googol champion crown — granted ONCE for reaching the 1e100 victory
  // summit (see store.winGoogol). Exclusive (never sold), the strongest trophy,
  // and owning it is the persisted proof that you won.
  { id: 'acc-champion', kind: 'accessory', nameHe: 'כֶּתֶר הַגּוּגּוֹל', cost: 0,
    clickBonus: 3.0, incomeBonus: 0.75, art: 'crown', exclusive: true },
];

// Sound packs: each is a different 8-bit combo melody that plays once your tap
// combo runs high. Pure cosmetic — no gameplay bonus, just personality. Preview
// them in the shop before buying, and pick your favourite.
export const soundSkins: SoundSkin[] = [
  {
    id: DEFAULT_SOUND,
    kind: 'sound',
    nameHe: 'קְלַאסִי',
    cost: 0,
    melody: [], // empty = our original tap sound (the rising blip), no melody
  },
  {
    id: 'sound-pleasant',
    kind: 'sound',
    nameHe: 'נָעִים',
    cost: 15_000,
    melody: [523, 587, 659, 784, 880, 784, 659, 587, 523, 659, 784, 880, 1047, 880, 784, 659],
  },
  {
    id: 'sound-energetic',
    kind: 'sound',
    nameHe: 'אֶנֶרְגֶּטִי',
    cost: 120_000,
    melody: [659, 988, 1319, 988, 587, 880, 1175, 880, 523, 784, 1047, 784, 587, 880, 1175, 1319],
  },
  {
    id: 'sound-bouncy',
    kind: 'sound',
    nameHe: 'קוֹפְצָנִי',
    cost: 600_000,
    requiresClicks: 3_000,
    // A major line that springs up and drops back — playful, kid-friendly.
    melody: [523, 659, 523, 784, 659, 1047, 784, 659, 523, 659, 523, 784, 659, 1047, 784, 523],
  },
  {
    id: 'sound-calm',
    kind: 'sound',
    nameHe: 'רָגוּעַ',
    cost: 2_500_000,
    requiresClicks: 8_000,
    melody: [392, 440, 523, 587, 523, 440, 392, 440, 523, 659, 587, 523, 440, 392, 440, 523],
  },
  {
    id: 'sound-space',
    kind: 'sound',
    nameHe: 'חָלָל',
    cost: 150_000_000,
    requiresClicks: 35_000,
    melody: [440, 523, 659, 880, 659, 523, 494, 587, 740, 988, 740, 587, 440, 523, 659, 880],
  },
  {
    id: 'sound-mysterious',
    kind: 'sound',
    nameHe: 'מִסְתּוֹרִי',
    cost: 1_200_000_000,
    requiresClicks: 55_000,
    // A minor, drifting motif — moody without being sad.
    melody: [440, 523, 587, 440, 349, 440, 523, 659, 587, 523, 440, 392, 349, 392, 440, 523],
  },
  {
    id: 'sound-royal',
    kind: 'sound',
    nameHe: 'מַלְכוּתִי',
    cost: 20_000_000_000,
    requiresClicks: 90_000,
    melody: [523, 659, 784, 1047, 784, 1047, 1319, 1047, 880, 1047, 1319, 1568, 1319, 1047, 880, 784],
  },
  {
    id: 'sound-legendary',
    kind: 'sound',
    nameHe: 'אַגָּדִי',
    cost: 500_000_000_000,
    requiresClicks: 150_000,
    // A rising fanfare — the top of the sound ladder, a real endgame goal.
    melody: [523, 784, 1047, 784, 1047, 1319, 1568, 1319, 1047, 1319, 1047, 784, 1047, 1568, 1319, 1047],
  },
];

export const cosmeticsById = new Map<string, Cosmetic>(
  [...blobSkins, ...backgroundSkins, ...accessories, ...soundSkins].map((c) => [c.id, c]),
);

export function blobById(id: string): BlobSkin {
  const c = cosmeticsById.get(id);
  return c && c.kind === 'blob' ? c : blobSkins[0];
}

export function backgroundById(id: string): BackgroundSkin {
  const c = cosmeticsById.get(id);
  return c && c.kind === 'background' ? c : backgroundSkins[0];
}

export function accessoryById(id: string): Accessory {
  const c = cosmeticsById.get(id);
  return c && c.kind === 'accessory' ? c : accessories[0];
}

export function soundById(id: string): SoundSkin {
  const c = cosmeticsById.get(id);
  return c && c.kind === 'sound' ? c : soundSkins[0];
}

/** Small tap-power bonus from the equipped blob skin + accessory (they stack). */
export function clickCosmeticBonus(equippedBlob: string, equippedAccessory: string): number {
  return blobById(equippedBlob).clickBonus + accessoryById(equippedAccessory).clickBonus;
}

/** Small passive-income bonus from the equipped background. */
export function backgroundIncomeBonus(equippedBackground: string): number {
  return backgroundById(equippedBackground).incomeBonus;
}

/** Passive-income bonus from the equipped accessory (0 for all but the medals). */
export function accessoryIncomeBonus(equippedAccessory: string): number {
  return accessoryById(equippedAccessory).incomeBonus ?? 0;
}


/**
 * Can this cosmetic be bought yet? Pure, so the server can check it too.
 * An item with no requirement is always unlocked.
 */
export function meetsClickRequirement(c: Cosmetic, clicks: number): boolean {
  return clicks >= (c.requiresClicks ?? 0);
}

/** Taps still needed before this item unlocks (0 once it is available). */
export function clicksRemainingFor(c: Cosmetic, clicks: number): number {
  return Math.max(0, (c.requiresClicks ?? 0) - clicks);
}
