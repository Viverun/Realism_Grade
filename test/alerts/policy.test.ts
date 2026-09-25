import { describe, expect, it } from 'vitest';
import { AlertPolicy, type AlertCandidate } from '../../src/alerts/policy.js';
import { configHash } from '../../src/config/load.js';
import { TIMEFRAME_MS } from '../../src/core/timeframe.js';
import { decideAll, decideAt, makeEngineContext } from '../../src/strategy/engine.js';
import { smallConfig, testConfig } from '../helpers/fixtures.js';
import { trendingCandles } from '../helpers/series.js';

const alerts = testConfig().alerts; // max 3/day, cooldown 3, Asia/Dubai
const M15 = TIMEFRAME_MS.M15;
const sig = (iso: string): AlertCandidate => {
  const openTime = Date.parse(iso);
  return { id: `EURUSD|M15|${iso}`, timeframe: 'M15', openTime, closeTime: openTime + M15 };
};

describe('AlertPolicy (spec §10)', () => {
  it('emails the chronological first three per Dubai day, then caps', () => {
    const policy = new AlertPolicy(alerts);
    const out = ['05:00', '06:00', '07:00', '08:00'].map((t) => policy.offer(sig(`2026-09-21T${t}:00Z`)));
    expect(out).toEqual(['emailed', 'emailed', 'emailed', 'capped']);
    // 20:00Z = 00:00 Dubai next day: a new day.
    expect(policy.offer(sig('2026-09-21T20:00:00Z'))).toBe('emailed');
  });

  it('cooldown blocks 3 candle-durations after an emailed alert', () => {
    const policy = new AlertPolicy(alerts);
    expect(policy.offer(sig('2026-09-21T05:00:00Z'))).toBe('emailed');
    expect(policy.offer(sig('2026-09-21T05:45:00Z'))).toBe('cooldown'); // +3 candles
    expect(policy.offer(sig('2026-09-21T06:00:00Z'))).toBe('emailed'); // +4 candles
  });

  it('never emails the same id twice, and requires chronological order', () => {
    const policy = new AlertPolicy({ ...alerts, cooldownCandles: 0 });
    expect(policy.offer(sig('2026-09-21T05:00:00Z'))).toBe('emailed');
    expect(policy.offer(sig('2026-09-21T05:00:00Z'))).toBe('duplicate');
    expect(() => policy.offer(sig('2026-09-21T04:00:00Z'))).toThrow(/chronologically/);
  });
});

describe('stream vs batch (NL9) and causality (NL10)', () => {
  const config = smallConfig((raw) => (raw.alerts.maxPerDay = 2));
  const ctx = makeEngineContext(config, 'M15', configHash(config));
  const candles = trendingCandles(420, 11);
  const run = (decisions: ReturnType<typeof decideAll>) => {
    const policy = new AlertPolicy(config.alerts);
    return decisions.filter((d) => d.status === 'signal').map((d) => [d.id, policy.offer(d)] as const);
  };

  it('NL9: candle-by-candle replay (live path) gives the same alert log as the batch path', () => {
    const batch = run(decideAll(candles, ctx));
    const stream = run(candles.map((_, i) => decideAt(candles.slice(0, i + 1), ctx)));
    expect(stream).toEqual(batch);
    expect(batch.some(([, s]) => s === 'emailed')).toBe(true);
    expect(batch.some(([, s]) => s !== 'emailed')).toBe(true); // cap/cooldown actually exercised
  });

  it('NL10: removing a later signal never changes the status of an earlier one', () => {
    const signals = decideAll(candles, ctx).filter((d) => d.status === 'signal');
    const full = run(signals);
    for (let k = 1; k < signals.length; k++) {
      const without = run(signals.filter((_, j) => j !== k));
      expect(without.slice(0, k)).toEqual(full.slice(0, k));
    }
  });
});
