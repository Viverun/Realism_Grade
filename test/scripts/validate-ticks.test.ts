import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { useTempDirs } from '../helpers/tmp.js';

const run = promisify(execFile);
const tempDir = useTempDirs();
const ROOT = new URL('../..', import.meta.url).pathname;
const HEADER = '"Exness","Symbol","Timestamp","Bid","Ask"';

async function validate(csv: string): Promise<{ code: number; report: string }> {
  const dir = await tempDir();
  const file = join(dir, 'Exness_EURUSD_test.csv');
  const out = join(dir, 'report.md');
  await writeFile(file, csv);
  let code = 0;
  try {
    await run('npx', ['tsx', 'scripts/validate-ticks.ts', file, '--out', out], { cwd: ROOT });
  } catch (error) {
    code = (error as { code: number }).code;
  }
  return { code, report: await readFile(out, 'utf8') };
}

describe('scripts/validate-ticks.ts', () => {
  it('passes a clean file and reports the candle build', async () => {
    const rows = [HEADER];
    for (let m = 0; m < 180; m++) {
      const t = new Date(Date.parse('2026-09-21T06:00:00Z') + m * 60_000).toISOString().replace('T', ' ');
      const bid = (1.136 + (m % 7) * 0.00003).toFixed(5);
      const ask = (Number(bid) + 0.00008).toFixed(5);
      rows.push(`"exness","EURUSDm","${t}",${bid},${ask}`);
    }
    const { code, report } = await validate(rows.join('\n'));
    expect(code).toBe(0);
    expect(report).toContain('## Verdict: **PASS**');
    expect(report).toMatch(/\| H1 \| 2 \| 0 \| 100\.0% \|/);
    expect(report).toContain('`EURUSDm`');
  }, 30_000);

  it('repairs whole-day blocks written out of order (warning, not failure)', async () => {
    const rows = [HEADER];
    for (const day of ['22', '21']) {
      for (let m = 0; m < 120; m++) {
        const t = new Date(Date.parse(`2026-09-${day}T06:00:00Z`) + m * 60_000).toISOString().replace('T', ' ');
        rows.push(`"exness","EURUSDm","${t}",1.13600,1.13608`);
      }
    }
    const { code, report } = await validate(rows.join('\n'));
    expect(code).toBe(0);
    expect(report).toContain('## Verdict: **PASS with warnings**');
    expect(report).toContain('written as 2 out-of-order blocks of whole UTC days');
    expect(report).toMatch(/\| H1 \| 3 \| 0 \|/); // 21st 06:00, 07:00 and 22nd 06:00 closed; 22nd 07:00 is the last (open) candle
  }, 30_000);

  it('fails on out-of-order ticks and unparseable rows', async () => {
    const { code, report } = await validate(
      [
        HEADER,
        '"exness","EURUSDm","2026-09-21 06:00:00.000Z",1.13600,1.13608',
        '"exness","EURUSDm","2026-09-21 05:59:00.000Z",1.13600,1.13608',
        '"exness","EURUSDm","garbage",1.13600,1.13608',
      ].join('\n'),
    );
    expect(code).toBe(1);
    expect(report).toContain('## Verdict: **FAIL**');
    expect(report).toContain('1 out-of-order ticks');
    expect(report).toContain('1 unparseable rows');
  }, 30_000);
});
