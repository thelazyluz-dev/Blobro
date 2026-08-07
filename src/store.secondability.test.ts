// Second ability (mastering loop, 10th rebirth): unlock gating, "not the native
// type" rule, persistence across rebirth, and that it folds into modifiers only
// when the creature is the displayed main AND past the threshold.

import { beforeEach, describe, expect, it, vi } from 'vitest';

let store: Record<string, unknown> = {};
vi.mock('./persistence', () => ({
  loadRaw: async () => store.state,
  persist: async (s: unknown) => {
    store.state = s;
  },
  backupLocal: async (s: unknown) => {
    store.localBackup = s;
  },
  loadBackup: async () => store.localBackup,
}));
vi.mock('./net/save', async () => {
  const actual = await vi.importActual<typeof import('./net/save')>('./net/save');
  return { ...actual, fetchCloudSave: async () => null, pushCloudSave: async () => ({ ok: false, conflict: null }) };
});

const { useGame, selectActiveAbilities, selectMods } = await import('./store');
const { defaultSaveState } = await import('./game/save');
const { secondAbilityRebirth } = await import('./game/balance');
const { abilityOf } = await import('./game/abilities');

const NOW = 1_754_000_000_000;

// blombo's native ability is 'income'. We'll add 'tap' as a second ability.
beforeEach(() => {
  store = {};
  useGame.setState({ ...defaultSaveState(NOW), loaded: true });
});

describe('second ability', () => {
  it('is rejected below the rebirth threshold', () => {
    useGame.setState({ characters: { blombo: { level: 1, rebirths: secondAbilityRebirth - 1 } } });
    useGame.getState().setSecondAbility('blombo', 'tap');
    expect(useGame.getState().characters.blombo?.secondAbility).toBeUndefined();
  });

  it('cannot be the creature’s own native ability', () => {
    useGame.setState({ characters: { blombo: { level: 1, rebirths: secondAbilityRebirth } } });
    const native = abilityOf('blombo', 'common', 0).type; // 'income'
    useGame.getState().setSecondAbility('blombo', native);
    expect(useGame.getState().characters.blombo?.secondAbility).toBeUndefined();
  });

  it('is set once unlocked, and folds into mods only when that creature is the main', () => {
    useGame.setState({ characters: { blombo: { level: 1, rebirths: secondAbilityRebirth } }, equippedMain: 'blombo' });
    useGame.getState().setSecondAbility('blombo', 'tap');
    expect(useGame.getState().characters.blombo?.secondAbility).toBe('tap');

    // Displayed → both native (income) and second (tap) are active.
    const abilities = selectActiveAbilities(useGame.getState());
    expect(abilities.map((a) => a.type).sort()).toEqual(['income', 'tap']);
    // The tap second ability raises the click multiplier above 1.
    expect(selectMods(useGame.getState()).clickMultiplier).toBeGreaterThan(1);

    // NOT displayed → the creature's abilities don't apply.
    useGame.setState({ equippedMain: null });
    expect(selectActiveAbilities(useGame.getState())).toHaveLength(0);
  });

  it('survives a rebirth (kept, not wiped)', () => {
    useGame.setState({
      characters: { blombo: { level: 100, evolution: 4, rebirths: secondAbilityRebirth } },
      goo: 1e30,
    });
    useGame.getState().setSecondAbility('blombo', 'crit');
    useGame.getState().rebirthCreature('blombo');
    const held = useGame.getState().characters.blombo;
    expect(held?.rebirths).toBe(secondAbilityRebirth + 1);
    expect(held?.secondAbility).toBe('crit'); // preserved across the rebirth
  });
});
