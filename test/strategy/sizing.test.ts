import { describe, expect, it } from 'vitest';
import { resolveParams } from '../../src/strategy/params.js';
import { computeEntry, computeReferenceStop, computeSizing } from '../../src/strategy/sizing.js';
import { candle, testConfig } from '../helpers/fixtures.js';

const config = testConfig();
const p = resolveParams(config, 'H1');

describe('sizing (spec §9)', () => {
  it('PDF fixture: $1,000 at 1%, entry 1.0860, stop 1.0840 → 0.05 lots, planned risk $10', () => {
    const s = computeSizing(108_600, 108_400, config.account, p);
    expect(s).toMatchObject({ slPips: 20, lots: 0.05, plannedRiskUsd: 10, plannedRiskPct: 1, raisedToMinLot: false });
  });

  it('P4: with a 1-pip spread on a market fill (21 pips) → 0.04 lots', () => {
    expect(computeSizing(108_610, 108_400, config.account, p).lots).toBe(0.04);
  });

  it('P5: commission enters the formula (hypothetical $7 round trip → 0.04 lots)', () => {
    const account = { ...config.account, commissionPerLotRoundTrip: 7 };
    const s = computeSizing(108_600, 108_400, account, p);
    expect(s.lots).toBe(0.04);
    expect(s.plannedRiskUsd).toBeCloseTo(0.04 * 207, 6);
  });

  it('rounds down, applies minSlPips, minLot and maxLot', () => {
    expect(computeSizing(108_600, 108_570, config.account, p).slPips).toBe(5); // 3 pips → min 5
    const tiny = computeSizing(108_600, 100_000, config.account, p); // 860 pips
    expect(tiny).toMatchObject({ lots: 0.01, raisedToMinLot: true });
    expect(tiny.plannedRiskPct).toBeCloseTo(8.6, 6);
    const rich = computeSizing(108_600, 108_400, { ...config.account, balance: 10_000_000 }, p);
    expect(rich.lots).toBe(config.account.maxLot);
  });
});

describe('entry and reference stop', () => {
  it('close − offset (H1: 2 pips) and candle midpoint', () => {
    const c = candle(0, 113_690, 113_720, 113_585, 113_710);
    expect(computeEntry(c, p)).toBe(113_690);
    expect(computeEntry(c, { ...p, entryMode: 'candle_mid' })).toBe(113_652);
  });

  it('reference stop: below the pattern low and EMA-fast, minus buffer (H1: 3 pips)', () => {
    const candles = [candle(0, 0, 0, 113_500, 0), candle(1, 0, 0, 113_585, 0)];
    expect(computeReferenceStop(candles, 1, ['pin_bar'], 113_620.4, p)).toBe(113_555);
    expect(computeReferenceStop(candles, 1, ['engulfing'], 113_620.4, p)).toBe(113_470);
    expect(computeReferenceStop(candles, 1, ['pin_bar'], 113_560.7, p)).toBe(113_530);
  });
});
