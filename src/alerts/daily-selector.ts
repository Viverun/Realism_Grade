/**
 * V1.1 daily selector (docs/v1/selection-v1_1.md, owner decision D9): exactly one alert per
 * configured slot on each trading day, so exactly `slots.length` alerts per day unless data or
 * price make an alert impossible (logged as `missed`).
 *
 * Causal by construction: candidates are fed in chronological order of candle close, an
 * immediate alert uses only the candles closing now, and a slot-end fallback uses only the
 * latest candles that closed inside the slot (never later ones).
 */
import type { AppConfig } from '../config/schema.js';
import type { Timeframe } from '../core/timeframe.js';
import { clockToMinutes, makeLocalClock, makeUtcFromLocal } from '../core/timezone.js';
import type { Decision, TradePlan } from '../strategy/engine.js';
import type { Scored } from '../strategy/score.js';

export interface Candidate {
  decision: Decision;
  scored: Scored;
  plan: TradePlan;
  /** Higher = higher timeframe (tie-break preference). */
  tfRank: number;
}

/** 'none' = slot ended with no full setup while fallback is off (not a failure). */
export type SelectionKind = 'immediate' | 'fallback' | 'missed' | 'none';

export interface SlotSelection {
  date: string;
  slot: number;
  kind: SelectionKind;
  sendTime: number;
  candidate: Candidate | null;
}

interface SlotState {
  date: string;
  slot: number;
  startUtc: number;
  endUtc: number;
  done: boolean;
}

export type Validate = (candidate: Candidate, sendTime: number) => boolean;

const better = (a: Candidate, b: Candidate): number =>
  b.scored.score - a.scored.score || b.tfRank - a.tfRank || b.decision.closeTime - a.decision.closeTime;

export class DailySelector {
  private readonly local: ReturnType<typeof makeLocalClock>;
  private readonly toUtc: ReturnType<typeof makeUtcFromLocal>;
  private readonly slots: { start: number; end: number }[];
  private readonly weekdays: Set<number>;
  private readonly states = new Map<string, SlotState>();
  private readonly pending: SlotState[] = [];
  private readonly latestByTf = new Map<Timeframe, Candidate>();
  private readonly sent = new Set<string>();
  private lastTime = -Infinity;

  constructor(
    private readonly selection: AppConfig['selection'],
    timeZone: string,
    private readonly validate: Validate,
  ) {
    this.local = makeLocalClock(timeZone);
    this.toUtc = makeUtcFromLocal(timeZone);
    this.slots = selection.slots.map((s) => ({ start: clockToMinutes(s.start), end: clockToMinutes(s.end) }));
    this.weekdays = new Set(selection.weekdays);
  }

  /** Registers every slot of a trading day the first time that day is seen. */
  private registerDay(date: string): void {
    if (this.states.has(`${date}|0`)) return;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!this.weekdays.has(weekday)) return;
    this.slots.forEach((s, k) => {
      const state: SlotState = { date, slot: k, startUtc: this.toUtc(date, s.start), endUtc: this.toUtc(date, s.end), done: false };
      this.states.set(`${date}|${k}`, state);
      this.pending.push(state);
    });
    this.pending.sort((a, b) => a.endUtc - b.endUtc);
  }

  private slotAt(utcMs: number): SlotState | null {
    const t = this.local(utcMs);
    const k = this.slots.findIndex((s) => t.minuteOfDay >= s.start && t.minuteOfDay < s.end);
    if (k < 0) return null;
    this.registerDay(t.date);
    return this.states.get(`${t.date}|${k}`) ?? null;
  }

  private select(state: SlotState, kind: SelectionKind, sendTime: number, candidate: Candidate | null): SlotSelection {
    state.done = true;
    if (candidate) this.sent.add(candidate.decision.id);
    return { date: state.date, slot: state.slot, kind, sendTime, candidate };
  }

  /** Finalises unfilled slots ending at or before `t` (inclusive) or strictly before (exclusive). */
  private finalise(t: number, inclusive: boolean): SlotSelection[] {
    const out: SlotSelection[] = [];
    while (this.pending.length && (inclusive ? this.pending[0]!.endUtc <= t : this.pending[0]!.endUtc < t)) {
      const state = this.pending.shift()!;
      if (state.done) continue;
      if (!this.selection.fallback) {
        out.push(this.select(state, 'none', state.endUtc, null));
        continue;
      }
      const pool = [...this.latestByTf.values()]
        .filter((c) => c.decision.closeTime >= state.startUtc && c.decision.closeTime <= state.endUtc && !this.sent.has(c.decision.id))
        .sort(better);
      const pick = pool.find((c) => this.validate(c, state.endUtc)) ?? null;
      out.push(this.select(state, pick ? 'fallback' : 'missed', state.endUtc, pick));
    }
    return out;
  }

  /** Feeds all candidates whose candles closed at `closeTime` (strictly increasing between calls). */
  onClose(closeTime: number, candidates: readonly Candidate[]): SlotSelection[] {
    if (closeTime <= this.lastTime) throw new Error('DailySelector: closes must be strictly increasing');
    this.lastTime = closeTime;
    const out = this.finalise(closeTime, false);
    const slot = this.slotAt(closeTime);
    for (const c of candidates) {
      const prev = this.latestByTf.get(c.decision.timeframe);
      if (!prev || prev.decision.closeTime < c.decision.closeTime) this.latestByTf.set(c.decision.timeframe, c);
    }
    out.push(...this.finalise(closeTime, true));
    if (slot && !slot.done) {
      const eligible = candidates
        .filter((c) => c.scored.score >= this.selection.immediateMinScore && !this.sent.has(c.decision.id))
        .sort(better);
      const pick = eligible.find((c) => this.validate(c, closeTime));
      if (pick) out.push(this.select(slot, 'immediate', closeTime, pick));
    }
    return out;
  }

  /** Finalises every slot that ended at or before `untilMs` (e.g. the end of the data). */
  finish(untilMs: number): SlotSelection[] {
    return this.finalise(untilMs, true);
  }
}
