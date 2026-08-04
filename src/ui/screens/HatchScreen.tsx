// Screen 2 — eggs (§10.2). New model: you BUY eggs into an inventory (the price
// climbs with every egg acquired), then OPEN them — one at a time by tapping the
// egg crack-by-crack (the reveal overlay), or the whole stash at once with
// "בקע הכל". A pity meter and a "how much is missing" hint round it out.

import { useEffect, useState } from 'react';
import { playError, playPurchase } from '../../audio/sfx';
import { eggCostGrowth, pityLegendaryThreshold, pityRareThreshold } from '../../game/balance';
import { hatchableByRarity } from '../../game/characters';
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
  const watchAdForEgg = useGame((s) => s.watchAdForEgg);
  const adEggReadyAt = useGame((s) => s.adEggReadyAt);
  const openEgg = useGame((s) => s.openEgg);
  const openAllEggs = useGame((s) => s.openAllEggs);
  const reduced = useReducedMotion();

  // Ticks once a second only while the free-egg button is cooling down, so
  // the countdown text stays honest without a permanent timer.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (adEggReadyAt <= Date.now()) return;
    const iv = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [adEggReadyAt]);
  const adEggReady = adEggReadyAt <= nowTs;

  // Egg-collection progress: only the hatchable roster counts here (the
  // click-unlock creatures have their own path on the click screen).
  const hatchable = Object.values(hatchableByRarity).flat();
  const hatchableTotal = hatchable.length;
  const hatchableOwned = hatchable.filter((c) => characters[c.id]).length;
  const adEggWaitMin = Math.ceil(Math.max(0, adEggReadyAt - nowTs) / 60000);

  const canAfford = goo >= cost;
  const missing = Math.max(0, cost - goo);
  // "Buy max" only earns its column when it would buy MORE than one — when it
  // equals "buy egg" it's a duplicate button (design proposal A). Next egg's
  // price is exactly cost x growth, so this needs no extra pricing plumbing.
  const showMax = goo >= cost + cost * eggCostGrowth;
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
    <div className="anim-tab-in flex h-full flex-col items-center gap-2 overflow-y-auto px-6 pb-2 pt-3">
      <header className="text-center">
        <h1 className="font-display text-4xl text-bone">בְּקִיעָה</h1>
        {/* The chase's scoreboard doubles as the subtitle — one line instead of
            two (the old instructional subtitle taught nothing a first tap
            doesn't). */}
        <p className="mt-1 text-sm text-goo tabular">
          נֶאֶסְפוּ {hatchableOwned} מִתּוֹךְ {hatchableTotal} יְצוּרֵי בֵּיצָה 🥚
        </p>
      </header>

      {/* Status card — the pity meters share one card so they read as one
          "chase status" unit instead of two floating bars (design proposal A). */}
      <div className="surface w-full max-w-xs shrink-0 space-y-1 rounded-2xl px-3 py-1.5">
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
      <div className="relative flex min-h-[88px] w-full flex-1 shrink items-center justify-center overflow-visible py-1">
        <div
          className={`pointer-events-none absolute aspect-square h-full max-h-[200px] rounded-full ${reduced ? '' : 'anim-breathe'}`}
          style={{ background: 'radial-gradient(circle, rgba(255,216,77,0.28), transparent 65%)' }}
        />
        <button
          type="button"
          onClick={open}
          disabled={!hasEggs}
          aria-label={hasEggs ? 'פתח ביצה' : 'אין ביצים'}
          className={`relative h-full max-h-[190px] touch-none select-none rounded-full outline-none transition focus-visible:ring-4 focus-visible:ring-cy ${
            hasEggs ? 'active:scale-95' : 'opacity-60'
          }`}
        >
          <EggArt
            spotColor="#A3FF12"
            className={`h-full w-auto ${reduced || !hasEggs ? '' : 'anim-idle'}`}
          />
          {/* inventory count badge */}
          <span
            className="absolute -end-1 -top-1 flex h-9 min-w-9 items-center justify-center rounded-full bg-hot px-2 font-display text-lg text-bone tabular ring-2 ring-void/60"
            style={{ boxShadow: '0 0 14px rgba(255,46,136,0.7)' }}
          >
            {eggs}
          </span>
        </button>
      </div>

      {/* Actions card — one card, one job: everything that spends goo lives
          here, in a fixed order (context line, price+shortfall as ONE line,
          buy grid, quick-hatch). Design proposal A: 10 floating rows became
          header / status / egg / actions / ad-egg. */}
      <div className="surface w-full max-w-xs shrink-0 rounded-2xl p-3 text-center">
        <p className="mb-2 text-xs text-bone/70">
          {hasEggs ? 'לְחַץ עַל הַבֵּיצָה כְּדֵי לִשְׁבֹּר אוֹתָהּ! 🥚' : 'אֵין לְךָ בֵּיצִים — קְנֵה אַחַת!'}
        </p>
        <p className="mb-2 text-sm text-pop tabular">
          מְחִיר בֵּיצָה: {formatGoo(cost)} גּוּ
          {!canAfford && <span className="text-cy"> · חָסֵר {formatGoo(missing)}</span>}
        </p>
        <div className={`grid gap-2 ${showMax ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={() => buy(false)}
            disabled={!canAfford}
            className={`btn py-3.5 text-xl ${canAfford ? 'bg-goo text-void glow-goo' : 'bg-black/25 text-bone/35 ring-hairline'}`}
          >
            קְנֵה בֵּיצָה
          </button>
          {showMax && (
            <button
              type="button"
              onClick={() => buy(true)}
              disabled={!canAfford}
              className="btn bg-goo/80 py-3.5 text-xl text-void"
            >
              קְנֵה מַקְּסִימוּם
            </button>
          )}
        </div>
        {hasEggs && (
          <button type="button" onClick={openAll} className="btn mt-2 w-full bg-hot py-3 text-lg text-bone glow-hot">
            ⚡ בְּקִיעָה מְהִירָה ({eggs})
          </button>
        )}
      </div>

      {/* Rewarded ad egg — bottom of the stack and visually demoted: buying
          with goo is the primary loop, the ad is an opt-in treat (product
          rule). Still full-width and readable, never screaming. */}
      <div className="w-full max-w-xs shrink-0 text-center">
        <button
          type="button"
          onClick={watchAdForEgg}
          disabled={!adEggReady}
          className={`btn w-full py-2 text-base ${
            adEggReady ? 'bg-black/25 text-pop ring-1 ring-pop/50' : 'bg-black/25 text-bone/35 ring-hairline'
          }`}
        >
          {adEggReady ? '🎬 סִרְטוֹן = בֵּיצַת מַזָּל!' : `🎬 בֵּיצַת מַזָּל נוֹסֶפֶת בְּעוֹד ${adEggWaitMin} דַּקּוֹת`}
        </button>
        {adEggReady && (
          <p className="mt-1 text-xs text-pop">הַסִּכּוּי הֲכִי גָּדוֹל לְאַגָּדִי בַּמִּשְׂחָק! ✨</p>
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
