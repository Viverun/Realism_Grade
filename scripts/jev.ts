/**
 * Jev research CLI (docs/v1/jev-research-spec.md, D11). Jev is shadow-only: nothing here
 * affects V1 decisions, alerts or emails.
 *
 *   tsx scripts/jev.ts probe
 *       GET /v1/models with JEV_API_KEY: checks key, network and the model's release date.
 *   tsx scripts/jev.ts fit-baseline <2015–2021 tick files…> [--out config/jev-baseline-v1.json]
 *       Fits the frozen logistic baseline on 2015–2021 only (§4).
 *   tsx scripts/jev.ts score <tick files…> --start ISO --end ISO [--log docs/jev/jev-log.jsonl]
 *       [--fake | --pilot] [--limit N] [--concurrency 4]
 *       --pilot: real API on candles ending at or before the primary window start, logged to
 *       jev-log.pilot.jsonl; an operational check, never evidence.
 *   tsx scripts/jev.ts pilot-report [--log docs/jev/jev-log.pilot.jsonl] [--out docs/jev/pilot.md]
 *       Operational summary of a pilot log (no outcomes, so nothing can be tuned on it).
 *       Scores every population candle closing in [start, end) that is not yet in the log.
 *       Include ~3 months of ticks before --start for indicator warm-up (H1 needs 1,000 candles).
 *   tsx scripts/jev.ts evaluate <tick files…> --end ISO [--log …] [--baseline …] [--out docs/jev/validation.md]
 *       Labels logged samples from ticks and computes the pre-registered metrics and verdict.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { AppConfig } from '../src/config/schema.js';
import { configHash, loadConfig } from '../src/config/load.js';
import { TickStore } from '../src/backtest/tick-store.js';
import { BATTERY, PRIMARY_QUESTION, PROMPT_HASH, renderState } from '../src/jev/battery.js';
import { FakeJudge, TypeSafeJudge, type JevJudge } from '../src/jev/client.js';
import { appendJevLog, readJevLog, type JevLogRecord } from '../src/jev/log.js';
import { fitLogistic, predictLogistic, type LogisticModel } from '../src/jev/logistic.js';
import { evaluate, fmt, type EvalSample } from '../src/jev/metrics.js';
import { buildPopulation, labelPlan, type Label, type Sample } from '../src/jev/population.js';
import { BASELINE_PERIOD, checkScoringRange, PROTOCOL, type ScoringMode } from '../src/jev/protocol.js';
import { DEGENERATE_SD, summarisePilot, type Spread } from '../src/jev/pilot.js';
import { featureNames, featureVector, SNAPSHOT_VERSION } from '../src/jev/snapshot.js';

interface Args {
  command: string;
  files: string[];
  start: string | null;
  end: string | null;
  log: string;
  baseline: string;
  out: string | null;
  config: string;
  fake: boolean;
  pilot: boolean;
  limit: number;
  concurrency: number;
}

function parseArgs(argv: string[]): Args {
  const [command = '', ...rest] = argv;
  const a: Args = { command, files: [], start: null, end: null, log: 'docs/jev/jev-log.jsonl', baseline: 'config/jev-baseline-v1.json', out: null, config: 'config/v1.yaml', fake: false, pilot: false, limit: Infinity, concurrency: 4 };
  for (let k = 0; k < rest.length; k++) {
    const arg = rest[k]!;
    const value = (): string => {
      const v = rest[++k];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    if (arg === '--start') a.start = value();
    else if (arg === '--end') a.end = value();
    else if (arg === '--log') a.log = value();
    else if (arg === '--baseline') a.baseline = value();
    else if (arg === '--out') a.out = value();
    else if (arg === '--config') a.config = value();
    else if (arg === '--fake') a.fake = true;
    else if (arg === '--pilot') a.pilot = true;
    else if (arg === '--limit') a.limit = Number(value());
    else if (arg === '--concurrency') a.concurrency = Math.max(1, Number(value()));
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else a.files.push(arg);
  }
  a.files.sort();
  return a;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const log = (msg: string): void => void process.stderr.write(`${msg}\n`);

async function loadData(files: string[], config: AppConfig, endMs: number) {
  if (!files.length) throw new Error('No tick files given');
  const t0 = Date.now();
  const { store, summary } = await TickStore.load(files, config.instrument.digits, { endMs });
  log(`loaded ${summary.ticks.toLocaleString('en-US')} ticks in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return { store, summary, candles: store.buildCandles(endMs) };
}

async function probe(): Promise<void> {
  const judge = new TypeSafeJudge();
  const models = await judge.listModels();
  for (const m of models) process.stdout.write(`${m.name}\trelease ${m.release_date}\t${m.description}\n`);
  const latest = models.find((m) => m.name === judge.requestedModel);
  if (latest && latest.release_date >= PROTOCOL.primaryWindowStart.slice(0, 10)) {
    process.stdout.write(`WARNING: ${latest.name} was released on/after the primary window start ${PROTOCOL.primaryWindowStart}; the window must move later.\n`);
  }
}

async function fitBaseline(a: Args, config: AppConfig): Promise<void> {
  const endMs = Date.parse(BASELINE_PERIOD.end);
  const { store, candles } = await loadData(a.files, config, endMs);
  const population = buildPopulation(candles, config, { startMs: Date.parse(BASELINE_PERIOD.start), endMs });
  log(`population ${population.length.toLocaleString('en-US')} samples`);
  const x: number[][] = [];
  const y: number[] = [];
  for (const s of population) {
    const label = labelPlan(store, config, { timeframe: s.decision.timeframe, closeTime: s.decision.closeTime, entry: s.plan.entry, refSl: s.plan.refSl });
    if (label.status !== 'target' && label.status !== 'stop') continue;
    x.push(featureVector(s.snapshot));
    y.push(label.status === 'target' ? 1 : 0);
  }
  const model = fitLogistic(x, y, {
    featureNames: featureNames(),
    trainedOn: { start: BASELINE_PERIOD.start, end: BASELINE_PERIOD.end, samples: y.length, positives: y.reduce((s, v) => s + v, 0) },
    snapshotVersion: SNAPSHOT_VERSION,
  });
  const out = a.out ?? a.baseline;
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify({ ...model, configHash: configHash(config) }, null, 1)}\n`);
  log(`baseline: ${y.length} labelled samples, ${model.trainedOn.positives} targets → ${out}`);
}

function record(s: Sample, hash: string, judge: JevJudge, result: Awaited<ReturnType<JevJudge['judge']>> | null, error: string | null): JevLogRecord {
  return {
    id: s.decision.id,
    scoredAt: new Date().toISOString(),
    snapshotVersion: SNAPSHOT_VERSION,
    promptHash: PROMPT_HASH,
    configHash: hash,
    requestedModel: judge.requestedModel,
    model: result?.model ?? null,
    timeframe: s.decision.timeframe,
    closeTime: s.decision.closeTime,
    tier: s.scored.tier,
    entry: s.plan.entry,
    refSl: s.plan.refSl,
    snapshot: s.snapshot,
    answers: result?.answers ?? null,
    usage: result?.usage ?? null,
    latencyMs: result?.latencyMs ?? null,
    error,
  };
}

async function score(a: Args, config: AppConfig): Promise<void> {
  if (!a.start || !a.end) throw new Error('score needs --start and --end');
  const startMs = Date.parse(a.start);
  const endMs = Date.parse(a.end);
  if (a.fake && a.pilot) throw new Error('--fake and --pilot are mutually exclusive');
  const mode: ScoringMode = a.fake ? 'fake' : a.pilot ? 'pilot' : 'forward';
  checkScoringRange(startMs, endMs, mode);
  const judge: JevJudge = a.fake ? new FakeJudge() : new TypeSafeJudge();
  const logPath = mode === 'forward' ? a.log : a.log.replace(/\.jsonl$/, `.${mode}.jsonl`);
  const done = new Set((await readJevLog(logPath)).filter((r) => r.answers && r.promptHash === PROMPT_HASH).map((r) => r.id));
  const { candles } = await loadData(a.files, config, endMs);
  const hash = configHash(config);
  const todo = buildPopulation(candles, config, { startMs, endMs }).filter((s) => !done.has(s.decision.id)).slice(0, a.limit);
  log(`${todo.length} samples to score (${done.size} already logged) → ${logPath}`);
  await mkdir(dirname(logPath), { recursive: true });

  let next = 0;
  let ok = 0;
  let failed = 0;
  const worker = async (): Promise<void> => {
    while (next < todo.length) {
      const s = todo[next++]!;
      let rec: JevLogRecord;
      try {
        rec = record(s, hash, judge, await judge.judge(renderState(s.snapshot), BATTERY), null);
        ok += 1;
      } catch (error) {
        rec = record(s, hash, judge, null, (error as Error).message);
        failed += 1;
      }
      await appendJevLog(logPath, [rec]);
      if ((ok + failed) % 100 === 0) log(`${ok + failed}/${todo.length} (${failed} failed)`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(a.concurrency, todo.length) }, worker));
  log(`scored ${ok}, failed ${failed}`);
}

async function evaluateCmd(a: Args, config: AppConfig): Promise<void> {
  if (!a.end) throw new Error('evaluate needs --end (exclusive; ticks must cover every trade to its exit)');
  const endMs = Date.parse(a.end);
  const baseline = JSON.parse(await readFile(a.baseline, 'utf8')) as LogisticModel;
  if (baseline.snapshotVersion !== SNAPSHOT_VERSION) throw new Error(`Baseline snapshot version ${baseline.snapshotVersion} ≠ ${SNAPSHOT_VERSION}`);
  const all = await readJevLog(a.log);
  const windowStart = Date.parse(PROTOCOL.primaryWindowStart);
  const eligible = all.filter((r) => r.answers && r.promptHash === PROMPT_HASH && r.snapshotVersion === SNAPSHOT_VERSION && r.closeTime >= windowStart && r.closeTime < endMs);
  const models = [...new Set(eligible.map((r) => r.model))];
  const { store, summary } = await loadData(a.files, config, endMs);

  const counts: Record<Label['status'], number> = { not_sent: 0, not_filled: 0, target: 0, stop: 0, open: 0 };
  const samples: EvalSample[] = [];
  for (const r of eligible) {
    const label = labelPlan(store, config, r);
    counts[label.status] += 1;
    if ((label.status !== 'target' && label.status !== 'stop') || label.rMultiple === null) continue;
    const q1 = r.answers![PRIMARY_QUESTION];
    if (q1?.type !== 'noul') continue;
    samples.push({ day: iso(r.closeTime).slice(0, 10), p: q1.noul, pBaseline: predictLogistic(baseline, featureVector(r.snapshot)), y: label.status === 'target' ? 1 : 0, r: label.rMultiple });
  }
  const e = evaluate(samples);
  const errors = all.filter((r) => r.error).length;
  const lat = all.map((r) => r.latencyMs).filter((v): v is number => v !== null).sort((x, y) => x - y);
  const q = (f: number): string => (lat.length ? `${lat[Math.min(lat.length - 1, Math.floor(f * lat.length))]} ms` : '—');

  const L: string[] = [];
  L.push('# Jev validation (D11): Q1 forward test', '');
  L.push(`> **Verdict: ${e.verdict}.** Jev is shadow-only: it has no influence on V1 decisions or emails whatever this says. ${e.verdict === 'INSUFFICIENT_DATA' ? `The test needs ≥ ${PROTOCOL.minLabelledSamples} labelled samples over ≥ ${PROTOCOL.minCalendarMonths} calendar months; interim numbers below are **not** evidence and must not change anything (no peeking, spec §4).` : ''}`, '');
  L.push(`- Protocol: \`docs/v1/jev-research-spec.md\`; primary window from ${PROTOCOL.primaryWindowStart} to ${a.end} (exclusive).`);
  L.push(`- Versions: promptHash \`${PROMPT_HASH}\`, snapshot \`${SNAPSHOT_VERSION}\`, model(s) answering: ${models.map((m) => `\`${m}\``).join(', ') || '—'}${models.length > 1 ? ' — **model changed mid-test: the clock must restart (§5)**' : ''}.`);
  L.push(`- Data: ${summary.files.map((f) => `\`${basename(f)}\``).join(', ')}.`);
  L.push(`- Baseline: logistic regression fitted on ${baseline.trainedOn.start.slice(0, 10)} → ${baseline.trainedOn.end.slice(0, 10)} (${baseline.trainedOn.samples} samples).`, '');
  L.push('## Samples', '');
  L.push(`Logged records: ${all.length} (errors ${errors}); eligible: ${eligible.length}. Labels: +2R first ${counts.target}, −1R first ${counts.stop}, open ${counts.open}, not filled ${counts.not_filled}, not sent (entry not below Ask) ${counts.not_sent}.`);
  L.push(`Primary sample (filled and resolved): **${e.n}** over ${e.days} days, months ${e.months.join(', ') || '—'}. Base rate (+2R first): ${(100 * e.baseRate).toFixed(1)}%.`, '');
  L.push('## Primary metrics (Q1), 95% day-block bootstrap intervals', '');
  L.push('| Metric | Jev | Logistic baseline |', '|---|---|---|');
  L.push(`| AUC | ${fmt(e.auc)} | ${fmt(e.aucBaseline)} |`);
  L.push(`| AUC difference (Jev − baseline) | ${fmt(e.aucDiff)} | |`);
  L.push(`| Brier skill vs base rate | ${fmt(e.bssVsBaseRate)} | |`);
  L.push(`| Brier skill vs logistic | ${e.bssVsBaseline === null ? '—' : e.bssVsBaseline.toFixed(3)} | |`);
  L.push(`| ECE | ${e.ece.toFixed(3)} | ${e.eceBaseline.toFixed(3)} |`);
  L.push(`| Top − bottom tercile expectancy (R) | ${fmt(e.tercileSpread)} | |`, '');
  L.push('## Pass criteria', '', '| Criterion | Result | Value |', '|---|---|---|');
  for (const c of e.checks) L.push(`| ${c.name} | ${c.pass ? 'pass' : 'fail'} | ${c.detail} |`);
  L.push('', '## Reliability (Q1)', '', '| p bin | n | mean p | observed |', '|---|---|---|---|');
  for (const b of e.reliability) if (b.n) L.push(`| ${b.low.toFixed(1)}–${b.high.toFixed(1)} | ${b.n} | ${b.meanP!.toFixed(3)} | ${b.observed!.toFixed(3)} |`);
  L.push('', '## By month', '', '| Month | n | Tercile spread (R) |', '|---|---|---|');
  for (const m of e.monthly) L.push(`| ${m.month} | ${m.n} | ${m.tercileSpread === null ? '—' : m.tercileSpread.toFixed(3)} |`);
  L.push('', '## Operations', '', `Latency p50 ${q(0.5)}, p95 ${q(0.95)}; failed requests ${errors}.`, '');
  const out = a.out ?? 'docs/jev/validation.md';
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${L.join('\n')}\n`);
  process.stdout.write(`Report: ${out} (verdict ${e.verdict})\n`);
}

async function pilotReport(a: Args): Promise<void> {
  const path = a.log.endsWith('.pilot.jsonl') ? a.log : a.log.replace(/\.jsonl$/, '.pilot.jsonl');
  const records = await readJevLog(path);
  if (!records.length) throw new Error(`No pilot records in ${path}`);
  const s = summarisePilot(records, PRIMARY_QUESTION);
  const first = Math.min(...records.map((r) => r.closeTime));
  const last = Math.max(...records.map((r) => r.closeTime));
  const n = (v: number, d = 3): string => v.toFixed(d);
  const sp = (x: Spread | null, d = 3): string => (x ? `${n(x.min, d)} / ${n(x.q1, d)} / ${n(x.median, d)} / ${n(x.q3, d)} / ${n(x.max, d)} (mean ${n(x.mean, d)}, sd ${n(x.sd, d)}, n=${x.n})` : '—');
  const kv = (m: Record<string, number>): string => Object.entries(m).sort().map(([k, v]) => `${k} ${v}`).join(', ') || '—';
  const L: string[] = [];
  L.push('# Jev pilot: operational check (NOT evidence)', '');
  L.push(`> **Pilot only.** Real API on pre-window candles (${iso(first).slice(0, 16)}Z → ${iso(last).slice(0, 16)}Z), all before the primary window start ${PROTOCOL.primaryWindowStart}. These records are in \`${basename(path)}\`, never in the evidence log, and \`evaluate\` ignores them. This report deliberately has **no outcome or accuracy metrics**, so nothing can be tuned on it (spec §4, no peeking).`, '');
  L.push(`- Versions: promptHash \`${PROMPT_HASH}\`, snapshot \`${SNAPSHOT_VERSION}\`, requested model \`${records[0]!.requestedModel}\`.`);
  L.push(`- **Requests:** ${s.records} logged, **${s.ok} succeeded, ${s.failed} failed**.`);
  L.push(`- **Model(s) that answered:** ${kv(s.models)}.`);
  L.push(`- Samples by timeframe: ${kv(s.byTimeframe)}; by tier: ${kv(s.byTier)}.`, '');
  if (s.failed) {
    L.push('## Errors', '', '| Error | Count |', '|---|---|');
    for (const [e, c] of Object.entries(s.errors)) L.push(`| ${e.replace(/\|/g, '\\|')} | ${c} |`);
    L.push('');
  }
  L.push('## Operations', '', '| Metric | min / Q1 / median / Q3 / max |', '|---|---|');
  L.push(`| Latency (ms) | ${sp(s.latencyMs, 0)} |`);
  L.push(`| Input tokens / request | ${sp(s.inputTokens, 0)} |`);
  L.push(`| Output tokens / request | ${sp(s.outputTokens, 0)} |`, '');
  L.push('## Answer spread (no outcomes)', '', '| Question | min / Q1 / median / Q3 / max |', '|---|---|');
  for (const [q, x] of Object.entries(s.nouls)) L.push(`| ${q} | ${sp(x)} |`);
  L.push('', '| Choice question | Counts |', '|---|---|');
  for (const [q, m] of Object.entries(s.choices)) L.push(`| ${q} | ${kv(m)} |`);
  L.push('', `**Q1 degeneracy check (sd < ${DEGENERATE_SD}):** ${s.degenerateQ1 ? '**FAIL: Jev is not reacting to the snapshot; fix before the window opens.**' : 'pass: Q1 varies across snapshots.'}`, '');
  const out = a.out ?? 'docs/jev/pilot.md';
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${L.join('\n')}\n`);
  process.stdout.write(`Report: ${out}\n`);
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  if (a.command === 'probe') return probe();
  if (a.command === 'pilot-report') return pilotReport(a);
  const config = await loadConfig(a.config);
  if (a.command === 'fit-baseline') return fitBaseline(a, config);
  if (a.command === 'score') return score(a, config);
  if (a.command === 'evaluate') return evaluateCmd(a, config);
  throw new Error('Usage: jev.ts probe | fit-baseline | score | pilot-report | evaluate (see file header)');
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exitCode = 1;
});
