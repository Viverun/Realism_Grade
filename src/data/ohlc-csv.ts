import { readFile } from 'node:fs/promises';
import { priceToPoints } from '../core/price.js';
import { candleCloseTime, type Timeframe } from '../core/timeframe.js';
import type { Candle } from '../core/types.js';
import { findColumn, parseTimestamp, splitCsvLine } from './csv.js';
import type { CandleRequest, CandleSource } from './sources.js';
import { assertValidCandles } from './validate.js';

/**
 * Parses a candle CSV with header `time,open,high,low,close` (Bid prices; time = candle
 * OPEN time, ISO-8601 or epoch ms, UTC) and optional `ask_open,ask_high,ask_low,ask_close`.
 */
export function parseOhlcCsv(text: string, timeframe: Timeframe, digits: number): Candle[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const [headerLine, ...rows] = lines;
  if (headerLine === undefined) return [];
  const header = splitCsvLine(headerLine);
  const col = {
    time: findColumn(header, ['time', 'timestamp', 'open_time']),
    open: findColumn(header, ['open']),
    high: findColumn(header, ['high']),
    low: findColumn(header, ['low']),
    close: findColumn(header, ['close']),
    askOpen: findColumn(header, ['ask_open']),
    askHigh: findColumn(header, ['ask_high']),
    askLow: findColumn(header, ['ask_low']),
    askClose: findColumn(header, ['ask_close']),
  };
  if ([col.time, col.open, col.high, col.low, col.close].some((index) => index < 0)) {
    throw new Error(`OHLC CSV header must contain time,open,high,low,close; got: ${headerLine}`);
  }
  const hasAsk = [col.askOpen, col.askHigh, col.askLow, col.askClose].every((index) => index >= 0);

  return rows.map((line, rowIndex) => {
    const fields = splitCsvLine(line);
    const field = (index: number): string => {
      const value = fields[index];
      if (value === undefined || value === '') throw new Error(`Row ${rowIndex + 2}: missing column ${index}`);
      return value;
    };
    const points = (index: number): number => priceToPoints(field(index), digits);
    const candle: Candle = {
      timeframe,
      openTime: parseTimestamp(field(col.time)),
      open: points(col.open),
      high: points(col.high),
      low: points(col.low),
      close: points(col.close),
    };
    if (hasAsk) {
      candle.ask = {
        open: points(col.askOpen),
        high: points(col.askHigh),
        low: points(col.askLow),
        close: points(col.askClose),
      };
    }
    return candle;
  });
}

export function filterClosed(candles: readonly Candle[], request: CandleRequest): Candle[] {
  return candles.filter(
    (candle) =>
      candleCloseTime(candle.openTime, candle.timeframe) <= request.asOfMs &&
      (request.fromMs === undefined || candle.openTime >= request.fromMs),
  );
}

/** CandleSource backed by one OHLC CSV file per timeframe. Files are validated on first load. */
export class OhlcCsvCandleSource implements CandleSource {
  private readonly cache = new Map<Timeframe, Candle[]>();

  constructor(
    private readonly files: Partial<Record<Timeframe, string>>,
    private readonly digits: number,
  ) {}

  async getClosedCandles(request: CandleRequest): Promise<Candle[]> {
    let candles = this.cache.get(request.timeframe);
    if (!candles) {
      const path = this.files[request.timeframe];
      if (!path) throw new Error(`No CSV file configured for ${request.timeframe}`);
      candles = parseOhlcCsv(await readFile(path, 'utf8'), request.timeframe, this.digits);
      assertValidCandles(candles, request.timeframe);
      this.cache.set(request.timeframe, candles);
    }
    return filterClosed(candles, request);
  }
}
