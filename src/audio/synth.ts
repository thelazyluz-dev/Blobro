// Runtime Web Audio synthesis (§11). No audio files, ever — every jingle is
// built from a character's SoundParams at play time.

import type { SoundParams } from '../game/types';

let ctx: AudioContext | null = null;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** Shared accessor so the SFX module can reuse the single AudioContext. */
export function getAudioContext(): AudioContext | null {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
  return c;
}

/**
 * Create/resume the AudioContext from within a user gesture. Browsers block
 * audio until the first interaction; calling this on an early pointerdown means
 * later scheduled jingles (e.g. after the egg-shake delay) still play.
 */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

const MASTER_GAIN = 0.2; // overall loudness — gentle for kids/headphones
const DETUNE_CENTS = 7; // chorus width between the two voices per note

/** Play a jingle from its parameter object. A no-op when muted or unsupported. */
export function playJingle(params: SoundParams, muted: boolean): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();

  const now = c.currentTime;

  // Master bus with a soft high-shelf tamed by the per-jingle low-pass.
  const master = c.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(c.destination);

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = params.filter;
  filter.Q.value = 0.7;
  filter.connect(master);

  // A short feedback delay adds air/space without any reverb impulse file.
  const delay = c.createDelay(0.4);
  delay.delayTime.value = 0.11;
  const feedback = c.createGain();
  feedback.gain.value = 0.22;
  const wet = c.createGain();
  wet.gain.value = 0.3;
  filter.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(master);

  // A slow shared vibrato LFO gives the voices life.
  const lfo = c.createOscillator();
  lfo.frequency.value = 5.5;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 4; // Hz of pitch wobble
  lfo.connect(lfoGain);
  lfo.start(now);

  let t = now;
  let lastStop = now;
  for (let i = 0; i < params.notes.length; i++) {
    const freq = params.notes[i];
    const dur = params.durations[i] ?? 0.12;
    const release = params.decay;
    const end = t + dur + release;

    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(filter);

    // Two slightly detuned voices for a fuller, chorused tone.
    for (const detune of [-DETUNE_CENTS, DETUNE_CENTS]) {
      const osc = c.createOscillator();
      osc.type = params.waveform;
      osc.frequency.setValueAtTime(freq, t);
      osc.detune.value = detune;
      lfoGain.connect(osc.frequency);
      osc.connect(env);
      osc.start(t);
      osc.stop(end);
    }

    t += dur;
    lastStop = end;
  }

  lfo.stop(lastStop + 0.05);
}
