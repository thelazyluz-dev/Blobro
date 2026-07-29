// Screen 2 — eggs (§10.2). New model: you BUY eggs into an inventory (the price
// climbs with every egg acquired), then OPEN them — one at a time by tapping the
// egg crack-by-crack (the reveal overlay), or the whole stash at once with
// "בקע הכל". A pity meter and a "how much is missing" hint round it out.

import { playError, playPurchase } from '../../audio/sfx';
import { pityLegendaryThreshold, pityRareThreshold } from '../../game/balance';
import { formatGoo } from '../../game/format';
import { isLegendaryOwned } from '../../game/hatching';
import { selectEggCost, useGame } from '../../store';
import { EggArt } from '../EggArt';
import { haptic } from '../haptics';
import { useReducedMotion } from '../useReducedMotion';

export function HatchScreen() {
  const goo = useGame((s) => s.goo);
  const cost = useGame(selectEggCost);
  const eggs = useGame((s) => s.eggs);
  const sinceRare = useGame((s) => s.sinceRare);
  const totalHatches = useGame((s) => s.totalHatches);
  const characters = useGame((s) => s.characters);
  const buyEgg = useGame((s) => s.buyEgg);
  const buyEggsMax = useGame((s) => s.buyEggsMax);
  const openEgg = useGame((s) => s.openEgg);
  const openAllEggs = useGame((s) => s.openAllEggs);
  const reduced = useReducedMotion();

  const canAfford = goo >= cost;
  const missing = Math.max(0, cost - goo);
  const hasEggs = eggs > 0;
  const legendaryOwned = isLegendaryOwned(characters);

  const rareLeft = Math.max(0, pityRareThreshold - sinceRare);
  const legLeft = Math.max(0, pityLegendaryThreshold - totalHatches);

  const buy = (all: boolean) => {
    if (!canAfford) {
      playError(useGame.getState().muted);
      return;
    }
    if (all) buyEggsMax();
    else buyEgg();
    playPurchase(useGame.getState().muted);
    haptic(15);
  };

  const open = () => {
    if (!hasEggs) return;
    openEgg();
    haptic(15);
  };

  const openAll = () => {
    if (!hasEggs) return;
    openAllEggs();
    haptic([0, 20, 15, 30]);
  };

  return (
    <div className="anim-tab-in flex h-full flex-col items-center justify-between px-6 py-6">
      <header className="text-center">
        <h1 className="font-display text-4xl text-bone">בְּקִיעָה</h1>
        <p className="mt-1 text-sm text-bone/60">קונים ביצים — פותחים ומגלים יצורים!</p>
      </header>

      {/* pity meter */}
      <div className="w-full max-w-xs space-y-2">
        <PityBar
          label={rareLeft === 0 ? 'הפתיחה הבאה: נדיר מובטח! ✨' : `עוד ${rareLeft} עד נדיר מובטח`}
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

      {/* The stash: tap the egg to open one (crack-by-crack in the overlay). */}
      <div className="relative flex flex-1 items-center justify-center">
        <div
          className={`pointer-events-none absolute h-56 w-56 rounded-full ${reduced ? '' : 'anim-breathe'}`}
          style={{ background: 'radial-gradient(circle, rgba(255,216,77,0.28), transparent 65%)' }}
        />
        <button
          type="button"
          onClick={open}
          disabled={!hasEggs}
          aria-label={hasEggs ? 'פתח ביצה' : 'אין ביצים'}
          className={`relative touch-none select-none rounded-full outline-none transition focus-visible:ring-4 focus-visible:ring-cy ${
            hasEggs ? 'active:scale-95' : 'opacity-60'
          }`}
        >
          <EggArt spotColor="#A3FF12" className={`h-[210px] w-[168px] ${reduced || !hasEggs ? '' : 'anim-idle'}`} />
          {/* inventory count badge */}
          <span
            className="absolute -end-1 -top-1 flex h-9 min-w-9 items-center justify-center rounded-full bg-hot px-2 font-display text-lg text-bone tabular ring-2 ring-void/60"
            style={{ boxShadow: '0 0 14px rgba(255,46,136,0.7)' }}
          >
            {eggs}
          </span>
        </button>
      </div>

      <div className="w-full max-w-xs text-center">
        {hasEggs ? (
          <p className="mb-3 text-sm text-bone/70">לְחַץ עַל הַבֵּיצָה כְּדֵי לִשְׁבֹּר אוֹתָהּ! 🥚</p>
        ) : (
          <p className="mb-3 text-sm text-bone/70">אֵין לְךָ בֵּיצִים — קְנֵה אַחַת!</p>
        )}

        {/* One quick-hatch button opens the whole stash instantly (tapping the
            egg above is the slow, satisfying way to open them one at a time). */}
        {hasEggs && (
          <button type="button" onClick={openAll} className="btn mb-2 w-full bg-hot py-3 text-lg text-bone glow-hot">
            ⚡ בְּקִיעָה מְהִירָה ({eggs})
          </button>
        )}

        {/* Buy controls. */}
        <div className="mb-2 inline-block rounded-full bg-black/25 px-4 py-1 text-base text-pop tabular ring-hairline">
          מְחִיר בֵּיצָה: {formatGoo(cost)} גּוּ
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => buy(false)}
            disabled={!canAfford}
            className={`btn py-4 text-xl ${canAfford ? 'bg-goo text-void glow-goo' : 'bg-surface text-bone/35 ring-hairline'}`}
          >
            קְנֵה בֵּיצָה
          </button>
          <button
            type="button"
            onClick={() => buy(true)}
            disabled={!canAfford}
            className={`btn py-4 text-xl ${canAfford ? 'bg-goo/80 text-void' : 'bg-surface text-bone/35 ring-hairline'}`}
          >
            קְנֵה מַקְּסִימוּם
          </button>
        </div>
        {!canAfford && <p className="mt-3 text-sm text-cy tabular">חסר עוד {formatGoo(missing)} גּוּ</p>}
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
