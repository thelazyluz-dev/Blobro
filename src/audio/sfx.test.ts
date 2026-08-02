// Which sound a tap makes.
//
// The synthesis needs a WebAudio context and isn't worth testing, but the
// DECISION is: a bought melody pack was being silenced by critical taps. The
// crit zap replaced the melody note outright, so once the crit upgrade
// approached its 60% cap most of the tune simply went missing — the player
// heard the music they paid for only on the taps that happened not to crit.

import { describe, expect, it } from 'vitest';
import { clickSoundFor } from './sfx';

const MELODY = 8; // a typical pack length
const CLASSIC = 0; // the classic pack has no melody

describe('clickSoundFor — below the combo where the melody takes over', () => {
  it('is a plain blip', () => {
    expect(clickSoundFor(1, MELODY, false)).toBe('blip');
    expect(clickSoundFor(19, MELODY, false)).toBe('blip');
  });

  it('is the standalone crit zap on a crit', () => {
    expect(clickSoundFor(1, MELODY, true)).toBe('crit');
  });
});

describe('clickSoundFor — once the melody is playing', () => {
  it('plays the melody', () => {
    expect(clickSoundFor(20, MELODY, false)).toBe('melody');
    expect(clickSoundFor(200, MELODY, false)).toBe('melody');
  });

  it('KEEPS playing the melody on a crit, as an accent rather than a zap', () => {
    // The whole point. A crit must never return 'crit' here — that is the bug:
    // it would replace the note and put a hole in the tune.
    expect(clickSoundFor(20, MELODY, true)).toBe('melody-crit');
    expect(clickSoundFor(500, MELODY, true)).toBe('melody-crit');
  });

  it('never drops a note, at any crit rate', () => {
    // Simulate a deep player at the 60% crit cap: every tap must still produce
    // a melody sound, crit or not.
    for (let combo = 20; combo < 200; combo++) {
      for (const crit of [true, false]) {
        expect(clickSoundFor(combo, MELODY, crit)).toMatch(/^melody/);
      }
    }
  });
});

describe('clickSoundFor — the classic pack is unchanged', () => {
  it('never enters melody mode, however long the combo', () => {
    expect(clickSoundFor(20, CLASSIC, false)).toBe('blip');
    expect(clickSoundFor(9999, CLASSIC, false)).toBe('blip');
  });

  it('still gets the original crit zap', () => {
    expect(clickSoundFor(9999, CLASSIC, true)).toBe('crit');
  });
});
