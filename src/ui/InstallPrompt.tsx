// "Add to home screen" prompt. On Android/Chrome we use the native
// beforeinstallprompt (one-tap install); on iOS Safari (no such event) we show
// the manual Share → "Add to Home Screen" steps. Hidden if already installed.
//
// Owner decision (distribution push): show it from the FIRST entry — a short
// beat after the game mounts, not gated on investment — and if "not now" is
// tapped, re-ask every few days until installed (a snooze, never forever).

import { useEffect, useState } from 'react';
import { useGame } from '../store';
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall } from './pwaInstall';

const DISMISS_KEY = 'blorbo-install-dismissed';
const DISMISS_COOLDOWN_MS = 3 * 86_400_000; // re-ask every ~3 days (owner request)
const FIRST_ENTRY_DELAY_MS = 2500; // let the player see the game before we ask

/** True while a past "not now" is still fresh. Legacy value '1' = forever (the
 * old behavior) — treat it as dismissed-now so those users fall into the new
 * short cooldown rather than getting an instant surprise prompt. */
function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    if (raw === '1') {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      return true;
    }
    return Date.now() - Number(raw) < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const loaded = useGame((s) => s.loaded);
  // Never stack the install banner under the first-entry nickname dialog — a kid
  // mid-typing would get it sliding in beneath them. It stays queued (mode keeps
  // its value) and appears the moment the nickname step is done.
  const nicknameOpen = useGame((s) => s.nicknameOpen);
  const [mode, setMode] = useState<'android' | 'ios' | null>(null);

  useEffect(() => {
    if (!loaded) return; // wait until the game has mounted (first entry)
    if (isStandalone()) return; // already installed
    if (dismissedRecently()) return; // snooze still fresh

    // A short beat after entry so the banner doesn't slam the very first frame.
    const t = window.setTimeout(() => {
      if (canPromptInstall()) setMode('android');
      else if (isIOS()) setMode('ios');
    }, FIRST_ENTRY_DELAY_MS);

    // Android often fires beforeinstallprompt a moment after load — show as soon
    // as it's available (if we haven't already shown iOS steps).
    const off = onInstallChange(() => {
      if (canPromptInstall()) setMode((m) => m ?? 'android');
    });

    return () => {
      window.clearTimeout(t);
      off();
    };
  }, [loaded]);

  const remember = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  const close = () => {
    remember();
    setMode(null);
  };

  const install = async () => {
    await promptInstall();
    remember();
    setMode(null);
  };

  if (!mode || nicknameOpen) return null;

  return (
    // bottom-24 (not bottom-0): sits ABOVE the bottom nav — measured at 360x640
    // the prompt used to fully cover the tab bar, trapping early tab exploration.
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center p-3" role="dialog" aria-modal="false">
      <div
        className="anim-drop-in w-full max-w-md rounded-3xl bg-surface p-4 ring-1 ring-bone/15"
        style={{ boxShadow: '0 -10px 40px -12px #000, 0 0 0 2px #A3FF12' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">📲</span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg text-bone">הַתְקִינוּ אֶת בְּלוֹרְבּוֹ!</div>
            <div className="text-xs text-bone/60">קִיצּוּר דֶּרֶךְ בַּטֵּלֵפוֹן — נִפְתָּח מָלֵא מָסָךְ, גַּם בְּלִי אִינְטֶרְנֶט.</div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="סגור"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/40 text-lg text-bone/70 active:scale-90"
          >
            ✕
          </button>
        </div>

        {mode === 'android' ? (
          <button type="button" onClick={install} className="btn mt-3 w-full bg-goo py-3 text-lg text-void glow-goo">
            הַתְקֵן עַכְשָׁו
          </button>
        ) : (
          <div className="mt-3 rounded-2xl bg-black/25 px-3 py-2.5 text-sm leading-relaxed text-bone/80 ring-hairline">
            כְּדֵי לְהַתְקִין: לַחֲצוּ עַל <span className="font-bold text-cy">שִׁתּוּף</span>{' '}
            <span aria-hidden>📤</span> לְמַטָּה, וְאָז עַל <span className="font-bold text-cy">"הוֹסֵף לְמָסָךְ הַבַּיִת"</span>.
          </div>
        )}
      </div>
    </div>
  );
}
