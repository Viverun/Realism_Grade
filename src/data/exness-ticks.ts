import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { priceToPoints } from '../core/price.js';
import type { Tick } from '../core/types.js';
import { findColumn, parseTimestamp, splitCsvLine } from './csv.js';

/**
 * Parser for Exness historical tick exports (exness.com/tick-history), e.g.
 *   "Exness","Symbol","Timestamp","Bid","Ask"
 *   "exness","EURUSD","2024-01-01 22:05:08.353Z",1.10355,1.10414
 * Columns are located by header name, so column order does not matter.
 * Exness describes this data as indicative.
 */
export class ExnessTickParser {
  private columns: { time: number; bid: number; ask: number } | null = null;
  private lineNumber = 0;

  constructor(private readonly digits: number) {}

  /** Returns a tick, or null for the header / blank lines. */
  parseLine(line: string): Tick | null {
    this.lineNumber += 1;
    if (line.trim() === '') return null;
    const fields = splitCsvLine(line);
    if (!this.columns) {
      const columns = {
        time: findColumn(fields, ['timestamp', 'time', 'datetime']),
        bid: findColumn(fields, ['bid']),
        ask: findColumn(fields, ['ask']),
      };
      if (columns.time < 0 || columns.bid < 0 || columns.ask < 0) {
        throw new Error(`Tick header must contain Timestamp, Bid and Ask columns; got: ${line}`);
      }
      this.columns = columns;
      return null;
    }
    const { time, bid, ask } = this.columns;
    const timeText = fields[time];
    const bidText = fields[bid];
    const askText = fields[ask];
    if (timeText === undefined || bidText === undefined || askText === undefined) {
      throw new Error(`Line ${this.lineNumber}: missing fields`);
    }
    return {
      time: parseTimestamp(timeText),
      bid: priceToPoints(bidText, this.digits),
      ask: priceToPoints(askText, this.digits),
    };
  }
}

export function parseExnessTickCsv(text: string, digits: number): Tick[] {
  const parser = new ExnessTickParser(digits);
  const ticks: Tick[] = [];
  for (const line of text.split(/\r?\n/)) {
    const tick = parser.parseLine(line);
    if (tick) ticks.push(tick);
  }
  return ticks;
}

/** Streams ticks from an (unzipped) Exness tick CSV without loading it into memory. */
export async function* readExnessTickFile(path: string, digits: number): AsyncGenerator<Tick> {
  const parser = new ExnessTickParser(digits);
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    const tick = parser.parseLine(line);
    if (tick) yield tick;
  }
}
