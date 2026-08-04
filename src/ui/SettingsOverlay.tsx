// Account, sound, help, and start-over — everything that isn't "how am I
// doing" lives here instead of inside the stats panel. Same modal shape as
// ProgressOverlay/StatsOverlay: backdrop, `surface` card, scroll area, a big
// close button pinned at the bottom.

import { useEffect, useState } from 'react';
import { playPurchase } from '../audio/sfx';
import { formatGoo } from '../game/format';
import { useGame } from '../store';
import { haptic } from './haptics';
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall } from './pwaInstall';
import { whatsappShareUrl } from './share';

// Invite a friend (WhatsApp) + install the app. Sharing is the growth loop the
// owner is distributing around; install keeps returning players one tap away.
function ShareInstallSection() {
  const [installed, setInstalled] = useState(() => isStandalone());
  const [canInstall, setCanInstall] = useState(() => canPromptInstall());
  const [iosSteps, setIosSteps] = useState(false);

  useEffect(
    () =>
      onInstallChange(() => {
        setInstalled(isStandalone());
        setCanInstall(canPromptInstall());
      }),
    [],
  );

  const onInstall = async () => {
    if (canPromptInstall()) {
      await promptInstall();
      setInstalled(isStandalone());
      setCanInstall(canPromptInstall());
    } else if (isIOS()) {
      setIosSteps((s) => !s); // no native prompt on iOS — reveal the manual steps
    } else {
      setIosSteps(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex gap-2">
        <a
          href={whatsappShareUrl()}
          target="_blank"
          rel="noopener"
          className="btn flex-1 bg-black/30 py-2 text-center text-sm text-bone ring-1 ring-hairline"
        >
          💬 שַׁתְּפוּ חֲבֵרִים
        </a>
        {!installed && (canInstall || isIOS()) && (
          <button
            type="button"
            onClick={onInstall}
            className="btn flex-1 bg-black/30 py-2 text-center text-sm text-bone ring-1 ring-hairline"
          >
            📲 הַתְקָנָה
          </button>
        )}
      </div>
      {installed && <p className="text-center text-xs text-bone/50">הָאַפְּלִיקַצְיָה מֻתְקֶנֶת ✓</p>}
      {iosSteps && !installed && (
        <div className="rounded-2xl bg-black/25 px-3 py-2.5 text-sm leading-relaxed text-bone/80 ring-hairline">
          כְּדֵי לְהַתְקִין: לַחֲצוּ עַל <span className="font-bold text-cy">שִׁתּוּף</span>{' '}
          <span aria-hidden>📤</span> לְמַטָּה, וְאָז עַל <span className="font-bold text-cy">"הוֹסֵף לְמָסָךְ הַבַּיִת"</span>.
        </div>
      )}
    </section>
  );
}

export function SettingsButton() {
  const setOpen = useGame((s) => s.setSettingsOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="הגדרות"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/40 text-lg ring-1 ring-hairline active:scale-90"
    >
      ⚙️
    </button>
  );
}

function ResetSection() {
  const resetGame = useGame((s) => s.resetGame);
  const [confirming, setConfirming] = useState(false);

  const onReset = () => {
    resetGame();
    setConfirming(false);
    playPurchase(useGame.getState().muted);
    haptic([0, 40, 30, 60]);
  };

  return (
    <section className="mt-1 border-t border-hairline pt-4 text-center">
      <h3 className="mb-1 font-display text-sm text-bone/60">הַתְחָלָה מֵחָדָשׁ</h3>
      <p className="mb-2 text-[11px] text-bone/45">מוֹחֵק אֶת כָּל הַהִתְקַדְּמוּת וּמַתְחִיל מֵאֶפֶס</p>
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

// Identity + sign-out (PR 3b). Renders nothing when nobody's signed in — with
// AUTH_REQUIRED off (the default) that's everybody, so this section is
// invisible until the owner turns auth on and players start creating accounts.
// Recovery for a save displaced by a cloud merge. Renders NOTHING in the
// normal case — a stash only exists when signing in on this device brought
// down a save that outranked the local one, which for almost every player
// never happens. It is deliberately not framed as an error or a warning: for
// a kid this reads as "your other game is here too", not "something broke".
//
// The confirm step is worth the friction. Swapping the whole save is the
// single most consequential button in the game, and it sits right next to
// sign-out; a mis-tap should not silently replace what you were just playing.
function BackupSection() {
  const backup = useGame((s) => s.backupAvailable);
  const restoreBackup = useGame((s) => s.restoreBackup);
  const lifetimeGoo = useGame((s) => s.lifetimeGoo);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!backup) return null;

  const onRestore = () => {
    if (busy) return;
    setBusy(true);
    void restoreBackup().finally(() => {
      setBusy(false);
      setConfirming(false);
    });
  };

  return (
    <div className="mb-2 rounded-2xl bg-black/25 p-3 text-center ring-hairline">
      <p className="text-[11px] leading-relaxed text-bone/60">
        יֵשׁ כָּאן עוֹד מִשְׂחָק שָׁמוּר מֵהַמַּכְשִׁיר הַזֶּה, עִם{' '}
        <strong className="text-cy" dir="ltr">
          {formatGoo(backup.lifetimeGoo)}
        </strong>{' '}
        גּוּ סַךְ הַכֹּל. הַמִּשְׂחָק הַנּוֹכְחִי שֶׁלְּךָ:{' '}
        <strong dir="ltr">{formatGoo(lifetimeGoo)}</strong>.
      </p>
      {confirming ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onRestore}
            disabled={busy}
            className="btn flex-1 bg-cy py-2 text-xs text-void disabled:opacity-60"
          >
            כֵּן, לְהַחְלִיף
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="btn flex-1 bg-black/30 py-2 text-xs text-bone ring-1 ring-hairline"
          >
            בִּיטּוּל
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="btn mt-2 w-full bg-black/30 py-2 text-xs text-bone ring-1 ring-hairline"
        >
          🔄 לַחֲזוֹר לַמִּשְׂחָק הַשָּׁמוּר
        </button>
      )}
      {/* Says plainly that this is reversible — the action swaps rather than
          overwrites, and a player who can't undo won't dare press at all. */}
      <p className="mt-1.5 text-[10px] text-bone/40">אֶפְשָׁר תָּמִיד לַחֲזוֹר אֲחוֹרָה — שׁוּם מִשְׂחָק לֹא נִמְחָק.</p>
    </div>
  );
}

function AccountSection() {
  const authUser = useGame((s) => s.authUser);
  const cloudSynced = useGame((s) => s.cloudSynced);
  const signOut = useGame((s) => s.signOut);
  const [signingOut, setSigningOut] = useState(false);

  if (!authUser) return null;
  const label = authUser.displayName || authUser.email || 'חֶשְׁבּוֹן מְחֻבָּר';

  const onSignOut = () => {
    if (signingOut) return; // guard a double-tap
    setSigningOut(true);
    signOut(); // clears the account only — the local game save is untouched
  };

  return (
    <section className="mt-1 border-t border-hairline pt-4 text-center">
      <h3 className="mb-1 font-display text-sm text-bone/60">הַחֶשְׁבּוֹן שֶׁלִּי</h3>
      <p className="mb-1 truncate text-sm text-bone/80" dir="ltr">
        {label}
      </p>
      {/* A quiet, non-alarming sync signal (PR 4) — no error codes, no red,
          just "did the cloud last hear from us" for a curious kid/parent. */}
      <p className="mb-2 text-[11px] text-bone/45">
        {cloudSynced ? '☁️ נִשְׁמַר בַּעֲנָן' : '☁️ עוֹד מִתְחַבֵּר לֶעָנָן…'}
      </p>
      <BackupSection />
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className="btn w-full bg-black/30 py-2.5 text-sm text-bone ring-1 ring-hairline disabled:opacity-60"
      >
        🚪 הִתְנַתְּקוּת
      </button>
    </section>
  );
}

// Full-width labelled row rather than the top bar's round icon button — inside
// a settings list it reads as one more preference, not a corner toggle.
function SoundSection() {
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);

  return (
    <section>
      <h3 className="mb-1.5 font-display text-sm text-cy">צְלִילִים 🔊</h3>
      <button
        type="button"
        onClick={toggleMute}
        aria-pressed={!muted}
        className="btn flex w-full items-center justify-between bg-black/25 px-4 py-3 text-sm ring-1 ring-hairline"
      >
        <span className="text-bone">{muted ? '🔇 צְלִילִים כָּבוּי' : '🔊 צְלִילִים דָּלוּק'}</span>
        <span
          className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
            muted ? 'bg-black/40' : 'bg-cy'
          }`}
        >
          <span
            className={`h-5 w-5 rounded-full bg-bone transition-transform ${muted ? 'translate-x-0' : '-translate-x-5'}`}
          />
        </span>
      </button>
    </section>
  );
}

export function SettingsOverlay() {
  const open = useGame((s) => s.settingsOpen);
  const setOpen = useGame((s) => s.setSettingsOpen);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-6"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="surface anim-pop-in flex max-h-[86vh] w-full max-w-sm flex-col rounded-3xl p-5"
        style={{ boxShadow: '0 0 0 2px #00E5FF, 0 24px 60px -20px #000' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 text-center font-display text-3xl text-bone">⚙️ הַגְדָּרוֹת</div>

        <div className="flex flex-col gap-4 overflow-y-auto pe-1">
          <AccountSection />
          <SoundSection />
          <ShareInstallSection />

          {/* Help + privacy, opened outside the app so progress isn't disturbed. */}
          <section className="flex gap-2">
            <a
              href="./how-to-play.html"
              target="_blank"
              rel="noopener"
              className="btn flex-1 bg-black/30 py-2 text-center text-sm text-bone ring-1 ring-hairline"
            >
              ❓ אֵיךְ מְשַׂחֲקִים
            </a>
            <a
              href="./privacy.html"
              target="_blank"
              rel="noopener"
              className="btn flex-1 bg-black/30 py-2 text-center text-sm text-bone ring-1 ring-hairline"
            >
              🔒 פְּרָטִיּוּת
            </a>
          </section>

          <ResetSection />
        </div>

        <button type="button" onClick={() => setOpen(false)} className="btn mt-4 w-full bg-cy py-3 text-lg text-void">
          סְגוֹר
        </button>
      </div>
    </div>
  );
}
