// Short synthesized sound effects — click blips, purchase, achievement, bonus,
// error, and the frenzy arpeggio. All reuse the single AudioContext and are a
// no-op when muted. No audio files, ever.

import { getAudioContext } from './synth';

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
  lp.connect(ctx.destination);

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

/** A tiny blip whose pitch rises with the tap combo — rapid tapping "runs up".
 * With a non-empty `melody` (a bought sound pack), a high combo flips into that
 * 8-bit melody; with an empty melody (the CLASSIC pack) it stays the original
 * rising blip, exactly as the game shipped. */
export function playClick(muted: boolean, combo = 1, melody: number[] = []): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (combo >= COMBO_MELODY_START && melody.length > 0) {
    melodyNote(ctx, melody[(combo - COMBO_MELODY_START) % melody.length], now);
    return;
  }
  const freq = Math.min(1300, 520 + combo * 42);
  voice(ctx, freq, now, 0.04, { type: 'square', gain: 0.1, filter: 6000, decay: 0.03 });
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
  [1200, 1600, 2100, 2600].forEach((f, i) =>
    voice(ctx, f, now + 0.04 + i * 0.05, 0.05, { type: 'sine', gain: 0.12, filter: 8000, decay: 0.08 }),
  );
}

/** Soft descending buzz when something can't be afforded. */
export function playError(muted: boolean): void {
  sequence(muted, [220, 165], 0.09, 0.1, { type: 'sawtooth', gain: 0.1, filter: 1400, decay: 0.06 });
}

/**
 * A rising "charge" sweep for the egg-shake suspense. Pitch and length grow
 * with rarityLevel (0..3) so a legendary buildup sounds bigger. Returns a stop
 * function for cleanup.
 */
export function playCharge(muted: boolean, durationMs: number, rarityLevel: number): () => void {
  if (muted) return () => {};
  const ctx = getAudioContext();
  if (!ctx) return () => {};
  const now = ctx.currentTime;
  const dur = durationMs / 1000;
  const top = 300 + rarityLevel * 260;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(top, now + dur);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(500, now);
  lp.frequency.exponentialRampToValueAtTime(4000, now + dur);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(0.12, now + dur * 0.8);
  env.gain.exponentialRampToValueAtTime(0.22, now + dur);

  osc.connect(lp);
  lp.connect(env);
  env.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.05);

  return () => {
    try {
      env.gain.cancelScheduledValues(ctx.currentTime);
      env.gain.setValueAtTime(0.0001, ctx.currentTime);
      osc.stop(ctx.currentTime + 0.02);
    } catch {
      /* already stopped */
    }
  };
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

/** Punchy zap for a critical tap. */
export function playCrit(muted: boolean): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  voice(ctx, 1500, now, 0.05, { type: 'sawtooth', gain: 0.2, filter: 7000, decay: 0.06 });
  voice(ctx, 500, now + 0.03, 0.08, { type: 'square', gain: 0.2, filter: 4000, decay: 0.1 });
  voice(ctx, 1000, now + 0.03, 0.08, { type: 'sine', gain: 0.1, filter: 8000, decay: 0.1 });
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
export function playMagnitude(muted: boolean, exponent: number): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const base = Math.min(1400, 300 + exponent * 90);
  // upward sweep
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(base * 0.6, now);
  osc.frequency.exponentialRampToValueAtTime(base * 1.6, now + 0.16);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 6000;
  osc.connect(env);
  env.connect(lp);
  lp.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
  // a bright ping on top
  voice(ctx, base * 2, now + 0.1, 0.09, { type: 'sine', gain: 0.1, filter: 9000, decay: 0.12 });
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
