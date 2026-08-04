import { describe, expect, it } from 'vitest';
import { EVENTS, currentEvent, eventActiveMs, eventPeriodMs, eventStateAt } from './events';

describe('eventStateAt — the wall-clock-derived global event window', () => {
  it('is active only within the first eventActiveMs of a slot', () => {
    const atStart = eventStateAt(0);
    expect(atStart.active).toBe(true);
    expect(atStart.event.id).toBe(EVENTS[0].id);
    expect(atStart.msLeft).toBe(eventActiveMs);

    const midWindow = eventStateAt(eventActiveMs - 1);
    expect(midWindow.active).toBe(true);
    expect(midWindow.msLeft).toBe(1);
  });

  it('goes neutral exactly when the active window ends (boundary is exclusive)', () => {
    const justAfter = eventStateAt(eventActiveMs);
    expect(justAfter.active).toBe(false);
    expect(justAfter.event.id).toBe('none'); // NEUTRAL
    expect(justAfter.next.id).toBe(EVENTS[1].id); // previews the upcoming one
    expect(justAfter.msLeft).toBe(eventPeriodMs - eventActiveMs);
  });

  it('advances the event each slot, cycling through the table', () => {
    expect(eventStateAt(eventPeriodMs).event.id).toBe(EVENTS[1 % EVENTS.length].id);
    expect(eventStateAt(eventPeriodMs * EVENTS.length).event.id).toBe(EVENTS[0].id); // wrapped
  });

  it('handles a negative clock without throwing or NaN-indexing (modulo wrap)', () => {
    // A device clock behind the epoch anchor must still resolve a real event.
    const s = eventStateAt(-eventPeriodMs); // slot -1, into 0 -> active
    expect(s.active).toBe(true);
    expect(EVENTS.some((e) => e.id === s.event.id)).toBe(true);
    expect(Number.isFinite(s.msLeft)).toBe(true);
  });

  it('currentEvent is just the active event of the full state', () => {
    for (const t of [0, eventActiveMs, eventPeriodMs * 3 + 5]) {
      expect(currentEvent(t).id).toBe(eventStateAt(t).event.id);
    }
  });
});
