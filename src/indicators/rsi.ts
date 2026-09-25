function rsiFromAverages(avgGain: number, avgLoss: number): number {
  // MT5 convention for the degenerate cases.
  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/**
 * Wilder's RSI (spec §0). The first value (index n) uses the SMA of the first n
 * close-to-close changes; later values use Wilder smoothing avg = (avg*(n-1) + x)/n.
 * Index k depends only on closes[0..k]; entries before n are null.
 */
export function rsi(closes: readonly number[], period: number): (number | null)[] {
  if (!Number.isInteger(period) || period < 1) throw new Error(`Invalid period: ${period}`);
  const out: (number | null)[] = new Array<number | null>(closes.length).fill(null);
  if (closes.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let k = 1; k <= period; k++) {
    const change = closes[k]! - closes[k - 1]!;
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = rsiFromAverages(avgGain, avgLoss);
  for (let k = period + 1; k < closes.length; k++) {
    const change = closes[k]! - closes[k - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    out[k] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}
