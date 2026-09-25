/**
 * The D11 sample population (docs/v1/jev-research-spec.md §4) and its tick-based labels.
 * Sampling uses only the V1 engine's decision for each candle (no outcome information);
 * labels come later from ticks, with the V1 Buy Limit execution model (spec §11), and never
 * feed back into sampling or snapshots.
 */
import { sendTimeCheck, simulateExecution } from '../backtest/execution.js';
import { measureOutcome } from '../backtest/outcomes.js';
import type { TickStore } from '../backtest/tick-store.js';
import type { AppConfig } from '../config/schema.js';
import { configHash } from '../config/load.js';
import { pipsToPoints } from '../core/price.js';
import { TIMEFRAME_MS, type Timeframe } from '../core/timeframe.js';
import { makeLocalClock } from '../core/timezone.js';
import type { Candle } from '../core/types.js';
import { buildSeries, evaluateIndex, makeEngineContext, type Decision, type TradePlan } from '../strategy/engine.js';
import { candidatePlan, scoreDecision, type Scored } from '../strategy/score.js';
import { PROTOCOL } from './protocol.js';
import { buildSnapshot, SNAPSHOT_MIN_INDEX, snapshotReady, type Snapshot } from './snapshot.js';

export interface Sample {
  decision: Decision;
  scored: Scored;
  plan: TradePlan;
  snapshot: Snapshot;
}

export function buildPopulation(candles: Partial<Record<Timeframe, readonly Candle[]>>, config: AppConfig, range: { startMs: number; endMs: number }): Sample[] {
  const hash = configHash(config);
  const local = makeLocalClock(config.alerts.timezone);
  const weekdays = new Set(config.selection.weekdays);
  const tradingDay = (ms: number): boolean => weekdays.has(new Date(`${local(ms).date}T00:00:00Z`).getUTCDay());
  const out: Sample[] = [];
  for (const tf of [...PROTOCOL.tierATimeframes, ...PROTOCOL.allTierTimeframes]) {
    const list = candles[tf];
    if (!list?.length) continue;
    const allTiers = PROTOCOL.allTierTimeframes.includes(tf);
    const ctx = makeEngineContext(config, tf, hash);
    const series = buildSeries(list, ctx);
    for (let i = SNAPSHOT_MIN_INDEX; i < list.length; i++) {
      const decision = evaluateIndex(series, i, ctx);
      if (decision.status === 'warmup' || !decision.inWindow || !snapshotReady(series, i)) continue;
      if (decision.closeTime < range.startMs || decision.closeTime >= range.endMs || !tradingDay(decision.closeTime)) continue;
      const scored = scoreDecision(decision);
      if (!allTiers && scored.tier !== 'A') continue;
      const plan = candidatePlan(series, i, decision, ctx);
      if (!plan) continue;
      out.push({ decision, scored, plan, snapshot: buildSnapshot(series, i, decision, scored, plan, ctx) });
    }
  }
  return out.sort((a, b) => a.decision.closeTime - b.decision.closeTime || a.decision.id.localeCompare(b.decision.id));
}

export type LabelStatus = 'not_sent' | 'not_filled' | 'target' | 'stop' | 'open';

export interface Label {
  status: LabelStatus;
  /** R multiple for a filled trade (null if not filled or data ended). */
  rMultiple: number | null;
}

/** Labels one plan with the V1 Buy Limit model, sent at the candle close (spec §11). */
export function labelPlan(store: TickStore, config: AppConfig, s: { timeframe: Timeframe; closeTime: number; entry: number; refSl: number }): Label {
  const pp = config.instrument.pointsPerPip;
  const minDistance = pipsToPoints(config.execution.minLimitDistancePips, pp);
  if (!sendTimeCheck(store, s.closeTime, s.entry, minDistance).ok) return { status: 'not_sent', rMultiple: null };
  const tfMs = TIMEFRAME_MS[s.timeframe];
  const execution = simulateExecution(store, 'buy_limit', {
    closeTime: s.closeTime,
    expiryTime: s.closeTime + config.entry.validCandles * tfMs,
    placementDelayMs: config.backtest.placementDelaySec * 1000,
    entry: s.entry,
    minDistancePoints: minDistance,
  });
  if (execution.status !== 'filled' || execution.fillIndex === null || execution.fillPrice === null) return { status: 'not_filled', rMultiple: null };
  const horizons = config.strategy.timeframes[s.timeframe].outcomeHorizons.map((n) => ({ candles: n, ms: n * tfMs }));
  const outcome = measureOutcome(store, { index: execution.fillIndex, price: execution.fillPrice }, s.refSl, horizons, pp);
  return { status: outcome.twoR, rMultiple: outcome.rMultiple };
}
