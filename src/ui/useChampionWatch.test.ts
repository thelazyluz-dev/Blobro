import { describe, expect, it } from 'vitest';
import { championNotice, myStanding, selfChampionToast, standingDropToast, surpassedLeader } from './useChampionWatch';
import type { GlobalEntry } from '../net/leaderboard';

const board = (names: string[]): GlobalEntry[] => names.map((name, i) => ({ name, score: 1000 - i }));

describe('championNotice — the "someone ELSE took #1" challenge', () => {
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

  it('does NOT fire for the player themselves (that is the claim path)', () => {
    // Even if the board already shows me at #1, this challenge notice stays quiet —
    // the celebration is handled by the proactive claim (surpassedLeader).
    expect(championNotice('clicks', board(['רן', 'דנה']), 'דנה', 'רן')).toBeNull();
  });

  it('stays silent for a player who is NOT in that board\'s top-10', () => {
    expect(championNotice('cpm', board(['נוֹעָה', 'דנה']), 'רן', 'אני')).toBeNull();
  });

  it('stays silent when the player has no nickname', () => {
    expect(championNotice('goo', board(['נוֹעָה', 'דנה']), 'רן', '')).toBeNull();
  });
});

describe('surpassedLeader — "my live score just passed #1"', () => {
  it('is true when my value beats the current leader (who is not me)', () => {
    expect(surpassedLeader(board(['רן', 'דנה']), 1001, 'דנה')).toBe(true);
  });
  it('is false when I have not passed the leader yet', () => {
    expect(surpassedLeader(board(['רן', 'דנה']), 1000, 'דנה')).toBe(false);
  });
  it('is false when I am already the leader', () => {
    expect(surpassedLeader(board(['דנה', 'רן']), 5000, 'דנה')).toBe(false);
  });
  it('is false with no nickname or an empty board', () => {
    expect(surpassedLeader(board(['רן']), 9999, '')).toBe(false);
    expect(surpassedLeader([], 9999, 'דנה')).toBe(false);
  });
});

describe('selfChampionToast — the record-breaker celebration', () => {
  it('is a star toast naming the category', () => {
    const t = selfChampionToast('cpm');
    expect(t.tone).toBe('star');
    expect(t.text).toContain('שָׁבַרְתָּ שִׂיא');
    expect(t.text).toContain('מְהִירוּת');
  });
});

describe('myStanding — where I sit on a board', () => {
  it('reads first / top10 / out', () => {
    expect(myStanding(board(['אני', 'רן']), 'אני')).toBe('first');
    expect(myStanding(board(['רן', 'אני']), 'אני')).toBe('top10');
    expect(myStanding(board(['רן', 'דנה']), 'אני')).toBe('out');
    expect(myStanding([], 'אני')).toBe('out');
  });
});

describe('standingDropToast — "you lost ground while away" (reconnect)', () => {
  it('says nothing without a prior standing (baseline)', () => {
    expect(standingDropToast('clicks', undefined, 'out')).toBeNull();
  });
  it('flags losing #1', () => {
    const t = standingDropToast('clicks', 'first', 'top10');
    expect(t).not.toBeNull();
    expect(t!.text).toContain('עָקְפוּ');
    expect(t!.text).toContain('לְחִיצוֹת');
  });
  it('flags dropping out of the top-10 (takes priority over losing #1)', () => {
    const t = standingDropToast('goo', 'first', 'out');
    expect(t!.text).toContain('טּוֹפּ 10');
  });
  it('says nothing when nothing got worse', () => {
    expect(standingDropToast('clicks', 'first', 'first')).toBeNull();
    expect(standingDropToast('clicks', 'top10', 'first')).toBeNull(); // improved
    expect(standingDropToast('clicks', 'out', 'out')).toBeNull();
  });
});
