// The reveal moment (§7.4) — the game's headline beat.
// Egg shakes → burst in the rarity color → creature drops in → name is stamped.
// Intensity rises with rarity; legendary gets the loud treatment.
// Duplicates are never framed as a loss (§7.3). Honors reduced-motion.

import { useEffect, useMemo, useRef, useState } from 'react';
import { playClick, playCrack } from '../audio/sfx';
import { speakName } from '../audio/speech';
import { playJingle } from '../audio/synth';
import { charactersById } from '../game/characters';
import { creatureContribution } from '../game/economy';
import { formatGoo } from '../game/format';
import type { HatchOutcome } from '../game/hatching';
import type { CharId, Rarity } from '../game/types';
import { selectMods, useGame } from '../store';
import { CharacterBody } from './characters';
import { EggArt, MAX_EGG_CRACKS } from './EggArt';
import { haptic } from './haptics';
import { rarityBackground, rarityColor, rarityLabelHe, isShareworthy } from './rarity';
import { shareCreature } from './shareCard';
import { useReducedMotion } from './useReducedMotion';

// A shell chip flung loose by a tap: where it starts (% of the egg button) and
// where it drifts to (px), plus a spin and a shell tint.
interface Shard {
  id: number;
  left: number;
  top: number;
  sx: number;
  sy: number;
  sr: number;
  color: string;
  size: number;
}

const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
// The suspense builds longer for rarer pulls.
const SHAKE_MS_BY_RARITY: Record<Rarity, number> = {
  common: 950,
  uncommon: 1200,
  rare: 1700,
  legendary: 2400,
};
const SHAKING_TEXT: Record<Rarity, string> = {
  common: 'לְחַץ לִפְתֹּחַ! 🥚',
  uncommon: 'לְחַץ שׁוּב וְשׁוּב!',
  rare: 'מַשֶּׁהוּ טוֹב בִּפְנִים… תִּשְׁבֹּר!',
  legendary: 'מַשֶּׁהוּ עֲנָק!! תִּשְׁבֹּר מַהֵר!',
};

export function HatchReveal() {
  const outcome = useGame((s) => s.hatchResult);
  const dismiss = useGame((s) => s.dismissHatch);
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<'shaking' | 'revealed'>('shaking');
  const [taps, setTaps] = useState(0);
  // Shell chips that fly off on each tap — the "I'm peeling it open" feedback.
  const [shards, setShards] = useState<Shard[]>([]);
  const shardId = useRef(0);

  const rarity = outcome?.rarity ?? 'common';
  const rarityLevel = RARITY_RANK[rarity];
  const shakeMs = SHAKE_MS_BY_RARITY[rarity];
  // Rarer eggs take noticeably more taps to crack open.
  const tapsNeeded = Math.min(MAX_EGG_CRACKS, 3 + rarityLevel * 2); // common 3 → legendary 9

  // Sparks converging on the egg during the buildup.
  const sparks = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 8 + Math.random() * 0.5;
      const d = 110 + Math.random() * 70;
      return { id: i, sx: Math.cos(a) * d, sy: Math.sin(a) * d };
    });
  }, [outcome]);

  // Reset to the cracking phase whenever a fresh egg arrives.
  useEffect(() => {
    if (!outcome) return;
    setTaps(0);
    setShards([]);
    setStage(reduced ? 'revealed' : 'shaking');
  }, [outcome, reduced]);

  // Cracking is fully tap-driven — the egg never opens on its own (§ user
  // request). Each tap cracks it a little more; when it's cracked enough, it
  // bursts. A soft first-thump gives feedback the moment it appears.
  const onTap = () => {
    if (stage !== 'shaking') return;
    const muted = useGame.getState().muted;
    setTaps((n) => {
      const next = n + 1;
      haptic(10 + Math.min(70, next * 14));
      playClick(muted, next * 4);
      if (next >= tapsNeeded) setStage('revealed');
      return next;
    });
    if (reduced) return;
    // Break a couple of shell chips loose from the egg's edge; they arc down and
    // fade, then evict themselves so the list never grows unbounded.
    const fresh: Shard[] = Array.from({ length: 2 }, () => {
      const id = shardId.current++;
      return {
        id,
        left: 50 + (Math.random() * 56 - 28),
        top: 40 + Math.random() * 28,
        sx: Math.random() * 44 - 22,
        sy: 60 + Math.random() * 70,
        sr: Math.random() * 540 - 270,
        color: Math.random() > 0.5 ? '#FFF7E8' : '#EFDDBB',
        size: 9 + Math.random() * 6,
      };
    });
    setShards((s) => [...s, ...fresh]);
    const ids = new Set(fresh.map((f) => f.id));
    window.setTimeout(() => setShards((s) => s.filter((x) => !ids.has(x.id))), 820);
  };

  // The crack, the jingle, the spoken name, confetti and haptics on reveal.
  // muted is read fresh so toggling it mid-reveal never replays anything.
  useEffect(() => {
    if (!outcome || stage !== 'revealed') return;
    const muted = useGame.getState().muted;
    playCrack(muted, rarityLevel);
    playJingle(charactersById[outcome.charId].sound, muted);
    const nameTimer = window.setTimeout(
      () => speakName(charactersById[outcome.charId].nameHe, useGame.getState().muted),
      340,
    );
    const r = outcome.rarity;
    if (r === 'legendary') {
      useGame.getState().triggerConfetti('rainbow');
      haptic([0, 60, 40, 60, 40, 90]);
    } else if (r === 'rare') {
      useGame.getState().triggerConfetti('confetti');
      haptic([0, 40, 30, 60]);
    } else {
      haptic(30);
    }
    return () => window.clearTimeout(nameTimer);
  }, [outcome, stage, rarityLevel]);

  if (!outcome) return null;

  const def = charactersById[outcome.charId];
  const legendary = outcome.rarity === 'legendary';
  const showBurst = stage === 'revealed';

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden p-6 ${
        // Screen-shake only for rare+ (art audit): shaking on every common —
        // the game's most frequent action — dilutes the big moments to noise.
        showBurst && !reduced && isShareworthy(rarity) ? 'anim-screen-shake' : ''
      }`}
      style={{ backgroundColor: 'rgba(6,2,14,0.94)' }}
    >
      {stage === 'shaking' ? (
        <div className="flex flex-col items-center">
          <button
            type="button"
            onPointerDown={onTap}
            aria-label="לחץ לפתוח את הביצה"
            className="relative flex h-60 w-60 touch-none select-none items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-cy active:scale-95"
          >
            {!reduced && (
              <span
                className="anim-charge pointer-events-none absolute inset-0 rounded-full"
                style={
                  {
                    background: `radial-gradient(circle, ${rarityColor[rarity]}, transparent 62%)`,
                    '--chg': `${shakeMs}ms`,
                  } as React.CSSProperties
                }
              />
            )}
            {!reduced &&
              sparks.map((s) => (
                <span
                  key={s.id}
                  className="anim-spark-in pointer-events-none absolute h-3 w-3 rounded-full"
                  style={
                    {
                      left: '50%',
                      top: '50%',
                      marginLeft: -6,
                      marginTop: -6,
                      background: rarityColor[rarity],
                      '--sx': `${s.sx}px`,
                      '--sy': `${s.sy}px`,
                    } as React.CSSProperties
                  }
                />
              ))}
            <EggArt
              spotColor={rarityColor[rarity]}
              crackColor={rarityColor[rarity]}
              cracks={taps}
              peek={Math.min(1, taps / tapsNeeded)}
              className={`relative h-[220px] w-[176px] glow-goo ${reduced || taps > 0 ? '' : 'anim-egg-shake'}`}
              style={reduced ? undefined : { animationDuration: `${Math.max(0.14, 0.28 - rarityLevel * 0.04)}s` }}
            />
            {shards.map((sh) => (
              <span
                key={sh.id}
                className="anim-shell-fall pointer-events-none absolute z-10"
                style={
                  {
                    left: `${sh.left}%`,
                    top: `${sh.top}%`,
                    width: sh.size,
                    height: sh.size,
                    background: sh.color,
                    clipPath: 'polygon(50% 0%, 100% 82%, 0% 82%)',
                    '--sx': `${sh.sx}px`,
                    '--sy': `${sh.sy}px`,
                    '--sr': `${sh.sr}deg`,
                  } as React.CSSProperties
                }
              />
            ))}
          </button>
          <p className="mt-8 font-display text-2xl" style={{ color: rarityLevel >= 2 ? rarityColor[rarity] : '#FFF4E0D9' }}>
            {SHAKING_TEXT[rarity]}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-64 w-64 items-center justify-center">
            {!reduced && (
              <>
                <span
                  className="anim-burst absolute inset-0 rounded-full"
                  style={{ background: rarityBackground(outcome.rarity), opacity: legendary ? 0.95 : 0.7 }}
                />
                <span
                  className="anim-ring-out absolute inset-0 rounded-full"
                  style={{ boxShadow: `0 0 0 6px ${rarityColor[outcome.rarity]}` }}
                />
              </>
            )}
            <div
              className="relative flex h-48 w-48 items-center justify-center rounded-[2rem]"
              style={{ background: rarityBackground(outcome.rarity), boxShadow: `0 0 60px -8px ${rarityColor[outcome.rarity]}` }}
            >
              <CharacterBody id={outcome.charId} className={`h-40 w-40 ${reduced ? '' : 'anim-drop-in'}`} />
            </div>
          </div>

          <div
            className="mt-7 inline-block rounded-full px-5 py-1.5 text-sm font-bold text-void"
            style={{ background: rarityBackground(outcome.rarity) }}
          >
            {rarityLabelHe[outcome.rarity]}
          </div>

          <h2
            className="mt-3 font-display text-5xl"
            style={{
              color: legendary ? '#FFD84D' : rarityColor[outcome.rarity],
              textShadow: `0 0 24px ${rarityColor[outcome.rarity]}66`,
            }}
          >
            {def.nameHe}
          </h2>

          <RevealMessage outcome={outcome} />

          {isShareworthy(outcome.rarity) && <ShareButton id={outcome.charId} />}

          <button
            type="button"
            onClick={dismiss}
            className="btn mt-6 bg-cy px-12 py-4 text-xl text-void"
          >
            יֵשׁ!
          </button>
        </div>
      )}
    </div>
  );
}

function ShareButton({ id }: { id: CharId }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await shareCreature(id);
      setDone(true);
      window.setTimeout(() => setDone(false), 2500);
    } catch {
      /* ignore — user can try again */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onShare}
      disabled={busy}
      className="btn mt-6 flex items-center gap-2 bg-hot px-8 py-3 text-lg text-bone glow-hot"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#FFF4E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="9" width="18" height="12" rx="2" />
        <path d="M12 15V3M12 3l-4 4M12 3l4 4" />
      </svg>
      {done ? 'נשמר!' : busy ? 'רגע…' : 'שמור תמונה'}
    </button>
  );
}

function RevealMessage({ outcome }: { outcome: HatchOutcome }) {
  const def = charactersById[outcome.charId];
  const held = useGame((s) => s.characters[outcome.charId]);
  const m = useGame(selectMods);
  const rarity = outcome.rarity;

  if (outcome.kind === 'new') {
    const income = held ? creatureContribution(rarity, held, m) : 0;
    return (
      <>
        <p className="mt-3 text-lg text-goo">יְצוּר חָדָשׁ הִצְטָרֵף לָאוֹסֶף!</p>
        <p className="mt-1 text-sm text-cy tabular">מַרְוִיחַ {formatGoo(income)} גּוּ/שנייה</p>
      </>
    );
  }
  // How much more this creature now earns thanks to the level it just gained —
  // its true contribution to goo/sec, with all automation multipliers folded in.
  const delta = held
    ? creatureContribution(rarity, held, m) -
      creatureContribution(rarity, { level: held.level - 1, evolution: held.evolution }, m)
    : 0;
  return (
    <>
      <p className="mt-3 text-lg text-goo tabular">
        {def.nameHe} הִתְחַזֵּק! רָמָה {outcome.level}
      </p>
      <p className="mt-1 text-sm text-cy tabular">+{formatGoo(delta)} גּוּ/שנייה</p>
    </>
  );
}
