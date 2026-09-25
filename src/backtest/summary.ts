import { makeLocalClock } from '../core/timezone.js';
import type { TimeframeRun } from './runner.js';

export interface Distribution {
  n: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) return { n: 0, mean: null, median: null, min: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    n: sorted.length,
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    median: sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

const count = <T extends string>(items: readonly T[]): Record<string, number> =>
  items.reduce<Record<string, number>>((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {});

export interface RunSummary {
  variant: string;
  timeframe: string;
  configHash: string;
  firstEvaluatedOpen: number | null;
  lastEvaluatedOpen: number | null;
  evaluated: number;
  tradingDays: number;
  decisionStatus: Record<string, number>;
  funnel: { inWindow: number; trend: number; trendPullback: number; trendPullbackRsi: number; allFour: number };
  ruleRates: { trend: number; pullback: number; rsi: number; candle: number };
  signals: number;
  signalsPerDay: number;
  rsiBranches: Record<string, number>;
  patterns: Record<string, number>;
  alertStatus: Record<string, number>;
  emailed: number;
  emailedPerDay: number;
  execution: Record<string, number>;
  filled: number;
  fillRate: number | null;
  twoR: Record<string, number>;
  targetShareOfResolved: number | null;
  stopRealizedR: Distribution;
  stopSlippagePips: Distribution;
  slippedStops: number;
  riskPips: Distribution;
  lots: Distribution;
  raisedToMinLot: number;
  horizons: { candles: number; returnPips: Distribution; mfePips: Distribution; maePips: Distribution }[];
}

export function summarise(run: TimeframeRun, timeZone: string): RunSummary {
  const local = makeLocalClock(timeZone);
  const evaluated = run.decisions.filter((d) => d.status !== 'warmup');
  const inWindow = evaluated.filter((d) => d.inWindow);
  const days = new Set(inWindow.map((d) => local(d.closeTime).date));
  const signals = run.decisions.filter((d) => d.status === 'signal');
  const emailed = run.alerts.filter((a) => a.alertStatus === 'emailed');
  const executions = emailed.map((a) => a.execution).filter((e) => e !== null);
  const filled = emailed.filter((a) => a.execution?.status === 'filled');
  const outcomes = filled.map((a) => a.outcome).filter((o) => o !== null);
  const twoR = count(outcomes.map((o) => o.twoR));
  const resolved = (twoR.target ?? 0) + (twoR.stop ?? 0);
  const stops = outcomes.filter((o) => o.twoR === 'stop');
  const horizonCandles = [...new Set(outcomes.flatMap((o) => o.horizons.map((h) => h.horizonCandles)))].sort((a, b) => a - b);
  const rate = (n: number): number => (inWindow.length ? n / inWindow.length : 0);

  return {
    variant: run.variant,
    timeframe: run.timeframe,
    configHash: run.configHash,
    firstEvaluatedOpen: evaluated[0]?.openTime ?? null,
    lastEvaluatedOpen: evaluated.at(-1)?.openTime ?? null,
    evaluated: evaluated.length,
    tradingDays: days.size,
    decisionStatus: count(run.decisions.map((d) => d.status)),
    funnel: {
      inWindow: inWindow.length,
      trend: inWindow.filter((d) => d.trend).length,
      trendPullback: inWindow.filter((d) => d.trend && d.pullback.ok).length,
      trendPullbackRsi: inWindow.filter((d) => d.trend && d.pullback.ok && d.rsiCheck.ok).length,
      allFour: inWindow.filter((d) => d.trend && d.pullback.ok && d.rsiCheck.ok && d.candle.ok).length,
    },
    ruleRates: {
      trend: rate(inWindow.filter((d) => d.trend).length),
      pullback: rate(inWindow.filter((d) => d.pullback.ok).length),
      rsi: rate(inWindow.filter((d) => d.rsiCheck.ok).length),
      candle: rate(inWindow.filter((d) => d.candle.ok).length),
    },
    signals: signals.length,
    signalsPerDay: days.size ? signals.length / days.size : 0,
    rsiBranches: count(signals.map((d) => d.rsiCheck.branch ?? 'none')),
    patterns: count(signals.flatMap((d) => (d.candle.patterns.length > 1 ? ['both'] : d.candle.patterns))),
    alertStatus: count(run.alerts.map((a) => a.alertStatus)),
    emailed: emailed.length,
    emailedPerDay: days.size ? emailed.length / days.size : 0,
    execution: count(executions.map((e) => e.status)),
    filled: filled.length,
    fillRate: emailed.length ? filled.length / emailed.length : null,
    twoR,
    targetShareOfResolved: resolved ? (twoR.target ?? 0) / resolved : null,
    stopRealizedR: distribution(stops.map((o) => o.realizedR!).filter((v) => v !== null)),
    stopSlippagePips: distribution(stops.map((o) => o.stopSlippagePips!).filter((v) => v !== null)),
    slippedStops: stops.filter((o) => (o.stopSlippagePips ?? 0) > 0).length,
    riskPips: distribution(filled.map((a) => a.riskPips!).filter((v) => v !== null)),
    lots: distribution(emailed.map((a) => a.decision.plan!.sizing.lots)),
    raisedToMinLot: emailed.filter((a) => a.decision.plan!.sizing.raisedToMinLot).length,
    horizons: horizonCandles.map((candles) => {
      const hs = outcomes.flatMap((o) => o.horizons.filter((h) => h.horizonCandles === candles));
      return {
        candles,
        returnPips: distribution(hs.map((h) => h.returnPips).filter((v): v is number => v !== null)),
        mfePips: distribution(hs.map((h) => h.mfePips)),
        maePips: distribution(hs.map((h) => h.maePips)),
      };
    }),
  };
}
