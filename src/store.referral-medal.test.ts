// The referral medals are awarded accessories that carry a real advantage while
// worn (a passive-income lift + a tap multiplier). This pins that the bonus
// flows through the normal accessory plumbing into the live modifiers AND is
// mirrored in the anti-cheat ceiling, so a rewarded player is never flagged.

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

const { useGame, selectMods } = await import('./store');
const { defaultSaveState } = await import('./game/save');
const { accessories, accessoryById, accessoryIncomeBonus, DEFAULT_ACCESSORY } = await import('./game/cosmetics');
const { plausibilityCeiling } = await import('./game/verify');

const NOW = 1_754_000_000_000;

beforeEach(() => {
  store = {};
  useGame.setState({ ...defaultSaveState(NOW), loaded: true });
});

describe('referral medals', () => {
  it('exist, are exclusive (never sold), and carry income + click bonuses', () => {
    const medal = accessoryById('acc-referral');
    const gold = accessoryById('acc-referral-gold');
    expect(medal.exclusive).toBe(true);
    expect(gold.exclusive).toBe(true);
    expect(medal.cost).toBe(0);
    // A real advantage while worn — both a passive-income lift and a tap multiplier.
    expect(medal.incomeBonus).toBeGreaterThan(0);
    expect(medal.clickBonus).toBeGreaterThan(0);
    // Gold is the stronger, upgraded tier.
    expect(gold.incomeBonus!).toBeGreaterThan(medal.incomeBonus!);
    expect(gold.clickBonus).toBeGreaterThan(medal.clickBonus);
    // The default accessory grants nothing — bonuses are the medals' alone.
    expect(accessoryIncomeBonus(DEFAULT_ACCESSORY)).toBe(0);
  });

  it('lift both income and click multipliers when worn', () => {
    const base = selectMods(useGame.getState());
    useGame.setState({ equippedAccessory: 'acc-referral' });
    const withMedal = selectMods(useGame.getState());
    expect(withMedal.incomeMultiplier).toBeGreaterThan(base.incomeMultiplier);
    expect(withMedal.clickMultiplier).toBeGreaterThan(base.clickMultiplier);

    // The gold medal lifts them even further.
    useGame.setState({ equippedAccessory: 'acc-referral-gold' });
    const withGold = selectMods(useGame.getState());
    expect(withGold.incomeMultiplier).toBeGreaterThan(withMedal.incomeMultiplier);
    expect(withGold.clickMultiplier).toBeGreaterThan(withMedal.clickMultiplier);
  });

  it('are mirrored in the anti-cheat ceiling — a rewarded player is not flagged', () => {
    // Give the save some creatures so passive income is nonzero and the medal's
    // income % actually moves the ceiling.
    const save = { ...defaultSaveState(NOW), characters: { blombo: { level: 100 } } };
    const without = plausibilityCeiling({ ...save, equippedAccessory: DEFAULT_ACCESSORY }, 0);
    const withMedal = plausibilityCeiling({ ...save, equippedAccessory: 'acc-referral' }, 0);
    expect(withMedal.passivePerSec).toBeGreaterThan(without.passivePerSec); // income folded in
    expect(withMedal.perTap).toBeGreaterThan(without.perTap); // tap multiplier folded in
  });

  it('the medals are kept out of the shop list by their exclusive flag', () => {
    const shopAccessories = accessories.filter((a) => !a.exclusive);
    expect(shopAccessories.some((a) => a.id === 'acc-referral')).toBe(false);
    expect(shopAccessories.some((a) => a.id === 'acc-referral-gold')).toBe(false);
  });
});
