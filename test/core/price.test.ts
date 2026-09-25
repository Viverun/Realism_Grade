import { describe, expect, it } from 'vitest';
import { formatPoints, pipsToPoints, pointsToPips, pointsToPrice, priceToPoints } from '../../src/core/price.js';

describe('price points', () => {
  it('converts 5-digit prices to exact integer points', () => {
    expect(priceToPoints('1.13691', 5)).toBe(113691);
    expect(priceToPoints(1.1371, 5)).toBe(113710);
    expect(priceToPoints('1.13710', 5) - priceToPoints('1.13690', 5)).toBe(20);
  });

  it('round-trips and formats', () => {
    expect(pointsToPrice(113691, 5)).toBe(1.13691);
    expect(formatPoints(108600, 5)).toBe('1.08600');
  });

  it('converts pips and points', () => {
    expect(pipsToPoints(1.5, 10)).toBe(15);
    expect(pipsToPoints(2, 10)).toBe(20);
    expect(pointsToPips(135, 10)).toBe(13.5);
  });

  it('rejects garbage', () => {
    expect(() => priceToPoints('abc', 5)).toThrow();
  });
});
