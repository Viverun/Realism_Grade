import type { Timeframe } from '../core/timeframe.js';
import type { Candle } from '../core/types.js';
import { readExnessTickFile } from './exness-ticks.js';
import { filterClosed } from './ohlc-csv.js';
import { resampleCandles } from './resample.js';
import type { CandleRequest, CandleSource } from './sources.js';
import { TickAggregator } from './tick-aggregator.js';
import { assertValidCandles } from './validate.js';

/**
 * Backtest CandleSource built from Exness tick files. Ticks are aggregated to M15
 * (Bid + Ask OHLC); M30/H1 are resampled from M15, which is exact for OHLC.
 * `dataEndMs` is the time up to which the files are complete (e.g. month end):
 * no candle closing after it is ever produced.
 */
export class ExnessTickCandleSource implements CandleSource {
  private base: Candle[] | null = null;
  private readonly derived = new Map<Timeframe, Candle[]>();

  constructor(
    private readonly files: readonly string[],
    private readonly dataEndMs: number,
    private readonly digits: number,
  ) {}

  private async loadBase(): Promise<Candle[]> {
    if (this.base) return this.base;
    const aggregator = new TickAggregator('M15');
    const candles: Candle[] = [];
    for (const file of this.files) {
      for await (const tick of readExnessTickFile(file, this.digits)) {
        if (tick.time >= this.dataEndMs) break;
        const closed = aggregator.push(tick);
        if (closed) candles.push(closed);
      }
    }
    const last = aggregator.flush(this.dataEndMs);
    if (last) candles.push(last);
    assertValidCandles(candles, 'M15');
    this.base = candles;
    return candles;
  }

  async getClosedCandles(request: CandleRequest): Promise<Candle[]> {
    const base = await this.loadBase();
    let candles = request.timeframe === 'M15' ? base : this.derived.get(request.timeframe);
    if (!candles) {
      candles = resampleCandles(base, request.timeframe, this.dataEndMs);
      this.derived.set(request.timeframe, candles);
    }
    return filterClosed(candles, { ...request, asOfMs: Math.min(request.asOfMs, this.dataEndMs) });
  }
}
