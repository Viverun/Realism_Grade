import type { Points } from './price.js';
import type { Timeframe } from './timeframe.js';

export interface Ohlc {
  open: Points;
  high: Points;
  low: Points;
  close: Points;
}

/**
 * A closed candle. Strategy prices (open/high/low/close) are Bid; `ask` is carried
 * only for execution validation. `openTime` is epoch ms UTC; close = open + timeframe.
 */
export interface Candle extends Ohlc {
  timeframe: Timeframe;
  openTime: number;
  ask?: Ohlc;
  tickCount?: number;
}

export interface Tick {
  time: number;
  bid: Points;
  ask: Points;
}

export interface Quote {
  time: number;
  bid: Points;
  ask: Points;
}
