import { describe, expect, it } from 'vitest';
import { ExnessTickParser } from '../../src/data/exness-ticks.js';
import { scanContinuity, TickStatsCollector, timestampShape } from '../../src/data/tick-stats.js';

function run(lines: string[], inWindow: (ms: number) => boolean = () => true) {
  const parser = new ExnessTickParser(5);
  const collector = new TickStatsCollector({ pointsPerPip: 10, digits: 5, inWindow });
  for (const line of lines) {
    try {
      const row = parser.parseRow(line);
      if (row) collector.push(row);
    } catch (error) {
      collector.recordParseError((error as Error).message);
    }
  }
  return collector.result();
}

const HEADER = '"Exness","Symbol","Timestamp","Bid","Ask"';
const row = (time: string, bid: string, ask: string, symbol = 'EURUSDm'): string =>
  `"exness","${symbol}","${time}",${bid},${ask}`;

describe('TickStatsCollector', () => {
  it('reports symbols, formats, decimals and spread percentiles', () => {
    const stats = run([
      HEADER,
      row('2026-09-21 10:00:00.100Z', '1.13600', '1.13606'),
      row('2026-09-21 10:00:01.100Z', '1.13601', '1.13609'),
      row('2026-09-21 10:00:02.100Z', '1.1360', '1.13610'),
      row('2026-09-21 10:00:03.100Z', '1.13603', '1.13613', 'EURUSD'),
    ]);
    expect(stats.rows).toBe(4);
    expect(stats.symbols).toEqual({ EURUSDm: 3, EURUSD: 1 });
    expect(stats.timeFormats).toEqual({ '9999-99-99 99:99:99.999Z': 4 });
    expect(stats.bidDecimals).toEqual({ 4: 1, 5: 3 });
    expect(stats.spread).toMatchObject({ count: 4, minPips: 0.6, medianPips: 0.8, maxPips: 1.0 });
  });

  it('flags crossed quotes, zero spreads, duplicates and out-of-order ticks', () => {
    const stats = run([
      HEADER,
      row('2026-09-21 10:00:00.000Z', '1.13600', '1.13600'),
      row('2026-09-21 10:00:00.000Z', '1.13605', '1.13601'),
      row('2026-09-21 09:59:59.000Z', '1.13600', '1.13606'),
    ]);
    expect(stats.zeroSpread).toBe(1);
    expect(stats.crossed.count).toBe(1);
    expect(stats.duplicateTimestamps).toBe(1);
    expect(stats.outOfOrder).toBe(1);
  });

  it('counts parse errors without stopping', () => {
    const stats = run([HEADER, row('not a time', '1.1', '1.2'), row('2026-09-21 10:00:00Z', '1.13600', '1.13606')]);
    expect(stats.parseErrors.count).toBe(1);
    expect(stats.rows).toBe(1);
  });

  it('computes in-window spreads separately', () => {
    const stats = run(
      [HEADER, row('2026-09-21 03:00:00Z', '1.13600', '1.13620'), row('2026-09-21 05:00:00Z', '1.13600', '1.13606')],
      (ms) => new Date(ms).getUTCHours() >= 4,
    );
    expect(stats.spread?.count).toBe(2);
    expect(stats.spreadInWindow).toMatchObject({ count: 1, medianPips: 0.6 });
  });

  it('separates float-formatting noise from real extra precision', () => {
    const stats = run([
      HEADER,
      row('2026-09-21 10:00:00Z', '1.1381999999999999', '1.13826'),
      row('2026-09-21 10:00:01Z', '1.138205', '1.13826'),
    ]);
    expect(stats.floatNoise).toEqual({ count: 1, example: '1.1381999999999999' });
    expect(stats.precisionLoss).toEqual({ count: 1, example: '1.138205' });
  });

  it('describes timestamp shapes', () => {
    expect(timestampShape('2026-09-21 10:00:01.120Z')).toBe('9999-99-99 99:99:99.999Z');
  });
});

describe('scanContinuity (on ordered ticks)', () => {
  const times = [
    '2026-09-18T20:59:00Z', // Friday
    '2026-09-20T21:05:00Z', // Sunday reopen: weekend close, 30-pip jump
    '2026-09-21T10:00:00Z', // Monday: 15 h weekday gap, inside the window
    '2026-09-21T21:00:00Z', // Monday rollover gap (outside the window)
    '2026-09-23T09:00:00Z', // Tuesday 22 Sep missing entirely
  ].map((t) => Date.parse(t));
  const bids = [113_600, 113_900, 113_910, 113_905, 113_900];
  const c = scanContinuity(times.length, (k) => times[k]!, (k) => bids[k]!, {
    pointsPerPip: 10,
    gapThresholdMs: 5 * 60_000,
    jumpThresholdPips: 20,
    inWindow: (ms) => {
      const h = new Date(ms).getUTCHours();
      return h >= 4 && h < 19;
    },
  });

  it('separates weekend closes from weekday gaps and marks in-window gaps', () => {
    expect(c.weekendGaps).toBe(1);
    expect(c.weekdayGaps).toHaveLength(3);
    expect(c.weekdayGaps.map((g) => g.inWindow)).toEqual([true, true, true]);
  });

  it('lists weekdays with no ticks and flags jumps', () => {
    expect(c.missingWeekdays).toEqual(['2026-09-22']);
    expect(c.jumpCount).toBe(1);
    expect(c.jumps[0]!.pips).toBe(30);
  });
});
