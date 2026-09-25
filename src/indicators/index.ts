import type { Candle } from '../core/types.js';
import { ema } from './ema.js';
import { rsi } from './rsi.js';

export interface IndicatorPeriods {
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
}

/** Per-candle indicator series aligned with the input candles (Bid closes, point units). */
export interface IndicatorSeries {
  emaFast: (number | null)[];
  emaSlow: (number | null)[];
  rsi: (number | null)[];
}

export function computeIndicators(candles: readonly Candle[], periods: IndicatorPeriods): IndicatorSeries {
  const closes = candles.map((candle) => candle.close);
  return {
    emaFast: ema(closes, periods.emaFast),
    emaSlow: ema(closes, periods.emaSlow),
    rsi: rsi(closes, periods.rsiPeriod),
  };
}

export { ema, rsi };
