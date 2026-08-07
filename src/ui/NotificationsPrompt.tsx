// A one-time, default-YES opt-in for notifications, shown shortly after the game
// loads. Browsers REQUIRE a user tap to grant notification permission (hard-
// required on installed iOS PWAs), so we can't flip everyone on silently — this
// prompt makes "on" the encouraged default instead: existing players see it on
// their next visit, new players right after they start. Shown once (a tap either
// way is remembered), only where push is actually supported and undecided.

import { useEffect, useState } from 'react';
import { enablePush, notificationPermission, notificationsPref, pushSupported } from '../net/push';
import { useGame } from '../store';

const SEEN_KEY = 'blorbo.notifPromptSeen';
function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

// Only ask when push works here, the player hasn't decided (permission still
// 'default'), isn't already on, and hasn't been asked before.
function eligible(): boolean {
  return pushSupported() && notificationPermission() === 'default' && !notificationsPref() && !seen();
}

export function NotificationsPrompt() {
  const nicknameOpen = useGame((s) => s.nicknameOpen);
  const pushToast = useGame((s) => s.pushToast);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eligible()) return;
    // A short delay so it never stacks on the first-launch nickname modal;
    // re-check on fire in case something changed in the meantime.
    const t = window.setTimeout(() => {
      if (eligible() && !useGame.getState().nicknameOpen) setShow(true);
    }, 2500);
    return () => window.clearTimeout(t);
  }, []);

  if (!show || nicknameOpen) return null;

  const enable = async () => {
    setBusy(true);
    const r = await enablePush(); // the required user gesture
    setBusy(false);
    setShow(false);
    if (r === 'on') {
      markSeen();
      pushToast({ text: 'הַתְרָאוֹת דָּלְקוּ! 🔔', icon: '🔔', tone: 'star' });
    } else if (r === 'denied' || r === 'unsupported') {
      markSeen(); // the browser won't let us ask again — don't nag
    }
    // 'error' (e.g. a network hiccup): leave it un-seen so the next visit retries.
  };

  const later = () => {
    markSeen();
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 p-6" role="dialog" aria-modal="true">
      <div
        className="surface anim-pop-in w-full max-w-xs rounded-3xl p-6 text-center"
        style={{ boxShadow: '0 0 0 2px #33E1FF, 0 24px 60px -20px #000' }}
      >
        <div className="text-5xl">🔔</div>
        <h2 className="mt-2 font-display text-2xl text-bone">לְהַדְלִיק הַתְרָאוֹת?</h2>
        <p className="mx-auto mt-2 max-w-[17rem] text-base leading-relaxed text-bone/80">
          נוֹדִיעַ לְךָ כְּשֶׁמִּישֶׁהוּ שׁוֹבֵר לְךָ שִׂיא, כְּשֶׁעוֹקְפִים אוֹתְךָ בַּטַּבְלָה, וּכְשֶׁהַהַכְנָסָה שֶׁלְּךָ בְּאוֹפְלַיְן הִתְמַלְּאָה.
        </p>
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="btn mt-4 w-full bg-cy py-3 text-lg text-void disabled:opacity-60"
        >
          {busy ? '…' : '🔔 כֵּן, הַדְלֵק הַתְרָאוֹת'}
        </button>
        <button type="button" onClick={later} className="mt-2 min-h-11 w-full py-3 text-sm text-bone/50">
          אַחַר כָּךְ
        </button>
      </div>
    </div>
  );
}
