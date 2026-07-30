// Milestone facts (§ user request). When lifetime goo crosses one of these
// amounts, the game throws a celebration with a real-world comparison — so a
// giant, abstract number suddenly *means* something ("that's the distance to
// the Moon in metres!"). Data only, pure. Sorted ascending by `goo`.
//
// Facts are kept mostly accurate and are deliberately vivid; wealth comparisons
// use generic categories rather than naming real people (accuracy + fairness).

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
    factHe: 'בערך מספר הצעדים שאדם צועד בארבע שנים של הליכה.',
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
    factHe: 'עם מיליארד כדורי גו אפשר למלא יותר מ-400 בריכות שחייה אולימפיות!',
    emoji: '🏊',
  },
  {
    goo: 8_000_000_000,
    titleHe: 'כָּל בְּנֵי הָאָדָם!',
    factHe: 'יש לך יותר גּוּ מכל האנשים שחיים על כדור הארץ (שמונה מיליארד)!',
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
    titleHe: 'עָשִׁיר כְּמוֹ בֶּזוֹס!',
    factHe: 'צברת גּוּ בערך כמו ההון של ג׳ף בזוס, מייסד אֲמָזוֹן (כ־240 מיליארד)!',
    emoji: '📦',
  },
  {
    goo: 500_000_000_000,
    titleHe: 'הֶעָשִׁיר בָּעוֹלָם!',
    factHe: 'צברת גּוּ כמו ההון של אילון מאסק — האדם הכי עשיר בעולם, הראשון שחצה חצי טריליון!',
    emoji: '🚀',
  },
  {
    goo: 1_000_000_000_000,
    titleHe: 'טְרִילְיוֹן גּוּ!!!',
    factHe: 'טריליון שניות הן יותר מ־31,000 שנה — מלפני שבני האדם המציאו את הכתב!',
    emoji: '🏆',
  },
  {
    goo: 4_000_000_000_000,
    titleHe: 'שְׁוֵה כְּמוֹ אֵפֶּל!',
    factHe: 'הגעת לשווי של אֵפֶּל, החברה היקרה בעולם — בערך 4 טריליון דולר!',
    emoji: '🍎',
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
    titleHe: 'כּוֹכָבִים בַּיְּקוּם!',
    factHe: 'אתה מתקרב למספר כל הכוכבים בכל היקום הידוע. מטורף!',
    emoji: '🔭',
  },
  {
    goo: 6e23,
    titleHe: 'מִסְפַּר אָבוֹגָדְרוֹ!',
    factHe: 'בערך מספר מולקולות המים בכף מים (18 גרם) — "מספר אבוגדרו" מהמדע!',
    emoji: '💧',
  },
];

/** The milestones crossed when lifetime goo went from `prev` to `next`,
 * ascending by amount (so the last is always the biggest). */
export function milestonesCrossed(prev: number, next: number): Milestone[] {
  if (next <= prev) return [];
  return milestones.filter((m) => prev < m.goo && m.goo <= next).sort((a, b) => a.goo - b.goo);
}
