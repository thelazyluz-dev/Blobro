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
  evolveLevel,
  frenzyDurationMs,
  frenzyMultiplier,
  leaderboardMaxEntries,
  leaderboardNameMaxLen,
} from './game/balance';
import {
  achievements as achievementDefs,
  isComplete,
  newlyCompleted,
  starBonusFor,
  type AchievementContext,
} from './game/achievements';
import { charactersById } from './game/characters';
import {
  DEFAULT_ACCESSORY,
  DEFAULT_BACKGROUND,
  DEFAULT_BLOB,
  backgroundIncomeBonus,
  clickCosmeticBonus,
  cosmeticsById,
  type CosmeticKind,
} from './game/cosmetics';
import {
  affordableCreatureLevels,
  clickPower,
  creatureLevelCost,
  eggCost,
  gooPerSec,
  modifiersFrom,
} from './game/economy';
import { hatch, hatchBatch, type BatchResult, type HatchOutcome } from './game/hatching';
import { computeOffline, type OfflineReport } from './game/offline';
import { defaultSaveState, migrate } from './game/save';
import { upgradeCost } from './game/upgrades';
import { loadRaw, persist } from './persistence';
import type {
  CharId,
  LeaderboardEntry,
  Modifiers,
  OwnedCharacters,
  SaveState,
  UpgradeId,
  Upgrades,
} from './game/types';

export type Tab = 'click' | 'hatch' | 'collection' | 'upgrades' | 'shop';

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
  clicks: number;
  leaderboard: LeaderboardEntry[];
  achievements: string[];
  ownedCosmetics: string[];
  equippedBlob: string;
  equippedBackground: string;
  equippedAccessory: string;
  muted: boolean;

  // --- transient UI / session ---
  loaded: boolean;
  activeTab: Tab;
  leaderboardOpen: boolean;
  hatchResult: HatchOutcome | null;
  multiHatchResult: BatchResult | null;
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
  hatchMany: (maxCount: number) => void;
  evolveCreature: (id: CharId) => void;
  levelUpCreature: (id: CharId) => void;
  levelUpCreatureMax: (id: CharId) => void;
  buyCosmetic: (id: string) => void;
  equipCosmetic: (id: string) => void;
  collectBonus: () => number;
  grantGoo: (amount: number) => void;
  dismissMultiHatch: () => void;
  dismissHatch: () => void;
  dismissOffline: () => void;
  toggleMute: () => void;
  tick: (dtSeconds: number) => void;
  setAchievementsOpen: (open: boolean) => void;
  claimAchievement: (id: string) => void;
  claimAllAchievements: () => void;
  setLeaderboardOpen: (open: boolean) => void;
  addToLeaderboard: (name: string) => void;
  resetClicks: () => void;
  resetGame: () => void;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  triggerConfetti: (kind: ConfettiKind) => void;
}

let toastId = 0;

const achievementsById = new Map(achievementDefs.map((a) => [a.id, a]));

/** Which "equipped" field a cosmetic kind sets. */
function equipPatch(kind: CosmeticKind, id: string): Partial<GameState> {
  if (kind === 'blob') return { equippedBlob: id };
  if (kind === 'background') return { equippedBackground: id };
  return { equippedAccessory: id };
}

/** Build the achievement-progress context from the persistent state fields. */
function achContextOf(s: {
  characters: OwnedCharacters;
  lifetimeGoo: number;
  totalHatches: number;
  clicks: number;
  bonusesCollected: number;
}): AchievementContext {
  return {
    collectionCount: Object.keys(s.characters).length,
    shinyCount: Object.values(s.characters).filter((c) => c?.shiny).length,
    lifetimeGoo: s.lifetimeGoo,
    totalHatches: s.totalHatches,
    clicks: s.clicks,
    bonusesCollected: s.bonusesCollected,
  };
}

function snapshot(s: GameState, now: number): SaveState {
  return {
    version: 6,
    goo: s.goo,
    lifetimeGoo: s.lifetimeGoo,
    upgrades: s.upgrades,
    characters: s.characters,
    totalHatches: s.totalHatches,
    sinceRare: s.sinceRare,
    bonusesCollected: s.bonusesCollected,
    clicks: s.clicks,
    leaderboard: s.leaderboard,
    achievements: s.achievements,
    ownedCosmetics: s.ownedCosmetics,
    equippedBlob: s.equippedBlob,
    equippedBackground: s.equippedBackground,
    equippedAccessory: s.equippedAccessory,
    lastSeen: now,
    muted: s.muted,
  };
}

export const useGame = create<GameState>((set, get) => {
  const mods = (): Modifiers => {
    const s = get();
    return modifiersFrom(
      s.upgrades,
      starBonusFor(s.achievements),
      clickCosmeticBonus(s.equippedBlob, s.equippedAccessory),
      backgroundIncomeBonus(s.equippedBackground),
    );
  };

  return {
    goo: 0,
    lifetimeGoo: 0,
    upgrades: { finger: 0, power: 0, autoTap: 0, nurture: 0, crit: 0, luck: 0 },
    characters: {},
    totalHatches: 0,
    sinceRare: 0,
    bonusesCollected: 0,
    clicks: 0,
    leaderboard: [],
    achievements: [],
    ownedCosmetics: [DEFAULT_BLOB, DEFAULT_BACKGROUND, DEFAULT_ACCESSORY],
    equippedBlob: DEFAULT_BLOB,
    equippedBackground: DEFAULT_BACKGROUND,
    equippedAccessory: DEFAULT_ACCESSORY,
    muted: false,

    loaded: false,
    activeTab: 'click',
    leaderboardOpen: false,
    hatchResult: null,
    multiHatchResult: null,
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

      const m = modifiersFrom(
        save.upgrades,
        starBonusFor(save.achievements),
        clickCosmeticBonus(save.equippedBlob, save.equippedAccessory),
        backgroundIncomeBonus(save.equippedBackground),
      );
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
        clicks: save.clicks,
        leaderboard: save.leaderboard,
        achievements: save.achievements,
        ownedCosmetics: save.ownedCosmetics,
        equippedBlob: save.equippedBlob,
        equippedBackground: save.equippedBackground,
        equippedAccessory: save.equippedAccessory,
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
      set((s) => ({ goo: s.goo + gain, lifetimeGoo: s.lifetimeGoo + gain, clicks: s.clicks + 1 }));
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

      // Spread the existing entry so an evolved (shiny) creature keeps its shine.
      const existing = s.characters[outcome.charId];
      const characters: OwnedCharacters = {
        ...s.characters,
        [outcome.charId]: existing
          ? { ...existing, level: outcome.level }
          : { level: outcome.level },
      };

      set({
        goo: s.goo - cost + outcome.gooReward,
        lifetimeGoo: s.lifetimeGoo + outcome.gooReward,
        characters,
        totalHatches: outcome.nextTotalHatches,
        sinceRare: outcome.nextSinceRare,
        hatchResult: outcome,
      });
    },

    hatchMany: (maxCount) => {
      const s = get();
      const result = hatchBatch({
        rng: Math.random,
        goo: s.goo,
        owned: s.characters,
        sinceRare: s.sinceRare,
        totalHatches: s.totalHatches,
        luck: mods().luck,
        maxCount,
        eggCost,
      });
      if (result.count === 0) return; // couldn't afford even one

      set({
        goo: result.goo,
        lifetimeGoo: s.lifetimeGoo + result.gooFromDupes,
        characters: result.owned,
        totalHatches: result.totalHatches,
        sinceRare: result.sinceRare,
        multiHatchResult: result,
      });
    },

    dismissMultiHatch: () => set({ multiHatchResult: null }),

    evolveCreature: (id) => {
      const s = get();
      const held = s.characters[id];
      if (!held || held.level < evolveLevel || held.shiny) return;
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

    // Level a creature straight up with goo (the collection goo sink).
    levelUpCreature: (id) => {
      const s = get();
      const held = s.characters[id];
      if (!held) return;
      const cost = creatureLevelCost(charactersById[id].rarity, held, mods());
      if (s.goo < cost) return;
      set({
        goo: s.goo - cost,
        characters: { ...s.characters, [id]: { ...held, level: held.level + 1 } },
      });
    },

    // Pour goo in until the next level is no longer affordable — one tap, many levels.
    levelUpCreatureMax: (id) => {
      const s = get();
      const held = s.characters[id];
      if (!held) return;
      const rarity = charactersById[id].rarity;
      const m = mods();
      const n = affordableCreatureLevels(rarity, held, m, s.goo);
      if (n <= 0) return;
      let spent = 0;
      for (let i = 0; i < n; i++) spent += creatureLevelCost(rarity, { level: held.level + i, shiny: held.shiny }, m);
      set({
        goo: s.goo - spent,
        characters: { ...s.characters, [id]: { ...held, level: held.level + n } },
      });
    },

    // Shop: buy a cosmetic with goo (auto-equips it), or equip one already owned.
    buyCosmetic: (id) => {
      const s = get();
      const c = cosmeticsById.get(id);
      if (!c || s.ownedCosmetics.includes(id) || s.goo < c.cost) return;
      set({
        goo: s.goo - c.cost,
        ownedCosmetics: [...s.ownedCosmetics, id],
        ...equipPatch(c.kind, id),
      });
      const icon = c.kind === 'blob' ? '🎨' : c.kind === 'background' ? '🖼️' : '🎩';
      get().pushToast({ text: `${c.nameHe} נִקְנָה!`, icon, tone: 'star' });
    },

    equipCosmetic: (id) => {
      const s = get();
      const c = cosmeticsById.get(id);
      if (!c || !s.ownedCosmetics.includes(id)) return;
      set(equipPatch(c.kind, id));
    },

    grantGoo: (amount) => {
      if (amount <= 0) return;
      set((s) => ({ goo: s.goo + amount, lifetimeGoo: s.lifetimeGoo + amount }));
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
      return reward;
    },

    dismissHatch: () => set({ hatchResult: null }),
    dismissOffline: () => set({ offlineReport: null }),
    toggleMute: () => set((s) => ({ muted: !s.muted })),

    tick: (dtSeconds) => {
      const s = get();
      const rate = gooPerSec(s.characters, modifiersFrom(s.upgrades, starBonusFor(s.achievements)));
      if (rate <= 0) return;
      const gain = rate * dtSeconds;
      set({ goo: s.goo + gain, lifetimeGoo: s.lifetimeGoo + gain });
    },

    setAchievementsOpen: (open) => set({ achievementsOpen: open }),

    // Achievements are collected by hand: the player opens the trophy panel and
    // taps each finished badge to claim its permanent income star + goo grant.
    claimAchievement: (id) => {
      const s = get();
      if (s.achievements.includes(id)) return;
      const def = achievementsById.get(id);
      if (!def || !isComplete(def, achContextOf(s))) return;
      set({
        achievements: [...s.achievements, id],
        goo: s.goo + def.gooReward,
        lifetimeGoo: s.lifetimeGoo + def.gooReward,
      });
      get().pushToast({
        text: `${def.nameHe} · +${Math.round(def.starReward * 100)}% הכנסה!`,
        icon: def.icon,
        tone: 'star',
      });
    },

    // Convenience: sweep up every badge that's ready right now.
    claimAllAchievements: () => {
      const s = get();
      const ready = newlyCompleted(new Set(s.achievements), achContextOf(s));
      if (ready.length === 0) return;
      const grant = ready.reduce((sum, a) => sum + a.gooReward, 0);
      set({
        achievements: [...s.achievements, ...ready.map((a) => a.id)],
        goo: s.goo + grant,
        lifetimeGoo: s.lifetimeGoo + grant,
      });
      get().pushToast({ text: `אספת ${ready.length} הישגים! 🏆`, icon: '🏆', tone: 'star' });
    },

    setLeaderboardOpen: (open) => set({ leaderboardOpen: open }),

    // Save the current player's click count under a nickname. Local only — this
    // list lives in IndexedDB and is never uploaded anywhere.
    addToLeaderboard: (name) => {
      const clean = name.trim().slice(0, leaderboardNameMaxLen);
      if (!clean) return;
      const s = get();
      const entry: LeaderboardEntry = { name: clean, clicks: s.clicks };
      const leaderboard = [...s.leaderboard, entry]
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, leaderboardMaxEntries);
      set({ leaderboard });
      get().pushToast({ text: `${clean} נכנס לטבלה! 🏅`, icon: '🏅', tone: 'star' });
    },

    // Start a fresh run for the next player (resets the click tally only —
    // the game's goo and creatures are untouched).
    resetClicks: () => set({ clicks: 0 }),

    // Wipe ALL progress back to a brand-new game (and persist the empty save).
    resetGame: () => {
      const now = Date.now();
      const fresh = defaultSaveState(now);
      set({
        goo: fresh.goo,
        lifetimeGoo: fresh.lifetimeGoo,
        upgrades: { ...fresh.upgrades },
        characters: {},
        totalHatches: 0,
        sinceRare: 0,
        bonusesCollected: 0,
        clicks: 0,
        leaderboard: [],
        achievements: [],
        ownedCosmetics: [...fresh.ownedCosmetics],
        equippedBlob: fresh.equippedBlob,
        equippedBackground: fresh.equippedBackground,
        equippedAccessory: fresh.equippedAccessory,
        hatchResult: null,
        multiHatchResult: null,
        offlineReport: null,
        frenzyUntil: 0,
        achievementsOpen: false,
        leaderboardOpen: false,
        activeTab: 'click',
      });
      void persist(snapshot(get(), now));
    },

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
const modsOf = (s: GameState) =>
  modifiersFrom(
    s.upgrades,
    starBonusFor(s.achievements),
    clickCosmeticBonus(s.equippedBlob, s.equippedAccessory),
    backgroundIncomeBonus(s.equippedBackground),
  );
export const selectMods = (s: GameState): Modifiers => modsOf(s);
export const selectGooPerSec = (s: GameState) => gooPerSec(s.characters, modsOf(s));
export const selectEggCost = (s: GameState) => eggCost(s.totalHatches);
export const selectClickPower = (s: GameState) => clickPower(modsOf(s));
export const selectUpgradeCost = (id: UpgradeId) => (s: GameState) => upgradeCost(id, s.upgrades[id]);
export const selectAchContext = (s: GameState): AchievementContext => achContextOf(s);
/** Ids of achievements finished but not yet claimed — the "ready to collect" set. */
export const selectClaimableIds = (s: GameState): Set<string> =>
  new Set(newlyCompleted(new Set(s.achievements), achContextOf(s)).map((a) => a.id));
