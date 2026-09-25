import type { AppConfig } from '../config/schema.js';
import { parseConfig } from '../config/load.js';
import { TIMEFRAMES } from '../core/timeframe.js';
import type { EntryModel } from './execution.js';

export interface Variant {
  name: string;
  description: string;
  config: AppConfig;
  entryModel: EntryModel;
}

function clone(config: AppConfig): AppConfig {
  return structuredClone(config);
}

/**
 * One-at-a-time variants around the approved default (spec §11). Each is re-validated
 * through the config schema. `pdf_market_baseline` is a backtest-only baseline (P6).
 */
export function buildVariants(base: AppConfig): Variant[] {
  const variants: Variant[] = [];
  const add = (name: string, description: string, mutate: (c: AppConfig) => void, entryModel: EntryModel = 'buy_limit'): void => {
    const c = clone(base);
    mutate(c);
    variants.push({ name, description, config: parseConfig(c), entryModel });
  };
  add('default', 'Approved V1 defaults (RSI oversold 35 [PDF-INTERP], Buy Limit close−offset)', () => undefined);
  add('rsi_oversold_30', 'RSI oversold = 30 (PDF baseline)', (c) => {
    c.strategy.rsi.oversold = 30;
  });
  add('rsi_recovery_only', 'RSI recovery branch only', (c) => {
    c.strategy.rsi.mode = 'recovery_only';
  });
  add('rsi_above_mid_only', 'RSI above-50 branch only', (c) => {
    c.strategy.rsi.mode = 'above_mid_only';
  });
  for (const factor of [0.5, 2]) {
    add(`touch_tol_x${factor}`, `Touch tolerance × ${factor}`, (c) => {
      for (const tf of TIMEFRAMES) c.strategy.timeframes[tf].touchTolPips *= factor;
    });
  }
  add('entry_candle_mid', 'Buy Limit at the signal candle midpoint', (c) => {
    c.entry.mode = 'candle_mid';
  });
  for (const n of [0, 6]) {
    add(`cooldown_${n}`, `Cooldown ${n} candles`, (c) => {
      c.alerts.cooldownCandles = n;
    });
  }
  if (base.backtest.includePdfMarketBaseline) {
    add('pdf_market_baseline', 'PDF entry: market buy at next open, filled at Ask (backtest-only baseline, P6)', () => undefined, 'pdf_market');
  }
  return variants;
}
