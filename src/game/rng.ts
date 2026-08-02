// Deterministic PRNG for game-OUTCOME randomness only (crit rolls, hatch
// rarity/character rolls — see src/store.ts). The server is going to
// re-simulate a client's reported outcomes to verify them (see CLAUDE.md,
// "Direction: server-authoritative rebuild"), which is only possible if the
// randomness behind those outcomes is reproducible. Cosmetic randomness
// (particles, confetti, drift, quote picking — src/ui/**) stays on
// Math.random on purpose: routing it through this stream would burn draws
// unpredictably and make replay impossible.
//
// Algorithm: mulberry32 — tiny (32-bit state), fast, no dependencies, and
// good enough uniformity for a gacha/idle game. It also has no `window` or
// `crypto` dependency, so the identical code runs in a Cloudflare Worker.
//
// The state is persisted as {seed, cursor} (see SaveState.rng in
// src/game/types.ts) so a save can be reloaded — or a server checkpoint
// resumed — mid-stream. To make that resume EXACT, every draw is derived
// from (seed, cursor) rather than from an opaque mutable generator: draw
// number `cursor` is always the same 32-bit value no matter how the
// generator holding it was constructed. Concretely, mulberry32's internal
// accumulator after `n` calls is `(seed + n * 0x6D2B79F5) mod 2^32` — a
// closed form — so `createRng({ seed, cursor })` can jump straight to that
// point (via BigInt, to stay exact past 2^32) instead of replaying every
// prior draw.

export interface RngState {
  seed: number; // 32-bit seed, fixed for the lifetime of a stream
  cursor: number; // number of values already drawn from this stream
}

const INCREMENT = 0x6d2b79f5;
const INCREMENT_BIG = BigInt(INCREMENT);
const MOD_32 = 1n << 32n;

/** The mulberry32 accumulator value after `n` increments from `seed`, mod 2^32. */
function accumulatorAfter(seed: number, n: number): number {
  if (n === 0) return seed >>> 0;
  const total = (BigInt(seed >>> 0) + BigInt(n) * INCREMENT_BIG) % MOD_32;
  return Number(total);
}

/** mulberry32's mixing step: accumulator value -> a float in [0, 1). */
function mix(accRaw: number): number {
  const a = accRaw >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Create a generator resuming from `state`. `next()` draws the next float in
 * [0, 1) and advances the stream; `state()` reads back the current position
 * so the caller can persist it. Two generators built from the same
 * {seed, cursor} always agree on every subsequent draw.
 */
export function createRng(state: RngState): { next: () => number; state: () => RngState } {
  const seed = state.seed >>> 0;
  let cursor = Math.max(0, Math.floor(state.cursor) || 0);
  let acc = accumulatorAfter(seed, cursor);
  return {
    next(): number {
      acc = (acc + INCREMENT) | 0;
      cursor += 1;
      return mix(acc);
    },
    state(): RngState {
      return { seed, cursor };
    },
  };
}

/**
 * Mint a fresh 32-bit seed for a BRAND-NEW stream (a new save, a new
 * player). This is the only place ordinary Math.random is allowed to touch
 * outcome randomness — once a stream exists, every draw comes from
 * createRng, never from here again.
 */
export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
