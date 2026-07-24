// The 10 characters — data only (names + rarity + jingle params).
// The SVG bodies are React components and live in src/ui/characters/.
// This module stays pure so it can be imported and tested on its own.

import type { CharacterDef, CharId, Rarity } from './types';

export const characters: CharacterDef[] = [
  // --- Common (60%) — 1 goo/sec ---
  {
    id: 'blombo',
    nameHe: 'בְּלוֹמְבּוֹ',
    nameLatin: 'Blombo',
    rarity: 'common',
    sound: { waveform: 'square', notes: [110, 98], durations: [0.12, 0.12], filter: 800, decay: 0.18 },
  },
  {
    id: 'fizzik',
    nameHe: 'פִיזִיק פִיזִיק',
    nameLatin: 'Fizzik Fizzik',
    rarity: 'common',
    sound: { waveform: 'sine', notes: [440, 620, 880], durations: [0.08, 0.08, 0.12], filter: 2000, decay: 0.2 },
  },
  {
    id: 'nono',
    nameHe: 'נוֹנוֹ בַּנְגוֹ',
    nameLatin: 'Nono Bango',
    rarity: 'common',
    sound: { waveform: 'triangle', notes: [330, 247], durations: [0.1, 0.14], filter: 1200, decay: 0.2 },
  },
  {
    id: 'grumpolo',
    nameHe: 'גְּרוּמְפּוֹלוֹ',
    nameLatin: 'Grumpolo',
    rarity: 'common',
    sound: { waveform: 'sawtooth', notes: [196, 165, 147], durations: [0.12, 0.12, 0.16], filter: 700, decay: 0.24 },
  },

  // --- Uncommon (28%) — 6 goo/sec ---
  {
    id: 'skwibbly',
    nameHe: 'סְקְוִיבְּלִי דוֹפּ',
    nameLatin: 'Skwibbly Dop',
    rarity: 'uncommon',
    sound: { waveform: 'sine', notes: [300, 900, 500], durations: [0.16, 0.1, 0.1], filter: 2500, decay: 0.24 },
  },
  {
    id: 'tikko',
    nameHe: 'טִיקוֹ טַאקוֹ',
    nameLatin: 'Tikko Takko',
    rarity: 'uncommon',
    sound: { waveform: 'square', notes: [880, 660, 880, 660], durations: [0.07, 0.07, 0.07, 0.07], filter: 3000, decay: 0.16 },
  },
  {
    id: 'mumbo',
    nameHe: 'מוּמְבּוֹ פְלוֹמְפּ',
    nameLatin: 'Mumbo Flomp',
    rarity: 'uncommon',
    sound: { waveform: 'sine', notes: [180, 140, 220], durations: [0.14, 0.12, 0.18], filter: 900, decay: 0.28 },
  },

  // --- Rare (10.5%) — 30 goo/sec ---
  {
    id: 'zapparoo',
    nameHe: 'זַאפַּארוּ',
    nameLatin: 'Zapparoo',
    rarity: 'rare',
    sound: { waveform: 'sawtooth', notes: [1200, 300, 1000], durations: [0.06, 0.1, 0.14], filter: 4000, decay: 0.24 },
  },
  {
    id: 'chompolino',
    nameHe: "צ'וֹמְפּוֹלִינוֹ",
    nameLatin: 'Chompolino',
    rarity: 'rare',
    sound: { waveform: 'square', notes: [200, 160, 520], durations: [0.1, 0.1, 0.14], filter: 1600, decay: 0.26 },
  },

  // --- Legendary (1.5%) — 200 goo/sec ---
  {
    id: 'gigablorf',
    nameHe: 'גִּיגַּבְּלוֹרְף',
    nameLatin: 'Gigablorf',
    rarity: 'legendary',
    sound: {
      waveform: 'sine',
      notes: [80, 160, 240, 320, 400],
      durations: [0.14, 0.12, 0.12, 0.12, 0.2],
      filter: 3200,
      decay: 0.4,
    },
  },
];

export const charactersById: Record<CharId, CharacterDef> = characters.reduce(
  (acc, def) => {
    acc[def.id] = def;
    return acc;
  },
  {} as Record<CharId, CharacterDef>,
);

export const charactersByRarity: Record<Rarity, CharacterDef[]> = characters.reduce(
  (acc, def) => {
    (acc[def.rarity] ??= []).push(def);
    return acc;
  },
  {} as Record<Rarity, CharacterDef[]>,
);

/** Stable display order for the collection grid. */
export const collectionOrder: CharId[] = characters.map((c) => c.id);
