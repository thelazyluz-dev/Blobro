// Personal stats content — economy, activity, and collection tiles. Hosted as
// one tab inside ProgressOverlay (see ProgressOverlay.tsx), so this file owns
// no backdrop/close button of its own, just the tile grid.

import { achievements } from '../game/achievements';
import { collectionOrder } from '../game/characters';
import { formatExact, formatGoo } from '../game/format';
import { selectClickPower, selectGooPerSec, selectStarBonus, useGame } from '../store';

function Tile({ icon, label, value, color = 'text-bone' }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl bg-black/25 px-3 py-2.5 ring-hairline">
      <div className="flex items-center gap-1.5 text-[11px] text-bone/55">
        <span>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-0.5 font-display text-lg tabular ${color}`} dir="ltr">
        {value}
      </div>
    </div>
  );
}

export function StatsContent() {
  const goo = useGame((s) => s.goo);
  const lifetimeGoo = useGame((s) => s.lifetimeGoo);
  const clicks = useGame((s) => s.clicks);
  const totalHatches = useGame((s) => s.totalHatches);
  const eggs = useGame((s) => s.eggs);
  const bonusesCollected = useGame((s) => s.bonusesCollected);
  const characters = useGame((s) => s.characters);
  const claimed = useGame((s) => s.achievements);
  const rate = useGame(selectGooPerSec);
  const perTap = useGame(selectClickPower);
  const starBonus = useGame(selectStarBonus);

  const collected = collectionOrder.filter((id) => characters[id]).length;
  const shiny = collectionOrder.filter((id) => (characters[id]?.evolution ?? 0) > 0).length;
  const topLevel = Math.max(0, ...collectionOrder.map((id) => characters[id]?.level ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-1.5 font-display text-sm text-cy">כַּלְכָּלָה 💰</h3>
        <div className="grid grid-cols-2 gap-2">
          <Tile icon="🫧" label="גּוּ עַכְשָׁו" value={formatGoo(goo)} color="text-goo" />
          <Tile icon="📈" label="סַךְ הַכֹּל אֵי־פַּעַם" value={formatGoo(lifetimeGoo)} color="text-goo" />
          <Tile icon="⏱️" label="גּוּ לְשְׁנִיָּה" value={formatGoo(rate)} color="text-cy" />
          <Tile icon="👆" label="לְכָל נְגִיעָה" value={formatGoo(perTap)} color="text-cy" />
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 font-display text-sm text-cy">פְּעִילוּת ⚡</h3>
        <div className="grid grid-cols-2 gap-2">
          <Tile icon="👆" label="לְחִיצוֹת" value={formatExact(clicks)} />
          <Tile icon="🥚" label="בְּקִיעוֹת" value={formatExact(totalHatches)} />
          <Tile icon="📦" label="בֵּיצִים בַּמְּלַאי" value={formatExact(eggs)} />
          <Tile icon="⭐" label="בּוֹנוּסֵי זָהָב" value={formatExact(bonusesCollected)} />
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 font-display text-sm text-cy">אוֹסֶף ✨</h3>
        <div className="grid grid-cols-2 gap-2">
          <Tile icon="🐾" label="יְצוּרִים" value={`${collected}/${collectionOrder.length}`} color="text-pop" />
          <Tile icon="✨" label="מְנַצְנְצִים" value={formatExact(shiny)} color="text-pop" />
          <Tile icon="🏆" label="הֶשֵּׂגִים" value={`${claimed.length}/${achievements.length}`} color="text-pop" />
          <Tile icon="🎖️" label="הָרָמָה הַגְּבוֹהָה" value={formatExact(topLevel)} color="text-pop" />
        </div>
        <div className="mt-2">
          <Tile icon="⭐" label="בּוֹנוּס הֶשֵּׂגִים קָבוּעַ" value={`+${Math.round(starBonus * 100)}%`} color="text-goo" />
        </div>
      </section>
    </div>
  );
}
