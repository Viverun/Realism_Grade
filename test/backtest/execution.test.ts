import { describe, expect, it } from 'vitest';
import { sendTimeCheck, simulateExecution } from '../../src/backtest/execution.js';
import { measureOutcome } from '../../src/backtest/outcomes.js';
import { TickStore } from '../../src/backtest/tick-store.js';

const T0 = Date.parse('2026-09-21T10:00:00Z'); // signal candle close
const s = (sec: number): number => T0 + sec * 1000;

function store(ticks: [number, number, number][]): TickStore {
  const st = new TickStore();
  for (const [sec, bid, ask] of ticks) st.push({ time: s(sec), bid, ask });
  return st;
}

const H1 = 3_600_000;
const opts = (entry: number) => ({ closeTime: T0, expiryTime: T0 + H1, placementDelayMs: 60_000, entry, minDistancePoints: 0 });

describe('execution model (spec §11)', () => {
  it('send-time check uses the first tick at/after the close', () => {
    const st = store([[-5, 113_690, 113_698], [1, 113_700, 113_708]]);
    expect(sendTimeCheck(st, T0, 113_690, 0)).toEqual({ ok: true });
    expect(sendTimeCheck(st, T0, 113_708, 0)).toEqual({ ok: false, status: 'entry_not_below_market' });
    expect(sendTimeCheck(st, T0, 113_700, 5)).toEqual({ ok: true }); // 113_700 <= 113_708 − 5
    expect(sendTimeCheck(st, T0 + H1, 113_690, 0)).toEqual({ ok: false, status: 'no_data' });
  });

  it('NL11: the signal candle\'s own prices never fill the order; only later ticks can', () => {
    // A tick BEFORE the close has ask below entry (inside the signal candle): must be ignored.
    const st = store([[-30, 113_600, 113_608], [1, 113_700, 113_708], [70, 113_700, 113_706], [1800, 113_720, 113_728]]);
    const e = simulateExecution(st, 'buy_limit', opts(113_690));
    expect(e.status).toBe('expired');
  });

  it('fills a Buy Limit at the entry on the first tick in (P, E] with ask <= entry', () => {
    const st = store([[1, 113_700, 113_708], [60, 113_700, 113_708], [120, 113_690, 113_697], [300, 113_680, 113_688], [4000, 113_500, 113_508]]);
    const e = simulateExecution(st, 'buy_limit', opts(113_690));
    expect(e).toMatchObject({ status: 'filled', fillPrice: 113_690, fillTime: s(300), placementAsk: 113_708 });
  });

  it('does not fill after the expiry (next candle close)', () => {
    const st = store([[60, 113_700, 113_708], [3601, 113_600, 113_608]]);
    expect(simulateExecution(st, 'buy_limit', opts(113_690)).status).toBe('expired');
  });

  it('invalid at placement when the ask is already at/below the entry at P', () => {
    const st = store([[1, 113_700, 113_708], [61, 113_680, 113_688]]);
    expect(simulateExecution(st, 'buy_limit', opts(113_690)).status).toBe('invalid_at_placement');
  });

  it('PDF market baseline fills at the ASK of the first tick at/after P (P4)', () => {
    const st = store([[1, 113_700, 113_708], [61, 113_702, 113_711]]);
    expect(simulateExecution(st, 'pdf_market', opts(0))).toMatchObject({ status: 'filled', fillPrice: 113_711, fillTime: s(61) });
  });
});

describe('outcomes (spec §11 step 5)', () => {
  const horizons = [{ candles: 1, ms: H1 }, { candles: 2, ms: 2 * H1 }];

  it('+2R reached first; horizons read the last Bid at or before each horizon', () => {
    // fill 113_690, stop 113_590 (R = 100 pts), target 113_890
    const st = store([[0, 113_685, 113_690], [600, 113_650, 113_658], [3000, 113_800, 113_808], [5000, 113_895, 113_903], [8000, 113_700, 113_708]]);
    const o = measureOutcome(st, { index: 0, price: 113_690 }, 113_590, horizons, 10);
    expect(o.twoR).toBe('target');
    expect(o.realizedR).toBeNull();
    expect(o.horizons[0]).toMatchObject({ horizonCandles: 1, returnPips: 11, mfePips: 11, maePips: 4 });
    expect(o.horizons[1]).toMatchObject({ horizonCandles: 2, returnPips: 20.5, mfePips: 20.5 });
  });

  it('measures stop slippage through a gap (realized loss worse than −1R)', () => {
    const st = store([[0, 113_685, 113_690], [600, 113_620, 113_628], [700, 113_560, 113_568]]);
    const o = measureOutcome(st, { index: 0, price: 113_690 }, 113_590, horizons, 10);
    expect(o.twoR).toBe('stop');
    expect(o.realizedR).toBeCloseTo(-1.3, 10); // exit Bid 113_560 vs planned stop 113_590
    expect(o.stopSlippagePips).toBe(3);
    expect(o.exitTime).toBe(s(700));
  });

  it('stays open when neither level is reached; incomplete horizons have null return', () => {
    const st = store([[0, 113_685, 113_690], [600, 113_700, 113_708]]);
    const o = measureOutcome(st, { index: 0, price: 113_690 }, 113_590, horizons, 10);
    expect(o.twoR).toBe('open');
    expect(o.horizons.map((h) => h.returnPips)).toEqual([null, null]);
  });
});
