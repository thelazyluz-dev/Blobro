// The single app store (Zustand). Holds the persistent SaveState fields plus
// transient UI/session state, and wires the pure game logic to React. All
// numeric rules come from src/game/* — nothing is computed inline here.

import { create } from 'zustand';
import {
  bonusClickEquivalent,
  bonusIncomeSeconds,
  bonusMinGoo,
  critMultiplier,
  evolveCostByRarity,
  frenzyDurationMs,
  frenzyMultiplier,
  maxCharLevel,
} from './game/balance';
import { newlyCompleted } from './game/achievements';
import { charactersById } from './game/characters';
import { clickPower, eggCost, gooPerSec, modifiersFrom } from './game/economy';
import { hatch, type HatchOutcome } from './game/hatching';
import { computeOffline, type OfflineReport } from './game/offline';
import { defaultSaveState, migrate } from './game/save';
import { upgradeCost } from './game/upgrades';
import { loadRaw, persist } from './persistence';
import type { CharId, Modifiers, OwnedCharacters, SaveState, UpgradeId, Upgrades } from './game/types';

export type Tab = 'click' | 'hatch' | 'collection' | 'upgrades';

export type ConfettiKind = 'confetti' | 'stars' | 'rainbow';
export type ToastTone = 'goo' | 'star' | 'pop';
export interface Toast {
  id: number;
  text: string;
  icon: string;
  tone: ToastTone;
}

interface GameState {
  // --- persistent (mirror of SaveState) ---
  goo: number;
  lifetimeGoo: number;
  upgrades: Upgrades;
  characters: OwnedCharacters;
  totalHatches: number;
  sinceRare: number;
  bonusesCollected: number;
  achievements: string[];
  muted: boolean;

  // --- transient UI / session ---
  loaded: boolean;
  activeTab: Tab;
  hatchResult: HatchOutcome | null;
  offlineReport: OfflineReport | null;
  frenzyUntil: number; // epoch ms; a click frenzy is active until then
  toasts: Toast[];
  achievementsOpen: boolean;
  confettiBursts: number; // increments to trigger a celebration
  confettiKind: ConfettiKind;

  // --- actions ---
  loadGame: () => Promise<void>;
  saveGame: () => Promise<void>;
  setTab: (tab: Tab) => void;
  click: () => { gain: number; frenzy: boolean; crit: boolean };
  buyUpgrade: (id: UpgradeId) => void;
  tryHatch: () => void;
  evolveCreature: (id: CharId) => void;
  collectBonus: () => number;
  grantGoo: (amount: number) => void;
  dismissHatch: () => void;
  dismissOffline: () => void;
  toggleMute: () => void;
  tick: (dtSeconds: number) => void;
  setAchievementsOpen: (open: boolean) => void;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  triggerConfetti: (kind: ConfettiKind) => void;
}

let toastId = 0;

function snapshot(s: GameState, now: number): SaveState {
  return {
    version: 2,
    goo: s.goo,
    lifetimeGoo: s.lifetimeGoo,
    upgrades: s.upgrades,
    characters: s.characters,
    totalHatches: s.totalHatches,
    sinceRare: s.sinceRare,
    bonusesCollected: s.bonusesCollected,
    achievements: s.achievements,
    lastSeen: now,
    muted: s.muted,
  };
}

export const useGame = create<GameState>((set, get) => {
  const mods = (): Modifiers => {
    const s = get();
    return modifiersFrom(s.upgrades, s.achievements.length);
  };

  // Auto-claim any achievements now complete and toast them. Returns the number
  // of achievements newly unlocked (adding them raises the income star).
  const syncAchievements = () => {
    const s = get();
    const claimed = new Set(s.achievements);
    const fresh = newlyCompleted(claimed, {
      collectionCount: Object.keys(s.characters).length,
      lifetimeGoo: s.lifetimeGoo,
      totalHatches: s.totalHatches,
    });
    if (fresh.length === 0) return;
    set({ achievements: [...s.achievements, ...fresh.map((a) => a.id)] });
    for (const a of fresh) {
      get().pushToast({ text: `הישג! ${a.nameHe}`, icon: a.icon, tone: 'star' });
    }
  };

  return {
    goo: 0,
    lifetimeGoo: 0,
    upgrades: { finger: 0, power: 0, autoTap: 0, nurture: 0, crit: 0, luck: 0 },
    characters: {},
    totalHatches: 0,
    sinceRare: 0,
    bonusesCollected: 0,
    achievements: [],
    muted: false,

    loaded: false,
    activeTab: 'click',
    hatchResult: null,
    offlineReport: null,
    frenzyUntil: 0,
    toasts: [],
    achievementsOpen: false,
    confettiBursts: 0,
    confettiKind: 'confetti',

    loadGame: async () => {
      const now = Date.now();
      const raw = await loadRaw();
      const save = raw ? migrate(raw, now) : defaultSaveState(now);

      const m = modifiersFrom(save.upgrades, save.achievements.length);
      const secondsAway = Math.max(0, (now - save.lastSeen) / 1000);
      const report = computeOffline(gooPerSec(save.characters, m), secondsAway);

      set({
        goo: save.goo + (report?.goo ?? 0),
        lifetimeGoo: save.lifetimeGoo + (report?.goo ?? 0),
        upgrades: save.upgrades,
        characters: save.characters,
        totalHatches: save.totalHatches,
        sinceRare: save.sinceRare,
        bonusesCollected: save.bonusesCollected,
        achievements: save.achievements,
        muted: save.muted,
        loaded: true,
        offlineReport: report,
      });
    },

    saveGame: async () => {
      const s = get();
      if (!s.loaded) return;
      await persist(snapshot(s, Date.now()));
    },

    setTab: (tab) => set({ activeTab: tab }),

    click: () => {
      const m = mods();
      const crit = Math.random() < m.critChance;
      const frenzy = Date.now() < get().frenzyUntil;
      let gain = clickPower(m);
      if (crit) gain *= critMultiplier;
      if (frenzy) gain *= frenzyMultiplier;
      set((s) => ({ goo: s.goo + gain, lifetimeGoo: s.lifetimeGoo + gain }));
      syncAchievements();
      return { gain, frenzy, crit };
    },

    buyUpgrade: (id) => {
      const s = get();
      const cost = upgradeCost(id, s.upgrades[id]);
      if (s.goo < cost) return;
      set({ goo: s.goo - cost, upgrades: { ...s.upgrades, [id]: s.upgrades[id] + 1 } });
    },

    tryHatch: () => {
      const s = get();
      const cost = eggCost(s.totalHatches);
      if (s.goo < cost) return;

      const outcome = hatch(Math.random, {
        owned: s.characters,
        sinceRare: s.sinceRare,
        totalHatches: s.totalHatches,
        luck: mods().luck,
      });

      const characters: OwnedCharacters = { ...s.characters };
      characters[outcome.charId] = { level: outcome.level };

      set({
        goo: s.goo - cost + outcome.gooReward,
        lifetimeGoo: s.lifetimeGoo + outcome.gooReward,
        characters,
        totalHatches: outcome.nextTotalHatches,
        sinceRare: outcome.nextSinceRare,
        hatchResult: outcome,
      });
      syncAchievements();
    },

    evolveCreature: (id) => {
      const s = get();
      const held = s.characters[id];
      if (!held || held.level < maxCharLevel || held.shiny) return;
      const def = charactersById[id];
      const cost = evolveCostByRarity[def.rarity];
      if (s.goo < cost) return;
      set({
        goo: s.goo - cost,
        characters: { ...s.characters, [id]: { ...held, shiny: true } },
      });
      get().pushToast({ text: `${def.nameHe} הִתְפַּתֵּחַ! ✨`, icon: '✨', tone: 'star' });
      get().triggerConfetti('rainbow');
    },

    grantGoo: (amount) => {
      if (amount <= 0) return;
      set((s) => ({ goo: s.goo + amount, lifetimeGoo: s.lifetimeGoo + amount }));
      syncAchievements();
    },

    collectBonus: () => {
      const s = get();
      const m = mods();
      const perSec = gooPerSec(s.characters, m);
      const reward = Math.max(
        Math.round(perSec * bonusIncomeSeconds),
        Math.round(clickPower(m) * bonusClickEquivalent),
        bonusMinGoo,
      );
      set({
        goo: s.goo + reward,
        lifetimeGoo: s.lifetimeGoo + reward,
        bonusesCollected: s.bonusesCollected + 1,
        frenzyUntil: Date.now() + frenzyDurationMs,
      });
      get().pushToast({ text: `בּוֹנוּס! +${Math.round(reward)}`, icon: '⭐', tone: 'pop' });
      syncAchievements();
      return reward;
    },

    dismissHatch: () => set({ hatchResult: null }),
    dismissOffline: () => set({ offlineReport: null }),
    toggleMute: () => set((s) => ({ muted: !s.muted })),

    tick: (dtSeconds) => {
      const s = get();
      const rate = gooPerSec(s.characters, modifiersFrom(s.upgrades, s.achievements.length));
      if (rate <= 0) return;
      const gain = rate * dtSeconds;
      set({ goo: s.goo + gain, lifetimeGoo: s.lifetimeGoo + gain });
      syncAchievements();
    },

    setAchievementsOpen: (open) => set({ achievementsOpen: open }),

    // Keep only the most recent few so a burst of unlocks never floods the screen.
    pushToast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: ++toastId }].slice(-4) })),
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    triggerConfetti: (kind) =>
      set((s) => ({ confettiBursts: s.confettiBursts + 1, confettiKind: kind })),
  };
});

// Dev-only handle for tuning/manual testing in the console (stripped in prod).
if (import.meta.env.DEV) {
  (window as unknown as { __game?: typeof useGame }).__game = useGame;
}

// Convenience selectors used across screens.
const modsOf = (s: GameState) => modifiersFrom(s.upgrades, s.achievements.length);
export const selectGooPerSec = (s: GameState) => gooPerSec(s.characters, modsOf(s));
export const selectEggCost = (s: GameState) => eggCost(s.totalHatches);
export const selectClickPower = (s: GameState) => clickPower(modsOf(s));
export const selectUpgradeCost = (id: UpgradeId) => (s: GameState) => upgradeCost(id, s.upgrades[id]);
