// Parental gate for the sign-in flow (§ owner report: a child completed
// sign-up alone). Industry-standard mitigation for kid-directed apps: a step a
// young child can't easily pass — an arithmetic question written out in WORDS
// (no digits to pattern-match) that any adult answers instantly.
//
// HONESTY NOTE: this is a parental GATE (a deterrent), not verifiable parental
// consent in the COPPA sense — an older kid who can read and multiply can pass
// it. It raises the bar from "any child taps through" to "requires an adult or
// an older reader", which is the practical ceiling for a web app without
// payment-card or ID checks. The legal-consent question still needs counsel.

export interface ParentQuestion {
  /** The multiplication written out in Hebrew words — no digits on screen. */
  textHe: string;
  answer: number;
}

export const parentQuestions: ParentQuestion[] = [
  { textHe: 'שֶׁבַע כָּפוּל שָׁלוֹשׁ', answer: 21 },
  { textHe: 'שֵׁשׁ כָּפוּל אַרְבַּע', answer: 24 },
  { textHe: 'שְׁמוֹנֶה כָּפוּל שָׁלוֹשׁ', answer: 24 },
  { textHe: 'תֵּשַׁע כָּפוּל שָׁלוֹשׁ', answer: 27 },
  { textHe: 'שֶׁבַע כָּפוּל אַרְבַּע', answer: 28 },
  { textHe: 'שֵׁשׁ כָּפוּל חָמֵשׁ', answer: 30 },
  { textHe: 'שְׁמוֹנֶה כָּפוּל אַרְבַּע', answer: 32 },
  { textHe: 'תֵּשַׁע כָּפוּל אַרְבַּע', answer: 36 },
];

export function pickParentQuestion(): ParentQuestion {
  return parentQuestions[Math.floor(Math.random() * parentQuestions.length)];
}

const GATE_KEY = 'blorbo-parent-gate';

/** True once a parent has ever passed the gate on this device (owner call:
 * the gate guards the FIRST sign-in — a device an adult approved once is an
 * approved family device, and re-asking monthly is nagging, not safety). */
export function parentGatePassed(): boolean {
  try {
    return !!localStorage.getItem(GATE_KEY);
  } catch {
    return false; // private mode — just ask again
  }
}

export function rememberParentGate(): void {
  try {
    localStorage.setItem(GATE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}
