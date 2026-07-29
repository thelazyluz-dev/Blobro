// The live event banner (§ user request). An event runs for just 30 seconds
// once every 10 minutes, so this has two looks: a bright, active banner while an
// event is running (with its effect + a depleting timer), and a quiet "next
// event in…" countdown the rest of the time. The event is derived from the wall
// clock (see game/events.ts), so it's the same for everyone.

import { useEffect, useState } from 'react';
import { eventActiveMs, eventPeriodMs, eventStateAt } from '../game/events';

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

  if (active) {
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

  // Between events: a quiet countdown to the next one.
  const elapsedFrac = Math.max(0, Math.min(1, 1 - msLeft / eventPeriodMs));
  return (
    <div className="relative z-10 mx-3 mb-1 overflow-hidden rounded-2xl bg-black/25 px-3 py-1.5 ring-hairline">
      <div className="flex items-center gap-2">
        <span className="text-base opacity-70" aria-hidden>{next.emoji}</span>
        <div className="min-w-0 flex-1 truncate text-[12px] text-bone/60">
          הָאִירוּעַ הַבָּא: <span className="text-bone/80">{next.nameHe}</span>
        </div>
        <div className="shrink-0 font-display text-sm tabular text-bone/70">בְּעוֹד {mmss(msLeft)}</div>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-bone/25 transition-[width] duration-500 ease-linear"
          style={{ width: `${elapsedFrac * 100}%` }}
        />
      </div>
    </div>
  );
}
