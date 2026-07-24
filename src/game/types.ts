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

/** Runtime-synthesis parameters for a character's jingle (used from milestone 5). */
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

export interface SaveState {
  version: 1;
  goo: number;
  lifetimeGoo: number;
  fingerLevel: number;
  characters: OwnedCharacters;
  totalHatches: number;
  sinceRare: number;
  lastSeen: number; // epoch ms — for offline calculation
  muted: boolean;
}
