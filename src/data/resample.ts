import { bucketStart, candleCloseTime, TIMEFRAME_MS, type Timeframe } from '../core/timeframe.js';
import type { Candle, Ohlc } from '../core/types.js';

function mergeOhlc(target: Ohlc, next: Ohlc): void {
  if (next.high > target.high) target.high = next.high;
  if (next.low < target.low) target.low = next.low;
  target.close = next.close;
}

/**
 * Resamples closed lower-timeframe candles (e.g. M15) into a higher timeframe (M30/H1).
 * A higher bucket is emitted only if its close time <= asOfMs, even when some of its
 * lower candles already exist (spec §12 NL2). Ask OHLC is kept only if every
 * constituent candle has it.
 */
export function resampleCandles(
  candles: readonly Candle[],
  target: Timeframe,
  asOfMs: number,
): Candle[] {
  const result: Candle[] = [];
  let current: Candle | null = null;
  let askComplete = true;

  const finish = (): void => {
    if (!current) return;
    if (!askComplete) delete current.ask;
    if (candleCloseTime(current.openTime, target) <= asOfMs) result.push(current);
    current = null;
  };

  for (const candle of candles) {
    if (TIMEFRAME_MS[target] % TIMEFRAME_MS[candle.timeframe] !== 0 || TIMEFRAME_MS[target] < TIMEFRAME_MS[candle.timeframe]) {
      throw new Error(`Cannot resample ${candle.timeframe} into ${target}`);
    }
    if (candleCloseTime(candle.openTime, candle.timeframe) > asOfMs) break;
    const openTime = bucketStart(candle.openTime, target);
    if (current && current.openTime === openTime) {
      mergeOhlc(current, candle);
      if (current.ask && candle.ask) mergeOhlc(current.ask, candle.ask);
      else askComplete = false;
      current.tickCount = (current.tickCount ?? 0) + (candle.tickCount ?? 0);
      continue;
    }
    if (current && openTime < current.openTime) {
      throw new Error('Candles must be ascending to resample');
    }
    finish();
    askComplete = candle.ask !== undefined;
    current = {
      timeframe: target,
      openTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      ...(candle.ask ? { ask: { ...candle.ask } } : {}),
      ...(candle.tickCount !== undefined ? { tickCount: candle.tickCount } : {}),
    };
  }
  finish();
  return result;
}
