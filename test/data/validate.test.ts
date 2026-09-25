import { describe, expect, it } from 'vitest';
import type { Candle } from '../../src/core/types.js';
import { validateCandles } from '../../src/data/validate.js';

const base: Candle = { timeframe: 'H1', openTime: Date.parse('2026-09-21T10:00:00Z'), open: 10, high: 12, low: 9, close: 11 };

describe('validateCandles', () => {
  it('accepts a clean series', () => {
    expect(validateCandles([base, { ...base, openTime: base.openTime + 3_600_000 }], 'H1')).toEqual([]);
  });

  it('flags misalignment, ordering, OHLC and non-integer problems', () => {
    const issues = validateCandles(
      [
        base,
        { ...base }, // duplicate time
        { ...base, openTime: base.openTime + 60_000 }, // misaligned
        { ...base, openTime: base.openTime + 7_200_000, high: 10 }, // high below close
        { ...base, openTime: base.openTime + 10_800_000, close: 10.5 }, // not integer
      ],
      'H1',
    );
    expect(issues.some((i) => i.includes('not strictly ascending'))).toBe(true);
    expect(issues.some((i) => i.includes('not aligned'))).toBe(true);
    expect(issues.some((i) => i.includes('high below open/close'))).toBe(true);
    expect(issues.some((i) => i.includes('not an integer'))).toBe(true);
  });
});
