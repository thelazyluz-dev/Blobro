// The "invite friends" share sheet. Shows the player's progress toward the
// reward tiers, their personal invite link, and a share/copy button. Opened from
// the leaderboard, the settings screen, or the reward banner via `referralOpen`.
//
// Rewards are server-authoritative and TAP-TO-CLAIM: when the friend count
// reaches a tier, the tier lights up here and tapping it calls
// /referral/claim-reward, which grants the goo + medal server-side (see
// store.claimReferralTier). This screen shows progress AND collects the prizes.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  referralFriendsForGift,
  referralFriendsForGoldMedal,
  referralFriendsForMedal,
  referralGiftHours,
  referralMedalBonusHours,
} from '../game/balance';
import { fetchReferralMe, hasReferralBackend, referralLink } from '../net/referral';
import { selectReferralClaimable, useGame } from '../store';
import { haptic } from './haptics';

/** Fire-and-forget: share the invite via the OS sheet, or copy it. */
async function shareInvite(link: string): Promise<'shared' | 'copied' | 'none'> {
  const text = `בּוֹא לְשַׂחֵק אִתִּי בְּבּלוֹרְבּוֹ! 🟢 הִצְטָרֵף דֶּרֶךְ הַקִּישׁוּר שֶׁלִּי 👉 ${link}`;
  try {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    if (nav.share) {
      await nav.share({ title: 'בלורבו', text });
      return 'shared';
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(link);
      return 'copied';
    }
  } catch {
    /* dismissed / denied — nothing to do */
  }
  return 'none';
}

export function ReferralShare() {
  const open = useGame((s) => s.referralOpen);
  const setOpen = useGame((s) => s.setReferralOpen);
  const code = useGame((s) => s.referralCode);
  const count = useGame((s) => s.referralCount);
  const claimed = useGame((s) => s.referralClaimed);
  const claimReferralTier = useGame((s) => s.claimReferralTier);
  const syncReferral = useGame((s) => s.syncReferral);
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [localCode, setLocalCode] = useState<string | null>(code);

  // On open: make sure we have a code + a fresh count (mints the code server-side
  // on first ask). Falls back to whatever the store already synced at login.
  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setLocalCode(code);
    if (hasReferralBackend()) {
      void fetchReferralMe().then((info) => {
        if (info?.code) setLocalCode(info.code);
      });
      void syncReferral(); // refresh count + grant anything newly earned
    }
  }, [open, code, syncReferral]);

  if (!open || typeof document === 'undefined') return null;

  const link = localCode ? referralLink(localCode) : '';
  const target = referralFriendsForMedal;
  const pct = Math.min(100, (count / target) * 100);

  const onClaim = async (friends: number) => {
    if (claiming !== null) return;
    setClaiming(friends);
    haptic([0, 30, 20, 40]);
    try {
      await claimReferralTier(friends);
    } finally {
      setClaiming(null);
    }
  };

  const tier = (friends: number, icon: string, label: string, reward: string) => {
    const reached = count >= friends;
    const collected = claimed.includes(friends);
    const claimable = reached && !collected; // earned but not yet tapped
    const busy = claiming === friends;

    // Claimable → a glowing, tappable button that collects the prize.
    if (claimable) {
      return (
        <button
          type="button"
          onClick={() => void onClaim(friends)}
          disabled={busy}
          className="anim-pulse-glow flex w-full items-center gap-2 rounded-xl bg-pop/20 px-3 py-2.5 text-start ring-2 ring-pop/70 shadow-[0_0_18px_rgba(255,46,136,0.45)] active:scale-[0.98] disabled:opacity-60"
        >
          <span className="text-3xl">{icon}</span>
          <div className="flex-1">
            <div className="font-display text-base text-pop">{label}</div>
            <div className="text-sm text-bone/70">{reward}</div>
          </div>
          <span className="shrink-0 rounded-full bg-pop px-3 py-1 text-sm font-bold text-void">{busy ? '…' : 'קַבֵּל!'}</span>
        </button>
      );
    }

    // Collected or still locked → a passive row.
    return (
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ring-1 ${collected ? 'bg-cy/15 ring-cy/40' : 'bg-black/25 ring-hairline'}`}>
        <span className="text-3xl">{collected ? icon : '🔒'}</span>
        <div className="flex-1 text-start">
          <div className={`font-display text-base ${collected ? 'text-cy' : 'text-bone/80'}`}>{label}</div>
          <div className="text-sm text-bone/60">{reward}</div>
        </div>
        <span className="shrink-0 text-sm font-bold tabular text-bone/70">{collected ? '✓' : `${friends} 👥`}</span>
      </div>
    );
  };

  const onShare = async () => {
    haptic(12);
    const r = await shareInvite(link);
    if (r === 'copied') {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const onCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(true);
      haptic(8);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-6" onClick={() => setOpen(false)} role="presentation">
      <div
        className="surface anim-pop-in flex max-h-[88vh] w-full max-w-xs flex-col rounded-3xl p-5 text-center"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Everything scrolls between the (implicit) top and the pinned close
            button, so on short screens the close is always reachable. */}
        <div className="min-h-0 flex-1 overflow-y-auto pe-1">
        <div className="text-5xl">🏅</div>
        <div className="mt-2 font-display text-2xl text-pop">הַזְמֵן חֲבֵרִים</div>
        <p className="mx-auto mt-1 max-w-[17rem] text-base leading-relaxed text-bone/80">
          שַׁתֵּף אֶת הַקִּישׁוּר שֶׁלְּךָ. כָּל חָבֵר שֶׁמִּצְטָרֵף וּמַתְחִיל לְשַׂחֵק מְקָרֵב אוֹתְךָ לְמֶדַלְיָה!
        </p>

        {/* Progress toward the first medal. */}
        <div className="mt-4 flex items-center justify-between text-base">
          <span className="text-bone/70">חֲבֵרִים שֶׁהִצְטָרְפוּ</span>
          <span className="font-display text-xl text-cy tabular">
            {count}/{target}
          </span>
        </div>
        <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#00E5FF,#FF2E88)' }} />
        </div>

        {/* The reward tiers. */}
        <div className="mt-4 space-y-1.5">
          {tier(referralFriendsForGift, '🎁', 'מַתְּנַת גּוּ', `${referralGiftHours} שָׁעוֹת שֶׁל הַהַכְנָסָה שֶׁלְּךָ`)}
          {tier(referralFriendsForMedal, '🏅', 'מֶדַלְיַת חֲבֵרִים', `+25% הַכְנָסָה · ×2 לְחִיצָה · +${referralMedalBonusHours} שָׁעוֹת בְּמַכָּה`)}
          {tier(referralFriendsForGoldMedal, '🏆', 'מֶדַלְיַת זָהָב', `+50% הַכְנָסָה · ×3 לְחִיצָה · +${referralMedalBonusHours} שָׁעוֹת בְּמַכָּה`)}
        </div>

        {/* The link + copy. */}
        {link ? (
          <div className="mt-4 flex items-center gap-1.5 rounded-full bg-black/40 p-1 ring-1 ring-hairline">
            <input
              readOnly
              value={link}
              dir="ltr"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent px-2 text-sm text-bone/80 outline-none"
            />
            <button type="button" onClick={onCopy} className="shrink-0 rounded-full bg-black/40 px-3 py-1.5 text-sm text-bone/90 ring-1 ring-hairline active:scale-95">
              {copied ? '✓' : 'הַעְתֵּק'}
            </button>
          </div>
        ) : (
          <div className="mt-4 text-xs text-bone/40">מֵכִין קִישׁוּר…</div>
        )}

        <button
          type="button"
          onClick={onShare}
          disabled={!link}
          className="btn mt-4 w-full bg-cy py-3 text-lg text-void disabled:opacity-50"
        >
          שַׁתֵּף אֶת הַקִּישׁוּר 📤
        </button>
        </div>

        {/* Pinned outside the scroll area — always visible, so the sheet is never
            hard to leave even when the reward tiers make the content overflow. */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-3 w-full shrink-0 rounded-full bg-black/30 py-2.5 text-sm text-bone/70 ring-1 ring-bone/20 active:scale-95"
        >
          סְגוֹר
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A slim glowing banner that drops in on the main screen when a referral reward
 * is ready to collect — tapping it opens the invite sheet on the glowing tier.
 * Dismissible (session-only) so it never permanently eats the whole-screen tap
 * target; the settings-button dot stays as the persistent reminder either way.
 */
export function ReferralRewardBanner() {
  const claimable = useGame(selectReferralClaimable);
  const setOpen = useGame((s) => s.setReferralOpen);
  const referralOpen = useGame((s) => s.referralOpen);
  const [dismissed, setDismissed] = useState(false);

  // Re-arm the banner whenever a fresh reward becomes claimable.
  useEffect(() => {
    if (claimable) setDismissed(false);
  }, [claimable]);

  if (!claimable || dismissed || referralOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-40 flex justify-center px-3">
      <div className="anim-pulse-glow pointer-events-auto flex items-center gap-2 rounded-full bg-void/90 py-1.5 pe-1.5 ps-4 ring-2 ring-pop/70 backdrop-blur">
        <button
          type="button"
          onClick={() => {
            haptic(12);
            setOpen(true);
          }}
          className="flex items-center gap-2 text-sm font-display text-bone active:scale-95"
        >
          <span className="text-lg">🎁</span>
          פְּרַס הַזְמָנוֹת מוּכָן! לְחַץ לְאִסּוּף
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="סגור"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/40 text-xs text-bone/70 active:scale-90"
        >
          ✕
        </button>
      </div>
    </div>,
    document.body,
  );
}
