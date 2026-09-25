import type { Tick } from '../core/types.js';
import type { ExnessTickRow } from './exness-ticks.js';

export interface TickStatsOptions {
  pointsPerPip: number;
  /** Local-time classifier for the trading window (spreads are also reported inside it). */
  inWindow: (utcMs: number) => boolean;
  /** Gaps between consecutive ticks longer than this are reported. */
  gapThresholdMs: number;
  /** Bid moves between consecutive ticks larger than this (in pips) are reported. */
  jumpThresholdPips: number;
  maxExamples?: number;
}

export interface Gap {
  from: number;
  to: number;
  weekend: boolean;
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
  crossed: { count: number; examples: string[] };
  zeroSpread: number;
  nonPositive: number;
  spread: SpreadSummary | null;
  spreadInWindow: SpreadSummary | null;
  gaps: { weekend: number; intraweek: number; intraweekExamples: Gap[] };
  jumps: { count: number; examples: Jump[] };
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
    crossed: { count: 0, examples: [] },
    zeroSpread: 0,
    nonPositive: 0,
    spread: null,
    spreadInWindow: null,
    gaps: { weekend: 0, intraweek: 0, intraweekExamples: [] },
    jumps: { count: 0, examples: [] },
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
      const gap = tick.time - prev.time;
      if (gap > this.options.gapThresholdMs) {
        const weekend = spansSaturday(prev.time, tick.time);
        if (weekend) s.gaps.weekend += 1;
        else {
          s.gaps.intraweek += 1;
          if (s.gaps.intraweekExamples.length < this.maxExamples) {
            s.gaps.intraweekExamples.push({ from: prev.time, to: tick.time, weekend });
          }
        }
      }
      const movePips = Math.abs(tick.bid - prev.bid) / this.options.pointsPerPip;
      if (movePips > this.options.jumpThresholdPips) {
        s.jumps.count += 1;
        if (s.jumps.examples.length < this.maxExamples) {
          s.jumps.examples.push({ time: tick.time, fromBid: prev.bid, toBid: tick.bid, pips: movePips });
        }
      }
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
