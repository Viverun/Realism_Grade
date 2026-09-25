/**
 * Pre-registered D11 test protocol constants (docs/v1/jev-research-spec.md §4), all [POLICY, D11].
 * Frozen at approval; changing any of them restarts the validation clock.
 */
import type { Timeframe } from '../core/timeframe.js';

export const PROTOCOL = {
  /** Owner approved D11 on 2026-09-25. First full trading week after approval, and after
   *  jev-latest's release date (2026-09-10, confirmed by `jev:probe` on 2026-09-25): no candle in the window can be in Jev's training data. */
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

export type ScoringMode = 'forward' | 'pilot' | 'fake';

/**
 * Which candle-close range a scoring run may cover.
 * - forward (evidence): must start at or after the primary window start.
 * - pilot (real API, operational check only; never evidence): must END at or before the
 *   window start, so a pilot can never consume window candles.
 * - fake (deterministic stand-in): any range.
 * Throws with the reason when the range is not allowed.
 */
export function checkScoringRange(startMs: number, endMs: number, mode: ScoringMode): void {
  if (!(Number.isFinite(startMs) && Number.isFinite(endMs)) || endMs <= startMs) throw new Error('Invalid scoring range: --end must be after --start');
  const windowStart = Date.parse(PROTOCOL.primaryWindowStart);
  if (mode === 'forward' && startMs < windowStart) {
    throw new Error(`Refusing to score before the primary window start ${PROTOCOL.primaryWindowStart}: earlier candles may be in Jev's training data (spec §4). Use --pilot for an operational check.`);
  }
  if (mode === 'pilot' && endMs > windowStart) {
    throw new Error(`A pilot must end at or before the primary window start ${PROTOCOL.primaryWindowStart}; window candles are reserved for the evidence log.`);
  }
}
