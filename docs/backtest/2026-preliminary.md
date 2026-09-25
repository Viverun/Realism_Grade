# Preliminary backtest: EUR/USD 2026-01-01 to 2026-09-24 (partial year)

> **PRELIMINARY — NOT CONCLUSIVE PERFORMANCE EVIDENCE.** This run validates the data pipeline, the strategy implementation, no-look-ahead behaviour and signal generation, and gives first indications only. The dataset covers **part of one calendar year** (see Dataset), includes the indicator warm-up, and is a single market regime. It is not a full 12-month test.

Generated 2026-09-25 by `scripts/backtest.ts`. Default config hash `sha256:8bdcb072d109385d95581f72843b0a6c34d1c446d6449b41cf7555ab7acca351`.

## Dataset

- **Files (9):** `Exness_EURUSD_2026_01.zip`, `Exness_EURUSD_2026_02.zip`, `Exness_EURUSD_2026_03.zip`, `Exness_EURUSD_2026_04.zip`, `Exness_EURUSD_2026_05.zip`, `Exness_EURUSD_2026_06.zip`, `Exness_EURUSD_2026_07.zip`, `Exness_EURUSD_2026_08.zip`, `Exness_EURUSD_2026_09.zip`
- **Ticks used:** 9,173,272, 2026-01-01T22:05:12.755Z → 2026-09-24T23:59:48.942Z (UTC). End cut-off (exclusive): **2026-09-25T00:00:00Z**.
- **Dropped:** 0 at/after the cut-off, 0 before start, 0 out-of-order/overlapping.
- **Candles:** M15 18,251, M30 9,126, H1 4,563 (Bid OHLC, closed candles only).
- **Warm-up:** the first 1000 candles of each timeframe are used only to seed the indicators, so each timeframe's evaluation starts later:

| Timeframe | First evaluated candle (UTC open) | Last evaluated candle | Evaluated candles | Trading days in window |
|---|---|---|---|---|
| M15 | 2026-01-16T08:00Z | 2026-09-24T23:45Z | 17,251 | 180 |
| M30 | 2026-01-30T18:00Z | 2026-09-24T23:30Z | 8,126 | 170 |
| H1 | 2026-03-02T14:00Z | 2026-09-24T23:00Z | 3,563 | 149 |

## Default configuration — results by timeframe

Execution model (spec §11): the Buy Limit is checked against the Ask at send time, then the daily cap / dedup / cooldown apply, then the trader places it after a simulated delay; it fills if the Ask reaches the entry before the next candle closes. Outcomes use only ticks after the fill. "+2R before −1R" uses the recommended stop; it is a research metric, **not a win rate**.

| Metric | M15 | M30 | H1 |
|---|---|---|---|
| Signals (all four rules, in window) | 58 | 23 | 8 |
| Signals per trading day | 0.32 | 0.14 | 0.05 |
| Rejected at send (entry ≥ Ask) | 0 | 0 | 0 |
| Cooldown / capped | 6 / 0 | 0 / 0 | 0 / 0 |
| Emailed | 52 | 23 | 8 |
| Emailed per trading day | 0.29 | 0.14 | 0.05 |
| Invalid at placement / expired / filled | 7 / 21 / 24 | 1 / 7 / 15 | 1 / 2 / 5 |
| Fill rate (of emailed) | 46.2% | 65.2% | 62.5% |
| +2R first / −1R first / unresolved | 3 / 21 / 0 | 5 / 10 / 0 | 2 / 2 / 1 |
| +2R share of resolved | 12.5% | 33.3% | 50.0% |
| Stop distance, pips (median / mean) | 8.4 / 8.8 (n=24) | 10.3 / 11.2 (n=15) | 17.6 / 25.7 (n=5) |
| Realized R on stops (median / mean) | -1.00 / -1.01 (n=21) | -1.01 / -1.01 (n=10) | -1.00 / -1.00 (n=2) |
| Stops that slipped / max slippage (pips) | 10 / 0.2 | 5 / 0.3 | 0 / 0.0 |
| Lots (median), raised to min lot | 0.11, 0 | 0.10, 0 | 0.04, 0 |
| RSI branch (recovery / above-mid) | 6 / 52 | 1 / 22 | 0 / 8 |
| Pattern (pin / engulfing / both) | 21 / 37 / 0 | 3 / 20 / 0 | 1 / 7 / 0 |

### Rule funnel (default, evaluated in-window candles)

| Timeframe | In window | + Trend | + Pullback | + RSI | + Candle (signal) | Trend alone | Pullback alone | RSI alone | Candle alone |
|---|---|---|---|---|---|---|---|---|---|
| M15 | 10,963 | 3107 | 861 | 393 | 58 | 28.3% | 34.8% | 36.3% | 7.8% |
| M30 | 5,241 | 1420 | 428 | 193 | 23 | 27.1% | 32.2% | 35.2% | 7.7% |
| H1 | 2,373 | 608 | 184 | 72 | 8 | 25.6% | 33.9% | 34.1% | 7.5% |

### Post-fill price movement (default), pips — median / mean

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

## Variant comparison (one change at a time)

### M15

| Variant | Signals | Emailed | Filled | Fill rate | +2R / −1R / open | +2R share | Median stop (pips) |
|---|---|---|---|---|---|---|---|
| default | 58 | 52 | 24 | 46.2% | 3 / 21 / 0 | 12.5% | 8.4 |
| rsi_oversold_30 | 55 | 50 | 24 | 48.0% | 3 / 21 / 0 | 12.5% | 8.4 |
| rsi_recovery_only | 6 | 5 | 2 | 40.0% | 0 / 2 / 0 | 0.0% | 10.1 |
| rsi_above_mid_only | 55 | 50 | 24 | 48.0% | 3 / 21 / 0 | 12.5% | 8.4 |
| touch_tol_x0.5 | 46 | 42 | 21 | 50.0% | 3 / 18 / 0 | 14.3% | 8.7 |
| touch_tol_x2 | 81 | 70 | 32 | 45.7% | 4 / 26 / 2 | 13.3% | 8.4 |
| entry_candle_mid | 58 | 52 | 19 | 36.5% | 5 / 14 / 0 | 26.3% | 5.5 |
| cooldown_0 | 58 | 56 | 27 | 48.2% | 4 / 23 / 0 | 14.8% | 7.8 |
| cooldown_6 | 58 | 48 | 22 | 45.8% | 2 / 20 / 0 | 9.1% | 9.1 |
| pdf_market_baseline | 58 | 52 | 52 | 100.0% | 14 / 37 / 1 | 27.5% | 10.5 |

### M30

| Variant | Signals | Emailed | Filled | Fill rate | +2R / −1R / open | +2R share | Median stop (pips) |
|---|---|---|---|---|---|---|---|
| default | 23 | 23 | 15 | 65.2% | 5 / 10 / 0 | 33.3% | 10.3 |
| rsi_oversold_30 | 23 | 23 | 15 | 65.2% | 5 / 10 / 0 | 33.3% | 10.3 |
| rsi_recovery_only | 1 | 1 | 0 | 0.0% | 0 / 0 / 0 | — | — |
| rsi_above_mid_only | 23 | 23 | 15 | 65.2% | 5 / 10 / 0 | 33.3% | 10.3 |
| touch_tol_x0.5 | 20 | 20 | 13 | 65.0% | 4 / 9 / 0 | 30.8% | 12.1 |
| touch_tol_x2 | 31 | 31 | 18 | 58.1% | 6 / 11 / 1 | 35.3% | 11.2 |
| entry_candle_mid | 23 | 23 | 11 | 47.8% | 1 / 9 / 1 | 10.0% | 9.0 |
| cooldown_0 | 23 | 23 | 15 | 65.2% | 5 / 10 / 0 | 33.3% | 10.3 |
| cooldown_6 | 23 | 21 | 13 | 61.9% | 5 / 8 / 0 | 38.5% | 9.6 |
| pdf_market_baseline | 23 | 23 | 23 | 100.0% | 7 / 15 / 1 | 31.8% | 11.5 |

### H1

| Variant | Signals | Emailed | Filled | Fill rate | +2R / −1R / open | +2R share | Median stop (pips) |
|---|---|---|---|---|---|---|---|
| default | 8 | 8 | 5 | 62.5% | 2 / 2 / 1 | 50.0% | 17.6 |
| rsi_oversold_30 | 8 | 8 | 5 | 62.5% | 2 / 2 / 1 | 50.0% | 17.6 |
| rsi_recovery_only | 0 | 0 | 0 | — | 0 / 0 / 0 | — | — |
| rsi_above_mid_only | 8 | 8 | 5 | 62.5% | 2 / 2 / 1 | 50.0% | 17.6 |
| touch_tol_x0.5 | 8 | 8 | 5 | 62.5% | 2 / 2 / 1 | 50.0% | 17.6 |
| touch_tol_x2 | 10 | 10 | 6 | 60.0% | 2 / 3 / 1 | 40.0% | 15.0 |
| entry_candle_mid | 8 | 8 | 2 | 25.0% | 1 / 0 / 1 | 100.0% | 14.0 |
| cooldown_0 | 8 | 8 | 5 | 62.5% | 2 / 2 / 1 | 50.0% | 17.6 |
| cooldown_6 | 8 | 8 | 5 | 62.5% | 2 / 2 / 1 | 50.0% | 17.6 |
| pdf_market_baseline | 8 | 8 | 8 | 100.0% | 1 / 3 / 4 | 25.0% | 24.5 |

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
- `pdf_market_baseline`: PDF entry: market buy at next open, filled at Ask (backtest-only baseline, P6)

## Emailed alerts (default, H1)

| Signal close (Dubai) | Pattern | RSI branch | Entry | Rec. stop | Lots | Planned risk | Execution | +2R/−1R | Realized R |
|---|---|---|---|---|---|---|---|---|---|
| 2026-04-07 13:00 | engulfing | above_mid | 1.15712 | 1.15336 | 0.02 | $7.52 (0.75%) | filled | target | — |
| 2026-04-20 18:00 | engulfing | above_mid | 1.17730 | 1.17526 | 0.04 | $8.16 (0.82%) | invalid_at_placement | — | — |
| 2026-05-08 13:00 | engulfing | above_mid | 1.17616 | 1.17387 | 0.04 | $9.16 (0.92%) | expired | — | — |
| 2026-05-29 19:00 | engulfing | above_mid | 1.16662 | 1.16353 | 0.03 | $9.27 (0.93%) | expired | — | — |
| 2026-06-16 17:00 | pin_bar | above_mid | 1.15974 | 1.15869 | 0.09 | $9.45 (0.94%) | filled | target | — |
| 2026-07-07 17:00 | engulfing | above_mid | 1.14344 | 1.14220 | 0.08 | $9.92 (0.99%) | filled | stop | -1.00 |
| 2026-07-09 18:00 | engulfing | above_mid | 1.14369 | 1.14193 | 0.05 | $8.80 (0.88%) | filled | stop | -1.00 |
| 2026-07-31 19:00 | engulfing | above_mid | 1.15022 | 1.14519 | 0.01 | $5.03 (0.50%) | filled | open | — |

## Caveats

- **Partial year, one regime.** Results come from part of 2026 only, after warm-up. They are not a full 12-month test and are not conclusive performance evidence.
- **Indicative data.** Exness describes its tick history as indicative. Execution on a live Standard account can differ.
- **No price improvement is modelled** on Buy Limit fills, and the trader is assumed to place the order after the configured delay exactly as emailed.
- **Planned vs realized risk.** Stops exit at the first Bid at or below the stop, so gap slippage is included; commission is 0 per the Standard USD config.
- **Variants are one-at-a-time** around the approved defaults. Looking at many variants on the same short dataset invites overfitting; treat differences as hypotheses.
- **The 2026-09-25 file is excluded** by the cut-off; it is the separate one-day loader-validation file.

