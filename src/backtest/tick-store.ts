import { TIMEFRAMES, type Timeframe } from '../core/timeframe.js';
import type { Candle, Tick } from '../core/types.js';
import { readExnessTickFile } from '../data/exness-ticks.js';
import { resampleCandles } from '../data/resample.js';
import { TickAggregator } from '../data/tick-aggregator.js';
import { assertValidCandles } from '../data/validate.js';

const DAY_MS = 86_400_000;

export class DataOrderError extends Error {}

export interface FileOrderReport {
  file: string;
  ticks: number;
  /** Maximal chronological runs in the file as written (1 = already in order). */
  runs: number;
  reordered: boolean;
}

export interface TickLoadSummary {
  files: string[];
  /** Files whose whole-UTC-day blocks were written out of order and were reordered. */
  reordered: FileOrderReport[];
  ticks: number;
  firstTime: number | null;
  lastTime: number | null;
  /** Ticks dropped because they were before startMs, at/after endMs, or overlapped earlier data. */
  dropped: { beforeStart: number; atOrAfterEnd: number; outOfOrder: number };
}

/**
 * Columnar, append-only tick storage (time, bid, ask) for backtests: ~16 bytes per tick.
 * Stored in fixed-size chunks, so memory grows in small steps with no large reallocation
 * copies; a decade of EUR/USD ticks fits in a few GB. Times are ascending.
 */
export class TickStore {
  private readonly chunkBits: number;
  private readonly chunkMask: number;
  private times: Float64Array[] = [];
  private bids: Int32Array[] = [];
  private asks: Int32Array[] = [];
  length = 0;

  /** `chunkBits` = log2 of ticks per chunk (default 2^22 ≈ 4.2M ticks ≈ 67 MB). */
  constructor(chunkBits = 22) {
    this.chunkBits = chunkBits;
    this.chunkMask = (1 << chunkBits) - 1;
  }

  push(tick: Tick): void {
    const c = this.length >>> this.chunkBits;
    if (c === this.times.length) {
      const size = 1 << this.chunkBits;
      this.times.push(new Float64Array(size));
      this.bids.push(new Int32Array(size));
      this.asks.push(new Int32Array(size));
    }
    const o = this.length & this.chunkMask;
    this.times[c]![o] = tick.time;
    this.bids[c]![o] = tick.bid;
    this.asks[c]![o] = tick.ask;
    this.length += 1;
  }

  timeAt(k: number): number {
    return this.times[k >>> this.chunkBits]![k & this.chunkMask]!;
  }
  bid(k: number): number {
    return this.bids[k >>> this.chunkBits]![k & this.chunkMask]!;
  }
  ask(k: number): number {
    return this.asks[k >>> this.chunkBits]![k & this.chunkMask]!;
  }

  /** Index of the first tick with time >= t, or `length` if none. */
  firstAtOrAfter(t: number): number {
    let lo = 0;
    let hi = this.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.timeAt(mid) < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Rewrites the store in the order given by `permutation` (indices into the current contents). */
  private permute(permutation: Uint32Array): void {
    const next = new TickStore(this.chunkBits);
    for (let k = 0; k < this.length; k++) {
      const j = permutation[k]!;
      next.push({ time: this.timeAt(j), bid: this.bid(j), ask: this.ask(j) });
    }
    this.times = next.times;
    this.bids = next.bids;
    this.asks = next.asks;
  }

  /**
   * Restores chronological order for a file made of whole-UTC-day blocks written out of
   * order (seen in some Exness exports). Safe only if every UTC day lies in exactly one
   * chronological run; otherwise the data is ambiguous and a DataOrderError is thrown.
   * The sort is stable, so ticks sharing a timestamp keep their original order.
   */
  normaliseOrder(file: string): FileOrderReport {
    const n = this.length;
    let runs = n > 0 ? 1 : 0;
    const dayRun = new Map<number, number>();
    for (let k = 0; k < n; k++) {
      if (k > 0 && this.timeAt(k) < this.timeAt(k - 1)) runs += 1;
      const day = Math.floor(this.timeAt(k) / DAY_MS);
      const seen = dayRun.get(day);
      if (seen === undefined) dayRun.set(day, runs);
      else if (seen !== runs) {
        throw new DataOrderError(
          `${file}: UTC day ${new Date(day * DAY_MS).toISOString().slice(0, 10)} is split across out-of-order blocks; refusing to reorder`,
        );
      }
    }
    if (runs <= 1) return { file, ticks: n, runs, reordered: false };
    const index = new Uint32Array(n);
    for (let k = 0; k < n; k++) index[k] = k;
    const time = new Float64Array(n);
    for (let k = 0; k < n; k++) time[k] = this.timeAt(k);
    index.sort((a, b) => time[a]! - time[b]! || a - b);
    this.permute(index);
    return { file, ticks: n, runs, reordered: true };
  }

  /** Appends ticks from another store, keeping [startMs, endMs) and dropping anything older than the last kept tick. */
  appendFrom(
    other: TickStore,
    range: { startMs?: number; endMs: number },
    dropped: { beforeStart: number; atOrAfterEnd: number; outOfOrder: number },
  ): void {
    let last = this.length ? this.timeAt(this.length - 1) : -Infinity;
    for (let k = 0; k < other.length; k++) {
      const t = other.timeAt(k);
      if (range.startMs !== undefined && t < range.startMs) dropped.beforeStart += 1;
      else if (t >= range.endMs) dropped.atOrAfterEnd += 1;
      else if (t < last) dropped.outOfOrder += 1;
      else {
        this.push({ time: t, bid: other.bid(k), ask: other.ask(k) });
        last = t;
      }
    }
  }

  *ticks(): Generator<Tick> {
    for (let k = 0; k < this.length; k++) yield { time: this.timeAt(k), bid: this.bid(k), ask: this.ask(k) };
  }

  /**
   * Loads files in the given order. Each file is first put in chronological order
   * (normaliseOrder); ticks outside [startMs, endMs) and ticks overlapping an earlier file are dropped.
   */
  static async load(
    files: readonly string[],
    digits: number,
    range: { startMs?: number; endMs: number },
  ): Promise<{ store: TickStore; summary: TickLoadSummary }> {
    const store = new TickStore();
    const dropped = { beforeStart: 0, atOrAfterEnd: 0, outOfOrder: 0 };
    const reordered: FileOrderReport[] = [];
    for (const file of files) {
      const buffer = new TickStore();
      for await (const tick of readExnessTickFile(file, digits)) buffer.push(tick);
      const order = buffer.normaliseOrder(file);
      if (order.reordered) reordered.push(order);
      store.appendFrom(buffer, range, dropped);
    }
    const summary: TickLoadSummary = {
      files: [...files],
      reordered,
      ticks: store.length,
      firstTime: store.length ? store.timeAt(0) : null,
      lastTime: store.length ? store.timeAt(store.length - 1) : null,
      dropped,
    };
    return { store, summary };
  }

  /** Closed M5/M15/M30/H1 candles as of `asOfMs` (normally the dataset's exclusive end). M5 is the base. */
  buildCandles(asOfMs: number): Record<Timeframe, Candle[]> {
    const aggregator = new TickAggregator('M5');
    const m5: Candle[] = [];
    for (const tick of this.ticks()) {
      if (tick.time >= asOfMs) break;
      const closed = aggregator.push(tick);
      if (closed) m5.push(closed);
    }
    const tail = aggregator.flush(asOfMs);
    if (tail) m5.push(tail);
    const result: Record<Timeframe, Candle[]> = {
      M5: m5,
      M15: resampleCandles(m5, 'M15', asOfMs),
      M30: resampleCandles(m5, 'M30', asOfMs),
      H1: resampleCandles(m5, 'H1', asOfMs),
    };
    for (const tf of TIMEFRAMES) assertValidCandles(result[tf], tf);
    return result;
  }
}
