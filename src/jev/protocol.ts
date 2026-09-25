/**
 * Pre-registered D11 test protocol constants (docs/v1/jev-research-spec.md §4), all [POLICY, D11].
 * Frozen at approval; changing any of them restarts the validation clock.
 */
import type { Timeframe } from '../core/timeframe.js';

export const PROTOCOL = {
  /** Owner approved D11 on 2026-09-25. First full trading week after approval, and after
   *  jev-latest's release date (2026-09-15): no candle in the window can be in Jev's training data. */
  primaryWindowStart: '2026-09-28T00:00:00Z',
  /** Every in-window candle with a valid V1 trade plan (tiers A–D) on these timeframes… */
  allTierTimeframes: ['M30', 'H1'] as readonly Timeframe[],
  /** …plus tier-A candles only on these. */
  tierATimeframes: ['M5', 'M15'] as readonly Timeframe[],
  minCalendarMonths: 3,
  minLabelledSamples: 1500,
  aucLowerBound: 0.52,
  /** Top-minus-bottom tercile expectancy must be positive in at least this share of months. */
  monthlySignShare: 2 / 3,
  bootstrapIterations: 2000,
  bootstrapSeed: 20260925,
  eceBins: 10,
} as const;

/** Baseline logistic regression design period (§4): 2015–2021 only, frozen before launch. */
export const BASELINE_PERIOD = { start: '2015-01-01T00:00:00Z', end: '2022-01-01T00:00:00Z' } as const;
