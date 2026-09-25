# Preliminary backtest: EUR/USD 2026-01-01 to 2026-09-24 (partial year)

> **PRELIMINARY — NOT CONCLUSIVE PERFORMANCE EVIDENCE.** The dataset covers **part of one calendar year** only. It validates the pipeline, the strategy implementation, no-look-ahead behaviour and signal generation, and gives first indications only.

> **Evidence hierarchy (owner decision, 2026-09-25):** the **Buy Limit** results are the **primary evidence** for timeframe and strategy decisions, because production V1 is Buy Limit only. The PDF market-entry baseline is a **secondary diagnostic** (§ Secondary diagnostic) and is never used on its own to choose a timeframe or strategy.

Generated 2026-09-25 by `scripts/backtest.ts`. Default config hash `sha256:8bdcb072d109385d95581f72843b0a6c34d1c446d6449b41cf7555ab7acca351`.

## Dataset

- **Files (9):** `Exness_EURUSD_2026_01.zip`, `Exness_EURUSD_2026_02.zip`, `Exness_EURUSD_2026_03.zip`, `Exness_EURUSD_2026_04.zip`, `Exness_EURUSD_2026_05.zip`, `Exness_EURUSD_2026_06.zip`, `Exness_EURUSD_2026_07.zip`, `Exness_EURUSD_2026_08.zip`, `Exness_EURUSD_2026_09.zip`
- **Ticks used:** 9,173,272, 2026-01-01T22:05:12.755Z → 2026-09-24T23:59:48.942Z (UTC), about 8.7 months. End cut-off (exclusive): **2026-09-25T00:00:00Z**.
- **Dropped:** 0 at/after the cut-off, 0 before start, 0 out-of-order/overlapping.
- **Candles:** M15 18,251, M30 9,126, H1 4,563 (Bid OHLC, closed candles only). The first 1000 candles of each timeframe only seed the indicators.

| Timeframe | First evaluated candle (UTC open) | Last evaluated candle | Evaluated candles | Trading days in window |
|---|---|---|---|---|
| M15 | 2026-01-16T08:00Z | 2026-09-24T23:45Z | 17,251 | 180 |
| M30 | 2026-01-30T18:00Z | 2026-09-24T23:30Z | 8,126 | 170 |
| H1 | 2026-03-02T14:00Z | 2026-09-24T23:00Z | 3,563 | 149 |

## Timeframe comparison — Buy Limit (primary evidence)

Default configuration. The live V1 timeframe is **not locked**; it is to be chosen by comparing these Buy Limit results across 15m, 30m and 1H: signal frequency together with outcome metrics.

Execution model (spec §11):

1. The Buy Limit is checked against the Ask at send time.
2. The cap, dedup and cooldown are applied.
3. The trader places the order after the configured delay.
4. It fills if the Ask reaches the entry before the next candle closes.

Outcome definitions:

- **+2R share:** of trades that resolved, the share reaching +2R before the recommended stop. Break-even at 1:2 is about 33%. It is **not a win rate**.
- **Expectancy:** mean R per filled trade. Target = +2, stop = realized R (slippage included), unresolved = marked to market at the longest horizon.
- **Per alert:** the same, but counting unfilled alerts as 0 R.
- Brackets are **95% intervals**.

| Metric | M15 | M30 | H1 |
|---|---|---|---|
| **Frequency** |  |  |  |
| Trading days evaluated | 180 | 170 | 149 |
| Signals per trading day | 0.32 | 0.14 | 0.05 |
| Emailed alerts per week | 1.44 | 0.68 | 0.27 |
| Filled trades per week | 0.67 | 0.44 | 0.17 |
| **Funnel** |  |  |  |
| Signals → emailed | 58 → 52 | 23 → 23 | 8 → 8 |
| Rejected at send (entry ≥ Ask) / cooldown / capped | 0 / 6 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Invalid at placement / expired / filled | 7 / 21 / 24 | 1 / 7 / 15 | 1 / 2 / 5 |
| Fill rate (of emailed) | 46.2% | 65.2% | 62.5% |
| **Outcomes (filled trades)** |  |  |  |
| +2R first / −1R first / unresolved | 3 / 21 / 0 | 5 / 10 / 0 | 2 / 2 / 1 |
| +2R share of resolved | 13% [4%, 31%] (n=24) | 33% [15%, 58%] (n=15) | 50% [15%, 85%] (n=4) |
| Expectancy, R per filled trade | -0.63 [-1.04, -0.22] (n=24) | 0.00 [-0.75, 0.74] (n=15) | 0.51 [-0.81, 1.82] (n=5) |
| Expectancy, R per emailed alert | -0.29 [-0.50, -0.09] (n=52) | 0.00 [-0.48, 0.48] (n=23) | 0.32 [-0.49, 1.12] (n=8) |
| Stop distance, pips (median / mean) | 8.4 / 8.8 (n=24) | 10.3 / 11.2 (n=15) | 17.6 / 25.7 (n=5) |
| Realized R on stops (median / mean) | -1.00 / -1.01 (n=21) | -1.01 / -1.01 (n=10) | -1.00 / -1.00 (n=2) |
| Stops that slipped / max slippage (pips) | 10 / 0.2 | 5 / 0.3 | 0 / 0.0 |
| Lots (median), raised to min lot | 0.11, 0 | 0.10, 0 | 0.04, 0 |
| **Signal mix** |  |  |  |
| RSI branch (recovery / above-mid) | 6 / 52 | 1 / 22 | 0 / 8 |
| Pattern (pin / engulfing / both) | 21 / 37 / 0 | 3 / 20 / 0 | 1 / 7 / 0 |

### By year — Buy Limit, default

Stability check: a timeframe whose result depends on one year is weaker evidence.

| Timeframe | Year | Trading days | Signals | Emailed | Filled | +2R / −1R / open | +2R share | Expectancy R / filled trade |
|---|---|---|---|---|---|---|---|---|
| M15 | 2026 | 180 | 58 | 52 | 24 | 3 / 21 / 0 | 13% [4%, 31%] (n=24) | -0.63 [-1.04, -0.22] (n=24) |
| M30 | 2026 | 170 | 23 | 23 | 15 | 5 / 10 / 0 | 33% [15%, 58%] (n=15) | 0.00 [-0.75, 0.74] (n=15) |
| H1 | 2026 | 149 | 8 | 8 | 5 | 2 / 2 / 1 | 50% [15%, 85%] (n=4) | 0.51 [-0.81, 1.82] (n=5) |

### Rule funnel (default, evaluated in-window candles)

| Timeframe | In window | + Trend | + Pullback | + RSI | + Candle (signal) | Trend alone | Pullback alone | RSI alone | Candle alone |
|---|---|---|---|---|---|---|---|---|---|
| M15 | 10,963 | 3107 | 861 | 393 | 58 | 28.3% | 34.8% | 36.3% | 7.8% |
| M30 | 5,241 | 1420 | 428 | 193 | 23 | 27.1% | 32.2% | 35.2% | 7.7% |
| H1 | 2,373 | 608 | 184 | 72 | 8 | 25.6% | 33.9% | 34.1% | 7.5% |

### Post-fill price movement (default Buy Limit), pips — median / mean

**M15**

| Horizon (candles) | Return | MFE | MAE |
|---|---|---|---|
| 4 | -4.7 / -4.7 (n=24) | 3.8 / 4.0 (n=24) | 8.3 / 9.8 (n=24) |
| 16 | -0.3 / 0.3 (n=24) | 11.6 / 12.4 (n=24) | 12.5 / 16.7 (n=24) |
| 96 | -3.4 / 6.1 (n=24) | 24.8 / 35.2 (n=24) | 29.1 / 30.5 (n=24) |

**M30**

| Horizon (candles) | Return | MFE | MAE |
|---|---|---|---|
| 4 | -3.7 / -2.7 (n=15) | 2.8 / 6.3 (n=15) | 10.1 / 12.2 (n=15) |
| 8 | -4.5 / -4.2 (n=15) | 7.4 / 9.1 (n=15) | 10.5 / 17.1 (n=15) |
| 48 | -8.9 / -11.2 (n=15) | 27.8 / 22.9 (n=15) | 18.4 / 31.7 (n=15) |

**H1**

| Horizon (candles) | Return | MFE | MAE |
|---|---|---|---|
| 4 | -3.1 / 4.1 (n=5) | 7.1 / 14.4 (n=5) | 9.8 / 13.0 (n=5) |
| 8 | 3.1 / 2.4 (n=5) | 12.3 / 18.5 (n=5) | 11.6 / 15.7 (n=5) |
| 24 | 3.5 / 18.4 (n=5) | 23.5 / 47.0 (n=5) | 20.5 / 21.0 (n=5) |

## Buy Limit variants (one change at a time)

Sensitivity only. With these sample sizes, differences inside overlapping intervals are noise, and choosing the best-looking variant would overfit.

### M15

| Variant | Signals | Emailed / week | Filled | Fill rate | +2R / −1R / open | +2R share | Expectancy R / filled trade |
|---|---|---|---|---|---|---|---|
| default | 58 | 1.44 | 24 | 46.2% | 3 / 21 / 0 | 13% [4%, 31%] (n=24) | -0.63 [-1.04, -0.22] (n=24) |
| rsi_oversold_30 | 55 | 1.39 | 24 | 48.0% | 3 / 21 / 0 | 13% [4%, 31%] (n=24) | -0.63 [-1.04, -0.22] (n=24) |
| rsi_recovery_only | 6 | 0.14 | 2 | 40.0% | 0 / 2 / 0 | 0% [0%, 66%] (n=2) | -1.01 [-1.03, -0.99] (n=2) |
| rsi_above_mid_only | 55 | 1.39 | 24 | 48.0% | 3 / 21 / 0 | 13% [4%, 31%] (n=24) | -0.63 [-1.04, -0.22] (n=24) |
| touch_tol_x0.5 | 46 | 1.17 | 21 | 50.0% | 3 / 18 / 0 | 14% [5%, 35%] (n=21) | -0.58 [-1.04, -0.12] (n=21) |
| touch_tol_x2 | 81 | 1.94 | 32 | 45.7% | 4 / 26 / 2 | 13% [5%, 30%] (n=30) | -0.55 [-0.91, -0.19] (n=32) |
| entry_candle_mid | 58 | 1.44 | 19 | 36.5% | 5 / 14 / 0 | 26% [12%, 49%] (n=19) | -0.22 [-0.83, 0.40] (n=19) |
| cooldown_0 | 58 | 1.56 | 27 | 48.2% | 4 / 23 / 0 | 15% [6%, 32%] (n=27) | -0.56 [-0.97, -0.15] (n=27) |
| cooldown_6 | 58 | 1.33 | 22 | 45.8% | 2 / 20 / 0 | 9% [3%, 28%] (n=22) | -0.73 [-1.10, -0.36] (n=22) |

### M30

| Variant | Signals | Emailed / week | Filled | Fill rate | +2R / −1R / open | +2R share | Expectancy R / filled trade |
|---|---|---|---|---|---|---|---|
| default | 23 | 0.68 | 15 | 65.2% | 5 / 10 / 0 | 33% [15%, 58%] (n=15) | 0.00 [-0.75, 0.74] (n=15) |
| rsi_oversold_30 | 23 | 0.68 | 15 | 65.2% | 5 / 10 / 0 | 33% [15%, 58%] (n=15) | 0.00 [-0.75, 0.74] (n=15) |
| rsi_recovery_only | 1 | 0.03 | 0 | 0.0% | 0 / 0 / 0 | — | — |
| rsi_above_mid_only | 23 | 0.68 | 15 | 65.2% | 5 / 10 / 0 | 33% [15%, 58%] (n=15) | 0.00 [-0.75, 0.74] (n=15) |
| touch_tol_x0.5 | 20 | 0.59 | 13 | 65.0% | 4 / 9 / 0 | 31% [13%, 58%] (n=13) | -0.08 [-0.87, 0.70] (n=13) |
| touch_tol_x2 | 31 | 0.91 | 18 | 58.1% | 6 / 11 / 1 | 35% [17%, 59%] (n=17) | 0.08 [-0.59, 0.75] (n=18) |
| entry_candle_mid | 23 | 0.68 | 11 | 47.8% | 1 / 9 / 1 | 10% [2%, 40%] (n=10) | -0.70 [-1.23, -0.16] (n=11) |
| cooldown_0 | 23 | 0.68 | 15 | 65.2% | 5 / 10 / 0 | 33% [15%, 58%] (n=15) | 0.00 [-0.75, 0.74] (n=15) |
| cooldown_6 | 23 | 0.62 | 13 | 61.9% | 5 / 8 / 0 | 38% [18%, 64%] (n=13) | 0.15 [-0.68, 0.98] (n=13) |

### H1

| Variant | Signals | Emailed / week | Filled | Fill rate | +2R / −1R / open | +2R share | Expectancy R / filled trade |
|---|---|---|---|---|---|---|---|
| default | 8 | 0.27 | 5 | 62.5% | 2 / 2 / 1 | 50% [15%, 85%] (n=4) | 0.51 [-0.81, 1.82] (n=5) |
| rsi_oversold_30 | 8 | 0.27 | 5 | 62.5% | 2 / 2 / 1 | 50% [15%, 85%] (n=4) | 0.51 [-0.81, 1.82] (n=5) |
| rsi_recovery_only | 0 | 0.00 | 0 | — | 0 / 0 / 0 | — | — |
| rsi_above_mid_only | 8 | 0.27 | 5 | 62.5% | 2 / 2 / 1 | 50% [15%, 85%] (n=4) | 0.51 [-0.81, 1.82] (n=5) |
| touch_tol_x0.5 | 8 | 0.27 | 5 | 62.5% | 2 / 2 / 1 | 50% [15%, 85%] (n=4) | 0.51 [-0.81, 1.82] (n=5) |
| touch_tol_x2 | 10 | 0.34 | 6 | 60.0% | 2 / 3 / 1 | 40% [12%, 77%] (n=5) | 0.26 [-0.93, 1.44] (n=6) |
| entry_candle_mid | 8 | 0.27 | 2 | 25.0% | 1 / 0 / 1 | 100% [21%, 100%] (n=1) | 0.84 [-1.43, 3.11] (n=2) |
| cooldown_0 | 8 | 0.27 | 5 | 62.5% | 2 / 2 / 1 | 50% [15%, 85%] (n=4) | 0.51 [-0.81, 1.82] (n=5) |
| cooldown_6 | 8 | 0.27 | 5 | 62.5% | 2 / 2 / 1 | 50% [15%, 85%] (n=4) | 0.51 [-0.81, 1.82] (n=5) |

Variants:

- `default`: Approved V1 defaults (RSI oversold 35 [PDF-INTERP], Buy Limit close−offset)
- `rsi_oversold_30`: RSI oversold = 30 (PDF baseline)
- `rsi_recovery_only`: RSI recovery branch only
- `rsi_above_mid_only`: RSI above-50 branch only
- `touch_tol_x0.5`: Touch tolerance × 0.5
- `touch_tol_x2`: Touch tolerance × 2
- `entry_candle_mid`: Buy Limit at the signal candle midpoint
- `cooldown_0`: Cooldown 0 candles
- `cooldown_6`: Cooldown 6 candles

## Secondary diagnostic — PDF market entry (not decision evidence)

Same signals, but entered as the PDF describes: a market buy at the next open, filled at the Ask. This is a **diagnostic only**, for spotting whether the Buy Limit systematically misses winners or catches losers (adverse selection). Production V1 is Buy Limit; do not choose a timeframe or strategy from this table.

| Timeframe | Entry | Filled | +2R / −1R / open | +2R share | Expectancy R / filled trade |
|---|---|---|---|---|---|
| M15 | Buy Limit (primary) | 24 | 3 / 21 / 0 | 13% [4%, 31%] (n=24) | -0.63 [-1.04, -0.22] (n=24) |
| M15 | PDF market (diagnostic) | 52 | 14 / 37 / 1 | 27% [17%, 41%] (n=51) | -0.19 [-0.55, 0.18] (n=52) |
| M30 | Buy Limit (primary) | 15 | 5 / 10 / 0 | 33% [15%, 58%] (n=15) | 0.00 [-0.75, 0.74] (n=15) |
| M30 | PDF market (diagnostic) | 23 | 7 / 15 / 1 | 32% [16%, 53%] (n=22) | -0.07 [-0.65, 0.50] (n=23) |
| H1 | Buy Limit (primary) | 5 | 2 / 2 / 1 | 50% [15%, 85%] (n=4) | 0.51 [-0.81, 1.82] (n=5) |
| H1 | PDF market (diagnostic) | 8 | 1 / 3 / 4 | 25% [5%, 70%] (n=4) | -0.05 [-0.78, 0.69] (n=8) |

## Most recent emailed alerts (default, per timeframe)

### M15 (52 emailed; last 15 shown)

| Signal close (Dubai) | Pattern | RSI | Entry | Rec. stop | Lots | Planned risk | Execution | Result | R |
|---|---|---|---|---|---|---|---|---|---|
| 2026-07-03 15:15 | engulfing | above_mid | 1.14532 | 1.14422 | 0.09 | $9.90 | expired | — | — |
| 2026-07-09 14:00 | engulfing | above_mid | 1.14298 | 1.14217 | 0.12 | $9.72 | filled | stop | -1.00 |
| 2026-07-09 17:15 | engulfing | above_mid | 1.14292 | 1.14203 | 0.11 | $9.79 | expired | — | — |
| 2026-07-16 16:00 | pin_bar | above_mid | 1.14672 | 1.14541 | 0.07 | $9.17 | filled | stop | -1.00 |
| 2026-07-23 11:15 | pin_bar | above_mid | 1.14256 | 1.14188 | 0.14 | $9.52 | filled | stop | -1.00 |
| 2026-07-30 13:15 | engulfing | recovery | 1.14561 | 1.14435 | 0.07 | $8.82 | expired | — | — |
| 2026-07-31 11:15 | pin_bar | above_mid | 1.15159 | 1.15106 | 0.18 | $9.54 | filled | stop | -1.00 |
| 2026-08-04 19:45 | engulfing | above_mid | 1.15200 | 1.15111 | 0.11 | $9.79 | expired | — | — |
| 2026-08-05 18:15 | engulfing | above_mid | 1.15518 | 1.15379 | 0.07 | $9.73 | filled | stop | -1.01 |
| 2026-08-05 20:15 | pin_bar | above_mid | 1.15458 | 1.15404 | 0.18 | $9.72 | expired | — | — |
| 2026-08-18 20:45 | pin_bar | above_mid | 1.15805 | 1.15757 | 0.20 | $10.00 | filled | stop | -1.00 |
| 2026-08-20 19:30 | pin_bar | recovery | 1.16836 | 1.16742 | 0.10 | $9.40 | filled | stop | -1.00 |
| 2026-09-04 10:00 | engulfing | above_mid | 1.16268 | 1.16228 | 0.20 | $10.00 | expired | — | — |
| 2026-09-04 11:30 | engulfing | above_mid | 1.16273 | 1.16232 | 0.20 | $10.00 | filled | stop | -1.00 |
| 2026-09-07 16:30 | engulfing | above_mid | 1.16258 | 1.16170 | 0.11 | $9.68 | expired | — | — |

### M30 (23 emailed; last 15 shown)

| Signal close (Dubai) | Pattern | RSI | Entry | Rec. stop | Lots | Planned risk | Execution | Result | R |
|---|---|---|---|---|---|---|---|---|---|
| 2026-05-04 08:00 | engulfing | above_mid | 1.17357 | 1.17223 | 0.07 | $9.38 | filled | stop | -1.00 |
| 2026-05-11 14:30 | pin_bar | above_mid | 1.17665 | 1.17616 | 0.20 | $10.00 | expired | — | — |
| 2026-05-29 17:00 | pin_bar | above_mid | 1.16472 | 1.16387 | 0.11 | $9.35 | filled | target | 2.00 |
| 2026-06-02 15:00 | engulfing | above_mid | 1.16420 | 1.16361 | 0.16 | $9.44 | expired | — | — |
| 2026-06-12 19:00 | engulfing | above_mid | 1.15718 | 1.15625 | 0.10 | $9.30 | expired | — | — |
| 2026-06-16 17:00 | engulfing | above_mid | 1.15979 | 1.15890 | 0.11 | $9.79 | filled | stop | -1.01 |
| 2026-07-03 18:30 | engulfing | above_mid | 1.14451 | 1.14355 | 0.10 | $9.60 | filled | stop | -1.01 |
| 2026-07-07 16:30 | engulfing | above_mid | 1.14387 | 1.14230 | 0.06 | $9.42 | filled | stop | -1.02 |
| 2026-07-09 17:30 | engulfing | above_mid | 1.14324 | 1.14203 | 0.08 | $9.68 | filled | target | 2.00 |
| 2026-07-15 18:00 | engulfing | recovery | 1.14286 | 1.14205 | 0.12 | $9.72 | expired | — | — |
| 2026-08-04 20:00 | engulfing | above_mid | 1.15245 | 1.15111 | 0.07 | $9.38 | filled | target | 2.00 |
| 2026-08-12 15:30 | engulfing | above_mid | 1.15373 | 1.15300 | 0.13 | $9.49 | expired | — | — |
| 2026-08-25 20:00 | engulfing | above_mid | 1.16712 | 1.16636 | 0.13 | $9.88 | filled | stop | -1.01 |
| 2026-09-08 18:30 | engulfing | above_mid | 1.16241 | 1.16167 | 0.13 | $9.62 | expired | — | — |
| 2026-09-08 22:30 | engulfing | above_mid | 1.16260 | 1.16200 | 0.16 | $9.60 | filled | target | 2.00 |

### H1 (8 emailed; last 15 shown)

| Signal close (Dubai) | Pattern | RSI | Entry | Rec. stop | Lots | Planned risk | Execution | Result | R |
|---|---|---|---|---|---|---|---|---|---|
| 2026-04-07 13:00 | engulfing | above_mid | 1.15712 | 1.15336 | 0.02 | $7.52 | filled | target | 2.00 |
| 2026-04-20 18:00 | engulfing | above_mid | 1.17730 | 1.17526 | 0.04 | $8.16 | invalid_at_placement | — | — |
| 2026-05-08 13:00 | engulfing | above_mid | 1.17616 | 1.17387 | 0.04 | $9.16 | expired | — | — |
| 2026-05-29 19:00 | engulfing | above_mid | 1.16662 | 1.16353 | 0.03 | $9.27 | expired | — | — |
| 2026-06-16 17:00 | pin_bar | above_mid | 1.15974 | 1.15869 | 0.09 | $9.45 | filled | target | 2.00 |
| 2026-07-07 17:00 | engulfing | above_mid | 1.14344 | 1.14220 | 0.08 | $9.92 | filled | stop | -1.00 |
| 2026-07-09 18:00 | engulfing | above_mid | 1.14369 | 1.14193 | 0.05 | $8.80 | filled | stop | -1.00 |
| 2026-07-31 19:00 | engulfing | above_mid | 1.15022 | 1.14519 | 0.01 | $5.03 | filled | open | 0.54 |

## Caveats

- **Partial year.** This is not a full 12-month test and is not conclusive performance evidence.
- **Indicative data.** Exness describes its tick history as indicative, so execution on a live Standard account can differ. The account variant must match the trading account.
- **Execution assumptions.** No price improvement on Buy Limit fills. The trader is assumed to place each order exactly as emailed after the configured delay, and to set the recommended stop.
- **Planned vs realized risk.** Stops exit at the first Bid at or below the stop, so gap slippage is included. Commission is 0 per the Standard USD config.
- **Multiple comparisons.** Many variants and three timeframes on the same data: treat the best-looking cell as a hypothesis to re-test, not a finding.

