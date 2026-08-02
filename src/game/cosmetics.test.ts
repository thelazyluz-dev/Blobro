// Tests for the shop's tap gate.
//
// The gate exists because goo prices alone can't hold: income grows
// exponentially without bound while a price is a fixed number, so measured, a
// deep player could buy the whole shop in an afternoon. Taps can't be
// out-earned — the counter only moves on a real physical tap — so the property
// worth pinning here is that the gate is genuinely independent of wealth.

import { describe, expect, it } from 'vitest';
import {
  accessories,
  backgroundSkins,
  clicksRemainingFor,
  cosmeticsById,
  meetsClickRequirement,
  soundSkins,
  DEFAULT_ACCESSORY,
  DEFAULT_BACKGROUND,
  DEFAULT_SOUND,
} from './cosmetics';

const paid = [...backgroundSkins, ...accessories, ...soundSkins].filter((c) => c.cost > 0);

describe('meetsClickRequirement', () => {
  it('lets anything without a requirement through, at zero taps', () => {
    for (const id of [DEFAULT_BACKGROUND, DEFAULT_ACCESSORY, DEFAULT_SOUND]) {
      expect(meetsClickRequirement(cosmeticsById.get(id)!, 0)).toBe(true);
    }
  });

  it('is exactly inclusive at the threshold — the tap that reaches it unlocks it', () => {
    const gated = paid.find((c) => (c.requiresClicks ?? 0) > 0)!;
    const n = gated.requiresClicks!;
    expect(meetsClickRequirement(gated, n - 1)).toBe(false);
    expect(meetsClickRequirement(gated, n)).toBe(true);
  });

  it('cannot be satisfied by wealth — it only reads taps', () => {
    // The whole point: no amount of goo appears in this decision.
    const gated = paid.find((c) => (c.requiresClicks ?? 0) > 0)!;
    expect(meetsClickRequirement(gated, 0)).toBe(false);
  });
});

describe('clicksRemainingFor', () => {
  it('counts down and never goes negative', () => {
    const gated = paid.find((c) => (c.requiresClicks ?? 0) > 0)!;
    const n = gated.requiresClicks!;
    expect(clicksRemainingFor(gated, 0)).toBe(n);
    expect(clicksRemainingFor(gated, n - 10)).toBe(10);
    expect(clicksRemainingFor(gated, n)).toBe(0);
    expect(clicksRemainingFor(gated, n * 100)).toBe(0);
  });

  it('is 0 for an ungated item', () => {
    expect(clicksRemainingFor(cosmeticsById.get(DEFAULT_BACKGROUND)!, 0)).toBe(0);
  });
});

describe('the shop ladder as a whole', () => {
  it('leaves the opening of the shop ungated, so a new player has something to buy', () => {
    for (const list of [backgroundSkins, accessories, soundSkins]) {
      const cheapestPaid = [...list].filter((c) => c.cost > 0).sort((a, b) => a.cost - b.cost)[0];
      expect(cheapestPaid.requiresClicks ?? 0).toBe(0);
    }
  });

  it('gates every top-tier item, which is what a rich player would otherwise sweep', () => {
    for (const list of [backgroundSkins, accessories, soundSkins]) {
      const dearest = [...list].sort((a, b) => b.cost - a.cost)[0];
      expect(dearest.requiresClicks ?? 0).toBeGreaterThan(0);
    }
  });

  it('rises monotonically with price — a dearer item never asks for fewer taps', () => {
    for (const list of [backgroundSkins, accessories, soundSkins]) {
      const byPrice = [...list].sort((a, b) => a.cost - b.cost);
      let prev = 0;
      for (const c of byPrice) {
        const req = c.requiresClicks ?? 0;
        expect(req, `${c.nameHe} asks for fewer taps than a cheaper item`).toBeGreaterThanOrEqual(prev);
        prev = req;
      }
    }
  });

  it('stays within reach of the creature unlock ladder, which tops out at 500k taps', () => {
    // Not an arbitrary bound: the two progressions should read as one game, so
    // nothing here should demand wildly more tapping than the game already asks
    // for elsewhere.
    for (const c of paid) expect(c.requiresClicks ?? 0).toBeLessThanOrEqual(600_000);
  });
});
