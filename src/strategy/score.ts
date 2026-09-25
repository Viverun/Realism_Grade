/**
 * V1.1 candidate scoring (docs/v1/selection-v1_1.md). Reuses the four V1 rule results on a
 * Decision; adds no new strategy rules. Score = number of rules passed (0–4).
 */
import type { Decision, EngineContext, TradePlan } from './engine.js';
import type { Series } from './rules.js';
import { computeEntry, computeReferenceStop, computeSizing } from './sizing.js';

export type Tier = 'A' | 'B' | 'C' | 'D';
export type RuleName = 'trend' | 'pullback' | 'rsi' | 'candle';

export interface Scored {
  score: number;
  tier: Tier;
  failed: RuleName[];
  /** Rule 1 (trend) failed: a BUY against the PDF's "never trade against the trend". */
  counterTrend: boolean;
}

export function scoreDecision(d: Decision): Scored {
  const checks: [RuleName, boolean][] = [
    ['trend', d.trend],
    ['pullback', d.pullback.ok],
    ['rsi', d.rsiCheck.ok],
    ['candle', d.candle.ok],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  const score = 4 - failed.length;
  const tier: Tier = score === 4 ? 'A' : score === 3 ? 'B' : score === 2 ? 'C' : 'D';
  return { score, tier, failed, counterTrend: !d.trend };
}

/**
 * Buy Limit plan for any evaluated candle (not only full V1 signals), using the V1 entry,
 * reference-stop and sizing rules. Returns null when V4 (entry <= stop) or V5 (planned risk
 * above maxRiskPercent) fails, or during warm-up.
 */
export function candidatePlan(series: Series, i: number, d: Decision, ctx: EngineContext): TradePlan | null {
  if (d.status === 'warmup' || d.emaFast === null) return null;
  if (d.plan) return d.status === 'signal' ? d.plan : null;
  const p = ctx.params;
  const candle = series.candles[i]!;
  const entry = computeEntry(candle, p);
  const refSl = computeReferenceStop(series.candles, i, d.candle.patterns, d.emaFast, p);
  if (entry <= refSl) return null;
  const sizing = computeSizing(entry, refSl, ctx.config.account, p);
  if (sizing.plannedRiskPct > ctx.config.account.maxRiskPercent) return null;
  return { entry, refSl, sizing };
}
