// Screen 5 — the shop. Spend goo on cosmetics: blob skins (distinct shapes,
// a small tap bonus), background themes (a small passive-income bonus) and
// accessories worn on the blob (a small tap bonus). In-game goo only — no real
// money, ever. Prices climb into the trillions so there's always a goal.

import { playError, playMelodyPreview, playPurchase } from '../../audio/sfx';
import {
  DEFAULT_BLOB,
  accessories,
  backgroundSkins,
  blobById,
  clicksRemainingFor,
  cosmeticsById,
  meetsClickRequirement,
  soundSkins,
  type Accessory,
  type BackgroundSkin,
  type SoundSkin,
} from '../../game/cosmetics';
import { formatExact, formatGoo } from '../../game/format';
import { useGame } from '../../store';
import { haptic } from '../haptics';
import { MainBlob } from '../MainBlob';

export function ShopScreen() {
  const goo = useGame((s) => s.goo);

  // Always display each category cheapest → dearest, regardless of data order.
  const byPrice = <T extends { cost: number }>(list: T[]) => [...list].sort((a, b) => a.cost - b.cost);
  const sortedAccessories = byPrice(accessories);
  const sortedBackgrounds = byPrice(backgroundSkins);
  const sortedSounds = byPrice(soundSkins);

  return (
    <div className="anim-tab-in h-full overflow-y-auto px-5 py-6">
      <header className="mb-4 text-center">
        <h1 className="font-display text-4xl text-bone">חֲנוּת</h1>
        <p className="mt-2 text-sm text-bone/60">קוֹנִים בְּגּוּ — מְעַצְּבִים אֶת הַמִּשְׂחָק</p>
        <div className="mx-auto mt-3 inline-block rounded-full bg-black/25 px-4 py-1 text-base text-goo tabular ring-hairline">
          {formatGoo(goo)} גּוּ
        </div>
      </header>

      {/* Blob skins moved out of the shop: your main-screen look is now chosen in
          the בלובים tab (the starter blob, or any creature you've collected). */}

      <section className="mb-6">
        <h2 className="mb-2 font-display text-xl text-cy">אֲבִיזָרִים 🎩</h2>
        <div className="grid grid-cols-2 gap-3">
          {sortedAccessories.map((acc) => (
            <AccessoryCard key={acc.id} acc={acc} />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-xl text-cy">רְקָעִים 🖼️</h2>
        <div className="grid grid-cols-2 gap-3">
          {sortedBackgrounds.map((skin) => (
            <BackgroundCard key={skin.id} skin={skin} />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-xl text-cy">צְלִילִים 🎵</h2>
        <p className="mb-2 text-xs text-bone/50">מְלוֹדִיַּת 8-בִּיט שֶׁמִּתְנַגֶּנֶת בְּקוֹמְבּוֹ גָּבוֹהַּ. לְחַץ ▶ לְהַאֲזָנָה.</p>
        <div className="grid grid-cols-2 gap-3">
          {sortedSounds.map((snd) => (
            <SoundCard key={snd.id} snd={snd} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ActionButton({ id, cost }: { id: string; cost: number }) {
  const goo = useGame((s) => s.goo);
  const clicks = useGame((s) => s.clicks);
  const owned = useGame((s) => s.ownedCosmetics.includes(id));
  const equippedBlob = useGame((s) => s.equippedBlob);
  const equippedBackground = useGame((s) => s.equippedBackground);
  const equippedAccessory = useGame((s) => s.equippedAccessory);
  const equippedSound = useGame((s) => s.equippedSound);
  const buy = useGame((s) => s.buyCosmetic);
  const equip = useGame((s) => s.equipCosmetic);
  const equipped =
    id === equippedBlob || id === equippedBackground || id === equippedAccessory || id === equippedSound;
  const def = cosmeticsById.get(id);
  const unlocked = !def || meetsClickRequirement(def, clicks);
  const remaining = def ? clicksRemainingFor(def, clicks) : 0;

  const onClick = () => {
    const muted = useGame.getState().muted;
    if (equipped) return;
    if (owned) {
      equip(id);
      playPurchase(muted);
      haptic(15);
    } else if (goo >= cost && unlocked) {
      buy(id);
      playPurchase(muted);
      haptic([0, 30, 20, 50]);
    } else {
      playError(muted);
    }
  };

  if (equipped) {
    return (
      <div className="mt-2 w-full rounded-2xl bg-black/25 py-2 text-center text-sm font-bold text-bone/80 ring-1 ring-goo/70">
        ✓ מוּפְעָל
      </div>
    );
  }
  if (owned) {
    return (
      <button type="button" onClick={onClick} className="btn mt-2 w-full bg-cy py-2 text-sm text-void">
        הַפְעֵל
      </button>
    );
  }
  // Locked by taps beats "can't afford it": showing a price the player could
  // pay, on something they still can't have, reads as the game being broken.
  // The tap gate is the harder wall, so it's the one we name.
  if (!unlocked) {
    const required = def?.requiresClicks ?? 0;
    const done = Math.min(clicks, required);
    return (
      <div className="mt-2 w-full rounded-2xl bg-black/30 px-2 py-1.5 text-center ring-hairline">
        <div className="text-[11px] text-bone/55">
          👆 עוֹד <span className="tabular text-hot">{formatExact(remaining)}</span> לְחִיצוֹת
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full bg-hot/70" style={{ width: `${(done / required) * 100}%` }} />
        </div>
      </div>
    );
  }

  const afford = goo >= cost;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn mt-2 w-full py-2 text-sm ${afford ? 'bg-goo text-void glow-goo' : 'bg-black/30 text-bone/45 ring-hairline'}`}
    >
      {afford ? <>קְנֵה — {formatGoo(cost)}</> : <span className="tabular">חָסֵר {formatGoo(cost - goo)}</span>}
    </button>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return <div className="surface rounded-2xl p-3">{children}</div>;
}

function AccessoryCard({ acc }: { acc: Accessory }) {
  const base = blobById(DEFAULT_BLOB);
  return (
    <CardShell>
      <div className="mx-auto flex h-20 w-20 items-center justify-center">
        <MainBlob colors={base.colors} shape="goo" accessory={acc.art} className="h-20 w-20" />
      </div>
      <div className="mt-1 text-center font-display text-base text-bone">{acc.nameHe}</div>
      <div className="text-center text-[11px] text-cy tabular">
        {acc.clickBonus > 0 ? `+${Math.round(acc.clickBonus * 100)}% לִנְגִיעָה` : 'בְּלִי בּוֹנוּס'}
      </div>
      <ActionButton id={acc.id} cost={acc.cost} />
    </CardShell>
  );
}

function SoundCard({ snd }: { snd: SoundSkin }) {
  const onPreview = () => {
    playMelodyPreview(useGame.getState().muted, snd.melody);
    haptic(10);
  };
  return (
    <CardShell>
      <button
        type="button"
        onClick={onPreview}
        aria-label={`האזנה ל${snd.nameHe}`}
        className="mx-auto flex h-20 w-full items-center justify-center gap-2 rounded-xl bg-black/30 ring-hairline transition active:scale-95"
      >
        <span className="text-3xl">🎵</span>
        <span className="font-display text-lg text-cy">▶ הַאֲזָנָה</span>
      </button>
      <div className="mt-1 text-center font-display text-base text-bone">{snd.nameHe}</div>
      <div className="text-center text-[11px] text-cy tabular">מְלוֹדְיָה</div>
      <ActionButton id={snd.id} cost={snd.cost} />
    </CardShell>
  );
}

function BackgroundCard({ skin }: { skin: BackgroundSkin }) {
  return (
    <CardShell>
      <div
        className="mx-auto h-20 w-full rounded-xl ring-hairline"
        style={{ backgroundColor: '#1a0b2e', backgroundImage: skin.gradient }}
      />
      <div className="mt-1 text-center font-display text-base text-bone">{skin.nameHe}</div>
      <div className="text-center text-[11px] text-cy tabular">
        {skin.incomeBonus > 0 ? `+${Math.round(skin.incomeBonus * 100)}% לִשְׁנִיָּה` : 'בְּסִיסִי'}
      </div>
      <ActionButton id={skin.id} cost={skin.cost} />
    </CardShell>
  );
}
