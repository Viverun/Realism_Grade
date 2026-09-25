import { describe, expect, it } from 'vitest';
import type { Tick } from '../../src/core/types.js';
import { aggregateTicks, TickAggregator } from '../../src/data/tick-aggregator.js';
import { validateCandles } from '../../src/data/validate.js';

const t = (iso: string): number => Date.parse(iso);
const tick = (iso: string, bid: number, ask = bid + 8): Tick => ({ time: t(iso), bid, ask });

const ticks: Tick[] = [
  tick('2026-09-21T10:00:05Z', 113600),
  tick('2026-09-21T10:07:00Z', 113650),
  tick('2026-09-21T10:12:00Z', 113580),
  tick('2026-09-21T10:14:59.999Z', 113620),
  tick('2026-09-21T10:15:00Z', 113630), // next M15 bucket
  tick('2026-09-21T10:29:00Z', 113700),
  // no ticks 10:30-10:45 -> no candle for that bucket
  tick('2026-09-21T10:50:00Z', 113710),
];

describe('aggregateTicks', () => {
  it('builds UTC-aligned Bid and Ask OHLC candles', () => {
    const candles = aggregateTicks(ticks, 'M15', t('2026-09-21T11:00:00Z'));
    expect(candles.map((c) => new Date(c.openTime).toISOString())).toEqual([
      '2026-09-21T10:00:00.000Z',
      '2026-09-21T10:15:00.000Z',
      '2026-09-21T10:45:00.000Z',
    ]);
    expect(candles[0]).toMatchObject({ open: 113600, high: 113650, low: 113580, close: 113620, tickCount: 4 });
    expect(candles[0]!.ask).toEqual({ open: 113608, high: 113658, low: 113588, close: 113628 });
    expect(validateCandles(candles, 'M15')).toEqual([]);
  });

  it('does not fabricate candles for empty buckets', () => {
    const candles = aggregateTicks(ticks, 'M15', t('2026-09-21T11:00:00Z'));
    expect(candles.some((c) => c.openTime === t('2026-09-21T10:30:00Z'))).toBe(false);
  });

  it('NL2: never emits a forming candle (closeTime > asOf)', () => {
    const candles = aggregateTicks(ticks, 'M15', t('2026-09-21T10:55:00Z'));
    expect(candles).toHaveLength(2);
    for (const c of candles) expect(c.openTime + 15 * 60_000).toBeLessThanOrEqual(t('2026-09-21T10:55:00Z'));
  });

  it('NL2: emits a candle exactly at its close time', () => {
    expect(aggregateTicks(ticks, 'M15', t('2026-09-21T10:15:00Z'))).toHaveLength(1);
    expect(aggregateTicks(ticks, 'M15', t('2026-09-21T10:14:59.999Z'))).toHaveLength(0);
  });

  it('NL2: ticks at or after asOf cannot change the result', () => {
    const asOf = t('2026-09-21T10:30:00Z');
    const base = aggregateTicks(ticks, 'M15', asOf);
    const withFuture = aggregateTicks(
      [...ticks, tick('2026-09-21T12:00:00Z', 100000), tick('2026-09-21T13:00:00Z', 130000)],
      'M15',
      asOf,
    );
    expect(withFuture).toEqual(base);
    // A late tick inside an already-closed bucket's time range is impossible (ordered),
    // and a tick exactly at asOf belongs to the next bucket:
    const atAsOf = aggregateTicks([...ticks.slice(0, 6), tick('2026-09-21T10:30:00Z', 90000)], 'M15', asOf);
    expect(atAsOf).toEqual(base);
  });

  it('rejects out-of-order ticks', () => {
    const aggregator = new TickAggregator('M15');
    aggregator.push(tick('2026-09-21T10:05:00Z', 1));
    expect(() => aggregator.push(tick('2026-09-21T10:04:00Z', 1))).toThrow(/out of order/);
  });
});
