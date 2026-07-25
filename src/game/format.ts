// One shared compact number formatter (CLAUDE.md). Values reach the millions;
// format consistently from milestone 1 so we never retrofit every screen.

const UNITS: Array<{ value: number; suffix: string }> = [
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
];

function trimTrailingZero(s: string): string {
  return s.replace(/\.0$/, '');
}

/** Full number with thousands separators — e.g. 1_234_567 → "1,234,567".
 * Used as a fine-grained indicator under the compact counter so big totals
 * visibly tick up (compact form barely changes between, say, 1M and 1.1M). */
export function formatExact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.floor(Math.max(0, value)).toLocaleString('en-US');
}

/**
 * Like formatGoo but with MANY running decimals, for the big hero counter so it
 * visibly ticks even when huge (e.g. 23_956_200_968_445 → "23.956201T"). Keeps
 * ~7 significant figures, so the last digits move every fraction of a second at
 * normal income instead of freezing between whole units.
 */
export function formatGooLive(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const n = Math.max(0, value);
  if (n < 1000) return Math.floor(n).toString();
  for (const { value: unit, suffix } of UNITS) {
    if (n >= unit) {
      const scaled = n / unit;
      const intDigits = Math.floor(Math.log10(scaled)) + 1;
      const decimals = Math.min(6, Math.max(2, 7 - intDigits));
      return scaled.toFixed(decimals) + suffix;
    }
  }
  return Math.floor(n).toString();
}

/** e.g. 950 → "950", 1200 → "1.2K", 4_700_000 → "4.7M", 2.1e9 → "2.1B" */
export function formatGoo(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const negative = value < 0;
  const n = Math.abs(value);
  const sign = negative ? '-' : '';

  if (n < 1000) return sign + Math.floor(n).toString();

  for (const { value: unit, suffix } of UNITS) {
    if (n >= unit) {
      const scaled = n / unit;
      const str = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
      return sign + trimTrailingZero(str) + suffix;
    }
  }
  return sign + Math.floor(n).toString();
}
