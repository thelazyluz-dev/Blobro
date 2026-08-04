export type { RngState } from './rng';
import type { RngState } from './rng';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type CharId =
  | 'blombo'
  | 'fizzik'
  | 'nono'
  | 'grumpolo'
  | 'bubbo'
  | 'skwibbly'
  | 'tikko'
  | 'mumbo'
  | 'kaktuki'
  | 'zapparoo'
  | 'chompolino'
  | 'flamo'
  | 'kristalo'
  | 'gigablorf'
  | 'dragapuf'
  | 'galaxo'
  // Click-unlock creatures (earned by total taps, not eggs):
  | 'dondonu'
  | 'romrom'
  | 'gongoni'
  | 'mataru'
  | 'gefenaou'
  | 'oziouh'
  | 'baraku'
  | 'idanosau';

/** Runtime-synthesis parameters for a character's jingle. */
export interface SoundParams {
  waveform: OscillatorType;
  notes: number[]; // frequencies in Hz
  durations: number[]; // seconds, parallel to notes
  filter: number; // low-pass cutoff Hz
  decay: number; // seconds
}

export interface CharacterDef {
  id: CharId;
  nameHe: string;
  nameLatin: string;
  descHe: string; // short personality / "species" blurb for the collection
  rarity: Rarity;
  sound: SoundParams;
  /** If set, this creature is NOT in the egg pool — it unlocks once the player's
   * lifetime click count reaches this many taps (rarer = more). */
  unlockClicks?: number;
  /** Per-creature passive-income multiplier (default 1). Click-unlock creatures
   * earn more than egg creatures of the same rarity. */
  incomeMult?: number;
}

/** Only owned characters appear here. `evolution` = number of evolution stages
 * done (0 = not evolved; 1..maxEvolution = shiny tiers, each worth more). */
export interface OwnedCharacter {
  level: number;
  evolution?: number;
}
export type OwnedCharacters = Partial<Record<CharId, OwnedCharacter>>;

export type UpgradeId = 'finger' | 'power' | 'autoTap' | 'nurture' | 'crit' | 'luck';
export type Upgrades = Record<UpgradeId, number>; // level per upgrade, default 0

export type AchievementId = string;

/** One row in the on-device click leaderboard. Stays local — never uploaded. */
export interface LeaderboardEntry {
  name: string;
  clicks: number;
}

export interface SaveState {
  version: 17;
  goo: number;
  lifetimeGoo: number;
  bestCpm: number; // record MANUAL taps in any rolling minute (see game/cpm.ts)
  upgrades: Upgrades;
  characters: OwnedCharacters;
  eggs: number; // unopened eggs in the player's inventory
  totalHatches: number; // resets on prestige — drives the egg price curve + pity
  lifetimeHatches: number; // never resets — the hatch achievement ladder reads this
  sinceRare: number;
  bonusesCollected: number;
  clicks: number; // manual taps by the current player (for the leaderboard)
  leaderboard: LeaderboardEntry[]; // local-only, on-device
  achievements: AchievementId[]; // claimed achievement ids
  ownedCosmetics: string[]; // shop items bought (blobs + backgrounds + accessories)
  equippedBlob: string; // currently-worn main blob skin id
  equippedBackground: string; // currently-applied background id
  equippedAccessory: string; // currently-worn accessory id
  equippedSound: string; // currently-selected combo-melody sound pack id
  equippedMain: CharId | null; // creature shown on the main screen (null = classic green blob)
  milestonesShown: number[]; // goo thresholds whose fact has already been celebrated (once each)
  // v14: the come-back-tomorrow loop (see game/daily.ts for all semantics).
  lastGiftDay: number; // UTC dayKey of the last claimed daily gift (0 = never)
  giftStreak: number; // cycle position (1..7) of that claim (0 = never)
  questDay: number; // UTC dayKey this quest progress belongs to
  questProgress: Partial<Record<'taps' | 'hatches' | 'bonuses' | 'upgrades' | 'levels', number>>;
  questsClaimed: ('taps' | 'hatches' | 'bonuses' | 'upgrades' | 'levels')[];
  questAllClaimed: boolean; // today's finish-all-three bonus collected
  // v15: the free-egg ad button's recharge time (epoch ms). Persisted because
  // a session-only cooldown reset on every refresh — the owner caught players
  // (himself) re-claiming eggs by reloading.
  adEggReadyAt: number;
  // v16: prestige ("גלגול מחדש") — data plumbing only until the mechanic
  // ships; see game/prestige.ts for the full semantics.
  prestigeCrystals: number; // 💎 owned; each is a permanent earnings bonus
  prestigeCount: number; // how many rolls ever (stats/celebrations)
  lastSeen: number; // epoch ms — for offline calculation
  muted: boolean;
  // The seeded outcome-RNG stream (crit rolls, hatching — see game/rng.ts).
  // Persisting the cursor means reloading resumes mid-stream instead of
  // re-rolling a pending draw, which also closes a save-scumming exploit.
  rng: RngState;
}

/** All active income/click modifiers derived from upgrades + achievements. */
export interface Modifiers {
  fingerLevel: number;
  clickMultiplier: number; // from the "power" upgrade
  incomeMultiplier: number; // from the "nurture" upgrade (creatures only)
  starMultiplier: number; // from achievements — applies to everything
  prestigeMultiplier: number; // from 💎 crystals — applies to everything, forever
  critChance: number; // 0..1, chance a tap crits
  luck: number; // 0..luckCap, hatch-odds shift toward rare/legendary
}
