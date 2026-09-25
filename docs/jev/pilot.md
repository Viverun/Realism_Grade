# Jev pilot: operational check (NOT evidence)

> **Pilot only.** Real API on pre-window candles (2026-09-18T04:00Z → 2026-09-24T19:00Z), all before the primary window start 2026-09-28T00:00:00Z. These records are in `jev-log.pilot.jsonl`, never in the evidence log, and `evaluate` ignores them. This report deliberately has **no outcome or accuracy metrics**, so nothing can be tuned on it (spec §4, no peeking).

- Versions: promptHash `sha256:6f3e371eaa5f99e2ff4c47fe1ae0c10ed6b5a58a27d0196cbef8fe9f4a0abab1`, snapshot `snap-v1`, requested model `jev-latest`.
- **Requests:** 235 logged, **235 succeeded, 0 failed**.
- **Model(s) that answered:** jev-1.13.0 235.
- Samples by timeframe: H1 80, M30 155; by tier: B 2, C 17, D 216.

## Operations

| Metric | min / Q1 / median / Q3 / max |
|---|---|
| Latency (ms) | 91 / 112 / 124 / 143 / 318 (mean 131, sd 29, n=235) |
| Input tokens / request | 1282 / 1293 / 1297 / 1299 / 1305 (mean 1296, sd 4, n=235) |
| Output tokens / request | 154 / 154 / 156 / 156 / 157 (mean 155, sd 1, n=235) |

## Answer spread (no outcomes)

| Question | min / Q1 / median / Q3 / max |
|---|---|
| q1_two_r_first | 0.180 / 0.220 / 0.250 / 0.280 / 0.390 (mean 0.252, sd 0.037, n=235) |
| q2_trend_continues | 0.130 / 0.160 / 0.190 / 0.240 / 0.340 (mean 0.204, sd 0.051, n=235) |
| q3_pullback_exhausted | 0.170 / 0.220 / 0.260 / 0.320 / 0.570 (mean 0.278, sd 0.080, n=235) |

| Choice question | Counts |
|---|---|
| q4_regime | ranging 57, trending 174, volatile_choppy 4 |
| q5_momentum | confirming 152, diverging 14, neutral 69 |

**Q1 degeneracy check (sd < 0.02):** pass: Q1 varies across snapshots.

