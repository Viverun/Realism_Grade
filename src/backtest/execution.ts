/**
 * Backtest execution model (spec §11). Runs strictly AFTER the decision and only reads
 * ticks at or after the signal candle's close (NL11). Nothing here feeds back into decisions.
 */
import type { TickStore } from './tick-store.js';

export type EntryModel = 'buy_limit' | 'pdf_market';

export type SendCheck = { ok: true } | { ok: false; status: 'entry_not_below_market' | 'no_data' };

export type ExecutionStatus = 'filled' | 'expired' | 'invalid_at_placement' | 'no_data';

export interface Execution {
  status: ExecutionStatus;
  placementTime: number;
  placementAsk: number | null;
  fillIndex: number | null;
  fillTime: number | null;
  fillPrice: number | null;
}

/** §11 step 1 (Buy Limit only): the entry must be below the Ask of the first tick at/after close. */
export function sendTimeCheck(store: TickStore, closeTime: number, entry: number, minDistancePoints: number): SendCheck {
  const k = store.firstAtOrAfter(closeTime);
  if (k >= store.length) return { ok: false, status: 'no_data' };
  const ask = store.ask(k);
  // Spec §8 V3: ENTRY <= ask − minLimitDistance, and strictly ENTRY < ask.
  return entry <= ask - minDistancePoints && entry < ask ? { ok: true } : { ok: false, status: 'entry_not_below_market' };
}

/**
 * §11 steps 3–4. Buy Limit: placement check at P, then filled at ENTRY by the first tick in
 * (P, E] with Ask <= ENTRY (no price improvement modelled). PDF market baseline: filled at the
 * Ask of the first tick at/after P (PDF review P4).
 */
export function simulateExecution(
  store: TickStore,
  model: EntryModel,
  opts: { closeTime: number; expiryTime: number; placementDelayMs: number; entry: number; minDistancePoints: number },
): Execution {
  const placementTime = opts.closeTime + opts.placementDelayMs;
  const kP = store.firstAtOrAfter(placementTime);
  const none: Execution = { status: 'no_data', placementTime, placementAsk: null, fillIndex: null, fillTime: null, fillPrice: null };
  if (kP >= store.length) return none;
  const placementAsk = store.ask(kP);

  if (model === 'pdf_market') {
    return { status: 'filled', placementTime, placementAsk, fillIndex: kP, fillTime: store.timeAt(kP), fillPrice: placementAsk };
  }

  if (!(opts.entry <= placementAsk - opts.minDistancePoints && opts.entry < placementAsk)) {
    return { ...none, status: 'invalid_at_placement', placementAsk };
  }
  for (let k = kP + 1; k < store.length && store.timeAt(k) <= opts.expiryTime; k++) {
    if (store.ask(k) <= opts.entry) {
      return { status: 'filled', placementTime, placementAsk, fillIndex: k, fillTime: store.timeAt(k), fillPrice: opts.entry };
    }
  }
  return { ...none, status: 'expired', placementAsk };
}
