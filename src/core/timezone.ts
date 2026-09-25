const HOUR_MS = 3_600_000;
const DAY_MINUTES = 1440;

export interface LocalTime {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Minutes since local midnight (0–1439). */
  minuteOfDay: number;
}

/**
 * Fast UTC → local-time conversion for an IANA zone. The zone offset is computed with
 * Intl once per UTC hour and memoised, which is exact for zones whose offsets change on
 * hour boundaries and fast enough for millions of ticks.
 */
export function makeLocalClock(timeZone: string): (utcMs: number) => LocalTime {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const offsets = new Map<number, number>();

  const offsetFor = (hourBucket: number): number => {
    let offset = offsets.get(hourBucket);
    if (offset === undefined) {
      const at = hourBucket * HOUR_MS;
      const parts = Object.fromEntries(format.formatToParts(at).map((p) => [p.type, p.value]));
      const localAsUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
      );
      offset = localAsUtc - at;
      offsets.set(hourBucket, offset);
    }
    return offset;
  };

  return (utcMs: number): LocalTime => {
    const local = utcMs + offsetFor(Math.floor(utcMs / HOUR_MS));
    const iso = new Date(local).toISOString();
    return {
      date: iso.slice(0, 10),
      minuteOfDay: Math.floor(local / 60_000) % DAY_MINUTES,
    };
  };
}

/**
 * Local calendar date + minutes since local midnight → UTC ms (inverse of makeLocalClock).
 * `minuteOfDay` may be 1440 ("24:00" = next local midnight).
 */
export function makeUtcFromLocal(timeZone: string): (date: string, minuteOfDay: number) => number {
  const clock = makeLocalClock(timeZone);
  const localMs = (utcMs: number): number => {
    const t = clock(utcMs);
    return Date.parse(`${t.date}T00:00:00Z`) + t.minuteOfDay * 60_000;
  };
  return (date: string, minuteOfDay: number): number => {
    const wanted = Date.parse(`${date}T00:00:00Z`) + minuteOfDay * 60_000;
    let utc = wanted - (localMs(wanted) - wanted);
    utc = wanted - (localMs(utc) - utc);
    return utc;
  };
}

/** Parses "HH:MM" (or "24:00") into minutes since midnight. */
export function clockToMinutes(clock: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!match) throw new Error(`Invalid clock time: ${clock}`);
  return Number(match[1]) * 60 + Number(match[2]);
}
