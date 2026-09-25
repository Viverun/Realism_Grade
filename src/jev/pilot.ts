/**
 * Operational summary of a Jev pilot log (docs/v1/jev-research-spec.md §8). Deliberately
 * contains NO outcome labels or accuracy metrics: a pilot checks the wiring (requests,
 * validation, latency, tokens, answer spread), so the battery cannot be tuned on it.
 */
import type { JevLogRecord } from './log.js';

export interface Spread {
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  sd: number;
}

export interface PilotSummary {
  records: number;
  ok: number;
  failed: number;
  errors: Record<string, number>;
  models: Record<string, number>;
  latencyMs: Spread | null;
  inputTokens: Spread | null;
  outputTokens: Spread | null;
  nouls: Record<string, Spread | null>;
  choices: Record<string, Record<string, number>>;
  byTimeframe: Record<string, number>;
  byTier: Record<string, number>;
  /** Q1 standard deviation below this means Jev is not reacting to the snapshot. */
  degenerateQ1: boolean;
}

export const DEGENERATE_SD = 0.02;

export function spread(values: readonly number[]): Spread | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const q = (f: number): number => {
    const pos = f * (s.length - 1);
    const lo = Math.floor(pos);
    return s[lo]! + (s[Math.min(lo + 1, s.length - 1)]! - s[lo]!) * (pos - lo);
  };
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  return { n: s.length, min: s[0]!, q1: q(0.25), median: q(0.5), q3: q(0.75), max: s.at(-1)!, mean, sd };
}

const bump = (m: Record<string, number>, k: string): void => void (m[k] = (m[k] ?? 0) + 1);

export function summarisePilot(records: readonly JevLogRecord[], primaryQuestion: string): PilotSummary {
  const ok = records.filter((r) => r.answers);
  const errors: Record<string, number> = {};
  const models: Record<string, number> = {};
  const byTimeframe: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  const nounValues: Record<string, number[]> = {};
  const choices: Record<string, Record<string, number>> = {};
  for (const r of records) {
    if (r.error) bump(errors, r.error.slice(0, 160));
    bump(byTimeframe, r.timeframe);
    bump(byTier, r.tier);
  }
  for (const r of ok) {
    if (r.model) bump(models, r.model);
    for (const [name, a] of Object.entries(r.answers!)) {
      if (a.type === 'noul') (nounValues[name] ??= []).push(a.noul);
      else if (a.type === 'choice') bump((choices[name] ??= {}), a.choice);
    }
  }
  const nouls = Object.fromEntries(Object.entries(nounValues).map(([k, v]) => [k, spread(v)]));
  const q1 = nouls[primaryQuestion];
  const tokens = (k: 'input_tokens' | 'output_tokens'): Spread | null =>
    spread(ok.map((r) => r.usage?.[k]).filter((v): v is number => typeof v === 'number'));
  return {
    records: records.length,
    ok: ok.length,
    failed: records.length - ok.length,
    errors,
    models,
    latencyMs: spread(ok.map((r) => r.latencyMs).filter((v): v is number => v !== null)),
    inputTokens: tokens('input_tokens'),
    outputTokens: tokens('output_tokens'),
    nouls,
    choices,
    byTimeframe,
    byTier,
    degenerateQ1: !q1 || q1.sd < DEGENERATE_SD,
  };
}
