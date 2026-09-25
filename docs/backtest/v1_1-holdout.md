# V1.1 daily selector — holdout test

> **V1.1 daily selector (D9): exactly 3 alerts per trading day, one per slot.** Tier A = all four of Ahmad's rules (a real V1 signal); B/C/D meet 3/2/≤1 of them and are **not** PDF setups. Counter-trend alerts fail Rule 1 ("never trade against the trend"). Buy Limit only (D7).

> **One-time holdout.** Frozen configuration `w08_23-imm3-no5` (hash `sha256:d337d52c53838c287b49b61c700ac05a2031b22a1a67649853b42f90d3cb47aa`), chosen on the design period before this run. Holdout starts **2022-01-01T00:00:00Z**. Data: `Exness_EURUSD_2015.zip`, `Exness_EURUSD_2016_01.zip`, `Exness_EURUSD_2016_02.zip`, `Exness_EURUSD_2016_03.zip`, `Exness_EURUSD_2016_04.zip`, `Exness_EURUSD_2016_05.zip`, `Exness_EURUSD_2016_06.zip`, `Exness_EURUSD_2016_07.zip`, `Exness_EURUSD_2016_08.zip`, `Exness_EURUSD_2016_09.zip`, `Exness_EURUSD_2016_10.zip`, `Exness_EURUSD_2016_11.zip`, `Exness_EURUSD_2016_12.zip`, `Exness_EURUSD_2017.zip`, `Exness_EURUSD_2018_01.zip`, `Exness_EURUSD_2018_02.zip`, `Exness_EURUSD_2018_03.zip`, `Exness_EURUSD_2018_04.zip`, `Exness_EURUSD_2018_05.zip`, `Exness_EURUSD_2018_06.zip`, `Exness_EURUSD_2018_07.zip`, `Exness_EURUSD_2018_08.zip`, `Exness_EURUSD_2018_09.zip`, `Exness_EURUSD_2018_10.zip`, `Exness_EURUSD_2018_11.zip`, `Exness_EURUSD_2018_12.zip`, `Exness_EURUSD_2019.zip`, `Exness_EURUSD_2020.zip`, `Exness_EURUSD_2021.zip`, `Exness_EURUSD_2022_01.zip`, `Exness_EURUSD_2022_02.zip`, `Exness_EURUSD_2022_03.zip`, `Exness_EURUSD_2022_04.zip`, `Exness_EURUSD_2022_05.zip`, `Exness_EURUSD_2022_06.zip`, `Exness_EURUSD_2022_07.zip`, `Exness_EURUSD_2022_08.zip`, `Exness_EURUSD_2022_09.zip`, `Exness_EURUSD_2022_10.zip`, `Exness_EURUSD_2022_11.zip`, `Exness_EURUSD_2022_12.zip`, `Exness_EURUSD_2023.zip`, `Exness_EURUSD_2024.zip`, `Exness_EURUSD_2025_01.zip`, `Exness_EURUSD_2025_02.zip`, `Exness_EURUSD_2025_03.zip`, `Exness_EURUSD_2025_04.zip`, `Exness_EURUSD_2025_05.zip`, `Exness_EURUSD_2025_06.zip`, `Exness_EURUSD_2025_07.zip`, `Exness_EURUSD_2025_08.zip`, `Exness_EURUSD_2025_09.zip`, `Exness_EURUSD_2025_10.zip`, `Exness_EURUSD_2025_11.zip`, `Exness_EURUSD_2025_12.zip`, `Exness_EURUSD_2026_01.zip`, `Exness_EURUSD_2026_02.zip`, `Exness_EURUSD_2026_03.zip`, `Exness_EURUSD_2026_04.zip`, `Exness_EURUSD_2026_05.zip`, `Exness_EURUSD_2026_06.zip`, `Exness_EURUSD_2026_07.zip`, `Exness_EURUSD_2026_08.zip`, `Exness_EURUSD_2026_09.zip`. 169,304,390 ticks, 2015-08-10 → 2026-09-24; cut-off (exclusive) 2026-09-25T00:00:00Z. 5 file(s) reordered by day blocks.

## Gate: **PASS — not clearly worse than V1**

Difference in expectancy per filled trade on the holdout, V1.1 − V1 (M30): **-0.02 [-0.23, 0.18] (n=2388)** (percentile bootstrap, 10,000 resamples, fixed seed). The gate fails only if the whole interval is below 0. Passing means "not clearly worse", **not** "profitable".

## Frequency

| Configuration | Trading days | Alerts / day | Missed slots | Immediate / fallback | Tier A / B / C / D | Counter-trend | Timeframes |
|---|---|---|---|---|---|---|---|
| design (< 2022-01-01T00:00:00Z) | 1633 | 3.00 | 3 | 2843 / 2053 | 354 / 2582 / 662 / 1298 | 2705 (55%) | M15 1883, M30 1113, H1 1900 |
| holdout (≥ 2022-01-01T00:00:00Z) | 1224 | 3.00 | 0 | 2200 / 1472 | 247 / 2023 / 505 / 897 | 1997 (54%) | M15 1405, M30 832, H1 1435 |

## Outcomes (Buy Limit)

| Scope | Alerts | Filled | Fill rate | +2R / −1R / open | +2R share | Expectancy R / filled trade | R / alert |
|---|---|---|---|---|---|---|---|
| V1.1 design period | 4896 | 2882 | 58.9% | 711 / 1864 / 307 | 28% [26%, 29%] (n=2575) | -0.13 [-0.18, -0.09] (n=2882) | -0.08 [-0.11, -0.05] (n=4896) |
| **V1.1 holdout** | 3672 | 2231 | 60.8% | 523 / 1476 / 232 | 26% [24%, 28%] (n=1999) | -0.18 [-0.23, -0.12] (n=2229) | -0.11 [-0.14, -0.08] (n=3670) |
| V1.1 holdout, tier A | 247 | 135 | 54.7% | 23 / 103 / 9 | 18% [12%, 26%] (n=126) | -0.40 [-0.60, -0.21] (n=135) | -0.22 [-0.33, -0.11] (n=247) |
| V1.1 holdout, tier B | 2023 | 1236 | 61.1% | 326 / 827 / 83 | 28% [26%, 31%] (n=1153) | -0.12 [-0.20, -0.05] (n=1235) | -0.08 [-0.12, -0.03] (n=2022) |
| V1.1 holdout, tier C | 505 | 307 | 60.8% | 64 / 160 / 83 | 29% [23%, 35%] (n=224) | -0.07 [-0.20, 0.06] (n=307) | -0.04 [-0.12, 0.04] (n=505) |
| V1.1 holdout, tier D | 897 | 553 | 61.6% | 110 / 386 / 57 | 22% [19%, 26%] (n=496) | -0.30 [-0.40, -0.20] (n=552) | -0.19 [-0.25, -0.12] (n=896) |

**V1 baseline on the holdout (approved defaults, Buy Limit):**

| Timeframe | Filled | Expectancy R / filled trade |
|---|---|---|
| M15 | 254 | -0.26 [-0.41, -0.10] (n=254) |
| M30 | 159 | -0.16 [-0.36, 0.04] (n=159) |
| H1 | 92 | -0.13 [-0.39, 0.13] (n=92) |

