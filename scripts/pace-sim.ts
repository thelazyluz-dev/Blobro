// Pacing sim for the "reach a decillion" question. Uses the REAL economy
// functions (not a re-implementation), so the curve matches the shipped rules.
// A dedicated active player: greedily levels the cheapest creature, evolves when
// a stage opens, taps + robot hand on top. Prints ACTIVE-play hours to each
// order of magnitude, validated against the known anchor (~9 bot-hours to 1e18).
//
// Run: npx vite-node scripts/pace-sim.ts

import { creatureContribution, effectiveClickPower, gooPerSec, modifiersFrom } from '../src/game/economy';
import { characters, incomeMultOf } from '../src/game/characters';
import { creatureLevelPaybackSeconds, evolveLevels, paybackGrowthPerDecade, paybackMultMin, paybackPivotRate } from '../src/game/balance';
import { prestigeMultiplierFor } from '../src/game/prestige';
import type { Modifiers, OwnedCharacters, Rarity } from '../src/game/types';

// wealthPaybackMult with a tunable cap, so we can see how the far tail changes
// when the brake stops growing earlier (the surgical lever for "decillion in
// months" that leaves early/mid pacing — below the cap — untouched).
function mult(rate: number, cap: number): number {
  const r = Math.max(1, rate);
  const m = Math.pow(paybackGrowthPerDecade, Math.log10(r / paybackPivotRate));
  return Math.min(cap, Math.max(paybackMultMin, m));
}
function levelCost(rarity: Rarity, held: { level: number; evolution?: number }, m: Modifiers, rate: number, incMult: number, cap: number): number {
  const gain =
    creatureContribution(rarity, { level: held.level + 1, evolution: held.evolution }, m, incMult) -
    creatureContribution(rarity, held, m, incMult);
  return Math.max(1, Math.round(gain * creatureLevelPaybackSeconds * mult(rate, cap)));
}

// A dedicated player's build: upgrades bought up (these are one-time, cheap
// relative to late-game creature costs), a healthy achievement star, and the
// full roster owned. Crystals default 0 (no-prestige baseline); pass a value to
// see the prestige-assisted curve.
function run(opts: { cap: number; label: string }) {
  const upgrades = { finger: 60, power: 45, autoTap: 40, nurture: 80, crit: 20, luck: 30 };
  const m = modifiersFrom(upgrades, 0.6, 0, 0, 0);
  const owned: OwnedCharacters = {};
  for (const def of characters) owned[def.id] = { level: 1, evolution: 0 };
  const rarityById = new Map(characters.map((d) => [d.id, d.rarity] as const));
  const multById = new Map(characters.map((d) => [d.id, incomeMultOf(d)] as const));

  let seconds = 0;
  let lifetime = 0;
  const marks: Record<number, number> = {};
  let nextExp = 4;
  const TAPS = 12;

  for (let iter = 0; iter < 8_000_000; iter++) {
    const rate0 = gooPerSec(owned, m);
    const rate = rate0 + effectiveClickPower(m, rate0) * TAPS;
    let bestId = '';
    let bestCost = Infinity;
    for (const def of characters) {
      const cost = levelCost(def.rarity, owned[def.id]!, m, rate0, multById.get(def.id)!, opts.cap);
      if (cost < bestCost) { bestCost = cost; bestId = def.id; }
    }
    const held = owned[bestId]!;
    const stage = held.evolution ?? 0;
    if (stage < 4 && held.level >= evolveLevels[stage]) {
      // approximate evolve with a level-equivalent cost so the sim keeps moving
      owned[bestId] = { level: held.level, evolution: stage + 1 };
      seconds += bestCost / rate; lifetime += bestCost;
    } else {
      owned[bestId] = { level: held.level + 1, evolution: held.evolution };
      seconds += bestCost / rate; lifetime += bestCost;
    }
    while (lifetime >= Math.pow(10, nextExp)) { marks[nextExp] = seconds / 3600; if (++nextExp > 34) break; }
    if (nextExp > 34) break;
  }

  const h18 = marks[18], h24 = marks[24], h30 = marks[30], h33 = marks[33];
  const cal = (h?: number, perDay = 2) => (h == null ? '—' : `${(h / perDay).toFixed(0)}d`);
  console.log(`\n=== ${opts.label} (payback cap ${opts.cap.toExponential(0)}) ===`);
  console.log(`  1e18 septillion-1: ${h18?.toFixed(0) ?? '—'}h active   (~${cal(h18)} @2h/day)`);
  console.log(`  1e24 septillion:    ${h24?.toFixed(0) ?? '—'}h active   (~${cal(h24)} @2h/day, ~${cal(h24,4)} @4h/day)`);
  console.log(`  1e30 nonillion:     ${h30?.toFixed(0) ?? '—'}h active   (~${cal(h30)} @2h/day)`);
  console.log(`  1e33 DECILLION:     ${h33?.toFixed(0) ?? '—'}h active   (~${cal(h33)} @2h/day, ~${cal(h33,4)} @4h/day)`);
  return marks;
}

run({ cap: 1e6, label: 'CURRENT curve' });
run({ cap: 1e4, label: 'cap lowered to 1e4' });
run({ cap: 1e3, label: 'cap lowered to 1e3' });
run({ cap: 300, label: 'cap lowered to 300' });
