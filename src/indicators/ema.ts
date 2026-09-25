function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period < 1) throw new Error(`Invalid period: ${period}`);
}

/**
 * Exponential moving average (spec §0): alpha = 2/(n+1), seeded with the SMA of the
 * first n values. Index k depends only on values[0..k]; entries before n-1 are null.
 */
export function ema(values: readonly number[], period: number): (number | null)[] {
  assertPeriod(period);
  const out: (number | null)[] = new Array<number | null>(values.length).fill(null);
  if (values.length < period) return out;
  const alpha = 2 / (period + 1);
  let sum = 0;
  for (let k = 0; k < period; k++) sum += values[k]!;
  let previous = sum / period;
  out[period - 1] = previous;
  for (let k = period; k < values.length; k++) {
    previous += alpha * (values[k]! - previous);
    out[k] = previous;
  }
  return out;
}
