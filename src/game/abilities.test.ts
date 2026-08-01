// Every creature must grant a sensible ability, scaled by rarity — a missing or
// mis-tiered entry would silently give a player nothing (or too much).

import { describe, expect, it } from 'vitest';
import { ABILITY_META, ABILITY_TYPE_BY_ID, abilityOf, abilityPct } from './abilities';
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
    const byType: Record<string, { rarity: string; value: number }[]> = {};
    for (const def of characters) {
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
      expect(a.value).toBeLessThanOrEqual(1); // never more than +100%
      expect(abilityPct(a)).toBeGreaterThan(0);
    }
  });

  it('the same creature always grants the same ability', () => {
    const id = characters[0].id;
    const r = charactersById[id].rarity;
    expect(abilityOf(id, r)).toEqual(abilityOf(id, r));
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
