/**
 * Preliminary V1 backtest over Exness tick files (spec §11).
 *
 *   npm run backtest -- docs/data/Exness_EURUSD_2026_0?.zip --end 2026-09-25T00:00:00Z \
 *     [--out docs/backtest/2026-preliminary.md] [--json data/backtest/2026.json] [--config config/v1.yaml]
 *
 * --end is EXCLUSIVE (UTC). Files are read in name order; overlapping ticks are dropped.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { configHash, loadConfig } from '../src/config/load.js';
import { formatPoints } from '../src/core/price.js';
import { TIMEFRAMES } from '../src/core/timeframe.js';
import { makeLocalClock } from '../src/core/timezone.js';
import { runTimeframe, type TimeframeRun } from '../src/backtest/runner.js';
import { summarise, type Distribution, type RunSummary } from '../src/backtest/summary.js';
import { TickStore } from '../src/backtest/tick-store.js';
import { buildVariants } from '../src/backtest/variants.js';

interface Args {
  files: string[];
  endIso: string;
  startIso: string | null;
  out: string;
  json: string | null;
  config: string;
  title: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { files: [], endIso: '', startIso: null, out: 'docs/backtest/preliminary.md', json: null, config: 'config/v1.yaml', title: 'Preliminary backtest' };
  for (let k = 0; k < argv.length; k++) {
    const arg = argv[k]!;
    const value = (): string => {
      const v = argv[++k];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    if (arg === '--end') args.endIso = value();
    else if (arg === '--start') args.startIso = value();
    else if (arg === '--out') args.out = value();
    else if (arg === '--json') args.json = value();
    else if (arg === '--config') args.config = value();
    else if (arg === '--title') args.title = value();
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else args.files.push(arg);
  }
  if (!args.files.length || !args.endIso) throw new Error('Usage: backtest <files…> --end <ISO, exclusive> [--out report.md]');
  args.files.sort();
  return args;
}

const iso = (ms: number | null): string => (ms === null ? '—' : new Date(ms).toISOString().replace(':00.000Z', 'Z'));
const n = (v: number | null | undefined, digits = 1): string => (v === null || v === undefined ? '—' : v.toFixed(digits));
const pct = (v: number | null): string => (v === null ? '—' : `${(100 * v).toFixed(1)}%`);
const dist = (d: Distribution, digits = 1): string => (d.n ? `${n(d.median, digits)} / ${n(d.mean, digits)} (n=${d.n})` : '—');

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadConfig(args.config);
  const endMs = Date.parse(args.endIso);
  const startMs = args.startIso ? Date.parse(args.startIso) : undefined;
  if (Number.isNaN(endMs)) throw new Error(`Invalid --end ${args.endIso}`);

  const t0 = Date.now();
  const { store, summary: load } = await TickStore.load(args.files, config.instrument.digits, {
    endMs,
    ...(startMs !== undefined ? { startMs } : {}),
  });
  process.stderr.write(`loaded ${load.ticks.toLocaleString('en-US')} ticks in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  const candles = store.buildCandles(endMs);

  const variants = buildVariants(config);
  const runs: TimeframeRun[] = [];
  const summaries: RunSummary[] = [];
  for (const variant of variants) {
    for (const tf of TIMEFRAMES) {
      const run = runTimeframe(store, candles[tf], tf, variant);
      runs.push(run);
      summaries.push(summarise(run, config.alerts.timezone));
    }
  }
  process.stderr.write(`ran ${runs.length} variant×timeframe runs in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  const local = makeLocalClock(config.alerts.timezone);
  const byVariant = (name: string): RunSummary[] => summaries.filter((s) => s.variant === name);
  const L: string[] = [];
  L.push(`# ${args.title}`, '');
  L.push('> **PRELIMINARY — NOT CONCLUSIVE PERFORMANCE EVIDENCE.** This run validates the data pipeline, the strategy implementation, no-look-ahead behaviour and signal generation, and gives first indications only. The dataset covers **part of one calendar year** (see Dataset), includes the indicator warm-up, and is a single market regime. It is not a full 12-month test.', '');
  L.push(`Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/backtest.ts\`. Default config hash \`${configHash(config)}\`.`, '');

  L.push('## Dataset', '');
  L.push(`- **Files (${load.files.length}):** ${load.files.map((f) => `\`${basename(f)}\``).join(', ')}`);
  L.push(`- **Ticks used:** ${load.ticks.toLocaleString('en-US')}, ${iso(load.firstTime)} → ${iso(load.lastTime)} (UTC). End cut-off (exclusive): **${args.endIso}**.`);
  L.push(`- **Dropped:** ${load.dropped.atOrAfterEnd.toLocaleString('en-US')} at/after the cut-off, ${load.dropped.beforeStart.toLocaleString('en-US')} before start, ${load.dropped.outOfOrder.toLocaleString('en-US')} out-of-order/overlapping.`);
  L.push(`- **Candles:** ${TIMEFRAMES.map((tf) => `${tf} ${candles[tf].length.toLocaleString('en-US')}`).join(', ')} (Bid OHLC, closed candles only).`);
  L.push(`- **Warm-up:** the first ${config.indicators.warmupCandles} candles of each timeframe are used only to seed the indicators, so each timeframe's evaluation starts later:`, '');
  L.push('| Timeframe | First evaluated candle (UTC open) | Last evaluated candle | Evaluated candles | Trading days in window |', '|---|---|---|---|---|');
  for (const s of byVariant('default')) L.push(`| ${s.timeframe} | ${iso(s.firstEvaluatedOpen)} | ${iso(s.lastEvaluatedOpen)} | ${s.evaluated.toLocaleString('en-US')} | ${s.tradingDays} |`);
  L.push('');

  L.push('## Default configuration — results by timeframe', '');
  L.push('Execution model (spec §11): the Buy Limit is checked against the Ask at send time, then the daily cap / dedup / cooldown apply, then the trader places it after a simulated delay; it fills if the Ask reaches the entry before the next candle closes. Outcomes use only ticks after the fill. "+2R before −1R" uses the recommended stop; it is a research metric, **not a win rate**.', '');
  const head = ['Metric', ...byVariant('default').map((s) => s.timeframe)];
  const row = (label: string, f: (s: RunSummary) => string): string => `| ${label} | ${byVariant('default').map(f).join(' | ')} |`;
  L.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`);
  L.push(row('Signals (all four rules, in window)', (s) => String(s.signals)));
  L.push(row('Signals per trading day', (s) => n(s.signalsPerDay, 2)));
  L.push(row('Rejected at send (entry ≥ Ask)', (s) => String(s.alertStatus.entry_not_below_market ?? 0)));
  L.push(row('Cooldown / capped', (s) => `${s.alertStatus.cooldown ?? 0} / ${s.alertStatus.capped ?? 0}`));
  L.push(row('Emailed', (s) => String(s.emailed)));
  L.push(row('Emailed per trading day', (s) => n(s.emailedPerDay, 2)));
  L.push(row('Invalid at placement / expired / filled', (s) => `${s.execution.invalid_at_placement ?? 0} / ${s.execution.expired ?? 0} / ${s.filled}`));
  L.push(row('Fill rate (of emailed)', (s) => pct(s.fillRate)));
  L.push(row('+2R first / −1R first / unresolved', (s) => `${s.twoR.target ?? 0} / ${s.twoR.stop ?? 0} / ${s.twoR.open ?? 0}`));
  L.push(row('+2R share of resolved', (s) => pct(s.targetShareOfResolved)));
  L.push(row('Stop distance, pips (median / mean)', (s) => dist(s.riskPips)));
  L.push(row('Realized R on stops (median / mean)', (s) => dist(s.stopRealizedR, 2)));
  L.push(row('Stops that slipped / max slippage (pips)', (s) => `${s.slippedStops} / ${n(s.stopSlippagePips.max)}`));
  L.push(row('Lots (median), raised to min lot', (s) => `${n(s.lots.median, 2)}, ${s.raisedToMinLot}`));
  L.push(row('RSI branch (recovery / above-mid)', (s) => `${s.rsiBranches.recovery ?? 0} / ${s.rsiBranches.above_mid ?? 0}`));
  L.push(row('Pattern (pin / engulfing / both)', (s) => `${s.patterns.pin_bar ?? 0} / ${s.patterns.engulfing ?? 0} / ${s.patterns.both ?? 0}`));
  L.push('');

  L.push('### Rule funnel (default, evaluated in-window candles)', '');
  L.push('| Timeframe | In window | + Trend | + Pullback | + RSI | + Candle (signal) | Trend alone | Pullback alone | RSI alone | Candle alone |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const s of byVariant('default')) {
    const f = s.funnel;
    L.push(`| ${s.timeframe} | ${f.inWindow.toLocaleString('en-US')} | ${f.trend} | ${f.trendPullback} | ${f.trendPullbackRsi} | ${f.allFour} | ${pct(s.ruleRates.trend)} | ${pct(s.ruleRates.pullback)} | ${pct(s.ruleRates.rsi)} | ${pct(s.ruleRates.candle)} |`);
  }
  L.push('');

  L.push('### Post-fill price movement (default), pips — median / mean', '');
  for (const s of byVariant('default')) {
    if (!s.horizons.length) continue;
    L.push(`**${s.timeframe}**`, '', '| Horizon (candles) | Return | MFE | MAE |', '|---|---|---|---|');
    for (const h of s.horizons) L.push(`| ${h.candles} | ${dist(h.returnPips)} | ${dist(h.mfePips)} | ${dist(h.maePips)} |`);
    L.push('');
  }

  L.push('## Variant comparison (one change at a time)', '');
  for (const tf of TIMEFRAMES) {
    L.push(`### ${tf}`, '', '| Variant | Signals | Emailed | Filled | Fill rate | +2R / −1R / open | +2R share | Median stop (pips) |', '|---|---|---|---|---|---|---|---|');
    for (const v of variants) {
      const s = summaries.find((x) => x.variant === v.name && x.timeframe === tf)!;
      L.push(`| ${v.name} | ${s.signals} | ${s.emailed} | ${s.filled} | ${pct(s.fillRate)} | ${s.twoR.target ?? 0} / ${s.twoR.stop ?? 0} / ${s.twoR.open ?? 0} | ${pct(s.targetShareOfResolved)} | ${n(s.riskPips.median)} |`);
    }
    L.push('');
  }
  L.push('Variants:', '');
  for (const v of variants) L.push(`- \`${v.name}\`: ${v.description}`);
  L.push('');

  L.push('## Emailed alerts (default, H1)', '');
  const h1 = runs.find((r) => r.variant === 'default' && r.timeframe === 'H1');
  const emailed = h1?.alerts.filter((a) => a.alertStatus === 'emailed') ?? [];
  if (!emailed.length) L.push('None.');
  else {
    L.push('| Signal close (Dubai) | Pattern | RSI branch | Entry | Rec. stop | Lots | Planned risk | Execution | +2R/−1R | Realized R |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const a of emailed.slice(0, 60)) {
      const p = a.decision.plan!;
      const d = config.instrument.digits;
      const c = local(a.decision.closeTime);
      L.push(`| ${c.date} ${String(Math.floor(c.minuteOfDay / 60)).padStart(2, '0')}:${String(c.minuteOfDay % 60).padStart(2, '0')} | ${a.decision.candle.patterns.join('+')} | ${a.decision.rsiCheck.branch} | ${formatPoints(p.entry, d)} | ${formatPoints(p.refSl, d)} | ${p.sizing.lots.toFixed(2)} | $${p.sizing.plannedRiskUsd.toFixed(2)} (${p.sizing.plannedRiskPct.toFixed(2)}%) | ${a.execution?.status ?? '—'} | ${a.outcome?.twoR ?? '—'} | ${a.outcome?.realizedR == null ? '—' : a.outcome.realizedR.toFixed(2)} |`);
    }
    if (emailed.length > 60) L.push('', `…and ${emailed.length - 60} more (see the JSON output).`);
  }
  L.push('');

  L.push('## Caveats', '');
  L.push('- **Partial year, one regime.** Results come from part of 2026 only, after warm-up. They are not a full 12-month test and are not conclusive performance evidence.');
  L.push('- **Indicative data.** Exness describes its tick history as indicative. Execution on a live Standard account can differ.');
  L.push('- **No price improvement is modelled** on Buy Limit fills, and the trader is assumed to place the order after the configured delay exactly as emailed.');
  L.push('- **Planned vs realized risk.** Stops exit at the first Bid at or below the stop, so gap slippage is included; commission is 0 per the Standard USD config.');
  L.push('- **Variants are one-at-a-time** around the approved defaults. Looking at many variants on the same short dataset invites overfitting; treat differences as hypotheses.');
  L.push('- **The 2026-09-25 file is excluded** by the cut-off; it is the separate one-day loader-validation file.');
  L.push('');

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${L.join('\n')}\n`);
  if (args.json) {
    await mkdir(dirname(args.json), { recursive: true });
    const alerts = runs.flatMap((r) => r.alerts.map((a) => ({ variant: r.variant, timeframe: r.timeframe, ...a })));
    await writeFile(args.json, JSON.stringify({ load, summaries, alerts }, null, 1));
  }
  process.stdout.write(`Report: ${args.out}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exitCode = 1;
});
