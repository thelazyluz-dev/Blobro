// Screen 2 — hatching (§10.2). Egg, next egg cost, "בְּקַע" button that shows
// how much is missing when the player can't afford it.

import { formatGoo } from '../../game/format';
import { selectEggCost, useGame } from '../../store';

export function HatchScreen() {
  const goo = useGame((s) => s.goo);
  const cost = useGame(selectEggCost);
  const tryHatch = useGame((s) => s.tryHatch);

  const canAfford = goo >= cost;
  const missing = Math.max(0, cost - goo);

  return (
    <div className="flex h-full flex-col items-center justify-between px-6 py-8">
      <header className="text-center">
        <h1 className="font-display text-3xl text-bone">בְּקִיעָה</h1>
        <p className="mt-1 text-sm text-bone/60">בוקעים ביצה — מגלים יצור!</p>
      </header>

      <div className="flex flex-1 items-center justify-center">
        <svg viewBox="0 0 120 150" width="180" height="225" aria-hidden>
          <ellipse cx="60" cy="82" rx="46" ry="58" fill="#FFF4E0" stroke="#3A1F10" strokeWidth="6" strokeLinejoin="round" />
          <path d="M30 78 l10 -10 l8 10 l10 -12 l9 12 l9 -10 l9 10" fill="none" stroke="#A3FF12" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="46" cy="60" rx="9" ry="13" fill="#A3FF12" opacity="0.5" />
        </svg>
      </div>

      <div className="w-full max-w-xs text-center">
        <div className="mb-3 text-lg text-pop tabular">מחיר הביצה הבאה: {formatGoo(cost)} גּוּ</div>
        <button
          type="button"
          onClick={tryHatch}
          disabled={!canAfford}
          className={`w-full rounded-2xl py-5 font-display text-2xl transition ${
            canAfford
              ? 'bg-hot text-bone active:scale-95'
              : 'cursor-not-allowed bg-void/60 text-bone/40 ring-2 ring-bone/10'
          }`}
        >
          בְּקַע
        </button>
        {!canAfford && (
          <p className="mt-3 text-sm text-cy tabular">חסר עוד {formatGoo(missing)} גּוּ</p>
        )}
      </div>
    </div>
  );
}
