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
  version: 9;
  goo: number;
  lifetimeGoo: number;
  upgrades: Upgrades;
  characters: OwnedCharacters;
  eggs: number; // unopened eggs in the player's inventory
  totalHatches: number;
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
  lastSeen: number; // epoch ms — for offline calculation
  muted: boolean;
}

/** All active income/click modifiers derived from upgrades + achievements. */
export interface Modifiers {
  fingerLevel: number;
  clickMultiplier: number; // from the "power" upgrade
  incomeMultiplier: number; // from the "nurture" upgrade (creatures only)
  autoTapFraction: number; // robot hand — adds this fraction of creature income (automation, independent of taps)
  starMultiplier: number; // from achievements — applies to everything
  critChance: number; // 0..1, chance a tap crits
  luck: number; // 0..luckCap, hatch-odds shift toward rare/legendary
}
