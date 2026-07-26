// Screen 3 — collection (§10.3). Creatures are grouped into clear rarity
// sections. Each owned tile shows a small badge = how many times it can be
// levelled up right now with your goo. Tapping a creature opens its details,
// where it can be levelled straight up with goo (and evolved from level 10).

import { useEffect, useState } from 'react';
import { playError, playPurchase } from '../../audio/sfx';
import { speakName } from '../../audio/speech';
import { playJingle } from '../../audio/synth';
import { evolveLevels, evolveMultiplierByStage, maxEvolution } from '../../game/balance';
import { charactersById, collectionOrder } from '../../game/characters';
import {
  affordableCreatureLevels,
  creatureContribution,
  creatureLevelCost,
  evolveCost,
  ownedCreatureIncome,
  upgradeAllFee,
} from '../../game/economy';
import { formatGoo } from '../../game/format';
import type { CharId, Rarity } from '../../game/types';
import { selectGooPerSec, selectMods, useGame } from '../../store';
import { CharacterBody } from '../characters';
import { haptic } from '../haptics';
import { isShareworthy, rarityBackground, rarityColor, rarityLabelHe } from '../rarity';
import { shareCreature } from '../shareCard';

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
  const goo = useGame((s) => s.goo);
  const m = useGame(selectMods);
  const [selected, setSelected] = useState<CharId | null>(null);

  const ownedCount = collectionOrder.filter((id) => owned[id]).length;
  const total = collectionOrder.length;

  const upgradeAll = useGame((s) => s.upgradeAllCreatures);
  const gooPerSecNow = useGame(selectGooPerSec);
  const feeTier = useGame((s) => s.upgradeAllFeeTier);
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
    playJingle(charactersById[id].sound, useGame.getState().muted);
  };

  // Cheapest single level available across owned creatures — enables "upgrade all".
  const cheapest = collectionOrder.reduce((min, id) => {
    const h = owned[id];
    return h ? Math.min(min, creatureLevelCost(charactersById[id].rarity, h, m)) : min;
  }, Infinity);
  // The escalating service fee for THIS press, plus a level actually being buyable.
  const fee = upgradeAllFee(feeTier, gooPerSecNow);
  const canUpgradeAny = !locked && goo > fee && goo - fee >= cheapest;
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
        <h1 className="font-display text-4xl text-bone">הָאוֹסֶף</h1>
        <p className="mt-2 text-sm text-bone/60 tabular">
          {ownedCount} מתוך {total} יצורים
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
              <>
                <span>⬆️ שַׁדְרֵג אֶת כֻּלָּם</span>
                <span className="text-xs tabular">עֲמֵלָה {formatGoo(fee)} גּוּ</span>
              </>
            )}
          </button>
        )}
      </header>

      <div className="flex flex-col gap-5 pb-4">
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
                <span className="font-display text-lg" style={{ color: rarityColor[rarity] }}>
                  {rarityLabelHe[rarity]}
                </span>
                <span className="text-xs text-bone/45 tabular">
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
                  const canLevel = affordableCreatureLevels(def.rarity, held, m, goo);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => open(id)}
                      className="relative flex aspect-square flex-col items-center justify-center rounded-2xl p-1 transition active:scale-95"
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
                        <span className="absolute end-1 top-1 text-sm">✨{stage > 1 ? stage : ''}</span>
                      )}
                      <CharacterBody id={id} className="h-12 w-12" />
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

function DetailModal({ id, onClose }: { id: CharId; onClose: () => void }) {
  const def = charactersById[id];
  const held = useGame((s) => s.characters[id]);
  const goo = useGame((s) => s.goo);
  const m = useGame(selectMods);
  const evolveCreature = useGame((s) => s.evolveCreature);
  const levelUp = useGame((s) => s.levelUpCreature);
  const levelUpMax = useGame((s) => s.levelUpCreatureMax);
  if (!held) return null;

  // The creature's TRUE goo/sec contribution (all automation multipliers folded
  // in), so the numbers here match what the level actually adds to your rate.
  const income = creatureContribution(def.rarity, held, m);
  const stage = held.evolution ?? 0;
  const evolved = stage > 0;
  const ringColor = evolved ? '#FFD84D' : rarityColor[def.rarity];
  // Evolution chain: next stage needs the creature at evolveLevels[stage].
  const maxedEvolution = stage >= maxEvolution;
  const nextEvolveLevel = maxedEvolution ? Infinity : evolveLevels[stage];
  const canEvolve = !maxedEvolution && held.level >= nextEvolveLevel;
  const evolveCostGoo = maxedEvolution ? 0 : evolveCost(def.rarity, held, m);
  const affordEvolve = goo >= evolveCostGoo;
  const evolveMultNext = maxedEvolution ? 1 : evolveMultiplierByStage[stage + 1] / evolveMultiplierByStage[stage];

  // Direct goo leveling.
  const levelCost = creatureLevelCost(def.rarity, held, m);
  const affordLevel = goo >= levelCost;
  const affordN = affordableCreatureLevels(def.rarity, held, m, goo);
  const nextIncome = creatureContribution(def.rarity, { level: held.level + 1, evolution: held.evolution }, m);
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

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="surface anim-pop-in max-h-[88vh] w-full max-w-xs overflow-y-auto rounded-3xl p-6 text-center"
        style={{ boxShadow: `0 0 0 2px ${ringColor}, 0 24px 60px -20px #000` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          className={`relative mx-auto mb-3 flex h-28 w-28 items-center justify-center rounded-2xl ${evolved ? 'anim-hue-spin' : ''}`}
          style={{ background: rarityBackground(def.rarity), boxShadow: `0 0 40px -8px ${ringColor}` }}
        >
          {evolved && <span className="absolute -end-1 -top-1 text-2xl">✨</span>}
          <CharacterBody id={id} className="h-24 w-24" />
        </div>
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
              ? `${formatGoo(levelCost)} גּוּ · +${formatGoo(levelGain)}/שנייה`
              : `חסר ${formatGoo(levelCost - goo)} גּוּ`}
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

        <button
          type="button"
          onClick={() => {
            const m = useGame.getState().muted;
            playJingle(def.sound, m);
            speakName(def.nameHe, m);
          }}
          className="btn mt-3 flex w-full items-center justify-center gap-2 bg-hot py-3 text-lg text-bone"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FFF4E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="#FFF4E0" />
            <path d="M16.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 6a8 8 0 0 1 0 12" />
          </svg>
          שִׁיר!
        </button>

        {canEvolve && (
          <button
            type="button"
            onClick={onEvolve}
            className={`btn mt-3 flex w-full flex-col items-center py-2.5 ${
              affordEvolve ? 'text-void' : 'text-void/70'
            }`}
            style={{ background: 'linear-gradient(135deg,#FFD84D,#FF2E88)' }}
          >
            <span className="text-lg">✨ אֶבּוֹלוּצְיָה — שֶׁלָּב {stage + 1} ✨</span>
            <span className="text-xs tabular">
              {affordEvolve
                ? `${formatGoo(evolveCostGoo)} גּוּ — פי ${Math.round(evolveMultNext * 10) / 10} הכנסה!`
                : `חסר ${formatGoo(evolveCostGoo - goo)} גּוּ`}
            </span>
          </button>
        )}
        {!maxedEvolution && !canEvolve && (
          <div className="mt-3 text-xs text-bone/50">
            אֶבּוֹלוּצְיָה שֶׁלָּב {stage + 1}: הַגֵּעַ לְרָמָה {nextEvolveLevel}
          </div>
        )}
        {maxedEvolution && <div className="mt-3 text-sm text-pop">✨ אֶבּוֹלוּצְיָה מְלֵאָה! ✨</div>}

        {isShareworthy(def.rarity) && <ModalShareButton id={id} />}

        <button
          type="button"
          onClick={onClose}
          className="btn mt-3 w-full bg-cy py-3 text-lg text-void"
        >
          סְגוֹר
        </button>
      </div>
    </div>
  );
}

function ModalShareButton({ id }: { id: CharId }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await shareCreature(id);
      setDone(true);
      window.setTimeout(() => setDone(false), 2500);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onShare}
      disabled={busy}
      className="btn mt-3 flex w-full items-center justify-center gap-2 bg-pop py-3 text-lg text-void"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1A0B2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="9" width="18" height="12" rx="2" />
        <path d="M12 15V3M12 3l-4 4M12 3l4 4" />
      </svg>
      {done ? 'נשמר!' : busy ? 'רגע…' : 'שמור תמונה'}
    </button>
  );
}
