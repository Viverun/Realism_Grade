/**
 * Daily cap, de-duplication and cooldown (spec §10). Signals must be offered in
 * chronological order; each outcome depends only on earlier offers (NL9/NL10).
 */
import type { AppConfig } from '../config/schema.js';
import { TIMEFRAME_MS, type Timeframe } from '../core/timeframe.js';
import { makeLocalClock } from '../core/timezone.js';

export type AlertOutcome = 'emailed' | 'duplicate' | 'cooldown' | 'capped';

export interface AlertCandidate {
  id: string;
  timeframe: Timeframe;
  openTime: number;
  closeTime: number;
}

export class AlertPolicy {
  private readonly sent = new Set<string>();
  private readonly perDay = new Map<string, number>();
  private readonly lastAlertOpen = new Map<Timeframe, number>();
  private lastCloseTime = -Infinity;
  private readonly local: ReturnType<typeof makeLocalClock>;

  constructor(private readonly alerts: AppConfig['alerts']) {
    this.local = makeLocalClock(alerts.timezone);
  }

  offer(candidate: AlertCandidate): AlertOutcome {
    if (candidate.closeTime < this.lastCloseTime) {
      throw new Error(`Signals must be offered chronologically: ${candidate.id}`);
    }
    this.lastCloseTime = candidate.closeTime;
    if (this.sent.has(candidate.id)) return 'duplicate';

    // Cooldown: blocked for `cooldownCandles` candle-durations after an emailed alert on this timeframe.
    const last = this.lastAlertOpen.get(candidate.timeframe);
    if (last !== undefined && candidate.openTime - last <= this.alerts.cooldownCandles * TIMEFRAME_MS[candidate.timeframe]) {
      return 'cooldown';
    }

    const day = this.local(candidate.closeTime).date;
    const count = this.perDay.get(day) ?? 0;
    if (count >= this.alerts.maxPerDay) return 'capped'; // chronological first-N

    this.perDay.set(day, count + 1);
    this.sent.add(candidate.id);
    this.lastAlertOpen.set(candidate.timeframe, candidate.openTime);
    return 'emailed';
  }
}
