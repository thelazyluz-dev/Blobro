// Rewarded "watch to boost" mechanic.
//
// BonusButton — a floating button that offers a big timed boost (×N to taps AND
// income) in exchange for watching a short ad. It has three states: ready,
// boost-active (shows the countdown), and cooling down.
//
// AdOverlay — the ad itself. RIGHT NOW this is a PLACEHOLDER (a clearly-labelled
// demo slot) so the whole mechanic works end-to-end with zero cost and zero
// legal exposure. When you later plug in a real rewarded-ad network, only this
// component changes: play the network's ad, and call finishAdBonus() on its
// "reward earned" callback (or cancelAdBonus() if the user closes it early).
// The store contract (startAdBonus → finishAdBonus/cancelAdBonus) stays the same.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { adPlaceholderMs, adRewardMult } from '../game/balance';
import { useGame } from '../store';
import { useReducedMotion } from './useReducedMotion';

function mmss(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function BonusButton() {
  const start = useGame((s) => s.startAdBonus);
  const rewardUntil = useGame((s) => s.adRewardUntil);
  const cooldownUntil = useGame((s) => s.adCooldownUntil);
  const overlayOpen = useGame((s) => s.adOverlayOpen);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second so the countdown / cooldown label stays live.
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, []);

  const active = now < rewardUntil;
  const ready = now >= cooldownUntil;
  const boostLeft = Math.ceil((rewardUntil - now) / 1000);
  const cooldownLeft = Math.ceil((cooldownUntil - now) / 1000);

  // While a boost is live, show its countdown (not tappable). Otherwise it's the
  // call-to-action when ready, or a cooldown timer when recharging.
  const label = active
    ? `🚀 ×${adRewardMult} · ${boostLeft}s`
    : ready
      ? `🎁 בּוֹנוּס ×${adRewardMult}`
      : `⏳ ${mmss(cooldownLeft)}`;

  const tappable = ready && !active && !overlayOpen;

  return (
    <button
      type="button"
      onClick={() => tappable && start()}
      disabled={!tappable}
      aria-label={`בונוס כפול פי ${adRewardMult}`}
      className={`absolute bottom-20 start-3 z-30 flex items-center gap-1.5 rounded-full px-3.5 py-2 font-display text-sm ring-1 transition active:scale-90 ${
        active
          ? 'bg-hot text-bone ring-hot glow-hot'
          : ready
            ? 'anim-bonus-pulse bg-pop text-void ring-pop'
            : 'bg-black/40 text-bone/50 ring-hairline'
      }`}
    >
      {label}
    </button>
  );
}

export function AdOverlay() {
  const open = useGame((s) => s.adOverlayOpen);
  const finish = useGame((s) => s.finishAdBonus);
  const cancel = useGame((s) => s.cancelAdBonus);
  const reduced = useReducedMotion();

  const [remaining, setRemaining] = useState(Math.ceil(adPlaceholderMs / 1000));
  const [done, setDone] = useState(false);
  const endRef = useRef(0);

  // Start / restart the countdown whenever the overlay opens.
  useEffect(() => {
    if (!open) return;
    setDone(false);
    endRef.current = Date.now() + adPlaceholderMs;
    setRemaining(Math.ceil(adPlaceholderMs / 1000));
    const iv = window.setInterval(() => {
      const left = Math.ceil((endRef.current - Date.now()) / 1000);
      if (left <= 0) {
        setRemaining(0);
        setDone(true);
        window.clearInterval(iv);
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => window.clearInterval(iv);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6" role="dialog" aria-modal="true">
      {/* Close (cancel, no reward) — only before the ad finishes. */}
      {!done && (
        <button
          type="button"
          onClick={cancel}
          aria-label="סגור"
          className="absolute end-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl text-bone active:scale-90"
        >
          ✕
        </button>
      )}

      <div className="flex w-full max-w-sm flex-col items-center">
        {/* The placeholder "ad" — a labelled demo slot a real network fills later. */}
        <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-[#2a1e4d] to-[#0e0722] ring-1 ring-hairline">
          <div className="absolute start-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-bone/70">
            פִּרְסוֹמֶת (דֶּמוֹ)
          </div>
          <div className={`text-6xl ${reduced ? '' : 'anim-idle'}`}>🫧</div>
          <div className="mt-3 px-6 text-center font-display text-xl text-bone">הַפִּרְסוֹמֶת שֶׁלְּךָ כָּאן</div>
          <div className="mt-1 text-center text-xs text-bone/50">מָקוֹם לְפִרְסוֹמֶת אֲמִתִּית בֶּעָתִיד</div>
        </div>

        {done ? (
          <button
            type="button"
            onClick={finish}
            className="btn anim-bonus-pulse mt-5 w-full bg-pop py-3 font-display text-lg text-void"
          >
            🎁 קַבֵּל בּוֹנוּס ×{adRewardMult}!
          </button>
        ) : (
          <div className="mt-5 w-full text-center">
            <div className="text-sm text-bone/70">הַבּוֹנוּס בְּעוֹד {remaining} שְׁנִיּוֹת…</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-goo transition-[width] duration-250 ease-linear"
                style={{ width: `${100 - (remaining / Math.ceil(adPlaceholderMs / 1000)) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
