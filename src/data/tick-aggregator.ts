import { bucketStart, candleCloseTime, type Timeframe } from '../core/timeframe.js';
import type { Candle, Ohlc, Tick } from '../core/types.js';

function startOhlc(price: number): Ohlc {
  return { open: price, high: price, low: price, close: price };
}

function extendOhlc(ohlc: Ohlc, price: number): void {
  if (price > ohlc.high) ohlc.high = price;
  if (price < ohlc.low) ohlc.low = price;
  ohlc.close = price;
}

/**
 * Streams time-ordered Bid/Ask ticks into UTC-aligned candles (Bid OHLC plus Ask OHLC).
 * A candle is emitted only once it is provably closed: a tick from a later bucket
 * arrived, or `flush(asOfMs)` is called with asOfMs >= its close time.
 * Buckets with no ticks produce no candle.
 */
export class TickAggregator {
  private current: Candle | null = null;
  private lastTickTime = -Infinity;

  constructor(private readonly timeframe: Timeframe) {}

  /** Returns the previous candle if this tick closed it, otherwise null. */
  push(tick: Tick): Candle | null {
    if (tick.time < this.lastTickTime) {
      throw new Error(
        `Ticks out of order: ${new Date(tick.time).toISOString()} after ${new Date(this.lastTickTime).toISOString()}`,
      );
    }
    this.lastTickTime = tick.time;
    const openTime = bucketStart(tick.time, this.timeframe);

    if (this.current && this.current.openTime === openTime) {
      extendOhlc(this.current, tick.bid);
      if (this.current.ask) extendOhlc(this.current.ask, tick.ask);
      this.current.tickCount = (this.current.tickCount ?? 0) + 1;
      return null;
    }

    const closed = this.current;
    this.current = {
      timeframe: this.timeframe,
      openTime,
      ...startOhlc(tick.bid),
      ask: startOhlc(tick.ask),
      tickCount: 1,
    };
    return closed;
  }

  /** Emits the in-progress candle only if it has closed by `asOfMs`. */
  flush(asOfMs: number): Candle | null {
    if (this.current && candleCloseTime(this.current.openTime, this.timeframe) <= asOfMs) {
      const closed = this.current;
      this.current = null;
      return closed;
    }
    return null;
  }
}

/**
 * Builds the closed candles known at `asOfMs`. Ticks at or after `asOfMs` are ignored,
 * so later data can never alter the result (spec §12 NL2).
 */
export function aggregateTicks(ticks: Iterable<Tick>, timeframe: Timeframe, asOfMs: number): Candle[] {
  const aggregator = new TickAggregator(timeframe);
  const candles: Candle[] = [];
  for (const tick of ticks) {
    if (tick.time >= asOfMs) break;
    const closed = aggregator.push(tick);
    if (closed) candles.push(closed);
  }
  const last = aggregator.flush(asOfMs);
  if (last) candles.push(last);
  return candles;
}
