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
    descHe: 'תַּפּוּחַ אֲדָמָה הֲכִי מַגְנִיב בָּעִיר',
    rarity: 'common',
    sound: { waveform: 'square', notes: [110, 98], durations: [0.12, 0.12], filter: 800, decay: 0.18 },
  },
  {
    id: 'fizzik',
    nameHe: 'פִיזִיק פִיזִיק',
    nameLatin: 'Fizzik Fizzik',
    descHe: 'פַּחִית מְבַעְבַּעַת שֶׁלֹּא נִרְגַּעַת',
    rarity: 'common',
    sound: { waveform: 'sine', notes: [440, 620, 880], durations: [0.08, 0.08, 0.12], filter: 2000, decay: 0.2 },
  },
  {
    id: 'nono',
    nameHe: 'נוֹנוֹ בַּנְגוֹ',
    nameLatin: 'Nono Bango',
    descHe: 'בָּנָנָה הֲפוּכָה עִם הַרְבֵּה סְטַייל',
    rarity: 'common',
    sound: { waveform: 'triangle', notes: [330, 247], durations: [0.1, 0.14], filter: 1200, decay: 0.2 },
  },
  {
    id: 'grumpolo',
    nameHe: 'גְּרוּמְפּוֹלוֹ',
    nameLatin: 'Grumpolo',
    descHe: 'עָנָן זוֹעֵף שֶׁצָּרִיךְ חִיבּוּק',
    rarity: 'common',
    sound: { waveform: 'sawtooth', notes: [196, 165, 147], durations: [0.12, 0.12, 0.16], filter: 700, decay: 0.24 },
  },
  {
    id: 'bubbo',
    nameHe: 'בַּבּוֹ בָּלוֹן',
    nameLatin: 'Bubbo',
    descHe: 'מַסְטִיק וָרֹד שֶׁמְּנַפֵּחַ בּוּעוֹת עֲנָק',
    rarity: 'common',
    sound: { waveform: 'sine', notes: [523, 392, 659], durations: [0.09, 0.09, 0.14], filter: 1800, decay: 0.2 },
  },

  // --- Uncommon (28%) — 8 goo/sec ---
  {
    id: 'skwibbly',
    nameHe: 'סְקְוִיבְּלִי דוֹפּ',
    nameLatin: 'Skwibbly Dop',
    descHe: 'קְפִיץ עִם מַקּוֹר שֶׁקּוֹפֵץ בְּלִי הַפְסָקָה',
    rarity: 'uncommon',
    sound: { waveform: 'sine', notes: [300, 900, 500], durations: [0.16, 0.1, 0.1], filter: 2500, decay: 0.24 },
  },
  {
    id: 'tikko',
    nameHe: 'טִיקוֹ טַאקוֹ',
    nameLatin: 'Tikko Takko',
    descHe: 'שָׁעוֹן שֶׁתָּמִיד רָץ קְצָת מְאוּחָר',
    rarity: 'uncommon',
    sound: { waveform: 'square', notes: [880, 660, 880, 660], durations: [0.07, 0.07, 0.07, 0.07], filter: 3000, decay: 0.16 },
  },
  {
    id: 'mumbo',
    nameHe: 'מוּמְבּוֹ פְלוֹמְפּ',
    nameLatin: 'Mumbo Flomp',
    descHe: 'פִּטְרִיָּה עִם שָׂפָם מְפוֹאָר',
    rarity: 'uncommon',
    sound: { waveform: 'sine', notes: [180, 140, 220], durations: [0.14, 0.12, 0.18], filter: 900, decay: 0.28 },
  },
  {
    id: 'kaktuki',
    nameHe: 'קַקְטוּקִי',
    nameLatin: 'Kaktuki',
    descHe: 'קַקְטוּס עַקְצָנִי עִם לֵב רַךְ',
    rarity: 'uncommon',
    sound: { waveform: 'triangle', notes: [294, 370, 440], durations: [0.1, 0.1, 0.16], filter: 1500, decay: 0.24 },
  },

  // --- Rare (10.5%) — 50 goo/sec ---
  {
    id: 'zapparoo',
    nameHe: 'זַאפַּארוּ',
    nameLatin: 'Zapparoo',
    descHe: 'בָּרָק שֶׁקּוֹפֵץ כְּמוֹ קֶנְגּוּרוּ',
    rarity: 'rare',
    sound: { waveform: 'sawtooth', notes: [1200, 300, 1000], durations: [0.06, 0.1, 0.14], filter: 4000, decay: 0.24 },
  },
  {
    id: 'chompolino',
    nameHe: "צ'וֹמְפּוֹלִינוֹ",
    nameLatin: 'Chompolino',
    descHe: 'שֵׁן עֲנָקִית שֶׁאוֹהֶבֶת לִנְשֹׁךְ',
    rarity: 'rare',
    sound: { waveform: 'square', notes: [200, 160, 520], durations: [0.1, 0.1, 0.14], filter: 1600, decay: 0.26 },
  },
  {
    id: 'flamo',
    nameHe: 'פְלֵיימוֹ',
    nameLatin: 'Flamo',
    descHe: 'לֶהָבָה קְטַנָּה שֶׁלֹּא נִכְבֵּית לְעוֹלָם',
    rarity: 'rare',
    sound: { waveform: 'sawtooth', notes: [520, 780, 1040], durations: [0.08, 0.1, 0.16], filter: 3200, decay: 0.28 },
  },
  {
    id: 'kristalo',
    nameHe: 'קְרִיסְטָלוֹ',
    nameLatin: 'Kristalo',
    descHe: 'יַהֲלוֹם חַי שֶׁמְּנַצְנֵץ בְּכָל הַצְּבָעִים',
    rarity: 'rare',
    sound: { waveform: 'sine', notes: [880, 1175, 1568], durations: [0.09, 0.09, 0.16], filter: 5000, decay: 0.3 },
  },

  // --- Legendary (1.5%) — 350 goo/sec ---
  {
    id: 'gigablorf',
    nameHe: 'גִּיגַּבְּלוֹרְף',
    nameLatin: 'Gigablorf',
    descHe: 'עַיִן אַחַת עֲנָקִית עַל מִגְדָּל רוֹעֵד',
    rarity: 'legendary',
    sound: {
      waveform: 'sine',
      notes: [80, 160, 240, 320, 400],
      durations: [0.14, 0.12, 0.12, 0.12, 0.2],
      filter: 3200,
      decay: 0.4,
    },
  },
  {
    id: 'dragapuf',
    nameHe: 'דְּרַגַפָּף',
    nameLatin: 'Dragapuf',
    descHe: 'דְּרָקוֹן פִּצְפּוֹן שֶׁנּוֹשֵׁף עָשָׁן מָתוֹק',
    rarity: 'legendary',
    sound: {
      waveform: 'square',
      notes: [130, 196, 262, 392, 523],
      durations: [0.12, 0.12, 0.12, 0.12, 0.22],
      filter: 2600,
      decay: 0.42,
    },
  },
  {
    id: 'galaxo',
    nameHe: 'גָּלַקְסוֹ',
    nameLatin: 'Galaxo',
    descHe: 'כּוֹכָב שֶׁנּוֹשֵׂא גָּלַקְסִיָּה שְׁלֵמָה בְּתוֹכוֹ',
    rarity: 'legendary',
    sound: {
      waveform: 'triangle',
      notes: [440, 587, 784, 1047, 1319],
      durations: [0.12, 0.12, 0.12, 0.12, 0.24],
      filter: 4200,
      decay: 0.45,
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
