/**
 * The Worker's ONE import surface onto the shared, pure game rules.
 *
 * The owner's #1 rule: never lose a business rule. The mechanism is that the
 * server runs the exact same functions as the client — never a
 * reimplementation — so the two can never quietly drift apart. This barrel
 * re-exports from ../../src/game/* (the single source of truth) rather than
 * copying or restating anything, and gives the Worker one place to import
 * from. If the shared core ever moves to its own workspace package, only this
 * file's import specifiers need to change.
 *
 * Golden-vector contract tests (src/game/golden.test.ts and
 * worker/test/golden.test.ts) assert both the client's direct imports and
 * this barrel reproduce identical values — see src/game/__golden__/vectors.json.
 */

export {
  affordableCreatureLevels,
  autoClicksPerSec,
  charIncome,
  clickPower,
  creatureContribution,
  creatureIncome,
  creatureLevelCost,
  effectiveClickPower,
  eggCost,
  evolveCost,
  evolveIncomeMult,
  gooPerSec,
  maxCharLevel,
  modifiersFrom,
  ownedCreatureIncome,
  rebirthGlobalMult,
  totalRebirths,
  wealthPaybackMult,
} from '../../src/game/economy';

export { buyableEggs, hatch, openEggs, pickChar, rollRarity } from '../../src/game/hatching';

// The seeded outcome-RNG (crit rolls, hatching) — the server needs the exact
// same generator to replay/verify a client's reported draws (see
// src/game/rng.ts for the "why" and the resume-from-cursor contract).
export { createRng, randomSeed } from '../../src/game/rng';
export type { RngState } from '../../src/game/rng';

export { abilityForType, abilityOf } from '../../src/game/abilities';

export { computeOffline } from '../../src/game/offline';

export { isComplete, starBonusFor } from '../../src/game/achievements';

export { milestonesCrossed } from '../../src/game/milestones';

export { currentEvent, eventStateAt } from '../../src/game/events';

// Save shape + migration. The server accepts uploaded saves (PR 4), and it
// sanitizes them with the SAME migrate() the client loads with — so a save
// that round-trips through the cloud comes back byte-identical to one that
// never left the device, and neither side can invent a field the other drops.
export { CURRENT_VERSION, defaultSaveState, migrate } from '../../src/game/save';

// Plausibility bounds (PR 5). The server measures the interval with its own
// clock and asks these functions what was physically obtainable in it — same
// pure code the client ships, so the bound can't drift from the rules that
// produce the numbers it bounds.
export {
  ownsImpossibleCreatures,
  plausibilityCeiling,
  verifySaveDelta,
  maxHumanTapsPerSec,
  minIntervalSeconds,
} from '../../src/game/verify';
export type { PlausibilityFlag, PlausibilityVerdict } from '../../src/game/verify';

// Taps-per-minute record (the ⚡ board). The server never computes a CPM —
// only the client's rolling window does — but it clamps the claimed record to
// the same physical ceiling, so both sides share the one constant.
export { maxCpm } from '../../src/game/cpm';

// Nickname validation. This was enforced in the UI only, which meant anyone
// posting to /submit by hand could put whatever they liked on a leaderboard
// that children read. Same pure function both sides now.
export { isCleanNickname } from '../../src/game/profanity';

export * as balance from '../../src/game/balance';
