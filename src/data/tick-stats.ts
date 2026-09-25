import type { Tick } from '../core/types.js';
import type { ExnessTickRow } from './exness-ticks.js';

export interface TickStatsOptions {
  pointsPerPip: number;
  /** Instrument digits; used to tell float-formatting noise from real extra precision. */
  digits: number;
  /** Local-time classifier for the trading window (spreads are also reported inside it). */
  inWindow: (utcMs: number) => boolean;
  maxExamples?: number;
}

export interface Gap {
  from: number;
  to: number;
  weekend: boolean;
  /** True if any part of the gap falls inside the trading window. */
  inWindow: boolean;
}

export interface Jump {
  time: number;
  fromBid: number;
  toBid: number;
  pips: number;
}

export interface SpreadSummary {
  count: number;
  minPips: number;
  medianPips: number;
  p95Pips: number;
  p99Pips: number;
  maxPips: number;
  meanPips: number;
}

export interface TickStats {
  rows: number;
  parseErrors: { count: number; examples: string[] };
  symbols: Record<string, number>;
  timeSamples: string[];
  timeFormats: Record<string, number>;
  firstTime: number | null;
  lastTime: number | null;
  outOfOrder: number;
  duplicateTimestamps: number;
  bidDecimals: Record<number, number>;
  askDecimals: Record<number, number>;
  /** Prices with more than `digits` decimals that still round exactly (e.g. 1.1381999999999999). */
  floatNoise: { count: number; example: string | null };
  /** Prices with genuine sub-point precision that rounding changes. */
  precisionLoss: { count: number; example: string | null };
  crossed: { count: number; examples: string[] };
  zeroSpread: number;
  nonPositive: number;
  spread: SpreadSummary | null;
  spreadInWindow: SpreadSummary | null;
  ticksPerDay: Record<string, number>;
}

/** Describes a timestamp's shape with digits replaced by 9, e.g. "9999-99-99 99:99:99.999Z". */
export function timestampShape(raw: string): string {
  return raw.replace(/\d/g, '9');
}

function decimals(raw: string): number {
  const dot = raw.indexOf('.');
  return dot < 0 ? 0 : raw.length - dot - 1;
}

function summarise(histogram: Map<number, number>, pointsPerPip: number): SpreadSummary | null {
  let count = 0;
  let sum = 0;
  for (const [points, n] of histogram) {
    count += n;
    sum += points * n;
  }
  if (count === 0) return null;
  const keys = [...histogram.keys()].sort((a, b) => a - b);
  const quantile = (q: number): number => {
    const target = Math.ceil(q * count);
    let seen = 0;
    for (const key of keys) {
      seen += histogram.get(key)!;
      if (seen >= target) return key;
    }
    return keys[keys.length - 1]!;
  };
  const pips = (points: number): number => points / pointsPerPip;
  return {
    count,
    minPips: pips(keys[0]!),
    medianPips: pips(quantile(0.5)),
    p95Pips: pips(quantile(0.95)),
    p99Pips: pips(quantile(0.99)),
    maxPips: pips(keys[keys.length - 1]!),
    meanPips: pips(sum / count),
  };
}

const DAY_MS = 86_400_000;

/** True if the interval covers any part of a Saturday (UTC), i.e. the FX weekend close. */
function spansSaturday(from: number, to: number): boolean {
  for (let day = Math.floor(from / DAY_MS); day * DAY_MS < to; day++) {
    if (new Date(day * DAY_MS).getUTCDay() === 6) return true;
  }
  return false;
}

/** Single-pass statistics over a tick file, for data validation reports. */
export class TickStatsCollector {
  private readonly stats: TickStats = {
    rows: 0,
    parseErrors: { count: 0, examples: [] },
    symbols: {},
    timeSamples: [],
    timeFormats: {},
    firstTime: null,
    lastTime: null,
    outOfOrder: 0,
    duplicateTimestamps: 0,
    bidDecimals: {},
    askDecimals: {},
    floatNoise: { count: 0, example: null },
    precisionLoss: { count: 0, example: null },
    crossed: { count: 0, examples: [] },
    zeroSpread: 0,
    nonPositive: 0,
    spread: null,
    spreadInWindow: null,
    ticksPerDay: {},
  };
  private readonly spreads = new Map<number, number>();
  private readonly spreadsInWindow = new Map<number, number>();
  private previous: Tick | null = null;
  private readonly maxExamples: number;

  constructor(private readonly options: TickStatsOptions) {
    this.maxExamples = options.maxExamples ?? 10;
  }

  recordParseError(message: string): void {
    this.stats.parseErrors.count += 1;
    if (this.stats.parseErrors.examples.length < this.maxExamples) this.stats.parseErrors.examples.push(message);
  }

  /** Returns false when the tick is out of order (it is counted, and should not be aggregated). */
  push(row: ExnessTickRow): boolean {
    const s = this.stats;
    const { tick } = row;
    s.rows += 1;
    const symbol = row.symbol ?? '(no symbol column)';
    s.symbols[symbol] = (s.symbols[symbol] ?? 0) + 1;
    if (s.timeSamples.length < 3) s.timeSamples.push(row.rawTime);
    const shape = timestampShape(row.rawTime);
    s.timeFormats[shape] = (s.timeFormats[shape] ?? 0) + 1;
    const bd = decimals(row.rawBid);
    const ad = decimals(row.rawAsk);
    s.bidDecimals[bd] = (s.bidDecimals[bd] ?? 0) + 1;
    s.askDecimals[ad] = (s.askDecimals[ad] ?? 0) + 1;
    for (const [raw, dec] of [[row.rawBid, bd], [row.rawAsk, ad]] as const) {
      if (dec <= this.options.digits) continue;
      const scaled = Number(raw) * 10 ** this.options.digits;
      const bucket = Math.abs(scaled - Math.round(scaled)) < 1e-6 ? s.floatNoise : s.precisionLoss;
      bucket.count += 1;
      bucket.example ??= raw;
    }
    if (tick.bid <= 0 || tick.ask <= 0) s.nonPositive += 1;

    const spread = tick.ask - tick.bid;
    if (spread < 0) {
      s.crossed.count += 1;
      if (s.crossed.examples.length < this.maxExamples) {
        s.crossed.examples.push(`${row.rawTime} bid ${row.rawBid} ask ${row.rawAsk}`);
      }
    } else {
      if (spread === 0) s.zeroSpread += 1;
      this.spreads.set(spread, (this.spreads.get(spread) ?? 0) + 1);
      if (this.options.inWindow(tick.time)) {
        this.spreadsInWindow.set(spread, (this.spreadsInWindow.get(spread) ?? 0) + 1);
      }
    }

    const day = new Date(Math.floor(tick.time / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
    s.ticksPerDay[day] = (s.ticksPerDay[day] ?? 0) + 1;

    const prev = this.previous;
    if (prev) {
      if (tick.time < prev.time) {
        s.outOfOrder += 1;
        return false;
      }
      if (tick.time === prev.time) s.duplicateTimestamps += 1;
    }
    if (s.firstTime === null) s.firstTime = tick.time;
    s.lastTime = tick.time;
    this.previous = tick;
    return true;
  }

  result(): TickStats {
    return {
      ...this.stats,
      spread: summarise(this.spreads, this.options.pointsPerPip),
      spreadInWindow: summarise(this.spreadsInWindow, this.options.pointsPerPip),
    };
  }
}

export interface ContinuityOptions {
  pointsPerPip: number;
  gapThresholdMs: number;
  jumpThresholdPips: number;
  inWindow: (utcMs: number) => boolean;
  maxExamples?: number;
}

export interface Continuity {
  weekendGaps: number;
  weekdayGaps: Gap[];
  jumps: Jump[];
  jumpCount: number;
  /** Mon–Fri UTC dates between the first and last tick with no ticks at all. */
  missingWeekdays: string[];
}

/** Gaps, jumps and missing weekdays, computed on chronologically ordered ticks (after order repair). */
export function scanContinuity(
  length: number,
  timeAt: (k: number) => number,
  bidAt: (k: number) => number,
  options: ContinuityOptions,
): Continuity {
  const result: Continuity = { weekendGaps: 0, weekdayGaps: [], jumps: [], jumpCount: 0, missingWeekdays: [] };
  const maxExamples = options.maxExamples ?? 50;
  const days = new Set<number>();
  for (let k = 0; k < length; k++) {
    const t = timeAt(k);
    days.add(Math.floor(t / DAY_MS));
    if (k === 0) continue;
    const prev = timeAt(k - 1);
    if (t - prev > options.gapThresholdMs) {
      if (spansSaturday(prev, t)) result.weekendGaps += 1;
      else {
        let inWindow = false;
        for (let m = prev; m < t && !inWindow; m += 60_000) inWindow = options.inWindow(m);
        result.weekdayGaps.push({ from: prev, to: t, weekend: false, inWindow });
      }
    }
    const pips = Math.abs(bidAt(k) - bidAt(k - 1)) / options.pointsPerPip;
    if (pips > options.jumpThresholdPips) {
      result.jumpCount += 1;
      if (result.jumps.length < maxExamples) result.jumps.push({ time: t, fromBid: bidAt(k - 1), toBid: bidAt(k), pips });
    }
  }
  if (length > 0) {
    const first = Math.floor(timeAt(0) / DAY_MS);
    const last = Math.floor(timeAt(length - 1) / DAY_MS);
    for (let d = first; d <= last; d++) {
      const weekday = new Date(d * DAY_MS).getUTCDay();
      if (weekday >= 1 && weekday <= 5 && !days.has(d)) result.missingWeekdays.push(new Date(d * DAY_MS).toISOString().slice(0, 10));
    }
  }
  return result;
}
