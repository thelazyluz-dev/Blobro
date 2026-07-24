import { useEffect } from 'react';
import { unlockAudio } from './audio/synth';
import { BottomNav } from './ui/BottomNav';
import { HatchReveal } from './ui/HatchReveal';
import { MuteButton } from './ui/MuteButton';
import { OfflineModal } from './ui/OfflineModal';
import { ClickScreen } from './ui/screens/ClickScreen';
import { CollectionScreen } from './ui/screens/CollectionScreen';
import { HatchScreen } from './ui/screens/HatchScreen';
import { UpgradesScreen } from './ui/screens/UpgradesScreen';
import { useGameEngine } from './ui/useGameEngine';
import { useGame } from './store';

export function App() {
  const loaded = useGameEngine();
  const activeTab = useGame((s) => s.activeTab);

  // Unlock the AudioContext on the first interaction (browser autoplay policy),
  // so jingles scheduled slightly later (e.g. after the egg shake) still play.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="anim-idle font-display text-4xl text-goo">בלורבו…</div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col">
      <MuteButton />
      <main className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'click' && <ClickScreen />}
        {activeTab === 'hatch' && <HatchScreen />}
        {activeTab === 'collection' && <CollectionScreen />}
        {activeTab === 'upgrades' && <UpgradesScreen />}
      </main>

      <BottomNav />

      <OfflineModal />
      <HatchReveal />
    </div>
  );
}
