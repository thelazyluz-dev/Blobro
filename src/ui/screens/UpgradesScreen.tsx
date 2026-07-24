// Screen 4 — upgrades (§10.4). The "finger" upgrade: cost, effect, current
// level. Button disabled when there isn't enough goo.

import { fingerEffectPerLevel } from '../../game/balance';
import { formatGoo } from '../../game/format';
import { selectClickPower, selectFingerCost, useGame } from '../../store';

export function UpgradesScreen() {
  const goo = useGame((s) => s.goo);
  const fingerLevel = useGame((s) => s.fingerLevel);
  const cost = useGame(selectFingerCost);
  const perClick = useGame(selectClickPower);
  const buyFinger = useGame((s) => s.buyFinger);

  const canAfford = goo >= cost;
  const missing = Math.max(0, cost - goo);

  return (
    <div className="flex h-full flex-col px-5 py-6">
      <header className="mb-4 text-center">
        <h1 className="font-display text-3xl text-bone">שְׁדְרוּגִים</h1>
        <p className="mt-1 text-sm text-bone/60">מחזקים את הנגיעה</p>
      </header>

      <div className="rounded-3xl bg-black/30 p-5 ring-1 ring-bone/10">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-xl text-bone">אֶצְבַּע חֲזָקָה</div>
            <div className="text-sm text-bone/60 tabular">רמה {fingerLevel}</div>
          </div>
          <div className="text-end">
            <div className="text-xs text-bone/50">כל נגיעה נותנת</div>
            <div className="text-lg text-goo tabular">{formatGoo(perClick)} גּוּ</div>
          </div>
        </div>

        <div className="mt-3 text-sm text-cy">
          שדרוג: +{fingerEffectPerLevel} לכל נגיעה
        </div>

        <button
          type="button"
          onClick={buyFinger}
          disabled={!canAfford}
          className={`mt-4 w-full rounded-2xl py-4 font-display text-xl transition ${
            canAfford
              ? 'bg-goo text-void active:scale-95'
              : 'cursor-not-allowed bg-void/60 text-bone/40 ring-2 ring-bone/10'
          }`}
        >
          שַׁדְרֵג — {formatGoo(cost)} גּוּ
        </button>
        {!canAfford && (
          <p className="mt-3 text-center text-sm text-cy tabular">חסר עוד {formatGoo(missing)} גּוּ</p>
        )}
      </div>
    </div>
  );
}
