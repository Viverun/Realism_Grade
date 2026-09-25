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
import { summarise, type Distribution, type Interval, type RunSummary } from '../src/backtest/summary.js';
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
const fixed = (v: number, digits: number): string => (Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v).toFixed(digits);
const n = (v: number | null | undefined, digits = 1): string => (v === null || v === undefined ? '—' : fixed(v, digits));
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
      summaries.push(summarise(run, config.alerts.timezone));
      // Per-candle decisions are only needed for the summary; releasing them keeps a
      // multi-year run (M5 over a decade × every variant) within the heap.
      runs.push({ ...run, decisions: [] });
    }
  }
  process.stderr.write(`ran ${runs.length} variant×timeframe runs in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  const local = makeLocalClock(config.alerts.timezone);
  const primary = variants.filter((v) => v.entryModel === 'buy_limit');
  const get = (variant: string, tf: string): RunSummary => summaries.find((x) => x.variant === variant && x.timeframe === tf)!;
  const def = TIMEFRAMES.map((tf) => get('default', tf));
  const spanDays = load.firstTime !== null && load.lastTime !== null ? (load.lastTime - load.firstTime) / 86_400_000 : 0;
  const ci = (i: Interval, digits = 2, percent = false): string => {
    if (i.value === null) return '—';
    const f = (v: number): string => (percent ? `${fixed(100 * v, 0)}%` : fixed(v, digits));
    return i.low === null || i.high === null ? `${f(i.value)} (n=${i.n})` : `${f(i.value)} [${f(i.low)}, ${f(i.high)}] (n=${i.n})`;
  };

  const L: string[] = [];
  L.push(`# ${args.title}`, '');
  L.push(
    spanDays < 365
      ? '> **PRELIMINARY — NOT CONCLUSIVE PERFORMANCE EVIDENCE.** The dataset covers **part of one calendar year** only. It validates the pipeline, the strategy implementation, no-look-ahead behaviour and signal generation, and gives first indications only.'
      : '> **RESEARCH BACKTEST — NOT A GUARANTEE OF FUTURE PERFORMANCE.** Indicative broker tick data, a deterministic rules engine and a simulated manual execution. Small samples per timeframe: read the confidence intervals, not the point estimates.',
    '',
  );
  L.push('> **Evidence hierarchy (owner decision, 2026-09-25):** the **Buy Limit** results are the **primary evidence** for timeframe and strategy decisions, because production V1 is Buy Limit only. The PDF market-entry baseline is a **secondary diagnostic** (§ Secondary diagnostic) and is never used on its own to choose a timeframe or strategy.', '');
  L.push(`Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/backtest.ts\`. Default config hash \`${configHash(config)}\`.`, '');

  L.push('## Dataset', '');
  L.push(`- **Files (${load.files.length}):** ${load.files.map((f) => `\`${basename(f)}\``).join(', ')}`);
  L.push(`- **Ticks used:** ${load.ticks.toLocaleString('en-US')}, ${iso(load.firstTime)} → ${iso(load.lastTime)} (UTC), about ${(spanDays / 30.44).toFixed(1)} months. End cut-off (exclusive): **${args.endIso}**.`);
  L.push(`- **Dropped:** ${load.dropped.atOrAfterEnd.toLocaleString('en-US')} at/after the cut-off, ${load.dropped.beforeStart.toLocaleString('en-US')} before start, ${load.dropped.outOfOrder.toLocaleString('en-US')} out-of-order/overlapping.`);
  L.push(`- **Candles:** ${TIMEFRAMES.map((tf) => `${tf} ${candles[tf].length.toLocaleString('en-US')}`).join(', ')} (Bid OHLC, closed candles only). The first ${config.indicators.warmupCandles} candles of each timeframe only seed the indicators.`, '');
  L.push('| Timeframe | First evaluated candle (UTC open) | Last evaluated candle | Evaluated candles | Trading days in window |', '|---|---|---|---|---|');
  for (const s of def) L.push(`| ${s.timeframe} | ${iso(s.firstEvaluatedOpen)} | ${iso(s.lastEvaluatedOpen)} | ${s.evaluated.toLocaleString('en-US')} | ${s.tradingDays} |`);
  L.push('');

  L.push('## Timeframe comparison — Buy Limit (primary evidence)', '');
  L.push('Default configuration. The live V1 timeframe is **not locked**; it is to be chosen by comparing these Buy Limit results across 15m, 30m and 1H: signal frequency together with outcome metrics.', '');
  L.push('Execution model (spec §11):', '');
  L.push('1. The Buy Limit is checked against the Ask at send time.');
  L.push('2. The cap, dedup and cooldown are applied.');
  L.push('3. The trader places the order after the configured delay.');
  L.push('4. It fills if the Ask reaches the entry before the next candle closes.', '');
  L.push('Outcome definitions:', '');
  L.push('- **+2R share:** of trades that resolved, the share reaching +2R before the recommended stop. Break-even at 1:2 is about 33%. It is **not a win rate**.');
  L.push('- **Expectancy:** mean R per filled trade. Target = +2, stop = realized R (slippage included), unresolved = marked to market at the longest horizon.');
  L.push('- **Per alert:** the same, but counting unfilled alerts as 0 R.');
  L.push('- Brackets are **95% intervals**.', '');
  const head = ['Metric', ...def.map((s) => s.timeframe)];
  const row = (label: string, f: (s: RunSummary) => string): string => `| ${label} | ${def.map(f).join(' | ')} |`;
  L.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`);
  L.push(row('**Frequency**', () => ''));
  L.push(row('Trading days evaluated', (s) => String(s.tradingDays)));
  L.push(row('Signals per trading day', (s) => n(s.signalsPerDay, 2)));
  L.push(row('Emailed alerts per week', (s) => n(s.emailedPerWeek, 2)));
  L.push(row('Filled trades per week', (s) => n(s.filledPerWeek, 2)));
  L.push(row('**Funnel**', () => ''));
  L.push(row('Signals → emailed', (s) => `${s.signals} → ${s.emailed}`));
  L.push(row('Rejected at send (entry ≥ Ask) / cooldown / capped', (s) => `${s.alertStatus.entry_not_below_market ?? 0} / ${s.alertStatus.cooldown ?? 0} / ${s.alertStatus.capped ?? 0}`));
  L.push(row('Invalid at placement / expired / filled', (s) => `${s.execution.invalid_at_placement ?? 0} / ${s.execution.expired ?? 0} / ${s.filled}`));
  L.push(row('Fill rate (of emailed)', (s) => pct(s.fillRate)));
  L.push(row('**Outcomes (filled trades)**', () => ''));
  L.push(row('+2R first / −1R first / unresolved', (s) => `${s.twoR.target ?? 0} / ${s.twoR.stop ?? 0} / ${s.twoR.open ?? 0}`));
  L.push(row('+2R share of resolved', (s) => ci(s.targetShare, 0, true)));
  L.push(row('Expectancy, R per filled trade', (s) => ci(s.expectancyR)));
  L.push(row('Expectancy, R per emailed alert', (s) => ci(s.expectancyPerAlertR)));
  L.push(row('Stop distance, pips (median / mean)', (s) => dist(s.riskPips)));
  L.push(row('Realized R on stops (median / mean)', (s) => dist(s.stopRealizedR, 2)));
  L.push(row('Stops that slipped / max slippage (pips)', (s) => `${s.slippedStops} / ${n(s.stopSlippagePips.max)}`));
  L.push(row('Lots (median), raised to min lot', (s) => `${n(s.lots.median, 2)}, ${s.raisedToMinLot}`));
  L.push(row('**Signal mix**', () => ''));
  L.push(row('RSI branch (recovery / above-mid)', (s) => `${s.rsiBranches.recovery ?? 0} / ${s.rsiBranches.above_mid ?? 0}`));
  L.push(row('Pattern (pin / engulfing / both)', (s) => `${s.patterns.pin_bar ?? 0} / ${s.patterns.engulfing ?? 0} / ${s.patterns.both ?? 0}`));
  L.push('');

  L.push('### By year — Buy Limit, default', '');
  L.push('Stability check: a timeframe whose result depends on one year is weaker evidence.', '');
  L.push('| Timeframe | Year | Trading days | Signals | Emailed | Filled | +2R / −1R / open | +2R share | Expectancy R / filled trade |', '|---|---|---|---|---|---|---|---|---|');
  for (const s of def) {
    for (const y of s.byYear) {
      L.push(`| ${s.timeframe} | ${y.period} | ${y.tradingDays} | ${y.signals} | ${y.emailed} | ${y.filled} | ${y.target} / ${y.stop} / ${y.open} | ${ci(y.targetShare, 0, true)} | ${ci(y.expectancyR)} |`);
    }
  }
  L.push('');

  L.push('### Rule funnel (default, evaluated in-window candles)', '');
  L.push('| Timeframe | In window | + Trend | + Pullback | + RSI | + Candle (signal) | Trend alone | Pullback alone | RSI alone | Candle alone |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const s of def) {
    const f = s.funnel;
    L.push(`| ${s.timeframe} | ${f.inWindow.toLocaleString('en-US')} | ${f.trend} | ${f.trendPullback} | ${f.trendPullbackRsi} | ${f.allFour} | ${pct(s.ruleRates.trend)} | ${pct(s.ruleRates.pullback)} | ${pct(s.ruleRates.rsi)} | ${pct(s.ruleRates.candle)} |`);
  }
  L.push('');

  L.push('### Post-fill price movement (default Buy Limit), pips — median / mean', '');
  for (const s of def) {
    if (!s.horizons.length) continue;
    L.push(`**${s.timeframe}**`, '', '| Horizon (candles) | Return | MFE | MAE |', '|---|---|---|---|');
    for (const h of s.horizons) L.push(`| ${h.candles} | ${dist(h.returnPips)} | ${dist(h.mfePips)} | ${dist(h.maePips)} |`);
    L.push('');
  }

  L.push('## Buy Limit variants (one change at a time)', '');
  L.push('Sensitivity only. With these sample sizes, differences inside overlapping intervals are noise, and choosing the best-looking variant would overfit.', '');
  for (const tf of TIMEFRAMES) {
    L.push(`### ${tf}`, '', '| Variant | Signals | Emailed / week | Filled | Fill rate | +2R / −1R / open | +2R share | Expectancy R / filled trade |', '|---|---|---|---|---|---|---|---|');
    for (const v of primary) {
      const s = get(v.name, tf);
      L.push(`| ${v.name} | ${s.signals} | ${n(s.emailedPerWeek, 2)} | ${s.filled} | ${pct(s.fillRate)} | ${s.twoR.target ?? 0} / ${s.twoR.stop ?? 0} / ${s.twoR.open ?? 0} | ${ci(s.targetShare, 0, true)} | ${ci(s.expectancyR)} |`);
    }
    L.push('');
  }
  L.push('Variants:', '');
  for (const v of primary) L.push(`- \`${v.name}\`: ${v.description}`);
  L.push('');

  const baseline = variants.find((v) => v.entryModel === 'pdf_market');
  if (baseline) {
    L.push('## Secondary diagnostic — PDF market entry (not decision evidence)', '');
    L.push('Same signals, but entered as the PDF describes: a market buy at the next open, filled at the Ask. This is a **diagnostic only**, for spotting whether the Buy Limit systematically misses winners or catches losers (adverse selection). Production V1 is Buy Limit; do not choose a timeframe or strategy from this table.', '');
    L.push('| Timeframe | Entry | Filled | +2R / −1R / open | +2R share | Expectancy R / filled trade |', '|---|---|---|---|---|---|');
    for (const tf of TIMEFRAMES) {
      for (const [label, name] of [['Buy Limit (primary)', 'default'], ['PDF market (diagnostic)', baseline.name]] as const) {
        const s = get(name, tf);
        L.push(`| ${tf} | ${label} | ${s.filled} | ${s.twoR.target ?? 0} / ${s.twoR.stop ?? 0} / ${s.twoR.open ?? 0} | ${ci(s.targetShare, 0, true)} | ${ci(s.expectancyR)} |`);
      }
    }
    L.push('');
  }

  L.push('## Most recent emailed alerts (default, per timeframe)', '');
  for (const tf of TIMEFRAMES) {
    const run = runs.find((r) => r.variant === 'default' && r.timeframe === tf);
    const emailed = run?.alerts.filter((a) => a.alertStatus === 'emailed') ?? [];
    L.push(`### ${tf} (${emailed.length} emailed; last 15 shown)`, '');
    if (!emailed.length) {
      L.push('None.', '');
      continue;
    }
    L.push('| Signal close (Dubai) | Pattern | RSI | Entry | Rec. stop | Lots | Planned risk | Execution | Result | R |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const a of emailed.slice(-15)) {
      const p = a.decision.plan!;
      const d = config.instrument.digits;
      const c = local(a.decision.closeTime);
      L.push(`| ${c.date} ${String(Math.floor(c.minuteOfDay / 60)).padStart(2, '0')}:${String(c.minuteOfDay % 60).padStart(2, '0')} | ${a.decision.candle.patterns.join('+')} | ${a.decision.rsiCheck.branch} | ${formatPoints(p.entry, d)} | ${formatPoints(p.refSl, d)} | ${p.sizing.lots.toFixed(2)} | $${p.sizing.plannedRiskUsd.toFixed(2)} | ${a.execution?.status ?? '—'} | ${a.outcome?.twoR ?? '—'} | ${a.outcome?.rMultiple == null ? '—' : a.outcome.rMultiple.toFixed(2)} |`);
    }
    L.push('');
  }

  L.push('## Caveats', '');
  if (spanDays < 365) L.push('- **Partial year.** This is not a full 12-month test and is not conclusive performance evidence.');
  L.push('- **Indicative data.** Exness describes its tick history as indicative, so execution on a live Standard account can differ. The account variant must match the trading account.');
  L.push('- **Execution assumptions.** No price improvement on Buy Limit fills. The trader is assumed to place each order exactly as emailed after the configured delay, and to set the recommended stop.');
  L.push('- **Planned vs realized risk.** Stops exit at the first Bid at or below the stop, so gap slippage is included. Commission is 0 per the Standard USD config.');
  L.push('- **Multiple comparisons.** Many variants and three timeframes on the same data: treat the best-looking cell as a hypothesis to re-test, not a finding.');
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
