// Golden-vector contract tests — WORKER side. Identical assertions to
// src/game/golden.test.ts, but every rule function comes through
// worker/src/rules.ts (the Worker's one import surface onto the shared
// core) instead of a direct ../src/game import. If this file and the client
// file ever disagree on the same vectors.json, the shared core has drifted
// from what the Worker actually bundles — that's the whole point of this PR.

import { describe, expect, it } from 'vitest';
import {
  abilityOf,
  affordableCreatureLevels,
  autoClicksPerSec,
  balance,
  buyableEggs,
  charIncome,
  clickPower,
  computeOffline,
  createRng,
  creatureContribution,
  creatureIncome,
  creatureLevelCost,
  currentEvent,
  effectiveClickPower,
  eggCost,
  evolveCost,
  evolveIncomeMult,
  eventStateAt,
  gooPerSec,
  hatch,
  isComplete,
  migrate,
  milestonesCrossed,
  modifiersFrom,
  plausibilityCeiling,
  verifySaveDelta,
  openEggs,
  ownedCreatureIncome,
  pickChar,
  rollRarity,
  starBonusFor,
  wealthPaybackMult,
} from '../src/rules';
import vectors from '../../src/game/__golden__/vectors.json';

// achievements aren't in the deliberately-small rules.ts export surface (the
// Worker doesn't need the full achievement roster/UI copy), but isComplete
// does — this test still needs a def lookup by id, so pull the roster in
// directly from the shared source, same as rules.ts would if asked to.
import { achievements } from '../../src/game/achievements';

function replay(values: number[]): () => number {
  let i = 0;
  return () => {
    // Running past the recorded draws means the rule now consumes a DIFFERENT
    // number of random values than when the vector was generated — a real
    // behaviour change. Fail loudly rather than feed undefined into the rules,
    // which would silently poison comparisons (undefined < x is false, and
    // Math.floor(undefined * n) is NaN) and could pass by coincidence.
    if (i >= values.length) {
      throw new Error(
        `rng replay exhausted after ${values.length} draws — the rule consumed more randomness than the golden vector recorded`,
      );
    }
    return values[i++];
  };
}

function mods(p: { upgrades: any; achievementStarBonus: number; clickCosmeticBonus?: number; incomeCosmeticBonus?: number }) {
  return modifiersFrom(p.upgrades, p.achievementStarBonus, p.clickCosmeticBonus ?? 0, p.incomeCosmeticBonus ?? 0);
}

describe('worker rules barrel — sanity', () => {
  it('re-exports the balance namespace with real constants', () => {
    expect(balance.clickBase).toBe(1);
    expect(balance.maxEvolution).toBeGreaterThan(0);
  });
});

describe('golden vectors via worker/src/rules — modifiersFrom', () => {
  it.each(vectors.modifiersFrom)('matches for a given upgrade/star combo', (c: any) => {
    expect(mods(c.params)).toEqual(c.expected);
  });
});

describe('golden vectors via worker/src/rules — clickPower', () => {
  it.each(vectors.clickPower)('matches for a given upgrade/star combo', (c: any) => {
    expect(clickPower(mods(c.params))).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — autoClicksPerSec', () => {
  it.each(vectors.autoClicksPerSec)('matches at level $level', (c: any) => {
    expect(autoClicksPerSec(c.level)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — charIncome', () => {
  it.each(vectors.charIncome)('matches for $rarity level $level', (c: any) => {
    expect(charIncome(c.rarity, c.level)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — evolveIncomeMult', () => {
  it.each(vectors.evolveIncomeMult)('matches at stage $evolution', (c: any) => {
    expect(evolveIncomeMult(c.evolution)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — ownedCreatureIncome', () => {
  it.each(vectors.ownedCreatureIncome)('matches for a given rarity/held/incomeMult', (c: any) => {
    expect(ownedCreatureIncome(c.rarity, c.held, c.incomeMult)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — creatureContribution', () => {
  it.each(vectors.creatureContribution)('matches for a given rarity/held/mods/incomeMult', (c: any) => {
    expect(creatureContribution(c.rarity, c.held, mods(c.modParams), c.incomeMult)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — creatureIncome', () => {
  it.each(vectors.creatureIncome)('matches for a given owned set', (c: any) => {
    expect(creatureIncome(c.owned, mods(c.modParams))).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — gooPerSec', () => {
  it.each(vectors.gooPerSec)('matches for a given owned set', (c: any) => {
    expect(gooPerSec(c.owned, mods(c.modParams))).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — eggCost', () => {
  it.each(vectors.eggCost)('matches at n=$n', (c: any) => {
    expect(eggCost(c.n)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — wealthPaybackMult', () => {
  it.each(vectors.wealthPaybackMult)('matches at rate=$rate', (c: any) => {
    expect(wealthPaybackMult(c.rate)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — creatureLevelCost', () => {
  it.each(vectors.creatureLevelCost)('matches at gooPerSecValue=$gooPerSecValue', (c: any) => {
    expect(creatureLevelCost(c.rarity, c.held, mods(c.modParams), c.gooPerSecValue, c.incomeMult)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — evolveCost', () => {
  it.each(vectors.evolveCost)('matches at gooPerSecValue=$gooPerSecValue', (c: any) => {
    expect(evolveCost(c.rarity, c.held, mods(c.modParams), c.gooPerSecValue, c.incomeMult)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — affordableCreatureLevels', () => {
  it.each(vectors.affordableCreatureLevels)('matches at goo=$goo', (c: any) => {
    expect(affordableCreatureLevels(c.rarity, c.held, mods(c.modParams), c.goo, c.gooPerSecValue, c.incomeMult)).toBe(
      c.expected,
    );
  });
});

describe('golden vectors via worker/src/rules — rollRarity (seeded)', () => {
  for (const c of vectors.rollRarity as any[]) {
    it(`seed ${c.seed} reproduces the exact ${c.calls}-call sequence`, () => {
      const rng = replay(c.rngValues);
      for (let i = 0; i < c.calls; i++) {
        expect(rollRarity(rng, c.ctx), `call #${i}`).toBe(c.expected[i]);
      }
    });
  }
});

describe('golden vectors via worker/src/rules — pickChar (seeded)', () => {
  for (const c of vectors.pickChar as any[]) {
    it(`seed ${c.seed}/${c.rarity} reproduces the exact ${c.calls}-call sequence`, () => {
      const rng = replay(c.rngValues);
      for (let i = 0; i < c.calls; i++) {
        expect(pickChar(rng, c.rarity as any), `call #${i}`).toBe(c.expected[i]);
      }
    });
  }
});

describe('golden vectors via worker/src/rules — hatch (seeded, sequential)', () => {
  for (const c of vectors.hatch as any[]) {
    describe(`seed ${c.seed}, luck ${c.luck}`, () => {
      c.steps.forEach((step: any, i: number) => {
        it(`step ${i}`, () => {
          const rng = replay(step.rngValues);
          expect(hatch(rng, step.ctxIn)).toEqual(step.expected);
        });
      });
    });
  }
});

describe('golden vectors via worker/src/rules — openEggs (seeded)', () => {
  it.each(vectors.openEggs)('matches for a given seed/owned/count', (c: any) => {
    const rng = replay(c.rngValues);
    const result = openEggs({ rng, owned: c.owned, sinceRare: c.sinceRare, totalHatches: c.totalHatches, luck: c.luck, count: c.count });
    expect(result).toEqual(c.expected);
  });
});

describe('golden vectors via worker/src/rules — buyableEggs', () => {
  it.each(vectors.buyableEggs)('matches for goo=$goo acquired=$acquired maxCount=$maxCount', (c: any) => {
    expect(buyableEggs(c.goo, c.acquired, c.maxCount, eggCost)).toEqual(c.expected);
  });
});

describe('golden vectors via worker/src/rules — abilityOf (all creatures)', () => {
  it.each(vectors.abilityOf)('matches for $id ($rarity)', (c: any) => {
    expect(abilityOf(c.id, c.rarity)).toEqual(c.expected);
  });
});

describe('golden vectors via worker/src/rules — starBonusFor', () => {
  it.each(vectors.starBonusFor)('matches for a given claimed set', (c: any) => {
    expect(starBonusFor(c.claimedIds)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — isComplete', () => {
  it.each(vectors.isComplete)('matches for $id', (c: any) => {
    const def = achievements.find((a) => a.id === c.id);
    expect(def).toBeDefined();
    expect(isComplete(def!, c.ctx)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — computeOffline', () => {
  it.each(vectors.computeOffline)('matches for rate=$rate secondsAway=$secondsAway', (c: any) => {
    expect(computeOffline(c.rate, c.secondsAway)).toEqual(c.expected);
  });
});

// The one that matters most for PR 4: the server sanitizes every uploaded save
// with this exact function, so a cloud round-trip must be a no-op.
describe('golden vectors via worker/src/rules — migrate', () => {
  // See src/game/golden.test.ts for why `freshRng` cases compare with the rng
  // nulled out: migrate mints a random seed when the input has no usable one.
  const MIGRATE_NOW = 1_754_000_000_000;
  it.each(vectors.migrate)('matches for $label', (c: any) => {
    const actual = migrate(c.raw, MIGRATE_NOW);
    if (!c.freshRng) {
      expect(actual).toEqual(c.expected);
      return;
    }
    expect(actual.rng.cursor).toBe(0);
    expect(Number.isInteger(actual.rng.seed)).toBe(true);
    expect(actual.rng.seed).toBeGreaterThanOrEqual(0);
    expect({ ...actual, rng: null }).toEqual(c.expected);
  });
});

// PR 5: the server decides with these whether an upload is achievable. If the
// two sides disagreed by even a rounding step, honest players would be flagged.
describe('golden vectors via worker/src/rules — effectiveClickPower', () => {
  it.each(vectors.effectiveClickPower)('matches for $label', (c: any) => {
    expect(effectiveClickPower(mods(c.params), c.rate)).toBe(c.expected);
  });
});

describe('golden vectors via worker/src/rules — plausibilityCeiling', () => {
  it.each(vectors.plausibilityCeiling)('matches for $label', (c: any) => {
    expect(plausibilityCeiling(c.save, c.elapsed)).toEqual(c.expected);
  });
});

describe('golden vectors via worker/src/rules — verifySaveDelta', () => {
  it.each(vectors.verifySaveDelta)('matches for $label', (c: any) => {
    expect(verifySaveDelta(c.prev, c.next, c.elapsed)).toEqual(c.expected);
  });
});

describe('golden vectors via worker/src/rules — milestonesCrossed', () => {
  it.each(vectors.milestonesCrossed)('matches for prev=$prev next=$next', (c: any) => {
    expect(milestonesCrossed(c.prev, c.next).map((m) => m.goo)).toEqual(c.expected);
  });
});

describe('golden vectors via worker/src/rules — eventStateAt / currentEvent', () => {
  it.each(vectors.eventStateAt)('matches at now=$now', (c: any) => {
    const state = eventStateAt(c.now);
    expect({
      active: state.active,
      msLeft: state.msLeft,
      event: {
        id: state.event.id,
        incomeMult: state.event.incomeMult,
        clickMult: state.event.clickMult,
        eggCostMult: state.event.eggCostMult,
        luckBonus: state.event.luckBonus,
      },
      next: { id: state.next.id },
    }).toEqual(c.expected);
    expect(currentEvent(c.now).id).toBe(c.currentEventId);
  });
});

// The production PRNG itself, imported through the Worker's one import
// surface (worker/src/rules.ts re-exports src/game/rng.ts) — this is what
// proves the server can run the exact same generator the client does.
describe('golden vectors via worker/src/rules — rng (createRng, fresh from cursor 0)', () => {
  it.each(vectors.rng.draws)('matches the exact draw sequence for seed=$seed', (c: any) => {
    const rng = createRng({ seed: c.seed, cursor: 0 });
    const values = Array.from({ length: c.count }, () => rng.next());
    expect(values).toEqual(c.values);
    expect(rng.state()).toEqual(c.finalState);
  });
});

describe('golden vectors via worker/src/rules — rng (createRng, resumed from a saved cursor)', () => {
  it.each(vectors.rng.resume)('resuming at seed=$seed cursor=$cursor continues identically', (c: any) => {
    const rng = createRng({ seed: c.seed, cursor: c.cursor });
    const values = Array.from({ length: c.count }, () => rng.next());
    expect(values).toEqual(c.values);
    expect(rng.state()).toEqual(c.finalState);
  });
});
