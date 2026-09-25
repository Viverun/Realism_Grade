/**
 * Validates Exness tick-history files (CSV or .zip) against the project's tick loader and
 * candle builder, and writes a Markdown report.
 *
 *   npm run validate:ticks -- data/raw/Exness_EURUSD_2026_09.zip [more files…]
 *     [--out docs/claude_thinking/tick-data-validation.md] [--config config/v1.yaml]
 *     [--eval-start 2025-09-25] [--gap-min 5] [--jump-pips 20]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { loadConfig } from '../src/config/load.js';
import { formatPoints } from '../src/core/price.js';
import { candleCloseTime, TIMEFRAMES, type Timeframe } from '../src/core/timeframe.js';
import { clockToMinutes, makeLocalClock } from '../src/core/timezone.js';
import type { Candle } from '../src/core/types.js';
import { DataOrderError, TickStore, type FileOrderReport } from '../src/backtest/tick-store.js';
import { ExnessTickParser, readTickFileLines } from '../src/data/exness-ticks.js';
import { scanContinuity, type SpreadSummary, type TickStats, TickStatsCollector } from '../src/data/tick-stats.js';
import { validateCandles } from '../src/data/validate.js';

interface Args {
  files: string[];
  out: string;
  config: string;
  evalStart: string | null;
  gapMin: number;
  jumpPips: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    files: [],
    out: 'docs/claude_thinking/tick-data-validation.md',
    config: 'config/v1.yaml',
    evalStart: null,
    gapMin: 5,
    jumpPips: 20,
  };
  for (let k = 0; k < argv.length; k++) {
    const arg = argv[k]!;
    const value = (): string => {
      const v = argv[++k];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    if (arg === '--out') args.out = value();
    else if (arg === '--config') args.config = value();
    else if (arg === '--eval-start') args.evalStart = value();
    else if (arg === '--gap-min') args.gapMin = Number(value());
    else if (arg === '--jump-pips') args.jumpPips = Number(value());
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else args.files.push(arg);
  }
  if (args.files.length === 0) throw new Error('Usage: validate-ticks <file.csv|file.zip>… [--out report.md]');
  args.files.sort();
  return args;
}

interface FileResult {
  file: string;
  header: string | null;
  stats: TickStats;
  fatal: string | null;
  order: FileOrderReport | null;
  orderError: string | null;
}

const utc = (ms: number | null): string => (ms === null ? '—' : new Date(ms).toISOString().replace('.000Z', 'Z'));

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadConfig(args.config);
  const { digits, pointsPerPip } = config.instrument;
  const clock = makeLocalClock(config.alerts.timezone);
  const windowStart = clockToMinutes(config.alerts.windowStart);
  const windowEnd = clockToMinutes(config.alerts.windowEnd);
  const inWindow = (ms: number): boolean => {
    const m = clock(ms).minuteOfDay;
    return m >= windowStart && m < windowEnd;
  };
  const local = (ms: number): string => {
    const t = clock(ms);
    const hh = String(Math.floor(t.minuteOfDay / 60)).padStart(2, '0');
    const mm = String(t.minuteOfDay % 60).padStart(2, '0');
    return `${t.date} ${hh}:${mm}`;
  };

  // Candles are built through the backtest loader's own path: per-file order normalisation,
  // then append with overlap dropping (TickStore.normaliseOrder / appendFrom).
  const combined = new TickStore();
  const dropped = { beforeStart: 0, atOrAfterEnd: 0, outOfOrder: 0 };
  const results: FileResult[] = [];

  for (const file of args.files) {
    const parser = new ExnessTickParser(digits);
    const collector = new TickStatsCollector({
      pointsPerPip,
      digits,
      inWindow,
    });
    let fatal: string | null = null;
    const buffer = new TickStore();
    try {
      for await (const line of readTickFileLines(file)) {
        let row;
        try {
          row = parser.parseRow(line);
        } catch (error) {
          if (!parser.header) throw error;
          collector.recordParseError(`line ${parser.currentLine}: ${(error as Error).message}`);
          continue;
        }
        if (!row) continue;
        collector.push(row); // statistics see the file exactly as written
        buffer.push(row.tick);
      }
    } catch (error) {
      fatal = (error as Error).message;
    }
    let order: FileOrderReport | null = null;
    let orderError: string | null = null;
    if (!fatal) {
      try {
        order = buffer.normaliseOrder(basename(file));
        combined.appendFrom(buffer, { endMs: Infinity }, dropped);
      } catch (error) {
        if (!(error instanceof DataOrderError)) throw error;
        orderError = error.message;
      }
    }
    results.push({ file, header: parser.header, stats: collector.result(), fatal, order, orderError });
    process.stderr.write(`read ${basename(file)}: ${collector.result().rows.toLocaleString('en-US')} ticks\n`);
  }

  const overlapSkipped = dropped.outOfOrder;
  const asOf = combined.length ? combined.timeAt(combined.length - 1) : 0;
  let candles: Record<Timeframe, Candle[]> = { M15: [], M30: [], H1: [] };
  let candleError: string | null = null;
  try {
    if (combined.length) candles = combined.buildCandles(asOf);
  } catch (error) {
    candleError = (error as Error).message;
  }

  // ---- verdict ----
  const failures: string[] = [];
  const warnings: string[] = [];
  const totalRows = results.reduce((n, r) => n + r.stats.rows, 0);
  if (totalRows === 0) failures.push('No ticks were read.');
  if (candleError) failures.push(`Candle build failed: ${candleError}`);
  const continuity = scanContinuity(combined.length, (k) => combined.timeAt(k), (k) => combined.bid(k), {
    pointsPerPip,
    gapThresholdMs: args.gapMin * 60_000,
    jumpThresholdPips: args.jumpPips,
    inWindow,
  });
  const windowGaps = continuity.weekdayGaps.filter((g) => g.inWindow);
  if (windowGaps.length) warnings.push(`${windowGaps.length} weekday gaps > ${args.gapMin} min inside the ${config.alerts.windowStart}–${config.alerts.windowEnd} Dubai window (missing data or market halts; see Continuity)`);
  if (continuity.missingWeekdays.length) warnings.push(`${continuity.missingWeekdays.length} weekdays with no ticks at all: ${continuity.missingWeekdays.join(', ')} (market holidays such as 25 Dec / 1 Jan are expected)`);
  for (const r of results) {
    const name = basename(r.file);
    const s = r.stats;
    if (r.fatal) failures.push(`${name}: fatal read error: ${r.fatal}`);
    if (s.parseErrors.count) failures.push(`${name}: ${s.parseErrors.count} unparseable rows`);
    if (r.orderError) failures.push(`${name}: ${s.outOfOrder} out-of-order ticks that cannot be safely reordered: ${r.orderError}`);
    else if (r.order?.reordered) {
      warnings.push(`${name}: written as ${r.order.runs} out-of-order blocks of whole UTC days (${s.outOfOrder.toLocaleString('en-US')} ticks behind their predecessor); every day lies in one block, so the loader restores chronological order deterministically`);
    }
    if (s.nonPositive) failures.push(`${name}: ${s.nonPositive} non-positive prices`);
    if (s.crossed.count) warnings.push(`${name}: ${s.crossed.count} crossed quotes (ask < bid)`);
    if (Object.keys(s.symbols).length > 1) warnings.push(`${name}: more than one symbol (${Object.keys(s.symbols).join(', ')})`);
    if (s.precisionLoss.count) warnings.push(`${name}: ${s.precisionLoss.count} prices have real precision beyond ${digits} digits (e.g. ${s.precisionLoss.example}); rounding changes them`);
  }
  if (overlapSkipped) warnings.push(`${overlapSkipped.toLocaleString('en-US')} ticks skipped because files overlap in time (e.g. a yearly file plus monthly files)`);
  for (const tf of TIMEFRAMES) {
    const issues = validateCandles(candles[tf], tf);
    if (issues.length) failures.push(`${tf}: ${issues.length} candle integrity issues (first: ${issues[0]})`);
  }
  const warmup = config.indicators.warmupCandles;
  const evalStartMs = args.evalStart ? Date.parse(`${args.evalStart}T00:00:00Z`) : null;
  const warmupRows = TIMEFRAMES.map((tf) => {
    const list = candles[tf];
    const firstEvaluable = list[warmup];
    const before = evalStartMs === null ? null : list.filter((c) => candleCloseTime(c.openTime, tf) <= evalStartMs).length;
    if (before !== null && before < warmup) {
      warnings.push(`${tf}: only ${before} candles before ${args.evalStart}; ${warmup} needed for warm-up`);
    }
    return { tf, count: list.length, firstEvaluable, before };
  });
  const verdict = failures.length ? 'FAIL' : warnings.length ? 'PASS with warnings' : 'PASS';

  // ---- report ----
  const lines: string[] = [];
  const spreadRow = (label: string, s: SpreadSummary | null): string =>
    s
      ? `| ${label} | ${s.count.toLocaleString('en-US')} | ${s.minPips.toFixed(1)} | ${s.medianPips.toFixed(1)} | ${s.meanPips.toFixed(2)} | ${s.p95Pips.toFixed(1)} | ${s.p99Pips.toFixed(1)} | ${s.maxPips.toFixed(1)} |`
      : `| ${label} | 0 | — | — | — | — | — | — |`;

  lines.push('# Tick data validation report', '');
  lines.push(`Generated by \`scripts/validate-ticks.ts\` on ${new Date().toISOString().slice(0, 10)}.`);
  lines.push('It checks the files against the project\'s own loader (`ExnessTickParser`), the backtest loader (`TickStore`: order repair, overlap dropping), candle builder (`TickAggregator`, `resampleCandles`) and integrity checks (`validateCandles`).');
  lines.push(`Config: \`${args.config}\` (digits ${digits}, ${pointsPerPip} points/pip, window ${config.alerts.windowStart}–${config.alerts.windowEnd} ${config.alerts.timezone}).`, '');
  lines.push(`## Verdict: **${verdict}**`, '');
  for (const f of failures) lines.push(`- ❌ ${f}`);
  for (const w of warnings) lines.push(`- ⚠️ ${w}`);
  if (!failures.length && !warnings.length) lines.push('- All checks passed.');
  lines.push('');

  lines.push('## Files', '');
  lines.push('| File | Ticks | First tick (UTC) | Last tick (UTC) | Symbol(s) |', '|---|---|---|---|---|');
  for (const r of results) {
    const symbols = Object.entries(r.stats.symbols).map(([k, v]) => `${k} (${v.toLocaleString('en-US')})`).join(', ');
    lines.push(`| ${basename(r.file)} | ${r.stats.rows.toLocaleString('en-US')} | ${utc(r.stats.firstTime)} | ${utc(r.stats.lastTime)} | ${symbols || '—'} |`);
  }
  lines.push('');

  for (const r of results) {
    const s = r.stats;
    lines.push(`## ${basename(r.file)}`, '');
    lines.push(`- **Header:** \`${r.header ?? '(none found)'}\``);
    lines.push(`- **Timestamp samples:** ${s.timeSamples.map((t) => `\`${t}\``).join(', ') || '—'}`);
    lines.push(`- **Timestamp formats (digits shown as 9):** ${Object.entries(s.timeFormats).map(([k, v]) => `\`${k}\` × ${v.toLocaleString('en-US')}`).join('; ') || '—'}`);
    lines.push(`- **Coverage:** ${utc(s.firstTime)} → ${utc(s.lastTime)} (Dubai ${s.firstTime === null ? '—' : local(s.firstTime)} → ${s.lastTime === null ? '—' : local(s.lastTime)}), ${Object.keys(s.ticksPerDay).length} UTC days with ticks`);
    lines.push(`- **Ordering (as written):** ${s.outOfOrder.toLocaleString('en-US')} out-of-order, ${s.duplicateTimestamps.toLocaleString('en-US')} ticks sharing the previous tick's timestamp`);
    if (r.order?.reordered) lines.push(`- **Order repair:** ${r.order.runs} chronological blocks, each UTC day in exactly one block → reordered by timestamp (stable).`);
    if (r.orderError) lines.push(`- **Order repair refused:** ${r.orderError}`);
    lines.push(`- **Price decimals:** bid ${JSON.stringify(s.bidDecimals)}, ask ${JSON.stringify(s.askDecimals)}`);
    lines.push(`- **Precision:** ${s.floatNoise.count.toLocaleString('en-US')} prices carry float-formatting noise${s.floatNoise.example ? ` (e.g. \`${s.floatNoise.example}\`)` : ''} and round exactly to ${digits} digits (harmless); ${s.precisionLoss.count} have real extra precision.`);
    lines.push(`- **Quote sanity:** ${s.crossed.count} crossed (ask < bid), ${s.zeroSpread.toLocaleString('en-US')} zero-spread, ${s.nonPositive} non-positive`);
    if (s.parseErrors.count) {
      lines.push(`- **Parse errors:** ${s.parseErrors.count}`);
      for (const e of s.parseErrors.examples) lines.push(`  - ${e}`);
    }
    if (s.crossed.examples.length) {
      lines.push('- **Crossed-quote examples:**');
      for (const e of s.crossed.examples) lines.push(`  - ${e}`);
    }
    lines.push('', '**Spread (ask − bid), pips**', '');
    lines.push('| Scope | Ticks | Min | Median | Mean | p95 | p99 | Max |', '|---|---|---|---|---|---|---|---|');
    lines.push(spreadRow('All ticks', s.spread));
    lines.push(spreadRow(`${config.alerts.windowStart}–${config.alerts.windowEnd} Dubai`, s.spreadInWindow));
    lines.push('');
  }

  lines.push('## Continuity (after order repair, all files combined)', '');
  lines.push(`- **Weekend closes:** ${continuity.weekendGaps}`);
  lines.push(`- **Weekdays with no ticks:** ${continuity.missingWeekdays.length ? continuity.missingWeekdays.join(', ') : 'none'}`);
  lines.push(`- **Weekday gaps > ${args.gapMin} min:** ${continuity.weekdayGaps.length} (${windowGaps.length} touching the trading window). Gaps at 21:00/22:00 UTC are the daily rollover break.`);
  for (const g of continuity.weekdayGaps.slice(0, 60)) {
    lines.push(`  - ${utc(g.from)} → ${utc(g.to)} (${((g.to - g.from) / 60_000).toFixed(0)} min)${g.inWindow ? ' **in window**' : ''}`);
  }
  lines.push(`- **Bid jumps > ${args.jumpPips} pips between consecutive ticks:** ${continuity.jumpCount} (weekend re-opens and news releases are expected)`);
  for (const j of continuity.jumps.slice(0, 30)) {
    lines.push(`  - ${utc(j.time)}: ${formatPoints(j.fromBid, digits)} → ${formatPoints(j.toBid, digits)} (${j.pips.toFixed(1)} pips)`);
  }
  lines.push('');

  lines.push('## Symbol / account variant', '');
  lines.push('The file alone cannot prove which Exness account type it belongs to. Evidence:');
  for (const r of results) {
    const s = r.stats;
    lines.push(`- ${basename(r.file)}: symbol ${Object.keys(s.symbols).map((k) => `\`${k}\``).join(', ') || '—'}; median spread in the trading window ${s.spreadInWindow ? s.spreadInWindow.medianPips.toFixed(1) : '—'} pips.`);
  }
  lines.push('', 'Spread-only account types generally show wider typical EUR/USD spreads than raw-spread/commission types, which sit near zero. **The owner must confirm** that the export matches the trading account (approved: Standard USD).', '');

  lines.push('## Candle build (combined, files in name order)', '');
  lines.push(`Built with the backtest loader (per-file order repair, overlapping ticks dropped: ${overlapSkipped.toLocaleString('en-US')}) from ${combined.length.toLocaleString('en-US')} of ${totalRows.toLocaleString('en-US')} ticks. The last, incomplete candle is excluded (closed candles only).`, '');
  lines.push('| Timeframe | Candles | Integrity issues | With Ask OHLC | First open (UTC) | Last open (UTC) |', '|---|---|---|---|---|---|');
  for (const tf of TIMEFRAMES) {
    const list = candles[tf];
    const withAsk = list.filter((c) => c.ask).length;
    lines.push(`| ${tf} | ${list.length.toLocaleString('en-US')} | ${validateCandles(list, tf).length} | ${list.length ? ((100 * withAsk) / list.length).toFixed(1) : '0'}% | ${utc(list[0]?.openTime ?? null)} | ${utc(list.at(-1)?.openTime ?? null)} |`);
  }
  lines.push('', '**Sample H1 candles (Bid OHLC; last 5)**', '');
  lines.push('| Open (UTC) | Close (Dubai) | Open | High | Low | Close | Ask close | Ticks |', '|---|---|---|---|---|---|---|---|');
  for (const c of candles.H1.slice(-5)) {
    const p = (v: number): string => formatPoints(v, digits);
    lines.push(`| ${utc(c.openTime)} | ${local(candleCloseTime(c.openTime, 'H1'))} | ${p(c.open)} | ${p(c.high)} | ${p(c.low)} | ${p(c.close)} | ${c.ask ? p(c.ask.close) : '—'} | ${c.tickCount ?? '—'} |`);
  }
  lines.push('');

  lines.push('## Warm-up', '');
  lines.push(`Signals need ${warmup} prior candles (\`indicators.warmupCandles\`).`, '');
  const evalCol = args.evalStart ? ` Candles before ${args.evalStart} |` : '';
  lines.push(`| Timeframe | Candles | First evaluable candle (open, UTC) |${evalCol}`, `|---|---|---|${args.evalStart ? '---|' : ''}`);
  for (const w of warmupRows) {
    const first = w.firstEvaluable ? utc(w.firstEvaluable.openTime) : `not enough data (need > ${warmup})`;
    const before = w.before === null ? '' : ` ${w.before} ${w.before >= warmup ? '✓' : '✗'} |`;
    lines.push(`| ${w.tf} | ${w.count.toLocaleString('en-US')} | ${first} |${before}`);
  }
  lines.push('');

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${lines.join('\n')}\n`);
  process.stdout.write(`Verdict: ${verdict}\nReport: ${args.out}\n`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exitCode = 2;
});
