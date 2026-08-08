// The googol victory — the game's endgame moment (owner-approved
// "Victory + Hall of Fame"). When held goo first crosses the win threshold
// (see useGameEngine → winGoogol), this takes over the screen once, ever:
// it crowns the player אַלּוּף הַגּוּגּוֹל, hands them the exclusive champion
// crown, and makes clear the game keeps going. Owning the crown is the
// persisted proof, so this never re-appears. Honors reduced-motion.

import { useState } from 'react';
import { collectionOrder } from '../game/characters';
import { formatGooHero } from '../game/format';
import { useGame } from '../store';
import { shareProgress } from './shareCard';
import { useReducedMotion } from './useReducedMotion';

export function VictoryOverlay() {
  const victory = useGame((s) => s.victory);
  const dismiss = useGame((s) => s.dismissVictory);
  const goo = useGame((s) => s.goo);
  const characters = useGame((s) => s.characters);
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!victory) return null;

  const collectionCount = collectionOrder.filter((id) => characters[id]).length;

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await shareProgress({
        goo,
        collectionCount,
        total: collectionOrder.length,
        titleHe: '👑 אַלּוּף הַגּוּגּוֹל!',
        factHe: 'הִגַּעְתִּי לְגּוּגּוֹל גּוּ (1 וְאַחֲרָיו מֵאָה אֲפָסִים!) וְקִבַּלְתִּי אֶת כֶּתֶר הָאַלּוּפִים! 🏆',
      });
      setDone(true);
      window.setTimeout(() => setDone(false), 2500);
    } catch {
      /* ignore — can retry */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden p-6 text-center ${
        reduced ? '' : 'anim-screen-shake'
      }`}
      style={{ backgroundColor: 'rgba(6,2,14,0.97)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`pointer-events-none absolute inset-0 ${reduced ? '' : 'anim-burst'}`}
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(255,216,77,0.45), rgba(255,46,136,0.22) 45%, transparent 72%)',
        }}
        aria-hidden
      />

      <div className={`relative flex flex-col items-center ${reduced ? '' : 'anim-pop-in'}`}>
        <div className="text-8xl">👑</div>
        <h2
          className="mt-3 font-display text-5xl text-gold"
          style={{ color: '#FFD84D', textShadow: '0 0 32px rgba(255,216,77,0.6)' }}
        >
          אַלּוּף הַגּוּגּוֹל!
        </h2>

        <div className="mt-5 font-display text-6xl tabular text-goo text-glow-pop">
          {formatGooHero(goo)}
        </div>
        <div className="mt-1 text-sm text-bone/60">גּוּ</div>

        <p className="mx-auto mt-6 max-w-[19rem] text-lg leading-relaxed text-cy">
          נִצַּחְתָּ אֶת בְּלוֹרְבּוֹ! זָכִיתָ בְּכֶתֶר הָאַלּוּפִים — עֲנֹד אוֹתוֹ בְּגַאֲוָה.
        </p>
        <p className="mx-auto mt-2 max-w-[19rem] text-sm leading-relaxed text-bone/70">
          וְהַמִּשְׂחָק מַמְשִׁיךְ — יֵשׁ עוֹד הַרְבֵּה לְאָן לְטַפֵּס. 🚀
        </p>

        <button
          type="button"
          onClick={onShare}
          disabled={busy}
          className="btn mt-8 flex items-center gap-2 bg-hot px-8 py-3 text-lg text-bone glow-hot"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#FFF4E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="9" width="18" height="12" rx="2" />
            <path d="M12 15V3M12 3l-4 4M12 3l4 4" />
          </svg>
          {done ? 'נשמר!' : busy ? 'רגע…' : 'שַׁתֵּף אֶת הַנִּצָּחוֹן!'}
        </button>

        <button type="button" onClick={dismiss} className="btn mt-3 bg-cy px-12 py-3 text-xl text-void">
          יֵשׁ!
        </button>
      </div>
    </div>
  );
}
