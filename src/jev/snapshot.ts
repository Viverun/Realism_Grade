/**
 * Jev research snapshot (docs/v1/jev-research-spec.md §2, D11). A pure function of
 * candles[0..i] plus the V1 decision for candle i: it reads no later candle. It carries only
 * relative, unit-free features: no timestamps, dates or absolute price levels, so Jev cannot
 * anchor on (or recall) a specific day. Any change to the fields or their definitions must
 * bump SNAPSHOT_VERSION, which restarts the validation clock (§5).
 */
import type { Timeframe } from '../core/timeframe.js';
import type { Candle } from '../core/types.js';
import type { Decision, EngineContext, TradePlan } from '../strategy/engine.js';
import type { Series } from '../strategy/rules.js';
import type { Scored } from '../strategy/score.js';

export const SNAPSHOT_VERSION = 'snap-v1';

/** Candles needed before i (EMA slope over 20, mean range over 20). */
export const SNAPSHOT_MIN_INDEX = 20;

export type Session = 'asia' | 'london' | 'overlap' | 'new_york' | 'late';

export interface CandleShape {
  /** (close − open) / range, signed: +1 = full bullish body. */
  bodyToRange: number;
  lowerWickToRange: number;
  upperWickToRange: number;
  /** Range in units of the 20-candle mean range. */
  rangeToMeanRange: number;
}

export interface Snapshot {
  timeframe: Timeframe;
  session: Session;
  trend: {
    emaGapPips: number;
    emaGapInRanges: number;
    closeToEmaFastPips: number;
    closeToEmaFastInRanges: number;
    emaFastSlope5Pips: number;
    emaFastSlope20Pips: number;
  };
  pullback: {
    lowToEmaFastPips: number;
    /** (low − EMA fast) / touch tolerance: ≤ 1 means inside the V1 touch zone. */
    lowToEmaFastInTolerances: number;
    /** Highest high of the swing window above the close, pips. */
    swingHighAboveClosePips: number;
    candlesSinceSwingHigh: number;
  };
  momentum: { rsi: number; rsi1Ago: number; rsi5Ago: number; rsiMinLookback: number };
  candle: { current: CandleShape; previous: CandleShape; engulfing: boolean; pinBar: boolean };
  volatility: { meanRangePips: number; spreadPips: number | null };
  v1: {
    trend: boolean;
    pullback: boolean;
    rsi: boolean;
    candle: boolean;
    score: number;
    tier: Scored['tier'];
    /** Signal close − Buy Limit entry, pips. */
    entryBelowClosePips: number;
    /** Planned risk R: entry − recommended stop, pips. */
    stopDistancePips: number;
  };
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Session bucket from the UTC hour of the candle close (reveals time of day, never the date). */
export function sessionOf(closeTimeUtcMs: number): Session {
  const h = new Date(closeTimeUtcMs).getUTCHours();
  if (h < 7) return 'asia';
  if (h < 12) return 'london';
  if (h < 16) return 'overlap';
  if (h < 21) return 'new_york';
  return 'late';
}

function shape(c: Candle, meanRange: number): CandleShape {
  const range = c.high - c.low;
  if (range <= 0) return { bodyToRange: 0, lowerWickToRange: 0, upperWickToRange: 0, rangeToMeanRange: 0 };
  return {
    bodyToRange: r2((c.close - c.open) / range),
    lowerWickToRange: r2((Math.min(c.open, c.close) - c.low) / range),
    upperWickToRange: r2((c.high - Math.max(c.open, c.close)) / range),
    rangeToMeanRange: r2(meanRange > 0 ? range / meanRange : 0),
  };
}

/** True when every indicator value the snapshot reads at or before i is available. */
export function snapshotReady(series: Series, i: number): boolean {
  if (i < SNAPSHOT_MIN_INDEX || series.emaSlow[i] == null) return false;
  for (let k = i - 20; k <= i; k++) if (series.emaFast[k] == null || series.rsi[k] == null) return false;
  return true;
}

export function buildSnapshot(series: Series, i: number, d: Decision, scored: Scored, plan: TradePlan, ctx: EngineContext): Snapshot {
  if (i < SNAPSHOT_MIN_INDEX) throw new Error(`snapshot needs at least ${SNAPSHOT_MIN_INDEX} prior candles`);
  const p = ctx.params;
  const pip = (points: number): number => r2(points / p.pointsPerPip);
  const c = series.candles[i]!;
  const fast = (k: number): number => {
    const v = series.emaFast[k];
    if (v == null) throw new Error(`EMA fast missing at ${k}`);
    return v;
  };
  const rsiAt = (k: number): number => {
    const v = series.rsi[k];
    if (v == null) throw new Error(`RSI missing at ${k}`);
    return v;
  };
  const slow = series.emaSlow[i];
  if (slow == null) throw new Error('EMA slow missing');

  let rangeSum = 0;
  for (let k = i - 19; k <= i; k++) rangeSum += series.candles[k]!.high - series.candles[k]!.low;
  const meanRange = rangeSum / 20;
  const inRanges = (points: number): number => r2(meanRange > 0 ? points / meanRange : 0);

  let hi = -Infinity;
  let hiAt = i;
  for (let k = Math.max(0, i - p.swingLookback); k <= i; k++) {
    if (series.candles[k]!.high >= hi) {
      hi = series.candles[k]!.high;
      hiAt = k;
    }
  }
  let rsiMin = Infinity;
  for (let k = Math.max(0, i - p.rsi.lookback); k <= i; k++) rsiMin = Math.min(rsiMin, rsiAt(k));

  return {
    timeframe: d.timeframe,
    session: sessionOf(d.closeTime),
    trend: {
      emaGapPips: pip(fast(i) - slow),
      emaGapInRanges: inRanges(fast(i) - slow),
      closeToEmaFastPips: pip(c.close - fast(i)),
      closeToEmaFastInRanges: inRanges(c.close - fast(i)),
      emaFastSlope5Pips: pip(fast(i) - fast(i - 5)),
      emaFastSlope20Pips: pip(fast(i) - fast(i - 20)),
    },
    pullback: {
      lowToEmaFastPips: pip(c.low - fast(i)),
      lowToEmaFastInTolerances: r2(p.touchTolPoints > 0 ? (c.low - fast(i)) / p.touchTolPoints : 0),
      swingHighAboveClosePips: pip(hi - c.close),
      candlesSinceSwingHigh: i - hiAt,
    },
    momentum: { rsi: r2(rsiAt(i)), rsi1Ago: r2(rsiAt(i - 1)), rsi5Ago: r2(rsiAt(i - 5)), rsiMinLookback: r2(rsiMin) },
    candle: {
      current: shape(c, meanRange),
      previous: shape(series.candles[i - 1]!, meanRange),
      engulfing: d.candle.patterns.includes('engulfing'),
      pinBar: d.candle.patterns.includes('pin_bar'),
    },
    volatility: { meanRangePips: pip(meanRange), spreadPips: c.ask ? pip(c.ask.close - c.close) : null },
    v1: {
      trend: d.trend,
      pullback: d.pullback.ok,
      rsi: d.rsiCheck.ok,
      candle: d.candle.ok,
      score: scored.score,
      tier: scored.tier,
      entryBelowClosePips: pip(c.close - plan.entry),
      stopDistancePips: pip(plan.entry - plan.refSl),
    },
  };
}

const SESSIONS: readonly Session[] = ['asia', 'london', 'overlap', 'new_york', 'late'];
const TFS: readonly Timeframe[] = ['M5', 'M15', 'M30', 'H1'];

/** Numeric features for the logistic baseline (§4): the same information Jev sees. */
export function featureNames(): string[] {
  return [
    ...TFS.slice(1).map((t) => `tf_${t}`),
    ...SESSIONS.slice(1).map((s) => `session_${s}`),
    'emaGapInRanges', 'closeToEmaFastInRanges', 'emaFastSlope5Pips', 'emaFastSlope20Pips',
    'lowToEmaFastInTolerances', 'swingHighAboveClosePips', 'candlesSinceSwingHigh',
    'rsi', 'rsiDelta1', 'rsiDelta5', 'rsiMinLookback',
    'cur_body', 'cur_lower', 'cur_upper', 'cur_range', 'prev_body', 'prev_range',
    'engulfing', 'pinBar', 'meanRangePips', 'spreadPips',
    'rule_trend', 'rule_pullback', 'rule_rsi', 'rule_candle', 'entryBelowClosePips', 'stopDistancePips',
  ];
}

export function featureVector(s: Snapshot): number[] {
  const b = (v: boolean): number => (v ? 1 : 0);
  return [
    ...TFS.slice(1).map((t) => b(s.timeframe === t)),
    ...SESSIONS.slice(1).map((x) => b(s.session === x)),
    s.trend.emaGapInRanges, s.trend.closeToEmaFastInRanges, s.trend.emaFastSlope5Pips, s.trend.emaFastSlope20Pips,
    s.pullback.lowToEmaFastInTolerances, s.pullback.swingHighAboveClosePips, s.pullback.candlesSinceSwingHigh,
    s.momentum.rsi, s.momentum.rsi - s.momentum.rsi1Ago, s.momentum.rsi - s.momentum.rsi5Ago, s.momentum.rsiMinLookback,
    s.candle.current.bodyToRange, s.candle.current.lowerWickToRange, s.candle.current.upperWickToRange,
    s.candle.current.rangeToMeanRange, s.candle.previous.bodyToRange, s.candle.previous.rangeToMeanRange,
    b(s.candle.engulfing), b(s.candle.pinBar), s.volatility.meanRangePips, s.volatility.spreadPips ?? 0,
    b(s.v1.trend), b(s.v1.pullback), b(s.v1.rsi), b(s.v1.candle), s.v1.entryBelowClosePips, s.v1.stopDistancePips,
  ];
}
