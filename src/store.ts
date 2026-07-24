// The single app store (Zustand). Holds the persistent SaveState fields plus
// transient UI state, and wires the pure game logic to React. All numeric
// game rules come from src/game/* — nothing is computed inline here.

import { create } from 'zustand';
import { clickPower, eggCost, fingerCost, gooPerSec } from './game/economy';
import { hatch, type HatchOutcome } from './game/hatching';
import { computeOffline, type OfflineReport } from './game/offline';
import { defaultSaveState, migrate } from './game/save';
import { loadRaw, persist } from './persistence';
import type { OwnedCharacters, SaveState } from './game/types';

export type Tab = 'click' | 'hatch' | 'collection' | 'upgrades';

interface GameState {
  // --- persistent (mirror of SaveState) ---
  goo: number;
  lifetimeGoo: number;
  fingerLevel: number;
  characters: OwnedCharacters;
  totalHatches: number;
  sinceRare: number;
  muted: boolean;

  // --- transient UI ---
  loaded: boolean;
  activeTab: Tab;
  hatchResult: HatchOutcome | null; // drives the reveal modal
  offlineReport: OfflineReport | null; // drives the "welcome back" modal

  // --- actions ---
  loadGame: () => Promise<void>;
  saveGame: () => Promise<void>;
  setTab: (tab: Tab) => void;
  click: () => number;
  buyFinger: () => void;
  tryHatch: () => void;
  dismissHatch: () => void;
  dismissOffline: () => void;
  toggleMute: () => void;
  tick: (dtSeconds: number) => void;
}

function snapshot(s: GameState, now: number): SaveState {
  return {
    version: 1,
    goo: s.goo,
    lifetimeGoo: s.lifetimeGoo,
    fingerLevel: s.fingerLevel,
    characters: s.characters,
    totalHatches: s.totalHatches,
    sinceRare: s.sinceRare,
    lastSeen: now,
    muted: s.muted,
  };
}

export const useGame = create<GameState>((set, get) => ({
  goo: 0,
  lifetimeGoo: 0,
  fingerLevel: 0,
  characters: {},
  totalHatches: 0,
  sinceRare: 0,
  muted: false,

  loaded: false,
  activeTab: 'click',
  hatchResult: null,
  offlineReport: null,

  loadGame: async () => {
    const now = Date.now();
    const raw = await loadRaw();
    const save = raw ? migrate(raw, now) : defaultSaveState(now);

    // Offline earnings (§8) based on the passive rate at the time of leaving.
    const secondsAway = Math.max(0, (now - save.lastSeen) / 1000);
    const report = computeOffline(gooPerSec(save.characters), secondsAway);

    set({
      goo: save.goo + (report?.goo ?? 0),
      lifetimeGoo: save.lifetimeGoo + (report?.goo ?? 0),
      fingerLevel: save.fingerLevel,
      characters: save.characters,
      totalHatches: save.totalHatches,
      sinceRare: save.sinceRare,
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
    const gain = clickPower(get().fingerLevel);
    set((s) => ({ goo: s.goo + gain, lifetimeGoo: s.lifetimeGoo + gain }));
    return gain;
  },

  buyFinger: () => {
    const s = get();
    const cost = fingerCost(s.fingerLevel);
    if (s.goo < cost) return;
    set({ goo: s.goo - cost, fingerLevel: s.fingerLevel + 1 });
  },

  tryHatch: () => {
    const s = get();
    const cost = eggCost(s.totalHatches);
    if (s.goo < cost) return;

    const outcome = hatch(Math.random, {
      owned: s.characters,
      sinceRare: s.sinceRare,
      totalHatches: s.totalHatches,
    });

    // For new/levelup the level advances; for a maxed duplicate it stays at
    // max and outcome.gooReward carries the conversion payout (§7.3).
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
  },

  dismissHatch: () => set({ hatchResult: null }),
  dismissOffline: () => set({ offlineReport: null }),

  toggleMute: () => set((s) => ({ muted: !s.muted })),

  tick: (dtSeconds) => {
    const s = get();
    const rate = gooPerSec(s.characters);
    if (rate <= 0) return;
    const gain = rate * dtSeconds;
    set({ goo: s.goo + gain, lifetimeGoo: s.lifetimeGoo + gain });
  },
}));

// Convenience selectors used across screens.
export const selectGooPerSec = (s: GameState) => gooPerSec(s.characters);
export const selectEggCost = (s: GameState) => eggCost(s.totalHatches);
export const selectFingerCost = (s: GameState) => fingerCost(s.fingerLevel);
export const selectClickPower = (s: GameState) => clickPower(s.fingerLevel);
