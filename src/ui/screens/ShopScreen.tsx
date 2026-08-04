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
  crystalsRemainingFor,
  isCrystalItem,
  meetsClickRequirement,
  meetsCrystalRequirement,
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
  const crystals = useGame((s) => s.prestigeCrystals);

  // Prestige-only items live in their own showcase; keep them out of the goo aisles.
  const crystalAccessories = accessories.filter(isCrystalItem);
  const crystalBackgrounds = backgroundSkins.filter(isCrystalItem);
  const gooAccessories = accessories.filter((a) => !isCrystalItem(a));
  const gooBackgrounds = backgroundSkins.filter((b) => !isCrystalItem(b));

  return (
    <div className="anim-tab-in h-full overflow-y-auto px-5 py-6">
      <header className="mb-4 text-center">
        <h1 className="font-display text-4xl text-bone">חֲנוּת</h1>
        <p className="mt-2 text-sm text-bone/60">קוֹנִים בְּגּוּ — מְעַצְּבִים אֶת הַמִּשְׂחָק</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full bg-black/25 px-4 py-1 text-base text-goo tabular ring-hairline">
            {formatGoo(goo)} גּוּ
          </span>
          <span className="rounded-full bg-cy/15 px-4 py-1 text-base text-cy tabular ring-1 ring-cy/40">
            {crystals} 💎
          </span>
        </div>
      </header>

      {/* 💎 Prestige-only showcase — the reason to roll. Free once you've earned
          the crystals; purely a look, never power. */}
      <section className="mb-6 rounded-3xl bg-cy/5 p-3 ring-1 ring-cy/25">
        <h2 className="mb-1 font-display text-xl text-cy">💎 בִּלְעֲדִי לְמְגַלְגְּלִים</h2>
        <p className="mb-2 text-xs text-bone/55">
          קִשּׁוּטִים נְדִירִים שֶׁמַּשִּׂיגִים רַק דֶּרֶךְ גִּלְגּוּל מֵחָדָשׁ — וְהֵם שֶׁלְּךָ לָנֶצַח.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {crystalAccessories.map((acc) => (
            <AccessoryCard key={acc.id} acc={acc} />
          ))}
          {crystalBackgrounds.map((skin) => (
            <BackgroundCard key={skin.id} skin={skin} />
          ))}
        </div>
      </section>

      {/* Blob skins moved out of the shop: your main-screen look is now chosen in
          the בלובים tab (the starter blob, or any creature you've collected). */}

      <section className="mb-6">
        <h2 className="mb-2 font-display text-xl text-cy">אֲבִיזָרִים 🎩</h2>
        <div className="grid grid-cols-2 gap-3">
          {gooAccessories.map((acc) => (
            <AccessoryCard key={acc.id} acc={acc} />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-xl text-cy">רְקָעִים 🖼️</h2>
        <div className="grid grid-cols-2 gap-3">
          {gooBackgrounds.map((skin) => (
            <BackgroundCard key={skin.id} skin={skin} />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-xl text-cy">צְלִילִים 🎵</h2>
        <p className="mb-2 text-xs text-bone/50">מְלוֹדִיַּת 8-בִּיט שֶׁמִּתְנַגֶּנֶת בְּקוֹמְבּוֹ גָּבוֹהַּ. לְחַץ ▶ לְהַאֲזָנָה.</p>
        <div className="grid grid-cols-2 gap-3">
          {soundSkins.map((snd) => (
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
  const crystals = useGame((s) => s.prestigeCrystals);
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
  const crystalItem = !!def && isCrystalItem(def);
  const clickUnlocked = !def || meetsClickRequirement(def, clicks);
  const crystalUnlocked = !def || meetsCrystalRequirement(def, crystals);
  const unlocked = clickUnlocked && crystalUnlocked;
  const remaining = def ? clicksRemainingFor(def, clicks) : 0;
  const crystalRemaining = def ? crystalsRemainingFor(def, crystals) : 0;

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
  // Crystal gate (prestige-only items). Named first: it's the exclusive wall,
  // and these items have no goo price to fall back on.
  if (crystalItem && !crystalUnlocked) {
    const required = def!.requiresCrystals ?? 0;
    const done = Math.min(crystals, required);
    return (
      <div className="mt-2 w-full rounded-2xl bg-black/30 px-2 py-1.5 text-center ring-hairline">
        <div className="text-[11px] text-bone/55">
          עוֹד <span className="tabular text-cy">{crystalRemaining}</span> 💎 מִגִּלְגּוּל
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full bg-cy/70" style={{ width: `${(done / required) * 100}%` }} />
        </div>
      </div>
    );
  }
  // Locked by taps beats "can't afford it": showing a price the player could
  // pay, on something they still can't have, reads as the game being broken.
  // The tap gate is the harder wall, so it's the one we name.
  if (!clickUnlocked) {
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

  // Crystal items are free once unlocked — the crystals ARE the price. "Claim",
  // not "buy", so it never reads as spending anything.
  if (crystalItem) {
    return (
      <button type="button" onClick={onClick} className="btn mt-2 w-full bg-cy py-2 text-sm text-void glow-goo">
        קַבֵּל 💎
      </button>
    );
  }

  const afford = goo >= cost;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn mt-2 w-full py-2 text-sm ${afford ? 'bg-goo text-void glow-goo' : 'bg-black/30 text-bone/45 ring-hairline'}`}
    >
      {afford ? <>קְנֵה — {formatGoo(cost)}</> : <span className="tabular">חסר {formatGoo(cost - goo)}</span>}
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
        {isCrystalItem(acc) ? '💎 בִּלְעֲדִי' : acc.clickBonus > 0 ? `+${Math.round(acc.clickBonus * 100)}% לנגיעה` : 'בְּלִי בּוֹנוּס'}
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
        {isCrystalItem(skin) ? '💎 בִּלְעֲדִי' : skin.incomeBonus > 0 ? `+${Math.round(skin.incomeBonus * 100)}% לשנייה` : 'בְּסִיסִי'}
      </div>
      <ActionButton id={skin.id} cost={skin.cost} />
    </CardShell>
  );
}
