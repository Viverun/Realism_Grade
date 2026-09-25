export const TIMEFRAMES = ['M5', 'M15', 'M30', 'H1'] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

const MINUTE_MS = 60_000;

export const TIMEFRAME_MS: Readonly<Record<Timeframe, number>> = {
  M5: 5 * MINUTE_MS,
  M15: 15 * MINUTE_MS,
  M30: 30 * MINUTE_MS,
  H1: 60 * MINUTE_MS,
};

export function isTimeframe(value: string): value is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(value);
}

/** Start of the UTC-aligned bucket containing `timeMs`. */
export function bucketStart(timeMs: number, timeframe: Timeframe): number {
  const size = TIMEFRAME_MS[timeframe];
  return Math.floor(timeMs / size) * size;
}

export function candleCloseTime(openTimeMs: number, timeframe: Timeframe): number {
  return openTimeMs + TIMEFRAME_MS[timeframe];
}
