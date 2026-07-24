// "חזרת!" — offline earnings reveal (§8). The hook for coming back tomorrow,
// so it's front-and-center, never hidden in a corner. Number counts up.

import { useGame } from '../store';
import { CountUp } from './CountUp';

function formatAway(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} דקות`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `${hours} שעות`;
  return `${hours} שעות ו-${rem} דקות`;
}

export function OfflineModal() {
  const report = useGame((s) => s.offlineReport);
  const dismiss = useGame((s) => s.dismissOffline);

  if (!report) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-6">
      <div className="anim-pop-in w-full max-w-xs rounded-3xl bg-void p-7 text-center ring-2 ring-goo">
        <div className="text-5xl">👋</div>
        <h2 className="mt-2 font-display text-3xl text-bone">חָזַרְתָּ!</h2>
        <p className="mt-2 text-sm text-bone/60">
          בזמן שלא היית ({formatAway(report.secondsAway)}) היצורים עבדו בשבילך
          {report.capped ? ' (עד 4 שעות)' : ''}:
        </p>
        <div className="mt-4 font-display text-5xl text-pop">
          +<CountUp target={report.goo} /> <span className="text-2xl">גּוּ</span>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-6 w-full rounded-2xl bg-goo py-4 font-display text-xl text-void active:scale-95"
        >
          מְעוּלֶה!
        </button>
      </div>
    </div>
  );
}
