# Evaluation — `full_setup_only`

> **Ahmad's full setup only (D10).** Only alerts meeting all four PDF rules (tier A); no slot-end fallback, so no tier B/C/D alerts. Timeframes M5/M15/M30/H1, one alert per slot, at most 3 per trading day. Buy Limit only (D7).

> **Not a fresh out-of-sample test.** The 2022-01-01 → end period was the V1.1 holdout, and tier-A results on it were already seen (docs/backtest/v1_1-findings.md). This run is descriptive: the full history, by year and by timeframe. A genuinely new test needs new data, e.g. paper trading forward.

Data: `Exness_EURUSD_2015.zip`, `Exness_EURUSD_2016_01.zip`, `Exness_EURUSD_2016_02.zip`, `Exness_EURUSD_2016_03.zip`, `Exness_EURUSD_2016_04.zip`, `Exness_EURUSD_2016_05.zip`, `Exness_EURUSD_2016_06.zip`, `Exness_EURUSD_2016_07.zip`, `Exness_EURUSD_2016_08.zip`, `Exness_EURUSD_2016_09.zip`, `Exness_EURUSD_2016_10.zip`, `Exness_EURUSD_2016_11.zip`, `Exness_EURUSD_2016_12.zip`, `Exness_EURUSD_2017.zip`, `Exness_EURUSD_2018_01.zip`, `Exness_EURUSD_2018_02.zip`, `Exness_EURUSD_2018_03.zip`, `Exness_EURUSD_2018_04.zip`, `Exness_EURUSD_2018_05.zip`, `Exness_EURUSD_2018_06.zip`, `Exness_EURUSD_2018_07.zip`, `Exness_EURUSD_2018_08.zip`, `Exness_EURUSD_2018_09.zip`, `Exness_EURUSD_2018_10.zip`, `Exness_EURUSD_2018_11.zip`, `Exness_EURUSD_2018_12.zip`, `Exness_EURUSD_2019.zip`, `Exness_EURUSD_2020.zip`, `Exness_EURUSD_2021.zip`, `Exness_EURUSD_2022_01.zip`, `Exness_EURUSD_2022_02.zip`, `Exness_EURUSD_2022_03.zip`, `Exness_EURUSD_2022_04.zip`, `Exness_EURUSD_2022_05.zip`, `Exness_EURUSD_2022_06.zip`, `Exness_EURUSD_2022_07.zip`, `Exness_EURUSD_2022_08.zip`, `Exness_EURUSD_2022_09.zip`, `Exness_EURUSD_2022_10.zip`, `Exness_EURUSD_2022_11.zip`, `Exness_EURUSD_2022_12.zip`, `Exness_EURUSD_2023.zip`, `Exness_EURUSD_2024.zip`, `Exness_EURUSD_2025_01.zip`, `Exness_EURUSD_2025_02.zip`, `Exness_EURUSD_2025_03.zip`, `Exness_EURUSD_2025_04.zip`, `Exness_EURUSD_2025_05.zip`, `Exness_EURUSD_2025_06.zip`, `Exness_EURUSD_2025_07.zip`, `Exness_EURUSD_2025_08.zip`, `Exness_EURUSD_2025_09.zip`, `Exness_EURUSD_2025_10.zip`, `Exness_EURUSD_2025_11.zip`, `Exness_EURUSD_2025_12.zip`, `Exness_EURUSD_2026_01.zip`, `Exness_EURUSD_2026_02.zip`, `Exness_EURUSD_2026_03.zip`, `Exness_EURUSD_2026_04.zip`, `Exness_EURUSD_2026_05.zip`, `Exness_EURUSD_2026_06.zip`, `Exness_EURUSD_2026_07.zip`, `Exness_EURUSD_2026_08.zip`, `Exness_EURUSD_2026_09.zip`. 169,304,390 ticks, 2015-08-10 → 2026-09-24; cut-off (exclusive) 2026-09-25T00:00:00Z. 5 file(s) reordered by day blocks.
Config hash `sha256:9581218ecdc464db59cc1f31eba21f85c0e8a341dae292a2b0d6c83cba745d5b`.

## Frequency

| Period | Trading days | Alerts / day | Alerts / week | Slots with no full setup | Missed (Ask check) |
|---|---|---|---|---|---|
| All | 2865 | 1.05 | 5.25 | 5586 | 0 |
| < 2022-01-01 | 1641 | 1.09 | 5.43 | 3142 | 0 |
| ≥ 2022-01-01 | 1224 | 1.00 | 5.02 | 2444 | 0 |

## Outcomes (Buy Limit)

| Scope | Alerts | Filled | Fill rate | +2R / −1R / open | +2R share | Expectancy R / filled trade | R / alert |
|---|---|---|---|---|---|---|---|
| All | 3009 | 1377 | 45.8% | 359 / 959 / 59 | 27% [25%, 30%] (n=1318) | -0.17 [-0.24, -0.10] (n=1377) | -0.08 [-0.11, -0.05] (n=3009) |
| < 2022-01-01 | 1781 | 786 | 44.1% | 217 / 537 / 32 | 29% [26%, 32%] (n=754) | -0.13 [-0.22, -0.03] (n=786) | -0.06 [-0.10, -0.02] (n=1781) |
| ≥ 2022-01-01 (already seen) | 1228 | 591 | 48.1% | 142 / 422 / 27 | 25% [22%, 29%] (n=564) | -0.23 [-0.33, -0.12] (n=591) | -0.11 [-0.16, -0.06] (n=1228) |

## By year

| Scope | Alerts | Filled | Fill rate | +2R / −1R / open | +2R share | Expectancy R / filled trade | R / alert |
|---|---|---|---|---|---|---|---|
| 2015 | 100 | 43 | 43.0% | 12 / 30 / 1 | 29% [17%, 44%] (n=42) | -0.15 [-0.56, 0.26] (n=43) | -0.06 [-0.24, 0.11] (n=100) |
| 2016 | 281 | 115 | 40.9% | 34 / 74 / 7 | 31% [23%, 41%] (n=108) | -0.05 [-0.30, 0.20] (n=115) | -0.02 [-0.12, 0.08] (n=281) |
| 2017 | 301 | 139 | 46.2% | 30 / 103 / 6 | 23% [16%, 30%] (n=133) | -0.29 [-0.50, -0.08] (n=139) | -0.13 [-0.23, -0.03] (n=301) |
| 2018 | 303 | 147 | 48.5% | 47 / 99 / 1 | 32% [25%, 40%] (n=146) | -0.05 [-0.28, 0.18] (n=147) | -0.02 [-0.13, 0.09] (n=303) |
| 2019 | 267 | 116 | 43.4% | 30 / 80 / 6 | 27% [20%, 36%] (n=110) | -0.18 [-0.42, 0.06] (n=116) | -0.08 [-0.18, 0.03] (n=267) |
| 2020 | 277 | 125 | 45.1% | 30 / 90 / 5 | 25% [18%, 33%] (n=120) | -0.23 [-0.46, -0.01] (n=125) | -0.11 [-0.21, 0.00] (n=277) |
| 2021 | 252 | 101 | 40.1% | 34 / 61 / 6 | 36% [27%, 46%] (n=95) | 0.08 [-0.20, 0.35] (n=101) | 0.03 [-0.08, 0.14] (n=252) |
| 2022 | 273 | 138 | 50.5% | 33 / 97 / 8 | 25% [19%, 33%] (n=130) | -0.23 [-0.44, -0.01] (n=138) | -0.12 [-0.22, -0.01] (n=273) |
| 2023 | 274 | 123 | 44.9% | 31 / 88 / 4 | 26% [19%, 35%] (n=119) | -0.19 [-0.43, 0.04] (n=123) | -0.09 [-0.19, 0.02] (n=274) |
| 2024 | 252 | 124 | 49.2% | 25 / 92 / 7 | 21% [15%, 30%] (n=117) | -0.33 [-0.55, -0.12] (n=124) | -0.16 [-0.27, -0.06] (n=252) |
| 2025 | 273 | 135 | 49.5% | 34 / 94 / 7 | 27% [20%, 35%] (n=128) | -0.18 [-0.40, 0.04] (n=135) | -0.09 [-0.20, 0.02] (n=273) |
| 2026 | 156 | 71 | 45.5% | 19 / 51 / 1 | 27% [18%, 39%] (n=70) | -0.18 [-0.49, 0.13] (n=71) | -0.08 [-0.22, 0.06] (n=156) |

## By timeframe

| Scope | Alerts | Filled | Fill rate | +2R / −1R / open | +2R share | Expectancy R / filled trade | R / alert |
|---|---|---|---|---|---|---|---|
| M5 | 1819 | 704 | 38.7% | 185 / 515 / 4 | 26% [23%, 30%] (n=700) | -0.21 [-0.31, -0.11] (n=704) | -0.08 [-0.12, -0.04] (n=1819) |
| M15 | 618 | 320 | 51.8% | 78 / 223 / 19 | 26% [21%, 31%] (n=301) | -0.20 [-0.34, -0.06] (n=320) | -0.10 [-0.18, -0.03] (n=618) |
| M30 | 358 | 217 | 60.6% | 57 / 139 / 21 | 29% [23%, 36%] (n=196) | -0.09 [-0.27, 0.08] (n=217) | -0.06 [-0.16, 0.05] (n=358) |
| H1 | 214 | 136 | 63.6% | 39 / 82 / 15 | 32% [25%, 41%] (n=121) | -0.02 [-0.24, 0.21] (n=136) | -0.01 [-0.15, 0.13] (n=214) |

