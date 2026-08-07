// The single app store (Zustand). Holds the persistent SaveState fields plus
// transient UI/session state, and wires the pure game logic to React. All
// numeric rules come from src/game/* — nothing is computed inline here.

import { create } from 'zustand';
import {
  adEggCooldownMs,
  adRewardCooldownMs,
  adRewardDurationMs,
  adRewardMult,
  bonusClickEquivalent,
  bonusIncomeSeconds,
  bonusMinGoo,
  critChanceCap,
  critMultiplier,
  dailyGiftDay7Eggs,
  eggBuyMaxPerPress,
  achievementRewardSeconds,
  evolveLevels,
  frenzyDurationMs,
  frenzyMultiplier,
  secondAbilityRebirth,
  luckCap,
  minCharLevel,
  openAllCap,
  maxEvolution,
  rebirthCap,
  upgradeAllCooldownMs,
} from './game/balance';
import {
  achievements as achievementDefs,
  isComplete,
  newlyCompleted,
  starBonusFor,
  type AchievementContext,
} from './game/achievements';
import { abilityForType, abilityOf, type Ability, type AbilityType } from './game/abilities';
import { charactersById, incomeMultById, unlockCreatures } from './game/characters';
import {
  DEFAULT_ACCESSORY,
  DEFAULT_BACKGROUND,
  DEFAULT_BLOB,
  DEFAULT_SOUND,
  backgroundIncomeBonus,
  clickCosmeticBonus,
  cosmeticsById,
  meetsClickRequirement,
  soundById,
  type CosmeticKind,
} from './game/cosmetics';
import {
  affordableCreatureLevels,
  autoClicksPerSec,
  autoTapMaxLevel,
  critMaxLevel,
  luckMaxLevel,
  effectiveClickPower,
  creatureLevelCost,
  eggCost,
  evolveCost,
  gooPerSec,
  levelUpToCost,
  modifiersFrom,
  rebirthCost,
  rebirthGlobalMult,
} from './game/economy';
import { formatGoo } from './game/format';
import { currentEvent } from './game/events';
import { buyableEggs, hatch, openEggs, type BatchResult, type HatchOutcome } from './game/hatching';
import { type Milestone } from './game/milestones';
import { computeOffline, type OfflineReport } from './game/offline';
import { cpmWindowMs, maxCpm, recordManualTap } from './game/cpm';
import {
  bumpQuest,
  claimGift,
  mergeDailyClaims,
  giftClaimable,
  giftRewardFor,
  nextGiftDay,
  questAllBonus,
  questComplete,
  questReward,
  questStateFor,
  questsForDay,
  type DailyQuestState,
  type QuestId,
} from './game/daily';
import { createRng } from './game/rng';
import { CURRENT_VERSION, defaultSaveState, migrate } from './game/save';
import { upgradeCost } from './game/upgrades';
import { cachedUser, fetchMe, logout, type AuthUser } from './net/auth';
import { resetPlayerIdentity, shouldPromptNickname } from './net/leaderboard';
import { reportAdEvent } from './net/ads';
import { decideMergeWinner, fetchCloudSave, pushCloudSave } from './net/save';
import { backupLocal, loadBackup, loadRaw, persist } from './persistence';
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

// The three tabs inside the "My Progress" panel (ProgressOverlay).
export type ProgressTab = 'stats' | 'achievements' | 'leaderboard';

export type ConfettiKind = 'confetti' | 'stars' | 'rainbow';
// Speed-test runtime phases: off (idle) → countdown (3·2·1·GO) → running (the
// minute is counting down) → result (the outcome screen).
export type SpeedPhase = 'off' | 'countdown' | 'running' | 'result';
/** Length of the pre-test 3·2·1·GO countdown. */
export const speedCountdownMs = 3000;
export interface SpeedResult {
  taps: number;
  isRecord: boolean;
  reward: number;
}
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
  bestCpm: number; // record MANUAL taps in a rolling minute (see game/cpm.ts)
  upgrades: Upgrades;
  characters: OwnedCharacters;
  eggs: number;
  totalHatches: number;
  lifetimeHatches: number;
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
  // v14 daily loop (see game/daily.ts) — persisted, mirrors SaveState.
  lastGiftDay: number;
  giftStreak: number;
  questDay: number;
  questProgress: Partial<Record<QuestId, number>>;
  questsClaimed: QuestId[];
  questAllClaimed: boolean;
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
  // only ("did the last push succeed"), see SettingsOverlay's AccountSection.
  cloudRev: number;
  cloudSynced: boolean;

  // --- displaced-save recovery (PR 4 safety net, surfaced in PR 5) ---
  // When a cloud save outranks this device's, the local one is stashed rather
  // than dropped (see loadGame). This is what makes that stash reachable: a
  // stash nobody can restore is not a safety net, it's a comforting comment.
  // null = nothing stashed. Transient — recomputed from IndexedDB on load.
  // `goo` (held) is tracked alongside lifetime so the recovery banner can tell a
  // MEANINGFUL stash from a no-op: a prestige-undo snapshot has the same
  // lifetimeGoo as now (prestige never resets lifetime) but far more held goo,
  // while a stale loser-stash from an old cloud merge matches on both — and must
  // stay hidden (it only looked confusing: "restore 180Qa" over your 180Qa).
  backupAvailable: { lifetimeGoo: number; goo: number; savedAt: number } | null;

  // --- transient UI / session ---
  loaded: boolean;
  activeTab: Tab;
  nicknameOpen: boolean; // the first-launch / new-game "pick a nickname" prompt
  hatchResult: HatchOutcome | null;
  multiHatchResult: BatchResult | null;
  offlineReport: OfflineReport | null;
  frenzyUntil: number; // epoch ms; a click frenzy is active until then
  // Manual-tap timestamps inside the last minute (transient — never saved);
  // feeds the bestCpm record via game/cpm.ts.
  tapTimes: number[];
  // Rewarded "watch to boost" mechanic. PERSISTED (v18): a live boost / cooldown
  // must survive a refresh, so both are in snapshot/defaultSaveState/migrate.
  adRewardUntil: number; // epoch ms; a ×N boost to taps AND income is live until then
  adCooldownUntil: number; // epoch ms; the bonus button recharges after this
  adEggReadyAt: number; // epoch ms; free-egg ad recharge — PERSISTED (v15): a refresh must not reset it
  prestigeCrystals: number; // v16 — persisted; the mechanic itself lands with the prestige UI
  prestigeCount: number;
  adOverlayOpen: boolean; // the placeholder ad is currently playing
  adPurpose: 'boost' | 'offline' | 'egg' | null; // what the current ad rewards on finish
  offlineDoubled: boolean; // guard: the returning-bonus can be doubled only once
  toasts: Toast[];
  dailyOpen: boolean; // the daily gift + quests panel
  settingsOpen: boolean; // account, sound, help links, start-over — see SettingsOverlay
  progressOpen: boolean; // one panel, three tabs — see ProgressOverlay
  progressTab: ProgressTab;
  infoOpen: boolean; // the "what am I earning, and what does each icon mean" panel
  numberLegendOpen: boolean;
  confettiBursts: number; // increments to trigger a celebration
  confettiKind: ConfettiKind;
  unlockReveal: CharId | null; // a click-unlocked creature currently being celebrated
  milestone: Milestone | null; // a big number milestone currently being celebrated
  magnitudePulse: number; // increments each time goo crosses an order of magnitude
  magnitudeExp: number; // the exponent (10^exp) of the latest order-of-magnitude crossing
  // "Upgrade all" pacing (session-only, never persisted): the button is locked
  // until this epoch-ms. There is NO service fee — a press just spends goo on the
  // cheapest available levels, then a short cooldown keeps it from being spammed.
  upgradeAllReadyAt: number;

  // Speed-test runtime (session-only, never persisted). Drives the countdown
  // ring around the blob, the focus overlay and the result screen. The record
  // itself lives in the persisted `bestCpm`; these are pure transient UI.
  speedPhase: SpeedPhase;
  speedTaps: number;
  speedEndsAt: number; // epoch ms the running minute ends (0 unless running)
  speedResult: SpeedResult | null;

  // --- actions ---
  loadGame: () => Promise<void>;
  saveGame: () => Promise<void>;
  setTab: (tab: Tab) => void;
  click: () => { gain: number; frenzy: boolean; crit: boolean };
  /**
   * Finish a fixed-minute speed test. Folds the count into bestCpm (clamped to
   * the physical ceiling) and, on a NEW record, pays an income-scaled goo bonus
   * and lights a short frenzy. Returns what happened so the UI can celebrate.
   */
  finishSpeedTest: (taps: number) => { isRecord: boolean; reward: number };
  /** Start the speed test's 3·2·1·GO countdown. */
  armSpeed: () => void;
  /** Countdown → running: the minute proper begins (called at GO). */
  beginSpeedTest: () => void;
  /** Leave the speed test entirely (from any phase). */
  cancelSpeed: () => void;
  /** Feed manual taps in — only accrues while 'running'. */
  registerSpeedTaps: (delta: number) => void;
  /** End the running minute: fold the count into bestCpm and show the result screen. */
  finalizeSpeed: () => void;
  buyUpgrade: (id: UpgradeId) => void;
  buyEgg: () => void;
  buyEggsMax: () => void;
  openEgg: () => void;
  openAllEggs: () => void;
  evolveCreature: (id: CharId) => void;
  evolveWithLevelUp: (id: CharId) => void;
  rebirthCreature: (id: CharId) => void;
  /** Choose/replace a creature's SECOND ability (unlocked at rebirth 10; type != native). */
  setSecondAbility: (id: CharId, type: AbilityType) => void;
  levelUpCreature: (id: CharId) => void;
  levelUpCreatureMax: (id: CharId) => void;
  upgradeAllCreatures: () => void;
  buyCosmetic: (id: string) => void;
  equipCosmetic: (id: string) => void;
  setEquippedMain: (id: CharId | null) => void;
  collectBonus: () => number;
  startAdBonus: () => void;
  watchAdForOffline: () => void;
  watchAdForEgg: () => void;
  finishAd: () => void;
  cancelAd: () => void;
  applyAwayEarnings: (seconds: number) => OfflineReport | null;
  grantGoo: (amount: number) => void;
  dismissMultiHatch: () => void;
  dismissHatch: () => void;
  dismissOffline: () => void;
  toggleMute: () => void;
  tick: (dtSeconds: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setProgressOpen: (open: boolean, tab?: ProgressTab) => void;
  setProgressTab: (tab: ProgressTab) => void;
  setInfoOpen: (open: boolean) => void;
  setNumberLegendOpen: (open: boolean) => void;
  setDailyOpen: (open: boolean) => void;
  claimDailyGift: () => void;
  claimQuest: (id: QuestId) => void;
  claimAchievement: (id: string) => void;
  claimAllAchievements: () => void;
  setNicknameOpen: (open: boolean) => void;
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
  restoreBackup: () => Promise<void>;
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
// The same idea applied to the exit path (visibilitychange/pagehide), which
// had no throttle at all. Hiding the page is not a rare event on a phone: every
// app switch, every screen lock, every notification pull-down fires it, and each
// one was sending a full PUT /save — three D1 operations apiece. A child
// flipping between apps could put the whole project through its free-tier
// write budget on their own.
//
// Skipping one costs nothing real. The LOCAL save is authoritative and is
// written independently (see useGameEngine); the cloud copy is a mirror, so a
// suppressed push only means the mirror is up to 20s stale, and the next
// checkpoint closes that. The only scenario that loses anything is the device
// dying inside that window, which also loses the same 20s locally.
const CLOUD_EXIT_PUSH_MIN_INTERVAL_MS = 20_000;

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
  lifetimeHatches: number;
  clicks: number;
  bonusesCollected: number;
}): AchievementContext {
  return {
    collectionCount: Object.keys(s.characters).length,
    shinyCount: Object.values(s.characters).filter((c) => (c?.evolution ?? 0) > 0).length,
    maxEvolvedCount: Object.values(s.characters).filter((c) => (c?.evolution ?? 0) >= maxEvolution).length,
    lifetimeGoo: s.lifetimeGoo,
    // The hatch ladder reads LIFETIME hatches, not totalHatches — the latter
    // resets on prestige (egg price curve), and an achievement must never
    // rewind, exactly as the prestige dialog promises the player.
    totalHatches: s.lifetimeHatches,
    clicks: s.clicks,
    bonusesCollected: s.bonusesCollected,
  };
}

/** A star fraction as Hebrew-ready percent text — keeps the half tier honest ("1.5%", not "2%"). */
function starPctHe(star: number): string {
  return `${(star * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

/** The daily-quest slice of the store, in the shape game/daily.ts speaks. */
function questStateOf(s: {
  questDay: number;
  questProgress: Partial<Record<QuestId, number>>;
  questsClaimed: QuestId[];
  questAllClaimed: boolean;
}): DailyQuestState {
  return {
    questDay: s.questDay,
    questProgress: s.questProgress,
    questsClaimed: s.questsClaimed,
    questAllClaimed: s.questAllClaimed,
  };
}

function snapshot(s: GameState, now: number): SaveState {
  return {
    version: CURRENT_VERSION,
    goo: s.goo,
    lifetimeGoo: s.lifetimeGoo,
    bestCpm: s.bestCpm,
    upgrades: s.upgrades,
    characters: s.characters,
    eggs: s.eggs,
    totalHatches: s.totalHatches,
    lifetimeHatches: s.lifetimeHatches,
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
    lastGiftDay: s.lastGiftDay,
    giftStreak: s.giftStreak,
    questDay: s.questDay,
    questProgress: s.questProgress,
    questsClaimed: s.questsClaimed,
    questAllClaimed: s.questAllClaimed,
    adEggReadyAt: s.adEggReadyAt,
    adRewardUntil: s.adRewardUntil,
    adCooldownUntil: s.adCooldownUntil,
    prestigeCrystals: s.prestigeCrystals,
    prestigeCount: s.prestigeCount,
    lastSeen: now,
    muted: s.muted,
    rng: s.rng,
  };
}

/**
 * Goo a grind achievement actually pays: the larger of its fixed grant and a
 * fixed number of seconds of the player's CURRENT income. Keeps a badge worth
 * claiming deep into the game (a fixed 600 goo is nothing once you earn
 * millions/sec). Star ladders grant a permanent %, never goo, so they pay 0
 * here. Same income-scaled shape the daily gift uses.
 */
function achievementGooReward(def: { gooReward: number }, income: number): number {
  if (def.gooReward <= 0) return 0;
  const scaled = Math.round(Math.max(0, income) * achievementRewardSeconds);
  return Math.max(def.gooReward, Number.isFinite(scaled) ? scaled : 0);
}

export const useGame = create<GameState>((set, get) => {
  const mods = (): Modifiers => modsOf(get());
  // Modifiers + wealth reference for pricing — exclude the active-creature
  // ability so displaying a creature never changes what its upgrades cost.
  const costMods = (): Modifiers => baseModsOf(get());

  return {
    goo: 0,
    lifetimeGoo: 0,
    bestCpm: 0,
    tapTimes: [],
    upgrades: { finger: 0, power: 0, autoTap: 0, nurture: 0, crit: 0, luck: 0 },
    characters: {},
    eggs: 0,
    totalHatches: 0,
    lifetimeHatches: 0,
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
    lastGiftDay: 0,
    giftStreak: 0,
    questDay: 0,
    questProgress: {},
    questsClaimed: [],
    questAllClaimed: false,
    muted: false,
    rng: { seed: 0, cursor: 0 }, // placeholder — loadGame() overwrites with the saved stream

    authUser: null,
    authChecked: false,
    cloudRev: 0,
    cloudSynced: false,
    backupAvailable: null,

    loaded: false,
    activeTab: 'click',
    nicknameOpen: false,
    hatchResult: null,
    multiHatchResult: null,
    offlineReport: null,
    frenzyUntil: 0,
    adRewardUntil: 0,
    adCooldownUntil: 0,
    adEggReadyAt: 0,
    prestigeCrystals: 0,
    prestigeCount: 0,
    adOverlayOpen: false,
    adPurpose: null,
    offlineDoubled: false,
    toasts: [],
    dailyOpen: false,
    settingsOpen: false,
    progressOpen: false,
    progressTab: 'stats',
    infoOpen: false,
    numberLegendOpen: false,
    confettiBursts: 0,
    confettiKind: 'confetti',
    unlockReveal: null,
    milestone: null,
    magnitudePulse: 0,
    magnitudeExp: 0,
    upgradeAllReadyAt: 0,
    speedPhase: 'off',
    speedTaps: 0,
    speedEndsAt: 0,
    speedResult: null,

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

      // Local outranking an EXISTING cloud row means this device is adopting
      // bigger progress it earned elsewhere (another device, or before sign-in).
      // The seed push below carries that as one huge lifetimeGoo jump; mark it so
      // the audit annotates it (merge-claimed) instead of benching an honest
      // multi-device player. A fresh account with no cloud row yet (winner
      // 'local', cloudSave null) is a normal first save and needs no mark.
      pendingMerge = decision.winner === 'local' && cloudSave != null;

      if (decision.winner === 'cloud' && localSave) {
        // The cloud outranks what's on this device (higher lifetimeGoo) —
        // stash the local save under a separate key BEFORE it's replaced, so
        // a wrong call here is recoverable, not destructive. See CLAUDE.md:
        // "never drop a player's progress".
        await backupLocal(localSave);
      }

      const save =
        decision.winner === 'cloud' ? cloudSave! : decision.winner === 'local' ? localSave! : defaultSaveState(now);

      // Whichever copy won, the daily-claim state takes the MOST-CLAIMED of
      // the two — a cloud copy written by an older deploy (or simply staler)
      // must never hand today's gift and quests back out (see
      // mergeDailyClaims in game/daily.ts for the exploit this closes).
      if (localSave && cloudSave) {
        Object.assign(save, mergeDailyClaims(localSave, cloudSave));
        // Same monotonic logic for the ad-egg cooldown: the LATER recharge
        // time wins, so neither a refresh nor a stale cloud copy re-arms it.
        save.adEggReadyAt = Math.max(localSave.adEggReadyAt, cloudSave.adEggReadyAt);
        save.adCooldownUntil = Math.max(localSave.adCooldownUntil, cloudSave.adCooldownUntil);
        save.prestigeCrystals = Math.max(localSave.prestigeCrystals, cloudSave.prestigeCrystals);
        save.prestigeCount = Math.max(localSave.prestigeCount, cloudSave.prestigeCount);
      }

      const m = modifiersFrom(
        save.upgrades,
        starBonusFor(save.achievements),
        clickCosmeticBonus(save.equippedBlob, save.equippedAccessory),
        backgroundIncomeBonus(save.equippedBackground),
        save.prestigeCrystals,
      );
      const secondsAway = Math.max(0, (now - save.lastSeen) / 1000);
      // Offline earns creature income PLUS the robot hand's auto-clicks.
      const offlinePassive = gooPerSec(save.characters, m);
      const offlineRate =
        offlinePassive + effectiveClickPower(m, offlinePassive) * autoClicksPerSec(save.upgrades.autoTap);
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
        bestCpm: save.bestCpm,
        upgrades: save.upgrades,
        characters,
        eggs: save.eggs,
        totalHatches: save.totalHatches,
        lifetimeHatches: save.lifetimeHatches,
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
        lastGiftDay: save.lastGiftDay,
        giftStreak: save.giftStreak,
        questDay: save.questDay,
        questProgress: save.questProgress,
        questsClaimed: save.questsClaimed,
        questAllClaimed: save.questAllClaimed,
        adEggReadyAt: save.adEggReadyAt,
        adRewardUntil: save.adRewardUntil,
        adCooldownUntil: save.adCooldownUntil,
        prestigeCrystals: save.prestigeCrystals,
        prestigeCount: save.prestigeCount,
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

      // Surface any stashed save from a previous cloud merge, so the player
      // (or a parent) can get it back. Done after `set` and without awaiting
      // so it never delays first paint — the banner just appears a moment
      // later if there is something to offer.
      void loadBackup().then((raw) => {
        if (!raw) return;
        const stashed = migrate(raw, Date.now());
        const cur = get();
        // Only surface a stash worth restoring: more lifetime progress, or (the
        // prestige-undo case, where lifetime is unchanged) more held goo. A
        // stash that beats the current save in neither is a stale no-op — hide
        // it, so nobody is offered a "restore" that changes nothing.
        if (stashed.lifetimeGoo <= cur.lifetimeGoo && stashed.goo <= cur.goo) return;
        set({ backupAvailable: { lifetimeGoo: stashed.lifetimeGoo, goo: stashed.goo, savedAt: stashed.lastSeen } });
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
      let gain = effectiveClickPower(m, gooPerSec(s.characters, m));
      if (crit) gain *= critMultiplier;
      if (frenzy) gain *= frenzyMultiplier;
      gain *= currentEvent(Date.now()).clickMult;
      gain *= adMultOf(s, Date.now());
      // The taps-per-minute record counts MANUAL taps only — this action is
      // the one place a finger reaches the store (robot taps accrue in tick).
      const tapped = recordManualTap(s.tapTimes, Date.now());
      let quests = bumpQuest(questStateOf(s), 'taps', 1, Date.now());
      if (crit) quests = bumpQuest(quests, 'crits', 1, Date.now());
      set({
        goo: s.goo + gain,
        lifetimeGoo: s.lifetimeGoo + gain,
        clicks: s.clicks + 1,
        tapTimes: tapped.recent,
        bestCpm: Math.max(s.bestCpm, tapped.cpm),
        ...quests,
        rng: rng.state(),
      });
      return { gain, frenzy, crit };
    },

    // The fixed-minute speed test (⚡ board). Its measured tap count feeds the
    // SAME bestCpm record the rolling window does — clamped to the physical
    // ceiling so an over-count can't reach the board. A NEW record pays an
    // income-scaled goo bonus (with a floor) and lights a short frenzy, so the
    // challenge is worth doing, not just a number. A non-record pays nothing
    // extra — the per-tap goo you earned during the minute is the reward — so
    // repeating minutes can't farm a passive bonus. The bonus is a one-off far
    // inside the plausibility ceiling (which assumes a permanent frenzy anyway).
    finishSpeedTest: (taps) => {
      const s = get();
      const capped = Math.min(Math.max(0, Math.floor(taps)), maxCpm);
      const isRecord = capped > s.bestCpm;
      if (!isRecord) return { isRecord: false, reward: 0 };
      const perSec = gooPerSec(s.characters, mods());
      const reward = Math.max(100, Math.round(perSec * 45)); // ~45s of income, floored
      set({
        bestCpm: capped,
        goo: s.goo + reward,
        lifetimeGoo: s.lifetimeGoo + reward,
        frenzyUntil: Date.now() + frenzyDurationMs,
      });
      return { isRecord: true, reward };
    },

    // Pressing the chip starts a 3·2·1·GO countdown (speedEndsAt doubles as the
    // countdown target while phase is 'countdown'); at GO the controller calls
    // beginSpeedTest and the minute proper begins.
    armSpeed: () => set({ speedPhase: 'countdown', speedTaps: 0, speedEndsAt: Date.now() + speedCountdownMs, speedResult: null }),
    beginSpeedTest: () => {
      const s = get();
      if (s.speedPhase !== 'countdown') return;
      set({ speedPhase: 'running', speedEndsAt: Date.now() + cpmWindowMs, speedTaps: 0 });
    },
    cancelSpeed: () => set({ speedPhase: 'off', speedTaps: 0, speedEndsAt: 0, speedResult: null }),
    registerSpeedTaps: (delta) => {
      if (delta <= 0) return;
      const s = get();
      if (s.speedPhase === 'running') set({ speedTaps: s.speedTaps + delta });
    },
    finalizeSpeed: () => {
      const s = get();
      if (s.speedPhase !== 'running') return;
      const taps = s.speedTaps;
      const { isRecord, reward } = get().finishSpeedTest(taps);
      set({ speedPhase: 'result', speedEndsAt: 0, speedResult: { taps, isRecord, reward } });
    },

    buyUpgrade: (id) => {
      const s = get();
      // Capped upgrades refuse dead levels past their max, so the shop never
      // takes goo for an effect that has stopped moving (the caps themselves
      // stay, protecting the audit ceiling from edited saves).
      if (id === 'autoTap' && s.upgrades.autoTap >= autoTapMaxLevel) return;
      if (id === 'crit' && s.upgrades.crit >= critMaxLevel) return;
      if (id === 'luck' && s.upgrades.luck >= luckMaxLevel) return;
      const cost = upgradeCost(id, s.upgrades[id]);
      if (s.goo < cost) return;
      set({
        goo: s.goo - cost,
        upgrades: { ...s.upgrades, [id]: s.upgrades[id] + 1 },
        ...bumpQuest(questStateOf(s), 'upgrades', 1, Date.now()),
      });
    },

    // Buy ONE egg into inventory. The price climbs with every egg ever acquired
    // (opened + still held), so it keeps rising however you pace your opening.
    buyEgg: () => {
      const s = get();
      const priced = eggPricer(currentEvent(Date.now()).eggCostMult);
      const cost = priced(s.totalHatches + s.eggs);
      if (s.goo < cost) return;
      set({ goo: s.goo - cost, eggs: s.eggs + 1, ...bumpQuest(questStateOf(s), 'eggs', 1, Date.now()) });
    },

    // Buy as many eggs as you can afford right now (capped), at escalating price.
    buyEggsMax: () => {
      const s = get();
      const priced = eggPricer(currentEvent(Date.now()).eggCostMult);
      const { count, spent } = buyableEggs(s.goo, s.totalHatches + s.eggs, eggBuyMaxPerPress, priced);
      if (count === 0) return;
      set({ goo: s.goo - spent, eggs: s.eggs + count, ...bumpQuest(questStateOf(s), 'eggs', count, Date.now()) });
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
        ...bumpQuest(questStateOf(s), 'hatches', 1, Date.now()),
        eggs: s.eggs - 1,
        lifetimeGoo: s.lifetimeGoo + outcome.gooReward,
        characters,
        totalHatches: outcome.nextTotalHatches,
        lifetimeHatches: s.lifetimeHatches + 1,
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
        ...bumpQuest(questStateOf(s), 'hatches', result.count, Date.now()),
        eggs: s.eggs - result.count,
        lifetimeGoo: s.lifetimeGoo + result.gooFromDupes,
        characters: result.owned,
        totalHatches: result.totalHatches,
        lifetimeHatches: s.lifetimeHatches + result.count,
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
      const m = costMods();
      const cost = evolveCost(def.rarity, held, m, gooPerSec(s.characters, m), incomeMultById(id));
      if (s.goo < cost) return;
      set({
        goo: s.goo - cost,
        characters: { ...s.characters, [id]: { ...held, evolution: stage + 1 } },
        ...bumpQuest(questStateOf(s), 'evolve', 1, Date.now()),
      });
      get().pushToast({ text: `${def.nameHe} הִתְפַּתֵּחַ! ✨ (שלב ${stage + 1})`, icon: '✨', tone: 'star' });
      get().triggerConfetti('rainbow');
    },

    // One-press "level up TO the evolution threshold, then evolve" — offered
    // when the creature is below the required level but the player can afford
    // BOTH the missing levels and the evolution. Deducts the whole sum at once.
    // The level costs use the current wealth reference for the whole batch,
    // exactly like levelUpCreatureMax, so the price matches what's shown.
    evolveWithLevelUp: (id) => {
      const s = get();
      const held = s.characters[id];
      if (!held) return;
      const stage = held.evolution ?? 0;
      if (stage >= maxEvolution) return;
      const target = evolveLevels[stage];
      const def = charactersById[id];
      const m = costMods();
      const rate = gooPerSec(s.characters, m);
      const im = incomeMultById(id);
      const levelsCost = levelUpToCost(def.rarity, held, target, m, rate, im);
      const finalLevel = Math.max(held.level, target);
      const evoCost = evolveCost(def.rarity, { ...held, level: finalLevel }, m, rate, im);
      const total = levelsCost + evoCost;
      if (s.goo < total) return;
      const gained = finalLevel - held.level;
      let quests = questStateOf(s);
      if (gained > 0) quests = bumpQuest(quests, 'levels', gained, Date.now());
      quests = bumpQuest(quests, 'evolve', 1, Date.now());
      set({
        goo: s.goo - total,
        characters: { ...s.characters, [id]: { ...held, level: finalLevel, evolution: stage + 1 } },
        ...quests,
      });
      get().pushToast({ text: `${def.nameHe} הִתְפַּתֵּחַ! ✨ (שלב ${stage + 1})`, icon: '✨', tone: 'star' });
      get().triggerConfetti('rainbow');
    },

    // Rebirth a fully-evolved creature (the "mastering" loop): it resets to
    // level 1 / stage 0, and in exchange its ability gains a permanent level and
    // it adds to the GLOBAL income bonus. Costs goo (wealth-scaled, escalating —
    // see rebirthCost) so it can't be spammed. Only offered at max evolution and
    // below the cap, and only when affordable; all re-checked here so a stale UI
    // can't over-rebirth or overspend.
    rebirthCreature: (id) => {
      const s = get();
      const held = s.characters[id];
      if (!held) return;
      const stage = held.evolution ?? 0;
      const reb = held.rebirths ?? 0;
      if (stage < maxEvolution || reb >= rebirthCap) return; // not eligible / already capped
      const cost = rebirthCost(reb, gooPerSec(s.characters, costMods()));
      if (s.goo < cost) return; // can't afford
      const def = charactersById[id];
      set({
        goo: s.goo - cost,
        // Reset level/evolution, but KEEP the earned second ability across rebirths.
        characters: {
          ...s.characters,
          [id]: { level: minCharLevel, rebirths: reb + 1, ...(held.secondAbility ? { secondAbility: held.secondAbility } : {}) },
        },
      });
      get().pushToast({ text: `${def.nameHe} נוֹלַד מֵחָדָשׁ! 🔄 (לֵידָה ${reb + 1})`, icon: '🔄', tone: 'star' });
      get().triggerConfetti('rainbow');
    },

    setSecondAbility: (id, type) => {
      const s = get();
      const held = s.characters[id];
      if (!held || (held.rebirths ?? 0) < secondAbilityRebirth) return; // not unlocked yet
      // Can't pick the creature's own native ability (must diversify).
      if (type === abilityOf(id, charactersById[id].rarity, 0).type) return;
      set({ characters: { ...s.characters, [id]: { ...held, secondAbility: type } } });
    },

    // Level a creature straight up with goo (the collection goo sink).
    levelUpCreature: (id) => {
      const s = get();
      const held = s.characters[id];
      if (!held) return;
      const m = costMods();
      const cost = creatureLevelCost(charactersById[id].rarity, held, m, gooPerSec(s.characters, m), incomeMultById(id));
      if (s.goo < cost) return;
      set({
        goo: s.goo - cost,
        characters: { ...s.characters, [id]: { ...held, level: held.level + 1 } },
        ...bumpQuest(questStateOf(s), 'levels', 1, Date.now()),
      });
    },

    // Pour goo in until the next level is no longer affordable — one tap, many levels.
    levelUpCreatureMax: (id) => {
      const s = get();
      const held = s.characters[id];
      if (!held) return;
      const rarity = charactersById[id].rarity;
      const m = costMods();
      const rate = gooPerSec(s.characters, m);
      const im = incomeMultById(id);
      const n = affordableCreatureLevels(rarity, held, m, s.goo, rate, im);
      if (n <= 0) return;
      let spent = 0;
      for (let i = 0; i < n; i++) spent += creatureLevelCost(rarity, { ...held, level: held.level + i }, m, rate, im);
      set({
        goo: s.goo - spent,
        characters: { ...s.characters, [id]: { ...held, level: held.level + n } },
        ...bumpQuest(questStateOf(s), 'levels', n, Date.now()),
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
      const m = costMods();
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
      set({
        goo,
        characters: chars,
        upgradeAllReadyAt: now + upgradeAllCooldownMs,
        ...bumpQuest(questStateOf(s), 'levels', bought, now),
      });
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
      // Enforced here, not only in the shop UI: this is the rule, and the
      // screen is just one caller of it.
      if (!meetsClickRequirement(c, s.clicks)) return;
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
      const passive = gooPerSec(s.characters, m);
      const rate = passive + effectiveClickPower(m, passive) * autoClicksPerSec(s.upgrades.autoTap);
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
      const bonusAb = selectActiveAbilities(s).find((a) => a.type === 'bonus');
      const bonusMult = bonusAb ? 1 + bonusAb.value : 1;
      const reward = Math.round(
        Math.max(
          Math.round(perSec * bonusIncomeSeconds),
          Math.round(effectiveClickPower(m, gooPerSec(s.characters, m)) * bonusClickEquivalent),
          bonusMinGoo,
        ) * bonusMult,
      );
      set({
        goo: s.goo + reward,
        lifetimeGoo: s.lifetimeGoo + reward,
        bonusesCollected: s.bonusesCollected + 1,
        frenzyUntil: Date.now() + frenzyDurationMs,
        ...bumpQuest(questStateOf(s), 'bonuses', 1, Date.now()),
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
      reportAdEvent('boost', 'shown');
      set({ adOverlayOpen: true, adPurpose: 'boost' });
    },
    watchAdForOffline: () => {
      const s = get();
      if (s.adOverlayOpen || !s.offlineReport || s.offlineDoubled) return;
      reportAdEvent('offline', 'shown');
      set({ adOverlayOpen: true, adPurpose: 'offline' });
    },
    watchAdForEgg: () => {
      const s = get();
      if (s.adOverlayOpen) return;
      if (Date.now() < s.adEggReadyAt) return;
      reportAdEvent('egg', 'shown');
      set({ adOverlayOpen: true, adPurpose: 'egg' });
    },
    finishAd: () => {
      const s = get();
      if (!s.adOverlayOpen) return;
      const now = Date.now();
      if (s.adPurpose) reportAdEvent(s.adPurpose, 'reward');
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
      if (s.adPurpose === 'egg') {
        // The ad egg hatches ON THE SPOT with its own boosted rarity table
        // (owner-set: 5% legendary, 10% rare — see premiumRollRarity). It
        // can't ride the normal inventory: eggs there are fungible, and a
        // stored "where did this egg come from" tag would cost a save-version
        // bump for a distinction only this moment cares about. Instant is
        // also the better show — video ends, egg cracks.
        const rng = createRng(s.rng);
        const outcome = hatch(rng.next, {
          owned: s.characters,
          sinceRare: s.sinceRare,
          totalHatches: s.totalHatches,
          luck: mods().luck,
          premium: true,
        });
        const existing = s.characters[outcome.charId];
        const characters: OwnedCharacters = {
          ...s.characters,
          [outcome.charId]: existing ? { ...existing, level: outcome.level } : { level: outcome.level },
        };
        set({
          ...bumpQuest(questStateOf(s), 'hatches', 1, now),
          adOverlayOpen: false,
          adPurpose: null,
          adEggReadyAt: now + adEggCooldownMs,
          characters,
          totalHatches: outcome.nextTotalHatches,
          lifetimeHatches: s.lifetimeHatches + 1,
          sinceRare: outcome.nextSinceRare,
          hatchResult: outcome,
          rng: rng.state(),
        });
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
    cancelAd: () => {
      const p = get().adPurpose;
      if (p) reportAdEvent(p, 'cancel');
      set({ adOverlayOpen: false, adPurpose: null });
    },

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
      // This runs every animation frame — compute the creature income once.
      const perSec = gooPerSec(s.characters, m);
      const passive = perSec * ev.incomeMult;
      const robot = effectiveClickPower(m, perSec) * autoClicksPerSec(s.upgrades.autoTap) * ev.clickMult;
      const gain = (passive + robot) * ad * dtSeconds;
      if (gain <= 0) return;
      set({ goo: s.goo + gain, lifetimeGoo: s.lifetimeGoo + gain });
    },

    setSettingsOpen: (open) => set({ settingsOpen: open }),

    // `tab` lets a caller open straight onto e.g. achievements (the button does
    // this when something's claimable) without a separate tab-switch call.
    setProgressOpen: (open, tab) => set((s) => ({ progressOpen: open, progressTab: tab ?? s.progressTab })),

    setProgressTab: (tab) => set({ progressTab: tab }),

    setInfoOpen: (open) => set({ infoOpen: open }),

    setNumberLegendOpen: (open) => set({ numberLegendOpen: open }),

    setDailyOpen: (open) => set({ dailyOpen: open }),

    // ── Daily gift + quests (v14 — see game/daily.ts for all semantics) ──

    claimDailyGift: () => {
      const s = get();
      const now = Date.now();
      const gift = { lastGiftDay: s.lastGiftDay, giftStreak: s.giftStreak };
      if (!giftClaimable(gift, now)) return;
      const cycleDay = nextGiftDay(gift, now);
      const reward = giftRewardFor(cycleDay);
      const after = claimGift(gift, now);

      if (reward.kind === 'egg') {
        set({ eggs: s.eggs + dailyGiftDay7Eggs, lastGiftDay: after.lastGiftDay, giftStreak: after.giftStreak });
        get().pushToast({ text: `יוֹם 7 — ${dailyGiftDay7Eggs} בֵּיצִים בְּמַתָּנָה! 🥚`, icon: '🎁', tone: 'star' });
        get().triggerConfetti('rainbow');
      } else {
        const perSec = gooPerSec(s.characters, mods());
        const amount = Math.max(Math.round(perSec * reward.incomeSeconds), reward.minGoo);
        set({
          goo: s.goo + amount,
          lifetimeGoo: s.lifetimeGoo + amount,
          lastGiftDay: after.lastGiftDay,
          giftStreak: after.giftStreak,
        });
        get().pushToast({ text: `מַתָּנָה יוֹמִית — יוֹם ${cycleDay}: +${formatGoo(amount)} גּוּ!`, icon: '🎁', tone: 'goo' });
        get().triggerConfetti('confetti');
      }
    },

    claimQuest: (id) => {
      const s = get();
      const now = Date.now();
      const q = questStateFor(questStateOf(s), now);
      const def = questsForDay(q.questDay).find((d) => d.id === id);
      if (!def) return; // not one of today's quests
      if (q.questsClaimed.includes(id) || !questComplete(q, def)) return;

      const perSec = gooPerSec(s.characters, mods());
      let amount = Math.max(Math.round(perSec * questReward.incomeSeconds), questReward.minGoo);
      const claimed = [...q.questsClaimed, id];

      // Collecting the third quest also pays the finish-all bonus, once.
      const allDone = claimed.length >= questsForDay(q.questDay).length && !q.questAllClaimed;
      if (allDone) {
        amount += Math.max(Math.round(perSec * questAllBonus.incomeSeconds), questAllBonus.minGoo);
      }

      set({
        goo: s.goo + amount,
        lifetimeGoo: s.lifetimeGoo + amount,
        questDay: q.questDay,
        questProgress: q.questProgress,
        questsClaimed: claimed,
        questAllClaimed: q.questAllClaimed || allDone,
      });
      get().pushToast({
        text: allDone ? `כָּל הַמְּשִׂימוֹת הוּשְׁלְמוּ! +${formatGoo(amount)} גּוּ 🌟` : `מְשִׂימָה הוּשְׁלְמָה! +${formatGoo(amount)} גּוּ`,
        icon: def.icon,
        tone: allDone ? 'star' : 'goo',
      });
      if (allDone) get().triggerConfetti('stars');
    },

    // Achievements are collected by hand: the player opens the trophy panel and
    // taps each finished badge to claim its permanent income star + goo grant.
    claimAchievement: (id) => {
      const s = get();
      if (s.achievements.includes(id)) return;
      const def = achievementsById.get(id);
      if (!def || !isComplete(def, achContextOf(s))) return;
      const reward = achievementGooReward(def, gooPerSec(s.characters, mods()));
      set({
        achievements: [...s.achievements, id],
        goo: s.goo + reward,
        lifetimeGoo: s.lifetimeGoo + reward,
      });
      // Star ladders grant a permanent income %; grind ladders grant one-time
      // goo — the toast must name whichever one this badge actually paid.
      get().pushToast({
        text:
          def.starReward > 0
            ? `${def.nameHe} · ‎+${starPctHe(def.starReward)} הכנסה לנצח!`
            : `${def.nameHe} · ‎+${formatGoo(reward)} גּוּ!`,
        icon: def.icon,
        tone: 'star',
      });
    },

    // Convenience: sweep up every badge that's ready right now.
    claimAllAchievements: () => {
      const s = get();
      const ready = newlyCompleted(new Set(s.achievements), achContextOf(s));
      if (ready.length === 0) return;
      const income = gooPerSec(s.characters, mods());
      const grant = ready.reduce((sum, a) => sum + achievementGooReward(a, income), 0);
      const stars = ready.reduce((sum, a) => sum + a.starReward, 0);
      set({
        achievements: [...s.achievements, ...ready.map((a) => a.id)],
        goo: s.goo + grant,
        lifetimeGoo: s.lifetimeGoo + grant,
      });
      const rewards = [
        ...(grant > 0 ? [`‎+${formatGoo(grant)} גּוּ`] : []),
        ...(stars > 0 ? [`‎+${starPctHe(stars)} הכנסה לנצח`] : []),
      ].join(' · ');
      get().pushToast({
        text: `אספת ${ready.length} הישגים! ${rewards} 🏆`,
        icon: '🏆',
        tone: 'star',
      });
    },

    setNicknameOpen: (open) => set({ nicknameOpen: open }),

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
        bestCpm: 0,
        tapTimes: [],
        upgrades: { ...fresh.upgrades },
        characters: {},
        eggs: 0,
        totalHatches: 0,
        lifetimeHatches: 0,
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
        lastGiftDay: 0,
        giftStreak: 0,
        questDay: 0,
        questProgress: {},
        questsClaimed: [],
        questAllClaimed: false,
        adEggReadyAt: 0,
        // Match defaultSaveState: a fresh game must not carry a live ad boost /
        // cooldown from the old run (these are persisted since v18).
        adRewardUntil: 0,
        adCooldownUntil: 0,
        prestigeCrystals: 0,
        prestigeCount: 0,
        dailyOpen: false,
        rng: fresh.rng,
        hatchResult: null,
        multiHatchResult: null,
        offlineReport: null,
        frenzyUntil: 0,
        settingsOpen: false,
        progressOpen: false,
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

    /**
     * Put the stashed save back. This is the escape hatch for the one way the
     * cloud merge can hurt someone: the rule picks by lifetimeGoo, which is
     * monotonic and so almost always right — but a corrupted or edited cloud
     * save carrying an inflated number would win, and overwrite a real one.
     *
     * Deliberately a SWAP, not a one-way restore: the save being replaced is
     * stashed in turn, so pressing this can't itself lose anything and can be
     * pressed again to go back. Never destructive in either direction.
     */
    restoreBackup: async () => {
      const raw = await loadBackup();
      if (!raw) {
        set({ backupAvailable: null });
        return;
      }
      const now = Date.now();
      const restored = migrate(raw, now);
      const current = snapshot(get(), now);
      await backupLocal(current); // the swap — what we're replacing becomes the new stash

      set({
        goo: restored.goo,
        lifetimeGoo: restored.lifetimeGoo,
        bestCpm: restored.bestCpm,
        upgrades: restored.upgrades,
        characters: restored.characters,
        eggs: restored.eggs,
        totalHatches: restored.totalHatches,
        lifetimeHatches: restored.lifetimeHatches,
        sinceRare: restored.sinceRare,
        bonusesCollected: restored.bonusesCollected,
        clicks: restored.clicks,
        leaderboard: restored.leaderboard,
        achievements: restored.achievements,
        ownedCosmetics: restored.ownedCosmetics,
        equippedBlob: restored.equippedBlob,
        equippedBackground: restored.equippedBackground,
        equippedAccessory: restored.equippedAccessory,
        equippedSound: restored.equippedSound,
        equippedMain: restored.equippedMain,
        milestonesShown: restored.milestonesShown,
        lastGiftDay: restored.lastGiftDay,
        giftStreak: restored.giftStreak,
        questDay: restored.questDay,
        questProgress: restored.questProgress,
        questsClaimed: restored.questsClaimed,
        questAllClaimed: restored.questAllClaimed,
        adEggReadyAt: Math.max(get().adEggReadyAt, restored.adEggReadyAt),
        adRewardUntil: restored.adRewardUntil,
        adCooldownUntil: Math.max(get().adCooldownUntil, restored.adCooldownUntil),
        prestigeCrystals: restored.prestigeCrystals,
        prestigeCount: restored.prestigeCount,
        muted: restored.muted,
        rng: restored.rng,
        backupAvailable: { lifetimeGoo: current.lifetimeGoo, goo: current.goo, savedAt: current.lastSeen },
      });
      await persist(restored);
      cloudDirty = true; // the cloud should learn about this at the next checkpoint
      pendingRollback = true;
    },

    // Sign out. Deliberately does NOT touch the local game save — progress
    // belongs to the device, so a signed-out player keeps the same
    // blob/goo/creatures; only identity is cleared. With AUTH_REQUIRED on,
    // clearing authUser is what returns the player to the gate (see App.tsx).
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
// Set by restoreBackup, cleared once the server has been told. A restore is the
// one legitimate way a player's lifetime goo goes DOWN, and that is the audit's
// strongest cheat signal — so without this, pressing a button the game itself
// offers looks identical to editing a save.
let pendingRollback = false;
// Set by loadGame when this device's own save (local) outranks an EXISTING cloud
// row — i.e. it's adopting bigger progress earned on another device / before
// sign-in. That adoption lands as one huge lifetimeGoo jump against a small
// recent row, which the rate audit reads as impossible. This marks the single
// push that carries it so the server annotates (not bars) it. Cleared once the
// server has heard it, exactly like pendingRollback.
let pendingMerge = false;

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
    const rollback = pendingRollback;
    const merge = pendingMerge;
    let result = await pushCloudSave(s.cloudRev, save, { rollback, merge });

    if (!result.ok && result.conflict) {
      const conflict = result.conflict;
      const cloudSave = conflict.save != null ? migrate(conflict.save, now) : null;
      const decision = decideMergeWinner(save, cloudSave ? { rev: conflict.rev, save: cloudSave } : null);
      if (decision.winner !== 'local') {
        // NOTE: cloudRev is left stale on purpose — see the doc comment.
        useGame.setState({ cloudSynced: false });
        return;
      }
      // Reaching here means local OUTRANKS the row another device/tab just wrote:
      // we're about to overwrite its progress with our bigger save. That's the
      // same "adopting/overtaking another copy" shape as the load-time merge, so
      // mark it merge-claimed too — otherwise an honest concurrent multi-device
      // session reads to the audit as a plain unexplained rate jump.
      result = await pushCloudSave(conflict.rev, save, { rollback, merge: true });
    }

    if (result.ok) {
      cloudDirty = false;
      if (rollback) pendingRollback = false; // only once the server has heard it
      if (merge) pendingMerge = false; // ditto — one honest merge push, then normal deltas
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

  // The checkpoint that catches a kid closing the tab. Throttled and gated on
  // dirtiness — see CLOUD_EXIT_PUSH_MIN_INTERVAL_MS for why pushing on every
  // hide was a real cost problem rather than a theoretical one.
  const exitPush = () => {
    if (!cloudDirty) return;
    if (Date.now() - lastCloudPushAt < CLOUD_EXIT_PUSH_MIN_INTERVAL_MS) return;
    void pushCheckpoint();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') exitPush();
  });
  window.addEventListener('pagehide', exitPush);
}

// The ability granted by the equipped main creature (only if it's owned).
export const selectActiveAbility = (s: GameState): Ability | null => {
  const id = s.equippedMain;
  const held = id ? s.characters[id] : undefined;
  if (!id || !held) return null;
  // Rebirths permanently strengthen the ability (clamped inside abilityOf).
  return abilityOf(id, charactersById[id].rarity, held.rebirths ?? 0);
};

/**
 * ALL abilities the equipped-main creature grants right now: its native ability,
 * plus the SECOND ability it earned at its 10th rebirth (chosen by the player,
 * at the standard rarity value). Consumers fold every entry — modsOf
 * (tap/income/crit/luck), the combo mechanic and the golden-bonus mechanic — so
 * a second ability of any type takes effect. Empty when nothing is displayed.
 */
export const selectActiveAbilities = (s: GameState): Ability[] => {
  const id = s.equippedMain;
  const held = id ? s.characters[id] : undefined;
  if (!id || !held) return [];
  const rarity = charactersById[id].rarity;
  const native = abilityOf(id, rarity, held.rebirths ?? 0);
  const list = [native];
  if ((held.rebirths ?? 0) >= secondAbilityRebirth && held.secondAbility && held.secondAbility !== native.type) {
    list.push(abilityForType(held.secondAbility, rarity));
  }
  return list;
};

// Convenience selectors used across screens.
/**
 * Modifiers WITHOUT the equipped-main creature's active ability — the "base"
 * a creature has regardless of what you display. Used for PRICING, so that
 * choosing a creature to show on screen (which turns its ability on) never
 * changes what its upgrades/evolutions cost. The display bonus is a pure
 * benefit: income goes up, the price does not follow it.
 */
const baseModsOf = (s: GameState): Modifiers => {
  const m = modifiersFrom(
    s.upgrades,
    starBonusFor(s.achievements),
    clickCosmeticBonus(s.equippedBlob, s.equippedAccessory),
    backgroundIncomeBonus(s.equippedBackground),
    s.prestigeCrystals,
  );
  // A "lucky hour" event temporarily boosts hatch odds (luck only affects
  // hatching, never costs, so it's safe to fold in here).
  const ev = currentEvent(Date.now());
  if (ev.luckBonus > 0) m.luck = Math.min(luckCap, m.luck + ev.luckBonus);
  // Global rebirth income bonus — every rebirth across the roster, always on.
  m.rebirthMultiplier = rebirthGlobalMult(s.characters);
  return m;
};

const modsOf = (s: GameState): Modifiers => {
  const m = baseModsOf(s);
  // The equipped main creature's abilities — native AND the earned second one
  // (tap/income/crit/luck fold into the modifiers here; combo/bonus are applied
  // where those mechanics live).
  for (const ab of selectActiveAbilities(s)) {
    if (ab.type === 'tap') m.clickMultiplier *= 1 + ab.value;
    else if (ab.type === 'income') m.incomeMultiplier *= 1 + ab.value;
    else if (ab.type === 'crit') m.critChance = Math.min(critChanceCap, m.critChance + ab.value);
    else if (ab.type === 'luck') m.luck = Math.min(luckCap, m.luck + ab.value);
  }
  return m;
};
export const selectMods = (s: GameState): Modifiers => modsOf(s);
/**
 * Modifiers and wealth reference used for PRICING creature upgrades/evolutions.
 * Both exclude the active-creature ability (and event/ad, which modsOf already
 * omits), so a creature's cost is identical whether or not it is the one shown
 * on screen — see baseModsOf. `selectMods`/`selectGooPerSec` still include the
 * ability for the numbers that represent actual power (income, tap).
 */
export const selectCostMods = (s: GameState): Modifiers => baseModsOf(s);
export const selectCostWealth = (s: GameState): number => gooPerSec(s.characters, baseModsOf(s));

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
/**
 * The GLOBAL income bonus from rebirths as a fraction (e.g. 1.6 = +160%): every
 * rebirth across the whole roster counts, always on, regardless of which
 * creature is the main or what level a reborn creature sits at. Exactly
 * (counted rebirths) × rebirthIncomeBonus — see rebirthGlobalMult.
 */
export const selectRebirthIncomeBonus = (s: GameState): number => rebirthGlobalMult(s.characters) - 1;
/** The active permanent income bonus (star) as a fraction, e.g. 0.2 = +20%. */
export const selectStarBonus = (s: GameState) => starBonusFor(s.achievements);
export const selectEggCost = (s: GameState) =>
  Math.max(1, Math.round(eggCost(s.totalHatches + s.eggs) * currentEvent(Date.now()).eggCostMult));
// Evaluated on every store notification (10Hz once passive income ticks), so
// compute modsOf — which walks achievements and abilities — exactly once.
export const selectClickPower = (s: GameState) => {
  const m = modsOf(s);
  return (
    effectiveClickPower(m, gooPerSec(s.characters, m)) *
    currentEvent(Date.now()).clickMult *
    adMultOf(s, Date.now())
  );
};
/** The combo melody (note frequencies) of the equipped sound pack. */
export const selectComboMelody = (s: GameState) => soundById(s.equippedSound).melody;
export const selectAchContext = (s: GameState): AchievementContext => achContextOf(s);
/** Ids of achievements finished but not yet claimed — the "ready to collect" set. */
export const selectClaimableIds = (s: GameState): Set<string> =>
  new Set(newlyCompleted(new Set(s.achievements), achContextOf(s)).map((a) => a.id));
