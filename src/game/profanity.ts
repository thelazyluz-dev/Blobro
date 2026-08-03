// A light nickname filter for the public leaderboard. Since names are shown to
// everyone (including kids), we block obvious profanity/slurs in Hebrew and
// English. It's intentionally simple — a curated substring blocklist over a
// normalized form (lowercase, niqqud stripped, common leet-speak folded). This
// runs BOTH in the client, where names are entered, and in the Worker on
// POST /submit — see worker/src/rules.ts. It was client-only at first, which
// meant anyone posting to the API by hand could put whatever they liked on a
// board that children read; that gap is closed.

const BLOCKLIST = [
  // English
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard',
  'slut', 'whore', 'nigger', 'nigga', 'faggot', 'retard', 'rape', 'porn', 'sex',
  'penis', 'vagina', 'boobs', 'nazi', 'hitler', 'kys', 'motherfuck',
  // Hebrew
  'זין', 'זיין', 'זיון', 'תזדיין', 'זונה', 'שרמוטה', 'מניאק', 'חרא', 'כוסאמק',
  'כוסית', 'בןזונה', 'מפגר', 'נאצי', 'היטלר',
];

/** Normalize for matching: lowercase, strip niqqud, fold leet-speak, keep only
 * Latin/Hebrew letters. Used only for the check — the stored name is untouched. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '') // Hebrew niqqud / cantillation
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/[^a-z֐-׿]/g, ''); // drop spaces, digits, punctuation, emoji
}

/** True when the nickname is allowed (has real letters and no blocked word). */
export function isCleanNickname(name: string): boolean {
  const n = normalize(name);
  if (!n) return false; // nothing but spaces / symbols / emoji
  return !BLOCKLIST.some((w) => n.includes(w));
}
