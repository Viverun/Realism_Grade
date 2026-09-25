import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ExnessTickCandleSource } from '../../src/data/exness-tick-source.js';
import { readExnessTickFile } from '../../src/data/exness-ticks.js';
import { useTempDirs } from '../helpers/tmp.js';

const tempDir = useTempDirs();
const HEADER = '"Exness","Symbol","Timestamp","Bid","Ask"';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

async function makeZip(dir: string, entries: Record<string, string>): Promise<string> {
  for (const [name, body] of Object.entries(entries)) await writeFile(join(dir, name), body);
  const zipPath = join(dir, 'ticks.zip');
  execFileSync('zip', ['-q', '-j', zipPath, ...Object.keys(entries).map((name) => join(dir, name))]);
  return zipPath;
}

describe('Exness tick files inside .zip archives', () => {
  it('streams ticks from a zip, skipping repeated headers across entries', async () => {
    const dir = await tempDir();
    const zipPath = await makeZip(dir, {
      'a.csv': `${HEADER}\n"exness","EURUSDm","2026-09-21 10:00:01.000Z",1.13600,1.13607\n`,
      'b.csv': `${HEADER}\n"exness","EURUSDm","2026-09-21 10:20:00.000Z",1.13650,1.13657\n`,
    });
    const ticks = await collect(readExnessTickFile(zipPath, 5));
    expect(ticks.map((t) => t.bid)).toEqual([113600, 113650]);
  });

  it('feeds zips straight into ExnessTickCandleSource', async () => {
    const dir = await tempDir();
    const zipPath = await makeZip(dir, {
      'm.csv': [
        HEADER,
        '"exness","EURUSDm","2026-09-21 10:00:01.000Z",1.13600,1.13607',
        '"exness","EURUSDm","2026-09-21 10:40:00.000Z",1.13650,1.13657',
        '"exness","EURUSDm","2026-09-21 11:05:00.000Z",1.13700,1.13706',
      ].join('\n'),
    });
    const source = new ExnessTickCandleSource([zipPath], Date.parse('2026-09-21T11:10:00Z'), 5);
    const h1 = await source.getClosedCandles({ timeframe: 'H1', asOfMs: Date.parse('2026-09-22T00:00:00Z') });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toMatchObject({ open: 113600, high: 113650, close: 113650 });
  });

  it('reports a clear error for a missing or corrupt archive', async () => {
    const dir = await tempDir();
    await expect(collect(readExnessTickFile(join(dir, 'missing.zip'), 5))).rejects.toThrow(/unzip -p/);
    const bad = join(dir, 'bad.zip');
    await writeFile(bad, 'not a zip');
    await expect(collect(readExnessTickFile(bad, 5))).rejects.toThrow(/unzip -p/);
  });
});
