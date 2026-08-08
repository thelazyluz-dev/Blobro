// Number legend (§ user request) — a quick reference for what the K / M / B / T…
// suffixes on the goo counter mean, and just how big each one is. Opened by
// tapping the big goo counter on the main screen.

import { useEffect, useRef } from 'react';
import { useGame } from '../store';

interface Row {
  suffix: string;
  nameHe: string;
  zeros: number; // number of zeros after the 1
}

// The counter's own short-scale suffix ladder (game/format.ts): a letter badge
// on each, exactly as it appears on screen up to a decillion.
const ROWS: Row[] = [
  { suffix: 'K', nameHe: 'אֶלֶף', zeros: 3 },
  { suffix: 'M', nameHe: 'מִילְיוֹן', zeros: 6 },
  { suffix: 'B', nameHe: 'מִילְיַארְד', zeros: 9 },
  { suffix: 'T', nameHe: 'טְרִילְיוֹן', zeros: 12 },
  { suffix: 'Qa', nameHe: 'קְוַדְרִילְיוֹן', zeros: 15 },
  { suffix: 'Qi', nameHe: 'קְוִינְטִילְיוֹן', zeros: 18 },
  { suffix: 'Sx', nameHe: 'סֶקְסְטִילְיוֹן', zeros: 21 },
  { suffix: 'Sp', nameHe: 'סֶפְּטִילְיוֹן', zeros: 24 },
  { suffix: 'Oc', nameHe: 'אוֹקְטִילְיוֹן', zeros: 27 },
  { suffix: 'No', nameHe: 'נוֹנִילְיוֹן', zeros: 30 },
  { suffix: 'Dc', nameHe: 'דֶצִילְיוֹן', zeros: 33 },
];

// Beyond a decillion the counter switches to "10 בחזקת" form (e.g. 1.00e+100),
// so there's no letter suffix to show — an emoji badge marks each landmark
// instead. These are the same real-world anchors the milestone celebrations use
// (§ owner request: extend the legend all the way to a googol), ending on the
// googol — the game's victory summit.
const BEYOND: Row[] = [
  { suffix: '🌍', nameHe: 'כְּמוֹ הָאָטוֹמִים בְּכַדּוּר הָאָרֶץ', zeros: 50 },
  { suffix: '☀️', nameHe: 'כְּמוֹ הָאָטוֹמִים בַּשֶּׁמֶשׁ', zeros: 57 },
  { suffix: '🌌', nameHe: 'כְּמוֹ הָאָטוֹמִים בְּכָל הַיְּקוּם', zeros: 80 },
  { suffix: '👑', nameHe: 'גּוּגּוֹל — הַנִּצָּחוֹן!', zeros: 100 },
];

const ALL_ROWS: Row[] = [...ROWS, ...BEYOND];

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
  for (const r of ALL_ROWS) if (goo >= Math.pow(10, r.zeros)) currentZeros = r.zeros;

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
          {ALL_ROWS.map((r) => {
            const here = r.zeros === currentZeros;
            return (
              <div
                key={r.suffix}
                ref={here ? hereRef : undefined}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                  here ? 'bg-goo/20 ring-2 ring-goo' : 'bg-black/25 ring-hairline'
                }`}
              >
                <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-goo/15 px-2 font-display text-lg text-goo ring-1 ring-goo/40">
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
            מֵעַל דֶּצִילְיוֹן הַמִּסְפָּר נִכְתָּב כְּ"10 בְּחֶזְקַת" (לְמָשָׁל e+50). הַגּוּגּוֹל הוּא הַנִּצָּחוֹן — וְאֶפְשָׁר לְהַמְשִׁיךְ עוֹד! 👑
          </p>
        </div>

        <button type="button" onClick={() => setOpen(false)} className="btn mt-4 w-full bg-cy py-3 text-lg text-void">
          סְגוֹר
        </button>
      </div>
    </div>
  );
}
