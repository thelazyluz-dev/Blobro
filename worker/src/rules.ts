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
  eggCost,
  evolveCost,
  evolveIncomeMult,
  gooPerSec,
  modifiersFrom,
  ownedCreatureIncome,
  wealthPaybackMult,
} from '../../src/game/economy';

export { buyableEggs, hatch, openEggs, pickChar, rollRarity } from '../../src/game/hatching';

export { abilityOf } from '../../src/game/abilities';

export { computeOffline } from '../../src/game/offline';

export { isComplete, starBonusFor } from '../../src/game/achievements';

export { milestonesCrossed } from '../../src/game/milestones';

export { currentEvent, eventStateAt } from '../../src/game/events';

export * as balance from '../../src/game/balance';
