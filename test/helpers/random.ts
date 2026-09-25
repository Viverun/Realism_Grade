/** Deterministic PRNG (mulberry32) so randomized tests are reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random-walk closes in integer points around 1.10000. */
export function randomWalk(length: number, seed: number, start = 110_000): number[] {
  const random = seededRandom(seed);
  const out: number[] = [];
  let price = start;
  for (let k = 0; k < length; k++) {
    price += Math.round((random() - 0.5) * 40);
    out.push(price);
  }
  return out;
}
