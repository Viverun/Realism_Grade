import { describe, expect, it } from 'vitest';
import type { Candle } from '../../src/core/types.js';
import { resampleCandles } from '../../src/data/resample.js';
import { validateCandles } from '../../src/data/validate.js';

const t = (iso: string): number => Date.parse(iso);
const m15 = (iso: string, open: number, high: number, low: number, close: number, withAsk = true): Candle => ({
  timeframe: 'M15',
  openTime: t(iso),
  open,
  high,
  low,
  close,
  ...(withAsk ? { ask: { open: open + 5, high: high + 5, low: low + 5, close: close + 5 } } : {}),
  tickCount: 10,
});

const candles: Candle[] = [
  m15('2026-09-21T10:00:00Z', 100, 110, 95, 105),
  m15('2026-09-21T10:15:00Z', 105, 120, 100, 115),
  m15('2026-09-21T10:30:00Z', 115, 118, 90, 92),
  m15('2026-09-21T10:45:00Z', 92, 99, 91, 98),
  m15('2026-09-21T11:00:00Z', 98, 101, 97, 100),
];

describe('resampleCandles', () => {
  it('aggregates M15 into H1 exactly', () => {
    const h1 = resampleCandles(candles, 'H1', t('2026-09-21T12:00:00Z'));
    expect(h1).toHaveLength(2);
    expect(h1[0]).toMatchObject({ timeframe: 'H1', open: 100, high: 120, low: 90, close: 98, tickCount: 40 });
    expect(h1[0]!.ask).toEqual({ open: 105, high: 125, low: 95, close: 103 });
    expect(validateCandles(h1, 'H1')).toEqual([]);
  });

  it('aggregates M15 into M30', () => {
    const m30 = resampleCandles(candles, 'M30', t('2026-09-21T11:30:00Z'));
    expect(m30.map((c) => [c.open, c.high, c.low, c.close])).toEqual([
      [100, 120, 95, 115],
      [115, 118, 90, 98],
      [98, 101, 97, 100],
    ]);
  });

  it('NL2: does not emit a higher-TF bucket that has not closed, even if some M15 candles exist', () => {
    const h1 = resampleCandles(candles, 'H1', t('2026-09-21T11:15:00Z'));
    expect(h1).toHaveLength(1);
    expect(h1[0]!.openTime).toBe(t('2026-09-21T10:00:00Z'));
  });

  it('drops Ask when any constituent candle lacks it', () => {
    const mixed = [candles[0]!, m15('2026-09-21T10:15:00Z', 105, 120, 100, 115, false)];
    const m30 = resampleCandles(mixed, 'M30', t('2026-09-21T10:30:00Z'));
    expect(m30[0]!.ask).toBeUndefined();
  });

  it('rejects downsampling', () => {
    const h1 = resampleCandles(candles, 'H1', t('2026-09-21T12:00:00Z'));
    expect(() => resampleCandles(h1, 'M15', t('2026-09-21T12:00:00Z'))).toThrow();
  });
});
