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
