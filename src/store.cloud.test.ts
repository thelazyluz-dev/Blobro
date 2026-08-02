// Tests for the cloud-save checkpoint push (PR 4) — specifically its conflict
// handling, which is the one place in the client that can silently cost a
// player progress.
//
// The scenario worth being paranoid about: two devices, both signed in, both
// playing. Device A is behind. If A's checkpoint push were allowed to succeed
// against a cloud save written by the further-along device B, B's lead would
// be overwritten in the cloud — and if B's device were then lost or wiped,
// that progress would be gone for good. That is precisely the disaster cloud
// save exists to prevent, so it gets its own tests rather than being left to
// the merge rule's unit tests.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushCloudSave = vi.fn();
const fetchCloudSave = vi.fn();

// Mock the network layer but keep the REAL merge rule — the decision under
// test is how pushCheckpoint reacts to it, not the rule itself (which has its
// own tests in net/save.test.ts).
vi.mock('./net/save', async () => {
  const actual = await vi.importActual<typeof import('./net/save')>('./net/save');
  return { ...actual, pushCloudSave: (...a: unknown[]) => pushCloudSave(...a), fetchCloudSave: () => fetchCloudSave() };
});

const { pushCheckpoint, useGame } = await import('./store');

/** Put the store in a "loaded, mid-game" state with a known lifetimeGoo. */
function primeStore(lifetimeGoo: number, cloudRev: number): void {
  useGame.setState({ loaded: true, lifetimeGoo, goo: lifetimeGoo, cloudRev, cloudSynced: false });
}

beforeEach(() => {
  pushCloudSave.mockReset();
  fetchCloudSave.mockReset();
});

afterEach(() => {
  useGame.setState({ loaded: false, cloudRev: 0, cloudSynced: false });
});

describe('pushCheckpoint — clean push', () => {
  it('sends the last-known cloudRev as baseRev and records the new rev', async () => {
    primeStore(1000, 4);
    pushCloudSave.mockResolvedValueOnce({ ok: true, rev: 5, updated: 123 });

    await pushCheckpoint();

    expect(pushCloudSave).toHaveBeenCalledTimes(1);
    expect(pushCloudSave.mock.calls[0][0]).toBe(4); // baseRev
    expect(useGame.getState().cloudRev).toBe(5);
    expect(useGame.getState().cloudSynced).toBe(true);
  });

  it('a plain failure leaves the device unsynced but does not move cloudRev', async () => {
    primeStore(1000, 4);
    pushCloudSave.mockResolvedValueOnce({ ok: false, conflict: null });

    await pushCheckpoint();

    expect(useGame.getState().cloudRev).toBe(4);
    expect(useGame.getState().cloudSynced).toBe(false);
  });
});

describe('pushCheckpoint — conflict with a device that is BEHIND us', () => {
  it('retries once with the fresh rev and wins', async () => {
    primeStore(5000, 4); // we have more lifetimeGoo than the cloud below
    pushCloudSave
      .mockResolvedValueOnce({ ok: false, conflict: { rev: 9, updated: 1, save: { version: 12, lifetimeGoo: 100 } } })
      .mockResolvedValueOnce({ ok: true, rev: 10, updated: 2 });

    await pushCheckpoint();

    expect(pushCloudSave).toHaveBeenCalledTimes(2);
    expect(pushCloudSave.mock.calls[1][0]).toBe(9); // retried at the conflict's rev
    expect(useGame.getState().cloudRev).toBe(10);
    expect(useGame.getState().cloudSynced).toBe(true);
  });

  it('never loops past that single retry', async () => {
    primeStore(5000, 4);
    pushCloudSave
      .mockResolvedValueOnce({ ok: false, conflict: { rev: 9, updated: 1, save: { version: 12, lifetimeGoo: 100 } } })
      .mockResolvedValueOnce({ ok: false, conflict: { rev: 11, updated: 2, save: { version: 12, lifetimeGoo: 100 } } });

    await pushCheckpoint();

    expect(pushCloudSave).toHaveBeenCalledTimes(2);
    expect(useGame.getState().cloudSynced).toBe(false);
  });
});

describe('pushCheckpoint — conflict with a device that is AHEAD of us', () => {
  it('does not push over the other device, even on later checkpoints', async () => {
    primeStore(100, 4); // the cloud below has far more progress than we do
    const aheadConflict = {
      ok: false,
      conflict: { rev: 9, updated: 1, save: { version: 12, lifetimeGoo: 999_999 } },
    };
    pushCloudSave.mockResolvedValue(aheadConflict);

    await pushCheckpoint();

    // One attempt, no retry — retrying would clobber the further-along device.
    expect(pushCloudSave).toHaveBeenCalledTimes(1);
    expect(useGame.getState().cloudSynced).toBe(false);

    // The load-bearing part: cloudRev must NOT have advanced to 9. If it had,
    // the very next checkpoint would push with a baseRev the server accepts
    // and overwrite the other device a minute later — exactly the outcome the
    // first push refused. Holding the stale rev is what makes the refusal
    // stick across checkpoints.
    expect(useGame.getState().cloudRev).toBe(4);

    await pushCheckpoint();
    expect(pushCloudSave).toHaveBeenCalledTimes(2);
    expect(pushCloudSave.mock.calls[1][0]).toBe(4); // still the stale rev, so it 409s again
    expect(useGame.getState().cloudRev).toBe(4);
  });

  it('self-heals once this device overtakes the cloud', async () => {
    primeStore(100, 4);
    pushCloudSave.mockResolvedValueOnce({
      ok: false,
      conflict: { rev: 9, updated: 1, save: { version: 12, lifetimeGoo: 999_999 } },
    });
    await pushCheckpoint();
    expect(useGame.getState().cloudRev).toBe(4);

    // The kid keeps playing and passes the other device's total.
    useGame.setState({ lifetimeGoo: 2_000_000 });
    pushCloudSave
      .mockResolvedValueOnce({ ok: false, conflict: { rev: 9, updated: 1, save: { version: 12, lifetimeGoo: 999_999 } } })
      .mockResolvedValueOnce({ ok: true, rev: 10, updated: 3 });

    await pushCheckpoint();

    expect(useGame.getState().cloudRev).toBe(10);
    expect(useGame.getState().cloudSynced).toBe(true);
  });
});

describe('pushCheckpoint — guards', () => {
  it('does nothing before the game has loaded', async () => {
    useGame.setState({ loaded: false });
    await pushCheckpoint();
    expect(pushCloudSave).not.toHaveBeenCalled();
  });
});
