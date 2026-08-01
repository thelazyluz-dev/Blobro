// Global mute toggle (§11). State is persisted via the save file.

import { useGame } from '../store';

export function MuteButton() {
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);

  return (
    <button
      type="button"
      onClick={toggleMute}
      aria-pressed={muted}
      aria-label={muted ? 'הפעלת צליל' : 'השתקה'}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/40 ring-1 ring-bone/15 active:scale-90"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#FFF4E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="#FFF4E0" />
        {muted ? (
          <path d="M17 9l5 6M22 9l-5 6" stroke="#FF2E88" />
        ) : (
          <>
            <path d="M16.5 8.5a5 5 0 0 1 0 7" stroke="#00E5FF" />
            <path d="M19 6a8 8 0 0 1 0 12" stroke="#00E5FF" />
          </>
        )}
      </svg>
    </button>
  );
}
