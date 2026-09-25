/**
 * V1 BUY decision engine (spec §2–§9). `decideAt` is a pure function of the candles it is
 * given (ending at the signal candle) plus config; it never sees later data (spec §1).
 * Decision records contain no execution or outcome fields (spec §12 NL12).
 */
import type { AppConfig } from '../config/schema.js';
import { formatPoints } from '../core/price.js';
import { candleCloseTime, type Timeframe } from '../core/timeframe.js';
import { clockToMinutes, makeLocalClock, type LocalTime } from '../core/timezone.js';
import type { Candle } from '../core/types.js';
import { computeIndicators } from '../indicators/index.js';
import { resolveParams, type StrategyParams } from './params.js';
import { checkCandle, checkPullback, checkRsi, checkTrend, type Pattern, type RsiBranch, type Series } from './rules.js';
import { computeEntry, computeReferenceStop, computeSizing, type Sizing } from './sizing.js';

export type DecisionStatus =
  | 'warmup'
  | 'no_signal'
  | 'outside_window'
  | 'signal'
  | 'invalid_risk_geometry'
  | 'risk_exceeds_max';

export interface TradePlan {
  /** Buy Limit price, points. */
  entry: number;
  /** Recommended stop (reference only; never placed by the system), points. */
  refSl: number;
  sizing: Sizing;
}

export interface Decision {
  id: string;
  timeframe: Timeframe;
  openTime: number;
  closeTime: number;
  closeLocal: string;
  ohlc: [number, number, number, number];
  emaFast: number | null;
  emaSlow: number | null;
  rsi: number | null;
  rsiPrev: number | null;
  trend: boolean;
  pullback: { ok: boolean; touch: boolean; firstTouchOpenTime: number | null; swing: boolean };
  rsiCheck: { ok: boolean; branch: RsiBranch | null };
  candle: { ok: boolean; patterns: Pattern[] };
  inWindow: boolean;
  /** All four rules and the trading window pass. */
  buySignal: boolean;
  plan: TradePlan | null;
  status: DecisionStatus;
  configHash: string;
}

export interface EngineContext {
  config: AppConfig;
  params: StrategyParams;
  configHash: string;
  local: (utcMs: number) => LocalTime;
  windowStart: number;
  windowEnd: number;
}

export function makeEngineContext(config: AppConfig, timeframe: Timeframe, configHash: string): EngineContext {
  return {
    config,
    params: resolveParams(config, timeframe),
    configHash,
    local: makeLocalClock(config.alerts.timezone),
    windowStart: clockToMinutes(config.alerts.windowStart),
    windowEnd: clockToMinutes(config.alerts.windowEnd),
  };
}

function formatLocal(t: LocalTime): string {
  const hh = String(Math.floor(t.minuteOfDay / 60)).padStart(2, '0');
  const mm = String(t.minuteOfDay % 60).padStart(2, '0');
  return `${t.date} ${hh}:${mm}`;
}

/**
 * Evaluates candle i of a series whose indicators were computed on the same candles.
 * Only indices <= i are read, so passing indicators computed on a longer series gives the
 * same result as passing the prefix (indicator prefix invariance, NL1). Tests enforce this (NL3/NL4).
 */
export function evaluateIndex(series: Series, i: number, ctx: EngineContext): Decision {
  const p = ctx.params;
  const candle = series.candles[i]!;
  const closeTime = candleCloseTime(candle.openTime, p.timeframe);
  const local = ctx.local(closeTime);
  const inWindow = local.minuteOfDay >= ctx.windowStart && local.minuteOfDay <= ctx.windowEnd;
  const base = {
    id: `${ctx.config.instrument.symbol}|${p.timeframe}|${new Date(candle.openTime).toISOString()}`,
    timeframe: p.timeframe,
    openTime: candle.openTime,
    closeTime,
    closeLocal: formatLocal(local),
    ohlc: [candle.open, candle.high, candle.low, candle.close] as [number, number, number, number],
    emaFast: series.emaFast[i] ?? null,
    emaSlow: series.emaSlow[i] ?? null,
    rsi: series.rsi[i] ?? null,
    rsiPrev: i > 0 ? (series.rsi[i - 1] ?? null) : null,
    inWindow,
    configHash: ctx.configHash,
  };

  if (i < p.warmupCandles || base.emaFast === null || base.emaSlow === null || base.rsi === null) {
    return {
      ...base,
      trend: false,
      pullback: { ok: false, touch: false, firstTouchOpenTime: null, swing: false },
      rsiCheck: { ok: false, branch: null },
      candle: { ok: false, patterns: [] },
      buySignal: false,
      plan: null,
      status: 'warmup',
    };
  }

  // All four rules are always evaluated and logged (spec §6).
  const trend = checkTrend(series, i);
  const pullback = checkPullback(series, i, p);
  const rsi = checkRsi(series, i, p);
  const candleCheck = checkCandle(series, i, p, pullback.touchSet);
  const rulesPass = trend.ok && pullback.ok && rsi.ok && candleCheck.ok;
  const buySignal = rulesPass && inWindow;

  let plan: TradePlan | null = null;
  let status: DecisionStatus = rulesPass ? (inWindow ? 'signal' : 'outside_window') : 'no_signal';
  if (buySignal) {
    const entry = computeEntry(candle, p);
    const refSl = computeReferenceStop(series.candles, i, candleCheck.patterns, base.emaFast, p);
    const sizing = computeSizing(entry, refSl, ctx.config.account, p);
    plan = { entry, refSl, sizing };
    if (entry <= refSl) status = 'invalid_risk_geometry'; // V4
    else if (sizing.plannedRiskPct > ctx.config.account.maxRiskPercent) status = 'risk_exceeds_max'; // V5
  }

  return {
    ...base,
    trend: trend.ok,
    pullback: {
      ok: pullback.ok,
      touch: pullback.touch,
      firstTouchOpenTime: pullback.firstTouch === null ? null : series.candles[pullback.firstTouch]!.openTime,
      swing: pullback.swing,
    },
    rsiCheck: { ok: rsi.ok, branch: rsi.branch },
    candle: candleCheck,
    buySignal,
    plan,
    status,
  };
}

export function buildSeries(candles: readonly Candle[], ctx: EngineContext): Series {
  const p = ctx.params;
  return { candles, ...computeIndicators(candles, { emaFast: p.emaFast, emaSlow: p.emaSlow, rsiPeriod: p.rsiPeriod }) };
}

/** Decision for the LAST candle of `candles` (the live path: only data up to the signal candle). */
export function decideAt(candles: readonly Candle[], ctx: EngineContext): Decision {
  if (candles.length === 0) throw new Error('decideAt needs at least one candle');
  return evaluateIndex(buildSeries(candles, ctx), candles.length - 1, ctx);
}

/** Decisions for every candle (the batch/backtest path). */
export function decideAll(candles: readonly Candle[], ctx: EngineContext): Decision[] {
  const series = buildSeries(candles, ctx);
  return candles.map((_, i) => evaluateIndex(series, i, ctx));
}

/** Human-readable price for logs and reports. */
export function price(points: number, ctx: EngineContext): string {
  return formatPoints(points, ctx.params.digits);
}
