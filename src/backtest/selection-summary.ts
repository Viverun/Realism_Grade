import type { Tier } from '../strategy/score.js';
import type { SelectionAlert, SelectionRun } from './selection-runner.js';
import { meanInterval, wilson, type Interval } from './summary.js';

export interface OutcomeBlock {
  alerts: number;
  filled: number;
  fillRate: number | null;
  target: number;
  stop: number;
  open: number;
  targetShare: Interval;
  expectancyR: Interval;
  expectancyPerAlertR: Interval;
  rValues: number[];
}

export interface SelectionSummary {
  name: string;
  tradingDays: number;
  slots: number;
  alerts: number;
  missed: number;
  /** Slots with no full setup while fallback is off. */
  noSetup: number;
  alertsPerDay: number;
  immediate: number;
  fallback: number;
  tiers: Record<Tier, number>;
  counterTrend: number;
  timeframes: Record<string, number>;
  overall: OutcomeBlock;
  byTier: Record<Tier, OutcomeBlock>;
}

function outcomes(alerts: readonly SelectionAlert[]): OutcomeBlock {
  const sent = alerts.filter((a) => a.selection.candidate);
  const filled = sent.filter((a) => a.execution?.status === 'filled');
  const outs = filled.map((a) => a.outcome).filter((o) => o !== null);
  const target = outs.filter((o) => o.twoR === 'target').length;
  const stop = outs.filter((o) => o.twoR === 'stop').length;
  const rValues = outs.map((o) => o.rMultiple).filter((v): v is number => v != null);
  const perAlert = sent
    .map((a) => (a.execution?.status === 'filled' ? (a.outcome?.rMultiple ?? null) : 0))
    .filter((v): v is number => v !== null);
  return {
    alerts: sent.length,
    filled: filled.length,
    fillRate: sent.length ? filled.length / sent.length : null,
    target,
    stop,
    open: outs.length - target - stop,
    targetShare: wilson(target, target + stop),
    expectancyR: meanInterval(rValues),
    expectancyPerAlertR: meanInterval(perAlert),
    rValues,
  };
}

/** Summary over selections whose send time is in [fromMs, toMs). */
export function summariseSelection(run: SelectionRun, fromMs = -Infinity, toMs = Infinity): SelectionSummary {
  const alerts = run.alerts.filter((a) => a.selection.sendTime >= fromMs && a.selection.sendTime < toMs);
  const sent = alerts.filter((a) => a.selection.candidate);
  const days = new Set(alerts.map((a) => a.selection.date)).size;
  const tierOf = (a: SelectionAlert): Tier => a.selection.candidate!.scored.tier;
  const tiers = { A: 0, B: 0, C: 0, D: 0 } as Record<Tier, number>;
  const timeframes: Record<string, number> = {};
  for (const a of sent) {
    tiers[tierOf(a)] += 1;
    const tf = a.selection.candidate!.decision.timeframe;
    timeframes[tf] = (timeframes[tf] ?? 0) + 1;
  }
  return {
    name: run.name,
    tradingDays: days,
    slots: alerts.length,
    alerts: sent.length,
    missed: alerts.filter((a) => a.selection.kind === 'missed').length,
    noSetup: alerts.filter((a) => a.selection.kind === 'none').length,
    alertsPerDay: days ? sent.length / days : 0,
    immediate: alerts.filter((a) => a.selection.kind === 'immediate').length,
    fallback: alerts.filter((a) => a.selection.kind === 'fallback').length,
    tiers,
    counterTrend: sent.filter((a) => a.selection.candidate!.scored.counterTrend).length,
    timeframes,
    overall: outcomes(alerts),
    byTier: {
      A: outcomes(sent.filter((a) => tierOf(a) === 'A')),
      B: outcomes(sent.filter((a) => tierOf(a) === 'B')),
      C: outcomes(sent.filter((a) => tierOf(a) === 'C')),
      D: outcomes(sent.filter((a) => tierOf(a) === 'D')),
    },
  };
}
