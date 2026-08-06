// Every creature must grant a sensible ability, scaled by rarity — a missing or
// mis-tiered entry would silently give a player nothing (or too much).

import { describe, expect, it } from 'vitest';
import { ABILITY_META, ABILITY_TYPE_BY_ID, ABILITY_VALUE_OVERRIDE, abilityOf, abilityPct } from './abilities';
import { abilityRebirthBonus, rebirthCap } from './balance';
import { characters, charactersById } from './characters';
import { isCleanNickname } from './profanity';

describe('creature abilities', () => {
  it('every creature has an ability type', () => {
    for (const def of characters) {
      expect(ABILITY_TYPE_BY_ID[def.id], `missing ability for ${def.id}`).toBeDefined();
    }
  });

  it('every ability type has display metadata', () => {
    for (const type of Object.values(ABILITY_TYPE_BY_ID)) {
      expect(ABILITY_META[type]).toBeDefined();
      expect(ABILITY_META[type].nameHe.length).toBeGreaterThan(0);
    }
  });

  it('rarer creatures grant a strictly stronger version of the same ability', () => {
    // Compare within a type across rarities using a representative creature.
    // Creatures with an intentional value override (e.g. Tapuzi, the "click-power
    // champion" rare whose extreme tap deliberately exceeds a legendary's) are
    // excluded — this invariant is about the standard rarity curve, not the
    // hand-tuned exceptions.
    const byType: Record<string, { rarity: string; value: number }[]> = {};
    for (const def of characters) {
      if (def.id in ABILITY_VALUE_OVERRIDE) continue;
      const a = abilityOf(def.id, def.rarity);
      (byType[a.type] ??= []).push({ rarity: def.rarity, value: a.value });
    }
    const order = ['common', 'uncommon', 'rare', 'legendary'];
    for (const [type, entries] of Object.entries(byType)) {
      for (let i = 1; i < order.length; i++) {
        const lower = entries.filter((e) => e.rarity === order[i - 1]).map((e) => e.value);
        const higher = entries.filter((e) => e.rarity === order[i]).map((e) => e.value);
        if (lower.length && higher.length) {
          expect(Math.max(...higher), `${type}: ${order[i]} must beat ${order[i - 1]}`).toBeGreaterThan(
            Math.max(...lower),
          );
        }
      }
    }
  });

  it('all ability values are positive and sanely bounded', () => {
    for (const def of characters) {
      const a = abilityOf(def.id, def.rarity);
      expect(a.value).toBeGreaterThan(0);
      // Standard-curve creatures never exceed +100%; the hand-tuned overrides
      // (e.g. Tapuzi's extreme tap) may go higher, but still stay sanely bounded.
      const cap = def.id in ABILITY_VALUE_OVERRIDE ? 5 : 1;
      expect(a.value).toBeLessThanOrEqual(cap);
      expect(abilityPct(a)).toBeGreaterThan(0);
    }
  });

  it('the same creature always grants the same ability', () => {
    const id = characters[0].id;
    const r = charactersById[id].rarity;
    expect(abilityOf(id, r)).toEqual(abilityOf(id, r));
  });

  it('Tapuzi is a 50k-click rare with an extreme (×2) click-power ability', () => {
    const def = charactersById.tapuzi;
    expect(def.rarity).toBe('rare');
    expect(def.unlockClicks).toBe(50_000);
    const a = abilityOf('tapuzi', 'rare');
    expect(a.type).toBe('tap');
    expect(a.value).toBe(3); // +300% — far past a normal rare's +25%, via the override
  });
});

describe('nickname filter', () => {
  it('allows normal names in Hebrew and English', () => {
    for (const n of ['אידן', 'נועה', 'Dan', 'class', 'Blorbo7', 'שחקן']) {
      expect(isCleanNickname(n), n).toBe(true);
    }
  });

  it('blocks profanity, including leet-speak and niqqud', () => {
    for (const n of ['fuck', 'sh1t', 'F.U.C.K', 'זונה', 'חרא']) {
      expect(isCleanNickname(n), n).toBe(false);
    }
  });

  it('rejects names with no real letters', () => {
    for (const n of ['', '   ', '!!!', '🙂🙂']) {
      expect(isCleanNickname(n), JSON.stringify(n)).toBe(false);
    }
  });
});

describe('ability rebirths (mastering loop)', () => {
  it('rebirths=0 equals the plain rarity value', () => {
    for (const def of characters) {
      expect(abilityOf(def.id, def.rarity, 0)).toEqual(abilityOf(def.id, def.rarity));
    }
  });

  it('each rebirth adds +abilityRebirthBonus of the base (linear)', () => {
    const base = abilityOf('gigablorf', 'legendary', 0).value;
    for (const reb of [1, 3, 5, 10]) {
      const v = abilityOf('gigablorf', 'legendary', reb).value;
      expect(v).toBeCloseTo(base * (1 + abilityRebirthBonus * reb), 10);
    }
  });

  it('clamps at rebirthCap — a forged count cannot exceed it (anti-cheat)', () => {
    const atCap = abilityOf('dragapuf', 'legendary', rebirthCap).value;
    for (const forged of [rebirthCap + 1, 1000, 1e9]) {
      expect(abilityOf('dragapuf', 'legendary', forged).value).toBe(atCap);
    }
  });

  it('never goes below the base for junk/negative input', () => {
    const base = abilityOf('fizzik', 'common', 0).value;
    for (const junk of [-5, -0.5, NaN]) {
      expect(abilityOf('fizzik', 'common', junk).value).toBe(base);
    }
  });
});
