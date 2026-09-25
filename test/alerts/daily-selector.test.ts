import { describe, expect, it } from 'vitest';
import { DailySelector, type Candidate, type SlotSelection } from '../../src/alerts/daily-selector.js';
import { TIMEFRAME_MS, TIMEFRAMES, type Timeframe } from '../../src/core/timeframe.js';
import type { Decision } from '../../src/strategy/engine.js';
import type { Tier } from '../../src/strategy/score.js';
import { testConfig } from '../helpers/fixtures.js';

const selection = testConfig((raw) => (raw.selection.mode = 'daily_top3')).selection; // slots 08–13, 13–18, 18–23 Dubai
const MON = Date.parse('2026-09-21T00:00:00Z'); // Monday
const at = (hhmmUtc: string, day = MON): number => day + Number(hhmmUtc.slice(0, 2)) * 3_600_000 + Number(hhmmUtc.slice(3)) * 60_000;

function cand(tf: Timeframe, closeTime: number, score: number, entry = 100): Candidate {
  const tier: Tier = score === 4 ? 'A' : score === 3 ? 'B' : score === 2 ? 'C' : 'D';
  const decision = { id: `EURUSD|${tf}|${new Date(closeTime - TIMEFRAME_MS[tf]).toISOString()}`, timeframe: tf, closeTime } as Decision;
  return { decision, scored: { score, tier, failed: [], counterTrend: false }, plan: { entry, refSl: 0, sizing: {} as never }, tfRank: TIMEFRAMES.indexOf(tf) };
}

/** M15 candidates every 15 min over [fromUtc, toUtc], scored by `score(t)`. */
function stream(fromUtc: number, toUtc: number, score: (t: number) => number): [number, Candidate[]][] {
  const out: [number, Candidate[]][] = [];
  for (let t = fromUtc; t <= toUtc; t += TIMEFRAME_MS.M15) out.push([t, [cand('M15', t, score(t))]]);
  return out;
}

function run(events: [number, Candidate[]][], until: number, validate = (_c: Candidate, _t: number) => true): SlotSelection[] {
  const sel = new DailySelector(selection, 'Asia/Dubai', validate);
  const out = events.flatMap(([t, cs]) => sel.onClose(t, cs));
  return [...out, ...sel.finish(until)];
}

describe('DailySelector (V1.1, D9)', () => {
  it('sends exactly one alert per slot: fallbacks at 13:00, 18:00 and 23:00 Dubai', () => {
    const out = run(stream(at('04:00'), at('19:00'), () => 2), at('23:59'));
    expect(out.map((s) => [s.slot, s.kind])).toEqual([[0, 'fallback'], [1, 'fallback'], [2, 'fallback']]);
    expect(out.map((s) => s.sendTime)).toEqual([at('09:00'), at('14:00'), at('19:00')]);
    // Fallback uses the latest candle closed by the slot end, never a later one.
    for (const s of out) expect(s.candidate!.decision.closeTime).toBe(s.sendTime);
  });

  it('sends a full V1 signal immediately and then closes the slot', () => {
    const out = run(stream(at('04:00'), at('19:00'), (t) => (t === at('06:00') || t === at('07:00') ? 4 : 1)), at('23:59'));
    expect(out[0]).toMatchObject({ slot: 0, kind: 'immediate', sendTime: at('06:00') });
    expect(out.filter((s) => s.slot === 0)).toHaveLength(1);
    expect(out).toHaveLength(3);
  });

  it('prefers the higher score, then the higher timeframe', () => {
    const t = at('08:59') + 60_000; // 09:00Z = 13:00 Dubai (slot 0 end)
    const events: [number, Candidate[]][] = [[at('05:00'), [cand('M15', at('05:00'), 2)]], [t, [cand('M15', t, 3), cand('H1', t, 3), cand('M5', t, 1)]]];
    const out = run(events, t);
    expect(out[0]!.candidate!.decision.timeframe).toBe('H1');
  });

  it('never looks ahead: later candles cannot change an earlier slot', () => {
    const base = stream(at('04:00'), at('19:00'), () => 2);
    const full = run(base, at('23:59'));
    const perturbed = run(base.map(([t, cs]) => [t, t > at('09:00') ? [cand('M15', t, 4)] : cs]), at('23:59'));
    expect(perturbed[0]).toEqual(full[0]);
    const truncated = run(base.filter(([t]) => t <= at('09:00')), at('09:00'));
    expect(truncated[0]).toEqual(full[0]);
  });

  it('full setup only (fallback off): only score-4 alerts; empty slots are "none", not misses', () => {
    const sel = new DailySelector({ ...selection, fallback: false }, 'Asia/Dubai', () => true);
    const events = stream(at('04:00'), at('19:00'), (t) => (t === at('06:00') ? 4 : 3));
    const out = [...events.flatMap(([t, cs]) => sel.onClose(t, cs)), ...sel.finish(at('23:59'))];
    expect(out.map((s) => s.kind)).toEqual(['immediate', 'none', 'none']);
    expect(out[0]!.candidate!.scored.score).toBe(4);
  });

  it('logs a miss when no candidate passes the send-time check', () => {
    const out = run(stream(at('04:00'), at('19:00'), () => 2), at('23:59'), () => false);
    expect(out.map((s) => s.kind)).toEqual(['missed', 'missed', 'missed']);
  });

  it('does not create alerts on weekends', () => {
    const sat = MON - 2 * 86_400_000;
    expect(run(stream(at('04:00', sat), at('19:00', sat), () => 4), at('23:59', sat))).toEqual([]);
  });

  it('never sends the same candle twice (dedup across slots)', () => {
    const t = at('09:00');
    const out = run([[t, [cand('H1', t, 2)]]], at('14:00'));
    const ids = out.filter((s) => s.candidate).map((s) => s.candidate!.decision.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('requires strictly increasing close times', () => {
    const sel = new DailySelector(selection, 'Asia/Dubai', () => true);
    sel.onClose(at('05:00'), []);
    expect(() => sel.onClose(at('05:00'), [])).toThrow(/strictly increasing/);
  });
});
