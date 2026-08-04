// Screen 3 — collection (§10.3). Creatures are grouped into clear rarity
// sections. Each owned tile shows a small badge = how many times it can be
// levelled up right now with your goo. Tapping a creature opens its details,
// where it can be levelled straight up with goo (and evolved from level 10).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { playError, playPurchase } from '../../audio/sfx';
import { speakName } from '../../audio/speech';
import { playJingle } from '../../audio/synth';
import { ABILITY_META, abilityOf, abilityPct } from '../../game/abilities';
import { evolveLevels, evolveMultiplierByStage, maxEvolution } from '../../game/balance';
import { charactersById, collectionOrder, incomeMultOf } from '../../game/characters';
import {
  affordableCreatureLevels,
  creatureContribution,
  creatureLevelCost,
  evolveCost,
  ownedCreatureIncome,
} from '../../game/economy';
import { formatGoo } from '../../game/format';
import type { CharId, Rarity } from '../../game/types';
import { DEFAULT_BLOB, accessoryById, blobById } from '../../game/cosmetics';
import { selectGooPerSec, selectMods, useGame } from '../../store';
import { CharacterBody } from '../characters';
import { MainBlob } from '../MainBlob';
import { haptic } from '../haptics';
import { rarityBackground, rarityColor, rarityLabelHe } from '../rarity';

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];
const idsByRarity: Record<Rarity, CharId[]> = RARITY_ORDER.reduce(
  (acc, r) => {
    acc[r] = collectionOrder.filter((id) => charactersById[id].rarity === r);
    return acc;
  },
  {} as Record<Rarity, CharId[]>,
);

export function CollectionScreen() {
  const owned = useGame((s) => s.characters);
  const setTab = useGame((s) => s.setTab);
  const goo = useGame((s) => s.goo);
  const clicks = useGame((s) => s.clicks);
  const m = useGame(selectMods);
  const [selected, setSelected] = useState<CharId | null>(null);

  const ownedCount = collectionOrder.filter((id) => owned[id]).length;
  const total = collectionOrder.length;

  const upgradeAll = useGame((s) => s.upgradeAllCreatures);
  const gooPerSecNow = useGame(selectGooPerSec);
  const readyAt = useGame((s) => s.upgradeAllReadyAt);

  // A ticking "now" so the cooldown countdown updates once a second while locked.
  const [now, setNow] = useState(() => Date.now());
  const locked = now < readyAt;
  useEffect(() => {
    if (!locked) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [locked]);

  const open = (id: CharId) => {
    setSelected(id);
    const muted = useGame.getState().muted;
    playJingle(charactersById[id].sound, muted);
    speakName(charactersById[id].nameHe, muted); // say the creature's name on open
  };

  // Cheapest single level available across owned creatures — enables "upgrade all".
  const cheapest = collectionOrder.reduce((min, id) => {
    const h = owned[id];
    return h ? Math.min(min, creatureLevelCost(charactersById[id].rarity, h, m, gooPerSecNow, incomeMultOf(charactersById[id]))) : min;
  }, Infinity);
  // Enabled when not cooling down and at least one level is affordable.
  const canUpgradeAny = !locked && goo >= cheapest;
  const cooldownLeft = Math.max(0, Math.ceil((readyAt - now) / 1000));

  const onUpgradeAll = () => {
    const muted = useGame.getState().muted;
    if (canUpgradeAny) {
      upgradeAll();
      playPurchase(muted);
      haptic([0, 25, 15, 40]);
    } else {
      playError(muted);
    }
  };

  return (
    <div className="anim-tab-in h-full overflow-y-auto px-5 py-6">
      <header className="mb-4 text-center">
        <h1 className="font-display text-4xl text-bone">הַבְּלוֹבִּים שֶׁלִּי</h1>
        <p className="mt-2 text-sm text-bone/60 tabular">
          {ownedCount} מִתּוֹךְ {total} יְצוּרִים
        </p>
        <div className="mx-auto mt-3 h-2 w-40 overflow-hidden rounded-full bg-black/40 ring-hairline">
          <div
            className="h-full rounded-full bg-goo transition-[width] duration-500"
            style={{ width: `${(ownedCount / total) * 100}%` }}
          />
        </div>
        {ownedCount > 0 && (
          <button
            type="button"
            onClick={onUpgradeAll}
            disabled={locked}
            className={`btn mt-4 flex w-full flex-col items-center py-2.5 text-base ${
              canUpgradeAny ? 'bg-goo text-void glow-goo' : 'bg-black/30 text-bone/45 ring-hairline'
            }`}
          >
            {locked ? (
              <>
                <span>⏳ שַׁדְרֵג אֶת כֻּלָּם</span>
                <span className="text-xs tabular">מוּכָן בְּעוֹד {cooldownLeft}ש׳</span>
              </>
            ) : (
              <span>⬆️ שַׁדְרֵג אֶת כֻּלָּם</span>
            )}
          </button>
        )}
        {/* A fresh collection is all "?" tiles — point the kid at the one action
            that fills it, so an empty grid never reads as a dead end. */}
        {ownedCount === 0 && (
          <button
            type="button"
            onClick={() => setTab('hatch')}
            className="btn anim-breathe mt-4 w-full bg-cy py-3 text-base text-void glow-goo"
          >
            🥚 בִּקְעוּ בֵּיצִים כְּדֵי לְמַלֵּא אֶת הָאֹסֶף!
          </button>
        )}
      </header>

      <div className="flex flex-col gap-5 pb-4">
        {/* The original green blob — always yours, always first. Picking it puts
            the classic blob back on the main screen (equippedMain = null). */}
        <ClassicBlobSection />

        {RARITY_ORDER.map((rarity) => {
          const ids = idsByRarity[rarity];
          const haveHere = ids.filter((id) => owned[id]).length;
          return (
            <section key={rarity}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: rarityColor[rarity], boxShadow: `0 0 8px ${rarityColor[rarity]}` }}
                />
                <span className="font-display text-xl" style={{ color: rarityColor[rarity] }}>
                  {rarityLabelHe[rarity]}
                </span>
                <span className="text-sm text-bone/60 tabular">
                  {haveHere}/{ids.length}
                </span>
                <span className="ms-auto text-[10px] text-bone/40 tabular">
                  {formatGoo(
                    ownedCreatureIncome(rarity, { level: 1 }),
                  )}{' '}
                  גּוּ/ש׳ בסיס
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {ids.map((id) => {
                  const def = charactersById[id];
                  const held = owned[id];
                  if (!held) {
                    // Click-unlock creatures show a silhouette + tap-progress so
                    // the player knows how to earn them; egg creatures stay a "?".
                    if (def.unlockClicks != null) {
                      const pct = Math.min(100, (clicks / def.unlockClicks) * 100);
                      return (
                        <div
                          key={id}
                          className="relative flex aspect-square flex-col items-center justify-center rounded-2xl bg-black/40 p-1 ring-1 ring-bone/10"
                          title={`נפתח ב-${def.unlockClicks.toLocaleString('en-US')} לחיצות`}
                        >
                          <CharacterBody id={id} className="h-11 w-11 opacity-25 grayscale" />
                          <span className="absolute end-1 top-1 text-xs">🔒</span>
                          <span className="mt-1 text-[9px] text-bone/60 tabular" dir="ltr">
                            {clicks.toLocaleString('en-US')}/{def.unlockClicks.toLocaleString('en-US')}
                          </span>
                          <div className="mt-1 h-1 w-11 overflow-hidden rounded-full bg-black/50">
                            <div className="h-full rounded-full bg-cy" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="mt-0.5 text-[8px] text-bone/40">👆 לחיצות</span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={id}
                        className="flex aspect-square items-center justify-center rounded-2xl bg-black/40 ring-1 ring-bone/10"
                      >
                        <span className="font-display text-4xl text-bone/25">?</span>
                      </div>
                    );
                  }
                  const stage = held.evolution ?? 0;
                  const evolved = stage > 0;
                  const ring = evolved ? '#FFD84D' : rarityColor[def.rarity];
                  const canLevel = affordableCreatureLevels(def.rarity, held, m, goo, gooPerSecNow, incomeMultOf(def));
                  // Ready to evolve = reached the next stage's level threshold AND
                  // you can afford it right now. Shown only as a pulsing gold frame
                  // (like the evolve button), so it means "you can evolve this now".
                  const evolveReady =
                    stage < maxEvolution &&
                    held.level >= evolveLevels[stage] &&
                    goo >= evolveCost(def.rarity, held, m, gooPerSecNow, incomeMultOf(def));
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => open(id)}
                      className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl p-1 transition active:scale-95 ${
                        evolveReady ? 'anim-evolve-glow' : ''
                      }`}
                      style={{
                        backgroundColor: '#170a29',
                        boxShadow: evolved
                          ? `inset 0 0 0 2px #FFD84D, 0 0 22px -4px #FFD84D`
                          : `inset 0 0 0 2px ${ring}, 0 0 18px -8px ${ring}`,
                      }}
                    >
                      {canLevel > 0 && (
                        <span className="anim-breathe absolute start-1 top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-goo px-1 text-[11px] font-bold text-void tabular ring-2 ring-void/50">
                          {canLevel > 99 ? '99' : canLevel}
                        </span>
                      )}
                      {evolved && (
                        <span className="absolute end-1 top-1 text-sm">✨{stage}</span>
                      )}
                      <CharacterBody id={id} className="h-12 w-12" evolution={stage} />
                      <span
                        className={`mt-1 max-w-full truncate px-1 text-[10px] ${evolved ? 'text-pop' : 'text-bone/80'}`}
                      >
                        {def.nameHe}
                      </span>
                      <span className="text-[10px] text-pop tabular">
                        {evolved ? '✨ ' : ''}רמה {held.level}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {selected && <DetailModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/**
 * The starter green blob, pinned as the first entry in the Blobs tab. It isn't a
 * creature (no level, no income) — it's the default face of the main screen, and
 * it's always available. Selecting it clears `equippedMain`.
 */
function ClassicBlobSection() {
  const isSelected = useGame((s) => s.equippedMain === null);
  const setEquippedMain = useGame((s) => s.setEquippedMain);
  const accessory = useGame((s) => accessoryById(s.equippedAccessory).art);
  // The starter blob is always our original green one.
  const { colors, shape } = blobById(DEFAULT_BLOB);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: '#A3FF12', boxShadow: '0 0 8px #A3FF12' }}
        />
        <span className="font-display text-lg text-goo">הַבְּלוֹבּ שֶׁלְּךָ</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setEquippedMain(null)}
          className="relative flex aspect-square flex-col items-center justify-center rounded-2xl p-1 transition active:scale-95"
          style={{
            backgroundColor: '#170a29',
            boxShadow: isSelected
              ? 'inset 0 0 0 2px #FFD84D, 0 0 22px -4px #FFD84D'
              : 'inset 0 0 0 2px #A3FF12, 0 0 18px -8px #A3FF12',
          }}
        >
          {isSelected && <span className="absolute end-1 top-1 text-sm">🎯</span>}
          <MainBlob colors={colors} shape={shape} accessory={accessory} className="h-12 w-12" />
          <span className="mt-1 max-w-full truncate px-1 text-[10px] text-bone/80">בְּלוֹרְבּוֹ</span>
          <span className="text-[10px] text-pop tabular">{isSelected ? 'בַּמָּסָךְ' : 'בְּחַר'}</span>
        </button>
      </div>
    </section>
  );
}

function DetailModal({ id, onClose }: { id: CharId; onClose: () => void }) {
  const def = charactersById[id];
  const held = useGame((s) => s.characters[id]);
  const goo = useGame((s) => s.goo);
  const m = useGame(selectMods);
  const rate = useGame(selectGooPerSec);
  const evolveCreature = useGame((s) => s.evolveCreature);
  const levelUp = useGame((s) => s.levelUpCreature);
  const levelUpMax = useGame((s) => s.levelUpCreatureMax);
  const isMain = useGame((s) => s.equippedMain === id);
  const setEquippedMain = useGame((s) => s.setEquippedMain);
  if (!held) return null;

  // The creature's TRUE goo/sec contribution (all automation multipliers folded
  // in), so the numbers here match what the level actually adds to your rate.
  const im = incomeMultOf(def);
  const income = creatureContribution(def.rarity, held, m, im);
  const stage = held.evolution ?? 0;
  const evolved = stage > 0;
  const ringColor = evolved ? '#FFD84D' : rarityColor[def.rarity];
  // Evolution chain: next stage needs the creature at evolveLevels[stage].
  const maxedEvolution = stage >= maxEvolution;
  const nextEvolveLevel = maxedEvolution ? Infinity : evolveLevels[stage];
  const canEvolve = !maxedEvolution && held.level >= nextEvolveLevel;
  const evolveCostGoo = maxedEvolution ? 0 : evolveCost(def.rarity, held, m, rate, im);
  const affordEvolve = goo >= evolveCostGoo;
  const evolveMultNext = maxedEvolution ? 1 : evolveMultiplierByStage[stage + 1] / evolveMultiplierByStage[stage];

  // Direct goo leveling.
  const levelCost = creatureLevelCost(def.rarity, held, m, rate, im);
  const affordLevel = goo >= levelCost;
  const affordN = affordableCreatureLevels(def.rarity, held, m, goo, rate, im);
  const nextIncome = creatureContribution(def.rarity, { level: held.level + 1, evolution: held.evolution }, m, im);
  const levelGain = nextIncome - income;

  const onLevel = () => {
    const muted = useGame.getState().muted;
    if (affordLevel) {
      levelUp(id);
      playPurchase(muted);
      haptic(15);
    } else {
      playError(muted);
    }
  };

  const onLevelMax = () => {
    const muted = useGame.getState().muted;
    if (affordN > 0) {
      levelUpMax(id);
      playPurchase(muted);
      haptic([0, 20, 15, 30]);
    } else {
      playError(muted);
    }
  };

  const onEvolve = () => {
    const muted = useGame.getState().muted;
    if (affordEvolve) {
      evolveCreature(id);
      playPurchase(muted);
      haptic([0, 40, 30, 60]);
    } else {
      playError(muted);
    }
  };

  // Portal to <body> so the modal escapes the collection screen's stacking
  // context and truly covers the app's top-corner buttons (otherwise the close
  // ✕ gets painted behind the achievements/mute buttons).
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-6"
      onClick={onClose}
      role="presentation"
    >
      {/* Always-reachable close button, pinned to the screen corner so you never
          have to scroll the card to find it. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="סגור"
        className="absolute end-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-2xl text-bone ring-1 ring-bone/30 active:scale-90"
      >
        ✕
      </button>
      <div
        className="surface anim-pop-in max-h-[88vh] w-full max-w-xs overflow-y-auto rounded-3xl p-6 text-center"
        style={{ boxShadow: `0 0 0 2px ${ringColor}, 0 24px 60px -20px #000` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Tap the creature to hear its name (replaces the old "sing" button). */}
        <button
          type="button"
          onClick={() => {
            const m = useGame.getState().muted;
            playJingle(def.sound, m);
            speakName(def.nameHe, m);
          }}
          aria-label={`השמע את השם ${def.nameHe}`}
          className={`relative mx-auto mb-3 flex h-28 w-28 items-center justify-center rounded-2xl outline-none transition active:scale-95 `}
          style={{ background: rarityBackground(def.rarity), boxShadow: `0 0 40px -8px ${ringColor}` }}
        >
          {evolved && <span className="absolute -end-1 -top-1 text-2xl">✨</span>}
          <CharacterBody id={id} className="h-24 w-24" evolution={stage} />
          <span className="absolute -bottom-1 -start-1 flex h-7 w-7 items-center justify-center rounded-full bg-void/80 text-sm ring-1 ring-bone/25">
            🔊
          </span>
        </button>
        <div className="font-display text-3xl text-bone">
          {evolved ? '✨ ' : ''}
          {def.nameHe}
        </div>
        <div className="text-sm text-bone/50">{def.nameLatin}</div>
        <p className="mx-auto mt-2 max-w-[16rem] text-sm text-bone/75">{def.descHe}</p>
        <div
          className="mx-auto mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold text-void"
          style={{ background: evolved ? 'linear-gradient(135deg,#FFD84D,#FF2E88)' : rarityBackground(def.rarity) }}
        >
          {evolved ? `מְנַצְנֵץ ${stage}/${maxEvolution}` : rarityLabelHe[def.rarity]}
        </div>
        <div className="mt-4 text-lg text-pop tabular">רמה {held.level}</div>
        <div className="mt-1 text-goo tabular">{formatGoo(income)} גּוּ/שנייה</div>

        {/* The special ability this creature grants when it's your main. */}
        {(() => {
          const ab = abilityOf(id, def.rarity);
          const meta = ABILITY_META[ab.type];
          return (
            <div className="mt-3 rounded-2xl bg-pop/10 px-3 py-2 ring-1 ring-pop/30">
              <div className="text-xs text-bone/55">יְכֹלֶת מְיֻחֶדֶת (כְּשֶׁמּוּצֶגֶת בַּמָּסָךְ)</div>
              <div className="mt-0.5 font-display text-base text-pop">
                {meta.icon} {meta.descHe(abilityPct(ab))}
              </div>
            </div>
          );
        })()}

        {/* Direct level-up with goo — the always-available progression. */}
        <button
          type="button"
          onClick={onLevel}
          className={`btn mt-4 flex w-full flex-col items-center py-2.5 ${
            affordLevel ? 'bg-goo text-void glow-goo' : 'bg-black/30 text-bone/45 ring-hairline'
          }`}
        >
          <span className="text-lg">⬆️ שַׁדְרֵג רָמָה</span>
          <span className="text-xs tabular">
            {affordLevel
              ? `${formatGoo(levelCost)} גּוּ · +${formatGoo(levelGain)}/שְׁנִיָּה`
              : `חָסֵר ${formatGoo(levelCost - goo)} גּוּ`}
          </span>
        </button>
        {affordN > 1 && (
          <button
            type="button"
            onClick={onLevelMax}
            className="btn mt-2 w-full bg-cy/90 py-2 text-sm text-void"
          >
            שַׁדְרֵג ×{affordN > 99 ? '99' : affordN} בְּבַת אַחַת
          </button>
        )}

        {canEvolve && (
          <button
            type="button"
            onClick={onEvolve}
            className={`btn mt-3 flex w-full flex-col items-center py-2.5 ${
              affordEvolve ? 'anim-evolve-glow text-void' : 'text-void/70'
            }`}
            style={{ background: 'linear-gradient(135deg,#FFD84D,#FF2E88)' }}
          >
            <span className="text-lg">✨ אֶבּוֹלוּצְיָה — שֶׁלָּב {stage + 1} ✨</span>
            <span className="text-xs tabular">
              {affordEvolve
                ? `${formatGoo(evolveCostGoo)} גּוּ — פִּי ${Math.round(evolveMultNext * 10) / 10} הַכְנָסָה!`
                : `חָסֵר ${formatGoo(evolveCostGoo - goo)} גּוּ`}
            </span>
          </button>
        )}
        {!maxedEvolution && !canEvolve && (
          <div className="mt-3 text-xs text-bone/50">
            אֶבּוֹלוּצְיָה שֶׁלָּב {stage + 1}: הַגֵּעַ לְרָמָה {nextEvolveLevel}
          </div>
        )}
        {maxedEvolution && <div className="mt-3 text-sm text-pop">✨ אֶבּוֹלוּצְיָה מְלֵאָה! ✨</div>}

        {/* Choose this creature as the star of the main screen. */}
        <button
          type="button"
          onClick={() => {
            setEquippedMain(isMain ? null : id);
            if (!isMain) {
              useGame.getState().pushToast({ text: `${def.nameHe} מוּצָג בַּמָּסָךְ! 🎯`, icon: '🎯', tone: 'pop' });
            }
          }}
          className={`btn mt-3 w-full py-2.5 text-base ${
            isMain ? 'bg-pop text-void' : 'bg-black/30 text-bone ring-1 ring-hairline'
          }`}
        >
          {isMain ? '✓ מוּצָג בַּמָּסָךְ הָרָאשִׁי' : '🎯 הַצֵּג בַּמָּסָךְ הָרָאשִׁי'}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="btn mt-2 w-full bg-cy py-3 text-lg text-void"
        >
          סְגוֹר
        </button>
      </div>
    </div>,
    document.body,
  );
}

