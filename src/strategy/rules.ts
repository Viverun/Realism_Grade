/**
 * The four BUY rules (spec §2–§5). Every function reads only indices <= i of the
 * series it is given; the engine additionally passes only candles[0..i] (spec §1).
 */
import type { Candle } from '../core/types.js';
import type { StrategyParams } from './params.js';

export interface Series {
  candles: readonly Candle[];
  emaFast: readonly (number | null)[];
  emaSlow: readonly (number | null)[];
  rsi: readonly (number | null)[];
}

export type RsiBranch = 'recovery' | 'above_mid';
export type Pattern = 'engulfing' | 'pin_bar';

export interface TrendResult {
  ok: boolean;
}

export interface PullbackResult {
  ok: boolean;
  touch: boolean;
  /** Indices k in the pullback window whose low reached the EMA-fast zone (the set T). */
  touchSet: number[];
  /** First touch t = min(T), or null. */
  firstTouch: number | null;
  swing: boolean;
  /** Index j of the qualifying prior-move candle (the latest one), or null. */
  swingIndex: number | null;
}

export interface RsiResult {
  ok: boolean;
  branch: RsiBranch | null;
  rising: boolean;
  recovery: boolean;
  aboveMid: boolean;
}

export interface CandleResult {
  ok: boolean;
  patterns: Pattern[];
}

const at = <T>(values: readonly T[], k: number): T => {
  const value = values[k];
  if (value === undefined) throw new Error(`index ${k} out of range`);
  return value;
};

/** Rule 1 [PDF]: EMA50 > EMA200, close > EMA50, close > EMA200. */
export function checkTrend(s: Series, i: number): TrendResult {
  const fast = s.emaFast[i];
  const slow = s.emaSlow[i];
  if (fast == null || slow == null) return { ok: false };
  const close = at(s.candles, i).close;
  return { ok: fast > slow && close > fast && close > slow };
}

/** Rule 2: touch of the EMA-fast zone in the pullback window, preceded strictly by a prior move. */
export function checkPullback(s: Series, i: number, p: StrategyParams): PullbackResult {
  const touchSet: number[] = [];
  for (let k = Math.max(0, i - p.pullbackLookback + 1); k <= i; k++) {
    const fast = s.emaFast[k];
    if (fast != null && at(s.candles, k).low <= fast + p.touchTolPoints) touchSet.push(k);
  }
  const firstTouch = touchSet.length ? touchSet[0]! : null;
  let swingIndex: number | null = null;
  if (firstTouch !== null) {
    // Prior move: strictly before the first touch (j <= t - 1), never the signal candle itself.
    for (let j = firstTouch - 1; j >= Math.max(0, firstTouch - p.swingLookback); j--) {
      const fast = s.emaFast[j];
      if (fast != null && at(s.candles, j).high - fast >= p.minSwingPoints) {
        swingIndex = j;
        break;
      }
    }
  }
  const touch = touchSet.length > 0;
  const swing = swingIndex !== null;
  return { ok: touch && swing, touch, touchSet, firstTouch, swing, swingIndex };
}

/** Rule 3: RSI rising, and (recovered from <= oversold within the lookback, or above mid). */
export function checkRsi(s: Series, i: number, p: StrategyParams): RsiResult {
  const none: RsiResult = { ok: false, branch: null, rising: false, recovery: false, aboveMid: false };
  const current = s.rsi[i];
  if (current == null) return none;
  const previous = i > 0 ? s.rsi[i - 1] : null;
  const rising = p.rsi.requireRising ? previous != null && current > previous : true;

  let min = Infinity;
  for (let k = Math.max(0, i - p.rsi.lookback); k <= i; k++) {
    const value = s.rsi[k];
    if (value != null && value < min) min = value;
  }
  const recovery = min <= p.rsi.oversold && current > p.rsi.oversold && rising;
  const aboveMid = current > p.rsi.mid && rising;

  const allowRecovery = p.rsi.mode !== 'above_mid_only';
  const allowAboveMid = p.rsi.mode !== 'recovery_only';
  const branch: RsiBranch | null =
    allowRecovery && recovery ? 'recovery' : allowAboveMid && aboveMid ? 'above_mid' : null;
  return { ok: branch !== null, branch, rising, recovery, aboveMid };
}

const body = (c: Candle): number => Math.abs(c.close - c.open);
const range = (c: Candle): number => c.high - c.low;
const upperWick = (c: Candle): number => c.high - Math.max(c.open, c.close);
const lowerWick = (c: Candle): number => Math.min(c.open, c.close) - c.low;

/** Rule 4: bullish engulfing (bodies) or pin bar/hammer, formed at the value area (touch set T). */
export function checkCandle(s: Series, i: number, p: StrategyParams, touchSet: readonly number[]): CandleResult {
  const patterns: Pattern[] = [];
  const current = at(s.candles, i);
  const inZone = (k: number): boolean => touchSet.includes(k);

  if (i > 0) {
    const prev = at(s.candles, i - 1);
    const engulfing =
      prev.close < prev.open &&
      current.close > current.open &&
      current.open <= prev.close &&
      current.close >= prev.open &&
      body(current) > body(prev) &&
      (inZone(i - 1) || inZone(i));
    if (engulfing) patterns.push('engulfing');
  }

  const r = range(current);
  const pin =
    r >= p.minRangePoints &&
    r > 0 &&
    lowerWick(current) >= p.pin.wickBodyRatio * body(current) &&
    lowerWick(current) >= p.pin.wickRangeRatio * r &&
    upperWick(current) <= p.pin.maxUpperRatio * r &&
    (!p.pin.requireBullishBody || current.close > current.open) &&
    inZone(i);
  if (pin) patterns.push('pin_bar');

  return { ok: patterns.length > 0, patterns };
}
