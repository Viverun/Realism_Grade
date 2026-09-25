import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TickStore } from '../../src/backtest/tick-store.js';
import { runTimeframe } from '../../src/backtest/runner.js';
import { summarise } from '../../src/backtest/summary.js';
import { buildVariants } from '../../src/backtest/variants.js';
import { smallConfig } from '../helpers/fixtures.js';
import { seededRandom } from '../helpers/random.js';
import { useTempDirs } from '../helpers/tmp.js';

const tempDir = useTempDirs();
const HEADER = '"Exness","Symbol","Timestamp","Bid","Ask"';
const line = (ms: number, bid: number, ask: number): string =>
  `"exness","EURUSDm","${new Date(ms).toISOString().replace('T', ' ')}",${(bid / 1e5).toFixed(5)},${(ask / 1e5).toFixed(5)}`;

describe('TickStore', () => {
  it('loads files in order, applies the exclusive end cut-off, and drops overlaps', async () => {
    const dir = await tempDir();
    const t = (iso: string): number => Date.parse(iso);
    await writeFile(join(dir, 'a.csv'), [HEADER, line(t('2026-09-23T10:00:00Z'), 113_600, 113_607), line(t('2026-09-24T23:59:59Z'), 113_610, 113_617)].join('\n'));
    await writeFile(join(dir, 'b.csv'), [HEADER, line(t('2026-09-24T12:00:00Z'), 113_620, 113_627), line(t('2026-09-25T00:00:00Z'), 113_630, 113_637)].join('\n'));
    const { store, summary } = await TickStore.load([join(dir, 'a.csv'), join(dir, 'b.csv')], 5, { endMs: t('2026-09-25T00:00:00Z') });
    expect(store.length).toBe(2);
    expect(summary.dropped).toEqual({ beforeStart: 0, atOrAfterEnd: 1, outOfOrder: 1 });
    expect(store.firstAtOrAfter(t('2026-09-24T00:00:00Z'))).toBe(1);
    expect(store.firstAtOrAfter(t('2026-09-26T00:00:00Z'))).toBe(2);
  });

  it('grows past its initial capacity and builds valid candles', () => {
    const store = new TickStore();
    const start = Date.parse('2026-09-21T00:00:00Z');
    for (let k = 0; k < (1 << 20) + 10; k++) store.push({ time: start + k * 100, bid: 113_600 + (k % 50), ask: 113_608 + (k % 50) });
    expect(store.length).toBe((1 << 20) + 10);
    const candles = store.buildCandles(start + ((1 << 20) + 10) * 100);
    expect(candles.M15.length).toBeGreaterThan(100);
    expect(candles.H1.every((c) => c.ask !== undefined)).toBe(true);
  });
});

describe('runner (end to end on synthetic ticks)', () => {
  it('runs every variant, respects the daily cap, and keeps statuses consistent', () => {
    const config = smallConfig();
    const random = seededRandom(5);
    const store = new TickStore();
    const start = Date.parse('2026-09-21T00:00:00Z');
    let bid = 110_000;
    for (let k = 0; k < 5 * 24 * 360; k++) {
      bid += Math.round((random() - 0.48) * 12);
      store.push({ time: start + k * 10_000, bid, ask: bid + 7 });
    }
    const end = start + 5 * 24 * 3_600_000;
    const candles = store.buildCandles(end);
    for (const variant of buildVariants(config)) {
      const run = runTimeframe(store, candles.M15, 'M15', variant);
      const s = summarise(run, config.alerts.timezone);
      expect(s.emailed).toBeLessThanOrEqual(config.alerts.maxPerDay * 6);
      expect(s.filled).toBeLessThanOrEqual(s.emailed);
      for (const a of run.alerts) {
        if (a.alertStatus !== 'emailed') expect(a.execution).toBeNull();
        if (a.execution?.status === 'filled') expect(a.outcome).not.toBeNull();
        if (a.execution?.fillTime != null) expect(a.execution.fillTime).toBeGreaterThanOrEqual(a.decision.closeTime); // NL11
      }
    }
  });
});
