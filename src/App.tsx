import { useEffect } from 'react';
import { unlockAudio } from './audio/synth';
import { AchievementsButton, AchievementsOverlay } from './ui/AchievementsOverlay';
import { BottomNav } from './ui/BottomNav';
import { Confetti } from './ui/Confetti';
import { EventBanner } from './ui/EventBanner';
import { FeedbackController } from './ui/FeedbackController';
import { HatchReveal } from './ui/HatchReveal';
import { LeaderboardButton, LeaderboardOverlay } from './ui/LeaderboardOverlay';
import { MilestoneReveal } from './ui/MilestoneReveal';
import { MultiHatchResult } from './ui/MultiHatchResult';
import { MuteButton } from './ui/MuteButton';
import { NumberLegendOverlay } from './ui/NumberLegendOverlay';
import { OfflineModal } from './ui/OfflineModal';
import { StatsButton, StatsOverlay } from './ui/StatsOverlay';
import { Toaster } from './ui/Toaster';
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
  useFrenzyAudio();
  useEventMusic();

  // Unlock the AudioContext on the first interaction (browser autoplay policy),
  // so jingles scheduled slightly later (e.g. after the egg shake) still play.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

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
      <MuteButton />
      <StatsButton />
      <AchievementsButton />
      <LeaderboardButton />
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
      <AchievementsOverlay />
      <LeaderboardOverlay />
      <StatsOverlay />
      <NumberLegendOverlay />
    </div>
  );
}
