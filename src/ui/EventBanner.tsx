// The live "global event" banner (§ user request). Shows which timed event is
// active right now, its effect, a countdown to the next one, and a progress bar
// that depletes as the window runs out. The event itself is derived from the
// wall clock (see game/events.ts), so it's the same for everyone.

import { useEffect, useState } from 'react';
import { activeEventAt, eventPeriodMs } from '../game/events';

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function EventBanner() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const { event, endsAt } = activeEventAt(now);
  const remaining = endsAt - now;
  const remainFrac = Math.max(0, Math.min(1, remaining / eventPeriodMs));

  return (
    <div className="relative z-10 mx-3 mb-1 overflow-hidden rounded-2xl bg-black/35 px-3 py-1.5 ring-hairline">
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>
          {event.emoji}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-display text-sm" style={{ color: event.color }}>
            {event.nameHe}
          </div>
          <div className="truncate text-[11px] text-bone/70">{event.descHe}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-bone/50">מִתְחַלֵּף בְּעוֹד</div>
          <div className="font-display text-sm tabular text-bone">⏳ {mmss(remaining)}</div>
        </div>
      </div>
      {/* depleting progress bar */}
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${remainFrac * 100}%`, background: event.color }}
        />
      </div>
    </div>
  );
}
