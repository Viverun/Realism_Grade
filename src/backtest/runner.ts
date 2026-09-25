/**
 * Backtest runner (spec §11): decisions first (pure, from candles only), then send-time
 * validation, alert policy, execution and outcomes — strictly in that order.
 */
import { AlertPolicy, type AlertOutcome } from '../alerts/policy.js';
import { configHash } from '../config/load.js';
import { pipsToPoints } from '../core/price.js';
import { TIMEFRAME_MS, type Timeframe } from '../core/timeframe.js';
import type { Candle } from '../core/types.js';
import { decideAll, makeEngineContext, type Decision } from '../strategy/engine.js';
import { sendTimeCheck, simulateExecution, type Execution } from './execution.js';
import { measureOutcome, type Outcome } from './outcomes.js';
import type { TickStore } from './tick-store.js';
import type { Variant } from './variants.js';

export type AlertStatus =
  | AlertOutcome
  | 'entry_not_below_market'
  | 'no_data';

export interface AlertRecord {
  decision: Decision;
  alertStatus: AlertStatus;
  execution: Execution | null;
  /** Stop distance for outcome R, pips (from the actual fill for the market baseline). */
  riskPips: number | null;
  outcome: Outcome | null;
}

export interface TimeframeRun {
  variant: string;
  timeframe: Timeframe;
  configHash: string;
  decisions: Decision[];
  alerts: AlertRecord[];
}

export function runTimeframe(store: TickStore, candles: readonly Candle[], timeframe: Timeframe, variant: Variant): TimeframeRun {
  const { config } = variant;
  const hash = configHash(config);
  const ctx = makeEngineContext(config, timeframe, hash);
  const decisions = decideAll(candles, ctx);
  const policy = new AlertPolicy(config.alerts);
  const pp = config.instrument.pointsPerPip;
  const minDistance = pipsToPoints(config.execution.minLimitDistancePips, pp);
  const tfMs = TIMEFRAME_MS[timeframe];
  const horizons = config.strategy.timeframes[timeframe].outcomeHorizons.map((n) => ({ candles: n, ms: n * tfMs }));
  const alerts: AlertRecord[] = [];

  for (const decision of decisions) {
    if (decision.status !== 'signal' || !decision.plan) continue;
    const plan = decision.plan;

    if (variant.entryModel === 'buy_limit') {
      const send = sendTimeCheck(store, decision.closeTime, plan.entry, minDistance);
      if (!send.ok) {
        alerts.push({ decision, alertStatus: send.status, execution: null, riskPips: null, outcome: null });
        continue;
      }
    }
    const alertStatus = policy.offer(decision);
    if (alertStatus !== 'emailed') {
      alerts.push({ decision, alertStatus, execution: null, riskPips: null, outcome: null });
      continue;
    }
    const execution = simulateExecution(store, variant.entryModel, {
      closeTime: decision.closeTime,
      expiryTime: decision.closeTime + config.entry.validCandles * tfMs,
      placementDelayMs: config.backtest.placementDelaySec * 1000,
      entry: plan.entry,
      minDistancePoints: minDistance,
    });
    let outcome: Outcome | null = null;
    let riskPips: number | null = null;
    if (execution.status === 'filled' && execution.fillIndex !== null && execution.fillPrice !== null) {
      riskPips = (execution.fillPrice - plan.refSl) / pp;
      outcome = measureOutcome(store, { index: execution.fillIndex, price: execution.fillPrice }, plan.refSl, horizons, pp);
    }
    alerts.push({ decision, alertStatus, execution, riskPips, outcome });
  }
  return { variant: variant.name, timeframe, configHash: hash, decisions, alerts };
}
