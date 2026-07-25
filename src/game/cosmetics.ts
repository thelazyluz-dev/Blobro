// Shop cosmetics — data only (pure). Two categories the player buys with goo:
//  • blob skins — the look of the main clickable blob (+ a small tap bonus)
//  • backgrounds — the screen's colour theme (+ a small passive-income bonus)
// The bonuses are deliberately small: cosmetics are mainly a goo sink and a way
// to make the game yours, not a power axis.

export type CosmeticKind = 'blob' | 'background';

export interface BlobSkin {
  id: string;
  kind: 'blob';
  nameHe: string;
  cost: number;
  clickBonus: number; // fraction added to tap power (0 = none)
  colors: { body: string; belly: string; highlight: string; arm: string };
}

export interface BackgroundSkin {
  id: string;
  kind: 'background';
  nameHe: string;
  cost: number;
  incomeBonus: number; // fraction added to passive income (0 = none)
  gradient: string; // CSS background-image for the full-screen layer
}

export type Cosmetic = BlobSkin | BackgroundSkin;

export const DEFAULT_BLOB = 'blob-goo';
export const DEFAULT_BACKGROUND = 'bg-aurora';

export const blobSkins: BlobSkin[] = [
  {
    id: DEFAULT_BLOB,
    kind: 'blob',
    nameHe: 'בְּלוֹב יָרֹק',
    cost: 0,
    clickBonus: 0,
    colors: { body: '#A3FF12', belly: '#7FCC0E', highlight: '#C6FF6E', arm: '#A3FF12' },
  },
  {
    id: 'blob-bubble',
    kind: 'blob',
    nameHe: 'בְּלוֹב תּוּתִי',
    cost: 8_000,
    clickBonus: 0.08,
    colors: { body: '#FF63A6', belly: '#E24A8C', highlight: '#FF9AC7', arm: '#FF63A6' },
  },
  {
    id: 'blob-aqua',
    kind: 'blob',
    nameHe: 'בְּלוֹב יָם',
    cost: 120_000,
    clickBonus: 0.14,
    colors: { body: '#00E5FF', belly: '#00B4CC', highlight: '#8AF2FF', arm: '#00E5FF' },
  },
  {
    id: 'blob-gold',
    kind: 'blob',
    nameHe: 'בְּלוֹב זָהָב',
    cost: 2_000_000,
    clickBonus: 0.22,
    colors: { body: '#FFD84D', belly: '#E0B62A', highlight: '#FFEDA0', arm: '#FFD84D' },
  },
  {
    id: 'blob-grape',
    kind: 'blob',
    nameHe: 'בְּלוֹב עֲנָבִים',
    cost: 40_000_000,
    clickBonus: 0.3,
    colors: { body: '#9B5DE5', belly: '#7A3FB0', highlight: '#C9A6F0', arm: '#9B5DE5' },
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
    cost: 8_000,
    incomeBonus: 0.08,
    gradient:
      'radial-gradient(60% 50% at 80% 15%, rgba(0,229,255,0.28), transparent 60%),' +
      'radial-gradient(60% 50% at 15% 85%, rgba(58,120,255,0.28), transparent 60%),' +
      'radial-gradient(50% 40% at 50% 50%, rgba(0,255,200,0.12), transparent 65%)',
  },
  {
    id: 'bg-sunset',
    kind: 'background',
    nameHe: 'שְׁקִיעָה',
    cost: 120_000,
    incomeBonus: 0.14,
    gradient:
      'radial-gradient(60% 50% at 80% 12%, rgba(255,180,40,0.3), transparent 60%),' +
      'radial-gradient(60% 55% at 15% 88%, rgba(255,46,136,0.3), transparent 60%),' +
      'radial-gradient(50% 40% at 50% 45%, rgba(255,90,60,0.14), transparent 65%)',
  },
  {
    id: 'bg-forest',
    kind: 'background',
    nameHe: 'יַעַר קָסוּם',
    cost: 2_000_000,
    incomeBonus: 0.2,
    gradient:
      'radial-gradient(60% 50% at 82% 14%, rgba(163,255,18,0.26), transparent 60%),' +
      'radial-gradient(60% 50% at 14% 86%, rgba(0,200,120,0.26), transparent 60%),' +
      'radial-gradient(50% 40% at 50% 50%, rgba(255,216,77,0.1), transparent 65%)',
  },
  {
    id: 'bg-galaxy',
    kind: 'background',
    nameHe: 'גָּלַקְסִיָּה',
    cost: 40_000_000,
    incomeBonus: 0.28,
    gradient:
      'radial-gradient(60% 50% at 80% 15%, rgba(155,93,229,0.32), transparent 60%),' +
      'radial-gradient(60% 50% at 18% 85%, rgba(0,120,255,0.28), transparent 60%),' +
      'radial-gradient(45% 35% at 50% 45%, rgba(255,255,255,0.1), transparent 65%)',
  },
];

export const cosmeticsById = new Map<string, Cosmetic>(
  [...blobSkins, ...backgroundSkins].map((c) => [c.id, c]),
);

export function blobById(id: string): BlobSkin {
  const c = cosmeticsById.get(id);
  return c && c.kind === 'blob' ? c : blobSkins[0];
}

export function backgroundById(id: string): BackgroundSkin {
  const c = cosmeticsById.get(id);
  return c && c.kind === 'background' ? c : backgroundSkins[0];
}

/** Small tap-power bonus fraction from the equipped blob skin. */
export function blobClickBonus(equippedBlob: string): number {
  return blobById(equippedBlob).clickBonus;
}

/** Small passive-income bonus fraction from the equipped background. */
export function backgroundIncomeBonus(equippedBackground: string): number {
  return backgroundById(equippedBackground).incomeBonus;
}
