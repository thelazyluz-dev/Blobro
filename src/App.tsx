import { useEffect } from 'react';
import { AUTH_REQUIRED } from './config';
import { initAds } from './net/ads';
import { unlockAudio } from './audio/synth';
import { AchievementsButton, AchievementsOverlay } from './ui/AchievementsOverlay';
import { AdOverlay } from './ui/AdBonus';
import { AuthGate } from './ui/AuthGate';
import { NumberLegendButton } from './ui/NumberLegendButton';
import { BottomNav } from './ui/BottomNav';
import { Confetti } from './ui/Confetti';
import { EventBanner } from './ui/EventBanner';
import { FeedbackController } from './ui/FeedbackController';
import { HatchReveal } from './ui/HatchReveal';
import { InfoOverlay } from './ui/InfoOverlay';
import { InstallPrompt } from './ui/InstallPrompt';
import { LeaderboardButton, LeaderboardOverlay } from './ui/LeaderboardOverlay';
import { MilestoneReveal } from './ui/MilestoneReveal';
import { MultiHatchResult } from './ui/MultiHatchResult';
import { MuteButton } from './ui/MuteButton';
import { NicknameWelcome } from './ui/NicknameWelcome';
import { NumberLegendOverlay } from './ui/NumberLegendOverlay';
import { OfflineModal } from './ui/OfflineModal';
import { StatsButton, StatsOverlay } from './ui/StatsOverlay';
import { Toaster } from './ui/Toaster';
import { UnlockReveal } from './ui/UnlockReveal';
import { useEventMusic } from './ui/useEventMusic';
import { useFrenzyAudio } from './ui/useFrenzyAudio';
import { ClickScreen } from './ui/screens/ClickScreen';
import { CollectionScreen } from './ui/screens/CollectionScreen';
import { HatchScreen } from './ui/screens/HatchScreen';
import { ShopScreen } from './ui/screens/ShopScreen';
import { UpgradesScreen } from './ui/screens/UpgradesScreen';
import { useGameEngine } from './ui/useGameEngine';
import { backgroundById } from './game/cosmetics';
import { useGame } from './store';

export function App() {
  const loaded = useGameEngine();
  const activeTab = useGame((s) => s.activeTab);
  const bgGradient = useGame((s) => backgroundById(s.equippedBackground).gradient);
  const authUser = useGame((s) => s.authUser);
  const authChecked = useGame((s) => s.authChecked);
  useFrenzyAudio();
  useEventMusic();

  // Hydrate identity from the local cache instantly, then reconcile with the
  // server in the background (see store.initAuth / net/auth.ts). Runs
  // regardless of AUTH_REQUIRED so "who am I" is always available once
  // someone HAS signed in — the flag only controls whether it's mandatory.
  useEffect(() => {
    useGame.getState().initAuth();
  }, []);

  // Unlock the AudioContext on the first interaction (browser autoplay policy),
  // so jingles scheduled slightly later (e.g. after the egg shake) still play.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Configure H5 Games Ads once (no-op when the API isn't available).
  useEffect(() => {
    initAds(useGame.getState().muted);
  }, []);

  // Mandatory-login gate (PR 3b). Checked before the `loaded` splash below so a
  // required sign-in blocks the game outright rather than flashing it first.
  //
  // `authChecked` matters as much as `authUser`: initAuth sets it synchronously
  // for anyone with a cached identity, so a returning player never sees this
  // gate flash — and offline, where /auth/me can't answer, the cached user is
  // kept and the game stays playable (see net/auth.ts fetchMe).
  if (AUTH_REQUIRED && authChecked && !authUser) {
    return <AuthGate />;
  }

  if (!loaded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="anim-idle glow-goo font-display text-5xl text-goo">בלורבו</div>
        <div className="anim-breathe text-sm text-bone/50">טוען…</div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col">
      <div className="bg-aurora" aria-hidden style={{ backgroundImage: bgGradient }} />
      {/* One compact top bar instead of four floating corner buttons — the hero
          goo counter below it then gets the full width, uncrowded. */}
      <header className="relative z-30 flex shrink-0 items-center gap-2 px-3 pt-3">
        <MuteButton />
        <StatsButton />
        <NumberLegendButton />
        <div className="flex-1" />
        <LeaderboardButton />
        <AchievementsButton />
      </header>
      <main className="relative z-10 min-h-0 flex-1 overflow-hidden">
        {activeTab === 'click' && <ClickScreen />}
        {activeTab === 'hatch' && <HatchScreen />}
        {activeTab === 'collection' && <CollectionScreen />}
        {activeTab === 'upgrades' && <UpgradesScreen />}
        {activeTab === 'shop' && <ShopScreen />}
      </main>

      <EventBanner />
      <BottomNav />

      <FeedbackController />
      <Confetti />
      <Toaster />
      <OfflineModal />
      <HatchReveal />
      <MultiHatchResult />
      <MilestoneReveal />
      <UnlockReveal />
      <AchievementsOverlay />
      <LeaderboardOverlay />
      <AdOverlay />
      <StatsOverlay />
      <InfoOverlay />
      <NumberLegendOverlay />
      <InstallPrompt />
      <NicknameWelcome />
    </div>
  );
}
