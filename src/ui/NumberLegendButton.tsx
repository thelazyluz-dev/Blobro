// The number-legend opener (what K/M/B/T/Qa mean).
//
// It lives in the top bar rather than on the play area. It was originally the
// goo counter itself — a ~200x96 tap target directly above the blob, so a tap
// that landed high opened a modal instead of scoring. Moving it into the
// bottom info row fixed that but pushed the row onto a second line, which ate
// vertical space on the most crowded screen in the game for a button almost
// nobody presses twice. The top bar already has a spacer with room in it and
// costs no extra height at all.

import { useGame } from '../store';
import { haptic } from './haptics';

export function NumberLegendButton() {
  const setOpen = useGame((s) => s.setNumberLegendOpen);
  return (
    <button
      type="button"
      onClick={() => {
        setOpen(true);
        haptic(10);
      }}
      aria-label="מקרא מספרים"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/40 text-lg ring-1 ring-hairline active:scale-90"
    >
      🔢
    </button>
  );
}
