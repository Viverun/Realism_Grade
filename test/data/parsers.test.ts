import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTimestamp } from '../../src/data/csv.js';
import { ExnessTickCandleSource } from '../../src/data/exness-tick-source.js';
import { parseExnessTickCsv } from '../../src/data/exness-ticks.js';
import { OhlcCsvCandleSource, parseOhlcCsv } from '../../src/data/ohlc-csv.js';
import { validateCandles } from '../../src/data/validate.js';
import { useTempDirs } from '../helpers/tmp.js';

const tempDir = useTempDirs();

const t = (iso: string): number => Date.parse(iso);

const exnessCsv = [
  '"Exness","Symbol","Timestamp","Bid","Ask"',
  '"exness","EURUSD","2026-09-21 10:00:01.120Z",1.13600,1.13607',
  '"exness","EURUSD","2026-09-21 10:20:00.000Z",1.13650,1.13657',
  '"exness","EURUSD","2026-09-21 10:59:59.999Z",1.13580,1.13588',
  '"exness","EURUSD","2026-09-21 11:05:00.000Z",1.13700,1.13706',
  '',
].join('\n');

describe('parseTimestamp', () => {
  it('accepts Exness, ISO and epoch formats as UTC', () => {
    expect(parseTimestamp('2026-09-21 10:00:01.120Z')).toBe(t('2026-09-21T10:00:01.120Z'));
    expect(parseTimestamp('2026-09-21 10:00:01')).toBe(t('2026-09-21T10:00:01Z'));
    expect(parseTimestamp('2026-09-21T14:00:00+04:00')).toBe(t('2026-09-21T10:00:00Z'));
    expect(parseTimestamp('1790000000000')).toBe(1790000000000);
    expect(() => parseTimestamp('not a date')).toThrow();
  });
});

describe('Exness tick CSV', () => {
  it('parses quoted Exness exports into integer-point ticks', () => {
    const ticks = parseExnessTickCsv(exnessCsv, 5);
    expect(ticks).toHaveLength(4);
    expect(ticks[0]).toEqual({ time: t('2026-09-21T10:00:01.120Z'), bid: 113600, ask: 113607 });
  });

  it('rejects files without Bid/Ask columns', () => {
    expect(() => parseExnessTickCsv('time,price\n2026-09-21,1.1', 5)).toThrow(/Bid and Ask/);
  });

  it('ExnessTickCandleSource builds closed candles and respects dataEnd and asOf', async () => {
    const dir = await tempDir();
    const file = join(dir, 'ticks.csv');
    await writeFile(file, exnessCsv);
    const source = new ExnessTickCandleSource([file], t('2026-09-21T11:10:00Z'), 5);

    const h1 = await source.getClosedCandles({ timeframe: 'H1', asOfMs: t('2026-09-21T23:00:00Z') });
    expect(h1).toHaveLength(1); // 11:00 H1 bucket not complete at dataEnd 11:10
    expect(h1[0]).toMatchObject({ open: 113600, high: 113650, low: 113580, close: 113580 });

    const m15 = await source.getClosedCandles({ timeframe: 'M15', asOfMs: t('2026-09-21T10:30:00Z') });
    expect(m15.map((c) => new Date(c.openTime).toISOString())).toEqual([
      '2026-09-21T10:00:00.000Z',
      '2026-09-21T10:15:00.000Z',
    ]);
  });
});

describe('OHLC CSV', () => {
  const csv = [
    'time,open,high,low,close,ask_open,ask_high,ask_low,ask_close',
    '2026-09-21T10:00:00Z,1.13620,1.13700,1.13580,1.13660,1.13628,1.13708,1.13588,1.13668',
    '2026-09-21T11:00:00Z,1.13660,1.13750,1.13640,1.13710,1.13668,1.13758,1.13648,1.13718',
  ].join('\n');

  it('parses Bid OHLC with optional Ask columns', () => {
    const candles = parseOhlcCsv(csv, 'H1', 5);
    expect(candles[1]).toMatchObject({ openTime: t('2026-09-21T11:00:00Z'), close: 113710 });
    expect(candles[1]!.ask?.close).toBe(113718);
    expect(validateCandles(candles, 'H1')).toEqual([]);
  });

  it('source returns only candles closed by asOf', async () => {
    const dir = await tempDir();
    const file = join(dir, 'h1.csv');
    await writeFile(file, csv);
    const source = new OhlcCsvCandleSource({ H1: file }, 5);
    expect(await source.getClosedCandles({ timeframe: 'H1', asOfMs: t('2026-09-21T11:59:00Z') })).toHaveLength(1);
    expect(await source.getClosedCandles({ timeframe: 'H1', asOfMs: t('2026-09-21T12:00:00Z') })).toHaveLength(2);
  });

  it('source rejects corrupt data', async () => {
    const dir = await tempDir();
    const file = join(dir, 'bad.csv');
    await writeFile(file, 'time,open,high,low,close\n2026-09-21T10:00:00Z,1.1,1.0,1.2,1.1\n');
    const source = new OhlcCsvCandleSource({ H1: file }, 5);
    await expect(source.getClosedCandles({ timeframe: 'H1', asOfMs: Date.now() })).rejects.toThrow(/Invalid H1/);
  });
});
