// "מידע" — the one place that explains every number and icon on the main screen.
// Opened from the info button under the creature. Shows the live breakdown of
// what you earn, plus a legend so a kid can tell what each symbol means.

import { createPortal } from 'react-dom';
import { ABILITY_META, abilityPct } from '../game/abilities';
import { autoClicksPerSec } from '../game/economy';
import { charactersById } from '../game/characters';
import { formatGoo } from '../game/format';
import {
  selectActiveAbility,
  selectClickPower,
  selectGooPerSec,
  selectStarBonus,
  useGame,
} from '../store';

function Row({
  icon,
  label,
  value,
  hint,
  strong,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
        strong ? 'bg-goo/15 ring-1 ring-goo/40' : 'bg-black/25 ring-1 ring-hairline'
      }`}
    >
      <span className="w-7 shrink-0 text-center text-lg">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${strong ? 'font-bold text-goo' : 'text-bone'}`}>{label}</div>
        {hint && <div className="text-[11px] text-bone/50">{hint}</div>}
      </div>
      <span className={`shrink-0 font-display tabular ${strong ? 'text-goo' : 'text-pop'}`} dir="ltr">
        {value}
      </span>
    </div>
  );
}

export function InfoOverlay() {
  const open = useGame((s) => s.infoOpen);
  const setOpen = useGame((s) => s.setInfoOpen);
  const creatureRate = useGame(selectGooPerSec);
  const perClick = useGame(selectClickPower);
  const starBonus = useGame(selectStarBonus);
  const ability = useGame(selectActiveAbility);
  const autoTapLevel = useGame((s) => s.upgrades.autoTap);
  const mainId = useGame((s) => s.equippedMain);

  if (!open) return null;

  const tapsPerSec = autoClicksPerSec(autoTapLevel);
  const robotRate = perClick * tapsPerSec;
  const total = creatureRate + robotRate;
  const mainName = mainId ? charactersById[mainId].nameHe : 'בְּלוֹרְבּוֹ';

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-6"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="surface anim-pop-in flex max-h-[86vh] w-full max-w-sm flex-col rounded-3xl p-5"
        style={{ boxShadow: '0 0 0 2px #00E5FF, 0 24px 60px -20px #000' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-1 text-center font-display text-3xl text-bone">ℹ️ הַמִּידָע שֶׁלִּי</div>
        <p className="mb-3 text-center text-xs text-bone/55">מֵאֵיפֹה מַגִּיעַ הַגּוּ שֶׁלְּךָ?</p>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-1">
          <Row
            icon="🟢"
            label="הַיְּצוּרִים שֶׁלְּךָ"
            hint="מרוויחים כל הזמן, גם כשלא לוחצים"
            value={`${formatGoo(creatureRate)}/ש׳`}
          />
          {tapsPerSec > 0 && (
            <Row
              icon="🤖"
              label="יָד רוֹבּוֹטִית"
              hint={`לוחצת ${tapsPerSec.toFixed(2)} פעמים בשנייה בשבילך`}
              value={`${formatGoo(robotRate)}/ש׳`}
            />
          )}
          <Row icon="💰" label="סַךְ הַכֹּל לְשָׁנִיָּה" value={`${formatGoo(total)}/ש׳`} strong />

          <div className="pt-2 text-center text-[11px] font-bold text-bone/45">בַּלְּחִיצוֹת</div>
          <Row icon="👆" label="כָּל נְגִיעָה שָׁוָה" value={formatGoo(perClick)} />

          {(starBonus > 0 || ability) && (
            <div className="pt-2 text-center text-[11px] font-bold text-bone/45">הַבּוֹנוּסִים שֶׁלְּךָ</div>
          )}
          {starBonus > 0 && (
            <Row
              icon="⭐"
              label="בּוֹנוּס הֶשֵּׂגִים"
              hint="קבוע — מכל ההישגים שאספת"
              value={`+${Math.round(starBonus * 100)}%`}
            />
          )}
          {ability && (
            <Row
              icon={ABILITY_META[ability.type].icon}
              label={`יְכֹלֶת שֶׁל ${mainName}`}
              hint={ABILITY_META[ability.type].descHe(abilityPct(ability))}
              value={`+${abilityPct(ability)}%`}
            />
          )}

          <div className="mt-3 rounded-2xl bg-black/25 p-3 ring-1 ring-hairline">
            <div className="mb-1.5 text-center text-xs font-bold text-cy">מַקְרָא סְמָלִים</div>
            <div className="space-y-1 text-[11px] text-bone/70">
              <div>🟢 הכנסה מהיצורים · 🤖 יד רובוטית · 👆 עוצמת נגיעה</div>
              <div>⭐ בונוס הישגים · 🍀 מזל · ⚡ מכה קריטית</div>
              <div>🔥 בונוס קומבו · 🎁 בונוס זהב · 🎯 הדמות שבמסך</div>
              <div className="pt-1 text-bone/50">״/ש׳״ = לכל שנייה</div>
            </div>
          </div>
        </div>

        <button type="button" onClick={() => setOpen(false)} className="btn mt-4 w-full bg-cy py-3 text-lg text-void">
          סְגוֹר
        </button>
      </div>
    </div>,
    document.body,
  );
}
