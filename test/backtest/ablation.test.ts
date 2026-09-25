import { describe, expect, it } from 'vitest';
import { cellStats, raceToExit, type AblationSample, type TradeResult } from '../../src/backtest/ablation.js';
import { measureOutcome } from '../../src/backtest/outcomes.js';
import { TickStore } from '../../src/backtest/tick-store.js';
import { seededRandom } from '../../src/core/random.js';

describe('raceToExit', () => {
  it('matches measureOutcome on twoR and rMultiple (random paths)', () => {
    const random = seededRandom(9);
    for (let run = 0; run < 200; run++) {
      const st = new TickStore();
      let bid = 110_000;
      for (let k = 0; k < 400; k++) {
        bid += Math.round((random() - 0.5) * 12);
        st.push({ time: 1_000_000 + k * 1000, bid, ask: bid + 6 });
      }
      const fill = 110_000;
      const refSl = fill - 20 - Math.floor(random() * 40);
      const horizonMs = (50 + Math.floor(random() * 400)) * 1000;
      const ref = measureOutcome(st, { index: 0, price: fill }, refSl, [{ candles: 1, ms: horizonMs }], 10);
      const fast = raceToExit(st, 0, fill, refSl, horizonMs);
      expect(fast.twoR).toBe(ref.twoR);
      if (ref.rMultiple === null) expect(fast.r).toBeNull();
      else expect(fast.r).toBeCloseTo(ref.rMultiple, 12);
      expect(fast.maeR).toBeGreaterThanOrEqual(fast.twoR === 'stop' ? 1 : -Infinity);
    }
  });
});

describe('cellStats', () => {
  const t = (r: number, twoR: TradeResult['twoR']): TradeResult => ({ status: 'filled', twoR, r, mfeR: 1, maeR: 0.5 });
  const sample = (day: number, limit: TradeResult): AblationSample => ({ closeTime: day * 86_400_000, limit, market: limit }) as AblationSample;

  it('computes mean, median, share and a day-clustered interval', () => {
    const set = [sample(1, t(2, 'target')), sample(1, t(-1, 'stop')), sample(2, t(-1, 'stop')), sample(3, t(2, 'target')), sample(4, { status: 'expired', twoR: null, r: null, mfeR: null, maeR: null })];
    const c = cellStats(set, (s) => s.limit);
    expect(c.candles).toBe(5);
    expect(c.filled).toBe(4);
    expect(c.fillRate).toBeCloseTo(0.8);
    expect(c.meanR).toBeCloseTo(0.5);
    expect(c.medianR).toBeCloseTo(0.5);
    expect(c.targetShare).toBeCloseTo(0.5);
    expect(c.low!).toBeLessThan(0.5);
    expect(c.high!).toBeGreaterThan(0.5);
  });
});
