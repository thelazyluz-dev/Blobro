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
    <div className="anim-tab-in flex h-full flex-col px-5 py-6">
      <header className="mb-5 text-center">
        <h1 className="font-display text-4xl text-bone">שְׁדְרוּגִים</h1>
        <p className="mt-2 text-sm text-bone/60">מחזקים את הנגיעה</p>
      </header>

      <div className="surface rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-goo/15 text-3xl ring-hairline">
              👆
            </span>
            <div>
              <div className="font-display text-2xl text-bone">אֶצְבַּע חֲזָקָה</div>
              <div className="text-sm text-bone/55 tabular">רמה {fingerLevel}</div>
            </div>
          </div>
          <div className="text-end">
            <div className="text-xs text-bone/50">כל נגיעה</div>
            <div className="text-xl text-goo tabular">{formatGoo(perClick)} גּוּ</div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-black/20 px-3 py-2 text-sm text-cy ring-hairline">
          שדרוג: +{fingerEffectPerLevel} לכל נגיעה
        </div>

        <button
          type="button"
          onClick={buyFinger}
          disabled={!canAfford}
          className={`btn mt-4 w-full py-4 text-2xl ${
            canAfford ? 'bg-goo text-void glow-goo' : 'bg-surface text-bone/35 ring-hairline'
          }`}
        >
          שַׁדְרֵג — {formatGoo(cost)} גּוּ
        </button>
        {!canAfford && (
          <p className="mt-3 text-center text-sm text-cy tabular">חסר עוד {formatGoo(missing)} גּוּ</p>
        )}
      </div>

      <p className="mt-auto pt-6 text-center text-xs text-bone/40">
        עוד שדרוגים יגיעו בקרוב…
      </p>
    </div>
  );
}
