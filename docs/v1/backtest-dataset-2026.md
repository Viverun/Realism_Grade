# Initial backtest dataset: EUR/USD 2026 (partial year)

**Decided by the owner, 2026-09-25.** 2025 data is not required for this phase; development does not wait for it.

## Purpose of this phase

This run validates:
- the data pipeline;
- the strategy implementation;
- no-look-ahead behaviour;
- signal generation;
- **preliminary** backtest results.

> **Results from this dataset are not conclusive performance evidence.** The dataset covers only part of one calendar year (January to 24 September 2026), which is a single market regime. A full 12-month test is not possible with it. Every report generated from it carries this label.

## Files

The files live in `docs/data/`, zipped (GitHub's per-file limit is 100 MB).

| Role | Files | Used for |
|---|---|---|
| **Backtest dataset** | `Exness_EURUSD_2026_01.zip` … `Exness_EURUSD_2026_09.zip` (monthly) | Candles, indicators, signals, execution and outcomes |
| **Loader validation only** | `Exness_EURUSD_2026_09_24.zip` (one day; byte-identical to 24 Sep inside the September monthly zip). The intended 2026-09-25 file was not pushed. | `npm run validate:ticks` report only. **Never** part of the backtest. |
| Not used | `Exness_EURUSD_2026.zip` (yearly) | Overlaps the monthly files. If passed, overlapping ticks are dropped and reported. |

## Boundaries

- **End cut-off:** `2026-09-25T00:00:00Z`, **exclusive**. The backtest therefore uses data through 2026-09-24 23:59:59 UTC. Boundaries are in UTC because Exness server time and the tick timestamps are GMT+0.
  - 2026-09-24 23:59 UTC is 2026-09-25 03:59 in Dubai, before the 08:00 trading window. So no Dubai trading session of 25 September is included.
  - Any 25 September ticks inside the September monthly zip are dropped by the cut-off and counted in the report.
- **Start:** the first tick of `Exness_EURUSD_2026_01.zip`. There is no earlier data.
- **Warm-up:** the first `indicators.warmupCandles` = 1,000 candles of **each timeframe** come from the start of the 2026 data and are used only to seed EMA50/EMA200/RSI. No 2025 warm-up data is used. The evaluation period therefore starts later for slower timeframes. At roughly 24 H1 candles per trading day (the market is open about 24 hours on weekdays), the approximate starts are:

  | Timeframe | Warm-up | Evaluation starts roughly |
  |---|---|---|
  | M15 | about 10–11 trading days | mid-January 2026 |
  | M30 | about 21 trading days | early February 2026 |
  | H1 | about 42 trading days (about 8–9 weeks) | early March 2026 |

  Each report prints the exact first evaluated candle per timeframe. H1 therefore has the least evaluation data: about 6.5 months.

## How to run

```bash
# 1. Loader validation of the one-day file (kept separate)
npm run validate:ticks -- docs/data/Exness_EURUSD_2026_09_24.zip \
  --out docs/claude_thinking/tick-data-validation-2026-09-24.md

# 2. Validation of the backtest dataset
npm run validate:ticks -- docs/data/Exness_EURUSD_2026_0?.zip \
  --out docs/claude_thinking/tick-data-validation-2026.md

# 3. Preliminary backtest (default + one-at-a-time variants, M15/M30/H1)
npm run backtest:2026
```

**First run (2026-09-25): data PASS, 89 signals, independently cross-checked.** See [`../backtest/2026-preliminary-findings.md`](../backtest/2026-preliminary-findings.md). `npm run backtest:2026` writes `docs/backtest/2026-preliminary.md` and a full JSON dump to `data/backtest/2026-preliminary.json` (gitignored).

## Known limitations of this dataset
- **Partial year:** about 8.8 months of ticks, minus warm-up. Seasonality and regime changes outside 2026 are not represented.
- **Indicative data:** Exness describes its tick history as indicative. The account variant of the export must match the trading account (Standard USD); the validation report shows the symbol and spread profile as evidence.
- **Overfitting risk:** comparing many variants on one short dataset invites choosing whatever fitted 2026. Variant differences are hypotheses to re-test on other data (e.g. 2025, when available), not conclusions.
