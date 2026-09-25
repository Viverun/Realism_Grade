/**
 * Prices are stored as integer points (1 point = 10^-digits; for EUR/USD 0.00001)
 * so comparisons and pip math are exact. See docs/v1/strategy-rules-v1.md §0.
 */
export type Points = number;

export function priceToPoints(price: number | string, digits: number): Points {
  const value = typeof price === 'string' ? Number(price.trim()) : price;
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid price: ${String(price)}`);
  }
  return Math.round(value * 10 ** digits);
}

export function pointsToPrice(points: number, digits: number): number {
  return Number((points / 10 ** digits).toFixed(digits));
}

export function formatPoints(points: number, digits: number): string {
  return (points / 10 ** digits).toFixed(digits);
}

/** Converts a pip distance from config (e.g. 1.5 pips) to whole points. */
export function pipsToPoints(pips: number, pointsPerPip: number): Points {
  return Math.round(pips * pointsPerPip);
}

export function pointsToPips(points: number, pointsPerPip: number): number {
  return points / pointsPerPip;
}
