// Battery saver. A phone left face-up on the click screen used to burn a
// third of a CPU core forever: two number-glide rAF loops, a stack of
// decorative infinite CSS animations and a 10Hz screen re-render never
// rested, because passive income keeps the goo counter moving even when
// nobody is playing. After ~15s with no interaction the app enters a saver
// state: SmoothNumber snaps instead of gliding, and the purely decorative
// animations pause (the `.power-save` rules in index.css). The first tap
// wakes everything in the same frame, so a playing kid never sees the
// difference — only an idle phone does. The economy itself never pauses:
// this is an idle game, and income keeps ticking either way.
//
// Deliberately OUTSIDE the Zustand store: taps arrive at up to ~100/sec and a
// store write per tap would re-render every subscriber. Here a tap while
// awake is a single timestamp assignment, and the timeout fires at most once
// per idle window (it re-arms for the remainder instead of resetting per tap).

import { useSyncExternalStore } from 'react';

export const POWER_SAVE_IDLE_MS = 15_000;

let saving = false;
let lastInteraction = 0;
let timer: number | undefined;
let started = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function arm(delayMs: number): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(check, delayMs);
}

function check(): void {
  const idleFor = Date.now() - lastInteraction;
  if (idleFor < POWER_SAVE_IDLE_MS) {
    arm(POWER_SAVE_IDLE_MS - idleFor);
    return;
  }
  saving = true;
  document.documentElement.classList.add('power-save');
  notify();
}

function wake(): void {
  lastInteraction = Date.now();
  if (!saving) return;
  saving = false;
  document.documentElement.classList.remove('power-save');
  notify();
  arm(POWER_SAVE_IDLE_MS);
}

/** Install the global listeners once (called from useGameEngine on mount). */
export function startPowerSaver(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  lastInteraction = Date.now();
  // Capture phase so no overlay's stopPropagation can hide an interaction.
  window.addEventListener('pointerdown', wake, { capture: true, passive: true });
  window.addEventListener('keydown', wake, { capture: true, passive: true });
  window.addEventListener('wheel', wake, { capture: true, passive: true });
  // Returning to the tab counts as interaction — the player is looking again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
  });
  arm(POWER_SAVE_IDLE_MS);
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Whether the app is currently in the idle battery-saver state. */
export function usePowerSaver(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => saving,
    () => false,
  );
}
