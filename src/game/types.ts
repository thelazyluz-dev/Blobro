export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type CharId =
  | 'blombo'
  | 'fizzik'
  | 'nono'
  | 'grumpolo'
  | 'skwibbly'
  | 'tikko'
  | 'mumbo'
  | 'zapparoo'
  | 'chompolino'
  | 'gigablorf';

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
  rarity: Rarity;
  sound: SoundParams;
}

/** Only owned characters appear here. */
export type OwnedCharacters = Partial<Record<CharId, { level: number }>>;

export type UpgradeId = 'finger' | 'power' | 'autoTap' | 'nurture';
export type Upgrades = Record<UpgradeId, number>; // level per upgrade, default 0

export type AchievementId = string;

export interface SaveState {
  version: 2;
  goo: number;
  lifetimeGoo: number;
  upgrades: Upgrades;
  characters: OwnedCharacters;
  totalHatches: number;
  sinceRare: number;
  bonusesCollected: number;
  achievements: AchievementId[]; // claimed achievement ids
  lastSeen: number; // epoch ms — for offline calculation
  muted: boolean;
}

/** All active income/click modifiers derived from upgrades + achievements. */
export interface Modifiers {
  fingerLevel: number;
  clickMultiplier: number; // from the "power" upgrade
  incomeMultiplier: number; // from the "nurture" upgrade (creatures only)
  autoTapRate: number; // taps/sec from the "autoTap" upgrade
  starMultiplier: number; // from achievements — applies to everything
}
