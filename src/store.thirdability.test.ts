// Third ability (mastering-loop finale, final rebirth): unlock gating, the
// "distinct from native AND second" rule, persistence across a rebirth, and that
// it folds into modifiers only when the creature is the displayed main.

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
const { secondAbilityRebirth, thirdAbilityRebirth } = await import('./game/balance');
const { abilityOf } = await import('./game/abilities');

const NOW = 1_754_000_000_000;

// blombo's native ability is 'income'.
beforeEach(() => {
  store = {};
  useGame.setState({ ...defaultSaveState(NOW), loaded: true });
});

describe('third ability', () => {
  it('is rejected below the final-rebirth threshold', () => {
    useGame.setState({ characters: { blombo: { level: 1, rebirths: thirdAbilityRebirth - 1 } } });
    useGame.getState().setThirdAbility('blombo', 'tap');
    expect(useGame.getState().characters.blombo?.thirdAbility).toBeUndefined();
  });

  it('cannot be the creature’s own native ability', () => {
    useGame.setState({ characters: { blombo: { level: 1, rebirths: thirdAbilityRebirth } } });
    const native = abilityOf('blombo', 'common', 0).type; // 'income'
    useGame.getState().setThirdAbility('blombo', native);
    expect(useGame.getState().characters.blombo?.thirdAbility).toBeUndefined();
  });

  it('cannot duplicate the chosen second ability (all three stay distinct)', () => {
    useGame.setState({ characters: { blombo: { level: 1, rebirths: thirdAbilityRebirth, secondAbility: 'tap' } } });
    useGame.getState().setThirdAbility('blombo', 'tap'); // same as second → rejected
    expect(useGame.getState().characters.blombo?.thirdAbility).toBeUndefined();
    useGame.getState().setThirdAbility('blombo', 'crit'); // distinct → accepted
    expect(useGame.getState().characters.blombo?.thirdAbility).toBe('crit');
  });

  it('setting the second ability cannot duplicate the chosen third either', () => {
    useGame.setState({ characters: { blombo: { level: 1, rebirths: thirdAbilityRebirth, thirdAbility: 'crit' } } });
    useGame.getState().setSecondAbility('blombo', 'crit'); // same as third → rejected
    expect(useGame.getState().characters.blombo?.secondAbility).toBeUndefined();
  });

  it('all three abilities are active and fold into mods when the creature is the main', () => {
    useGame.setState({
      characters: { blombo: { level: 1, rebirths: thirdAbilityRebirth, secondAbility: 'tap', thirdAbility: 'crit' } },
      equippedMain: 'blombo',
    });
    // native income + second tap + third crit
    const abilities = selectActiveAbilities(useGame.getState());
    expect(abilities.map((a) => a.type).sort()).toEqual(['crit', 'income', 'tap']);
    const mods = selectMods(useGame.getState());
    expect(mods.clickMultiplier).toBeGreaterThan(1); // tap second ability
    expect(mods.critChance).toBeGreaterThan(0); // crit third ability

    // NOT displayed → none of the creature's abilities apply.
    useGame.setState({ equippedMain: null });
    expect(selectActiveAbilities(useGame.getState())).toHaveLength(0);
  });

  it('the third ability is inactive between the second and third thresholds', () => {
    // Reborn 10 times (second unlocked) but not yet at the final rebirth: a
    // thirdAbility value carried on the save must NOT count yet.
    useGame.setState({
      characters: { blombo: { level: 1, rebirths: secondAbilityRebirth, secondAbility: 'tap', thirdAbility: 'crit' } },
      equippedMain: 'blombo',
    });
    const types = selectActiveAbilities(useGame.getState()).map((a) => a.type).sort();
    expect(types).toEqual(['income', 'tap']); // no crit until the final rebirth
  });

  it('survives a rebirth (kept, not wiped)', () => {
    useGame.setState({
      characters: { blombo: { level: 100, evolution: 4, rebirths: thirdAbilityRebirth - 1, secondAbility: 'tap', thirdAbility: 'crit' } },
      goo: 1e30,
    });
    useGame.getState().rebirthCreature('blombo');
    const held = useGame.getState().characters.blombo;
    expect(held?.rebirths).toBe(thirdAbilityRebirth);
    expect(held?.secondAbility).toBe('tap');
    expect(held?.thirdAbility).toBe('crit'); // preserved across the rebirth
  });
});
