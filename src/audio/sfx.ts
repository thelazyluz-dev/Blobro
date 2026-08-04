// Short synthesized sound effects — click blips, purchase, achievement, bonus,
// error, and the frenzy arpeggio. All reuse the single AudioContext and are a
// no-op when muted. No audio files, ever.

import { getAudioContext } from './synth';

// One shared output bus with a gentle compressor. Every sfx voice used to
// connect straight to ctx.destination with nothing capping the SUM — a frenzy
// arpeggio + rain drops + a crit + a magnitude launch landing in the same
// ~50ms window could stack gains well past clipping on a phone speaker. The
// compressor only bites on those pile-ups; a single voice passes untouched.
let sfxBus: DynamicsCompressorNode | null = null;
function busFor(ctx: AudioContext): DynamicsCompressorNode {
  if (!sfxBus || sfxBus.context !== ctx) {
    sfxBus = ctx.createDynamicsCompressor();
    sfxBus.threshold.value = -18;
    sfxBus.knee.value = 12;
    sfxBus.ratio.value = 4;
    sfxBus.attack.value = 0.003;
    sfxBus.release.value = 0.25;
    sfxBus.connect(ctx.destination);
  }
  return sfxBus;
}

interface VoiceOpts {
  type?: OscillatorType;
  gain?: number;
  filter?: number;
  decay?: number;
}

function voice(
  ctx: AudioContext,
  freq: number,
  start: number,
  dur: number,
  { type = 'square', gain = 0.16, filter = 5000, decay = 0.05 }: VoiceOpts = {},
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur + decay);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = filter;

  osc.connect(env);
  env.connect(lp);
  lp.connect(busFor(ctx));

  osc.start(start);
  osc.stop(start + dur + decay);
}

function sequence(
  muted: boolean,
  notes: number[],
  step: number,
  dur: number,
  opts: VoiceOpts = {},
): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  notes.forEach((f, i) => voice(ctx, f, now + i * step, dur, opts));
}

// Once the combo is high enough that the rising blip would just cap out, an
// equipped sound pack's melody takes over instead — each tap plays the next
// note, so fast tapping turns into a little chiptune (§ user request).
const COMBO_MELODY_START = 20;

/** One 8-bit melody note (square lead + triangle sub) — the combo-melody voice. */
function melodyNote(ctx: AudioContext, freq: number, when: number, gain = 0.12): void {
  voice(ctx, freq, when, 0.09, { type: 'square', gain, filter: 7000, decay: 0.05 });
  voice(ctx, freq / 2, when, 0.07, { type: 'triangle', gain: gain * 0.5, filter: 3500, decay: 0.05 });
}

/**
 * A critical tap landing DURING a melody. Plays the melody's own note an octave
 * up rather than a separate zap.
 *
 * The zap used to replace the note entirely, so with the crit upgrade near its
 * 60% cap most of the tune simply went missing — the melody you paid for was
 * audible only on the taps that didn't crit. An octave is the most consonant
 * interval there is, so this can never land out of key whichever pack is
 * equipped, and the crit reads as a highlight in the music instead of an
 * interruption of it.
 */
function critAccent(ctx: AudioContext, freq: number, when: number): void {
  voice(ctx, freq * 2, when, 0.07, { type: 'square', gain: 0.13, filter: 9000, decay: 0.05 });
  voice(ctx, freq * 4, when + 0.02, 0.05, { type: 'sine', gain: 0.06, filter: 12000, decay: 0.04 });
}

/** The original standalone crit zap — still used when no melody is playing. */
function critTone(ctx: AudioContext, now: number): void {
  voice(ctx, 1500, now, 0.05, { type: 'sawtooth', gain: 0.14, filter: 5000, decay: 0.06 });
  voice(ctx, 500, now + 0.03, 0.08, { type: 'square', gain: 0.2, filter: 4000, decay: 0.1 });
  voice(ctx, 1000, now + 0.03, 0.08, { type: 'sine', gain: 0.1, filter: 8000, decay: 0.1 });
}

/**
 * Which sound a tap should make. Split out from the synthesis so the RULE can
 * be tested without a WebAudio context — the part worth protecting is the
 * decision, not the oscillators.
 */
export type ClickSound = 'melody' | 'melody-crit' | 'crit' | 'blip';

export function clickSoundFor(combo: number, melodyLength: number, crit: boolean): ClickSound {
  const inMelody = combo >= COMBO_MELODY_START && melodyLength > 0;
  if (inMelody) return crit ? 'melody-crit' : 'melody';
  return crit ? 'crit' : 'blip';
}

/** A tiny blip whose pitch rises with the tap combo — rapid tapping "runs up".
 * With a non-empty `melody` (a bought sound pack), a high combo flips into that
 * 8-bit melody; with an empty melody (the CLASSIC pack) it stays the original
 * rising blip, exactly as the game shipped. A crit never silences the melody —
 * see critAccent. */
export function playClick(muted: boolean, combo = 1, melody: number[] = [], crit = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  switch (clickSoundFor(combo, melody.length, crit)) {
    case 'melody':
    case 'melody-crit': {
      const freq = melody[(combo - COMBO_MELODY_START) % melody.length];
      melodyNote(ctx, freq, now, crit ? 0.15 : 0.12);
      if (crit) critAccent(ctx, freq, now);
      return;
    }
    case 'crit':
      critTone(ctx, now);
      return;
    default: {
      const freq = Math.min(1300, 520 + combo * 42);
      voice(ctx, freq, now, 0.04, { type: 'square', gain: 0.1, filter: 6000, decay: 0.03 });
    }
  }
}

/** Preview a sound pack in the shop. An empty melody = the classic pack, so we
 * demo the original rising blip instead. */
export function playMelodyPreview(muted: boolean, melody: number[]): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const start = ctx.currentTime + 0.02;
  if (melody.length === 0) {
    for (let i = 1; i <= 9; i++) {
      voice(ctx, Math.min(1300, 520 + i * 80), start + i * 0.08, 0.05, {
        type: 'square',
        gain: 0.11,
        filter: 6000,
        decay: 0.04,
      });
    }
    return;
  }
  const step = 0.13;
  melody.forEach((f, i) => melodyNote(ctx, f, start + i * step, 0.13));
}

// A longer original 8-bit chiptune (lead + bass) over a I–V–vi–IV progression
// (C · G · Am · F), 64 steps so it doesn't feel like a few notes on repeat.
// Played step-by-step during music events. All synthesized — no files,
// no copyright. 0 = a rest.
const MUSIC_LEAD = [
  // C
  659, 784, 1047, 784, 880, 784, 659, 0, 784, 659, 587, 659, 784, 0, 659, 0,
  // G
  587, 784, 988, 784, 1175, 988, 784, 0, 880, 988, 1175, 988, 880, 0, 784, 0,
  // Am
  659, 880, 1047, 880, 1319, 1047, 880, 0, 784, 880, 1047, 880, 659, 0, 880, 0,
  // F
  698, 880, 1047, 880, 1175, 1047, 880, 0, 784, 698, 659, 698, 784, 0, 0, 0,
];
const MUSIC_BASS = [
  // C
  131, 0, 131, 0, 131, 0, 196, 0, 131, 0, 131, 0, 131, 0, 196, 0,
  // G
  98, 0, 98, 0, 98, 0, 147, 0, 98, 0, 98, 0, 98, 0, 147, 0,
  // Am
  110, 0, 110, 0, 110, 0, 165, 0, 110, 0, 110, 0, 110, 0, 165, 0,
  // F
  87, 0, 87, 0, 87, 0, 131, 0, 87, 0, 87, 0, 87, 0, 131, 0,
];
export const MUSIC_STEP_MS = 150;
export const MUSIC_STEPS = MUSIC_LEAD.length;

/** Play one step of the event chiptune loop. Kept quiet — it's a backdrop. */
export function playMusicStep(muted: boolean, step: number): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const i = ((step % MUSIC_STEPS) + MUSIC_STEPS) % MUSIC_STEPS;
  const now = ctx.currentTime;
  const lead = MUSIC_LEAD[i];
  const bass = MUSIC_BASS[i];
  if (lead) voice(ctx, lead, now, 0.11, { type: 'square', gain: 0.055, filter: 6000, decay: 0.04 });
  if (bass) voice(ctx, bass, now, 0.13, { type: 'triangle', gain: 0.05, filter: 2600, decay: 0.05 });
}

/** Coin-like two-note rise on buying an upgrade. */
export function playPurchase(muted: boolean): void {
  sequence(muted, [700, 1050], 0.07, 0.08, { type: 'triangle', gain: 0.18, filter: 6000 });
}

/** A little fanfare when an achievement unlocks. */
export function playAchievement(muted: boolean): void {
  sequence(muted, [659, 784, 988, 1319], 0.09, 0.12, { type: 'triangle', gain: 0.16, filter: 7000, decay: 0.12 });
}

/** Sparkle + thump when the golden bonus is collected. */
export function playBonus(muted: boolean): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  voice(ctx, 160, now, 0.14, { type: 'square', gain: 0.2, filter: 1200, decay: 0.16 });
  [1319, 1568, 2093, 2637].forEach((f, i) =>
    voice(ctx, f, now + 0.04 + i * 0.05, 0.05, { type: 'sine', gain: 0.12, filter: 8000, decay: 0.08 }),
  );
}

/** Soft descending buzz when something can't be afforded. */
export function playError(muted: boolean): void {
  sequence(muted, [220, 165], 0.09, 0.1, { type: 'sawtooth', gain: 0.1, filter: 1400, decay: 0.06 });
}

/** A big impact when the egg finally cracks open. */
export function playCrack(muted: boolean, rarityLevel: number): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  voice(ctx, 120, now, 0.16, { type: 'square', gain: 0.24, filter: 1400, decay: 0.2 });
  voice(ctx, 60, now, 0.2, { type: 'sine', gain: 0.24, filter: 800, decay: 0.24 });
  const notes = [523, 659, 784, 1047].slice(0, 2 + rarityLevel);
  notes.forEach((f, i) => voice(ctx, f, now + 0.05 + i * 0.05, 0.1, { type: 'triangle', gain: 0.14, filter: 7000, decay: 0.14 }));
}

/** Punchy zap for a critical tap outside the melody (kept for other callers). */
export function playCrit(muted: boolean): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  critTone(ctx, ctx.currentTime);
}

/** Soft plink when a goo-rain drop is tapped. */
export function playRainDrop(muted: boolean): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  voice(ctx, 760 + Math.random() * 500, ctx.currentTime, 0.05, {
    type: 'sine',
    gain: 0.09,
    filter: 8000,
    decay: 0.05,
  });
}

/** A quick rising "whoosh + ping" each time the goo counter crosses a new
 * order of magnitude (100 → 1,000 → …). Pitch climbs with the exponent so
 * bigger jumps sound higher and more triumphant. */
/**
 * Crossing an order of magnitude — a "spaceship accelerating" launch, not the
 * old short sad sweep (§ owner request). Three layers building together: an
 * engine-thrust noise that swells while its band sweeps upward, a rising
 * sawtooth that ramps a couple of octaves (the acceleration itself), and a
 * bright major-triad chime that blooms at the top of the climb (liftoff). The
 * bigger the number crossed, the brighter/higher it all sits.
 */
export function playMagnitude(muted: boolean, exponent: number): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const dur = 0.55;
  const lift = Math.min(1, Math.max(0, (exponent - 2) / 18)); // 0 at ~100 → 1 by ~1e20
  const base = 150 + lift * 120;

  // Engine thrust: white noise, swelling, with a band that sweeps up = accelerating.
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.0001, now);
  nGain.gain.exponentialRampToValueAtTime(0.11, now + 0.12);
  nGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  const nbp = ctx.createBiquadFilter();
  nbp.type = 'bandpass';
  nbp.frequency.setValueAtTime(280, now);
  nbp.frequency.exponentialRampToValueAtTime(2600, now + dur * 0.9);
  nbp.Q.value = 0.8;
  noise.connect(nbp);
  nbp.connect(nGain);
  nGain.connect(busFor(ctx));
  noise.start(now);
  noise.stop(now + dur);

  // Rising thrust tone: a sawtooth ramping up ~2.5 octaves under an opening filter.
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(base, now);
  osc.frequency.exponentialRampToValueAtTime(base * 5, now + dur * 0.8);
  const oGain = ctx.createGain();
  oGain.gain.setValueAtTime(0.0001, now);
  oGain.gain.exponentialRampToValueAtTime(0.12, now + 0.08);
  oGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  const olp = ctx.createBiquadFilter();
  olp.type = 'lowpass';
  olp.frequency.setValueAtTime(800, now);
  olp.frequency.exponentialRampToValueAtTime(7000, now + dur * 0.8);
  osc.connect(olp);
  olp.connect(oGain);
  oGain.connect(busFor(ctx));
  osc.start(now);
  osc.stop(now + dur);

  // Liftoff: a bright major triad blooms at the top of the climb.
  const climax = now + dur * 0.62;
  [523.25, 659.25, 783.99].forEach((f, i) =>
    voice(ctx, f * (1 + lift * 0.5), climax + i * 0.04, 0.12, { type: 'triangle', gain: 0.11, filter: 9000, decay: 0.18 }),
  );
  voice(ctx, 1046.5 * (1 + lift * 0.5), climax + 0.12, 0.1, { type: 'sine', gain: 0.08, filter: 11000, decay: 0.2 });
}

/** The full "you hit a milestone" fanfare — big, a little crazy. */
export function playMilestone(muted: boolean): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  // deep boom
  voice(ctx, 80, now, 0.3, { type: 'sine', gain: 0.28, filter: 700, decay: 0.3 });
  voice(ctx, 120, now, 0.24, { type: 'square', gain: 0.2, filter: 1200, decay: 0.24 });
  // triumphant rising fanfare
  const fanfare = [392, 523, 659, 784, 1047, 1319];
  fanfare.forEach((f, i) =>
    voice(ctx, f, now + 0.12 + i * 0.1, 0.14, { type: 'triangle', gain: 0.16, filter: 8000, decay: 0.16 }),
  );
  // sparkle tail
  [1568, 2093, 2637].forEach((f, i) =>
    voice(ctx, f, now + 0.72 + i * 0.06, 0.06, { type: 'sine', gain: 0.1, filter: 9000, decay: 0.1 }),
  );
}

// A cheerful major arpeggio, rotated each call, looped during a frenzy.
const FRENZY_ARP = [523, 659, 784, 1047, 784, 659];
export function playFrenzyStep(muted: boolean, step: number): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const f = FRENZY_ARP[step % FRENZY_ARP.length];
  voice(ctx, f, ctx.currentTime, 0.09, { type: 'square', gain: 0.09, filter: 6000, decay: 0.08 });
  voice(ctx, f * 2, ctx.currentTime, 0.06, { type: 'sine', gain: 0.05, filter: 8000, decay: 0.06 });
}
