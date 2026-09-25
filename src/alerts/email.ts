/**
 * V1 signal email (context-V1 §13; spec §7–§9; PDF review P7). Renders the message the
 * trader uses to place a Buy Limit manually in Exness. Rendering is pure: no I/O.
 *
 * Live alerts are DISABLED (owner, 2026-09-25): only synthetic/test messages may be sent
 * until the owner selects a live timeframe (D8) and explicitly enables alerts.
 */
import type { AppConfig } from '../config/schema.js';
import { formatPoints } from '../core/price.js';
import { TIMEFRAME_MS, type Timeframe } from '../core/timeframe.js';
import { makeLocalClock } from '../core/timezone.js';
import type { Decision, TradePlan } from '../strategy/engine.js';

/** [POLICY, owner 2026-09-25] Changing this requires an explicit owner decision, not config. */
export const LIVE_ALERTS_ENABLED = false;

export type EmailKind = 'synthetic' | 'live';

export interface EmailMessage {
  kind: EmailKind;
  subject: string;
  text: string;
  /** Idempotency key: the signal ID (spec §10). */
  signalId: string;
}

export class LiveAlertsDisabledError extends Error {
  constructor() {
    super('Live alerts are disabled (owner decision 2026-09-25): only synthetic test emails may be sent.');
  }
}

/** Throws unless the message may be sent under the current policy. */
export function assertSendable(message: EmailMessage): void {
  if (message.kind === 'live' && !LIVE_ALERTS_ENABLED) throw new LiveAlertsDisabledError();
}

const TF_LABEL: Record<Timeframe, string> = { M5: '5m', M15: '15m', M30: '30m', H1: '1H' };
const TEST_PREFIX = '[TEST — SYNTHETIC SIGNAL, DO NOT TRADE] ';

function localLabel(config: AppConfig, utcMs: number): string {
  const t = makeLocalClock(config.alerts.timezone)(utcMs);
  const hh = String(Math.floor(t.minuteOfDay / 60)).padStart(2, '0');
  const mm = String(t.minuteOfDay % 60).padStart(2, '0');
  return `${t.date} ${hh}:${mm}`;
}

export function renderSignalEmail(decision: Decision, plan: TradePlan, config: AppConfig, kind: EmailKind): EmailMessage {
  const digits = config.instrument.digits;
  const price = (points: number): string => formatPoints(points, digits);
  const tz = config.alerts.timezone === 'Asia/Dubai' ? 'Dubai' : config.alerts.timezone;
  const tick = (ok: boolean): string => (ok ? '✓' : '✗');
  const [, , , close] = decision.ohlc;
  const trendFast = decision.emaFast !== null && decision.emaSlow !== null && decision.emaFast > decision.emaSlow;
  const aboveFast = decision.emaFast !== null && close > decision.emaFast;
  const validUntil = decision.closeTime + config.entry.validCandles * TIMEFRAME_MS[decision.timeframe];
  const s = plan.sizing;
  const pair = config.instrument.symbol === 'EURUSD' ? 'EUR/USD' : config.instrument.symbol;

  const L: string[] = [];
  if (kind === 'synthetic') {
    L.push('*** TEST EMAIL — SYNTHETIC SIGNAL ***', 'This is not a market signal. Do NOT place this order.', '');
  }
  L.push(
    'SIGNAL',
    `Pair:            ${pair}`,
    'Direction:       BUY LIMIT',
    `Entry price:     ${price(plan.entry)}`,
    `Volume:          ${s.lots.toFixed(2)} lots${s.raisedToMinLot ? ' (raised to the minimum lot)' : ''}`,
    `Recommended stop — set manually: ${price(plan.refSl)}  (${s.slPips.toFixed(1)} pips below entry)`,
    `Timeframe:       ${TF_LABEL[decision.timeframe]}`,
    `Signal time:     ${localLabel(config, decision.closeTime)} ${tz} (candle close)`,
    `Valid until:     ${localLabel(config, validUntil)} ${tz} (close of the next candle; advisory)`,
    '',
    'TECHNICAL CONDITIONS',
    `50 EMA > 200 EMA       ${tick(trendFast)}`,
    `Price > 50 EMA         ${tick(aboveFast)}`,
    `Pullback to 50 EMA     ${tick(decision.pullback.ok)}`,
    `RSI confirmation       ${tick(decision.rsiCheck.ok)}`,
    `Bullish candle         ${tick(decision.candle.ok)}${decision.candle.patterns.length ? ` (${decision.candle.patterns.join(', ').replace('_', ' ')})` : ''}`,
    '',
    'SIGNAL STATUS',
    decision.buySignal ? 'BUY setup confirmed' : 'BUY setup NOT confirmed',
    '',
    'RISK (PLANNED)',
    `Planned risk: $${s.plannedRiskUsd.toFixed(2)} (${s.plannedRiskPct.toFixed(2)}% of $${config.account.balance}) if the recommended stop is set.`,
    'The actual loss can be larger if the stop slips (gaps/news) or the order is placed differently.',
    '',
    'EXECUTION',
    `Place a BUY LIMIT in Exness manually at ${price(plan.entry)} for ${s.lots.toFixed(2)} lots, and set the recommended stop yourself.`,
    'If price is already below the entry when you place the order, skip this signal.',
    'The system does not place, monitor or modify orders or stops.',
    '',
    `Signal ID: ${decision.id}`,
    `Config: ${decision.configHash}`,
  );
  return {
    kind,
    subject: `${kind === 'synthetic' ? TEST_PREFIX : ''}${pair} Entry Signal — BUY LIMIT`,
    text: `${L.join('\n')}\n`,
    signalId: decision.id,
  };
}
