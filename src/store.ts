// The single app store (Zustand). Holds the persistent SaveState fields plus
// transient UI/session state, and wires the pure game logic to React. All
// numeric rules come from src/game/* — nothing is computed inline here.

import { create } from 'zustand';
import {
  adRewardCooldownMs,
  adRewardDurationMs,
  adRewardMult,
  bonusClickEquivalent,
  bonusIncomeSeconds,
  bonusMinGoo,
  critChanceCap,
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
import { abilityOf, type Ability } from './game/abilities';
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
  autoClicksPerSec,
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
import { createRng } from './game/rng';
import { CURRENT_VERSION, defaultSaveState, migrate } from './game/save';
import { upgradeCost } from './game/upgrades';
import { cachedUser, fetchMe, logout, type AuthUser } from './net/auth';
import { resetPlayerIdentity, shouldPromptNickname } from './net/leaderboard';
import { decideMergeWinner, fetchCloudSave, pushCloudSave } from './net/save';
import { backupLocal, loadRaw, persist } from './persistence';
import type {
  CharId,
  LeaderboardEntry,
  Modifiers,
  OwnedCharacters,
  RngState,
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
  equippedMain: CharId | null; // creature shown on the main screen (null = classic blob)
  milestonesShown: number[]; // goo thresholds already celebrated (each fact shows once)
  muted: boolean;
  rng: RngState; // seeded stream driving crit rolls + hatching (see game/rng.ts)

  // --- session-only account state (PR 3b) — deliberately NOT part of
  // SaveState: identity is separate from game progress, and this PR does not
  // bump the save version. Hydrated from the local cache + /auth/me, see
  // initAuth() below.
  authUser: AuthUser | null;
  authChecked: boolean; // true once we've resolved (cache and/or /auth/me) whether anyone's signed in

  // --- cloud-save checkpoint sync (PR 4) — session-only, NOT part of
  // SaveState. cloudRev is the last cloud revision this device knows about
  // (the baseRev the next push must send); cloudSynced is a calm UI signal
  // only ("did the last push succeed"), see StatsOverlay's AccountSection.
  cloudRev: number;
  cloudSynced: boolean;

  // --- transient UI / session ---
  loaded: boolean;
  activeTab: Tab;
  nicknameOpen: boolean; // the first-launch / new-game "pick a nickname" prompt
  leaderboardOpen: boolean;
  hatchResult: HatchOutcome | null;
  multiHatchResult: BatchResult | null;
  offlineReport: OfflineReport | null;
  frenzyUntil: number; // epoch ms; a click frenzy is active until then
  // Rewarded "watch to boost" mechanic (session-only, never persisted).
  adRewardUntil: number; // epoch ms; a ×N boost to taps AND income is live until then
  adCooldownUntil: number; // epoch ms; the bonus button recharges after this
  adOverlayOpen: boolean; // the placeholder ad is currently playing
  adPurpose: 'boost' | 'offline' | null; // what the current ad rewards on finish
  offlineDoubled: boolean; // guard: the returning-bonus can be doubled only once
  toasts: Toast[];
  achievementsOpen: boolean;
  statsOpen: boolean;
  infoOpen: boolean; // the "what am I earning, and what does each icon mean" panel
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
  setEquippedMain: (id: CharId | null) => void;
  collectBonus: () => number;
  startAdBonus: () => void;
  watchAdForOffline: () => void;
  finishAd: () => void;
  cancelAd: () => void;
  applyAwayEarnings: (seconds: number) => OfflineReport | null;
  grantGoo: (amount: number) => void;
  dismissMultiHatch: () => void;
  dismissHatch: () => void;
  dismissOffline: () => void;
  toggleMute: () => void;
  tick: (dtSeconds: number) => void;
  setAchievementsOpen: (open: boolean) => void;
  setStatsOpen: (open: boolean) => void;
  setInfoOpen: (open: boolean) => void;
  setNumberLegendOpen: (open: boolean) => void;
  claimAchievement: (id: string) => void;
  claimAllAchievements: () => void;
  setLeaderboardOpen: (open: boolean) => void;
  setNicknameOpen: (open: boolean) => void;
  addToLeaderboard: (name: string) => void;
  resetClicks: () => void;
  resetGame: () => void;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  triggerConfetti: (kind: ConfettiKind) => void;
  grantUnlock: (id: CharId, reveal: boolean) => void;
  dismissUnlock: () => void;
  showMilestone: (m: Milestone) => void;
  markMilestonesShown: (goos: number[]) => void;
  dismissMilestone: () => void;
  pulseMagnitude: (exp: number) => void;
  initAuth: () => void;
  setAuthUser: (user: AuthUser | null) => void;
  clearAuthUser: () => void;
  signOut: () => void;
}

let toastId = 0;

// --- Cloud-save checkpoint sync (PR 4) — tuning constants -------------------
// A slow/offline cloud fetch must never hold up the splash screen (see loadGame).
const CLOUD_LOAD_TIMEOUT_MS = 3000;
// Owner decision (CLAUDE.md): "prefer checkpoint-based syncing over per-tick
// requests" — a push at most this often while the save is dirty.
const CLOUD_PUSH_MIN_INTERVAL_MS = 60_000;

/**
 * Race `p` against a timer. On timeout, `fallback` is returned and `p` is
 * simply left to resolve into the void — no `.then` is ever attached to it
 * after that point, so a late answer is discarded, never applied behind the
 * player's back.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    p.then((v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    }).catch(() => {
      // fetchCloudSave() never rejects, but be defensive: a rejection here
      // must degrade to "no cloud answer", never crash loadGame.
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(fallback);
    });
  });
}

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
    version: CURRENT_VERSION,
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
    equippedMain: s.equippedMain,
    milestonesShown: s.milestonesShown,
    lastSeen: now,
    muted: s.muted,
    rng: s.rng,
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
    equippedMain: null,
    milestonesShown: [],
    muted: false,
    rng: { seed: 0, cursor: 0 }, // placeholder — loadGame() overwrites with the saved stream

    authUser: null,
    authChecked: false,
    cloudRev: 0,
    cloudSynced: false,

    loaded: false,
    activeTab: 'click',
    nicknameOpen: false,
    leaderboardOpen: false,
    hatchResult: null,
    multiHatchResult: null,
    offlineReport: null,
    frenzyUntil: 0,
    adRewardUntil: 0,
    adCooldownUntil: 0,
    adOverlayOpen: false,
    adPurpose: null,
    offlineDoubled: false,
    toasts: [],
    achievementsOpen: false,
    statsOpen: false,
    infoOpen: false,
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
      const rawLocal = await loadRaw();
      // Race the cloud fetch against a timeout so a slow or offline network
      // never holds up the splash screen — fetchCloudSave() itself never
      // throws, so the only thing withTimeout guards against is it being
      // slow. A response that arrives after we've already moved on is just
      // discarded (we never attach a .then to it), never applied behind the
      // player's back.
      const cloud = await withTimeout(fetchCloudSave(), CLOUD_LOAD_TIMEOUT_MS, null);

      const localSave = rawLocal ? migrate(rawLocal, now) : null;
      const cloudSave = cloud?.save != null ? migrate(cloud.save, now) : null;
      const decision = decideMergeWinner(localSave, cloudSave ? { rev: cloud!.rev, save: cloudSave } : null);

      if (decision.winner === 'cloud' && localSave) {
        // The cloud outranks what's on this device (higher lifetimeGoo) —
        // stash the local save under a separate key BEFORE it's replaced, so
        // a wrong call here is recoverable, not destructive. See CLAUDE.md:
        // "never drop a player's progress".
        await backupLocal(localSave);
      }

      const save =
        decision.winner === 'cloud' ? cloudSave! : decision.winner === 'local' ? localSave! : defaultSaveState(now);

      const m = modifiersFrom(
        save.upgrades,
        starBonusFor(save.achievements),
        clickCosmeticBonus(save.equippedBlob, save.equippedAccessory),
        backgroundIncomeBonus(save.equippedBackground),
      );
      const secondsAway = Math.max(0, (now - save.lastSeen) / 1000);
      // Offline earns creature income PLUS the robot hand's auto-clicks.
      const offlineRate = gooPerSec(save.characters, m) + clickPower(m) * autoClicksPerSec(save.upgrades.autoTap);
      const report = computeOffline(offlineRate, secondsAway);

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
        equippedMain: save.equippedMain,
        milestonesShown: save.milestonesShown,
        muted: save.muted,
        rng: save.rng,
        loaded: true,
        offlineReport: report,
        // First-launch (global leaderboard on, no nickname yet) → invite them
        // to pick a nickname so they land on the table right away.
        nicknameOpen: shouldPromptNickname(),
        cloudRev: decision.cloudRev,
        cloudSynced: false,
      });

      // Seed/refresh the cloud right away so a brand-new device's save
      // reaches the server immediately, instead of waiting for the first
      // 60s checkpoint (see the cloud-sync engine below `useGame`).
      cloudDirty = false;
      lastCloudPushAt = Date.now();
      void pushCheckpoint();
    },

    saveGame: async () => {
      const s = get();
      if (!s.loaded) return;
      await persist(snapshot(s, Date.now()));
    },

    setTab: (tab) => set({ activeTab: tab }),

    click: () => {
      const s = get();
      const m = mods();
      const rng = createRng(s.rng);
      const crit = rng.next() < m.critChance;
      const frenzy = Date.now() < s.frenzyUntil;
      let gain = clickPower(m);
      if (crit) gain *= critMultiplier;
      if (frenzy) gain *= frenzyMultiplier;
      gain *= currentEvent(Date.now()).clickMult;
      gain *= adMultOf(s, Date.now());
      set({ goo: s.goo + gain, lifetimeGoo: s.lifetimeGoo + gain, clicks: s.clicks + 1, rng: rng.state() });
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

      const rng = createRng(s.rng);
      const outcome = hatch(rng.next, {
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
        rng: rng.state(),
      });
    },

    // Open the whole inventory at once (free) — summarised in the batch modal.
    openAllEggs: () => {
      const s = get();
      if (s.eggs <= 0) return;
      const rng = createRng(s.rng);
      const result = openEggs({
        rng: rng.next,
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
        rng: rng.state(),
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

    // Choose which owned creature stars on the main screen (null = classic blob).
    // Only an owned creature can be equipped; the render also guards ownership.
    setEquippedMain: (id) => {
      if (id !== null && !get().characters[id]) return;
      set({ equippedMain: id });
    },

    // Credit earnings for time the app was alive but backgrounded (phone locked,
    // switched to another app). requestAnimationFrame is paused while hidden, so
    // the tick never runs — without this, background time would earn nothing. Uses
    // the SAME offline model (capped + reduced rate) as a cold start, so "closed"
    // and "backgrounded" behave identically. A toast (not the big modal) keeps
    // quick tab-switches unobtrusive.
    applyAwayEarnings: (seconds) => {
      const s = get();
      const m = mods();
      const rate = gooPerSec(s.characters, m) + clickPower(m) * autoClicksPerSec(s.upgrades.autoTap);
      const report = computeOffline(rate, seconds);
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
      const ab = selectActiveAbility(s);
      const bonusMult = ab?.type === 'bonus' ? 1 + ab.value : 1;
      const reward = Math.round(
        Math.max(
          Math.round(perSec * bonusIncomeSeconds),
          Math.round(clickPower(m) * bonusClickEquivalent),
          bonusMinGoo,
        ) * bonusMult,
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

    // --- Rewarded ads (one placeholder ad, two reward types) ---------------
    // A single ad flow (open → finishAd/cancelAd) serves two rewards, chosen by
    // adPurpose: 'boost' (the floating bonus button → ×N to taps+income) and
    // 'offline' (double the returning "while you were away" earnings). Swapping
    // in a real rewarded-ad network later means only the AdOverlay component
    // changes — this contract stays identical.
    startAdBonus: () => {
      const s = get();
      if (s.adOverlayOpen) return;
      if (Date.now() < s.adCooldownUntil) return;
      set({ adOverlayOpen: true, adPurpose: 'boost' });
    },
    watchAdForOffline: () => {
      const s = get();
      if (s.adOverlayOpen || !s.offlineReport || s.offlineDoubled) return;
      set({ adOverlayOpen: true, adPurpose: 'offline' });
    },
    finishAd: () => {
      const s = get();
      if (!s.adOverlayOpen) return;
      const now = Date.now();
      if (s.adPurpose === 'offline') {
        const extra = s.offlineReport?.goo ?? 0; // grant the same amount again = ×2
        set({
          adOverlayOpen: false,
          adPurpose: null,
          offlineDoubled: true,
          goo: s.goo + extra,
          lifetimeGoo: s.lifetimeGoo + extra,
          offlineReport: null,
        });
        if (extra > 0) {
          get().pushToast({ text: `הַכְנָסָה כְּפוּלָה! +${formatGoo(extra)} גּוּ 🎬`, icon: '🎬', tone: 'pop' });
        }
        return;
      }
      // default: the boost button
      set({
        adOverlayOpen: false,
        adPurpose: null,
        adRewardUntil: now + adRewardDurationMs,
        adCooldownUntil: now + adRewardCooldownMs,
      });
      get().pushToast({
        text: `בּוֹנוּס פָּעִיל! ×${adRewardMult} לְדַּקָּה 🚀`,
        icon: '🚀',
        tone: 'pop',
      });
    },
    cancelAd: () => set({ adOverlayOpen: false, adPurpose: null }),

    dismissHatch: () => set({ hatchResult: null }),
    dismissOffline: () => set({ offlineReport: null }),
    toggleMute: () => set((s) => ({ muted: !s.muted })),

    tick: (dtSeconds) => {
      const s = get();
      const m = mods();
      const now = Date.now();
      const ev = currentEvent(now);
      const ad = adMultOf(s, now);
      // Passive = creatures only. The robot hand auto-clicks on the side, each
      // auto-tap worth a manual tap's goo (event/ad multipliers apply like taps).
      const passive = gooPerSec(s.characters, m) * ev.incomeMult;
      const robot = clickPower(m) * autoClicksPerSec(s.upgrades.autoTap) * ev.clickMult;
      const gain = (passive + robot) * ad * dtSeconds;
      if (gain <= 0) return;
      set({ goo: s.goo + gain, lifetimeGoo: s.lifetimeGoo + gain });
    },

    setAchievementsOpen: (open) => set({ achievementsOpen: open }),

    setStatsOpen: (open) => set({ statsOpen: open }),

    setInfoOpen: (open) => set({ infoOpen: open }),

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

    setNicknameOpen: (open) => set({ nicknameOpen: open }),

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
      // "New game" also means a new player: drop the saved nickname + recovery
      // code so the welcome prompt reappears and a fresh name/entry is created.
      resetPlayerIdentity();
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
        equippedMain: fresh.equippedMain,
        milestonesShown: [],
        rng: fresh.rng,
        hatchResult: null,
        multiHatchResult: null,
        offlineReport: null,
        frenzyUntil: 0,
        achievementsOpen: false,
        statsOpen: false,
        leaderboardOpen: false,
        activeTab: 'click',
        nicknameOpen: shouldPromptNickname(),
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
    markMilestonesShown: (goos) =>
      set((s) => ({ milestonesShown: [...new Set([...s.milestonesShown, ...goos])] })),
    dismissMilestone: () => set({ milestone: null }),
    pulseMagnitude: (exp) => set((s) => ({ magnitudePulse: s.magnitudePulse + 1, magnitudeExp: exp })),

    // Call once on app start (see App.tsx). The cache read is synchronous, so
    // a returning player is treated as signed in before any network round
    // trip — this is what keeps the game playable offline even with
    // AUTH_REQUIRED on. /auth/me then reconciles in the background: it only
    // ever downgrades a stale cached user on a DEFINITIVE 401 (see
    // net/auth.ts), never on a network hiccup.
    initAuth: () => {
      const cached = cachedUser();
      if (cached) set({ authUser: cached, authChecked: true });
      void fetchMe().then((user) => set({ authUser: user, authChecked: true }));
    },
    setAuthUser: (user) => set({ authUser: user, authChecked: true }),
    clearAuthUser: () => set({ authUser: null }),

    // Sign out. Deliberately does NOT touch the local game save — in this PR
    // progress belongs to the device, not the account, so a signed-out player
    // keeps playing with the exact same blob/goo/creatures they had. Only
    // identity is cleared. If AUTH_REQUIRED is on, clearing authUser here is
    // what sends the player back to the gate (see App.tsx).
    signOut: () => {
      set({ authUser: null });
      void logout();
    },
  };
});

// Dev-only handle for tuning/manual testing in the console (stripped in prod).
// `typeof window` guard so this module can be imported under vitest (node),
// where there is no window — see store.cloud.test.ts.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __game?: typeof useGame }).__game = useGame;
}

// --- Cloud-save checkpoint sync (PR 4) --------------------------------------
// Wired at module scope, not inside a React hook: the hook that owns the
// game's other browser wiring (persistence interval, visibilitychange,
// beforeunload — see ui/useGameEngine.ts) is out of this PR's file scope.
// These are singletons for the tab's whole lifetime, same as the dev-only
// window handle just above.
let cloudDirty = false;
let lastCloudPushAt = 0;
let pushInFlight = false;

/**
 * Push the current save at the last-known cloudRev. Best-effort and silent —
 * a failure just leaves cloudDirty set so the next checkpoint retries it.
 * NEVER surfaced to the player: a "sync failed" toast would alarm a kid over
 * something that isn't theirs to fix (see CLAUDE.md — ads/errors must stay
 * calm and opt-in, not intrusive).
 *
 * On a 409 (another device/tab wrote since our baseRev), re-runs the SAME
 * merge rule used at load time against the returned cloud save:
 *  - this device still ahead (or tied) → retry the push ONCE with the fresh
 *    rev. Never loop past that single retry — a second conflict just stays
 *    dirty for the next checkpoint.
 *  - the other device pulled ahead → pushing now would overwrite ITS lead,
 *    so we don't, and we deliberately DON'T advance cloudRev either. Holding
 *    the stale rev is what makes that stick: every later checkpoint 409s
 *    again and re-asks this same question, instead of quietly succeeding
 *    with a fresh baseRev and clobbering the other device a minute later.
 *    It also self-heals — once this device's own play overtakes the cloud's
 *    lifetimeGoo, the merge says 'local', the retry fires, and it wins the
 *    push honestly. Full reconciliation (with a local backup) happens at the
 *    next loadGame. Rewinding live gameplay mid-session would be far more
 *    alarming to a kid than a save that's briefly a beat behind.
 */
export async function pushCheckpoint(): Promise<void> {
  const s = useGame.getState();
  if (!s.loaded || pushInFlight) return;
  pushInFlight = true;
  try {
    const now = Date.now();
    const save = snapshot(s, now);
    let result = await pushCloudSave(s.cloudRev, save);

    if (!result.ok && result.conflict) {
      const conflict = result.conflict;
      const cloudSave = conflict.save != null ? migrate(conflict.save, now) : null;
      const decision = decideMergeWinner(save, cloudSave ? { rev: conflict.rev, save: cloudSave } : null);
      if (decision.winner !== 'local') {
        // NOTE: cloudRev is left stale on purpose — see the doc comment.
        useGame.setState({ cloudSynced: false });
        return;
      }
      result = await pushCloudSave(conflict.rev, save);
    }

    if (result.ok) {
      cloudDirty = false;
      useGame.setState({ cloudRev: result.rev, cloudSynced: true });
    } else {
      useGame.setState({ cloudSynced: false });
    }
  } finally {
    pushInFlight = false;
    lastCloudPushAt = Date.now();
  }
}

// Guard every browser API below: this module is imported by tests (and could
// in principle run during SSR/build) where `window`/`document` don't exist.
if (typeof document !== 'undefined') {
  // Any state change at all means "there may be something new to push".
  //
  // Deliberately NOT a field-by-field comparison against the persisted set:
  // that list would be a fourth place to remember when adding a save field
  // (alongside snapshot, defaultSaveState and migrate), and forgetting it
  // would fail silently. It would also buy nothing — goo changes on every
  // animation frame while creatures are earning, so the flag is on
  // continuously during play regardless. The real throttle is the 60s
  // checkpoint below, not this flag's precision.
  useGame.subscribe((state) => {
    if (state.loaded) cloudDirty = true;
  });

  // The debounced checkpoint: at most once per CLOUD_PUSH_MIN_INTERVAL_MS,
  // and only when there's actually something dirty to send.
  setInterval(() => {
    if (!cloudDirty) return;
    if (Date.now() - lastCloudPushAt < CLOUD_PUSH_MIN_INTERVAL_MS) return;
    void pushCheckpoint();
  }, 10_000);

  // The checkpoint that actually catches a kid closing the tab: push
  // unconditionally (not gated on cloudDirty) the moment the page is hidden
  // or torn down, so nothing from the last few seconds of play is lost.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void pushCheckpoint();
  });
  window.addEventListener('pagehide', () => void pushCheckpoint());
}

// The ability granted by the equipped main creature (only if it's owned).
export const selectActiveAbility = (s: GameState): Ability | null => {
  const id = s.equippedMain;
  if (!id || !s.characters[id]) return null;
  return abilityOf(id, charactersById[id].rarity);
};

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
  // The equipped main creature's ability (tap/income/crit/luck fold into the
  // modifiers here; combo/bonus are applied where those mechanics live).
  const ab = selectActiveAbility(s);
  if (ab) {
    if (ab.type === 'tap') m.clickMultiplier *= 1 + ab.value;
    else if (ab.type === 'income') m.incomeMultiplier *= 1 + ab.value;
    else if (ab.type === 'crit') m.critChance = Math.min(critChanceCap, m.critChance + ab.value);
    else if (ab.type === 'luck') m.luck = Math.min(luckCap, m.luck + ab.value);
  }
  return m;
};
export const selectMods = (s: GameState): Modifiers => modsOf(s);

/** The rewarded-bonus multiplier active right now (adRewardMult while live, else 1). */
const adMultOf = (s: GameState, now: number): number => (now < s.adRewardUntil ? adRewardMult : 1);

/** UI state for the rewarded-bonus button: is a boost live, is the button ready. */
export const selectAdBonus = (s: GameState) => {
  const now = Date.now();
  return {
    active: now < s.adRewardUntil,
    rewardUntil: s.adRewardUntil,
    ready: now >= s.adCooldownUntil,
    cooldownUntil: s.adCooldownUntil,
    mult: adRewardMult,
  };
};

// Display selectors fold in the active event's multipliers so the numbers the
// player sees (rate, tap power, egg price) match what they actually get.
export const selectGooPerSec = (s: GameState) =>
  gooPerSec(s.characters, modsOf(s)) * currentEvent(Date.now()).incomeMult * adMultOf(s, Date.now());
/** The active permanent income bonus (star) as a fraction, e.g. 0.2 = +20%. */
export const selectStarBonus = (s: GameState) => starBonusFor(s.achievements);
export const selectEggCost = (s: GameState) =>
  Math.max(1, Math.round(eggCost(s.totalHatches + s.eggs) * currentEvent(Date.now()).eggCostMult));
export const selectClickPower = (s: GameState) =>
  clickPower(modsOf(s)) * currentEvent(Date.now()).clickMult * adMultOf(s, Date.now());
/** The combo melody (note frequencies) of the equipped sound pack. */
export const selectComboMelody = (s: GameState) => soundById(s.equippedSound).melody;
export const selectUpgradeCost = (id: UpgradeId) => (s: GameState) => upgradeCost(id, s.upgrades[id]);
export const selectAchContext = (s: GameState): AchievementContext => achContextOf(s);
/** Ids of achievements finished but not yet claimed — the "ready to collect" set. */
export const selectClaimableIds = (s: GameState): Set<string> =>
  new Set(newlyCompleted(new Set(s.achievements), achContextOf(s)).map((a) => a.id));
