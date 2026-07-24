// Best-effort haptic feedback for touch devices. No-op where unsupported.

export function haptic(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore — vibration is a nicety */
  }
}
