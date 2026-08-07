// Plausibility bounds for a save delta (PR 5). Pure — no window, no React, no
// store — so the SERVER runs this exact function rather than a reimplementation
// of it (see worker/src/rules.ts). Golden-locked like every other shared rule.
//
// WHAT THIS IS
// Given a save and how much wall-clock time really passed (measured by the
// SERVER, never taken from the client), this computes the most goo a player
// could possibly have earned in that window if every advantage in the game were
// stacked in their favour the entire time. A reported gain above that ceiling
// cannot be explained by playing.
//
// WHAT THIS IS NOT
// It is not proof of cheating and it is not a simulation of what a player
// actually did. It is a ceiling, and it is deliberately a GENEROUS one. The
// stated goal (see CLAUDE.md) is to make cheating "too expensive to bother",
// not to catch every cheat — and the failure modes are wildly asymmetric: a
// missed cheat costs a leaderboard place, while a false positive punishes a
// real child for playing well. So every judgement call below rounds in the
// player's favour, and the caller is expected to treat a breach as a signal to
// record, not a reason to reject.
//
// The multiplier ceilings are DERIVED from the balance and event tables rather
// than copied as literals. If a future event is added with a bigger multiplier,
// this ceiling rises with it automatically — a hardcoded number would silently
// start flagging honest players the day that event shipped.

import { adRewardMult, critChanceCap, critMultiplier, frenzyMultiplier, luckCap, secondAbilityRebirth, thirdAbilityRebirth } from './balance';
import { abilityForType, abilityOf } from './abilities';
import { charactersById } from './characters';
import { accessoryIncomeBonus, backgroundIncomeBonus, clickCosmeticBonus } from './cosmetics';
import { EVENTS } from './events';
import { autoClicksPerSec, effectiveClickPower, gooPerSec, modifiersFrom, rebirthGlobalMult } from './economy';
import { starBonusFor } from './achievements';
import type { SaveState } from './types';

/**
 * Physical tap ceiling. Originally 25/sec ("well above a fast adult's ~10"),
 * and real play keeps disproving it: first two players pinned exactly 25×60 for
 * a full minute (raised to 50), then players began pinning 50×60 = 3000 on the
 * speed challenge — the whole-screen tap surface counts EVERY finger, so ten
 * fingers drumming ~10/sec each reach ~100/sec together. Raised to 100/sec
 * (6000/min) so an honest multi-touch record can't hit the wall; still far
 * below anything a script does, and tap-goo is dwarfed by passive income
 * anyway, so the looser tap bound doesn't meaningfully help a cheater.
 */
export const maxHumanTapsPerSec = 100;

/**
 * Floor on the measured interval. Two saves can land within milliseconds of
 * each other (a checkpoint racing a pagehide push), and dividing a real gain by
 * a near-zero window would manufacture an enormous apparent rate. Treating any
 * interval as at least this long removes that whole class of false positive.
 */
export const minIntervalSeconds = 10;

/**
 * A flat allowance on top of the computed ceiling, in goo. Covers the small,
 * awkward-to-model grants — a collected bonus button, a milestone reward
 * landing right at the boundary, an offline report applied a moment after the
 * previous save was written. Small enough to be irrelevant to a real cheat,
 * which overshoots by orders of magnitude, not by a few taps' worth.
 */
export const plausibilityGraceGoo = 10_000;

/** The largest income multiplier any single event grants. */
export const maxEventIncomeMult = EVENTS.reduce((max, e) => Math.max(max, e.incomeMult), 1);

/** The largest tap multiplier any single event grants. */
export const maxEventClickMult = EVENTS.reduce((max, e) => Math.max(max, e.clickMult), 1);

/** Modifiers for a save, folded together exactly as the client does. */
function modsFor(save: SaveState) {
  const m = modifiersFrom(
    save.upgrades,
    starBonusFor(save.achievements),
    clickCosmeticBonus(save.equippedBlob, save.equippedAccessory),
    backgroundIncomeBonus(save.equippedBackground) + accessoryIncomeBonus(save.equippedAccessory),
    save.prestigeCrystals,
  );
  // Global rebirth income bonus, exactly as the client's modsOf does. Clamped
  // inside rebirthGlobalMult (per-creature + global caps), so a forged rebirth
  // count can't inflate the ceiling past the legitimate maximum.
  m.rebirthMultiplier = rebirthGlobalMult(save.characters);
  // Fold the equipped-main creature's ability, exactly as the client's modsOf
  // does (store.ts) — otherwise the ceiling is structurally blind to up to +40%
  // tap/income a real player legitimately earns, so it would drift from the game
  // and become a false-positive source the moment the ceiling's other slack is
  // tightened. Only the modifier-affecting types fold in (tap/income/crit/luck);
  // combo/bonus live where those mechanics apply, and the ceiling's own
  // event/ad/frenzy assumptions cover the rest. (Event luck is intentionally NOT
  // added here — the ceiling already assumes a permanent maximum event.)
  const id = save.equippedMain;
  if (id && save.characters[id] && charactersById[id as keyof typeof charactersById]) {
    // Fold in the rebirth-boosted ability. abilityOf clamps the count to
    // rebirthCap, so a save claiming a huge rebirth count still credits at most
    // the legitimate maximum — the ceiling can't be inflated past what a real
    // maxed-rebirth player earns. The matching income bonus rides in through
    // gooPerSec below (ownedCreatureIncome folds rebirthIncomeMult, same clamp).
    const ab = abilityOf(
      id,
      charactersById[id as keyof typeof charactersById].rarity,
      save.characters[id]?.rebirths ?? 0,
    );
    if (ab.type === 'tap') m.clickMultiplier *= 1 + ab.value;
    else if (ab.type === 'income') m.incomeMultiplier *= 1 + ab.value;
    else if (ab.type === 'crit') m.critChance = Math.min(critChanceCap, m.critChance + ab.value);
    else if (ab.type === 'luck') m.luck = Math.min(luckCap, m.luck + ab.value);

    // Fold the earned SECOND ability too (unlocked at rebirth 10, chosen type
    // != native, standard rarity value), exactly as the client's modsOf does —
    // otherwise the ceiling is blind to the extra tap/income a legit player earns
    // from it. Gated on the same threshold so a forged secondAbility on a
    // low-rebirth creature can't inflate the ceiling.
    const held = save.characters[id];
    const rarity = charactersById[id as keyof typeof charactersById].rarity;
    if (held && (held.rebirths ?? 0) >= secondAbilityRebirth && held.secondAbility && held.secondAbility !== ab.type) {
      const ab2 = abilityForType(held.secondAbility, rarity);
      if (ab2.type === 'tap') m.clickMultiplier *= 1 + ab2.value;
      else if (ab2.type === 'income') m.incomeMultiplier *= 1 + ab2.value;
      else if (ab2.type === 'crit') m.critChance = Math.min(critChanceCap, m.critChance + ab2.value);
      else if (ab2.type === 'luck') m.luck = Math.min(luckCap, m.luck + ab2.value);
    }

    // Fold the earned THIRD ability too (unlocked at the final rebirth, chosen
    // type != native AND != second, standard rarity value). Same gating so a
    // forged thirdAbility below the threshold — or one duplicating the native or
    // second slot — can't inflate the ceiling.
    if (
      held &&
      (held.rebirths ?? 0) >= thirdAbilityRebirth &&
      held.thirdAbility &&
      held.thirdAbility !== ab.type &&
      held.thirdAbility !== held.secondAbility
    ) {
      const ab3 = abilityForType(held.thirdAbility, rarity);
      if (ab3.type === 'tap') m.clickMultiplier *= 1 + ab3.value;
      else if (ab3.type === 'income') m.incomeMultiplier *= 1 + ab3.value;
      else if (ab3.type === 'crit') m.critChance = Math.min(critChanceCap, m.critChance + ab3.value);
      else if (ab3.type === 'luck') m.luck = Math.min(luckCap, m.luck + ab3.value);
    }
  }
  return m;
}

export interface PlausibilityCeiling {
  /** Most goo obtainable in the interval, all advantages stacked. */
  maxGain: number;
  /** The interval actually used, after applying minIntervalSeconds. */
  effectiveSeconds: number;
  /** Passive goo/sec at this save's state, before event/ad multipliers. */
  passivePerSec: number;
  /** Goo per tap at this save's state, before crit/frenzy/event multipliers. */
  perTap: number;
}

/**
 * The ceiling itself. Assumes, simultaneously and for the entire interval:
 * a permanent maximum-multiplier event, a permanent ad boost, every tap a
 * critical hit landing inside a permanent frenzy, and the player tapping at
 * the physical maximum on top of a fully-levelled robot hand. No real session
 * looks like this — that is the point.
 *
 * Note it uses the LATER save's state, which is the more generous reading:
 * a player who bought creatures mid-interval gets credited as though they had
 * owned them the whole time.
 */
export function plausibilityCeiling(save: SaveState, elapsedSeconds: number): PlausibilityCeiling {
  const effectiveSeconds = Math.max(minIntervalSeconds, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const m = modsFor(save);

  const passivePerSec = gooPerSec(save.characters, m);
  // Must use the SAME floor the game pays out (see effectiveClickPower): a
  // ceiling computed from the upgrade value alone would sit below what a deep
  // player legitimately earns per tap, and flag them for playing normally.
  const perTap = effectiveClickPower(m, passivePerSec);
  const tapsPerSec = maxHumanTapsPerSec + autoClicksPerSec(save.upgrades.autoTap);

  const incomeCeiling = passivePerSec * maxEventIncomeMult * adRewardMult;
  const tapCeiling = perTap * tapsPerSec * maxEventClickMult * frenzyMultiplier * critMultiplier * adRewardMult;

  return {
    maxGain: (incomeCeiling + tapCeiling) * effectiveSeconds + plausibilityGraceGoo,
    effectiveSeconds,
    passivePerSec,
    perTap,
  };
}

export type PlausibilityFlag =
  /** lifetimeGoo grew by more than the ceiling allows. */
  | 'goo-rate'
  /** More taps reported than a human plus their robot hand could produce. */
  | 'click-rate'
  /** lifetimeGoo went DOWN — it is monotonic, so this is a rewritten save. */
  | 'lifetime-goo-decreased'
  /** The tap count went DOWN — clicks are monotonic in an honest save, so a
   * decrease means a rewritten/edited (or diverging cross-device) save. */
  | 'clicks-decreased'
  /**
   * The client says this decrease is a deliberate rollback (the player used
   * "restore my other save"). Recorded ALONGSIDE the decrease flag, never
   * instead of it — this is an unverified claim, not proof, and hiding the
   * decrease would let anyone erase the signal by asserting it. It exists so
   * the collected data can separate "a player pressed the button we gave them"
   * from "unexplained", which otherwise look identical and would poison the
   * evidence a threshold is eventually chosen from.
   */
  | 'rollback-claimed'
  /**
   * The client says this large jump is a cross-device / pre-auth progress
   * MERGE, not fabrication: a device adopted bigger progress it had already
   * earned elsewhere (see decideMergeWinner), which lands as one lump and reads
   * as an impossible per-second rate. Recorded ALONGSIDE the rate flag it
   * accompanies, never instead of it — same philosophy as rollback-claimed: the
   * ratio still goes on record for tuning, a spoofed claim stays visible, and it
   * is the WORKER's barring logic (not this function) that decides a
   * merge-annotated row does not bench the player. Still bounded server-side by
   * MAX_GOO, exactly like a first save.
   */
  | 'merge-claimed';

export interface PlausibilityVerdict {
  ok: boolean;
  flags: PlausibilityFlag[];
  /** Reported lifetimeGoo gain over the interval. */
  gooGain: number;
  /** The ceiling that gain was measured against. */
  maxGain: number;
  /** Reported tap-count gain over the interval. */
  clickGain: number;
  /** The tap ceiling that gain was measured against. */
  maxClicks: number;
  /**
   * gooGain / maxGain. This is the number worth STORING, not just the pass/fail
   * — the ceiling is deliberately a loose bound (every tap a crit, inside a
   * permanent frenzy, under a permanent ad boost and a permanent maximum
   * event), so honest play lands orders of magnitude below 1 and only gross
   * fabrication exceeds it. Accumulating real ratios is what will let a later
   * PR set a tight, evidence-based threshold instead of a guessed one. Until
   * then, be honest that this catches gross cheating only.
   */
  ratio: number;
}

/**
 * Compare two consecutive saves from the same account.
 *
 * `elapsedSeconds` MUST come from the server's own clock (the gap between the
 * stored write time and now). Reading it from the save's own `lastSeen` would
 * hand the cheater the very number that bounds them.
 *
 * `previous` is null for an account's first-ever save, which nothing can be
 * compared against — that is reported as ok with no flags rather than as
 * suspicious, because everyone has a first save and most first saves are also
 * a migration of real, legitimately-earned progress from before accounts
 * existed.
 */
export function verifySaveDelta(
  previous: SaveState | null,
  next: SaveState,
  elapsedSeconds: number,
  ctx: { rollbackClaimed?: boolean; mergeClaimed?: boolean } = {},
): PlausibilityVerdict {
  const ceiling = plausibilityCeiling(next, elapsedSeconds);
  const maxClicks = (maxHumanTapsPerSec + autoClicksPerSec(next.upgrades.autoTap)) * ceiling.effectiveSeconds;

  if (!previous) {
    return { ok: true, flags: [], gooGain: 0, maxGain: ceiling.maxGain, clickGain: 0, maxClicks, ratio: 0 };
  }

  const gooGain = next.lifetimeGoo - previous.lifetimeGoo;
  const clickGain = next.clicks - previous.clicks;
  const flags: PlausibilityFlag[] = [];

  // lifetimeGoo and clicks only ever grow within an honest save. Going
  // backwards means the save was edited, or two devices are diverging — worth
  // knowing about either way, and cheap to spot.
  if (gooGain < 0) flags.push('lifetime-goo-decreased');
  else if (gooGain > ceiling.maxGain) flags.push('goo-rate');

  if (clickGain < 0) flags.push('clicks-decreased');
  else if (clickGain > maxClicks) flags.push('click-rate');

  // Annotate, never excuse. The decrease flags stay exactly as they were.
  if (ctx.rollbackClaimed && (gooGain < 0 || clickGain < 0)) flags.push('rollback-claimed');

  // Same "annotate, never excuse" rule for a claimed cross-device merge: the
  // rate flag it rode in on stays (the ratio is still recorded, a spoof is
  // still visible); this only marks it so the worker's barring logic can spare
  // an honest device-linking event. Bounded by MAX_GOO server-side regardless.
  if (ctx.mergeClaimed && (flags.includes('goo-rate') || flags.includes('click-rate'))) {
    flags.push('merge-claimed');
  }

  return {
    ok: flags.length === 0,
    flags,
    gooGain,
    maxGain: ceiling.maxGain,
    clickGain,
    maxClicks,
    ratio: ceiling.maxGain > 0 ? gooGain / ceiling.maxGain : 0,
  };
}

/**
 * Sanity bound on owned creatures: a save can't own a creature it never
 * hatched. Cheap structural check that doesn't depend on timing at all, so it
 * catches an edited save even on a first upload where there's nothing to diff.
 */
export function ownsImpossibleCreatures(save: SaveState): boolean {
  const owned = Object.keys(save.characters).filter((id) => charactersById[id as keyof typeof charactersById]);
  // Creatures also arrive from click-unlocks, so hatches alone don't bound the
  // count — only flag the clear case of owning creatures with no hatches and
  // no clicks behind them at all.
  return owned.length > 0 && save.totalHatches === 0 && save.clicks === 0;
}
