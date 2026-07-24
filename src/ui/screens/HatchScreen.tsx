// Screen 2 — hatching (§10.2). Single reveal + bulk hatch (×10 / all), the next
// egg cost, a pity meter, and a "how much is missing" hint.

import { playError } from '../../audio/sfx';
import {
  bulkHatchMax,
  bulkHatchTen,
  pityLegendaryThreshold,
  pityRareThreshold,
} from '../../game/balance';
import { formatGoo } from '../../game/format';
import { isLegendaryOwned } from '../../game/hatching';
import { selectEggCost, useGame } from '../../store';
import { haptic } from '../haptics';
import { useReducedMotion } from '../useReducedMotion';

export function HatchScreen() {
  const goo = useGame((s) => s.goo);
  const cost = useGame(selectEggCost);
  const sinceRare = useGame((s) => s.sinceRare);
  const totalHatches = useGame((s) => s.totalHatches);
  const characters = useGame((s) => s.characters);
  const tryHatch = useGame((s) => s.tryHatch);
  const hatchMany = useGame((s) => s.hatchMany);
  const reduced = useReducedMotion();

  const canAfford = goo >= cost;
  const missing = Math.max(0, cost - goo);
  const legendaryOwned = isLegendaryOwned(characters);

  const rareLeft = Math.max(0, pityRareThreshold - sinceRare);
  const legLeft = Math.max(0, pityLegendaryThreshold - totalHatches);

  const bulk = (n: number) => {
    if (canAfford) {
      hatchMany(n);
      haptic(20);
    } else {
      playError(useGame.getState().muted);
    }
  };

  return (
    <div className="anim-tab-in flex h-full flex-col items-center justify-between px-6 py-6">
      <header className="text-center">
        <h1 className="font-display text-4xl text-bone">בְּקִיעָה</h1>
        <p className="mt-1 text-sm text-bone/60">בוקעים ביצה — מגלים יצור!</p>
      </header>

      {/* pity meter */}
      <div className="w-full max-w-xs space-y-2">
        <PityBar
          label={rareLeft === 0 ? 'הבקיעה הבאה: נדיר מובטח! ✨' : `עוד ${rareLeft} עד נדיר מובטח`}
          value={sinceRare}
          max={pityRareThreshold}
          color="#FF2E88"
        />
        {!legendaryOwned && (
          <PityBar
            label={legLeft === 0 ? 'אֲגָדִי מובטח!' : `עוד ${legLeft} עד אֲגָדִי מובטח`}
            value={totalHatches}
            max={pityLegendaryThreshold}
            color="#FFD84D"
          />
        )}
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        <div
          className={`pointer-events-none absolute h-56 w-56 rounded-full ${reduced ? '' : 'anim-breathe'}`}
          style={{ background: 'radial-gradient(circle, rgba(255,216,77,0.28), transparent 65%)' }}
        />
        <svg viewBox="0 0 120 150" width="168" height="210" className={reduced ? '' : 'anim-idle'} aria-hidden>
          <ellipse cx="60" cy="82" rx="46" ry="58" fill="#FFF4E0" stroke="#2A1508" strokeWidth="6" strokeLinejoin="round" />
          <path d="M30 78 l10 -10 l8 10 l10 -12 l9 12 l9 -10 l9 10" fill="none" stroke="#A3FF12" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="46" cy="60" rx="9" ry="13" fill="#A3FF12" opacity="0.5" />
          <circle cx="74" cy="66" r="3" fill="#FFD84D" opacity="0.7" />
        </svg>
      </div>

      <div className="w-full max-w-xs text-center">
        <div className="mb-3 inline-block rounded-full bg-black/25 px-4 py-1 text-base text-pop tabular ring-hairline">
          מחיר ביצה: {formatGoo(cost)} גּוּ
        </div>
        <button
          type="button"
          onClick={tryHatch}
          disabled={!canAfford}
          className={`btn w-full py-5 text-3xl ${
            canAfford ? 'bg-hot text-bone glow-hot' : 'bg-surface text-bone/35 ring-hairline'
          }`}
        >
          בְּקַע
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => bulk(bulkHatchTen)}
            disabled={!canAfford}
            className={`btn py-3 text-lg ${
              canAfford ? 'bg-goo text-void' : 'bg-surface text-bone/35 ring-hairline'
            }`}
          >
            בְּקַע ×{bulkHatchTen}
          </button>
          <button
            type="button"
            onClick={() => bulk(bulkHatchMax)}
            disabled={!canAfford}
            className={`btn py-3 text-lg ${
              canAfford ? 'bg-cy text-void' : 'bg-surface text-bone/35 ring-hairline'
            }`}
          >
            בְּקַע הַכֹּל
          </button>
        </div>
        {!canAfford && (
          <p className="mt-3 text-sm text-cy tabular">חסר עוד {formatGoo(missing)} גּוּ</p>
        )}
      </div>
    </div>
  );
}

function PityBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-bone/70">
        <span>{label}</span>
        <span className="tabular">
          {Math.min(value, max)}/{max}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/40 ring-hairline">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
