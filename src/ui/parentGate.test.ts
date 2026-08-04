import { describe, expect, it } from 'vitest';
import { parentGatePassed, parentQuestions, pickParentQuestion, rememberParentGate } from './parentGate';

describe('parent gate questions', () => {
  it('every question is digit-free (the whole point: words a pre-reader cannot pattern-match)', () => {
    for (const q of parentQuestions) {
      expect(q.textHe).not.toMatch(/[0-9٠-٩]/);
    }
  });

  it('answers are plausible small products an adult solves instantly', () => {
    for (const q of parentQuestions) {
      expect(q.answer).toBeGreaterThanOrEqual(20);
      expect(q.answer).toBeLessThanOrEqual(40);
      expect(Number.isInteger(q.answer)).toBe(true);
    }
  });

  it('pick always returns a member of the pool', () => {
    for (let i = 0; i < 50; i++) {
      expect(parentQuestions).toContain(pickParentQuestion());
    }
  });

  it('storage helpers degrade safely where localStorage does not exist (private mode)', () => {
    // Node has no localStorage — exactly the catch path a private-mode browser hits.
    expect(parentGatePassed()).toBe(false);
    expect(() => rememberParentGate()).not.toThrow();
  });
});
