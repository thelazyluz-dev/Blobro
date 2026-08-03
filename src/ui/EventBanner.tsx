// The live event banner (§ user request). An event runs for just 30 seconds
// once every 10 minutes. To keep the screen uncluttered the banner shows only
// while an event is running (bright, with its effect + a depleting timer) —
// plus, in the LAST TWO MINUTES before one, a slim dimmed teaser with a
// countdown. Anticipation is the cheap half of an event's value: a kid who
// sees "double income in 1:32" stays for it, where a 30-second surprise in a
// 10-minute window used to land on an empty room. The rest of the cycle
// still renders nothing. Derived from the wall clock (game/events.ts).

import { useEffect, useState } from 'react';
import { eventActiveMs, eventStateAt } from '../game/events';

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function EventBanner() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const { active, event, next, msLeft } = eventStateAt(now);

  // The countdown teaser: only inside the final stretch before an event, so
  // the screen stays clean for most of the cycle.
  const teaserMs = 2 * 60 * 1000;
  if (!active && msLeft <= teaserMs) {
    return (
      <div
        className="relative z-10 mx-3 mb-1 flex items-center gap-2 rounded-full px-3 py-1"
        style={{ background: 'rgba(0,0,0,0.35)', boxShadow: `inset 0 0 0 1px ${next.color}55` }}
      >
        <span className="text-base" aria-hidden>{next.emoji}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold" style={{ color: next.color }}>
          {next.nameHe} <span className="font-normal text-bone/70">מַגִּיעַ בְּקָרוֹב!</span>
        </span>
        <span className="shrink-0 font-display text-sm tabular text-bone/90">⏰ {mmss(msLeft)}</span>
      </div>
    );
  }

  // Nothing on screen through the rest of the gap between events.
  if (!active) return null;

  const frac = Math.max(0, Math.min(1, msLeft / eventActiveMs));
  return (
    <div
      className="relative z-10 mx-3 mb-1 overflow-hidden rounded-2xl px-3 py-1.5"
      style={{ background: 'rgba(0,0,0,0.4)', boxShadow: `inset 0 0 0 1.5px ${event.color}, 0 0 20px -6px ${event.color}` }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>{event.emoji}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-display text-sm" style={{ color: event.color }}>
            {event.nameHe} <span className="text-bone/80">פָּעִיל!</span>
          </div>
          <div className="truncate text-[11px] text-bone/75">{event.descHe}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-bone/50">נִגְמָר בְּעוֹד</div>
          <div className="font-display text-sm tabular text-bone">⏳ {mmss(msLeft)}</div>
        </div>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-linear"
          style={{ width: `${frac * 100}%`, background: event.color }}
        />
      </div>
    </div>
  );
}
