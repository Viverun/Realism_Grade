/**
 * Logistic-regression baseline for the D11 test (docs/v1/jev-research-spec.md §4): fitted on
 * 2015–2021 only and frozen (coefficients committed) before the primary window opens.
 * Features are standardised with the training mean/sd; fitted by Newton–IRLS with a small
 * L2 penalty (not on the intercept). Deterministic.
 */
export interface LogisticModel {
  featureNames: string[];
  mean: number[];
  sd: number[];
  /** [intercept, ...weights] on standardised features. */
  coef: number[];
  l2: number;
  trainedOn: { start: string; end: string; samples: number; positives: number };
  snapshotVersion: string;
}

const sigmoid = (z: number): number => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    const d = m[c]![c]!;
    if (Math.abs(d) < 1e-12) throw new Error('logistic: singular Hessian');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / d;
      if (f !== 0) for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

export function fitLogistic(
  x: readonly (readonly number[])[],
  y: readonly number[],
  meta: Omit<LogisticModel, 'mean' | 'sd' | 'coef' | 'l2'>,
  l2 = 1,
  iterations = 50,
): LogisticModel {
  const n = x.length;
  const d = meta.featureNames.length;
  if (!n) throw new Error('logistic: no samples');
  const mean = Array.from({ length: d }, (_, j) => x.reduce((s, r) => s + r[j]!, 0) / n);
  const sd = Array.from({ length: d }, (_, j) => {
    const v = x.reduce((s, r) => s + (r[j]! - mean[j]!) ** 2, 0) / n;
    return v > 1e-12 ? Math.sqrt(v) : 1;
  });
  const z = x.map((r) => [1, ...r.map((v, j) => (v - mean[j]!) / sd[j]!)]);
  let coef = new Array<number>(d + 1).fill(0);
  for (let it = 0; it < iterations; it++) {
    const grad = new Array<number>(d + 1).fill(0);
    const hess = Array.from({ length: d + 1 }, () => new Array<number>(d + 1).fill(0));
    for (let i = 0; i < n; i++) {
      const row = z[i]!;
      const p = sigmoid(row.reduce((s, v, j) => s + v * coef[j]!, 0));
      const w = p * (1 - p);
      for (let j = 0; j <= d; j++) {
        grad[j]! += (p - y[i]!) * row[j]!;
        for (let k = j; k <= d; k++) hess[j]![k]! += w * row[j]! * row[k]!;
      }
    }
    for (let j = 0; j <= d; j++) for (let k = 0; k < j; k++) hess[j]![k] = hess[k]![j]!;
    for (let j = 1; j <= d; j++) {
      grad[j]! += l2 * coef[j]!;
      hess[j]![j]! += l2;
    }
    const step = solve(hess, grad);
    coef = coef.map((c, j) => c - step[j]!);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return { ...meta, mean, sd, coef, l2 };
}

export function predictLogistic(model: LogisticModel, x: readonly number[]): number {
  let s = model.coef[0]!;
  for (let j = 0; j < x.length; j++) s += model.coef[j + 1]! * ((x[j]! - model.mean[j]!) / model.sd[j]!);
  return sigmoid(s);
}
