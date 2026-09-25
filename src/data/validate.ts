import { TIMEFRAME_MS, type Timeframe } from '../core/timeframe.js';
import type { Candle, Ohlc } from '../core/types.js';

function ohlcIssues(ohlc: Ohlc, label: string): string[] {
  const issues: string[] = [];
  for (const key of ['open', 'high', 'low', 'close'] as const) {
    if (!Number.isInteger(ohlc[key])) issues.push(`${label}.${key} is not an integer point value`);
  }
  if (ohlc.low > ohlc.high) issues.push(`${label}: low > high`);
  if (ohlc.high < Math.max(ohlc.open, ohlc.close)) issues.push(`${label}: high below open/close`);
  if (ohlc.low > Math.min(ohlc.open, ohlc.close)) issues.push(`${label}: low above open/close`);
  return issues;
}

/** Returns human-readable integrity issues; an empty array means the series is valid. */
export function validateCandles(candles: readonly Candle[], timeframe: Timeframe): string[] {
  const issues: string[] = [];
  const size = TIMEFRAME_MS[timeframe];
  let previousOpen = -Infinity;
  candles.forEach((candle, index) => {
    const at = `candle[${index}] ${new Date(candle.openTime).toISOString()}`;
    if (candle.timeframe !== timeframe) issues.push(`${at}: timeframe ${candle.timeframe} != ${timeframe}`);
    if (candle.openTime % size !== 0) issues.push(`${at}: openTime not aligned to ${timeframe}`);
    if (candle.openTime <= previousOpen) issues.push(`${at}: not strictly ascending`);
    previousOpen = candle.openTime;
    issues.push(...ohlcIssues(candle, at));
    if (candle.ask) issues.push(...ohlcIssues(candle.ask, `${at} ask`));
  });
  return issues;
}

export function assertValidCandles(candles: readonly Candle[], timeframe: Timeframe): void {
  const issues = validateCandles(candles, timeframe);
  if (issues.length > 0) {
    const shown = issues.slice(0, 10).join('\n  ');
    throw new Error(`Invalid ${timeframe} candles (${issues.length} issues):\n  ${shown}`);
  }
}
