// One shared compact number formatter (CLAUDE.md). Values can climb far past a
// trillion in the late game, so the scale runs through the short-scale suffixes
// and falls back to scientific notation only at the truly absurd end.

const UNITS: Array<{ value: number; suffix: string }> = [
  { value: 1e33, suffix: 'Dc' }, // decillion
  { value: 1e30, suffix: 'No' }, // nonillion
  { value: 1e27, suffix: 'Oc' }, // octillion
  { value: 1e24, suffix: 'Sp' }, // septillion
  { value: 1e21, suffix: 'Sx' }, // sextillion
  { value: 1e18, suffix: 'Qi' }, // quintillion
  { value: 1e15, suffix: 'Qa' }, // quadrillion
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
];

/** Strip trailing zeros (and a dangling dot) from a decimal string only. */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
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
  if (n >= 1e36) return n.toExponential(2);
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

  if (n >= 1e36) return sign + n.toExponential(2);

  for (const { value: unit, suffix } of UNITS) {
    if (n >= unit) {
      const scaled = n / unit;
      const str = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
      return sign + trimZeros(str) + suffix;
    }
  }
  return sign + Math.floor(n).toString();
}
