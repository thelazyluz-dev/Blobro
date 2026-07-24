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

/**
 * Create/resume the AudioContext from within a user gesture. Browsers block
 * audio until the first interaction; calling this on an early pointerdown means
 * later scheduled jingles (e.g. after the egg-shake delay) still play.
 */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

const MASTER_GAIN = 0.22; // overall loudness — gentle for kids/headphones

/** Play a jingle from its parameter object. A no-op when muted or unsupported. */
export function playJingle(params: SoundParams, muted: boolean): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();

  const now = c.currentTime;

  const master = c.createGain();
  master.gain.value = MASTER_GAIN;

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = params.filter;

  filter.connect(master);
  master.connect(c.destination);

  let t = now;
  for (let i = 0; i < params.notes.length; i++) {
    const freq = params.notes[i];
    const dur = params.durations[i] ?? 0.12;
    const release = params.decay;

    const osc = c.createOscillator();
    osc.type = params.waveform;
    osc.frequency.setValueAtTime(freq, t);

    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);

    osc.connect(env);
    env.connect(filter);

    osc.start(t);
    osc.stop(t + dur + release);

    t += dur;
  }
}
