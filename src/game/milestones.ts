// Milestone facts (§ user request). When lifetime goo crosses one of these
// amounts, the game throws a celebration with a real-world comparison — so a
// giant, abstract number suddenly *means* something ("that's the distance to
// the Moon in metres!"). Data only, pure. Sorted ascending by `goo`.
//
// Facts are kept accurate and deliberately vivid. The population, atom-count and
// astronomy figures are real but approximate (and a few, like world population,
// drift over time) — they were re-verified August 2026, so revisit occasionally.

export interface Milestone {
  goo: number;
  titleHe: string; // short celebratory headline (with nikud, kids read it)
  factHe: string; // the interesting comparison (plain Hebrew)
  emoji: string;
}

export const milestones: Milestone[] = [
  {
    goo: 1_000_000,
    titleHe: 'מִילְיוֹן גּוּ!',
    factHe: 'אם היית סופר גּוּ אחד כל שנייה, היה לוקח לך 11 ימים שלמים להגיע לכאן!',
    emoji: '🎉',
  },
  {
    goo: 10_000_000,
    titleHe: 'עֲשָׂרָה מִילְיוֹן!',
    factHe: 'בערך מספר הצעדים שאדם צועד בשלוש עד ארבע שנים של הליכה.',
    emoji: '🚶',
  },
  {
    goo: 40_000_000,
    titleHe: 'הֶקֵּף כַּדּוּר הָאָרֶץ!',
    factHe: 'צברת גּוּ כמספר המטרים בהקפה שלמה של כדור הארץ (40 מיליון מטר)!',
    emoji: '🌍',
  },
  {
    goo: 100_000_000,
    titleHe: 'מֵאָה מִילְיוֹן!',
    factHe: 'זה בערך פי עשר מכל האנשים שגרים במדינת ישראל!',
    emoji: '🇮🇱',
  },
  {
    goo: 384_000_000,
    titleHe: 'הַמֶּרְחָק לַיָּרֵחַ!',
    factHe: 'צברת גּוּ כמספר המטרים מכדור הארץ עד הירח!',
    emoji: '🌙',
  },
  {
    goo: 500_000_000,
    titleHe: 'חֲצִי מִילְיַארְד!',
    factHe: 'אם תתחיל לספור עכשיו שנייה־שנייה, תסיים רק בעוד 16 שנה!',
    emoji: '⏳',
  },
  {
    goo: 1_000_000_000,
    titleHe: 'מִילְיַארְד גּוּ!!',
    factHe: 'מיליארד דקות הן כמעט 1,900 שנה — בחזרה לימי האימפריה הרומית!',
    emoji: '🏛️',
  },
  {
    goo: 8_000_000_000,
    titleHe: 'כָּל בְּנֵי הָאָדָם!',
    factHe: 'בערך כמספר כל האנשים שחיים על כדור הארץ כרגע — מעל שמונה מיליארד!',
    emoji: '👨‍👩‍👧‍👦',
  },
  {
    goo: 100_000_000_000,
    titleHe: 'כּוֹכְבֵי הַגָּלַקְסִיָּה!',
    factHe: 'בערך מספר הכוכבים בגלקסיה שלנו, שביל החלב!',
    emoji: '✨',
  },
  {
    goo: 150_000_000_000,
    titleHe: 'מֵהָאָרֶץ לַשֶּׁמֶשׁ!',
    factHe: 'צברת גּוּ כמספר המטרים מכדור הארץ עד השמש (150 מיליארד)!',
    emoji: '☀️',
  },
  {
    goo: 240_000_000_000,
    titleHe: 'כָּל הָאֲנָשִׁים אֵי פַּעַם!',
    factHe: 'יותר מכל בני האדם שחיו על כדור הארץ מאז ומעולם — פי שניים!',
    emoji: '🌐',
  },
  {
    goo: 500_000_000_000,
    titleHe: 'חֲצִי טְרִילְיוֹן!',
    factHe: 'חצי טריליון שניות הן כמעט 16,000 שנה — עוד לפני שהמציאו את החקלאות!',
    emoji: '⏳',
  },
  {
    goo: 1_000_000_000_000,
    titleHe: 'טְרִילְיוֹן גּוּ!!!',
    factHe: 'טריליון שניות הן יותר מ־31,000 שנה — מלפני שבני האדם המציאו את הכתב!',
    emoji: '🏆',
  },
  {
    goo: 5_000_000_000_000,
    titleHe: 'חֲמִשָּׁה טְרִילְיוֹן!',
    factHe: 'פי 600 מכל האנשים שחיים על כדור הארץ כרגע!',
    emoji: '👥',
  },
  {
    goo: 37_000_000_000_000,
    titleHe: 'כָּל הַתָּאִים בְּגוּפְךָ!',
    factHe: 'בגוף האדם יש בערך 37 טריליון תאים — והגעת בדיוק לשם!',
    emoji: '🧬',
  },
  {
    goo: 9_460_000_000_000_000,
    titleHe: 'שְׁנַת אוֹר!',
    factHe: 'צברת גּוּ כמספר המטרים שהאור עובר בשנה שלמה (9.46 קוודריליון)!',
    emoji: '🌌',
  },
  {
    goo: 7_500_000_000_000_000_000,
    titleHe: 'כָּל גַּרְגִּירֵי הַחוֹל!',
    factHe: 'בערך מספר גרגירי החול בכל חופי הים בעולם כולו!',
    emoji: '🏖️',
  },
  {
    goo: 1e21,
    titleHe: 'כָּל מֵי הָאוֹקְיָנוֹסִים!',
    factHe: 'בערך מספר הליטרים של כל המים בכל האוקיינוסים על כדור הארץ!',
    emoji: '🌊',
  },
  {
    goo: 6e23,
    titleHe: 'מִסְפַּר אָבוֹגָדְרוֹ!',
    factHe: 'בערך מספר מולקולות המים בכף מים (18 גרם) — "מספר אבוגדרו" מהמדע!',
    emoji: '💧',
  },
  {
    // ~7×10²⁷ atoms in a human body — the milestone sits on the real figure so
    // the "all the atoms in your body" claim is literally true (was 1e27, ~7× low).
    goo: 7e27,
    titleHe: 'כָּל הָאָטוֹמִים בַּגּוּף!',
    factHe: 'בערך מספר האטומים הזעירים שמרכיבים את כל הגוף שלך!',
    emoji: '⚛️',
  },
  {
    // ~5×10³⁰ bacteria on Earth (Whitman et al.) — sit the milestone on the real
    // figure so "all the bacteria in the world" is accurate (was 1e30, ~5× low).
    goo: 5e30,
    titleHe: 'כָּל הַחַיְדַּקִּים בָּעוֹלָם!',
    factHe: 'בערך מספר כל החיידקים הקטנטנים שחיים על כדור הארץ כולו!',
    emoji: '🦠',
  },
  {
    goo: 1e33,
    titleHe: 'דֶצִילְיוֹן!',
    factHe: 'הַמִּסְפָּר הָאַגָּדִי: 1 וְאַחֲרָיו 33 אֲפָסִים! אֲבָל זֶה עֲדַיִן רַק הַהַתְחָלָה שֶׁל הַדֶּרֶךְ לַגּוּגּוֹל. 🏆',
    emoji: '👑',
  },
  // The long climb to the googol "win" (1e100 — see balance.googolWinGoo). Real
  // cosmic anchors where they exist (atoms in the Earth, the Sun, the whole
  // observable universe), playful pats in between, so the number keeps meaning
  // something all the way up. The ceiling (MAX_GOO) sits ABOVE the googol, so
  // every one of these — including the final 1e100 — is reachable.
  {
    goo: 1e40,
    titleHe: 'מֵעֵבֶר לַדִּמְיוֹן!',
    factHe: 'מִסְפָּר כָּל כָּךְ עֲנָק שֶׁקָּשֶׁה בִּכְלָל לְדַמְיֵן אוֹתוֹ — מִכָּאן מַתְחִיל הֶחָלָל הָאֲמִתִּי! 🌌',
    emoji: '🌌',
  },
  {
    goo: 1e50,
    titleHe: 'כָּל הָאָטוֹמִים בְּכַדּוּר הָאָרֶץ!',
    factHe: 'בְּעֵרֶךְ מִסְפַּר כָּל הָאָטוֹמִים שֶׁמַּרְכִּיבִים אֶת כָּל כַּדּוּר הָאָרֶץ כֻּלּוֹ! 🌍',
    emoji: '🌍',
  },
  {
    goo: 1e57,
    titleHe: 'כָּל הָאָטוֹמִים בַּשֶּׁמֶשׁ!',
    factHe: 'בְּעֵרֶךְ מִסְפַּר כָּל הָאָטוֹמִים בַּשֶּׁמֶשׁ הָעֲנָקִית — כּוֹכָב שָׁלֵם שֶׁל גּוּ! ☀️',
    emoji: '☀️',
  },
  {
    goo: 1e70,
    titleHe: 'מִסְפָּר בִּלְתִּי נִתְפָּס!',
    factHe: 'כְּבָר גָּדוֹל יוֹתֵר מִכָּל מָה שֶׁקַּיָּם בַּמַּעֲרֶכֶת הַשֶּׁמֶשׁ. אַתָּה בְּלִיגָה שֶׁל עַצְמְךָ! 🪐',
    emoji: '🪐',
  },
  {
    goo: 1e80,
    titleHe: 'כָּל הָאָטוֹמִים בַּיְּקוּם!',
    factHe: 'בְּעֵרֶךְ מִסְפַּר כָּל הָאָטוֹמִים בְּכָל הַיְּקוּם הַנִּצְפֶּה כֻּלּוֹ! גָּדוֹל מִזֶּה כִּמְעַט לֹא קַיָּם. 🌠',
    emoji: '🌠',
  },
  {
    goo: 1e90,
    titleHe: 'כִּמְעַט גּוּגּוֹל!',
    factHe: 'נִשְׁאֲרוּ עוֹד עֶשֶׂר אֲפָסִים בִּלְבַד עַד הַגּוּגּוֹל — הַקְּצֶה הָאֲמִתִּי שֶׁל הַמִּשְׂחָק. קָדִימָה! 🔥',
    emoji: '🔥',
  },
  {
    goo: 1e100,
    titleHe: 'גּוּגּוֹל! נִצַּחְתָּ! 👑',
    factHe: 'הִגַּעְתָּ לְגּוּגּוֹל — 1 וְאַחֲרָיו מֵאָה אֲפָסִים, יוֹתֵר מִכָּל הָאָטוֹמִים בַּיְּקוּם! אַתָּה אַלּוּף הַגּוּגּוֹל. 🏆',
    emoji: '👑',
  },
];

/** The milestones crossed when lifetime goo went from `prev` to `next`,
 * ascending by amount (so the last is always the biggest). */
export function milestonesCrossed(prev: number, next: number): Milestone[] {
  if (next <= prev) return [];
  return milestones.filter((m) => prev < m.goo && m.goo <= next).sort((a, b) => a.goo - b.goo);
}
