// Google H5 Games Ads (Ad Placement API) — rewarded ads for the bonus button.
//
// The API ships inside the AdSense script loaded in index.html: once it's live it
// defines window.adConfig and window.adBreak. It is NOT always available — H5
// Games Ads must be enabled on the AdSense account, and ad blockers or an
// offline PWA will keep it from loading. Every function here therefore degrades
// gracefully, and the UI falls back to the built-in placeholder ad so the bonus
// mechanic always works.
//
// Kids' app: ad requests are tagged child-directed (TFAT=1) via the script tag
// attribute in index.html, so no personalized/interest-based ads are served.

interface AdBreakOptions {
  type: 'reward' | 'start' | 'pause' | 'next' | 'browse';
  name?: string;
  /** Called when a rewarded ad is ready; call showAdFn() to play it. */
  beforeReward?: (showAdFn: () => void) => void;
  /** The player watched it through — grant the reward. */
  adViewed?: () => void;
  /** The player closed it early — do NOT grant the reward. */
  adDismissed?: () => void;
  /** Always fires last, whether or not an ad played. */
  adBreakDone?: (placementInfo?: unknown) => void;
}

declare global {
  interface Window {
    adBreak?: (options: AdBreakOptions) => void;
    adConfig?: (options: Record<string, unknown>) => void;
  }
}

/** True when Google's rewarded-ad API is actually loaded and usable. */
export function hasRewardedAds(): boolean {
  return typeof window.adBreak === 'function';
}

/** Configure the API once at startup. Safe to call when the API is absent. */
export function initAds(muted: boolean): void {
  try {
    window.adConfig?.({ preloadAdBreaks: 'on', sound: muted ? 'off' : 'on' });
  } catch {
    /* never let ads break the game */
  }
}

export interface RewardedHandlers {
  /** The player earned the reward (watched to the end). */
  onReward: () => void;
  /** An ad PLAYED but the player dismissed it early — no reward. */
  onNoReward: () => void;
  /** No ad was available at all (no fill). The player did nothing wrong —
   * callers should fall back to the placeholder so the button never looks
   * broken. Expected ~30% of the time on child-directed inventory. */
  onNoFill: () => void;
}

/**
 * Try to show a rewarded ad. Returns false when the API isn't available, so the
 * caller can fall back to the placeholder. When it returns true, exactly one of
 * the handlers will fire.
 */
export function showRewardedAd({ onReward, onNoReward, onNoFill }: RewardedHandlers): boolean {
  if (!hasRewardedAds()) return false;
  let rewarded = false;
  let shown = false;
  let settled = false;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
  };
  try {
    window.adBreak!({
      type: 'reward',
      name: 'bonus-boost',
      beforeReward: (showAdFn) => {
        shown = true; // an ad is ready — play it now
        showAdFn();
      },
      adViewed: () => {
        rewarded = true;
        settle(onReward);
      },
      adDismissed: () => settle(onNoReward),
      // Fires last, always. If beforeReward never ran, no ad existed (no fill) —
      // that's Google's business, not the kid's, so it gets its own path.
      adBreakDone: () => settle(rewarded ? onReward : shown ? onNoReward : onNoFill),
    });
    return true;
  } catch {
    return false;
  }
}
