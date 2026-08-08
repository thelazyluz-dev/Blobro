// Number legend (§ user request) — a quick reference for what the K / M / B / T…
// suffixes on the goo counter mean, and just how big each one is. Opened by
// tapping the big goo counter on the main screen.
//
// The ladder is the SAME one the counter uses (game/format.ts SCALES), so every
// suffix a player sees on screen — now all the way up to a duotrigintillion — is
// explained here, capped by the googol: the game's victory summit.

import { useEffect, useRef } from 'react';
import { SCALES } from '../game/format';
import { useGame } from '../store';

interface Row {
  suffix: string; // the compact HUD tag (or an emoji, for the googol)
  nameHe: string;
  zeros: number; // number of zeros after the 1
}

// The full counter ladder, plus the googol (1e100) as a special crowned final
// row — the win. (A googol is not an "-illion", so the counter shows it as a
// small multiple of the previous suffix; here it gets its own famous name.)
const ROWS: Row[] = [
  ...SCALES.map((s) => ({ suffix: s.suffix, nameHe: s.nameHe, zeros: s.exp })),
  { suffix: '👑', nameHe: 'גּוּגּוֹל — הַנִּצָּחוֹן!', zeros: 100 },
];

export function NumberLegendOverlay() {
  const open = useGame((s) => s.numberLegendOpen);
  const setOpen = useGame((s) => s.setNumberLegendOpen);
  const goo = useGame((s) => s.goo);

  // Scroll the current tier into view ONCE when the panel opens — doing it on
  // every render (as an inline ref callback did) re-snaps the scroll and traps
  // the user on the highlighted row, so they can't scroll past it.
  const hereRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) hereRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  if (!open) return null;

  // Which tier the player is standing in right now: the biggest row whose value
  // the current goo has reached. -1 = still below the first suffix (under 1,000).
  let currentZeros = -1;
  for (const r of ROWS) if (goo >= Math.pow(10, r.zeros)) currentZeros = r.zeros;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-6"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="surface anim-pop-in flex max-h-[86vh] w-full max-w-sm flex-col rounded-3xl p-5"
        style={{ boxShadow: '0 0 0 2px #A3FF12, 0 24px 60px -20px #000' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-1 text-center font-display text-3xl text-bone">🔢 מַקְרָא מִסְפָּרִים</div>
        <p className="mb-3 text-center text-xs text-bone/55">כָּל אוֹת לְיַד הַמִּסְפָּר אוֹמֶרֶת כַּמָּה הוּא גָּדוֹל!</p>

        <div className="flex flex-col gap-1.5 overflow-y-auto pe-1">
          {ROWS.map((r) => {
            const here = r.zeros === currentZeros;
            return (
              <div
                key={r.zeros}
                ref={here ? hereRef : undefined}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                  here ? 'bg-goo/20 ring-2 ring-goo' : 'bg-black/25 ring-hairline'
                }`}
              >
                <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-goo/15 px-2 font-display text-base text-goo ring-1 ring-goo/40">
                  {r.suffix}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base text-bone">{r.nameHe}</div>
                  <div className="text-[11px] text-bone/50" dir="ltr">
                    1 ואחריו {r.zeros} אפסים
                  </div>
                </div>
                {here ? (
                  <span className="shrink-0 rounded-full bg-goo px-2 py-1 font-display text-xs text-void">
                    📍 אַתָּה כָּאן
                  </span>
                ) : (
                  <div className="shrink-0 font-display text-sm text-cy tabular" dir="ltr">
                    10<sup>{r.zeros}</sup>
                  </div>
                )}
              </div>
            );
          })}
          <p className="mt-1 px-1 text-center text-[11px] text-bone/45">
            הַגּוּגּוֹל הוּא הַנִּצָּחוֹן — וְאֶפְשָׁר לְהַמְשִׁיךְ עוֹד! ♾️
          </p>
        </div>

        <button type="button" onClick={() => setOpen(false)} className="btn mt-4 w-full bg-cy py-3 text-lg text-void">
          סְגוֹר
        </button>
      </div>
    </div>
  );
}
