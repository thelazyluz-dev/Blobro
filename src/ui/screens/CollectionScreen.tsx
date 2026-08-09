// Screen 3 — collection (§10.3). Creatures are grouped into clear rarity
// sections. Each owned tile shows a small badge = how many times it can be
// levelled up right now with your goo. Tapping a creature opens its details,
// where it can be levelled straight up with goo (and evolved from level 10).

import { memo, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { playError, playPurchase } from '../../audio/sfx';
import { speakName } from '../../audio/speech';
import { playJingle } from '../../audio/synth';
import { ABILITY_META, ABILITY_TYPES, abilityForType, abilityOf, abilityPct } from '../../game/abilities';
import {
  charLevelCap,
  evolveLevels,
  evolveMultiplierByStage,
  maxEvolution,
  rebirthCap,
  rebirthIncomeBonus,
  secondAbilityRebirth,
  thirdAbilityRebirth,
} from '../../game/balance';
import { charactersById, collectionOrder, incomeMultOf } from '../../game/characters';
import {
  affordableCreatureLevels,
  creatureContribution,
  creatureLevelCost,
  evolveCost,
  levelUpToCost,
  maxCharLevel,
  ownedCreatureIncome,
  rebirthCost,
} from '../../game/economy';
import { formatGoo } from '../../game/format';
import type { CharId, Rarity } from '../../game/types';
import { DEFAULT_BLOB, accessoryById, blobById } from '../../game/cosmetics';
import { selectCostMods, selectCostWealth, selectMods, useGame } from '../../store';
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

// The grid's affordability badges (how many levels you can buy, evolve/rebirth
// glows) depend on `goo`, which the passive tick moves at 10Hz. Re-rendering a
// 25-tile grid of SVGs — each running a levels-affordable loop — ten times a
// second was the collection-tab jank (felt on scroll and when opening a card,
// since the grid keeps churning behind the modal). Reading a THROTTLED goo
// (~3Hz) instead makes the badges settle a fraction of a second late — invisible
// next to a rolling counter — while cutting the grid's re-render rate ~3×.
function useThrottledGoo(ms = 350): number {
  const [g, setG] = useState(() => useGame.getState().goo);
  useEffect(() => {
    const t = window.setInterval(() => setG(useGame.getState().goo), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return g;
}

// One owned creature tile. Memoized so a grid re-render (throttled goo tick)
// only reconciles a tile whose VISIBLE state actually changed — the primitives
// below are shallow-compared, and `held` keeps its reference across goo ticks
// (it only changes on an upgrade/evolve/rebirth), so an unchanged tile — SVG and
// all — is skipped entirely. This is what keeps scrolling smooth.
interface OwnedTileProps {
  id: CharId;
  held: { level: number; evolution?: number; rebirths?: number };
  canLevel: number;
  evolveReady: boolean;
  rebirthReady: boolean;
  onOpen: (id: CharId) => void;
}
const OwnedTile = memo(function OwnedTile({ id, held, canLevel, evolveReady, rebirthReady, onOpen }: OwnedTileProps) {
  const def = charactersById[id];
  const stage = held.evolution ?? 0;
  const evolved = stage > 0;
  const rebirths = held.rebirths ?? 0;
  const reborn = rebirths > 0;
  const ring = evolved ? '#FFD84D' : rarityColor[def.rarity];
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl p-1 transition active:scale-95 ${
        evolveReady || rebirthReady ? 'tile-ready' : ''
      }`}
      style={
        {
          backgroundColor: '#170a29',
          // Colour for the compositor-cheap ::before ready-pulse (see index.css).
          '--glow': evolveReady ? 'rgba(255,216,77,0.85)' : 'rgba(255,46,136,0.85)',
          boxShadow: reborn
            ? `inset 0 0 0 2px #FF2E88, 0 0 22px -3px #FF2E88`
            : evolved
              ? `inset 0 0 0 2px #FFD84D, 0 0 22px -4px #FFD84D`
              : `inset 0 0 0 2px ${ring}, 0 0 18px -8px ${ring}`,
        } as CSSProperties
      }
    >
      {canLevel > 0 && (
        <span className="absolute start-1 top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-goo px-1 text-[11px] font-bold text-void tabular ring-2 ring-void/50">
          {canLevel > 99 ? '99' : canLevel}
        </span>
      )}
      {evolved && <span className="absolute end-1 top-1 text-sm">✨{stage}</span>}
      <CharacterBody id={id} className="h-12 w-12" evolution={stage} aura={false} />
      <span className={`mt-1 max-w-full truncate px-1 text-[10px] ${evolved ? 'text-pop' : 'text-bone/80'}`}>
        {def.nameHe}
      </span>
      <span className="mt-0.5 flex max-w-full items-center justify-center gap-1 text-[10px] text-pop tabular">
        {reborn && (
          <span
            className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-void ring-1 ring-void/40"
            style={{ background: 'linear-gradient(135deg,#33E1FF,#FF2E88)' }}
          >
            🔄{rebirths}
          </span>
        )}
        <span>
          {evolved ? '✨ ' : ''}רמה {held.level}
        </span>
      </span>
    </button>
  );
});

// A not-yet-owned slot: a click-unlock silhouette with tap-progress, or a plain
// "?" for egg creatures. Memoized on [id, clicks] so it's skipped on goo ticks
// (clicks doesn't move while browsing the collection).
const LockedTile = memo(function LockedTile({ id, clicks }: { id: CharId; clicks: number }) {
  const def = charactersById[id];
  if (def.unlockClicks == null) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-black/40 ring-1 ring-bone/10">
        <span className="font-display text-4xl text-bone/25">?</span>
      </div>
    );
  }
  const pct = Math.min(100, (clicks / def.unlockClicks) * 100);
  return (
    <div
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
});

export function CollectionScreen() {
  const owned = useGame((s) => s.characters);
  const setTab = useGame((s) => s.setTab);
  const goo = useThrottledGoo();
  const clicks = useGame((s) => s.clicks);
  // Grid uses these ONLY for pricing/affordability — base (no displayed-creature
  // ability), so a creature's cost is the same whether or not it's on screen.
  const m = useGame(selectCostMods);
  const [selected, setSelected] = useState<CharId | null>(null);

  const ownedCount = collectionOrder.filter((id) => owned[id]).length;
  const total = collectionOrder.length;

  const upgradeAll = useGame((s) => s.upgradeAllCreatures);
  const gooPerSecNow = useGame(selectCostWealth);
  const readyAt = useGame((s) => s.upgradeAllReadyAt);

  // A ticking "now" so the cooldown countdown updates once a second while locked.
  const [now, setNow] = useState(() => Date.now());
  const locked = now < readyAt;
  useEffect(() => {
    if (!locked) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [locked]);

  // Stable identity so the memoized tiles don't re-render just because the parent
  // made a fresh closure on a goo tick.
  const open = useCallback((id: CharId) => {
    setSelected(id);
    const muted = useGame.getState().muted;
    playJingle(charactersById[id].sound, muted);
    speakName(charactersById[id].nameHe, muted); // say the creature's name on open
  }, []);

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
            // content-visibility skips layout/paint (and the animated glows) for a
            // section scrolled off-screen; the intrinsic-size estimate keeps the
            // scrollbar steady. This is the big scroll + idle-FPS win when the
            // roster is large and several tiles are pulsing.
            <section key={rarity} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 360px' }}>
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
                  if (!held) return <LockedTile key={id} id={id} clicks={clicks} />;
                  const stage = held.evolution ?? 0;
                  const rebirths = held.rebirths ?? 0;
                  // Cap at 100 — the badge only shows up to "99+". Computed in the
                  // parent (off the throttled goo) and passed down, so the memoized
                  // tile only reconciles when one of these actually changes.
                  const canLevel = affordableCreatureLevels(def.rarity, held, m, goo, gooPerSecNow, incomeMultOf(def), 100);
                  const evolveReady =
                    stage < maxEvolution &&
                    held.level >= evolveLevels[stage] &&
                    goo >= evolveCost(def.rarity, held, m, gooPerSecNow, incomeMultOf(def));
                  const rebirthReady =
                    stage >= maxEvolution &&
                    rebirths < rebirthCap &&
                    goo >= rebirthCost(rebirths, gooPerSecNow);
                  return (
                    <OwnedTile
                      key={id}
                      id={id}
                      held={held}
                      canLevel={canLevel}
                      evolveReady={evolveReady}
                      rebirthReady={rebirthReady}
                      onOpen={open}
                    />
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
  // Throttled: the modal's affordability lines don't need the 10Hz counter — a
  // ~3Hz update keeps its big SVG + cost math from re-rendering ten times a
  // second while open (part of the "entering a card" jank). `held` still updates
  // instantly on an upgrade, so the level/stage react immediately.
  const goo = useThrottledGoo();
  // `m` (with the displayed-creature ability) is for the income numbers shown.
  // Costs use the base mods + base wealth so displaying a creature never moves
  // its upgrade/evolution/rebirth price — the ability is a pure income win.
  const m = useGame(selectMods);
  const costM = useGame(selectCostMods);
  const costRate = useGame(selectCostWealth);
  const evolveCreature = useGame((s) => s.evolveCreature);
  const evolveWithLevelUp = useGame((s) => s.evolveWithLevelUp);
  const rebirthCreature = useGame((s) => s.rebirthCreature);
  const setSecondAbility = useGame((s) => s.setSecondAbility);
  const setThirdAbility = useGame((s) => s.setThirdAbility);
  const levelUp = useGame((s) => s.levelUpCreature);
  const levelUpMax = useGame((s) => s.levelUpCreatureMax);
  const isMain = useGame((s) => s.equippedMain === id);
  const setEquippedMain = useGame((s) => s.setEquippedMain);
  // Rebirth is irreversible (the creature loses its levels), so it takes a
  // deliberate second tap to confirm — never a single accidental press.
  const [confirmRebirth, setConfirmRebirth] = useState(false);
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
  // Rebirth (mastering loop): only at max evolution, and only below the cap.
  const rebirths = held.rebirths ?? 0;
  const eligibleRebirth = maxedEvolution && rebirths < rebirthCap;
  const rebirthGooCost = eligibleRebirth ? rebirthCost(rebirths, costRate) : 0;
  const affordRebirth = goo >= rebirthGooCost;
  const canRebirth = eligibleRebirth && affordRebirth;
  const rebirthCapped = rebirths >= rebirthCap;
  const nextEvolveLevel = maxedEvolution ? Infinity : evolveLevels[stage];
  const canEvolve = !maxedEvolution && held.level >= nextEvolveLevel;
  const evolveCostGoo = maxedEvolution ? 0 : evolveCost(def.rarity, held, costM, costRate, im);
  const affordEvolve = goo >= evolveCostGoo;
  const evolveMultNext = maxedEvolution ? 1 : evolveMultiplierByStage[stage + 1] / evolveMultiplierByStage[stage];
  // "Level up to the threshold AND evolve" in one press — offered when the
  // creature is still below the required level but the player can afford BOTH
  // the missing levels and the evolution. Evolve cost is measured at the TARGET
  // level (that's the state you'd evolve from), matching the store action.
  const combinedEvolveCost = maxedEvolution
    ? 0
    : levelUpToCost(def.rarity, held, nextEvolveLevel, costM, costRate, im) +
      evolveCost(def.rarity, { ...held, level: nextEvolveLevel }, costM, costRate, im);
  const canCombinedEvolve = !maxedEvolution && !canEvolve && goo >= combinedEvolveCost;

  // Direct goo leveling. The level wall (§ owner rule): a creature stops at
  // charLevelCap until it has mastered itself (reached the rebirth cap), then
  // levels without bound — maxCharLevel resolves the two.
  const atLevelCap = held.level >= maxCharLevel(rebirths);
  const levelCost = creatureLevelCost(def.rarity, held, costM, costRate, im);
  const affordLevel = goo >= levelCost;
  const affordN = affordableCreatureLevels(def.rarity, held, costM, goo, costRate, im);
  // What the batch button will actually SPEND. The "buy max affordable" action
  // can drain most of the bank in one tap, and the button used to show only a
  // count (which then dropped to 0) with no price — so a player tapped it and
  // watched their goo vanish. Show the total cost, like the single-level button.
  const batchCost = levelUpToCost(def.rarity, held, held.level + affordN, costM, costRate, im);
  const nextIncome = creatureContribution(def.rarity, { ...held, level: held.level + 1 }, m, im);
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

  const onCombinedEvolve = () => {
    const muted = useGame.getState().muted;
    if (canCombinedEvolve) {
      evolveWithLevelUp(id);
      playPurchase(muted);
      haptic([0, 40, 30, 60]);
    } else {
      playError(muted);
    }
  };

  const onRebirth = () => {
    const muted = useGame.getState().muted;
    if (!affordRebirth) {
      playError(muted);
      return;
    }
    if (!confirmRebirth) {
      setConfirmRebirth(true); // first tap arms the confirm
      return;
    }
    rebirthCreature(id);
    setConfirmRebirth(false);
    playPurchase(muted);
    haptic([0, 50, 40, 80]);
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

        {/* The special ability this creature grants when it's your main —
            strengthened permanently by each rebirth (the mastering loop). We
            show the ability NAME (so it's clear what it is) and, when reborn, a
            permanent breakdown of exactly what the rebirths added. */}
        {(() => {
          const ab = abilityOf(id, def.rarity, rebirths);
          const abBase = abilityOf(id, def.rarity, 0);
          const meta = ABILITY_META[ab.type];
          const abilityAdd = abilityPct(ab) - abilityPct(abBase);
          // Each rebirth adds +10% to your GLOBAL income (always on) — this is
          // THIS creature's contribution to that total.
          const incomeAdd = Math.round(rebirthIncomeBonus * Math.min(rebirths, rebirthCap) * 100);
          return (
            <div className="mt-3 rounded-2xl bg-pop/10 px-3 py-2 ring-1 ring-pop/30">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-bone/55">
                  {meta.icon} {meta.nameHe} <span className="text-bone/40">(כְּשֶׁמּוּצֶגֶת בַּמָּסָךְ)</span>
                </div>
                {rebirths > 0 && (
                  <div className="shrink-0 rounded-full bg-pop/25 px-2 py-0.5 text-xs font-bold text-pop tabular">
                    🔄 {rebirths}
                  </div>
                )}
              </div>
              <div className="mt-0.5 font-display text-base text-pop">{meta.descHe(abilityPct(ab))}</div>
              {rebirths > 0 && (
                <div className="mt-1 text-xs font-bold text-cy">
                  🔄 מִלֵּידָה מֵחָדָשׁ: +{abilityAdd}% יְכֹלֶת · +{incomeAdd}% לַהַכְנָסָה הַכְּלָלִית
                </div>
              )}
            </div>
          );
        })()}

        {/* Second ability — unlocked at the 10th rebirth. Pick any type except
            the creature's native one and its (later) third one — all three stay
            distinct. Standard rarity value; re-choosable. */}
        {rebirths >= secondAbilityRebirth &&
          (() => {
            const nativeType = abilityOf(id, def.rarity, 0).type;
            const choices = ABILITY_TYPES.filter((t) => t !== nativeType && t !== held.thirdAbility);
            const current = held.secondAbility && held.secondAbility !== nativeType ? held.secondAbility : null;
            return (
              <div className="mt-3 rounded-2xl bg-cy/10 px-3 py-2 ring-1 ring-cy/30">
                <div className="text-xs text-bone/55">
                  ✨ יְכֹלֶת שְׁנִיָּה <span className="text-bone/40">(נִפְתְּחָה בְּלֵידָה {secondAbilityRebirth})</span>
                </div>
                {current ? (
                  <div className="mt-0.5 font-display text-base text-cy">
                    {ABILITY_META[current].icon} {ABILITY_META[current].descHe(abilityPct(abilityForType(current, def.rarity)))}
                  </div>
                ) : (
                  <div className="mt-0.5 text-sm text-bone/60">בְּחַר יְכֹלֶת נוֹסֶפֶת לְהוֹסִיף:</div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {choices.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setSecondAbility(id, t);
                        playPurchase(useGame.getState().muted);
                        haptic(12);
                      }}
                      className={`rounded-full px-2.5 py-1 text-xs ring-1 active:scale-95 ${
                        t === current ? 'bg-cy font-bold text-void ring-transparent' : 'bg-black/30 text-bone/70 ring-hairline'
                      }`}
                    >
                      {ABILITY_META[t].icon} {ABILITY_META[t].nameHe}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

        {/* Third ability — the mastering-loop finale, unlocked at the FINAL
            rebirth. Pick any type except the creature's native one and its second
            one, so all three abilities stay distinct. Standard rarity value;
            re-choosable. */}
        {rebirths >= thirdAbilityRebirth &&
          (() => {
            const nativeType = abilityOf(id, def.rarity, 0).type;
            const choices = ABILITY_TYPES.filter((t) => t !== nativeType && t !== held.secondAbility);
            const current =
              held.thirdAbility && held.thirdAbility !== nativeType && held.thirdAbility !== held.secondAbility
                ? held.thirdAbility
                : null;
            return (
              <div className="mt-3 rounded-2xl bg-pop/10 px-3 py-2 ring-1 ring-pop/30">
                <div className="text-xs text-bone/55">
                  🌟 יְכֹלֶת שְׁלִישִׁית <span className="text-bone/40">(נִפְתְּחָה בְּלֵידָה {thirdAbilityRebirth})</span>
                </div>
                {current ? (
                  <div className="mt-0.5 font-display text-base text-pop">
                    {ABILITY_META[current].icon} {ABILITY_META[current].descHe(abilityPct(abilityForType(current, def.rarity)))}
                  </div>
                ) : (
                  <div className="mt-0.5 text-sm text-bone/60">בְּחַר יְכֹלֶת שְׁלִישִׁית לְהוֹסִיף:</div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {choices.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setThirdAbility(id, t);
                        playPurchase(useGame.getState().muted);
                        haptic(12);
                      }}
                      className={`rounded-full px-2.5 py-1 text-xs ring-1 active:scale-95 ${
                        t === current ? 'bg-pop font-bold text-void ring-transparent' : 'bg-black/30 text-bone/70 ring-hairline'
                      }`}
                    >
                      {ABILITY_META[t].icon} {ABILITY_META[t].nameHe}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

        {/* Direct level-up with goo — the always-available progression, until the
            level wall. At the cap the button turns into a clear "you've hit the
            ceiling; master the creature to break it" note instead of a dead
            buy button. */}
        {atLevelCap ? (
          <div className="mt-4 rounded-2xl bg-cy/10 px-3 py-2.5 text-center ring-1 ring-cy/30">
            {rebirthCapped ? (
              // Fully mastered AND leveled to where income stops growing — say so
              // plainly instead of selling levels that add nothing (the "level
              // climbs, income frozen" report). This is the top of this creature.
              <>
                <div className="font-display text-base text-cy">🏆 הַכְנָסָה מַקְסִימָלִית!</div>
                <div className="mt-0.5 text-xs text-bone/60">
                  הַיְּצוּר הַזֶּה נָתַן אֶת הַכֹּל — הַגִּיעַ לַשִּׂיא! שַׁדְרְגוּ יְצוּרִים אֲחֵרִים 🚀
                </div>
              </>
            ) : (
              <>
                <div className="font-display text-base text-cy">🏆 רָמָה מַקְסִימָלִית — {charLevelCap}!</div>
                <div className="mt-0.5 text-xs text-bone/60">
                  לְהַמְשִׁיךְ מֵעֵבֶר: לֵידָה מֵחָדָשׁ עַד {rebirthCap} תָּסִיר אֶת הַמַּגְבָּלָה 🔄
                </div>
              </>
            )}
          </div>
        ) : (
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
        )}
        {!atLevelCap && affordN > 1 && (
          <button
            type="button"
            onClick={onLevelMax}
            className="btn mt-2 flex w-full flex-col items-center bg-cy/90 py-2 text-void"
          >
            {/* Count AND price. affordN is the real number this buys (it caps at
                999 and is the same value the action spends against, so the button
                never promises less than it does). The price line is the fix for
                the "I pressed and my goo became 0" report: "buy max" can spend
                almost the whole bank in one tap, so the player must see the cost
                BEFORE tapping — exactly like the single-level button above. */}
            <span className="text-sm">⬆️ שַׁדְרֵג ×{affordN} בְּבַת אַחַת</span>
            <span className="text-xs tabular">{formatGoo(batchCost)} גּוּ</span>
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
        {/* Below the required level, but you can afford to level all the way up
            AND evolve — offer it as one lit button that does both and charges the
            whole sum (field feedback: don't make me climb levels by hand first). */}
        {canCombinedEvolve && (
          <button
            type="button"
            onClick={onCombinedEvolve}
            className="btn anim-evolve-glow mt-3 flex w-full flex-col items-center py-2.5 text-void"
            style={{ background: 'linear-gradient(135deg,#FFD84D,#FF2E88)' }}
          >
            <span className="text-lg">✨ שַׁדְרֵג לְרָמָה {nextEvolveLevel} + אֶבּוֹלוּצְיָה ✨</span>
            <span className="text-xs tabular">
              {formatGoo(combinedEvolveCost)} גּוּ — פִּי {Math.round(evolveMultNext * 10) / 10} הַכְנָסָה!
            </span>
          </button>
        )}
        {!maxedEvolution && !canEvolve && !canCombinedEvolve && (
          <div className="mt-3 text-xs text-bone/50">
            אֶבּוֹלוּצְיָה שֶׁלָּב {stage + 1}: הַגֵּעַ לְרָמָה {nextEvolveLevel} · {formatGoo(combinedEvolveCost)} גּוּ הַכֹּל
          </div>
        )}
        {maxedEvolution && <div className="mt-3 text-sm text-pop">✨ אֶבּוֹלוּצְיָה מְלֵאָה! ✨</div>}

        {/* Rebirth — the mastering loop. Only shown at max evolution. Resets the
            creature to level 1 but permanently strengthens its ability (+income
            too), so it ends up stronger than before. Two-tap confirm because it
            wipes the creature's levels. */}
        {eligibleRebirth && (
          <button
            type="button"
            onClick={onRebirth}
            className={`btn mt-3 flex w-full flex-col items-center py-2.5 ${
              affordRebirth ? `text-void ${confirmRebirth ? 'anim-evolve-glow' : ''}` : 'bg-black/30 text-bone/45 ring-hairline'
            }`}
            style={affordRebirth ? { background: 'linear-gradient(135deg,#33E1FF,#FF2E88)' } : undefined}
          >
            {!affordRebirth ? (
              <>
                <span className="text-lg">🔄 לֵידָה מֵחָדָשׁ</span>
                <span className="text-xs tabular">חָסֵר {formatGoo(rebirthGooCost - goo)} גּוּ</span>
              </>
            ) : confirmRebirth ? (
              <>
                <span className="text-lg">בְּטוּחִים? 🔄 חוֹזֵר לְרָמָה 1</span>
                <span className="text-xs">הַיְּכֹלֶת תִּתְחַזֵּק לָנֶצַח — לַחֲצוּ שׁוּב</span>
              </>
            ) : (
              <>
                <span className="text-lg">🔄 לֵידָה מֵחָדָשׁ — {formatGoo(rebirthGooCost)} גּוּ</span>
                <span className="text-xs tabular">
                  יְכֹלֶת חֲזָקָה יוֹתֵר + {Math.round(rebirthIncomeBonus * 100)}% הַכְנָסָה לָנֶצַח
                </span>
              </>
            )}
          </button>
        )}
        {confirmRebirth && canRebirth && (
          <button
            type="button"
            onClick={() => setConfirmRebirth(false)}
            className="btn mt-2 w-full bg-black/30 py-2 text-sm text-bone ring-1 ring-hairline"
          >
            בִּיטּוּל
          </button>
        )}
        {rebirthCapped && (
          <div className="mt-3 text-sm text-cy">🏆 מָאסְטֵר! {rebirthCap} לֵידוֹת — הַשִּׂיא!</div>
        )}

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

