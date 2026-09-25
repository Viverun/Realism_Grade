import { describe, expect, it } from 'vitest';
import { clockToMinutes, makeLocalClock } from '../../src/core/timezone.js';

describe('makeLocalClock', () => {
  it('converts UTC to Dubai time (UTC+4, no DST)', () => {
    const dubai = makeLocalClock('Asia/Dubai');
    expect(dubai(Date.parse('2026-09-25T04:00:00Z'))).toEqual({ date: '2026-09-25', minuteOfDay: 8 * 60 });
    expect(dubai(Date.parse('2026-09-25T19:30:00Z'))).toEqual({ date: '2026-09-25', minuteOfDay: 23 * 60 + 30 });
    expect(dubai(Date.parse('2026-09-25T20:15:00Z'))).toEqual({ date: '2026-09-26', minuteOfDay: 15 });
    expect(dubai(Date.parse('2026-01-15T04:00:00Z')).minuteOfDay).toBe(8 * 60);
  });

  it('follows DST changes in zones that have them', () => {
    const newYork = makeLocalClock('America/New_York');
    expect(newYork(Date.parse('2026-01-15T13:00:00Z')).minuteOfDay).toBe(8 * 60); // EST, UTC-5
    expect(newYork(Date.parse('2026-07-15T12:00:00Z')).minuteOfDay).toBe(8 * 60); // EDT, UTC-4
  });
});

describe('clockToMinutes', () => {
  it('parses HH:MM', () => {
    expect(clockToMinutes('08:00')).toBe(480);
    expect(clockToMinutes('23:00')).toBe(1380);
    expect(() => clockToMinutes('8:00')).toThrow();
  });
});
