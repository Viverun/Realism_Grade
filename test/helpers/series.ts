import type { Timeframe } from '../../src/core/timeframe.js';
import type { Candle } from '../../src/core/types.js';
import { candle } from './fixtures.js';
import { seededRandom } from './random.js';

/** Deterministic trending random walk with pullbacks, in integer points. */
export function trendingCandles(length: number, seed: number, tf: Timeframe = 'M15', drift = 4): Candle[] {
  const random = seededRandom(seed);
  const out: Candle[] = [];
  let price = 110_000;
  for (let i = 0; i < length; i++) {
    const open = price;
    const phase = Math.sin(i / 9); // alternating pushes and pullbacks
    const close = Math.round(open + drift + phase * 25 + (random() - 0.5) * 60);
    const high = Math.max(open, close) + Math.round(random() * 30);
    const low = Math.min(open, close) - Math.round(random() * (random() < 0.2 ? 90 : 30));
    out.push(candle(i, open, high, low, close, tf));
    price = close;
  }
  return out;
}
