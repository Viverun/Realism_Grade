import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { priceToPoints } from '../core/price.js';
import type { Tick } from '../core/types.js';
import { findColumn, parseTimestamp, splitCsvLine } from './csv.js';

/** A parsed data row with the raw text kept for validation reporting. */
export interface ExnessTickRow {
  tick: Tick;
  symbol: string | null;
  rawTime: string;
  rawBid: string;
  rawAsk: string;
}

/**
 * Parser for Exness historical tick exports (exness.com/tick-history), e.g.
 *   "Exness","Symbol","Timestamp","Bid","Ask"
 *   "exness","EURUSD","2024-01-01 22:05:08.353Z",1.10355,1.10414
 * Columns are located by header name, so column order does not matter. A repeated
 * header line (e.g. several CSVs concatenated from one zip) is skipped.
 * Exness describes this data as indicative.
 */
export class ExnessTickParser {
  private columns: { time: number; bid: number; ask: number; symbol: number } | null = null;
  private headerLine: string | null = null;
  private lineNumber = 0;

  constructor(private readonly digits: number) {}

  get header(): string | null {
    return this.headerLine;
  }

  /** Returns a row, or null for header / blank lines. Throws on a malformed data line. */
  parseRow(line: string): ExnessTickRow | null {
    this.lineNumber += 1;
    const trimmed = line.trim();
    if (trimmed === '') return null;
    const fields = splitCsvLine(line);
    if (!this.columns) {
      const columns = {
        time: findColumn(fields, ['timestamp', 'time', 'datetime']),
        bid: findColumn(fields, ['bid']),
        ask: findColumn(fields, ['ask']),
        symbol: findColumn(fields, ['symbol']),
      };
      if (columns.time < 0 || columns.bid < 0 || columns.ask < 0) {
        throw new Error(`Tick header must contain Timestamp, Bid and Ask columns; got: ${line}`);
      }
      this.columns = columns;
      this.headerLine = trimmed;
      return null;
    }
    if (trimmed === this.headerLine) return null;
    const { time, bid, ask, symbol } = this.columns;
    const rawTime = fields[time];
    const rawBid = fields[bid];
    const rawAsk = fields[ask];
    if (rawTime === undefined || rawBid === undefined || rawAsk === undefined) {
      throw new Error(`Line ${this.lineNumber}: missing fields`);
    }
    return {
      tick: {
        time: parseTimestamp(rawTime),
        bid: priceToPoints(rawBid, this.digits),
        ask: priceToPoints(rawAsk, this.digits),
      },
      symbol: symbol >= 0 ? (fields[symbol] ?? null) : null,
      rawTime,
      rawBid,
      rawAsk,
    };
  }

  /** Returns a tick, or null for header / blank lines. */
  parseLine(line: string): Tick | null {
    return this.parseRow(line)?.tick ?? null;
  }

  get currentLine(): number {
    return this.lineNumber;
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

async function* zipLines(path: string): AsyncGenerator<string> {
  const child = spawn('unzip', ['-p', path], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exited = new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? -1));
  });
  exited.catch(() => undefined);
  let completed = false;
  try {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) yield line;
    completed = true;
  } finally {
    if (!completed && child.exitCode === null) child.kill();
  }
  const code = await exited;
  if (code !== 0) throw new Error(`unzip -p ${path} failed (exit ${code}): ${stderr.trim()}`);
}

/** Streams raw lines from a tick CSV, or from a .zip containing it (requires the system `unzip`). */
export async function* readTickFileLines(path: string): AsyncGenerator<string> {
  if (path.toLowerCase().endsWith('.zip')) {
    yield* zipLines(path);
    return;
  }
  yield* createInterface({ input: createReadStream(path), crlfDelay: Infinity });
}

/** Streams ticks from an Exness tick CSV (or .zip) without loading it into memory. */
export async function* readExnessTickFile(path: string, digits: number): AsyncGenerator<Tick> {
  const parser = new ExnessTickParser(digits);
  for await (const line of readTickFileLines(path)) {
    const tick = parser.parseLine(line);
    if (tick) yield tick;
  }
}
