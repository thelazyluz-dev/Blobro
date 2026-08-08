// One shared compact number formatter (CLAUDE.md). Values can climb far past a
// trillion in the late game, so the scale runs through the short-scale suffixes
// and falls back to scientific notation only at the truly absurd end.

// The short-scale ladder, one entry per 3 zeros. `suffix` is the compact tag on
// the counter; `nameHe` is the kid-facing Hebrew name (the number legend and the
// "you reached a new scale!" toast both read this). It runs all the way to a
// duotrigintillion (1e99) — one step below a googol — so the counter shows a
// NAMED suffix (…Qa, Qi, … Dtg) across the whole playable range instead of
// falling back to raw scientific notation ("1e42"). Exported as the single
// source of truth shared with NumberLegendOverlay.
export interface Scale {
  exp: number; // number of zeros (a multiple of 3)
  suffix: string; // compact HUD tag
  nameHe: string; // Hebrew scale name (with nikud)
}
export const SCALES: Scale[] = [
  { exp: 3, suffix: 'K', nameHe: 'אֶלֶף' },
  { exp: 6, suffix: 'M', nameHe: 'מִילְיוֹן' },
  { exp: 9, suffix: 'B', nameHe: 'מִילְיַארְד' },
  { exp: 12, suffix: 'T', nameHe: 'טְרִילְיוֹן' },
  { exp: 15, suffix: 'Qa', nameHe: 'קְוַדְרִילְיוֹן' },
  { exp: 18, suffix: 'Qi', nameHe: 'קְוִינְטִילְיוֹן' },
  { exp: 21, suffix: 'Sx', nameHe: 'סֶקְסְטִילְיוֹן' },
  { exp: 24, suffix: 'Sp', nameHe: 'סֶפְּטִילְיוֹן' },
  { exp: 27, suffix: 'Oc', nameHe: 'אוֹקְטִילְיוֹן' },
  { exp: 30, suffix: 'No', nameHe: 'נוֹנִילְיוֹן' },
  { exp: 33, suffix: 'Dc', nameHe: 'דֶצִילְיוֹן' },
  { exp: 36, suffix: 'Ud', nameHe: 'אוּנְדֶּצִילְיוֹן' },
  { exp: 39, suffix: 'Dd', nameHe: 'דוּאוֹדֶצִילְיוֹן' },
  { exp: 42, suffix: 'Td', nameHe: 'טְרֶדֶצִילְיוֹן' },
  { exp: 45, suffix: 'Qad', nameHe: 'קְוַטּוּאוֹרְדֶצִילְיוֹן' },
  { exp: 48, suffix: 'Qid', nameHe: 'קְווִינְדֶצִילְיוֹן' },
  { exp: 51, suffix: 'Sxd', nameHe: 'סֶקְסְדֶצִילְיוֹן' },
  { exp: 54, suffix: 'Spd', nameHe: 'סֶפְּטֶנְדֶצִילְיוֹן' },
  { exp: 57, suffix: 'Ocd', nameHe: 'אוֹקְטוֹדֶצִילְיוֹן' },
  { exp: 60, suffix: 'Nod', nameHe: 'נוֹבֶמְדֶצִילְיוֹן' },
  { exp: 63, suffix: 'Vg', nameHe: 'וִיגִינְטִילְיוֹן' },
  { exp: 66, suffix: 'Uvg', nameHe: 'אוּנְוִיגִינְטִילְיוֹן' },
  { exp: 69, suffix: 'Dvg', nameHe: 'דוּאוֹוִיגִינְטִילְיוֹן' },
  { exp: 72, suffix: 'Tvg', nameHe: 'טְרֶוִיגִינְטִילְיוֹן' },
  { exp: 75, suffix: 'Qavg', nameHe: 'קְוַטּוּאוֹרְוִיגִינְטִילְיוֹן' },
  { exp: 78, suffix: 'Qivg', nameHe: 'קְווִינְוִיגִינְטִילְיוֹן' },
  { exp: 81, suffix: 'Sxvg', nameHe: 'סֶקְסְוִיגִינְטִילְיוֹן' },
  { exp: 84, suffix: 'Spvg', nameHe: 'סֶפְּטֶנְוִיגִינְטִילְיוֹן' },
  { exp: 87, suffix: 'Ocvg', nameHe: 'אוֹקְטוֹוִיגִינְטִילְיוֹן' },
  { exp: 90, suffix: 'Novg', nameHe: 'נוֹבֶמְוִיגִינְטִילְיוֹן' },
  { exp: 93, suffix: 'Tg', nameHe: 'טְרִיגִינְטִילְיוֹן' },
  { exp: 96, suffix: 'Utg', nameHe: 'אוּנְטְרִיגִינְטִילְיוֹן' },
  { exp: 99, suffix: 'Dtg', nameHe: 'דוּאוֹטְרִיגִינְטִילְיוֹן' },
];

// Descending value → suffix, derived from SCALES, for the compact formatters.
const UNITS: Array<{ value: number; suffix: string }> = [...SCALES]
  .reverse()
  .map((s) => ({ value: Math.pow(10, s.exp), suffix: s.suffix }));

// Only the truly astronomical (far above the game's own ceiling, MAX_GOO=1e103)
// ever falls back to scientific notation — so a real counter never shows "1e42".
const SCI_FALLBACK = 1e123;

/** Strip trailing zeros (and a dangling dot) from a decimal string only. */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

// Hebrew scale name by exponent, derived from SCALES. K/M/B/T are familiar to a
// kid, so the "you reached a new scale!" celebration only fires from quadrillion
// (1e15) up — exactly the suffixes (Qa/Qi/Sx…) that read as letter-soup on the
// HUD and now run all the way to a duotrigintillion.
const BIG_SCALE_NAMES_HE: Record<number, string> = Object.fromEntries(
  SCALES.filter((s) => s.exp >= 15).map((s) => [s.exp, s.nameHe]),
);

/** The Hebrew scale name for an order of magnitude, or undefined below 1e15.
 * Floors to the scale's base exponent, so 1e15–1e17 all read "quadrillion". */
export function bigScaleNameHe(exp: number): string | undefined {
  return BIG_SCALE_NAMES_HE[Math.floor(exp / 3) * 3];
}

/** Full number with thousands separators — e.g. 1_234_567 → "1,234,567".
 * Used as a fine-grained indicator under the compact counter so big totals
 * visibly tick up (compact form barely changes between, say, 1M and 1.1M). */
export function formatExact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.floor(Math.max(0, value)).toLocaleString('en-US');
}

/**
 * The big hero counter: a clean compact number with a fixed 2 decimals
 * (e.g. "23.96T"). Stays tidy and stable-width; the fine-grained running
 * movement is shown by the exact full number rendered beneath it.
 */
export function formatGooHero(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const n = Math.max(0, value);
  if (n < 1000) return Math.floor(n).toString();
  if (n >= SCI_FALLBACK) return n.toExponential(2);
  for (const { value: unit, suffix } of UNITS) {
    if (n >= unit) return (n / unit).toFixed(2) + suffix;
  }
  return Math.floor(n).toString();
}

/** e.g. 0.06 → "0.06", 1.28 → "1.28", 950 → "950", 1200 → "1.2K", 2.1e9 → "2.1B" */
export function formatGoo(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const negative = value < 0;
  const n = Math.abs(value);
  const sign = negative ? '-' : '';

  if (n === 0) return '0';

  // Small values: show decimals so tiny per-level gains are visible (e.g. a
  // +0.06/s upgrade) instead of flooring to "0" or "1".
  if (n < 1000) {
    if (n < 10) return sign + trimZeros(n.toFixed(2));
    if (!Number.isInteger(n)) return sign + trimZeros(n.toFixed(1));
    return sign + n.toString();
  }

  if (n >= SCI_FALLBACK) return sign + n.toExponential(2);

  for (const { value: unit, suffix } of UNITS) {
    if (n >= unit) {
      const scaled = n / unit;
      const str = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
      return sign + trimZeros(str) + suffix;
    }
  }
  return sign + Math.floor(n).toString();
}
