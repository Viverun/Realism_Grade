import type { Timeframe } from '../core/timeframe.js';
import type { Candle, Tick } from '../core/types.js';
import { readExnessTickFile } from '../data/exness-ticks.js';
import { resampleCandles } from '../data/resample.js';
import { TickAggregator } from '../data/tick-aggregator.js';
import { assertValidCandles } from '../data/validate.js';

export interface TickLoadSummary {
  files: string[];
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

  *ticks(): Generator<Tick> {
    for (let k = 0; k < this.length; k++) yield { time: this.time[k]!, bid: this.bidArr[k]!, ask: this.askArr[k]! };
  }

  /** Loads files in the given order, keeping ticks in [startMs, endMs) and dropping overlaps. */
  static async load(
    files: readonly string[],
    digits: number,
    range: { startMs?: number; endMs: number },
  ): Promise<{ store: TickStore; summary: TickLoadSummary }> {
    const store = new TickStore();
    const dropped = { beforeStart: 0, atOrAfterEnd: 0, outOfOrder: 0 };
    let last = -Infinity;
    for (const file of files) {
      for await (const tick of readExnessTickFile(file, digits)) {
        if (range.startMs !== undefined && tick.time < range.startMs) dropped.beforeStart += 1;
        else if (tick.time >= range.endMs) dropped.atOrAfterEnd += 1;
        else if (tick.time < last) dropped.outOfOrder += 1;
        else {
          store.push(tick);
          last = tick.time;
        }
      }
    }
    const summary: TickLoadSummary = {
      files: [...files],
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
