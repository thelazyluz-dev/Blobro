// Screen 2 — hatching (§10.2). Egg, next egg cost, "בְּקַע" button that shows
// how much is missing when the player can't afford it.

import { formatGoo } from '../../game/format';
import { selectEggCost, useGame } from '../../store';
import { useReducedMotion } from '../useReducedMotion';

export function HatchScreen() {
  const goo = useGame((s) => s.goo);
  const cost = useGame(selectEggCost);
  const tryHatch = useGame((s) => s.tryHatch);
  const reduced = useReducedMotion();

  const canAfford = goo >= cost;
  const missing = Math.max(0, cost - goo);

  return (
    <div className="anim-tab-in flex h-full flex-col items-center justify-between px-6 py-8">
      <header className="text-center">
        <h1 className="font-display text-4xl text-bone">בְּקִיעָה</h1>
        <p className="mt-2 text-sm text-bone/60">בוקעים ביצה — מגלים יצור!</p>
      </header>

      <div className="relative flex flex-1 items-center justify-center">
        <div
          className={`pointer-events-none absolute h-64 w-64 rounded-full ${reduced ? '' : 'anim-breathe'}`}
          style={{ background: 'radial-gradient(circle, rgba(255,216,77,0.28), transparent 65%)' }}
        />
        <svg viewBox="0 0 120 150" width="192" height="240" className={reduced ? '' : 'anim-idle'} aria-hidden>
          <ellipse cx="60" cy="82" rx="46" ry="58" fill="#FFF4E0" stroke="#3A1F10" strokeWidth="6" strokeLinejoin="round" />
          <path d="M30 78 l10 -10 l8 10 l10 -12 l9 12 l9 -10 l9 10" fill="none" stroke="#A3FF12" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="46" cy="60" rx="9" ry="13" fill="#A3FF12" opacity="0.5" />
          <circle cx="74" cy="66" r="3" fill="#FFD84D" opacity="0.7" />
        </svg>
      </div>

      <div className="w-full max-w-xs text-center">
        <div className="mb-3 inline-block rounded-full bg-black/25 px-4 py-1 text-base text-pop tabular ring-hairline">
          מחיר הביצה הבאה: {formatGoo(cost)} גּוּ
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
        {!canAfford && (
          <p className="mt-3 text-sm text-cy tabular">חסר עוד {formatGoo(missing)} גּוּ</p>
        )}
      </div>
    </div>
  );
}
