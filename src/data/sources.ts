import type { Timeframe } from '../core/timeframe.js';
import type { Candle, Quote } from '../core/types.js';

export interface CandleRequest {
  timeframe: Timeframe;
  /** Only candles with closeTime <= asOfMs are returned (no forming candles). */
  asOfMs: number;
  /** Optional lower bound on openTime (inclusive). */
  fromMs?: number;
}

/**
 * Provider-agnostic candle access. Contract: closed candles only, strictly
 * ascending by openTime, Bid OHLC in integer points.
 */
export interface CandleSource {
  getClosedCandles(request: CandleRequest): Promise<Candle[]>;
}

/** Live Bid/Ask quote for pre-send Buy Limit validation (spec §8). */
export interface QuoteSource {
  getQuote(): Promise<Quote | null>;
}
