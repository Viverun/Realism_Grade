import type { Timeframe } from '../core/timeframe.js';
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
 * Columnar, append-only tick storage (time, bid, ask) for backtests: ~16 bytes per tick,
 * so a year of EUR/USD ticks fits comfortably in memory. Times are ascending.
 */
export class TickStore {
  private time = new Float64Array(1 << 20);
  private bidArr = new Int32Array(1 << 20);
  private askArr = new Int32Array(1 << 20);
  length = 0;

  push(tick: Tick): void {
    if (this.length === this.time.length) {
      const grow = <T extends Float64Array | Int32Array>(a: T, make: (n: number) => T): T => {
        const next = make(a.length * 2);
        next.set(a);
        return next;
      };
      this.time = grow(this.time, (n) => new Float64Array(n));
      this.bidArr = grow(this.bidArr, (n) => new Int32Array(n));
      this.askArr = grow(this.askArr, (n) => new Int32Array(n));
    }
    this.time[this.length] = tick.time;
    this.bidArr[this.length] = tick.bid;
    this.askArr[this.length] = tick.ask;
    this.length += 1;
  }

  timeAt(k: number): number {
    return this.time[k]!;
  }
  bid(k: number): number {
    return this.bidArr[k]!;
  }
  ask(k: number): number {
    return this.askArr[k]!;
  }

  /** Index of the first tick with time >= t, or `length` if none. */
  firstAtOrAfter(t: number): number {
    let lo = 0;
    let hi = this.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.time[mid]! < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Rewrites the store in the order given by `permutation` (indices into the current arrays). */
  private permute(permutation: Uint32Array): void {
    const n = this.length;
    const time = new Float64Array(Math.max(n, 1));
    const bid = new Int32Array(Math.max(n, 1));
    const ask = new Int32Array(Math.max(n, 1));
    for (let k = 0; k < n; k++) {
      const j = permutation[k]!;
      time[k] = this.time[j]!;
      bid[k] = this.bidArr[j]!;
      ask[k] = this.askArr[j]!;
    }
    this.time = time;
    this.bidArr = bid;
    this.askArr = ask;
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
      if (k > 0 && this.time[k]! < this.time[k - 1]!) runs += 1;
      const day = Math.floor(this.time[k]! / DAY_MS);
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
    const time = this.time;
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
    let last = this.length ? this.time[this.length - 1]! : -Infinity;
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
    for (let k = 0; k < this.length; k++) yield { time: this.time[k]!, bid: this.bidArr[k]!, ask: this.askArr[k]! };
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

  /** Closed M15/M30/H1 candles as of `asOfMs` (normally the dataset's exclusive end). */
  buildCandles(asOfMs: number): Record<Timeframe, Candle[]> {
    const aggregator = new TickAggregator('M15');
    const m15: Candle[] = [];
    for (const tick of this.ticks()) {
      if (tick.time >= asOfMs) break;
      const closed = aggregator.push(tick);
      if (closed) m15.push(closed);
    }
    const tail = aggregator.flush(asOfMs);
    if (tail) m15.push(tail);
    const result = { M15: m15, M30: resampleCandles(m15, 'M30', asOfMs), H1: resampleCandles(m15, 'H1', asOfMs) };
    for (const tf of ['M15', 'M30', 'H1'] as const) assertValidCandles(result[tf], tf);
    return result;
  }
}
