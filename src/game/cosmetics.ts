// Shop cosmetics — data only (pure). Three categories bought with goo:
//  • blob skins   — the look (distinct SHAPE + colours) of the main clickable
//  • backgrounds  — the screen's colour theme
//  • accessories  — something worn on the blob (hat, glasses…)
// Each carries a small bonus. Prices range from cheap to deliberately
// out-of-reach, so there's always something big to save toward.

export type CosmeticKind = 'blob' | 'background' | 'accessory' | 'sound';
export type BlobShape = 'goo' | 'round' | 'star' | 'ghost' | 'spiky' | 'heart';
export type AccessoryArt = 'none' | 'hat' | 'glasses' | 'bow' | 'crown' | 'halo';

export interface BlobSkin {
  id: string;
  kind: 'blob';
  nameHe: string;
  cost: number;
  clickBonus: number; // fraction added to tap power
  shape: BlobShape;
  colors: { body: string; belly: string; highlight: string; arm: string };
}

export interface BackgroundSkin {
  id: string;
  kind: 'background';
  nameHe: string;
  cost: number;
  incomeBonus: number; // fraction added to passive income
  gradient: string; // CSS background-image for the full-screen layer
}

export interface Accessory {
  id: string;
  kind: 'accessory';
  nameHe: string;
  cost: number;
  clickBonus: number; // fraction added to tap power (stacks with the blob)
  art: AccessoryArt;
}

export interface SoundSkin {
  id: string;
  kind: 'sound';
  nameHe: string;
  cost: number;
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
      'radial-gradient(60% 50% at 85% 12%, rgba(255,46,136,0.22), transparent 60%),' +
      'radial-gradient(55% 45% at 12% 88%, rgba(0,229,255,0.2), transparent 60%),' +
      'radial-gradient(50% 40% at 50% 40%, rgba(163,255,18,0.1), transparent 65%)',
  },
  {
    id: 'bg-ocean',
    kind: 'background',
    nameHe: 'מַעֲמַקֵּי יָם',
    cost: 30_000,
    incomeBonus: 0.08,
    gradient:
      'radial-gradient(70% 60% at 50% 0%, rgba(0,229,255,0.3), transparent 60%),' +
      'radial-gradient(80% 60% at 50% 100%, rgba(20,60,180,0.4), transparent 65%),' +
      'radial-gradient(40% 30% at 50% 55%, rgba(0,255,200,0.12), transparent 65%)',
  },
  {
    id: 'bg-sunset',
    kind: 'background',
    nameHe: 'שְׁקִיעָה',
    cost: 750_000,
    incomeBonus: 0.14,
    gradient:
      'linear-gradient(180deg, rgba(120,40,140,0.35) 0%, rgba(255,120,60,0.35) 55%, rgba(255,200,80,0.4) 100%),' +
      'radial-gradient(35% 25% at 50% 78%, rgba(255,240,150,0.5), transparent 60%)',
  },
  {
    id: 'bg-forest',
    kind: 'background',
    nameHe: 'יַעַר קָסוּם',
    cost: 22_000_000,
    incomeBonus: 0.2,
    gradient:
      'radial-gradient(60% 50% at 82% 14%, rgba(163,255,18,0.26), transparent 60%),' +
      'radial-gradient(60% 50% at 14% 86%, rgba(0,200,120,0.3), transparent 60%),' +
      'radial-gradient(45% 35% at 50% 50%, rgba(255,216,77,0.1), transparent 65%)',
  },
  {
    id: 'bg-galaxy',
    kind: 'background',
    nameHe: 'גָּלַקְסִיָּה',
    cost: 750_000_000,
    incomeBonus: 0.26,
    gradient:
      'radial-gradient(1.5px 1.5px at 20% 30%, #fff, transparent),' +
      'radial-gradient(1.5px 1.5px at 70% 20%, #fff, transparent),' +
      'radial-gradient(1.5px 1.5px at 40% 70%, #cbe, transparent),' +
      'radial-gradient(2px 2px at 85% 65%, #fff, transparent),' +
      'radial-gradient(1.5px 1.5px at 55% 45%, #fff, transparent),' +
      'radial-gradient(70% 55% at 75% 20%, rgba(155,93,229,0.35), transparent 60%),' +
      'radial-gradient(70% 55% at 20% 85%, rgba(0,120,255,0.3), transparent 60%)',
  },
  {
    id: 'bg-neon',
    kind: 'background',
    nameHe: 'רֶשֶׁת נֵאוֹן',
    cost: 30_000_000_000,
    incomeBonus: 0.32,
    gradient:
      'repeating-linear-gradient(0deg, rgba(0,229,255,0.10) 0 1px, transparent 1px 44px),' +
      'repeating-linear-gradient(90deg, rgba(255,46,136,0.10) 0 1px, transparent 1px 44px),' +
      'radial-gradient(60% 50% at 50% 30%, rgba(163,255,18,0.14), transparent 65%)',
  },
  {
    id: 'bg-candy',
    kind: 'background',
    nameHe: 'סֻכָּרִיָּה',
    cost: 1_500_000_000_000,
    incomeBonus: 0.4,
    gradient:
      'conic-gradient(from 0deg at 50% 42%, rgba(255,46,136,0.28), rgba(0,229,255,0.28), rgba(255,216,77,0.28), rgba(163,255,18,0.28), rgba(255,46,136,0.28))',
  },
  {
    id: 'bg-lava',
    kind: 'background',
    nameHe: 'לָבָה',
    cost: 100_000_000_000_000,
    incomeBonus: 0.5,
    gradient:
      'radial-gradient(90% 60% at 50% 100%, rgba(255,90,0,0.5), transparent 60%),' +
      'radial-gradient(50% 40% at 30% 80%, rgba(255,40,20,0.45), transparent 60%),' +
      'radial-gradient(50% 40% at 70% 85%, rgba(255,160,0,0.4), transparent 60%),' +
      'linear-gradient(180deg, rgba(40,0,10,0.5), transparent 45%)',
  },
];

export const accessories: Accessory[] = [
  { id: DEFAULT_ACCESSORY, kind: 'accessory', nameHe: 'בְּלִי', cost: 0, clickBonus: 0, art: 'none' },
  { id: 'acc-hat', kind: 'accessory', nameHe: 'כּוֹבַע מְסִבָּה', cost: 60_000, clickBonus: 0.05, art: 'hat' },
  { id: 'acc-glasses', kind: 'accessory', nameHe: 'מִשְׁקְפֵי שֶׁמֶשׁ', cost: 1_500_000, clickBonus: 0.08, art: 'glasses' },
  { id: 'acc-bow', kind: 'accessory', nameHe: 'פַּפְּיוֹן', cost: 50_000_000, clickBonus: 0.12, art: 'bow' },
  { id: 'acc-crown', kind: 'accessory', nameHe: 'כֶּתֶר מֶלֶךְ', cost: 2_500_000_000, clickBonus: 0.2, art: 'crown' },
  { id: 'acc-halo', kind: 'accessory', nameHe: 'הִילָה', cost: 150_000_000_000, clickBonus: 0.28, art: 'halo' },
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
    id: 'sound-calm',
    kind: 'sound',
    nameHe: 'רָגוּעַ',
    cost: 2_500_000,
    melody: [392, 440, 523, 587, 523, 440, 392, 440, 523, 659, 587, 523, 440, 392, 440, 523],
  },
  {
    id: 'sound-space',
    kind: 'sound',
    nameHe: 'חָלָל',
    cost: 60_000_000,
    melody: [440, 523, 659, 880, 659, 523, 494, 587, 740, 988, 740, 587, 440, 523, 659, 880],
  },
  {
    id: 'sound-royal',
    kind: 'sound',
    nameHe: 'מַלְכוּתִי',
    cost: 1_500_000_000,
    melody: [523, 659, 784, 1047, 784, 1047, 1319, 1047, 880, 1047, 1319, 1568, 1319, 1047, 880, 784],
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
