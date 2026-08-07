// Golden-vector contract tests — CLIENT side (direct imports from ./economy,
// ./hatching, etc). worker/test/golden.test.ts asserts the SAME vectors.json
// through the Worker's import path (worker/src/rules.ts) so client and
// server are proven to agree, not just individually "correct".
//
// These vectors are the shared rules' contract. If one of these fails after
// an intentional balance change, that's expected — see CLAUDE.md: regenerate
// with `npm run golden:generate` and the diff to vectors.json must be visible
// and justified in the PR. Never regenerate just to make a red test green.

import { describe, expect, it } from 'vitest';
import { abilityForType, abilityOf } from './abilities';
import { achievements, isComplete, starBonusFor } from './achievements';
import {
  affordableCreatureLevels,
  autoClicksPerSec,
  charIncome,
  clickPower,
  effectiveClickPower,
  creatureContribution,
  creatureIncome,
  creatureLevelCost,
  eggCost,
  evolveCost,
  evolveIncomeMult,
  gooPerSec,
  modifiersFrom,
  ownedCreatureIncome,
  rebirthGlobalMult,
  wealthPaybackMult,
} from './economy';
import { currentEvent, eventStateAt } from './events';
import { buyableEggs, hatch, openEggs, pickChar, rollRarity } from './hatching';
import { milestonesCrossed } from './milestones';
import { computeOffline } from './offline';
import { createRng } from './rng';
import { migrate } from './save';
import { plausibilityCeiling, verifySaveDelta } from './verify';
import vectors from './__golden__/vectors.json';

// Cases flagged `freshRng` carry no usable rng stream, so migrate mints a
// random seed. Its value can't be pinned in a contract file, so assert its
// SHAPE here and null it out — everything else is still compared in full.
const MIGRATE_NOW = 1_754_000_000_000;
function migrateGolden(c: { raw: unknown; freshRng?: boolean }) {
  const actual = migrate(c.raw, MIGRATE_NOW);
  if (!c.freshRng) return actual;
  expect(actual.rng.cursor).toBe(0);
  expect(Number.isInteger(actual.rng.seed)).toBe(true);
  expect(actual.rng.seed).toBeGreaterThanOrEqual(0);
  return { ...actual, rng: null };
}

// A recorded rng sequence "replays" as a plain index cursor over pre-baked
// values — no PRNG algorithm needed here (see scripts/generate-golden.ts).
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

describe('golden vectors — modifiersFrom', () => {
  it.each(vectors.modifiersFrom)('matches for a given upgrade/star combo', (c: any) => {
    expect(mods(c.params)).toEqual(c.expected);
  });
});

describe('golden vectors — clickPower', () => {
  it.each(vectors.clickPower)('matches for a given upgrade/star combo', (c: any) => {
    expect(clickPower(mods(c.params))).toBe(c.expected);
  });
});

describe('golden vectors — autoClicksPerSec', () => {
  it.each(vectors.autoClicksPerSec)('matches at level $level', (c: any) => {
    expect(autoClicksPerSec(c.level)).toBe(c.expected);
  });
});

describe('golden vectors — charIncome', () => {
  it.each(vectors.charIncome)('matches for $rarity level $level', (c: any) => {
    expect(charIncome(c.rarity, c.level)).toBe(c.expected);
  });
});

describe('golden vectors — evolveIncomeMult', () => {
  it.each(vectors.evolveIncomeMult)('matches at stage $evolution', (c: any) => {
    expect(evolveIncomeMult(c.evolution)).toBe(c.expected);
  });
});

describe('golden vectors — ownedCreatureIncome', () => {
  it.each(vectors.ownedCreatureIncome)('matches for a given rarity/held/incomeMult', (c: any) => {
    expect(ownedCreatureIncome(c.rarity, c.held, c.incomeMult)).toBe(c.expected);
  });
});

describe('golden vectors — creatureContribution', () => {
  it.each(vectors.creatureContribution)('matches for a given rarity/held/mods/incomeMult', (c: any) => {
    expect(creatureContribution(c.rarity, c.held, mods(c.modParams), c.incomeMult)).toBe(c.expected);
  });
});

describe('golden vectors — creatureIncome', () => {
  it.each(vectors.creatureIncome)('matches for a given owned set', (c: any) => {
    expect(creatureIncome(c.owned, mods(c.modParams))).toBe(c.expected);
  });
});

describe('golden vectors — gooPerSec', () => {
  it.each(vectors.gooPerSec)('matches for a given owned set', (c: any) => {
    expect(gooPerSec(c.owned, mods(c.modParams))).toBe(c.expected);
  });
});

describe('golden vectors — eggCost', () => {
  it.each(vectors.eggCost)('matches at n=$n', (c: any) => {
    expect(eggCost(c.n)).toBe(c.expected);
  });
});

describe('golden vectors — wealthPaybackMult', () => {
  it.each(vectors.wealthPaybackMult)('matches at rate=$rate', (c: any) => {
    expect(wealthPaybackMult(c.rate)).toBe(c.expected);
  });
});

describe('golden vectors — creatureLevelCost', () => {
  it.each(vectors.creatureLevelCost)('matches at gooPerSecValue=$gooPerSecValue', (c: any) => {
    expect(creatureLevelCost(c.rarity, c.held, mods(c.modParams), c.gooPerSecValue, c.incomeMult)).toBe(c.expected);
  });
});

describe('golden vectors — evolveCost', () => {
  it.each(vectors.evolveCost)('matches at gooPerSecValue=$gooPerSecValue', (c: any) => {
    expect(evolveCost(c.rarity, c.held, mods(c.modParams), c.gooPerSecValue, c.incomeMult)).toBe(c.expected);
  });
});

describe('golden vectors — affordableCreatureLevels', () => {
  it.each(vectors.affordableCreatureLevels)('matches at goo=$goo', (c: any) => {
    expect(affordableCreatureLevels(c.rarity, c.held, mods(c.modParams), c.goo, c.gooPerSecValue, c.incomeMult)).toBe(
      c.expected,
    );
  });
});

describe('golden vectors — rollRarity (seeded)', () => {
  for (const c of vectors.rollRarity as any[]) {
    it(`seed ${c.seed} reproduces the exact ${c.calls}-call sequence`, () => {
      const rng = replay(c.rngValues);
      const results = Array.from({ length: c.calls }, () => rollRarity(rng, c.ctx));
      expect(results).toEqual(c.expected);
      // Also assert per-draw so a single mismatched roll fails on its own line.
      results.forEach((r, i) => expect(r, `call #${i}`).toBe(c.expected[i]));
    });
  }
});

describe('golden vectors — pickChar (seeded)', () => {
  for (const c of vectors.pickChar as any[]) {
    it(`seed ${c.seed}/${c.rarity} reproduces the exact ${c.calls}-call sequence`, () => {
      const rng = replay(c.rngValues);
      for (let i = 0; i < c.calls; i++) {
        expect(pickChar(rng, c.rarity as any), `call #${i}`).toBe(c.expected[i]);
      }
    });
  }
});

describe('golden vectors — hatch (seeded, sequential)', () => {
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

describe('golden vectors — openEggs (seeded)', () => {
  it.each(vectors.openEggs)('matches for a given seed/owned/count', (c: any) => {
    const rng = replay(c.rngValues);
    const result = openEggs({ rng, owned: c.owned, sinceRare: c.sinceRare, totalHatches: c.totalHatches, luck: c.luck, count: c.count });
    expect(result).toEqual(c.expected);
  });
});

describe('golden vectors — buyableEggs', () => {
  it.each(vectors.buyableEggs)('matches for goo=$goo acquired=$acquired maxCount=$maxCount', (c: any) => {
    expect(buyableEggs(c.goo, c.acquired, c.maxCount, eggCost)).toEqual(c.expected);
  });
});

describe('golden vectors — abilityOf (all creatures)', () => {
  it.each(vectors.abilityOf)('matches for $id ($rarity)', (c: any) => {
    expect(abilityOf(c.id, c.rarity)).toEqual(c.expected);
  });

  it('covers every creature in the roster exactly once', () => {
    expect(vectors.abilityOf.length).toBe(vectors.characterCount);
  });
});

describe('golden vectors — abilityOf with rebirths (mastering loop)', () => {
  it.each(vectors.abilityOfRebirth)('matches for $id ($rarity) at $rebirths rebirths', (c: any) => {
    expect(abilityOf(c.id, c.rarity, c.rebirths)).toEqual(c.expected);
  });
});

describe('golden vectors — abilityForType (chosen second ability)', () => {
  it.each(vectors.abilityForType)('matches for $type ($rarity)', (c: any) => {
    expect(abilityForType(c.type, c.rarity)).toEqual(c.expected);
  });
});

describe('golden vectors — rebirthGlobalMult (global rebirth income)', () => {
  it.each(vectors.rebirthGlobalMult)('matches for a given roster', (c: any) => {
    expect(rebirthGlobalMult(c.owned)).toEqual(c.expected);
  });
});

describe('golden vectors — starBonusFor', () => {
  it.each(vectors.starBonusFor)('matches for a given claimed set', (c: any) => {
    expect(starBonusFor(c.claimedIds)).toBe(c.expected);
  });
});

describe('golden vectors — isComplete', () => {
  it.each(vectors.isComplete)('matches for $id', (c: any) => {
    const def = achievements.find((a) => a.id === c.id);
    expect(def).toBeDefined();
    expect(isComplete(def!, c.ctx)).toBe(c.expected);
  });
});

describe('golden vectors — computeOffline', () => {
  it.each(vectors.computeOffline)('matches for rate=$rate secondsAway=$secondsAway', (c: any) => {
    expect(computeOffline(c.rate, c.secondsAway)).toEqual(c.expected);
  });
});

describe('golden vectors — migrate', () => {
  it.each(vectors.migrate)('matches for $label', (c: any) => {
    expect(migrateGolden(c)).toEqual(c.expected);
  });
});

describe('golden vectors — effectiveClickPower', () => {
  it.each(vectors.effectiveClickPower)('matches for $label', (c: any) => {
    expect(effectiveClickPower(mods(c.params), c.rate)).toBe(c.expected);
  });
});

describe('golden vectors — plausibilityCeiling', () => {
  it.each(vectors.plausibilityCeiling)('matches for $label', (c: any) => {
    expect(plausibilityCeiling(c.save, c.elapsed)).toEqual(c.expected);
  });
});

describe('golden vectors — verifySaveDelta', () => {
  it.each(vectors.verifySaveDelta)('matches for $label', (c: any) => {
    expect(verifySaveDelta(c.prev, c.next, c.elapsed)).toEqual(c.expected);
  });
});

describe('golden vectors — milestonesCrossed', () => {
  it.each(vectors.milestonesCrossed)('matches for prev=$prev next=$next', (c: any) => {
    expect(milestonesCrossed(c.prev, c.next).map((m) => m.goo)).toEqual(c.expected);
  });
});

describe('golden vectors — eventStateAt / currentEvent', () => {
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

// This is the production PRNG itself (src/game/rng.ts), not a rule fed by
// one — see scripts/generate-golden.ts for why it isn't a "recorded
// sequence" like the vectors above.
describe('golden vectors — rng (createRng, fresh from cursor 0)', () => {
  it.each(vectors.rng.draws)('matches the exact draw sequence for seed=$seed', (c: any) => {
    const rng = createRng({ seed: c.seed, cursor: 0 });
    const values = Array.from({ length: c.count }, () => rng.next());
    expect(values).toEqual(c.values);
    expect(rng.state()).toEqual(c.finalState);
  });
});

describe('golden vectors — rng (createRng, resumed from a saved cursor)', () => {
  it.each(vectors.rng.resume)('resuming at seed=$seed cursor=$cursor continues identically', (c: any) => {
    const rng = createRng({ seed: c.seed, cursor: c.cursor });
    const values = Array.from({ length: c.count }, () => rng.next());
    expect(values).toEqual(c.values);
    expect(rng.state()).toEqual(c.finalState);
  });

  it('a resumed stream reproduces the tail of the equivalent fresh-from-0 stream', () => {
    // Cross-check against the `draws` vectors above: resuming at cursor N
    // must equal drawing N+count values from 0 and taking the tail — this is
    // the exact guarantee a reloaded save (or a resumed server checkpoint)
    // depends on.
    for (const r of vectors.rng.resume as any[]) {
      const full = vectors.rng.draws.find((d: any) => d.seed === r.seed);
      if (!full || full.count < r.cursor + r.count) continue; // not covered by the sampled draws
      const expectedTail = full.values.slice(r.cursor, r.cursor + r.count);
      expect(r.values).toEqual(expectedTail);
    }
  });
});
