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

/** A tiny blip whose pitch rises with the tap combo — rapid tapping "runs up". */
export function playClick(muted: boolean, combo = 1): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const freq = Math.min(1300, 520 + combo * 42);
  voice(ctx, freq, ctx.currentTime, 0.04, { type: 'square', gain: 0.1, filter: 6000, decay: 0.03 });
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
