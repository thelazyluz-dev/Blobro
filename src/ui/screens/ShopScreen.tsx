// Screen 5 — the shop. Spend goo on cosmetics: blob skins (distinct shapes,
// a small tap bonus), background themes (a small passive-income bonus) and
// accessories worn on the blob (a small tap bonus). In-game goo only — no real
// money, ever. Prices climb into the trillions so there's always a goal.

import { useState } from 'react';
import { playError, playMelodyPreview, playPurchase } from '../../audio/sfx';
import {
  DEFAULT_BLOB,
  accessories,
  backgroundSkins,
  blobById,
  blobSkins,
  soundSkins,
  type Accessory,
  type BackgroundSkin,
  type BlobSkin,
  type SoundSkin,
} from '../../game/cosmetics';
import { formatGoo } from '../../game/format';
import { useGame } from '../../store';
import { haptic } from '../haptics';
import { MainBlob } from '../MainBlob';

export function ShopScreen() {
  const goo = useGame((s) => s.goo);

  return (
    <div className="anim-tab-in h-full overflow-y-auto px-5 py-6">
      <header className="mb-4 text-center">
        <h1 className="font-display text-4xl text-bone">חֲנוּת</h1>
        <p className="mt-2 text-sm text-bone/60">קוֹנִים בְּגּוּ — מְעַצְּבִים אֶת הַמִּשְׂחָק</p>
        <div className="mx-auto mt-3 inline-block rounded-full bg-black/25 px-4 py-1 text-base text-goo tabular ring-hairline">
          {formatGoo(goo)} גּוּ
        </div>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-xl text-cy">בְּלוֹבִּים 🎨</h2>
        <div className="grid grid-cols-2 gap-3">
          {blobSkins.map((skin) => (
            <BlobCard key={skin.id} skin={skin} />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-xl text-cy">אֲבִיזָרִים 🎩</h2>
        <div className="grid grid-cols-2 gap-3">
          {accessories.map((acc) => (
            <AccessoryCard key={acc.id} acc={acc} />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-xl text-cy">רְקָעִים 🖼️</h2>
        <div className="grid grid-cols-2 gap-3">
          {backgroundSkins.map((skin) => (
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

      <ResetSection />
    </div>
  );
}

function ResetSection() {
  const resetGame = useGame((s) => s.resetGame);
  const [confirming, setConfirming] = useState(false);

  const onReset = () => {
    resetGame();
    setConfirming(false);
    const muted = useGame.getState().muted;
    playPurchase(muted);
    haptic([0, 40, 30, 60]);
  };

  return (
    <section className="mb-2 border-t border-hairline pt-5 text-center">
      <h2 className="mb-1 font-display text-lg text-bone/70">הַתְחָלָה מֵחָדָשׁ</h2>
      <p className="mb-3 text-xs text-bone/45">מוֹחֵק אֶת כָּל הַהִתְקַדְּמוּת וּמַתְחִיל מֵאֶפֶס</p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="btn w-full bg-black/30 py-2.5 text-sm text-hot ring-1 ring-hot/40"
        >
          🔄 הַתְחֵל מֵחָדָשׁ
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-hot">בָּטוּחַ? כָּל הַהִתְקַדְּמוּת תִּמָּחֵק לָנֶצַח!</div>
          <div className="flex gap-2">
            <button type="button" onClick={onReset} className="btn flex-1 bg-hot py-2.5 text-sm text-bone">
              כֵּן, לְאַפֵּס
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn flex-1 bg-cy py-2.5 text-sm text-void"
            >
              בִּיטּוּל
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ActionButton({ id, cost }: { id: string; cost: number }) {
  const goo = useGame((s) => s.goo);
  const owned = useGame((s) => s.ownedCosmetics.includes(id));
  const equippedBlob = useGame((s) => s.equippedBlob);
  const equippedBackground = useGame((s) => s.equippedBackground);
  const equippedAccessory = useGame((s) => s.equippedAccessory);
  const equippedSound = useGame((s) => s.equippedSound);
  const buy = useGame((s) => s.buyCosmetic);
  const equip = useGame((s) => s.equipCosmetic);
  const equipped =
    id === equippedBlob || id === equippedBackground || id === equippedAccessory || id === equippedSound;

  const onClick = () => {
    const muted = useGame.getState().muted;
    if (equipped) return;
    if (owned) {
      equip(id);
      playPurchase(muted);
      haptic(15);
    } else if (goo >= cost) {
      buy(id);
      playPurchase(muted);
      haptic([0, 30, 20, 50]);
    } else {
      playError(muted);
    }
  };

  if (equipped) {
    return (
      <div className="btn mt-2 w-full bg-goo/20 py-2 text-center text-sm font-bold text-goo ring-1 ring-goo/40">
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

function BlobCard({ skin }: { skin: BlobSkin }) {
  return (
    <CardShell>
      <div className="mx-auto flex h-20 w-20 items-center justify-center">
        <MainBlob colors={skin.colors} shape={skin.shape} className="h-20 w-20" />
      </div>
      <div className="mt-1 text-center font-display text-base text-bone">{skin.nameHe}</div>
      <div className="text-center text-[11px] text-cy tabular">
        {skin.clickBonus > 0 ? `+${Math.round(skin.clickBonus * 100)}% לנגיעה` : 'בְּסִיסִי'}
      </div>
      <ActionButton id={skin.id} cost={skin.cost} />
    </CardShell>
  );
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
        {acc.clickBonus > 0 ? `+${Math.round(acc.clickBonus * 100)}% לנגיעה` : 'בְּלִי בּוֹנוּס'}
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
        {skin.incomeBonus > 0 ? `+${Math.round(skin.incomeBonus * 100)}% לשנייה` : 'בְּסִיסִי'}
      </div>
      <ActionButton id={skin.id} cost={skin.cost} />
    </CardShell>
  );
}
