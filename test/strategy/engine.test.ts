import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configHash } from '../../src/config/load.js';
import { TIMEFRAME_MS } from '../../src/core/timeframe.js';
import { decideAll, decideAt, evaluateIndex, buildSeries, makeEngineContext } from '../../src/strategy/engine.js';
import { candle, smallConfig } from '../helpers/fixtures.js';
import { seededRandom } from '../helpers/random.js';
import { trendingCandles } from '../helpers/series.js';

const config = smallConfig();
const ctx = makeEngineContext(config, 'M15', configHash(config));
const candles = trendingCandles(420, 11);
const all = decideAll(candles, ctx);

describe('engine', () => {
  it('produces signals on the fixture (so the invariance tests are meaningful)', () => {
    const signals = all.filter((d) => d.status === 'signal');
    expect(signals.length).toBeGreaterThan(3);
    for (const d of signals) {
      expect(d.trend && d.pullback.ok && d.rsiCheck.ok && d.candle.ok && d.inWindow).toBe(true);
      expect(d.plan!.entry).toBe(d.ohlc[3] - 10); // M15 offset 1 pip
      expect(d.plan!.refSl).toBeLessThan(d.plan!.entry);
      expect(d.configHash).toBe(configHash(config));
    }
  });

  it('marks warm-up candles and evaluates everything after', () => {
    expect(all.slice(0, 10).every((d) => d.status === 'warmup')).toBe(true);
    expect(all.slice(10).some((d) => d.status === 'warmup')).toBe(false);
  });

  it('NL3: decideAt(candles[0..i]) equals the full-history decision at i, for every i', () => {
    for (let i = 0; i < candles.length; i++) {
      expect(decideAt(candles.slice(0, i + 1), ctx)).toEqual(all[i]);
    }
  });

  it('NL4: rewriting every candle after i leaves decisions up to i identical', () => {
    const random = seededRandom(99);
    for (const i of [60, 150, 300, 410]) {
      const perturbed = candles.map((c, k) => {
        if (k <= i) return c;
        const shift = Math.round((random() - 0.5) * 2000);
        return { ...c, open: c.open + shift, high: c.high + shift + 500, low: c.low + shift - 500, close: c.close - shift };
      });
      expect(decideAll(perturbed, ctx).slice(0, i + 1)).toEqual(all.slice(0, i + 1));
    }
  });

  it('T1: window uses the candle CLOSE time in Dubai; 08:00 and 23:00 inclusive', () => {
    // M15 candles; BASE_TIME is 04:00Z = 08:00 Dubai. Open 03:45Z closes 08:00 Dubai.
    const at = (isoOpen: string) => {
      const c = [{ ...candle(0, 1, 1, 1, 1, 'M15'), openTime: Date.parse(isoOpen) }];
      return evaluateIndex(buildSeries(c, ctx), 0, ctx);
    };
    expect(at('2026-09-21T03:45:00Z').inWindow).toBe(true); // closes 08:00
    expect(at('2026-09-21T03:30:00Z').inWindow).toBe(false); // closes 07:45
    expect(at('2026-09-21T18:45:00Z').inWindow).toBe(true); // closes 23:00
    expect(at('2026-09-21T19:00:00Z').inWindow).toBe(false); // closes 23:15
    expect(at('2026-09-21T18:45:00Z').closeLocal).toBe('2026-09-21 23:00');
  });

  it('flags outside-window setups separately from no_signal', () => {
    const statuses = new Set(all.map((d) => d.status));
    expect(statuses.has('no_signal')).toBe(true);
    for (const d of all.filter((x) => x.status === 'outside_window')) {
      expect(d.inWindow).toBe(false);
      expect(d.buySignal).toBe(false);
      expect(d.plan).toBeNull();
    }
  });

  it('NL12: decision records carry no execution or outcome fields', () => {
    const keys = new Set(all.flatMap((d) => Object.keys(d)));
    for (const forbidden of ['execution', 'outcome', 'fill', 'fillPrice', 'twoR', 'realizedR', 'alertStatus']) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it('NL12: strategy and indicator code never import backtest, alert or Jev code', () => {
    const root = new URL('../../src/', import.meta.url).pathname;
    for (const dir of ['strategy', 'indicators', 'core']) {
      for (const file of readdirSync(join(root, dir))) {
        const text = readFileSync(join(root, dir, file), 'utf8');
        expect(text, `${dir}/${file}`).not.toMatch(/from '\.\.\/(backtest|alerts|jev)\//);
      }
    }
  });

  it('uses the candle open time in the signal id', () => {
    const d = all[200]!;
    expect(d.id).toBe(`EURUSD|M15|${new Date(candles[200]!.openTime).toISOString()}`);
    expect(d.closeTime - d.openTime).toBe(TIMEFRAME_MS.M15);
  });
});
