// Prestige — "גלגול מחדש" (game/prestige.ts). Two pieces: the card at the
// bottom of the upgrades screen (crystals owned, current bonus, and either
// the roll button or progress toward the next crystal), and the
// double-confirmation overlay. The confirmation is deliberately explicit and
// kid-readable: it names exactly what resets and what stays, because the
// reset is the biggest button in the game and a mistaken tap must be both
// hard to make and fully undoable (the roll stashes a backup first).

import { playMilestone } from '../audio/sfx';
import {
  canPrestige,
  crystalsFor,
  crystalsGained,
  gooToNextCrystal,
  prestigeMultiplierFor,
  prestigeProgress,
} from '../game/prestige';
import { formatGoo } from '../game/format';
import { selectGooPerSec, useGame } from '../store';

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
    // Progress through the current lifetime band toward the next crystal (0..1).
    progress: prestigeProgress(save),
    // The permanent bonus you'd hold AFTER rolling now — the real curve, not a
    // hardcoded per-crystal number (crystals after a roll == crystalsFor(life)).
    totalBonusPct: Math.round((prestigeMultiplierFor(crystalsFor(lifetimeGoo)) - 1) * 100),
  };
}

export function PrestigeCard() {
  const setOpen = useGame((s) => s.setPrestigeOpen);
  const { crystals, bonusPct, ready, gained, toNext, progress } = usePrestige();

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
        <>
          <div className="anim-breathe mb-2 text-center font-display text-base text-cy">
            💎 {gained} מְחַכִּים לְךָ!
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn w-full bg-cy py-3 text-lg text-void"
          >
            לְגַלְגֵּל — 💎 +{gained}!
          </button>
        </>
      ) : (
        <>
          {/* A log-space bar toward the next crystal — the "one at a time" feel
              the roll itself can't give (crystals are a function of lifetime). */}
          <div className="h-2.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-hairline">
            <div
              className="h-full rounded-full bg-cy transition-[width] duration-500"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="mt-1.5 text-center text-xs text-bone/50 tabular">
            עוֹד {formatGoo(toNext)} גּוּ לַגָּבִישׁ הַבָּא 💎
          </div>
        </>
      )}
    </div>
  );
}

export function PrestigeOverlay() {
  const open = useGame((s) => s.prestigeOpen);
  const setOpen = useGame((s) => s.setPrestigeOpen);
  const roll = useGame((s) => s.prestigeRoll);
  const gps = useGame(selectGooPerSec);
  const { ready, gained, totalBonusPct } = usePrestige();

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
          <div className="mb-1 text-xs text-bone/60">
            כָּרֶגַע אַתָּה מַרְוִיחַ <span className="tabular text-bone">{formatGoo(gps)}</span> גּוּ לְשְׁנִיָּה — וְתַתְחִיל שׁוּב מֵאֶפֶס.
          </div>
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

        {/* Kids fear losing their creatures forever — reassure honestly: the
            mastery (stars/achievements) is kept, and re-collecting is faster. */}
        <div className="mt-3 rounded-2xl bg-goo/10 p-3 text-xs leading-relaxed text-bone/70 ring-1 ring-goo/30">
          🥚 הַיְּצוּרִים חוֹזְרִים לַבֵּיצָה — אֲבָל הַכּוֹכָבִים וְהַהֶשֵּׂגִים
          שֶׁכְּבָר צָבַרְתָּ נִשְׁאָרִים, וְעִם הַגְּבִישִׁים תֶּאֱסֹף אוֹתָם
          שׁוּב הַרְבֵּה יוֹתֵר מַהֵר! 💪
        </div>

        <div className="mt-3 rounded-2xl bg-cy/15 p-3 text-center ring-1 ring-cy/40">
          <div className="font-display text-xl text-cy">תְּקַבֵּל עַכְשָׁו 💎 +{gained}</div>
          <div className="text-xs text-bone/60">סַךְ הַבּוֹנוּס אַחֲרֵי הַגִּלְגּוּל: ‎+{totalBonusPct}%</div>
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            // The game's biggest decision was silent (sound audit) — fanfare it.
            playMilestone(useGame.getState().muted);
            void roll();
          }}
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
