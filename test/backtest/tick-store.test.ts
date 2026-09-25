import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DataOrderError, TickStore } from '../../src/backtest/tick-store.js';
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

describe('TickStore.normaliseOrder (whole-day blocks written out of order)', () => {
  const day = (d: string, hh: number, mm = 0): number => Date.parse(`2025-08-${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const fill = (times: number[]): TickStore => {
    const st = new TickStore();
    times.forEach((t, k) => st.push({ time: t, bid: 100_000 + k, ask: 100_008 + k }));
    return st;
  };

  it('reorders day blocks into chronological order, stably', () => {
    // Blocks: [20, 22] [21, 25] [24] — like the real 2025-08 export.
    const st = fill([day('20', 1), day('20', 5), day('22', 3), day('21', 2), day('21', 2), day('25', 9), day('24', 22)]);
    const report = st.normaliseOrder('f');
    expect(report).toEqual({ file: 'f', ticks: 7, runs: 3, reordered: true });
    const times = Array.from({ length: st.length }, (_, k) => st.timeAt(k));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // The two ticks at the same timestamp keep their original relative order (bid 100_003 then 100_004).
    expect([st.bid(2), st.bid(3)]).toEqual([100_003, 100_004]);
  });

  it('leaves ordered data untouched', () => {
    const st = fill([day('20', 1), day('21', 1)]);
    expect(st.normaliseOrder('f')).toEqual({ file: 'f', ticks: 2, runs: 1, reordered: false });
  });

  it('refuses when a UTC day is split across blocks (ambiguous)', () => {
    const st = fill([day('20', 1), day('20', 9), day('20', 5)]);
    expect(() => st.normaliseOrder('f')).toThrow(DataOrderError);
  });

  it('TickStore.load reorders per file and reports it', async () => {
    const dir = await tempDir();
    const iso = (t: number): number => t;
    await writeFile(join(dir, 'a.csv'), [HEADER, line(iso(day('21', 10)), 113_600, 113_607), line(iso(day('20', 10)), 113_500, 113_507)].join('\n'));
    const { store, summary } = await TickStore.load([join(dir, 'a.csv')], 5, { endMs: day('30', 0) });
    expect(store.length).toBe(2);
    expect(store.timeAt(0)).toBe(day('20', 10));
    expect(summary.reordered).toEqual([{ file: join(dir, 'a.csv'), ticks: 2, runs: 2, reordered: true }]);
    expect(summary.dropped.outOfOrder).toBe(0);
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
