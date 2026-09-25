/**
 * V1 diagnostic ablation (owner request, 2026-09-25). DIAGNOSTIC ONLY: it does not change or
 * replace the frozen V1 baseline and selects nothing. Every in-window candle on a trading day
 * that passes Rule 1 (trend) — or passes the other three rules without it — is treated as an
 * independent hypothetical trade with the V1 trade plan (Buy Limit at close − offset, reference
 * stop, 1:2). No cooldown or daily cap is applied, so nearby candles overlap; intervals are
 * clustered by day. Each trade is simulated twice: the production Buy Limit and the PDF
 * next-open market entry (a diagnostic baseline, P6).
 */
import type { AppConfig } from '../config/schema.js';
import { configHash } from '../config/load.js';
import { pipsToPoints } from '../core/price.js';
import { TIMEFRAME_MS, type Timeframe } from '../core/timeframe.js';
import { makeLocalClock } from '../core/timezone.js';
import type { Candle } from '../core/types.js';
import { sessionOf, type Session } from '../jev/snapshot.js';
import { buildSeries, evaluateIndex, makeEngineContext } from '../strategy/engine.js';
import { checkRsi } from '../strategy/rules.js';
import { candidatePlan } from '../strategy/score.js';
import { sendTimeCheck, simulateExecution } from './execution.js';
import type { TickStore } from './tick-store.js';

export type RsiVariant = 'both35' | 'both30' | 'recovery35' | 'recovery30' | 'aboveMid';
export const RSI_VARIANTS: readonly RsiVariant[] = ['both35', 'both30', 'recovery35', 'recovery30', 'aboveMid'];

export type VolRegime = 'low' | 'normal' | 'high';
export type TrendStrength = 'weak' | 'moderate' | 'strong';

export interface TradeResult {
  /** 'filled' or why not. */
  status: 'filled' | 'not_sent' | 'invalid_at_placement' | 'expired' | 'no_data' | 'entry_below_stop';
  twoR: 'target' | 'stop' | 'open' | null;
  /** R multiple (target +2, stop realized, open marked to market); null if not filled or data ended. */
  r: number | null;
  /** Max favourable / adverse excursion before exit (or the horizon), in R. */
  mfeR: number | null;
  maeR: number | null;
}

export interface AblationSample {
  timeframe: Timeframe;
  closeTime: number;
  year: number;
  session: Session;
  vol: VolRegime;
  trendStrength: TrendStrength;
  trend: boolean;
  pullback: boolean;
  candle: boolean;
  /** RSI rule outcome under each variant (both35 = the V1 default). */
  rsi: Record<RsiVariant, boolean>;
  rsiBranch: 'recovery' | 'above_mid' | null;
  engulfing: boolean;
  pinBar: boolean;
  riskPips: number;
  limit: TradeResult;
  market: TradeResult;
}

interface Exit {
  twoR: 'target' | 'stop' | 'open';
  r: number | null;
  mfeR: number;
  maeR: number;
}

/**
 * +2R vs −1R race from the fill, on the Bid, stopping at the exit. Same rules as
 * `measureOutcome` for twoR and rMultiple (an open trade is marked to market at `horizonMs`).
 */
export function raceToExit(store: TickStore, fillIndex: number, fill: number, refSl: number, horizonMs: number): Exit {
  const risk = fill - refSl;
  const target = fill + 2 * risk;
  const end = store.timeAt(fillIndex) + horizonMs;
  let hi = -Infinity;
  let lo = Infinity;
  let k = fillIndex;
  for (; k < store.length && store.timeAt(k) <= end; k++) {
    const bid = store.bid(k);
    if (bid > hi) hi = bid;
    if (bid < lo) lo = bid;
    if (bid <= refSl) return { twoR: 'stop', r: (bid - fill) / risk, mfeR: (hi - fill) / risk, maeR: (fill - lo) / risk };
    if (bid >= target) return { twoR: 'target', r: 2, mfeR: (hi - fill) / risk, maeR: (fill - lo) / risk };
  }
  const dataEnded = k >= store.length;
  const last = store.bid(Math.max(fillIndex, k - 1));
  return { twoR: 'open', r: dataEnded ? null : (last - fill) / risk, mfeR: (hi - fill) / risk, maeR: (fill - lo) / risk };
}

const none = (status: TradeResult['status']): TradeResult => ({ status, twoR: null, r: null, mfeR: null, maeR: null });

export function buildAblation(store: TickStore, candles: Partial<Record<Timeframe, readonly Candle[]>>, config: AppConfig, timeframes: readonly Timeframe[]): AblationSample[] {
  const hash = configHash(config);
  const local = makeLocalClock(config.alerts.timezone);
  const weekdays = new Set(config.selection.weekdays);
  const pp = config.instrument.pointsPerPip;
  const minDistance = pipsToPoints(config.execution.minLimitDistancePips, pp);
  const out: AblationSample[] = [];

  for (const tf of timeframes) {
    const list = candles[tf];
    if (!list?.length) continue;
    const ctx = makeEngineContext(config, tf, hash);
    const series = buildSeries(list, ctx);
    const tfMs = TIMEFRAME_MS[tf];
    const horizonMs = Math.max(...config.strategy.timeframes[tf].outcomeHorizons) * tfMs;
    const rsiParams = {
      both35: ctx.params,
      both30: { ...ctx.params, rsi: { ...ctx.params.rsi, mode: 'both' as const, oversold: 30 } },
      recovery35: { ...ctx.params, rsi: { ...ctx.params.rsi, mode: 'recovery_only' as const, oversold: 35 } },
      recovery30: { ...ctx.params, rsi: { ...ctx.params.rsi, mode: 'recovery_only' as const, oversold: 30 } },
      aboveMid: { ...ctx.params, rsi: { ...ctx.params.rsi, mode: 'above_mid_only' as const } },
    };
    // Rolling mean ranges (causal) for the volatility regime.
    const range = list.map((c) => c.high - c.low);
    const prefix = new Float64Array(range.length + 1);
    range.forEach((r, k) => (prefix[k + 1] = prefix[k]! + r));
    const meanRange = (i: number, n: number): number => (prefix[i + 1]! - prefix[Math.max(0, i + 1 - n)]!) / Math.min(n, i + 1);

    for (let i = 0; i < list.length; i++) {
      const d = evaluateIndex(series, i, ctx);
      if (d.status === 'warmup' || !d.inWindow) continue;
      if (!weekdays.has(new Date(`${local(d.closeTime).date}T00:00:00Z`).getUTCDay())) continue;
      if (!d.trend && !(d.pullback.ok && d.rsiCheck.ok && d.candle.ok)) continue;
      const plan = candidatePlan(series, i, d, ctx);
      if (!plan) continue;

      const short = meanRange(i, 20);
      const long = meanRange(i, 240);
      const volRatio = long > 0 ? short / long : 1;
      const gap = short > 0 ? (d.emaFast! - d.emaSlow!) / short : 0;

      // Production Buy Limit.
      let limit: TradeResult;
      if (!sendTimeCheck(store, d.closeTime, plan.entry, minDistance).ok) limit = none('not_sent');
      else {
        const ex = simulateExecution(store, 'buy_limit', {
          closeTime: d.closeTime,
          expiryTime: d.closeTime + config.entry.validCandles * tfMs,
          placementDelayMs: config.backtest.placementDelaySec * 1000,
          entry: plan.entry,
          minDistancePoints: minDistance,
        });
        limit = ex.status === 'filled' ? { status: 'filled', ...raceToExit(store, ex.fillIndex!, ex.fillPrice!, plan.refSl, horizonMs) } : none(ex.status);
      }
      // PDF market entry at the next open, filled at the Ask (diagnostic).
      const mk = simulateExecution(store, 'pdf_market', {
        closeTime: d.closeTime,
        expiryTime: d.closeTime,
        placementDelayMs: config.backtest.placementDelaySec * 1000,
        entry: plan.entry,
        minDistancePoints: minDistance,
      });
      let market: TradeResult;
      if (mk.status !== 'filled') market = none(mk.status);
      else if (mk.fillPrice! <= plan.refSl) market = none('entry_below_stop');
      else market = { status: 'filled', ...raceToExit(store, mk.fillIndex!, mk.fillPrice!, plan.refSl, horizonMs) };

      out.push({
        timeframe: tf,
        closeTime: d.closeTime,
        year: new Date(d.closeTime).getUTCFullYear(),
        session: sessionOf(d.closeTime),
        vol: volRatio < 0.8 ? 'low' : volRatio > 1.25 ? 'high' : 'normal',
        trendStrength: gap < 1 ? 'weak' : gap < 3 ? 'moderate' : 'strong',
        trend: d.trend,
        pullback: d.pullback.ok,
        candle: d.candle.ok,
        rsi: Object.fromEntries(RSI_VARIANTS.map((v) => [v, v === 'both35' ? d.rsiCheck.ok : checkRsi(series, i, rsiParams[v]).ok])) as Record<RsiVariant, boolean>,
        rsiBranch: d.rsiCheck.branch,
        engulfing: d.candle.patterns.includes('engulfing'),
        pinBar: d.candle.patterns.includes('pin_bar'),
        riskPips: (plan.entry - plan.refSl) / pp,
        limit,
        market,
      });
    }
  }
  return out;
}

export interface CellStats {
  candles: number;
  /** Buy Limit: filled / candles. */
  fillRate: number | null;
  filled: number;
  meanR: number | null;
  low: number | null;
  high: number | null;
  medianR: number | null;
  /** +2R first, share of resolved (target + stop). Break-even ≈ 33%. */
  targetShare: number | null;
  mfeR: number | null;
  maeR: number | null;
}

/** Mean R with a day-clustered (ratio-estimator) 95% interval, plus distribution stats. */
export function cellStats(samples: readonly AblationSample[], pick: (s: AblationSample) => TradeResult): CellStats {
  const filled = samples.map((s) => ({ s, t: pick(s) })).filter(({ t }) => t.status === 'filled' && t.r !== null);
  const rs = filled.map(({ t }) => t.r!);
  const n = rs.length;
  const base: CellStats = { candles: samples.length, fillRate: samples.length ? filled.length / samples.length : null, filled: n, meanR: null, low: null, high: null, medianR: null, targetShare: null, mfeR: null, maeR: null };
  if (!n) return base;
  const mean = rs.reduce((a, b) => a + b, 0) / n;
  const byDay = new Map<number, { sum: number; count: number }>();
  for (const { s, t } of filled) {
    const day = Math.floor(s.closeTime / 86_400_000);
    const e = byDay.get(day) ?? { sum: 0, count: 0 };
    e.sum += t.r!;
    e.count += 1;
    byDay.set(day, e);
  }
  const D = byDay.size;
  let v = 0;
  for (const e of byDay.values()) v += (e.sum - mean * e.count) ** 2;
  const se = D > 1 ? Math.sqrt((v * D) / (D - 1)) / n : null;
  const sorted = [...rs].sort((a, b) => a - b);
  const target = filled.filter(({ t }) => t.twoR === 'target').length;
  const stop = filled.filter(({ t }) => t.twoR === 'stop').length;
  const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    ...base,
    meanR: mean,
    low: se === null ? null : mean - 1.96 * se,
    high: se === null ? null : mean + 1.96 * se,
    medianR: n % 2 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2,
    targetShare: target + stop ? target / (target + stop) : null,
    mfeR: avg(filled.map(({ t }) => t.mfeR!)),
    maeR: avg(filled.map(({ t }) => t.maeR!)),
  };
}
