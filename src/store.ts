// The single app store (Zustand). Holds the persistent SaveState fields plus
// transient UI/session state, and wires the pure game logic to React. All
// numeric rules come from src/game/* — nothing is computed inline here.

import { create } from 'zustand';
import {
  bonusClickEquivalent,
  bonusIncomeSeconds,
  bonusMinGoo,
  critMultiplier,
  eggBuyMaxPerPress,
  evolveLevels,
  frenzyDurationMs,
  frenzyMultiplier,
  leaderboardMaxEntries,
  luckCap,
  openAllCap,
  leaderboardNameMaxLen,
  maxEvolution,
  upgradeAllCooldownMs,
} from './game/balance';
import {
  achievements as achievementDefs,
  isComplete,
  newlyCompleted,
  starBonusFor,
  type AchievementContext,
} from './game/achievements';
import { charactersById, incomeMultById, unlockCreatures } from './game/characters';
import {
  DEFAULT_ACCESSORY,
  DEFAULT_BACKGROUND,
  DEFAULT_BLOB,
  DEFAULT_SOUND,
  backgroundIncomeBonus,
  clickCosmeticBonus,
  cosmeticsById,
  soundById,
  type CosmeticKind,
} from './game/cosmetics';
import {
  affordableCreatureLevels,
  clickPower,
  creatureLevelCost,
  eggCost,
  evolveCost,
  gooPerSec,
  modifiersFrom,
} from './game/economy';
import { formatGoo } from './game/format';
import { currentEvent } from './game/events';
import { buyableEggs, hatch, openEggs, type BatchResult, type HatchOutcome } from './game/hatching';
import { type Milestone } from './game/milestones';
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
  eggs: number;
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
  equippedSound: string;
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
  statsOpen: boolean;
  numberLegendOpen: boolean;
  confettiBursts: number; // increments to trigger a celebration
  confettiKind: ConfettiKind;
  unlockReveal: CharId | null; // a click-unlocked creature currently being celebrated
  milestone: Milestone | null; // a big number milestone currently being celebrated
  magnitudePulse: number; // increments each time goo crosses an order of magnitude
  magnitudeExp: number; // the exponent (10^exp) of the latest order-of-magnitude crossing
  // "Upgrade all" pacing (session-only, never persisted): the button is locked
  // until this epoch-ms, and its service fee doubles with each use this session.
  upgradeAllReadyAt: number;

  // --- actions ---
  loadGame: () => Promise<void>;
  saveGame: () => Promise<void>;
  setTab: (tab: Tab) => void;
  click: () => { gain: number; frenzy: boolean; crit: boolean };
  buyUpgrade: (id: UpgradeId) => void;
  buyEgg: () => void;
  buyEggsMax: () => void;
  openEgg: () => void;
  openAllEggs: () => void;
  evolveCreature: (id: CharId) => void;
  levelUpCreature: (id: CharId) => void;
  levelUpCreatureMax: (id: CharId) => void;
  upgradeAllCreatures: () => void;
  buyCosmetic: (id: string) => void;
  equipCosmetic: (id: string) => void;
  collectBonus: () => number;
  applyAwayEarnings: (seconds: number) => OfflineReport | null;
  grantGoo: (amount: number) => void;
  dismissMultiHatch: () => void;
  dismissHatch: () => void;
  dismissOffline: () => void;
  toggleMute: () => void;
  tick: (dtSeconds: number) => void;
  setAchievementsOpen: (open: boolean) => void;
  setStatsOpen: (open: boolean) => void;
  setNumberLegendOpen: (open: boolean) => void;
  claimAchievement: (id: string) => void;
  claimAllAchievements: () => void;
  setLeaderboardOpen: (open: boolean) => void;
  addToLeaderboard: (name: string) => void;
  resetClicks: () => void;
  resetGame: () => void;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  triggerConfetti: (kind: ConfettiKind) => void;
  grantUnlock: (id: CharId, reveal: boolean) => void;
  dismissUnlock: () => void;
  showMilestone: (m: Milestone) => void;
  dismissMilestone: () => void;
  pulseMagnitude: (exp: number) => void;
}

let toastId = 0;

/** Egg price function with an event discount folded in (e.g. half-price sale). */
const eggPricer = (mult: number) => (n: number) => Math.max(1, Math.round(eggCost(n) * mult));

const achievementsById = new Map(achievementDefs.map((a) => [a.id, a]));

/** Which "equipped" field a cosmetic kind sets. */
function equipPatch(kind: CosmeticKind, id: string): Partial<GameState> {
  if (kind === 'blob') return { equippedBlob: id };
  if (kind === 'background') return { equippedBackground: id };
  if (kind === 'sound') return { equippedSound: id };
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
    shinyCount: Object.values(s.characters).filter((c) => (c?.evolution ?? 0) > 0).length,
    lifetimeGoo: s.lifetimeGoo,
    totalHatches: s.totalHatches,
    clicks: s.clicks,
    bonusesCollected: s.bonusesCollected,
  };
}

function snapshot(s: GameState, now: number): SaveState {
  return {
    version: 9,
    goo: s.goo,
    lifetimeGoo: s.lifetimeGoo,
    upgrades: s.upgrades,
    characters: s.characters,
    eggs: s.eggs,
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
    equippedSound: s.equippedSound,
    lastSeen: now,
    muted: s.muted,
  };
}

export const useGame = create<GameState>((set, get) => {
  const mods = (): Modifiers => modsOf(get());

  return {
    goo: 0,
    lifetimeGoo: 0,
    upgrades: { finger: 0, power: 0, autoTap: 0, nurture: 0, crit: 0, luck: 0 },
    characters: {},
    eggs: 0,
    totalHatches: 0,
    sinceRare: 0,
    bonusesCollected: 0,
    clicks: 0,
    leaderboard: [],
    achievements: [],
    ownedCosmetics: [DEFAULT_BLOB, DEFAULT_BACKGROUND, DEFAULT_ACCESSORY, DEFAULT_SOUND],
    equippedBlob: DEFAULT_BLOB,
    equippedBackground: DEFAULT_BACKGROUND,
    equippedAccessory: DEFAULT_ACCESSORY,
    equippedSound: DEFAULT_SOUND,
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
    statsOpen: false,
    numberLegendOpen: false,
    confettiBursts: 0,
    confettiKind: 'confetti',
    unlockReveal: null,
    milestone: null,
    magnitudePulse: 0,
    magnitudeExp: 0,
    upgradeAllReadyAt: 0,

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

      // Retroactively grant any click-unlock creatures already earned (silently,
      // so a returning player who's past the thresholds just has them).
      const characters: OwnedCharacters = { ...save.characters };
      for (const c of unlockCreatures) {
        if (c.unlockClicks != null && save.clicks >= c.unlockClicks && !characters[c.id]) {
          characters[c.id] = { level: 1 };
        }
      }

      set({
        goo: save.goo + (report?.goo ?? 0),
        lifetimeGoo: save.lifetimeGoo + (report?.goo ?? 0),
        upgrades: save.upgrades,
        characters,
        eggs: save.eggs,
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
        equippedSound: save.equippedSound,
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
      gain *= currentEvent(Date.now()).clickMult;
      set((s) => ({ goo: s.goo + gain, lifetimeGoo: s.lifetimeGoo + gain, clicks: s.clicks + 1 }));
      return { gain, frenzy, crit };
    },

    buyUpgrade: (id) => {
      const s = get();
      const cost = upgradeCost(id, s.upgrades[id]);
      if (s.goo < cost) return;
      set({ goo: s.goo - cost, upgrades: { ...s.upgrades, [id]: s.upgrades[id] + 1 } });
    },

    // Buy ONE egg into inventory. The price climbs with every egg ever acquired
    // (opened + still held), so it keeps rising however you pace your opening.
    buyEgg: () => {
      const s = get();
      const priced = eggPricer(currentEvent(Date.now()).eggCostMult);
      const cost = priced(s.totalHatches + s.eggs);
      if (s.goo < cost) return;
      set({ goo: s.goo - cost, eggs: s.eggs + 1 });
    },

    // Buy as many eggs as you can afford right now (capped), at escalating price.
    buyEggsMax: () => {
      const s = get();
      const priced = eggPricer(currentEvent(Date.now()).eggCostMult);
      const { count, spent } = buyableEggs(s.goo, s.totalHatches + s.eggs, eggBuyMaxPerPress, priced);
      if (count === 0) return;
      set({ goo: s.goo - spent, eggs: s.eggs + count });
    },

    // Open a single egg from inventory (free — it was paid for at purchase). The
    // outcome is rolled now; the reveal overlay lets the player tap it open.
    openEgg: () => {
      const s = get();
      if (s.eggs <= 0) return;

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
        eggs: s.eggs - 1,
        lifetimeGoo: s.lifetimeGoo + outcome.gooReward,
        characters,
        totalHatches: outcome.nextTotalHatches,
        sinceRare: outcome.nextSinceRare,
        hatchResult: outcome,
      });
    },

    // Open the whole inventory at once (free) — summarised in the batch modal.
    openAllEggs: () => {
      const s = get();
      if (s.eggs <= 0) return;
      const result = openEggs({
        rng: Math.random,
        owned: s.characters,
        sinceRare: s.sinceRare,
        totalHatches: s.totalHatches,
        luck: mods().luck,
        count: Math.min(s.eggs, openAllCap),
      });
      if (result.count === 0) return;

      set({
        eggs: s.eggs - result.count,
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
      if (!held) return;
      const stage = held.evolution ?? 0;
      if (stage >= maxEvolution || held.level < evolveLevels[stage]) return; // not eligible yet
      const def = charactersById[id];
      const m = mods();
      const cost = evolveCost(def.rarity, held, m, gooPerSec(s.characters, m), incomeMultById(id));
      if (s.goo < cost) return;
      set({
        goo: s.goo - cost,
        characters: { ...s.characters, [id]: { ...held, evolution: stage + 1 } },
      });
      get().pushToast({ text: `${def.nameHe} הִתְפַּתֵּחַ! ✨ (שלב ${stage + 1})`, icon: '✨', tone: 'star' });
      get().triggerConfetti('rainbow');
    },

    // Level a creature straight up with goo (the collection goo sink).
    levelUpCreature: (id) => {
      const s = get();
      const held = s.characters[id];
      if (!held) return;
      const m = mods();
      const cost = creatureLevelCost(charactersById[id].rarity, held, m, gooPerSec(s.characters, m), incomeMultById(id));
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
      const rate = gooPerSec(s.characters, m);
      const im = incomeMultById(id);
      const n = affordableCreatureLevels(rarity, held, m, s.goo, rate, im);
      if (n <= 0) return;
      let spent = 0;
      for (let i = 0; i < n; i++) spent += creatureLevelCost(rarity, { level: held.level + i, evolution: held.evolution }, m, rate, im);
      set({
        goo: s.goo - spent,
        characters: { ...s.characters, [id]: { ...held, level: held.level + n } },
      });
    },

    // One press: spend goo across ALL creatures, always buying the cheapest
    // available level (best value), so your whole roster climbs together. No
    // fee — just a short cooldown afterwards so it isn't spam-tapped. Bounded
    // per press; costs are already wealth-scaled by the economy.
    upgradeAllCreatures: () => {
      const s = get();
      const now = Date.now();
      if (now < s.upgradeAllReadyAt) return; // still cooling down
      const m = mods();
      const rate = gooPerSec(s.characters, m);
      let goo = s.goo;
      const chars: OwnedCharacters = { ...s.characters };
      const upgraded = new Set<CharId>();
      let bought = 0;
      const CAP = 300;
      while (bought < CAP) {
        let bestId: CharId | null = null;
        let bestCost = Infinity;
        for (const id of Object.keys(chars) as CharId[]) {
          const cost = creatureLevelCost(charactersById[id].rarity, chars[id]!, m, rate, incomeMultById(id));
          if (cost <= goo && cost < bestCost) {
            bestCost = cost;
            bestId = id;
          }
        }
        if (!bestId) break;
        goo -= bestCost;
        const h = chars[bestId]!;
        chars[bestId] = { ...h, level: h.level + 1 };
        upgraded.add(bestId);
        bought += 1;
      }
      if (bought === 0) return; // nothing affordable — don't lock
      const gained = gooPerSec(chars, m) - rate; // extra goo/sec from this batch
      set({ goo, characters: chars, upgradeAllReadyAt: now + upgradeAllCooldownMs });
      get().pushToast({
        text: `⬆️ ${bought} רָמוֹת בְּ־${upgraded.size} יְצוּרִים · +${formatGoo(gained)} גּוּ/שנייה`,
        icon: '⬆️',
        tone: 'goo',
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

    // Credit earnings for time the app was alive but backgrounded (phone locked,
    // switched to another app). requestAnimationFrame is paused while hidden, so
    // the tick never runs — without this, background time would earn nothing. Uses
    // the SAME offline model (capped + reduced rate) as a cold start, so "closed"
    // and "backgrounded" behave identically. A toast (not the big modal) keeps
    // quick tab-switches unobtrusive.
    applyAwayEarnings: (seconds) => {
      const s = get();
      const report = computeOffline(gooPerSec(s.characters, mods()), seconds);
      if (!report) return null;
      set({ goo: s.goo + report.goo, lifetimeGoo: s.lifetimeGoo + report.goo });
      get().pushToast({ text: `בֵּינְתַיִם צָבַרְתָּ +${formatGoo(report.goo)} גּוּ 💤`, icon: '💤', tone: 'goo' });
      return report;
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
      // Use the SAME full modifiers the UI shows (star + cosmetic income bonus),
      // so the goo you actually earn matches the displayed goo/sec exactly.
      const rate = gooPerSec(s.characters, mods());
      if (rate <= 0) return;
      const gain = rate * dtSeconds * currentEvent(Date.now()).incomeMult;
      set({ goo: s.goo + gain, lifetimeGoo: s.lifetimeGoo + gain });
    },

    setAchievementsOpen: (open) => set({ achievementsOpen: open }),

    setStatsOpen: (open) => set({ statsOpen: open }),

    setNumberLegendOpen: (open) => set({ numberLegendOpen: open }),

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
        eggs: 0,
        totalHatches: 0,
        sinceRare: 0,
        bonusesCollected: 0,
        clicks: 0,
        leaderboard: [],
        achievements: [],
        milestone: null,
        unlockReveal: null,
        ownedCosmetics: [...fresh.ownedCosmetics],
        equippedBlob: fresh.equippedBlob,
        equippedBackground: fresh.equippedBackground,
        equippedAccessory: fresh.equippedAccessory,
        equippedSound: fresh.equippedSound,
        hatchResult: null,
        multiHatchResult: null,
        offlineReport: null,
        frenzyUntil: 0,
        achievementsOpen: false,
        statsOpen: false,
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

    // Grant a click-unlock creature (at level 1) if not already owned. `reveal`
    // shows the celebration; on load we grant retroactively earned ones silently.
    grantUnlock: (id, reveal) => {
      const s = get();
      if (s.characters[id]) return;
      set({
        characters: { ...s.characters, [id]: { level: 1 } },
        ...(reveal ? { unlockReveal: id } : {}),
      });
      if (reveal) get().triggerConfetti('rainbow');
    },
    dismissUnlock: () => set({ unlockReveal: null }),

    // Only surface a milestone if one isn't already on screen (avoid stacking).
    showMilestone: (m) => {
      if (get().milestone) return;
      set({ milestone: m });
    },
    dismissMilestone: () => set({ milestone: null }),
    pulseMagnitude: (exp) => set((s) => ({ magnitudePulse: s.magnitudePulse + 1, magnitudeExp: exp })),
  };
});

// Dev-only handle for tuning/manual testing in the console (stripped in prod).
if (import.meta.env.DEV) {
  (window as unknown as { __game?: typeof useGame }).__game = useGame;
}

// Convenience selectors used across screens.
const modsOf = (s: GameState): Modifiers => {
  const m = modifiersFrom(
    s.upgrades,
    starBonusFor(s.achievements),
    clickCosmeticBonus(s.equippedBlob, s.equippedAccessory),
    backgroundIncomeBonus(s.equippedBackground),
  );
  // A "lucky hour" event temporarily boosts hatch odds (luck only affects
  // hatching, never costs, so it's safe to fold in here).
  const ev = currentEvent(Date.now());
  if (ev.luckBonus > 0) m.luck = Math.min(luckCap, m.luck + ev.luckBonus);
  return m;
};
export const selectMods = (s: GameState): Modifiers => modsOf(s);
// Display selectors fold in the active event's multipliers so the numbers the
// player sees (rate, tap power, egg price) match what they actually get.
export const selectGooPerSec = (s: GameState) =>
  gooPerSec(s.characters, modsOf(s)) * currentEvent(Date.now()).incomeMult;
/** The active permanent income bonus (star) as a fraction, e.g. 0.2 = +20%. */
export const selectStarBonus = (s: GameState) => starBonusFor(s.achievements);
export const selectEggCost = (s: GameState) =>
  Math.max(1, Math.round(eggCost(s.totalHatches + s.eggs) * currentEvent(Date.now()).eggCostMult));
export const selectClickPower = (s: GameState) =>
  clickPower(modsOf(s)) * currentEvent(Date.now()).clickMult;
/** The combo melody (note frequencies) of the equipped sound pack. */
export const selectComboMelody = (s: GameState) => soundById(s.equippedSound).melody;
export const selectUpgradeCost = (id: UpgradeId) => (s: GameState) => upgradeCost(id, s.upgrades[id]);
export const selectAchContext = (s: GameState): AchievementContext => achContextOf(s);
/** Ids of achievements finished but not yet claimed — the "ready to collect" set. */
export const selectClaimableIds = (s: GameState): Set<string> =>
  new Set(newlyCompleted(new Set(s.achievements), achContextOf(s)).map((a) => a.id));
