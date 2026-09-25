import { describe, expect, it } from 'vitest';
import { ema } from '../../src/indicators/ema.js';
import { randomWalk } from '../helpers/random.js';

describe('ema', () => {
  it('seeds with the SMA and then applies alpha = 2/(n+1)', () => {
    // n = 3, alpha = 0.5. Seed = (1+2+3)/3 = 2; then 0.5*4 + 0.5*2 = 3; 0.5*10 + 0.5*3 = 6.5
    expect(ema([1, 2, 3, 4, 10], 3)).toEqual([null, null, 2, 3, 6.5]);
  });

  it('returns all nulls when there is not enough data', () => {
    expect(ema([1, 2], 3)).toEqual([null, null]);
  });

  it('is constant on a constant series', () => {
    const out = ema(new Array(300).fill(110_000), 200);
    expect(out[199]).toBe(110_000);
    expect(out[299]).toBe(110_000);
  });

  it('rejects invalid periods', () => {
    expect(() => ema([1, 2, 3], 0)).toThrow();
    expect(() => ema([1, 2, 3], 1.5)).toThrow();
  });

  it('NL1: value at k is identical whether or not later data exists', () => {
    const closes = randomWalk(1500, 42);
    const full = ema(closes, 200);
    for (const k of [199, 200, 250, 777, 1000, 1499]) {
      const prefix = ema(closes.slice(0, k + 1), 200);
      expect(prefix[k]).toBe(full[k]);
    }
  });
});
