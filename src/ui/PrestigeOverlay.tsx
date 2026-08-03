// Prestige — "גלגול מחדש" (game/prestige.ts). Two pieces: the card at the
// bottom of the upgrades screen (crystals owned, current bonus, and either
// the roll button or progress toward the next crystal), and the
// double-confirmation overlay. The confirmation is deliberately explicit and
// kid-readable: it names exactly what resets and what stays, because the
// reset is the biggest button in the game and a mistaken tap must be both
// hard to make and fully undoable (the roll stashes a backup first).

import {
  canPrestige,
  crystalsGained,
  gooToNextCrystal,
  prestigeMultiplierFor,
} from '../game/prestige';
import { formatGoo } from '../game/format';
import { useGame } from '../store';

function usePrestige() {
  const lifetimeGoo = useGame((s) => s.lifetimeGoo);
  const prestigeCrystals = useGame((s) => s.prestigeCrystals);
  const save = { lifetimeGoo, prestigeCrystals };
  return {
    crystals: prestigeCrystals,
    bonusPct: Math.round((prestigeMultiplierFor(prestigeCrystals) - 1) * 100),
    ready: canPrestige(save),
    gained: crystalsGained(save),
    toNext: gooToNextCrystal(save),
  };
}

export function PrestigeCard() {
  const setOpen = useGame((s) => s.setPrestigeOpen);
  const { crystals, bonusPct, ready, gained, toNext } = usePrestige();

  return (
    <div className="mt-4 rounded-2xl bg-black/30 p-4 ring-1 ring-hairline">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-lg text-bone">💎 גִּלְגּוּל מֵחָדָשׁ</span>
        {crystals > 0 && (
          <span className="rounded-full bg-cy/20 px-3 py-0.5 text-sm font-bold text-cy tabular">
            {crystals} 💎 · ‎+{bonusPct}%
          </span>
        )}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-bone/60">
        מַתְחִילִים מֵהַתְחָלָה — וּמְקַבְּלִים גְּבִישִׁים שֶׁנּוֹתְנִים
        ‎+5% לְכָל הָרְוָחִים, לָנֶצַח!
      </p>
      {ready ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn anim-breathe w-full bg-cy py-3 text-lg text-void"
        >
          לְגַלְגֵּל — 💎 +{gained}!
        </button>
      ) : (
        <div className="text-center text-xs text-bone/50 tabular">
          עוֹד {formatGoo(toNext)} גּוּ לַגָּבִישׁ הַבָּא
        </div>
      )}
    </div>
  );
}

export function PrestigeOverlay() {
  const open = useGame((s) => s.prestigeOpen);
  const setOpen = useGame((s) => s.setPrestigeOpen);
  const roll = useGame((s) => s.prestigeRoll);
  const { ready, gained, bonusPct } = usePrestige();

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-6"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="surface anim-pop-in flex max-h-[86vh] w-full max-w-sm flex-col overflow-y-auto rounded-3xl p-5"
        style={{ boxShadow: '0 0 0 2px #00E5FF, 0 24px 60px -20px #000' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-1 text-center text-5xl">💎</div>
        <div className="mb-3 text-center font-display text-2xl text-bone">גִּלְגּוּל מֵחָדָשׁ?</div>

        <div className="rounded-2xl bg-black/30 p-3 text-sm ring-1 ring-hairline">
          <div className="mb-1 font-bold text-hot">מָה מִתְאַפֵּס:</div>
          <ul className="ms-4 list-disc text-bone/75">
            <li>הַגּוּ שֶׁבַּיָּד וְכָל הַיְּצוּרִים</li>
            <li>הַשִּׁדְרוּגִים וְהַבֵּיצִים</li>
            <li>מְחִירֵי הַבֵּיצִים חוֹזְרִים לִהְיוֹת זוֹלִים! 🥚</li>
          </ul>
          <div className="mb-1 mt-3 font-bold text-goo">מָה נִשְׁאָר לָנֶצַח:</div>
          <ul className="ms-4 list-disc text-bone/75">
            <li>💎 הַגְּבִישִׁים — כָּל אֶחָד נוֹתֵן ‎+5% לְכָל הָרְוָחִים</li>
            <li>הַהֶשֵּׂגִים, הָאֲבִיזָרִים וְהָרְקָעִים</li>
            <li>הַשִּׂיאִים בְּטַבְלַת הַמּוֹבִילִים</li>
          </ul>
        </div>

        <div className="mt-3 rounded-2xl bg-cy/15 p-3 text-center ring-1 ring-cy/40">
          <div className="font-display text-xl text-cy">תְּקַבֵּל עַכְשָׁו 💎 +{gained}</div>
          <div className="text-xs text-bone/60">סַךְ הַבּוֹנוּס אַחֲרֵי הַגִּלְגּוּל: ‎+{bonusPct + gained * 5}%</div>
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => void roll()}
          className="btn mt-4 w-full bg-cy py-3 font-display text-xl text-void"
        >
          כֵּן, מְגַלְגְּלִים! 💎
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn mt-2 w-full bg-black/30 py-3 text-lg text-bone/70 ring-1 ring-hairline"
        >
          לֹא עַכְשָׁו
        </button>
        <p className="mt-2 text-center text-[11px] text-bone/45">
          הִתְחָרַטְתְּ? כַּפְתּוֹר הַשִּׁחְזוּר בַּהֲגָדְרוֹת מַחֲזִיר הַכֹּל.
        </p>
      </div>
    </div>
  );
}
