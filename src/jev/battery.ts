/**
 * Jev question battery (docs/v1/jev-research-spec.md §3, D11). Wording is frozen: any edit
 * changes PROMPT_HASH, which restarts the validation clock (§5). Only Q1 is primary evidence.
 * Wire format: TypeSafe System One (`POST /v1/systemone`), questions keyed by name.
 */
import { createHash } from 'node:crypto';
import { SNAPSHOT_VERSION, type Snapshot } from './snapshot.js';

export type NoulQuestion = { type: 'noul'; instructions: string; criteria?: { true?: string; false?: string } };
export type ChoiceQuestion = { type: 'choice'; instructions: string; criteria: Record<string, string> };
export type Question = NoulQuestion | ChoiceQuestion;

export const PRIMARY_QUESTION = 'q1_two_r_first';

export const BATTERY: Readonly<Record<string, Question>> = {
  [PRIMARY_QUESTION]: {
    type: 'noul',
    instructions:
      'A long (buy) position is opened at the planned Buy Limit entry described in the state. R is the planned stop distance (v1.stopDistancePips). Will price reach entry + 2R before it reaches entry − 1R?',
    criteria: {
      true: 'Price rises 2R above the entry before falling 1R below it.',
      false: 'Price falls 1R below the entry first (the stop is hit first).',
    },
  },
  q2_trend_continues: {
    type: 'noul',
    instructions: 'Will the uptrend continue over the next 8 candles of this timeframe?',
    criteria: { true: 'Price is higher and the uptrend intact 8 candles later.', false: 'The uptrend stalls or reverses within 8 candles.' },
  },
  q3_pullback_exhausted: {
    type: 'noul',
    instructions: 'Is the pullback exhausted, with sellers losing control at this candle?',
    criteria: { true: 'Selling pressure is fading and buyers are taking over.', false: 'Sellers remain in control; the pullback is likely to extend.' },
  },
  q4_regime: {
    type: 'choice',
    instructions: 'What is the current market regime on this timeframe?',
    criteria: {
      trending: 'Directional movement with orderly pullbacks.',
      ranging: 'Sideways movement between recent highs and lows.',
      volatile_choppy: 'Large, erratic candles without clear direction.',
    },
  },
  q5_momentum: {
    type: 'choice',
    instructions: 'Is momentum confirming or diverging from the price action?',
    criteria: {
      confirming: 'Momentum supports the upward move.',
      neutral: 'Momentum gives no clear signal.',
      diverging: 'Momentum contradicts the price action (e.g. weakening while price rises).',
    },
  },
};

export const STATE_PREAMBLE =
  'EUR/USD candle snapshot at the close of a candle that the deterministic V1 rules evaluated as a possible long (buy) setup. ' +
  'No dates or absolute prices are given; distances are in pips or in units of the 20-candle mean range (InRanges). ' +
  'RSI is RSI(14); EMA fast/slow are EMA50/EMA200. "v1" lists which of the four V1 rules passed.';

/** The `state` sent to Jev: fixed preamble plus the snapshot, with a stable key order. */
export function renderState(snapshot: Snapshot): { description: string; snapshot: Snapshot } {
  return { description: STATE_PREAMBLE, snapshot };
}

/** sha256 over the battery, the preamble and the snapshot version. */
export const PROMPT_HASH = `sha256:${createHash('sha256')
  .update(JSON.stringify({ battery: BATTERY, preamble: STATE_PREAMBLE, snapshotVersion: SNAPSHOT_VERSION }))
  .digest('hex')}`;
