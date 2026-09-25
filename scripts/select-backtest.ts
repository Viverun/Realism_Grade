/**
 * V1.1 daily-selector backtests (docs/v1/selection-v1_1.md).
 *
 *   --mode frequency  alerts/day, misses, tier and timeframe mix only — NO outcome metrics, so it
 *                     can run on any period without spending a holdout.
 *   --mode grid       the pre-declared 12-configuration design grid, with outcomes. Run ONLY on the
 *                     design period (--end = holdout start).
 *   --mode holdout    one frozen configuration (--variant) over design + holdout, compared with V1
 *                     on the holdout, with the quality gate (§5).
 *   --mode evaluate   one configuration (--variant) over the whole period: by year, by timeframe,
 *                     and split at --holdout-start. Descriptive; not a fresh out-of-sample test.
 *
 *   tsx scripts/select-backtest.ts <files…> --end <ISO, exclusive> --mode frequency|grid|holdout
 *     [--variant NAME] [--holdout-start ISO] [--out report.md] [--config config/v1.yaml]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { configHash, loadConfig } from '../src/config/load.js';
import { TIMEFRAMES } from '../src/core/timeframe.js';
import { runTimeframe } from '../src/backtest/runner.js';
import { buildCandidateStream, runSelection, type SelectionRun } from '../src/backtest/selection-runner.js';
import { summariseSelection, type OutcomeBlock, type SelectionSummary } from '../src/backtest/selection-summary.js';
import { selectionGrid, selectionVariant } from '../src/backtest/selection-variants.js';
import { bootstrapMeanDiff, meanInterval, type Interval } from '../src/backtest/summary.js';
import { TickStore } from '../src/backtest/tick-store.js';
import { buildVariants } from '../src/backtest/variants.js';

type Mode = 'frequency' | 'grid' | 'holdout' | 'evaluate';

function parseArgs(argv: string[]) {
  const args = { files: [] as string[], endIso: '', mode: 'frequency' as Mode, variant: null as string | null, holdoutStart: null as string | null, out: '', config: 'config/v1.yaml' };
  for (let k = 0; k < argv.length; k++) {
    const arg = argv[k]!;
    const value = (): string => {
      const v = argv[++k];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    if (arg === '--end') args.endIso = value();
    else if (arg === '--mode') args.mode = value() as Mode;
    else if (arg === '--variant') args.variant = value();
    else if (arg === '--holdout-start') args.holdoutStart = value();
    else if (arg === '--out') args.out = value();
    else if (arg === '--config') args.config = value();
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else args.files.push(arg);
  }
  if (!args.files.length || !args.endIso) throw new Error('Usage: select-backtest <files…> --end <ISO> --mode frequency|grid|holdout');
  if (!['frequency', 'grid', 'holdout', 'evaluate'].includes(args.mode)) throw new Error(`Unknown mode ${args.mode}`);
  if (args.mode === 'evaluate' && (!args.variant || !args.holdoutStart)) throw new Error('evaluate mode needs --variant and --holdout-start (the split date)');
  if (args.mode === 'holdout' && (!args.variant || !args.holdoutStart)) throw new Error('holdout mode needs --variant and --holdout-start');
  args.out ||= `docs/backtest/v1_1-${args.mode}.md`;
  args.files.sort();
  return args;
}

const fixed = (v: number, d: number): string => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);
const ci = (i: Interval, d = 2, percent = false): string => {
  if (i.value === null) return '—';
  const f = (v: number): string => (percent ? `${fixed(100 * v, 0)}%` : fixed(v, d));
  return i.low === null || i.high === null ? `${f(i.value)} (n=${i.n})` : `${f(i.value)} [${f(i.low)}, ${f(i.high)}] (n=${i.n})`;
};
const pct = (v: number | null): string => (v === null ? '—' : `${(100 * v).toFixed(1)}%`);
const share = (n: number, of: number): string => (of ? `${n} (${((100 * n) / of).toFixed(0)}%)` : '0');

function frequencyRows(summaries: SelectionSummary[]): string[] {
  const L = ['| Configuration | Trading days | Alerts / day | Missed slots | Immediate / fallback | Tier A / B / C / D | Counter-trend | Timeframes |', '|---|---|---|---|---|---|---|---|'];
  for (const s of summaries) {
    const tf = TIMEFRAMES.filter((t) => s.timeframes[t]).map((t) => `${t} ${s.timeframes[t]}`).join(', ');
    L.push(`| ${s.name} | ${s.tradingDays} | ${s.alertsPerDay.toFixed(2)} | ${s.missed} | ${s.immediate} / ${s.fallback} | ${s.tiers.A} / ${s.tiers.B} / ${s.tiers.C} / ${s.tiers.D} | ${share(s.counterTrend, s.alerts)} | ${tf} |`);
  }
  return L;
}

function outcomeRow(label: string, o: OutcomeBlock): string {
  return `| ${label} | ${o.alerts} | ${o.filled} | ${pct(o.fillRate)} | ${o.target} / ${o.stop} / ${o.open} | ${ci(o.targetShare, 0, true)} | ${ci(o.expectancyR)} | ${ci(o.expectancyPerAlertR)} |`;
}
const OUTCOME_HEAD = ['| Scope | Alerts | Filled | Fill rate | +2R / −1R / open | +2R share | Expectancy R / filled trade | R / alert |', '|---|---|---|---|---|---|---|---|'];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const base = await loadConfig(args.config);
  const endMs = Date.parse(args.endIso);
  const t0 = Date.now();
  const { store, summary: load } = await TickStore.load(args.files, base.instrument.digits, { endMs });
  const candles = store.buildCandles(endMs);
  process.stderr.write(`loaded ${load.ticks.toLocaleString('en-US')} ticks in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

  const variants = args.mode === 'holdout' || args.mode === 'evaluate' ? [selectionVariant(base, args.variant!)] : selectionGrid(base);
  const stream = buildCandidateStream(candles, variants[0]!.config, TIMEFRAMES);
  const runs: SelectionRun[] = variants.map((v) => runSelection(v.name, stream, store, v.config, endMs));
  process.stderr.write(`ran ${runs.length} selection runs in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

  const L: string[] = [];
  const dataLine = `Data: ${load.files.map((f) => `\`${basename(f)}\``).join(', ')}. ${load.ticks.toLocaleString('en-US')} ticks, ${new Date(load.firstTime!).toISOString().slice(0, 10)} → ${new Date(load.lastTime!).toISOString().slice(0, 10)}; cut-off (exclusive) ${args.endIso}. ${load.reordered.length} file(s) reordered by day blocks.`;
  const banner = '> **V1.1 daily selector (D9): exactly 3 alerts per trading day, one per slot.** Tier A = all four of Ahmad\'s rules (a real V1 signal); B/C/D meet 3/2/≤1 of them and are **not** PDF setups. Counter-trend alerts fail Rule 1 ("never trade against the trend"). Buy Limit only (D7).';

  if (args.mode === 'frequency') {
    L.push('# V1.1 daily selector — frequency check', '', banner, '');
    L.push('> **Frequency only.** This report deliberately contains **no outcome metrics**, so it does not spend any holdout data. Outcomes are evaluated only by the pre-declared design grid and the one-time holdout run.', '');
    L.push(dataLine, '');
    L.push(...frequencyRows(runs.map((r) => summariseSelection(r))), '');
  }

  if (args.mode === 'grid') {
    const summaries = runs.map((r) => summariseSelection(r));
    const ranked = [...summaries].sort((a, b) => (b.overall.expectancyR.value ?? -Infinity) - (a.overall.expectancyR.value ?? -Infinity));
    L.push('# V1.1 daily selector — design grid', '', banner, '');
    L.push(`> **Design period only.** ${dataLine} Selection rule (pre-declared): highest expectancy per filled trade.`, '');
    L.push('## Frequency', '', ...frequencyRows(summaries), '');
    L.push('## Outcomes (Buy Limit), ranked by expectancy per filled trade', '', ...OUTCOME_HEAD);
    for (const s of ranked) L.push(outcomeRow(s.name, s.overall));
    L.push('', `**Chosen by the pre-declared rule:** \`${ranked[0]!.name}\` (config hash \`${configHash(variants.find((v) => v.name === ranked[0]!.name)!.config)}\`). Differences between neighbouring configurations are mostly within noise.`, '');
    L.push('## By tier (chosen configuration)', '', ...OUTCOME_HEAD);
    for (const tier of ['A', 'B', 'C', 'D'] as const) L.push(outcomeRow(`Tier ${tier}`, ranked[0]!.byTier[tier]));
    L.push('');
  }

  if (args.mode === 'holdout') {
    const split = Date.parse(args.holdoutStart!);
    const run = runs[0]!;
    const design = summariseSelection(run, -Infinity, split);
    const hold = summariseSelection(run, split);
    // V1 baseline ("today"): approved defaults, Buy Limit, on each timeframe, holdout period only.
    const v1 = buildVariants(base).find((v) => v.name === 'default')!;
    const baseline = (['M15', 'M30', 'H1'] as const).map((tf) => {
      const r = runTimeframe(store, candles[tf], tf, v1);
      const rValues = r.alerts
        .filter((a) => a.alertStatus === 'emailed' && a.decision.closeTime >= split && a.execution?.status === 'filled')
        .map((a) => a.outcome?.rMultiple)
        .filter((v): v is number => v != null);
      return { tf, rValues, expectancy: meanInterval(rValues) };
    });
    const m30 = baseline.find((b) => b.tf === 'M30')!;
    const diff = bootstrapMeanDiff(hold.overall.rValues, m30.rValues);
    const clearlyWorse = diff.high !== null && diff.high < 0;

    L.push('# V1.1 daily selector — holdout test', '', banner, '');
    L.push(`> **One-time holdout.** Frozen configuration \`${run.name}\` (hash \`${run.configHash}\`), chosen on the design period before this run. Holdout starts **${args.holdoutStart}**. ${dataLine}`, '');
    L.push(`## Gate: **${clearlyWorse ? 'FAIL — clearly worse than V1' : 'PASS — not clearly worse than V1'}**`, '');
    L.push(`Difference in expectancy per filled trade on the holdout, V1.1 − V1 (M30): **${ci(diff)}** (percentile bootstrap, 10,000 resamples, fixed seed). The gate fails only if the whole interval is below 0. Passing means "not clearly worse", **not** "profitable".`, '');
    L.push('## Frequency', '', ...frequencyRows([{ ...design, name: `design (< ${args.holdoutStart})` }, { ...hold, name: `holdout (≥ ${args.holdoutStart})` }]), '');
    L.push('## Outcomes (Buy Limit)', '', ...OUTCOME_HEAD);
    L.push(outcomeRow('V1.1 design period', design.overall));
    L.push(outcomeRow('**V1.1 holdout**', hold.overall));
    for (const tier of ['A', 'B', 'C', 'D'] as const) L.push(outcomeRow(`V1.1 holdout, tier ${tier}`, hold.byTier[tier]));
    L.push('', '**V1 baseline on the holdout (approved defaults, Buy Limit):**', '', '| Timeframe | Filled | Expectancy R / filled trade |', '|---|---|---|');
    for (const b of baseline) L.push(`| ${b.tf} | ${b.rValues.length} | ${ci(b.expectancy)} |`);
    L.push('');
  }

  if (args.mode === 'evaluate') {
    const split = Date.parse(args.holdoutStart!);
    const run = runs[0]!;
    const all = summariseSelection(run);
    const first = summariseSelection(run, -Infinity, split);
    const second = summariseSelection(run, split);
    const splitLabel = args.holdoutStart!.slice(0, 10);
    L.push(`# Evaluation — \`${run.name}\``, '');
    L.push("> **Ahmad's full setup only (D10).** Only alerts meeting all four PDF rules (tier A); no slot-end fallback, so no tier B/C/D alerts. Timeframes M5/M15/M30/H1, one alert per slot, at most 3 per trading day. Buy Limit only (D7).", '');
    L.push(`> **Not a fresh out-of-sample test.** The ${splitLabel} → end period was the V1.1 holdout, and tier-A results on it were already seen (docs/backtest/v1_1-findings.md). This run is descriptive: the full history, by year and by timeframe. A genuinely new test needs new data, e.g. paper trading forward.`, '');
    L.push(dataLine, `Config hash \`${run.configHash}\`.`, '');
    L.push('## Frequency', '', '| Period | Trading days | Alerts / day | Alerts / week | Slots with no full setup | Missed (Ask check) |', '|---|---|---|---|---|---|');
    for (const [label, s] of [['All', all], [`< ${splitLabel}`, first], [`≥ ${splitLabel}`, second]] as const) {
      L.push(`| ${label} | ${s.tradingDays} | ${s.alertsPerDay.toFixed(2)} | ${(s.alertsPerDay * 5).toFixed(2)} | ${s.noSetup} | ${s.missed} |`);
    }
    L.push('', '## Outcomes (Buy Limit)', '', ...OUTCOME_HEAD);
    L.push(outcomeRow('All', all.overall), outcomeRow(`< ${splitLabel}`, first.overall), outcomeRow(`≥ ${splitLabel} (already seen)`, second.overall));
    L.push('', '## By year', '', ...OUTCOME_HEAD);
    const years = [...new Set(run.alerts.map((a) => a.selection.date.slice(0, 4)))].sort();
    for (const y of years) {
      const from = Date.parse(`${y}-01-01T00:00:00+04:00`);
      const to = Date.parse(`${Number(y) + 1}-01-01T00:00:00+04:00`);
      L.push(outcomeRow(y, summariseSelection(run, from, to).overall));
    }
    L.push('', '## By timeframe', '', ...OUTCOME_HEAD);
    for (const tf of TIMEFRAMES) {
      const sub = { ...run, alerts: run.alerts.filter((a) => a.selection.candidate?.decision.timeframe === tf) };
      L.push(outcomeRow(tf, summariseSelection(sub).overall));
    }
    L.push('');
  }

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${L.join('\n')}\n`);
  process.stdout.write(`Report: ${args.out}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exitCode = 1;
});
