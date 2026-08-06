import { describe, expect, it } from 'vitest';
import { championNotice } from './useChampionWatch';
import type { GlobalEntry } from '../net/leaderboard';

const board = (names: string[]): GlobalEntry[] => names.map((name, i) => ({ name, score: 1000 - i }));

describe('championNotice — the "new #1" decision', () => {
  it('says nothing on the baseline (no previous leader yet)', () => {
    expect(championNotice('goo', board(['רן', 'דנה']), null, 'רן')).toBeNull();
  });

  it('says nothing when the leader has not changed', () => {
    expect(championNotice('goo', board(['רן', 'דנה']), 'רן', 'דנה')).toBeNull();
  });

  it('tells a top-10 player when someone else takes #1, with the name + category', () => {
    const n = championNotice('goo', board(['נוֹעָה', 'דנה']), 'רן', 'דנה');
    expect(n).not.toBeNull();
    expect(n!.text).toContain('נוֹעָה');
    expect(n!.text).toContain('גּוּ');
    expect(n!.tone).toBe('pop');
  });

  it('congratulates the player when THEY take #1', () => {
    const n = championNotice('clicks', board(['רן', 'דנה']), 'דנה', 'רן');
    expect(n).not.toBeNull();
    expect(n!.text).toContain('תָּפַסְתָּ');
    expect(n!.text).toContain('לְחִיצוֹת');
    expect(n!.tone).toBe('star');
  });

  it('stays silent for a player who is NOT in that board\'s top-10', () => {
    // The throne changed, but "אני" is not on this board — no toast.
    expect(championNotice('cpm', board(['נוֹעָה', 'דנה']), 'רן', 'אני')).toBeNull();
  });

  it('stays silent when the player has no nickname', () => {
    expect(championNotice('goo', board(['נוֹעָה', 'דנה']), 'רן', '')).toBeNull();
  });

  it('uses the right category label per board', () => {
    expect(championNotice('cpm', board(['נוֹעָה', 'אני']), 'רן', 'אני')!.text).toContain('מְהִירוּת');
  });
});
