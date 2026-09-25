import { describe, expect, it } from 'vitest';
import { rsi } from '../../src/indicators/rsi.js';
import { randomWalk } from '../helpers/random.js';

describe('rsi (Wilder)', () => {
  it('computes Wilder smoothing exactly (hand-derived, n = 2)', () => {
    // changes +1, -1, +2. k=2: avgGain 0.5, avgLoss 0.5 -> 50.
    // k=3: avgGain (0.5*1 + 2)/2 = 1.25, avgLoss (0.5*1 + 0)/2 = 0.25 -> RS 5 -> 100 - 100/6.
    const out = rsi([1, 2, 1, 3], 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(50);
    expect(out[3]).toBeCloseTo(100 - 100 / 6, 12);
  });

  // Reference data and values from the StockCharts RSI worksheet (Wilder smoothing).
  // The worksheet rounds intermediate averages to 2 decimals, so exact computation
  // differs by < 0.1 (first value: exact 70.46 vs published 70.53).
  const closes = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
    46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57,
    43.42, 42.66, 43.13,
  ];
  const expected = [
    70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87,
    45.46, 37.3, 33.08, 37.77,
  ];

  it('matches the published reference values within the worksheet rounding', () => {
    const out = rsi(closes, 14);
    expect(out[14]).toBeCloseTo(70.464, 3);
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    expected.forEach((value, offset) => {
      expect(Math.abs(out[14 + offset]! - value)).toBeLessThan(0.1);
    });
  });

  it('follows MT5 edge cases: only gains -> 100, flat -> 50', () => {
    expect(rsi([1, 2, 3, 4, 5], 3)[4]).toBe(100);
    expect(rsi([5, 5, 5, 5, 5], 3)[4]).toBe(50);
    expect(rsi([5, 4, 3, 2, 1], 3)[4]).toBe(0);
  });

  it('NL1: value at k is identical whether or not later data exists', () => {
    const series = randomWalk(1500, 7);
    const full = rsi(series, 14);
    for (const k of [14, 15, 100, 999, 1499]) {
      const prefix = rsi(series.slice(0, k + 1), 14);
      expect(prefix[k]).toBe(full[k]);
    }
  });
});
