# V1 diagnostic ablation: where does performance go?

> **Diagnostic only.** This report does **not** modify, replace or re-tune the frozen **V1-baseline** (config hash `sha256:72353efc195a4d3528eaafe4579ea1d654eb790a082d292962a9734b2b22e406`), declares no new strategy, and selects no parameter. It is also not a basis for choosing the live timeframe (D8, deferred). The Jev benchmark (`config/jev-baseline-v1.json`) is untouched.

Data: 64 Exness tick files (`Exness_EURUSD_2015.zip` … `Exness_EURUSD_2026_09.zip`), 169,304,390 ticks, 2015-08-10 → 2026-09-24.

## Method

- **Unit:** every closed candle in the 08:00–23:00 Dubai window on a trading day, on 15m / 30m / 1H, that passes the rules of the row. Each is treated as an **independent hypothetical trade** with the unchanged V1 trade plan: Buy Limit at close − offset, the V1 reference stop, target +2R.
- **No cooldown or daily cap**, so consecutive candles overlap and can share one market move. Intervals are **clustered by day** to account for that. The last row of each ladder (all four rules) is therefore the V1 signal *before* cooldown/cap, and differs slightly from the V1 backtest (`2015-2026.md`).
- **BL = production Buy Limit** (send-time Ask check, 60 s placement, fill if the Ask reaches the entry before the next candle closes). **Market = the PDF next-open entry** filled at the Ask, a **diagnostic baseline only** (D7): never a basis for choosing a timeframe or strategy.
- **R:** +2 at the target, realized R at the stop (slippage included), open trades marked to market at the longest outcome horizon. **MFE/MAE:** best and worst excursion before the exit, in R. **+2R share** is of resolved trades; break-even ≈ 33%.
- **Multiple comparisons:** this report has well over 100 cells on the same data. A single cell with an interval above 0 is a hypothesis for new data, not a finding.

## 15m

### Ladder: adding the checks one by one

| Set | Candles | / day | BL fill | BL filled | **BL R / fill [95%]** | BL median R | BL +2R share | BL MFE / MAE (R) | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. Trend | 54018 | 22.76 | 53% | 28756 | **-0.10 [-0.13, -0.06]** | -1.00 | 28% | 0.93 / 0.81 | -0.07 [-0.11, -0.03] | 29% |
| 2. Trend + Pullback | 15744 | 6.63 | 54% | 8480 | **-0.19 [-0.24, -0.15]** | -1.00 | 27% | 0.88 / 0.86 | -0.13 [-0.17, -0.08] | 29% |
| 3. Trend + Pullback + RSI | 7924 | 3.34 | 55% | 4328 | **-0.16 [-0.22, -0.11]** | -1.00 | 27% | 0.92 / 0.84 | -0.09 [-0.15, -0.04] | 30% |
| 4. **All four (V1 signal, no cooldown/cap)** | 1328 | 0.56 | 53% | 710 | **-0.18 [-0.28, -0.07]** | -1.00 | 27% | 0.91 / 0.84 | -0.06 [-0.15, 0.02] | 31% |

### Drop one check from the full set

| Set | Candles | / day | BL fill | BL filled | **BL R / fill [95%]** | BL median R | BL +2R share | BL MFE / MAE (R) | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|---|---|---|---|---|---|
| All four | 1328 | 0.56 | 53% | 710 | **-0.18 [-0.28, -0.07]** | -1.00 | 27% | 0.91 / 0.84 | -0.06 [-0.15, 0.02] | 31% |
| Without Trend | 3513 | 1.48 | 55% | 1937 | **-0.19 [-0.25, -0.12]** | -1.00 | 27% | 0.91 / 0.85 | -0.11 [-0.16, -0.05] | 29% |
| Without Pullback | 1697 | 0.72 | 53% | 892 | **-0.17 [-0.27, -0.08]** | -1.00 | 27% | 0.91 / 0.85 | -0.07 [-0.15, 0.01] | 30% |
| Without RSI | 2120 | 0.89 | 54% | 1147 | **-0.21 [-0.30, -0.12]** | -1.00 | 26% | 0.89 / 0.86 | -0.09 [-0.17, -0.02] | 30% |
| Without Candle | 7924 | 3.34 | 55% | 4328 | **-0.16 [-0.22, -0.11]** | -1.00 | 27% | 0.92 / 0.84 | -0.09 [-0.15, -0.04] | 30% |

### Setup vs fill: the market-entry result, split by whether the Buy Limit filled

If the Buy Limit fills mostly on the trades that go on to fail (adverse selection), the market result of *filled* candles is worse than that of *unfilled* ones.

| Set | Buy Limit | Candles | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|
| Trend + Pullback | filled | 8480 | -0.34 [-0.39, -0.30] | 21% |
| Trend + Pullback | not filled | 7264 | 0.12 [0.07, 0.18] | 37% |
| All four | filled | 710 | -0.30 [-0.40, -0.20] | 22% |
| All four | not filled | 618 | 0.21 [0.09, 0.33] | 40% |

### RSI definitions (with Trend + Pullback + Candle)

| Set | Candles | / day | BL fill | BL filled | **BL R / fill [95%]** | BL median R | BL +2R share | BL MFE / MAE (R) | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|---|---|---|---|---|---|
| Recovery ≤35 or >50 rising (V1 default) | 1328 | 0.56 | 53% | 710 | **-0.18 [-0.28, -0.07]** | -1.00 | 27% | 0.91 / 0.84 | -0.06 [-0.15, 0.02] | 31% |
| Recovery ≤30 or >50 rising (PDF oversold) | 1307 | 0.55 | 54% | 702 | **-0.18 [-0.28, -0.07]** | -1.00 | 27% | 0.91 / 0.84 | -0.07 [-0.16, 0.01] | 30% |
| Recovery from ≤35 only | 76 | 0.03 | 51% | 39 | **-0.10 [-0.53, 0.32]** | -1.00 | 28% | 0.93 / 0.74 | 0.08 [-0.27, 0.43] | 35% |
| Recovery from ≤30 only | 11 | 0.00 | 73% | 8 | **-0.50 [-0.97, -0.02]** | -0.77 | 0% | 0.81 / 0.70 | -0.40 [-0.96, 0.16] | 14% |
| >50 and rising only | 1305 | 0.55 | 54% | 701 | **-0.18 [-0.28, -0.07]** | -1.00 | 27% | 0.91 / 0.84 | -0.07 [-0.16, 0.01] | 30% |
| No RSI check | 2120 | 0.89 | 54% | 1147 | **-0.21 [-0.30, -0.12]** | -1.00 | 26% | 0.89 / 0.86 | -0.09 [-0.17, -0.02] | 30% |

### Within the full V1 set

| Group | Candles | BL filled | **BL R / fill [95%]** | BL +2R share | Market R / fill [95%] |
|---|---|---|---|---|---|
| RSI branch: recovery | 76 | 39 | **-0.10 [-0.53, 0.32]** | 28% | 0.08 [-0.27, 0.43] |
| RSI branch: above 50 | 1252 | 671 | **-0.18 [-0.29, -0.07]** | 27% | -0.07 [-0.16, 0.02] |
| Candle: engulfing only | 1058 | 565 | **-0.14 [-0.25, -0.02]** | 28% | -0.06 [-0.15, 0.03] |
| Candle: pin bar only | 253 | 134 | **-0.35 [-0.57, -0.14]** | 22% | -0.06 [-0.24, 0.12] |
| Candle: both | 17 | 11 | **-0.05 [-0.96, 0.87]** | 30% | -0.38 [-0.99, 0.24] |

### Session (UTC hour of close)

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| asia | 2807 | -0.31 [-0.40, -0.21] | -0.20 [-0.30, -0.10] | 206 | **-0.13 [-0.42, 0.16]** | 0.00 [-0.21, 0.22] |
| london | 5577 | -0.17 [-0.24, -0.09] | -0.13 [-0.20, -0.06] | 511 | **-0.11 [-0.29, 0.06]** | -0.04 [-0.18, 0.09] |
| overlap | 4538 | -0.17 [-0.24, -0.09] | -0.09 [-0.16, -0.03] | 419 | **-0.19 [-0.36, -0.02]** | -0.03 [-0.17, 0.11] |
| new_york | 2822 | -0.19 [-0.28, -0.09] | -0.11 [-0.20, -0.02] | 192 | **-0.34 [-0.58, -0.10]** | -0.26 [-0.44, -0.08] |
| late | 0 | — | — | 0 | **—** | — |

### Volatility regime (20- vs 240-candle mean range: <0.8 low, >1.25 high)

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| low | 3439 | -0.26 [-0.34, -0.17] | -0.16 [-0.25, -0.06] | 267 | **-0.18 [-0.42, 0.07]** | -0.10 [-0.28, 0.07] |
| normal | 7202 | -0.17 [-0.23, -0.10] | -0.11 [-0.17, -0.05] | 618 | **-0.12 [-0.29, 0.04]** | 0.00 [-0.13, 0.13] |
| high | 5103 | -0.19 [-0.26, -0.12] | -0.14 [-0.20, -0.07] | 443 | **-0.25 [-0.41, -0.08]** | -0.12 [-0.25, 0.00] |

### Trend strength ((EMA50 − EMA200) / 20-candle mean range: <1 weak, 1–3 moderate, ≥3 strong)

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| weak | 4315 | -0.17 [-0.25, -0.09] | -0.07 [-0.16, 0.01] | 397 | **-0.24 [-0.42, -0.05]** | 0.02 [-0.14, 0.19] |
| moderate | 6145 | -0.20 [-0.27, -0.13] | -0.14 [-0.21, -0.08] | 520 | **-0.24 [-0.40, -0.08]** | -0.14 [-0.27, -0.02] |
| strong | 5284 | -0.21 [-0.28, -0.13] | -0.16 [-0.24, -0.08] | 411 | **-0.02 [-0.23, 0.18]** | -0.05 [-0.20, 0.11] |

### Year

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| 2015 | 490 | -0.24 [-0.51, 0.02] | -0.07 [-0.31, 0.17] | 53 | **-0.49 [-0.99, 0.00]** | -0.28 [-0.68, 0.13] |
| 2016 | 1365 | -0.16 [-0.31, -0.01] | -0.06 [-0.21, 0.09] | 138 | **-0.18 [-0.50, 0.13]** | -0.03 [-0.31, 0.25] |
| 2017 | 1488 | -0.30 [-0.43, -0.17] | -0.15 [-0.30, 0.00] | 120 | **-0.14 [-0.51, 0.23]** | -0.09 [-0.37, 0.19] |
| 2018 | 1318 | -0.11 [-0.26, 0.05] | -0.03 [-0.17, 0.12] | 118 | **0.11 [-0.28, 0.50]** | 0.17 [-0.12, 0.47] |
| 2019 | 1468 | -0.37 [-0.49, -0.24] | -0.26 [-0.40, -0.11] | 141 | **-0.39 [-0.65, -0.13]** | -0.24 [-0.49, 0.00] |
| 2020 | 1469 | -0.03 [-0.19, 0.12] | 0.05 [-0.09, 0.19] | 122 | **0.01 [-0.36, 0.39]** | 0.07 [-0.21, 0.35] |
| 2021 | 1293 | -0.17 [-0.35, 0.01] | -0.15 [-0.33, 0.02] | 105 | **0.23 [-0.21, 0.67]** | 0.19 [-0.14, 0.53] |
| 2022 | 1382 | -0.28 [-0.41, -0.15] | -0.16 [-0.30, -0.02] | 123 | **-0.41 [-0.69, -0.13]** | -0.32 [-0.57, -0.08] |
| 2023 | 1573 | -0.12 [-0.27, 0.03] | -0.15 [-0.28, -0.01] | 122 | **-0.13 [-0.48, 0.22]** | -0.05 [-0.34, 0.23] |
| 2024 | 1478 | -0.18 [-0.32, -0.04] | -0.20 [-0.36, -0.04] | 117 | **-0.16 [-0.53, 0.21]** | -0.08 [-0.35, 0.20] |
| 2025 | 1535 | -0.17 [-0.32, -0.03] | -0.13 [-0.27, 0.02] | 110 | **-0.19 [-0.61, 0.22]** | -0.07 [-0.36, 0.23] |
| 2026 | 885 | -0.24 [-0.45, -0.04] | -0.25 [-0.45, -0.06] | 59 | **-0.59 [-1.12, -0.06]** | -0.13 [-0.57, 0.30] |

## 30m

### Ladder: adding the checks one by one

| Set | Candles | / day | BL fill | BL filled | **BL R / fill [95%]** | BL median R | BL +2R share | BL MFE / MAE (R) | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. Trend | 27786 | 14.00 | 60% | 16667 | **-0.12 [-0.16, -0.07]** | -1.00 | 27% | 0.89 / 0.78 | -0.09 [-0.13, -0.05] | 27% |
| 2. Trend + Pullback | 8466 | 4.26 | 62% | 5212 | **-0.17 [-0.22, -0.12]** | -1.00 | 27% | 0.88 / 0.85 | -0.11 [-0.16, -0.06] | 29% |
| 3. Trend + Pullback + RSI | 4166 | 2.10 | 63% | 2636 | **-0.09 [-0.16, -0.02]** | -1.00 | 29% | 0.94 / 0.82 | -0.06 [-0.12, 0.01] | 30% |
| 4. **All four (V1 signal, no cooldown/cap)** | 716 | 0.36 | 60% | 432 | **-0.08 [-0.22, 0.06]** | -1.00 | 29% | 0.95 / 0.82 | 0.00 [-0.11, 0.11] | 32% |

### Drop one check from the full set

| Set | Candles | / day | BL fill | BL filled | **BL R / fill [95%]** | BL median R | BL +2R share | BL MFE / MAE (R) | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|---|---|---|---|---|---|
| All four | 716 | 0.36 | 60% | 432 | **-0.08 [-0.22, 0.06]** | -1.00 | 29% | 0.95 / 0.82 | 0.00 [-0.11, 0.11] | 32% |
| Without Trend | 1813 | 0.91 | 62% | 1131 | **-0.07 [-0.15, 0.02]** | -1.00 | 30% | 0.97 / 0.82 | -0.07 [-0.14, 0.00] | 30% |
| Without Pullback | 888 | 0.45 | 59% | 528 | **-0.05 [-0.18, 0.07]** | -1.00 | 31% | 0.96 / 0.82 | -0.01 [-0.11, 0.09] | 32% |
| Without RSI | 1152 | 0.58 | 61% | 707 | **-0.12 [-0.23, -0.01]** | -1.00 | 29% | 0.93 / 0.84 | -0.05 [-0.14, 0.05] | 31% |
| Without Candle | 4166 | 2.10 | 63% | 2636 | **-0.09 [-0.16, -0.02]** | -1.00 | 29% | 0.94 / 0.82 | -0.06 [-0.12, 0.01] | 30% |

### Setup vs fill: the market-entry result, split by whether the Buy Limit filled

If the Buy Limit fills mostly on the trades that go on to fail (adverse selection), the market result of *filled* candles is worse than that of *unfilled* ones.

| Set | Buy Limit | Candles | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|
| Trend + Pullback | filled | 5212 | -0.33 [-0.38, -0.28] | 21% |
| Trend + Pullback | not filled | 3254 | 0.25 [0.18, 0.32] | 42% |
| All four | filled | 432 | -0.17 [-0.30, -0.03] | 26% |
| All four | not filled | 284 | 0.26 [0.09, 0.43] | 41% |

### RSI definitions (with Trend + Pullback + Candle)

| Set | Candles | / day | BL fill | BL filled | **BL R / fill [95%]** | BL median R | BL +2R share | BL MFE / MAE (R) | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|---|---|---|---|---|---|
| Recovery ≤35 or >50 rising (V1 default) | 716 | 0.36 | 60% | 432 | **-0.08 [-0.22, 0.06]** | -1.00 | 29% | 0.95 / 0.82 | 0.00 [-0.11, 0.11] | 32% |
| Recovery ≤30 or >50 rising (PDF oversold) | 696 | 0.35 | 60% | 419 | **-0.07 [-0.21, 0.07]** | -1.00 | 30% | 0.96 / 0.82 | 0.02 [-0.09, 0.13] | 33% |
| Recovery from ≤35 only | 53 | 0.03 | 55% | 29 | **-0.01 [-0.51, 0.49]** | -1.00 | 28% | 0.84 / 0.75 | -0.14 [-0.48, 0.19] | 23% |
| Recovery from ≤30 only | 6 | 0.00 | 50% | 3 | **0.00 [-1.96, 1.96]** | -1.00 | 33% | 0.93 / 0.87 | -0.50 [-1.53, 0.53] | 17% |
| >50 and rising only | 695 | 0.35 | 60% | 419 | **-0.07 [-0.21, 0.07]** | -1.00 | 30% | 0.96 / 0.82 | 0.02 [-0.09, 0.13] | 33% |
| No RSI check | 1152 | 0.58 | 61% | 707 | **-0.12 [-0.23, -0.01]** | -1.00 | 29% | 0.93 / 0.84 | -0.05 [-0.14, 0.05] | 31% |

### Within the full V1 set

| Group | Candles | BL filled | **BL R / fill [95%]** | BL +2R share | Market R / fill [95%] |
|---|---|---|---|---|---|
| RSI branch: recovery | 53 | 29 | **-0.01 [-0.51, 0.49]** | 28% | -0.14 [-0.48, 0.19] |
| RSI branch: above 50 | 663 | 403 | **-0.09 [-0.23, 0.06]** | 30% | 0.02 [-0.10, 0.13] |
| Candle: engulfing only | 571 | 346 | **-0.07 [-0.23, 0.08]** | 30% | -0.01 [-0.13, 0.11] |
| Candle: pin bar only | 139 | 84 | **-0.13 [-0.42, 0.16]** | 28% | 0.03 [-0.21, 0.27] |
| Candle: both | 6 | 2 | **0.50 [-2.44, 3.44]** | 50% | 0.48 [-0.85, 1.81] |

### Session (UTC hour of close)

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| asia | 1275 | -0.22 [-0.34, -0.10] | -0.12 [-0.25, 0.01] | 91 | **-0.19 [-0.55, 0.17]** | 0.08 [-0.23, 0.39] |
| london | 2912 | -0.22 [-0.31, -0.14] | -0.16 [-0.24, -0.08] | 259 | **-0.08 [-0.31, 0.16]** | -0.06 [-0.24, 0.11] |
| overlap | 2459 | -0.12 [-0.21, -0.03] | -0.09 [-0.17, 0.00] | 232 | **-0.11 [-0.33, 0.11]** | -0.01 [-0.19, 0.17] |
| new_york | 1820 | -0.12 [-0.22, -0.02] | -0.05 [-0.15, 0.05] | 134 | **0.04 [-0.25, 0.33]** | 0.10 [-0.13, 0.34] |
| late | 0 | — | — | 0 | **—** | — |

### Volatility regime (20- vs 240-candle mean range: <0.8 low, >1.25 high)

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| low | 2861 | -0.18 [-0.27, -0.10] | -0.10 [-0.19, 0.00] | 253 | **-0.18 [-0.40, 0.04]** | -0.02 [-0.21, 0.16] |
| normal | 3781 | -0.19 [-0.26, -0.11] | -0.14 [-0.21, -0.07] | 312 | **-0.10 [-0.31, 0.11]** | -0.05 [-0.21, 0.12] |
| high | 1824 | -0.11 [-0.22, 0.00] | -0.07 [-0.17, 0.02] | 151 | **0.12 [-0.18, 0.41]** | 0.16 [-0.06, 0.38] |

### Trend strength ((EMA50 − EMA200) / 20-candle mean range: <1 weak, 1–3 moderate, ≥3 strong)

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| weak | 1851 | -0.09 [-0.21, 0.03] | -0.05 [-0.17, 0.06] | 175 | **0.04 [-0.24, 0.31]** | 0.05 [-0.17, 0.26] |
| moderate | 3427 | -0.16 [-0.25, -0.08] | -0.10 [-0.18, -0.02] | 293 | **-0.02 [-0.25, 0.22]** | 0.07 [-0.11, 0.26] |
| strong | 3188 | -0.22 [-0.30, -0.14] | -0.15 [-0.24, -0.07] | 248 | **-0.24 [-0.45, -0.04]** | -0.11 [-0.28, 0.06] |

### Year

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| 2015 | 211 | 0.04 [-0.27, 0.35] | 0.15 [-0.20, 0.51] | 16 | **-0.19 [-0.98, 0.60]** | 0.08 [-0.70, 0.85] |
| 2016 | 661 | 0.00 [-0.18, 0.17] | 0.05 [-0.13, 0.24] | 64 | **0.10 [-0.36, 0.56]** | 0.32 [-0.03, 0.67] |
| 2017 | 747 | -0.24 [-0.40, -0.08] | -0.10 [-0.28, 0.08] | 57 | **-0.41 [-0.76, -0.05]** | -0.07 [-0.47, 0.32] |
| 2018 | 711 | -0.04 [-0.22, 0.13] | -0.04 [-0.20, 0.13] | 69 | **0.29 [-0.26, 0.84]** | 0.22 [-0.20, 0.63] |
| 2019 | 858 | -0.31 [-0.45, -0.16] | -0.22 [-0.36, -0.07] | 73 | **-0.42 [-0.77, -0.07]** | -0.13 [-0.46, 0.19] |
| 2020 | 871 | -0.07 [-0.25, 0.10] | -0.07 [-0.23, 0.09] | 74 | **-0.04 [-0.48, 0.39]** | -0.14 [-0.46, 0.18] |
| 2021 | 750 | -0.33 [-0.51, -0.15] | -0.22 [-0.41, -0.03] | 70 | **0.27 [-0.20, 0.73]** | 0.03 [-0.32, 0.39] |
| 2022 | 773 | -0.23 [-0.37, -0.08] | -0.07 [-0.24, 0.10] | 69 | **-0.17 [-0.53, 0.19]** | -0.03 [-0.36, 0.30] |
| 2023 | 726 | -0.16 [-0.34, 0.02] | -0.06 [-0.25, 0.12] | 73 | **-0.21 [-0.60, 0.18]** | -0.11 [-0.49, 0.26] |
| 2024 | 743 | -0.31 [-0.48, -0.14] | -0.29 [-0.48, -0.10] | 53 | **-0.36 [-0.82, 0.09]** | -0.12 [-0.43, 0.19] |
| 2025 | 942 | -0.08 [-0.26, 0.09] | -0.06 [-0.23, 0.11] | 74 | **0.07 [-0.47, 0.62]** | 0.10 [-0.28, 0.47] |
| 2026 | 473 | -0.17 [-0.41, 0.08] | -0.24 [-0.46, -0.01] | 24 | **0.00 [-0.70, 0.69]** | -0.11 [-0.74, 0.52] |

## 1H

### Ladder: adding the checks one by one

| Set | Candles | / day | BL fill | BL filled | **BL R / fill [95%]** | BL median R | BL +2R share | BL MFE / MAE (R) | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. Trend | 14282 | 8.65 | 66% | 9401 | **-0.09 [-0.14, -0.05]** | -0.78 | 26% | 0.82 / 0.73 | -0.07 [-0.12, -0.02] | 26% |
| 2. Trend + Pullback | 4808 | 2.91 | 66% | 3172 | **-0.12 [-0.18, -0.05]** | -1.00 | 28% | 0.91 / 0.81 | -0.09 [-0.16, -0.03] | 28% |
| 3. Trend + Pullback + RSI | 2321 | 1.41 | 68% | 1567 | **-0.07 [-0.15, 0.01]** | -1.00 | 28% | 0.93 / 0.77 | -0.08 [-0.16, 0.00] | 27% |
| 4. **All four (V1 signal, no cooldown/cap)** | 368 | 0.22 | 65% | 240 | **-0.06 [-0.24, 0.12]** | -1.00 | 30% | 0.94 / 0.80 | -0.04 [-0.18, 0.10] | 30% |

### Drop one check from the full set

| Set | Candles | / day | BL fill | BL filled | **BL R / fill [95%]** | BL median R | BL +2R share | BL MFE / MAE (R) | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|---|---|---|---|---|---|
| All four | 368 | 0.22 | 65% | 240 | **-0.06 [-0.24, 0.12]** | -1.00 | 30% | 0.94 / 0.80 | -0.04 [-0.18, 0.10] | 30% |
| Without Trend | 911 | 0.55 | 66% | 602 | **-0.08 [-0.19, 0.03]** | -1.00 | 29% | 0.94 / 0.80 | -0.06 [-0.15, 0.03] | 29% |
| Without Pullback | 443 | 0.27 | 66% | 292 | **-0.04 [-0.20, 0.12]** | -1.00 | 30% | 0.94 / 0.79 | 0.00 [-0.13, 0.14] | 31% |
| Without RSI | 620 | 0.38 | 64% | 398 | **-0.08 [-0.22, 0.06]** | -1.00 | 29% | 0.96 / 0.81 | -0.10 [-0.22, 0.01] | 27% |
| Without Candle | 2321 | 1.41 | 68% | 1567 | **-0.07 [-0.15, 0.01]** | -1.00 | 28% | 0.93 / 0.77 | -0.08 [-0.16, 0.00] | 27% |

### Setup vs fill: the market-entry result, split by whether the Buy Limit filled

If the Buy Limit fills mostly on the trades that go on to fail (adverse selection), the market result of *filled* candles is worse than that of *unfilled* ones.

| Set | Buy Limit | Candles | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|
| Trend + Pullback | filled | 3172 | -0.28 [-0.35, -0.22] | 21% |
| Trend + Pullback | not filled | 1636 | 0.27 [0.18, 0.36] | 42% |
| All four | filled | 240 | -0.18 [-0.35, -0.01] | 25% |
| All four | not filled | 128 | 0.23 [0.01, 0.45] | 40% |

### RSI definitions (with Trend + Pullback + Candle)

| Set | Candles | / day | BL fill | BL filled | **BL R / fill [95%]** | BL median R | BL +2R share | BL MFE / MAE (R) | Market R / fill [95%] | Market +2R share |
|---|---|---|---|---|---|---|---|---|---|---|
| Recovery ≤35 or >50 rising (V1 default) | 368 | 0.22 | 65% | 240 | **-0.06 [-0.24, 0.12]** | -1.00 | 30% | 0.94 / 0.80 | -0.04 [-0.18, 0.10] | 30% |
| Recovery ≤30 or >50 rising (PDF oversold) | 366 | 0.22 | 65% | 238 | **-0.06 [-0.24, 0.12]** | -1.00 | 30% | 0.95 / 0.80 | -0.04 [-0.18, 0.11] | 30% |
| Recovery from ≤35 only | 14 | 0.01 | 50% | 7 | **-0.25 [-1.09, 0.59]** | -1.00 | 20% | 0.44 / 0.86 | -0.74 [-0.95, -0.53] | 0% |
| Recovery from ≤30 only | 1 | 0.00 | 100% | 1 | **-1.00 [—, —]** | -1.00 | 0% | 0.15 / 1.00 | -1.00 [—, —] | 0% |
| >50 and rising only | 366 | 0.22 | 65% | 238 | **-0.06 [-0.24, 0.12]** | -1.00 | 30% | 0.95 / 0.80 | -0.04 [-0.18, 0.11] | 30% |
| No RSI check | 620 | 0.38 | 64% | 398 | **-0.08 [-0.22, 0.06]** | -1.00 | 29% | 0.96 / 0.81 | -0.10 [-0.22, 0.01] | 27% |

### Within the full V1 set

| Group | Candles | BL filled | **BL R / fill [95%]** | BL +2R share | Market R / fill [95%] |
|---|---|---|---|---|---|
| RSI branch: recovery | 14 | 7 | **-0.25 [-1.09, 0.59]** | 20% | -0.74 [-0.95, -0.53] |
| RSI branch: above 50 | 354 | 233 | **-0.06 [-0.24, 0.13]** | 30% | -0.01 [-0.16, 0.14] |
| Candle: engulfing only | 300 | 191 | **-0.08 [-0.27, 0.12]** | 29% | -0.02 [-0.18, 0.13] |
| Candle: pin bar only | 64 | 46 | **-0.07 [-0.48, 0.34]** | 32% | -0.15 [-0.47, 0.17] |
| Candle: both | 4 | 3 | **1.00 [-0.96, 2.96]** | 67% | 0.46 [-1.28, 2.20] |

### Session (UTC hour of close)

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| asia | 657 | -0.18 [-0.34, -0.02] | -0.16 [-0.30, -0.02] | 30 | **0.33 [-0.35, 1.00]** | 0.23 [-0.28, 0.74] |
| london | 1590 | -0.17 [-0.27, -0.07] | -0.12 [-0.22, -0.02] | 135 | **-0.21 [-0.50, 0.08]** | -0.12 [-0.35, 0.10] |
| overlap | 1370 | -0.09 [-0.19, 0.01] | -0.08 [-0.17, 0.01] | 116 | **-0.09 [-0.37, 0.19]** | -0.05 [-0.27, 0.18] |
| new_york | 1191 | -0.05 [-0.17, 0.07] | -0.05 [-0.15, 0.06] | 87 | **0.07 [-0.28, 0.41]** | 0.01 [-0.26, 0.27] |
| late | 0 | — | — | 0 | **—** | — |

### Volatility regime (20- vs 240-candle mean range: <0.8 low, >1.25 high)

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| low | 1144 | -0.16 [-0.30, -0.02] | -0.15 [-0.29, -0.02] | 102 | **-0.01 [-0.37, 0.35]** | 0.01 [-0.30, 0.32] |
| normal | 3325 | -0.12 [-0.19, -0.04] | -0.09 [-0.16, -0.02] | 247 | **-0.10 [-0.30, 0.11]** | -0.07 [-0.24, 0.09] |
| high | 339 | 0.00 [-0.24, 0.23] | 0.05 [-0.17, 0.27] | 19 | **0.14 [-0.64, 0.92]** | 0.16 [-0.39, 0.71] |

### Trend strength ((EMA50 − EMA200) / 20-candle mean range: <1 weak, 1–3 moderate, ≥3 strong)

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| weak | 1034 | 0.00 [-0.14, 0.14] | 0.00 [-0.14, 0.14] | 91 | **0.30 [-0.10, 0.69]** | 0.21 [-0.08, 0.51] |
| moderate | 1845 | -0.10 [-0.21, 0.00] | -0.04 [-0.15, 0.06] | 143 | **-0.08 [-0.37, 0.22]** | -0.04 [-0.27, 0.20] |
| strong | 1929 | -0.20 [-0.30, -0.10] | -0.19 [-0.29, -0.10] | 134 | **-0.29 [-0.54, -0.04]** | -0.21 [-0.43, 0.00] |

### Year

| Group | Trend+Pullback: candles | T+P BL R / fill [95%] | T+P Market R | All four: candles | **All four BL R / fill [95%]** | All-four Market R |
|---|---|---|---|---|---|---|
| 2015 | 66 | -0.07 [-0.76, 0.62] | -0.06 [-0.67, 0.55] | 4 | **0.68 [-0.84, 2.20]** | 0.66 [-0.88, 2.20] |
| 2016 | 323 | -0.03 [-0.32, 0.25] | 0.06 [-0.21, 0.33] | 27 | **0.25 [-0.43, 0.93]** | 0.25 [-0.37, 0.87] |
| 2017 | 549 | -0.18 [-0.37, 0.00] | -0.13 [-0.32, 0.06] | 44 | **-0.09 [-0.63, 0.45]** | 0.02 [-0.41, 0.45] |
| 2018 | 458 | -0.18 [-0.38, 0.03] | -0.09 [-0.31, 0.12] | 38 | **-0.27 [-0.92, 0.38]** | -0.19 [-0.56, 0.18] |
| 2019 | 518 | -0.33 [-0.50, -0.16] | -0.27 [-0.44, -0.10] | 45 | **-0.41 [-0.84, 0.02]** | -0.34 [-0.66, -0.01] |
| 2020 | 469 | 0.13 [-0.12, 0.38] | 0.16 [-0.05, 0.37] | 27 | **0.15 [-0.46, 0.76]** | 0.08 [-0.42, 0.58] |
| 2021 | 393 | -0.11 [-0.33, 0.12] | -0.19 [-0.38, 0.01] | 27 | **0.67 [-0.11, 1.44]** | 0.17 [-0.35, 0.70] |
| 2022 | 410 | -0.18 [-0.39, 0.02] | -0.16 [-0.38, 0.05] | 35 | **-0.39 [-0.81, 0.04]** | -0.26 [-0.71, 0.19] |
| 2023 | 412 | 0.02 [-0.21, 0.25] | 0.10 [-0.15, 0.35] | 37 | **-0.10 [-0.76, 0.56]** | 0.40 [-0.18, 0.99] |
| 2024 | 470 | -0.12 [-0.32, 0.08] | -0.11 [-0.32, 0.09] | 35 | **-0.04 [-0.57, 0.48]** | 0.06 [-0.41, 0.53] |
| 2025 | 537 | -0.13 [-0.33, 0.07] | -0.17 [-0.35, 0.02] | 41 | **-0.25 [-0.77, 0.28]** | -0.39 [-0.76, -0.02] |
| 2026 | 203 | -0.21 [-0.51, 0.10] | -0.23 [-0.53, 0.06] | 8 | **0.51 [-0.81, 1.82]** | -0.05 [-0.78, 0.69] |

