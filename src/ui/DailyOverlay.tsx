// The daily gift + quests panel — the come-back-tomorrow loop (game/daily.ts).
// One panel, two halves: the 7-day gift on top (one tap, escalating, day 7 is
// an egg), today's three quests below with live progress bars. The top-bar
// button carries a dot whenever something in here is waiting to be collected.

import { useMemo } from 'react';
import {
  GIFT_CYCLE_DAYS,
  giftClaimable,
  giftRewardFor,
  nextGiftDay,
  questAllBonus,
  questComplete,
  questProgressOf,
  questReward,
  questStateFor,
  questsForDay,
} from '../game/daily';
import { formatGoo } from '../game/format';
import { gooPerSec } from '../game/economy';
import { selectMods, useGame } from '../store';

/** Everything the badge and the panel both need, derived once. */
function useDailyState() {
  const lastGiftDay = useGame((s) => s.lastGiftDay);
  const giftStreak = useGame((s) => s.giftStreak);
  const questDay = useGame((s) => s.questDay);
  const questProgress = useGame((s) => s.questProgress);
  const questsClaimed = useGame((s) => s.questsClaimed);
  const questAllClaimed = useGame((s) => s.questAllClaimed);

  const now = Date.now();
  const gift = { lastGiftDay, giftStreak };
  const quests = questStateFor({ questDay, questProgress, questsClaimed, questAllClaimed }, now);
  const defs = questsForDay(quests.questDay);
  const claimableQuests = defs.filter((d) => questComplete(quests, d) && !quests.questsClaimed.includes(d.id));
  return {
    gift,
    giftReady: giftClaimable(gift, now),
    cycleDay: nextGiftDay(gift, now),
    quests,
    defs,
    claimableQuests,
  };
}

export function DailyButton() {
  const setOpen = useGame((s) => s.setDailyOpen);
  const { giftReady, claimableQuests } = useDailyState();
  const waiting = (giftReady ? 1 : 0) + claimableQuests.length;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="מתנה יומית ומשימות"
      className={`flex h-11 shrink-0 items-center gap-1 rounded-full bg-black/40 px-3 ring-1 active:scale-90 ${
        waiting > 0 ? 'anim-breathe ring-goo' : 'ring-hairline'
      }`}
    >
      <span className="text-lg">🎁</span>
      {waiting > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-goo px-1 text-xs font-bold text-void tabular">
          {waiting}
        </span>
      )}
    </button>
  );
}

export function DailyOverlay() {
  const open = useGame((s) => s.dailyOpen);
  const setOpen = useGame((s) => s.setDailyOpen);
  const claimDailyGift = useGame((s) => s.claimDailyGift);
  const claimQuest = useGame((s) => s.claimQuest);
  const characters = useGame((s) => s.characters);
  const m = useGame(selectMods);
  const { giftReady, cycleDay, quests, defs } = useDailyState();

  // Previews in the player's own numbers — a quest without a visible prize
  // is a chore. All three amounts scale with income exactly like the payout.
  const perSec = useMemo(() => gooPerSec(characters, m), [characters, m]);
  const questPays = Math.max(Math.round(perSec * questReward.incomeSeconds), questReward.minGoo);
  const allBonusPays = Math.max(Math.round(perSec * questAllBonus.incomeSeconds), questAllBonus.minGoo);
  const reward = giftRewardFor(cycleDay);
  const giftLabel =
    reward.kind === 'egg' ? 'בֵּיצָה! 🥚' : `+${formatGoo(Math.max(Math.round(perSec * reward.incomeSeconds), reward.minGoo))} גּוּ`;

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-6"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="surface anim-pop-in flex max-h-[86vh] w-full max-w-sm flex-col overflow-y-auto rounded-3xl p-5"
        style={{ boxShadow: '0 0 0 2px #A3FF12, 0 24px 60px -20px #000' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 text-center font-display text-3xl text-bone">🎁 הַיּוֹמִי שֶׁלִּי</div>

        {/* ── the 7-day gift ── */}
        <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-hairline">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold text-bone">מַתָּנָה יוֹמִית</span>
            <span className="text-xs text-bone/60">יוֹם {cycleDay} מִתּוֹךְ {GIFT_CYCLE_DAYS}</span>
          </div>
          {/* the week strip: where you are in the cycle, and that day 7 is the egg */}
          <div className="mb-3 flex gap-1">
            {Array.from({ length: GIFT_CYCLE_DAYS }, (_, i) => i + 1).map((d) => (
              <span
                key={d}
                className={`flex h-8 flex-1 items-center justify-center rounded-lg text-xs font-bold tabular ${
                  d < cycleDay || (!giftReady && d === cycleDay)
                    ? 'bg-goo/30 text-goo'
                    : d === cycleDay
                      ? 'bg-goo text-void'
                      : 'bg-black/30 text-bone/40'
                }`}
              >
                {d === GIFT_CYCLE_DAYS ? '🥚' : d}
              </span>
            ))}
          </div>
          <button
            type="button"
            disabled={!giftReady}
            onClick={claimDailyGift}
            className={`h-12 w-full rounded-full font-display text-lg ${
              giftReady ? 'bg-goo text-void active:scale-95' : 'bg-black/30 text-bone/40'
            }`}
          >
            {/* When it isn't ready, today's already claimed — so cycleDay (and
                giftLabel) now point at tomorrow's slot. Name that reward so the
                player can see what coming back tomorrow is worth. */}
            {giftReady ? `לָקַחַת אֶת הַמַּתָּנָה — ${giftLabel}` : `מָחָר: ${giftLabel} ✨`}
          </button>
        </div>

        {/* ── today's quests ── */}
        <div className="mt-3 rounded-2xl bg-black/30 p-4 ring-1 ring-hairline">
          <div className="mb-2 font-bold text-bone">הַמְּשִׂימוֹת שֶׁל הַיּוֹם</div>
          <div className="flex flex-col gap-2">
            {defs.map((def) => {
              const progress = questProgressOf(quests, def);
              const done = questComplete(quests, def);
              const claimed = quests.questsClaimed.includes(def.id);
              return (
                <div key={def.id} className="rounded-xl bg-black/30 p-3 ring-1 ring-hairline">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{def.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold leading-snug text-bone">{def.nameHe}</span>
                      {!claimed && (
                        <span className="block text-xs text-goo">פְּרָס: +{formatGoo(questPays)} גּוּ</span>
                      )}
                    </span>
                    {claimed ? (
                      <span className="text-xs font-bold text-goo">✓ נֶאֱסַף</span>
                    ) : done ? (
                      <button
                        type="button"
                        onClick={() => claimQuest(def.id)}
                        className="h-9 shrink-0 rounded-full bg-goo px-4 text-sm font-bold text-void active:scale-95"
                      >
                        לָקַחַת +{formatGoo(questPays)}
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs text-bone/60 tabular" dir="ltr">
                        {progress}/{def.target}
                      </span>
                    )}
                  </div>
                  {!claimed && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
                      <div
                        className={`h-full rounded-full ${done ? 'bg-goo' : 'bg-cy'}`}
                        style={{ width: `${Math.round((progress / def.target) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-center text-xs text-bone/60">
            מַשְׁלִימִים אֶת שְׁלָשְׁתָּן — עוֹד +{formatGoo(allBonusPays)} גּוּ בּוֹנוּס! 🌟
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-4 h-12 w-full shrink-0 rounded-full bg-cy font-display text-xl text-void active:scale-95"
        >
          סְגֹר
        </button>
      </div>
    </div>
  );
}
