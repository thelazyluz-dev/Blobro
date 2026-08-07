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
// The claim endpoint is exercised in worker/test; here we stub it so the store's
// merge + guard logic can be tested without a network.
const claimReferralReward = vi.fn();
vi.mock('./net/referral', async () => {
  const actual = await vi.importActual<typeof import('./net/referral')>('./net/referral');
  return { ...actual, claimReferralReward: (tier: number) => claimReferralReward(tier) };
});

const { useGame, selectMods, referralClaimableTiers } = await import('./store');
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

  it('referralClaimableTiers lists only earned-and-uncollected tiers', () => {
    expect(referralClaimableTiers(2, [])).toEqual([]); // nothing reached
    expect(referralClaimableTiers(3, [])).toEqual([3]); // gift ready
    expect(referralClaimableTiers(5, [3])).toEqual([5]); // gift collected, medal ready
    expect(referralClaimableTiers(10, [3, 5])).toEqual([10]); // gold ready
    expect(referralClaimableTiers(10, [3, 5, 10])).toEqual([]); // all collected
  });

  it('claimReferralTier merges the server grant and is guarded against re-claim', async () => {
    claimReferralReward.mockReset();
    useGame.setState({ referralCount: 5, referralClaimed: [], goo: 100, lifetimeGoo: 1_000, cloudRev: 4, ownedCosmetics: ['acc-none'] });

    // A tier the player has NOT reached does not even call the server.
    await useGame.getState().claimReferralTier(10);
    expect(claimReferralReward).not.toHaveBeenCalled();

    // Claiming tier 5: the server grants goo + the medal AND bumps the save rev;
    // we must adopt goo, lifetimeGoo AND cloudRev together, or the next
    // checkpoint 409s and progress stalls.
    claimReferralReward.mockResolvedValueOnce({
      ok: true,
      tier: 5,
      goo: 5_000,
      lifetimeGoo: 5_900,
      rev: 5,
      ownedCosmetics: ['acc-none', 'acc-referral'],
      claimed: [5],
    });
    await useGame.getState().claimReferralTier(5);
    expect(useGame.getState().goo).toBe(5_000);
    expect(useGame.getState().lifetimeGoo).toBe(5_900); // synced, not left stale
    expect(useGame.getState().cloudRev).toBe(5); // advanced → next checkpoint won't 409
    expect(useGame.getState().ownedCosmetics).toContain('acc-referral');
    expect(useGame.getState().referralClaimed).toEqual([5]);

    // A second claim of an already-collected tier is a no-op (no server call).
    claimReferralReward.mockClear();
    await useGame.getState().claimReferralTier(5);
    expect(claimReferralReward).not.toHaveBeenCalled();
  });
});
