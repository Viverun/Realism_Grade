import type { AppConfig } from '../config/schema.js';
import type { Candle } from '../core/types.js';
import type { Pattern } from './rules.js';
import type { StrategyParams } from './params.js';

/** Buy Limit entry price in points (spec §7). Both modes are Buy Limit prices. */
export function computeEntry(candle: Candle, p: StrategyParams): number {
  if (p.entryMode === 'candle_mid') return Math.floor((candle.high + candle.low) / 2);
  return candle.close - p.entryOffsetPoints;
}

/** Reference stop (spec §9): below the pattern's low and the EMA-fast, minus a buffer; floored to a point. */
export function computeReferenceStop(
  candles: readonly Candle[],
  i: number,
  patterns: readonly Pattern[],
  emaFast: number,
  p: StrategyParams,
): number {
  let low = candles[i]!.low;
  if (patterns.includes('engulfing') && i > 0) low = Math.min(low, candles[i - 1]!.low);
  return Math.floor(Math.min(low, emaFast) - p.slBufferPoints);
}

export interface Sizing {
  slPips: number;
  lotsRaw: number;
  lots: number;
  plannedRiskUsd: number;
  plannedRiskPct: number;
  /** True when the formula asked for less than minLot and minLot was used. */
  raisedToMinLot: boolean;
}

/**
 * Lot size from the PDF formula with commission (spec §9, PDF review P5). The result is
 * PLANNED risk: realized loss can differ (stop slippage, manual placement).
 */
export function computeSizing(
  entry: number,
  refSl: number,
  account: AppConfig['account'],
  p: Pick<StrategyParams, 'pointsPerPip' | 'minSlPips'>,
): Sizing {
  const slPips = Math.max((entry - refSl) / p.pointsPerPip, p.minSlPips);
  const riskBudget = (account.balance * account.riskPercent) / 100;
  const perLot = slPips * account.pipValuePerLot + account.commissionPerLotRoundTrip;
  const lotsRaw = riskBudget / perLot;
  const steps = Math.floor(lotsRaw / account.lotStep + 1e-9);
  let lots = Number((steps * account.lotStep).toFixed(8));
  const raisedToMinLot = lots < account.minLot;
  lots = Math.min(Math.max(lots, account.minLot), account.maxLot);
  const plannedRiskUsd = Number((lots * perLot).toFixed(6));
  return {
    slPips,
    lotsRaw,
    lots,
    plannedRiskUsd,
    plannedRiskPct: Number(((plannedRiskUsd / account.balance) * 100).toFixed(6)),
    raisedToMinLot,
  };
}
