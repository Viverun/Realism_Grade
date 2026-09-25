/**
 * Post-fill outcome metrics (spec §11 step 5). Uses only ticks after the fill; a long is
 * valued and exited at the Bid. Research metrics, not a win rate.
 */
import type { TickStore } from './tick-store.js';

export interface HorizonOutcome {
  horizonCandles: number;
  /** Bid at the horizon minus fill, pips (null if data ended first). */
  returnPips: number | null;
  mfePips: number;
  maePips: number;
}

export interface Outcome {
  horizons: HorizonOutcome[];
  /** +2R target (Bid >= fill + 2R) vs the reference stop (Bid <= refSl), whichever first. */
  twoR: 'target' | 'stop' | 'open';
  /** For 'stop': realized loss in R using the Bid of the first tick at/below the stop. */
  realizedR: number | null;
  /** For 'stop': refSl − exit Bid in pips (> 0 means the stop slipped). */
  stopSlippagePips: number | null;
  exitTime: number | null;
  /**
   * Trade result in R for expectancy: +2 at the target, realizedR at the stop, and for
   * 'open' the mark-to-market (last Bid − fill)/R at the longest horizon (null if the data ended first).
   */
  rMultiple: number | null;
}

export function measureOutcome(
  store: TickStore,
  fill: { index: number; price: number },
  refSl: number,
  horizonsMs: { candles: number; ms: number }[],
  pointsPerPip: number,
): Outcome {
  const fillTime = store.timeAt(fill.index);
  const riskPoints = fill.price - refSl;
  const target = fill.price + 2 * riskPoints;
  const maxMs = Math.max(...horizonsMs.map((h) => h.ms));
  const sorted = [...horizonsMs].sort((a, b) => a.ms - b.ms);
  const horizons: HorizonOutcome[] = [];
  let hi = -Infinity;
  let lo = Infinity;
  let h = 0;
  let twoR: Outcome['twoR'] = riskPoints > 0 ? 'open' : 'stop';
  let realizedR: number | null = null;
  let stopSlippagePips: number | null = null;
  let exitTime: number | null = null;
  const pips = (points: number): number => points / pointsPerPip;

  let k = fill.index;
  for (; k < store.length && store.timeAt(k) <= fillTime + maxMs; k++) {
    const t = store.timeAt(k);
    while (h < sorted.length && t > fillTime + sorted[h]!.ms) {
      const prevBid = store.bid(Math.max(fill.index, k - 1));
      horizons.push({ horizonCandles: sorted[h]!.candles, returnPips: pips(prevBid - fill.price), mfePips: pips(hi - fill.price), maePips: pips(fill.price - lo) });
      h += 1;
    }
    const bid = store.bid(k);
    if (bid > hi) hi = bid;
    if (bid < lo) lo = bid;
    if (twoR === 'open' && riskPoints > 0) {
      if (bid <= refSl) {
        twoR = 'stop';
        realizedR = (bid - fill.price) / riskPoints;
        stopSlippagePips = pips(refSl - bid);
        exitTime = t;
      } else if (bid >= target) {
        twoR = 'target';
        exitTime = t;
      }
    }
  }
  const dataEnded = k >= store.length;
  const lastBidInWindow = store.bid(Math.max(fill.index, k - 1));
  while (h < sorted.length) {
    const lastBid = store.bid(Math.max(fill.index, k - 1));
    horizons.push({
      horizonCandles: sorted[h]!.candles,
      returnPips: dataEnded ? null : pips(lastBid - fill.price),
      mfePips: pips(hi - fill.price),
      maePips: pips(fill.price - lo),
    });
    h += 1;
  }
  let rMultiple: number | null = null;
  if (riskPoints > 0) {
    if (twoR === 'target') rMultiple = 2;
    else if (twoR === 'stop') rMultiple = realizedR;
    else if (!dataEnded) rMultiple = (lastBidInWindow - fill.price) / riskPoints;
  }
  return { horizons, twoR, realizedR, stopSlippagePips, exitTime, rMultiple };
}
