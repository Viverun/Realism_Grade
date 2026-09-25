/**
 * Backtest for the V1.1 daily selector. Decisions come from the unchanged V1 engine; the
 * selector picks one candidate per slot; execution and outcomes reuse the V1 backtest model.
 */
import { DailySelector, type Candidate, type SlotSelection } from '../alerts/daily-selector.js';
import type { AppConfig } from '../config/schema.js';
import { configHash } from '../config/load.js';
import { pipsToPoints } from '../core/price.js';
import { TIMEFRAME_MS, TIMEFRAMES, type Timeframe } from '../core/timeframe.js';
import type { Candle } from '../core/types.js';
import { buildSeries, evaluateIndex, makeEngineContext } from '../strategy/engine.js';
import { candidatePlan, scoreDecision } from '../strategy/score.js';
import { sendTimeCheck, simulateExecution, type Execution } from './execution.js';
import { measureOutcome, type Outcome } from './outcomes.js';
import type { TickStore } from './tick-store.js';

/** Candidates grouped by candle close time, ascending. Independent of selection settings. */
export interface CandidateStream {
  closes: number[];
  byClose: Map<number, Candidate[]>;
  evaluated: Record<Timeframe, number>;
}

export function buildCandidateStream(candles: Record<Timeframe, readonly Candle[]>, config: AppConfig, timeframes: readonly Timeframe[]): CandidateStream {
  const byClose = new Map<number, Candidate[]>();
  const evaluated = { M5: 0, M15: 0, M30: 0, H1: 0 } as Record<Timeframe, number>;
  const hash = configHash(config);
  for (const tf of timeframes) {
    const ctx = makeEngineContext(config, tf, hash);
    const series = buildSeries(candles[tf], ctx);
    for (let i = 0; i < series.candles.length; i++) {
      const decision = evaluateIndex(series, i, ctx);
      if (decision.status === 'warmup') continue;
      evaluated[tf] += 1;
      const plan = candidatePlan(series, i, decision, ctx);
      if (!plan) continue;
      const candidate: Candidate = { decision, scored: scoreDecision(decision), plan, tfRank: TIMEFRAMES.indexOf(tf) };
      const list = byClose.get(decision.closeTime);
      if (list) list.push(candidate);
      else byClose.set(decision.closeTime, [candidate]);
    }
  }
  return { closes: [...byClose.keys()].sort((a, b) => a - b), byClose, evaluated };
}

export interface SelectionAlert {
  selection: SlotSelection;
  execution: Execution | null;
  riskPips: number | null;
  outcome: Outcome | null;
}

export interface SelectionRun {
  name: string;
  configHash: string;
  alerts: SelectionAlert[];
}

export function runSelection(name: string, stream: CandidateStream, store: TickStore, config: AppConfig, untilMs: number): SelectionRun {
  const pp = config.instrument.pointsPerPip;
  const minDistance = pipsToPoints(config.execution.minLimitDistancePips, pp);
  const allowed = new Set(config.selection.timeframes);
  const selector = new DailySelector(config.selection, config.alerts.timezone, (c, sendTime) =>
    sendTimeCheck(store, sendTime, c.plan.entry, minDistance).ok,
  );
  const selections: SlotSelection[] = [];
  for (const close of stream.closes) {
    const group = stream.byClose.get(close)!.filter((c) => allowed.has(c.decision.timeframe));
    if (!group.length) continue;
    selections.push(...selector.onClose(close, group));
  }
  selections.push(...selector.finish(untilMs));

  const alerts = selections.map((selection): SelectionAlert => {
    const c = selection.candidate;
    if (!c) return { selection, execution: null, riskPips: null, outcome: null };
    const tfMs = TIMEFRAME_MS[c.decision.timeframe];
    const execution = simulateExecution(store, 'buy_limit', {
      closeTime: selection.sendTime,
      expiryTime: selection.sendTime + config.entry.validCandles * tfMs,
      placementDelayMs: config.backtest.placementDelaySec * 1000,
      entry: c.plan.entry,
      minDistancePoints: minDistance,
    });
    if (execution.status !== 'filled' || execution.fillIndex === null || execution.fillPrice === null) {
      return { selection, execution, riskPips: null, outcome: null };
    }
    const horizons = config.strategy.timeframes[c.decision.timeframe].outcomeHorizons.map((n) => ({ candles: n, ms: n * tfMs }));
    return {
      selection,
      execution,
      riskPips: (execution.fillPrice - c.plan.refSl) / pp,
      outcome: measureOutcome(store, { index: execution.fillIndex, price: execution.fillPrice }, c.plan.refSl, horizons, pp),
    };
  });
  return { name, configHash: configHash(config), alerts };
}
