// Screen 3 — collection (§10.3). 10-slot grid; unowned slots are a black
// silhouette with a question mark; tapping an owned creature shows details.

import { useState } from 'react';
import { playJingle } from '../../audio/synth';
import { charactersById, collectionOrder } from '../../game/characters';
import { charIncome } from '../../game/economy';
import { formatGoo } from '../../game/format';
import { maxCharLevel } from '../../game/balance';
import type { CharId } from '../../game/types';
import { useGame } from '../../store';
import { CharacterBody } from '../characters';
import { isShareworthy, rarityBackground, rarityColor, rarityLabelHe } from '../rarity';
import { shareCreature } from '../shareCard';

export function CollectionScreen() {
  const owned = useGame((s) => s.characters);
  const [selected, setSelected] = useState<CharId | null>(null);

  const ownedCount = collectionOrder.filter((id) => owned[id]).length;
  const total = collectionOrder.length;

  // Tapping an owned creature opens its details and plays its jingle (§10.3).
  const open = (id: CharId) => {
    setSelected(id);
    playJingle(charactersById[id].sound, useGame.getState().muted);
  };

  return (
    <div className="anim-tab-in h-full overflow-y-auto px-5 py-6">
      <header className="mb-5 text-center">
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
      </header>

      <div className="grid grid-cols-3 gap-3 pb-4">
        {collectionOrder.map((id) => {
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
          return (
            <button
              key={id}
              type="button"
              onClick={() => open(id)}
              className="flex aspect-square flex-col items-center justify-center rounded-2xl p-1 transition active:scale-95"
              style={{
                backgroundColor: '#170a29',
                boxShadow: `inset 0 0 0 2px ${rarityColor[def.rarity]}, 0 0 18px -8px ${rarityColor[def.rarity]}`,
              }}
            >
              <CharacterBody id={id} className="h-12 w-12" />
              <span className="mt-1 max-w-full truncate px-1 text-[10px] text-bone/80">{def.nameHe}</span>
              <span className="text-[10px] text-pop tabular">רמה {held.level}</span>
            </button>
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
  if (!held) return null;

  const income = charIncome(def.rarity, held.level);
  const maxed = held.level >= maxCharLevel;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="surface anim-pop-in w-full max-w-xs rounded-3xl p-6 text-center"
        style={{ boxShadow: `0 0 0 2px ${rarityColor[def.rarity]}, 0 24px 60px -20px #000` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="mx-auto mb-3 flex h-28 w-28 items-center justify-center rounded-2xl"
          style={{ background: rarityBackground(def.rarity), boxShadow: `0 0 40px -8px ${rarityColor[def.rarity]}` }}
        >
          <CharacterBody id={id} className="h-24 w-24" />
        </div>
        <div className="font-display text-3xl text-bone">{def.nameHe}</div>
        <div className="text-sm text-bone/50">{def.nameLatin}</div>
        <div
          className="mx-auto mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold text-void"
          style={{ background: rarityBackground(def.rarity) }}
        >
          {rarityLabelHe[def.rarity]}
        </div>
        <div className="mt-4 text-lg text-pop tabular">
          רמה {held.level}
          {maxed ? ' — מקסימום!' : ''}
        </div>
        <div className="text-goo tabular">{formatGoo(income)} גּוּ/שנייה</div>

        <button
          type="button"
          onClick={() => playJingle(def.sound, useGame.getState().muted)}
          className="btn mt-4 flex w-full items-center justify-center gap-2 bg-hot py-3 text-lg text-bone"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FFF4E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="#FFF4E0" />
            <path d="M16.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 6a8 8 0 0 1 0 12" />
          </svg>
          שִׁיר!
        </button>

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
