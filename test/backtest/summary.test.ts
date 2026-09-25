import { describe, expect, it } from 'vitest';
import { distribution, meanInterval, wilson } from '../../src/backtest/summary.js';

describe('summary statistics', () => {
  it('Wilson interval matches reference values', () => {
    const w = wilson(3, 24);
    expect(w.value).toBeCloseTo(0.125, 10);
    expect(w.low).toBeCloseTo(0.0434, 3);
    expect(w.high).toBeCloseTo(0.3100, 3);
    expect(wilson(0, 0)).toEqual({ value: null, low: null, high: null, n: 0 });
  });

  it('mean interval uses the sample standard deviation', () => {
    const m = meanInterval([2, -1, -1, 2]); // mean 0.5, sd √3
    expect(m.value).toBe(0.5);
    expect(m.high! - m.value!).toBeCloseTo((1.96 * Math.sqrt(3)) / 2, 10);
    expect(meanInterval([1])).toEqual({ value: 1, low: null, high: null, n: 1 });
  });

  it('distribution reports median and mean', () => {
    expect(distribution([3, 1, 2, 10])).toEqual({ n: 4, mean: 4, median: 2.5, min: 1, max: 10 });
  });
});
