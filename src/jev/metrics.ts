/**
 * D11 evaluation metrics (docs/v1/jev-research-spec.md §4): AUC, Brier skill, ECE, tercile
 * expectancy, with day-block bootstrap intervals (samples on the same day are correlated),
 * and the pre-registered PASS/FAIL verdict.
 */
import { seededRandom } from '../core/random.js';
import { PROTOCOL } from './protocol.js';

export interface EvalSample {
  /** UTC day (YYYY-MM-DD) for block resampling; month = first 7 chars. */
  day: string;
  /** Jev Q1 probability. */
  p: number;
  /** Logistic-baseline probability. */
  pBaseline: number;
  /** 1 = +2R first, 0 = −1R first. */
  y: 0 | 1;
  /** Realized R of the trade. */
  r: number;
}

/** Mann–Whitney AUC with average ranks for ties; null if one class is empty. */
export function auc(p: readonly number[], y: readonly number[]): number | null {
  const idx = p.map((_, i) => i).sort((a, b) => p[a]! - p[b]!);
  const ranks = new Array<number>(p.length);
  for (let s = 0; s < idx.length; ) {
    let e = s;
    while (e + 1 < idx.length && p[idx[e + 1]!] === p[idx[s]!]) e++;
    for (let k = s; k <= e; k++) ranks[idx[k]!] = (s + e) / 2 + 1;
    s = e + 1;
  }
  const pos = y.filter((v) => v === 1).length;
  const neg = y.length - pos;
  if (!pos || !neg) return null;
  const sumPos = ranks.reduce((s, r, i) => s + (y[i] === 1 ? r : 0), 0);
  return (sumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

export function brier(p: readonly number[], y: readonly number[]): number {
  return p.reduce((s, v, i) => s + (v - y[i]!) ** 2, 0) / p.length;
}

/** Brier skill vs a constant forecast equal to the sample's base rate. */
export function brierSkillVsBaseRate(p: readonly number[], y: readonly number[]): number | null {
  const rate = y.reduce((s, v) => s + v, 0) / y.length;
  const ref = brier(new Array<number>(y.length).fill(rate), y);
  return ref > 0 ? 1 - brier(p, y) / ref : null;
}

export interface ReliabilityBin {
  low: number;
  high: number;
  n: number;
  meanP: number | null;
  observed: number | null;
}

export function reliability(p: readonly number[], y: readonly number[], bins = PROTOCOL.eceBins): { ece: number; bins: ReliabilityBin[] } {
  const out: ReliabilityBin[] = Array.from({ length: bins }, (_, b) => ({ low: b / bins, high: (b + 1) / bins, n: 0, meanP: 0, observed: 0 }));
  p.forEach((v, i) => {
    const bin = out[Math.min(bins - 1, Math.floor(v * bins))]!;
    bin.n += 1;
    bin.meanP! += v;
    bin.observed! += y[i]!;
  });
  let ece = 0;
  for (const bin of out) {
    if (!bin.n) {
      bin.meanP = null;
      bin.observed = null;
      continue;
    }
    bin.meanP! /= bin.n;
    bin.observed! /= bin.n;
    ece += (bin.n / p.length) * Math.abs(bin.meanP! - bin.observed!);
  }
  return { ece, bins: out };
}

/** Mean R of the top tercile of p minus the bottom tercile (ties broken by input order). */
export function tercileSpread(p: readonly number[], r: readonly number[]): number | null {
  if (p.length < 3) return null;
  const idx = p.map((_, i) => i).sort((a, b) => p[a]! - p[b]! || a - b);
  const k = Math.floor(idx.length / 3);
  const mean = (ids: number[]): number => ids.reduce((s, i) => s + r[i]!, 0) / ids.length;
  return mean(idx.slice(idx.length - k)) - mean(idx.slice(0, k));
}

export interface Stat {
  value: number | null;
  low: number | null;
  high: number | null;
}

export interface Evaluation {
  n: number;
  days: number;
  months: string[];
  baseRate: number;
  auc: Stat;
  aucBaseline: Stat;
  aucDiff: Stat;
  bssVsBaseRate: Stat;
  bssVsBaseline: number | null;
  ece: number;
  eceBaseline: number;
  reliability: ReliabilityBin[];
  tercileSpread: Stat;
  monthly: { month: string; n: number; tercileSpread: number | null }[];
  checks: { name: string; pass: boolean; detail: string }[];
  verdict: 'PASS' | 'FAIL' | 'INSUFFICIENT_DATA';
}

type Stats = Record<'auc' | 'aucBaseline' | 'aucDiff' | 'bssVsBaseRate' | 'tercileSpread', number | null>;

function statsOf(s: readonly EvalSample[]): Stats {
  const p = s.map((x) => x.p);
  const y = s.map((x) => x.y);
  const a = auc(p, y);
  const b = auc(s.map((x) => x.pBaseline), y);
  return {
    auc: a,
    aucBaseline: b,
    aucDiff: a === null || b === null ? null : a - b,
    bssVsBaseRate: brierSkillVsBaseRate(p, y),
    tercileSpread: tercileSpread(p, s.map((x) => x.r)),
  };
}

/** Percentile intervals from resampling whole days with replacement (seeded). */
function blockBootstrap(samples: readonly EvalSample[]): Record<keyof Stats, Stat> {
  const byDay = new Map<string, EvalSample[]>();
  for (const s of samples) {
    const list = byDay.get(s.day);
    if (list) list.push(s);
    else byDay.set(s.day, [s]);
  }
  const days = [...byDay.keys()].sort();
  const random = seededRandom(PROTOCOL.bootstrapSeed);
  const point = statsOf(samples);
  const keys = Object.keys(point) as (keyof Stats)[];
  const draws = Object.fromEntries(keys.map((k) => [k, [] as number[]])) as Record<keyof Stats, number[]>;
  for (let it = 0; it < PROTOCOL.bootstrapIterations; it++) {
    const resample: EvalSample[] = [];
    for (let d = 0; d < days.length; d++) resample.push(...byDay.get(days[Math.floor(random() * days.length)]!)!);
    const st = statsOf(resample);
    for (const k of keys) if (st[k] !== null) draws[k].push(st[k]!);
  }
  const out = {} as Record<keyof Stats, Stat>;
  for (const k of keys) {
    const d = Float64Array.from(draws[k]).sort();
    const ok = d.length >= 0.9 * PROTOCOL.bootstrapIterations;
    out[k] = { value: point[k], low: ok ? d[Math.floor(0.025 * d.length)]! : null, high: ok ? d[Math.ceil(0.975 * d.length) - 1]! : null };
  }
  return out;
}

const col = <K extends keyof EvalSample>(s: readonly EvalSample[], k: K): EvalSample[K][] => s.map((x) => x[k]);

export function evaluate(samples: readonly EvalSample[]): Evaluation {
  const empty: Stat = { value: null, low: null, high: null };
  const stats: Record<keyof Stats, Stat> = samples.length
    ? blockBootstrap(samples)
    : { auc: empty, aucBaseline: empty, aucDiff: empty, bssVsBaseRate: empty, tercileSpread: empty };
  const p = col(samples, 'p');
  const y = col(samples, 'y');
  const months = [...new Set(samples.map((s) => s.day.slice(0, 7)))].sort();
  const monthly = months.map((month) => {
    const m = samples.filter((s) => s.day.startsWith(month));
    return { month, n: m.length, tercileSpread: tercileSpread(col(m, 'p'), col(m, 'r')) };
  });
  const bBase = samples.length ? brier(col(samples, 'pBaseline'), y) : 0;
  const rel = reliability(p, y);

  const above = (s: Stat, bound: number): boolean => s.low !== null && s.low > bound;
  const positiveMonths = monthly.filter((m) => (m.tercileSpread ?? 0) > 0).length;
  const neededMonths = Math.ceil(PROTOCOL.monthlySignShare * months.length);
  const checks = [
    { name: `AUC lower bound > ${PROTOCOL.aucLowerBound}`, pass: above(stats.auc, PROTOCOL.aucLowerBound), detail: fmt(stats.auc) },
    { name: 'AUC(Jev) − AUC(logistic) interval above 0', pass: above(stats.aucDiff, 0), detail: fmt(stats.aucDiff) },
    { name: 'Brier skill vs base rate: lower bound > 0', pass: above(stats.bssVsBaseRate, 0), detail: fmt(stats.bssVsBaseRate) },
    { name: 'Top − bottom tercile expectancy (R): interval above 0', pass: above(stats.tercileSpread, 0), detail: fmt(stats.tercileSpread) },
    { name: `Tercile spread positive in ≥ ${neededMonths} of ${months.length} months`, pass: months.length > 0 && positiveMonths >= neededMonths, detail: `${positiveMonths} of ${months.length}` },
  ];
  const enough = samples.length >= PROTOCOL.minLabelledSamples && months.length >= PROTOCOL.minCalendarMonths;
  return {
    n: samples.length,
    days: new Set(samples.map((s) => s.day)).size,
    months,
    baseRate: samples.length ? y.reduce<number>((s, v) => s + v, 0) / samples.length : 0,
    auc: stats.auc,
    aucBaseline: stats.aucBaseline,
    aucDiff: stats.aucDiff,
    bssVsBaseRate: stats.bssVsBaseRate,
    bssVsBaseline: samples.length && bBase > 0 ? 1 - brier(p, y) / bBase : null,
    ece: rel.ece,
    eceBaseline: samples.length ? reliability(col(samples, 'pBaseline'), y).ece : 0,
    reliability: rel.bins,
    tercileSpread: stats.tercileSpread,
    monthly,
    checks,
    verdict: !enough ? 'INSUFFICIENT_DATA' : checks.every((c) => c.pass) ? 'PASS' : 'FAIL',
  };
}

export function fmt(s: Stat, d = 3): string {
  if (s.value === null) return '—';
  return s.low === null || s.high === null ? s.value.toFixed(d) : `${s.value.toFixed(d)} [${s.low.toFixed(d)}, ${s.high.toFixed(d)}]`;
}
