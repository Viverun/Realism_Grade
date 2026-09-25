/**
 * V1 diagnostic ablation report (DIAGNOSTIC ONLY; see src/backtest/ablation.ts).
 *
 *   tsx scripts/ablation.ts <tick files…> --end ISO [--out docs/backtest/v1-ablation.md] [--config config/v1.yaml]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { configHash, loadConfig } from '../src/config/load.js';
import type { Timeframe } from '../src/core/timeframe.js';
import { buildAblation, cellStats, RSI_VARIANTS, type AblationSample, type CellStats, type RsiVariant } from '../src/backtest/ablation.js';
import { TickStore } from '../src/backtest/tick-store.js';

const TFS: Timeframe[] = ['M15', 'M30', 'H1'];

function parseArgs(argv: string[]) {
  const a = { files: [] as string[], end: '', out: 'docs/backtest/v1-ablation.md', config: 'config/v1.yaml' };
  for (let k = 0; k < argv.length; k++) {
    const arg = argv[k]!;
    const value = (): string => argv[++k] ?? '';
    if (arg === '--end') a.end = value();
    else if (arg === '--out') a.out = value();
    else if (arg === '--config') a.config = value();
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else a.files.push(arg);
  }
  if (!a.files.length || !a.end) throw new Error('Usage: ablation.ts <files…> --end ISO');
  a.files.sort();
  return a;
}

type Pred = (s: AblationSample) => boolean;
const rsi = (v: RsiVariant = 'both35'): Pred => (s) => s.rsi[v];
const T: Pred = (s) => s.trend;
const P: Pred = (s) => s.pullback;
const C: Pred = (s) => s.candle;
const all = (...ps: Pred[]): Pred => (s) => ps.every((p) => p(s));

const f2 = (v: number | null): string => (v === null ? '—' : (Math.abs(v) < 0.005 ? 0 : v).toFixed(2));
const pc = (v: number | null): string => (v === null ? '—' : `${(100 * v).toFixed(0)}%`);
const ci = (c: CellStats): string => (c.meanR === null ? '—' : `${f2(c.meanR)} [${f2(c.low)}, ${f2(c.high)}]`);

const HEAD = [
  '| Set | Candles | / day | BL fill | BL filled | **BL R / fill [95%]** | BL median R | BL +2R share | BL MFE / MAE (R) | Market R / fill [95%] | Market +2R share |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
];

function row(label: string, set: AblationSample[], days: number): string {
  const l = cellStats(set, (s) => s.limit);
  const m = cellStats(set, (s) => s.market);
  return `| ${label} | ${set.length} | ${days ? (set.length / days).toFixed(2) : '—'} | ${pc(l.fillRate)} | ${l.filled} | **${ci(l)}** | ${f2(l.medianR)} | ${pc(l.targetShare)} | ${f2(l.mfeR)} / ${f2(l.maeR)} | ${ci(m)} | ${pc(m.targetShare)} |`;
}

const SHORT_HEAD = ['| Group | Candles | BL filled | **BL R / fill [95%]** | BL +2R share | Market R / fill [95%] |', '|---|---|---|---|---|---|'];
function shortRow(label: string, set: AblationSample[]): string {
  const l = cellStats(set, (s) => s.limit);
  const m = cellStats(set, (s) => s.market);
  return `| ${label} | ${set.length} | ${l.filled} | **${ci(l)}** | ${pc(l.targetShare)} | ${ci(m)} |`;
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const config = await loadConfig(a.config);
  const endMs = Date.parse(a.end);
  const t0 = Date.now();
  const { store, summary } = await TickStore.load(a.files, config.instrument.digits, { endMs });
  const candles = store.buildCandles(endMs);
  process.stderr.write(`loaded ${summary.ticks.toLocaleString('en-US')} ticks in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  const samples = buildAblation(store, candles, config, TFS);
  process.stderr.write(`${samples.length} samples in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

  const L: string[] = [];
  L.push('# V1 diagnostic ablation: where does performance go?', '');
  L.push('> **Diagnostic only.** This report does **not** modify, replace or re-tune the frozen **V1-baseline** (config hash `' + configHash(config) + '`), declares no new strategy, and selects no parameter. It is also not a basis for choosing the live timeframe (D8, deferred). The Jev benchmark (`config/jev-baseline-v1.json`) is untouched.', '');
  L.push(`Data: ${summary.files.length} Exness tick files (\`${basename(summary.files[0]!)}\` … \`${basename(summary.files.at(-1)!)}\`), ${summary.ticks.toLocaleString('en-US')} ticks, ${new Date(summary.firstTime!).toISOString().slice(0, 10)} → ${new Date(summary.lastTime!).toISOString().slice(0, 10)}.`, '');
  L.push('## Method', '');
  L.push('- **Unit:** every closed candle in the 08:00–23:00 Dubai window on a trading day, on 15m / 30m / 1H, that passes the rules of the row. Each is treated as an **independent hypothetical trade** with the unchanged V1 trade plan: Buy Limit at close − offset, the V1 reference stop, target +2R.');
  L.push('- **No cooldown or daily cap**, so consecutive candles overlap and can share one market move. Intervals are **clustered by day** to account for that. The last row of each ladder (all four rules) is therefore the V1 signal *before* cooldown/cap, and differs slightly from the V1 backtest (`2015-2026.md`).');
  L.push('- **BL = production Buy Limit** (send-time Ask check, 60 s placement, fill if the Ask reaches the entry before the next candle closes). **Market = the PDF next-open entry** filled at the Ask, a **diagnostic baseline only** (D7): never a basis for choosing a timeframe or strategy.');
  L.push('- **R:** +2 at the target, realized R at the stop (slippage included), open trades marked to market at the longest outcome horizon. **MFE/MAE:** best and worst excursion before the exit, in R. **+2R share** is of resolved trades; break-even ≈ 33%.');
  L.push('- **Multiple comparisons:** this report has well over 100 cells on the same data. A single cell with an interval above 0 is a hypothesis for new data, not a finding.', '');

  for (const tf of TFS) {
    const s = samples.filter((x) => x.timeframe === tf);
    const days = new Set(s.map((x) => Math.floor(x.closeTime / 86_400_000))).size;
    L.push(`## ${tf === 'H1' ? '1H' : tf === 'M30' ? '30m' : '15m'}`, '');
    L.push('### Ladder: adding the checks one by one', '', ...HEAD);
    L.push(row('1. Trend', s.filter(T), days));
    L.push(row('2. Trend + Pullback', s.filter(all(T, P)), days));
    L.push(row('3. Trend + Pullback + RSI', s.filter(all(T, P, rsi())), days));
    L.push(row('4. **All four (V1 signal, no cooldown/cap)**', s.filter(all(T, P, rsi(), C)), days));
    L.push('', '### Drop one check from the full set', '', ...HEAD);
    L.push(row('All four', s.filter(all(T, P, rsi(), C)), days));
    L.push(row('Without Trend', s.filter(all(P, rsi(), C)), days));
    L.push(row('Without Pullback', s.filter(all(T, rsi(), C)), days));
    L.push(row('Without RSI', s.filter(all(T, P, C)), days));
    L.push(row('Without Candle', s.filter(all(T, P, rsi())), days));
    L.push('', '### Setup vs fill: the market-entry result, split by whether the Buy Limit filled', '');
    L.push('If the Buy Limit fills mostly on the trades that go on to fail (adverse selection), the market result of *filled* candles is worse than that of *unfilled* ones.', '', '| Set | Buy Limit | Candles | Market R / fill [95%] | Market +2R share |', '|---|---|---|---|---|');
    for (const [label, pred] of [['Trend + Pullback', all(T, P)], ['All four', all(T, P, rsi(), C)]] as const) {
      const set = s.filter(pred);
      for (const [bl, sel] of [['filled', (x: AblationSample) => x.limit.status === 'filled'], ['not filled', (x: AblationSample) => x.limit.status !== 'filled']] as const) {
        const m = cellStats(set.filter(sel), (x) => x.market);
        L.push(`| ${label} | ${bl} | ${set.filter(sel).length} | ${ci(m)} | ${pc(m.targetShare)} |`);
      }
    }
    L.push('', '### RSI definitions (with Trend + Pullback + Candle)', '', ...HEAD);
    const rsiLabel: Record<RsiVariant, string> = {
      both35: 'Recovery ≤35 or >50 rising (V1 default)',
      both30: 'Recovery ≤30 or >50 rising (PDF oversold)',
      recovery35: 'Recovery from ≤35 only',
      recovery30: 'Recovery from ≤30 only',
      aboveMid: '>50 and rising only',
    };
    for (const v of RSI_VARIANTS) L.push(row(rsiLabel[v], s.filter(all(T, P, C, rsi(v))), days));
    L.push(row('No RSI check', s.filter(all(T, P, C)), days));
    const full = s.filter(all(T, P, rsi(), C));
    L.push('', '### Within the full V1 set', '', ...SHORT_HEAD);
    L.push(shortRow('RSI branch: recovery', full.filter((x) => x.rsiBranch === 'recovery')));
    L.push(shortRow('RSI branch: above 50', full.filter((x) => x.rsiBranch === 'above_mid')));
    L.push(shortRow('Candle: engulfing only', full.filter((x) => x.engulfing && !x.pinBar)));
    L.push(shortRow('Candle: pin bar only', full.filter((x) => x.pinBar && !x.engulfing)));
    L.push(shortRow('Candle: both', full.filter((x) => x.pinBar && x.engulfing)));
    const tp = s.filter(all(T, P));
    for (const [title, key, order] of [
      ['Session (UTC hour of close)', 'session', ['asia', 'london', 'overlap', 'new_york', 'late']],
      ['Volatility regime (20- vs 240-candle mean range: <0.8 low, >1.25 high)', 'vol', ['low', 'normal', 'high']],
      ['Trend strength ((EMA50 − EMA200) / 20-candle mean range: <1 weak, 1–3 moderate, ≥3 strong)', 'trendStrength', ['weak', 'moderate', 'strong']],
      ['Year', 'year', [...new Set(s.map((x) => x.year))].sort()],
    ] as const) {
      L.push('', `### ${title}`, '', '| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |', '|---|---|---|---|---|---|---|');
      for (const g of order as readonly (string | number)[]) {
        const a1 = tp.filter((x) => x[key as keyof AblationSample] === g);
        const a4 = full.filter((x) => x[key as keyof AblationSample] === g);
        const l1 = cellStats(a1, (x) => x.limit);
        const l4 = cellStats(a4, (x) => x.limit);
        L.push(`| ${g} | ${a1.length} | ${ci(l1)} | ${ci(cellStats(a1, (x) => x.market))} | ${a4.length} | **${ci(l4)}** | ${ci(cellStats(a4, (x) => x.market))} |`);
      }
    }
    L.push('');
  }
  await mkdir(dirname(a.out), { recursive: true });
  await writeFile(a.out, `${L.join('\n')}\n`);
  process.stdout.write(`Report: ${a.out}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exitCode = 1;
});
