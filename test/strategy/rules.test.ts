import { describe, expect, it } from 'vitest';
import type { Candle } from '../../src/core/types.js';
import { resolveParams } from '../../src/strategy/params.js';
import { checkCandle, checkPullback, checkRsi, checkTrend, type Series } from '../../src/strategy/rules.js';
import { candle, testConfig } from '../helpers/fixtures.js';

// Real V1 parameters, H1: touch tol 5 pips = 50 points, min swing 15 pips = 150 points.
const p = resolveParams(testConfig(), 'H1');

/** Flat candles around `price` with EMA-fast fixed at `ema`, i.e. no touch and no swing unless edited. */
function flatSeries(length: number, ema = 100_000, price = 100_100): { candles: Candle[]; s: Series } {
  const candles = Array.from({ length }, (_, i) => candle(i, price, price + 20, price - 20, price + 5));
  const s: Series = {
    candles,
    emaFast: Array(length).fill(ema),
    emaSlow: Array(length).fill(ema - 500),
    rsi: Array(length).fill(45),
  };
  return { candles, s };
}

describe('Rule 1: trend [PDF]', () => {
  it('needs EMA50 > EMA200 and close above both', () => {
    const { s } = flatSeries(3);
    expect(checkTrend(s, 2).ok).toBe(true);
    (s.emaSlow as number[])[2] = 100_050; // slow above fast
    expect(checkTrend(s, 2).ok).toBe(false);
    const { s: s2, candles } = flatSeries(3);
    candles[2] = { ...candles[2]!, close: 99_990 }; // close below EMA50
    expect(checkTrend(s2, 2).ok).toBe(false);
    expect(checkTrend({ ...s2, emaFast: [null, null, null] }, 2).ok).toBe(false);
  });
});

describe('Rule 2: pullback, with strict temporal order', () => {
  it('passes with a prior move before the first touch', () => {
    const { candles, s } = flatSeries(30);
    candles[20] = { ...candles[20]!, high: 100_200 }; // 200 points above EMA: prior move
    candles[28] = { ...candles[28]!, low: 100_040 }; // within 50 points: touch (t = 28)
    const r = checkPullback(s, 29, p);
    expect(r).toMatchObject({ ok: true, touch: true, firstTouch: 28, swing: true, swingIndex: 20 });
  });

  it('NL5: an extension at or after the first touch does not count; moved to t−1 it does', () => {
    const { candles, s } = flatSeries(30);
    candles[27] = { ...candles[27]!, low: 100_040 }; // first touch t = 27
    candles[28] = { ...candles[28]!, high: 100_300 }; // extension AFTER the touch
    expect(checkPullback(s, 29, p)).toMatchObject({ touch: true, firstTouch: 27, swing: false, ok: false });
    candles[28] = { ...candles[28]!, high: 100_120 };
    candles[26] = { ...candles[26]!, high: 100_300 }; // extension at t − 1
    expect(checkPullback(s, 29, p)).toMatchObject({ swing: true, swingIndex: 26, ok: true });
  });

  it('NL6: the signal candle cannot create the prior move', () => {
    const { candles, s } = flatSeries(30);
    // Signal candle i = 29 touches the EMA AND has a huge high; nothing earlier is extended.
    candles[29] = candle(29, 100_050, 100_400, 100_030, 100_380);
    expect(checkPullback(s, 29, p)).toMatchObject({ touch: true, firstTouch: 29, swing: false, ok: false });
  });

  it('NL7: a touch after the signal candle is ignored', () => {
    const { candles, s } = flatSeries(31);
    candles[20] = { ...candles[20]!, high: 100_200 };
    candles[30] = { ...candles[30]!, low: 100_000 }; // touch only at i + 1
    expect(checkPullback(s, 29, p).touch).toBe(false);
    expect(checkPullback(s, 30, p).ok).toBe(true);
  });

  it('respects the touch window (i − 2 … i) and the swing window (20 candles before t)', () => {
    const { candles, s } = flatSeries(40);
    candles[26] = { ...candles[26]!, low: 100_000 }; // i − 3: outside the window for i = 29
    expect(checkPullback(s, 29, p).touch).toBe(false);
    const { candles: c2, s: s2 } = flatSeries(40);
    c2[7] = { ...c2[7]!, high: 100_500 }; // t − 21: outside the swing window
    c2[28] = { ...c2[28]!, low: 100_000 };
    expect(checkPullback(s2, 29, p).swing).toBe(false);
    c2[8] = { ...c2[8]!, high: 100_500 }; // t − 20: inside
    expect(checkPullback(s2, 29, p).swing).toBe(true);
  });
});

describe('Rule 3: RSI', () => {
  const rsiSeries = (values: number[]): Series => {
    const { s } = flatSeries(values.length);
    return { ...s, rsi: values };
  };

  it('PDF example (dip to 32, hook to 40) passes at 35 and fails at the PDF-literal 30', () => {
    const s = rsiSeries([50, 45, 38, 32, 36, 40]);
    expect(checkRsi(s, 5, p)).toMatchObject({ ok: true, branch: 'recovery' });
    const pdf30 = resolveParams(testConfig((raw) => (raw.strategy.rsi.oversold = 30)), 'H1');
    expect(checkRsi(s, 5, pdf30)).toMatchObject({ ok: false, branch: null });
  });

  it('NL8: the recovery window is bounded to i − lookback … i', () => {
    // lookback = 5, i = 7. Dip at index 1 = i − 6 (outside) fails; at 2 = i − 5 (inside) passes.
    expect(checkRsi(rsiSeries([45, 30, 45, 44, 43, 42, 40, 41]), 7, p).recovery).toBe(false);
    expect(checkRsi(rsiSeries([45, 45, 30, 44, 43, 42, 40, 41]), 7, p).recovery).toBe(true);
  });

  it('requires RSI to be rising on both branches', () => {
    expect(checkRsi(rsiSeries([50, 55, 60]), 2, p)).toMatchObject({ ok: true, branch: 'above_mid' });
    expect(checkRsi(rsiSeries([50, 62, 60]), 2, p)).toMatchObject({ ok: false });
    expect(checkRsi(rsiSeries([34, 36, 35]), 2, p).ok).toBe(false);
  });

  it('honours rsi.mode', () => {
    const recoveryOnly = resolveParams(testConfig((raw) => (raw.strategy.rsi.mode = 'recovery_only')), 'H1');
    const midOnly = resolveParams(testConfig((raw) => (raw.strategy.rsi.mode = 'above_mid_only')), 'H1');
    const s = rsiSeries([50, 55, 60]);
    expect(checkRsi(s, 2, recoveryOnly).ok).toBe(false);
    expect(checkRsi(s, 2, midOnly).ok).toBe(true);
    const r = rsiSeries([40, 33, 38]);
    expect(checkRsi(r, 2, recoveryOnly).ok).toBe(true);
    expect(checkRsi(r, 2, midOnly).ok).toBe(false);
  });
});

describe('Rule 4: price action at the value area', () => {
  const base = (): Series => flatSeries(3).s;

  it('bullish engulfing compares bodies, and must be at the zone', () => {
    const s = base();
    const c = s.candles as Candle[];
    c[1] = candle(1, 100_060, 100_070, 100_020, 100_030); // bearish, low in zone (≤ 100_050)
    c[2] = candle(2, 100_030, 100_110, 100_025, 100_100); // bullish, engulfs body
    expect(checkCandle(s, 2, p, [1, 2]).patterns).toContain('engulfing');
    expect(checkCandle(s, 2, p, []).ok).toBe(false); // not at the value area
    c[2] = candle(2, 100_030, 100_110, 100_025, 100_055); // body not larger: 25 < 30
    expect(checkCandle(s, 2, p, [1, 2]).patterns).not.toContain('engulfing');
  });

  it('pin bar geometry: long lower wick, small upper wick, minimum range', () => {
    const s = base();
    const c = s.candles as Candle[];
    // range 120, body 10, lower wick 100 (≥ 2×body, ≥ 0.6×range), upper wick 10 (≤ 0.2×range)
    c[2] = candle(2, 100_100, 100_120, 100_000, 100_110);
    expect(checkCandle(s, 2, p, [2]).patterns).toEqual(['pin_bar']);
    expect(checkCandle(s, 2, p, [1]).ok).toBe(false); // wick must itself touch the zone
    c[2] = candle(2, 100_100, 100_160, 100_000, 100_110); // upper wick 50 > 0.2×160
    expect(checkCandle(s, 2, p, [2]).ok).toBe(false);
    c[2] = candle(2, 100_030, 100_034, 100_000, 100_032); // range 34 < 50 (5 pips)
    expect(checkCandle(s, 2, p, [2]).ok).toBe(false);
  });
});
