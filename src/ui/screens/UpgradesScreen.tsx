// Screen 4 — upgrades (§10.4). A data-driven list of upgrades: cost, effect,
// current level. Each button is disabled when there isn't enough goo.

import { useRef, useState } from 'react';
import { playError, playPurchase } from '../../audio/sfx';
import { formatGoo } from '../../game/format';
import { globalMultiplier } from '../../game/balance';
import { upgradeCost, upgradeDefs, upgradeGainHe, upgradeTotalHe } from '../../game/upgrades';
import type { UpgradeId } from '../../game/types';
import { haptic } from '../haptics';
import { selectClickPower, selectGooPerSec, selectMods, useGame } from '../../store';

export function UpgradesScreen() {
  const clickP = useGame(selectClickPower);
  const rate = useGame(selectGooPerSec);

  return (
    <div className="anim-tab-in h-full overflow-y-auto px-5 py-6">
      <header className="mb-4 text-center">
        <h1 className="font-display text-4xl text-bone">שְׁדְרוּגִים</h1>
        <p className="mt-2 text-sm text-bone/60">מחזקים את הנגיעה ואת היצורים</p>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="לכל נגיעה" value={`${formatGoo(clickP)} גּוּ`} color="text-goo" />
        <Stat label="לשנייה" value={`${formatGoo(rate)} גּוּ`} color="text-cy" />
      </div>

      <div className="flex flex-col gap-3 pb-4">
        {upgradeDefs.map((def) => (
          <UpgradeCard key={def.id} id={def.id} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="surface rounded-2xl px-4 py-3 text-center">
      <div className="text-xs text-bone/50">{label}</div>
      <div className={`font-display text-xl tabular ${color}`}>{value}</div>
    </div>
  );
}

function UpgradeCard({ id }: { id: UpgradeId }) {
  const def = upgradeDefs.find((d) => d.id === id)!;
  const goo = useGame((s) => s.goo);
  const level = useGame((s) => s.upgrades[id]);
  const buy = useGame((s) => s.buyUpgrade);
  const m = useGame(selectMods);
  const rate = useGame(selectGooPerSec);
  const [shake, setShake] = useState(false);
  const shakeTimer = useRef<number>();
  // Floating "+X" that pops on each purchase, showing exactly what was gained.
  const [gain, setGain] = useState<{ text: string; key: number } | null>(null);

  // For the "strong finger" line: the multiplier applied to its tap-base bonus,
  // so the shown number is the real per-tap gain, not the raw base.
  const tapMult = m.clickMultiplier * m.starMultiplier * globalMultiplier;

  const cost = upgradeCost(id, level);
  const canAfford = goo >= cost;
  const missing = Math.max(0, cost - goo);

  const onBuy = () => {
    const muted = useGame.getState().muted;
    if (canAfford) {
      buy(id);
      playPurchase(muted);
      haptic(15);
      setGain({ text: upgradeGainHe(id, level + 1, tapMult), key: Date.now() });
    } else {
      playError(muted);
      setShake(true);
      window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShake(false), 300);
    }
  };

  return (
    <div className={`surface relative rounded-2xl p-4 ${shake ? 'anim-squash' : ''}`}>
      {gain && (
        <span
          key={gain.key}
          className="anim-float-up pointer-events-none absolute left-1/2 top-8 z-10 whitespace-nowrap font-display text-lg text-goo"
          style={{ textShadow: '0 2px 10px #000' }}
          onAnimationEnd={() => setGain(null)}
        >
          {gain.text}
        </span>
      )}
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-black/25 text-3xl ring-hairline">
          {def.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-display text-xl text-bone">{def.nameHe}</div>
            <div className="shrink-0 text-sm text-pop tabular">רמה {level}</div>
          </div>
          <div className="text-sm text-cy">{def.effectHe}</div>
          {level > 0 && (
            <div className="mt-0.5 text-xs font-bold text-goo tabular">{upgradeTotalHe(id, level, tapMult)}</div>
          )}
          {/* Robotic hand: show the concrete goo/sec it's adding right now, so its
              effect is visible instead of an abstract percentage. */}
          {id === 'autoTap' && level > 0 && m.autoTapFraction > 0 && (
            <div className="mt-0.5 text-xs text-cy tabular">
              🤖 מוֹסִיפָה כָּעֵת +{formatGoo((rate * m.autoTapFraction) / (1 + m.autoTapFraction))} גּוּ/שנייה
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onBuy}
        className={`btn mt-3 w-full py-3 text-lg ${
          canAfford ? 'bg-goo text-void glow-goo' : 'bg-black/30 text-bone/45 ring-hairline'
        }`}
      >
        {canAfford ? (
          <>שַׁדְרֵג — {formatGoo(cost)} גּוּ</>
        ) : (
          <span className="tabular">חסר {formatGoo(missing)} גּוּ</span>
        )}
      </button>
    </div>
  );
}
