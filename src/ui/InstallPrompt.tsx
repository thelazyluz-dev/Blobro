// "Add to home screen" prompt (§ user request). On Android/Chrome we capture the
// native beforeinstallprompt and offer a one-tap install; on iOS Safari (which
// has no such event) we show the manual Share → "Add to Home Screen" steps.
// Hidden if already installed. Two funnel rules (growth audit):
// - it waits for a moment of INVESTMENT (the first hatched creature) instead of
//   firing on cold entry, when "install this" converts worst;
// - "not now" snoozes it for two weeks instead of forever — a kid who is
//   clearly hooked three weeks in deserves a second ask, one ask per cycle.

import { useEffect, useState } from 'react';
import { useGame } from '../store';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const DISMISS_KEY = 'blorbo-install-dismissed';
const DISMISS_COOLDOWN_MS = 14 * 86_400_000; // two weeks

/** True while a past "not now" is still fresh. Legacy value '1' = forever
 * (the old behavior) — treat it as dismissed-now so those users get the new
 * cooldown from this deploy rather than a surprise prompt. */
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

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent || '';
  const iDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as Mac; detect via touch.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return iDevice || iPadOS;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [mode, setMode] = useState<'android' | 'ios' | null>(null);
  // The investment gate: at least one hatched creature (or real prior progress
  // from before this gate shipped) before we ask for home-screen space.
  const invested = useGame((s) => s.loaded && (s.lifetimeHatches > 0 || s.clicks >= 250));

  useEffect(() => {
    if (!invested) return; // not yet — the effect re-runs when the gate opens
    if (isStandalone()) return; // already installed
    if (dismissedRecently()) return; // "not now" is still fresh

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setMode('android');
    };
    window.addEventListener('beforeinstallprompt', onBIP);

    // iOS has no beforeinstallprompt — show manual steps shortly after the gate.
    let t = 0;
    if (isIOS()) t = window.setTimeout(() => setMode((m) => m ?? 'ios'), 1800);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.clearTimeout(t);
    };
  }, [invested]);

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
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    remember();
    setMode(null);
    setDeferred(null);
  };

  if (!mode) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3" role="dialog" aria-modal="false">
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
