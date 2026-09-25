import { seededRandom } from '../core/random.js';
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

export interface Interval {
  value: number | null;
  low: number | null;
  high: number | null;
  n: number;
}

/** Wilson score interval for k successes in n trials (95% by default). */
export function wilson(k: number, n: number, z = 1.96): Interval {
  if (n === 0) return { value: null, low: null, high: null, n };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { value: p, low: centre - half, high: centre + half, n };
}

/**
 * Percentile-bootstrap 95% interval for mean(a) − mean(b), with a seeded PRNG so reports are
 * reproducible.
 */
export function bootstrapMeanDiff(a: readonly number[], b: readonly number[], seed = 20260925, iterations = 10_000): Interval {
  if (!a.length || !b.length) return { value: null, low: null, high: null, n: a.length + b.length };
  const random = seededRandom(seed);
  const mean = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
  const draw = (xs: readonly number[]): number => {
    let sum = 0;
    for (let k = 0; k < xs.length; k++) sum += xs[Math.floor(random() * xs.length)]!;
    return sum / xs.length;
  };
  const diffs = Float64Array.from({ length: iterations }, () => draw(a) - draw(b)).sort();
  return {
    value: mean(a) - mean(b),
    low: diffs[Math.floor(0.025 * iterations)]!,
    high: diffs[Math.ceil(0.975 * iterations) - 1]!,
    n: a.length + b.length,
  };
}

/** Mean with a normal-approximation 95% interval (sample standard deviation). */
export function meanInterval(values: readonly number[], z = 1.96): Interval {
  const n = values.length;
  if (n === 0) return { value: null, low: null, high: null, n };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n < 2) return { value: mean, low: null, high: null, n };
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const half = (z * sd) / Math.sqrt(n);
  return { value: mean, low: mean - half, high: mean + half, n };
}

export interface PeriodSummary {
  period: string;
  tradingDays: number;
  signals: number;
  emailed: number;
  filled: number;
  target: number;
  stop: number;
  open: number;
  targetShare: Interval;
  expectancyR: Interval;
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
  /** Trading weeks ≈ trading days in the window / 5. */
  weeks: number;
  emailedPerWeek: number;
  filledPerWeek: number;
  targetShare: Interval;
  /** Mean R per filled trade (rMultiple), with 95% interval. */
  expectancyR: Interval;
  /** Mean R per emailed alert, counting unfilled alerts as 0 R. */
  expectancyPerAlertR: Interval;
  byYear: PeriodSummary[];
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
  const rValues = filled.map((a) => a.outcome?.rMultiple).filter((v): v is number => v != null);
  const perAlertR = emailed
    .map((a) => (a.execution?.status === 'filled' ? (a.outcome?.rMultiple ?? null) : 0))
    .filter((v): v is number => v !== null);
  const year = (ms: number): string => local(ms).date.slice(0, 4);
  const years = [...new Set(inWindow.map((d) => year(d.closeTime)))].sort();
  const byYear: PeriodSummary[] = years.map((y) => {
    const ySignals = signals.filter((d) => year(d.closeTime) === y);
    const yEmailed = emailed.filter((a) => year(a.decision.closeTime) === y);
    const yFilled = yEmailed.filter((a) => a.execution?.status === 'filled');
    const yOut = yFilled.map((a) => a.outcome).filter((o) => o !== null);
    const target = yOut.filter((o) => o.twoR === 'target').length;
    const stop = yOut.filter((o) => o.twoR === 'stop').length;
    return {
      period: y,
      tradingDays: new Set(inWindow.filter((d) => year(d.closeTime) === y).map((d) => local(d.closeTime).date)).size,
      signals: ySignals.length,
      emailed: yEmailed.length,
      filled: yFilled.length,
      target,
      stop,
      open: yOut.length - target - stop,
      targetShare: wilson(target, target + stop),
      expectancyR: meanInterval(yOut.map((o) => o.rMultiple).filter((v): v is number => v != null)),
    };
  });
  const weeks = days.size / 5;

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
    weeks,
    emailedPerWeek: weeks ? emailed.length / weeks : 0,
    filledPerWeek: weeks ? filled.length / weeks : 0,
    targetShare: wilson(twoR.target ?? 0, resolved),
    expectancyR: meanInterval(rValues),
    expectancyPerAlertR: meanInterval(perAlertR),
    byYear,
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
