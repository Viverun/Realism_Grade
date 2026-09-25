/**
 * A synthetic BUY signal for exercising the email step end to end (owner, 2026-09-25).
 * Not derived from market data. Prices reuse the PDF's lot-size example (entry 1.0860,
 * stop 1.0840, 20 pips; $1,000 at 1% → 0.05 lots), so the email is easy to verify by hand.
 * Sizing uses the real formula (spec §9) and the configured account.
 */
import type { AppConfig } from '../config/schema.js';
import { configHash } from '../config/load.js';
import { priceToPoints } from '../core/price.js';
import { TIMEFRAME_MS, type Timeframe } from '../core/timeframe.js';
import type { Decision, TradePlan } from '../strategy/engine.js';
import { computeSizing } from '../strategy/sizing.js';

export function syntheticSignal(config: AppConfig, opts: { timeframe?: Timeframe; closeTimeUtc?: number } = {}): { decision: Decision; plan: TradePlan } {
  const timeframe = opts.timeframe ?? 'H1';
  const closeTime = opts.closeTimeUtc ?? Date.parse('2026-09-28T10:00:00Z'); // 14:00 Dubai
  const openTime = closeTime - TIMEFRAME_MS[timeframe];
  const p = (price: number): number => priceToPoints(price, config.instrument.digits);
  const entry = p(1.086);
  const refSl = p(1.084);
  const sizing = computeSizing(entry, refSl, config.account, { pointsPerPip: config.instrument.pointsPerPip, minSlPips: config.sizing.minSlPips });
  const plan: TradePlan = { entry, refSl, sizing };
  const decision: Decision = {
    id: `${config.instrument.symbol}|${timeframe}|SYNTHETIC-${new Date(openTime).toISOString()}`,
    timeframe,
    openTime,
    closeTime,
    closeLocal: '',
    ohlc: [p(1.0851), p(1.0874), p(1.0846), p(1.0870)],
    emaFast: p(1.0852),
    emaSlow: p(1.0801),
    rsi: 41,
    rsiPrev: 33,
    trend: true,
    pullback: { ok: true, touch: true, firstTouchOpenTime: openTime, swing: true },
    rsiCheck: { ok: true, branch: 'recovery' },
    candle: { ok: true, patterns: ['pin_bar'] },
    inWindow: true,
    buySignal: true,
    plan,
    status: 'signal',
    configHash: configHash(config),
  };
  return { decision, plan };
}
