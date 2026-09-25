# CLAUDE.md

Project context for Claude Code sessions in this repository.

## What we're building: V1

**EUR/USD BUY Entry Alert, V1.** A backend service that watches EUR/USD from 08:00 to 23:00 Dubai time (`Asia/Dubai`). It detects a BUY setup using Ahmad's Confluence Framework (the PDF), computes a **BUY LIMIT entry price and lot size**, and **emails** the trader, who places the order manually in Exness.

- **In scope:** EUR/USD, BUY only, 50/200 EMA, RSI(14), bullish engulfing or pin bar/hammer, email, at most 3 alerts per day, de-duplication, a 3-candle cooldown, a log of every decision, 15m/30m/1H backtesting.
- **Out of scope:** SELL, the Exness/broker API, order execution, SL/TP placement or management, position monitoring, multiple pairs, a UI.
- **Jev (AI) is completely outside the V1 decision path.** It can never override the deterministic rules.
- **Build order:**
  1. Rules ✅
  2. Data layer ✅
  3. EMA/RSI ✅
  4. Pullback and candle detection ✅
  5. Strategy engine ✅
  6. Backtest ✅ (first preliminary run on 2026 data done; see `docs/backtest/`)
  7. Entry and lots ✅
  8. Email
  9. Cap and dedup ✅ (`AlertPolicy`; the live runner will reuse it)
  10. Paper/live
- **V1.1 daily selector (D9, `docs/v1/selection-v1_1.md`):** exactly 3 alerts per trading day.
  - How it works: slots, tiers A–D by rules passed, a counter-trend flag, and M5 support. `selection.mode: daily_top3` turns it on; the default is `signals` (V1).
  - **Validated once on the 2022-01 → 2026-09 holdout:** gate PASS (not clearly worse than V1), but −0.18R [−0.23, −0.12] per filled trade.
  - **Do not present it as profitable.** Tier A (full V1) was −0.40R on the holdout.
  - The 2022–2026 holdout is **spent** for V1.1: any new rule set needs a fresh holdout.

## Source-of-truth docs

| File | Role |
|---|---|
| `docs/foundation/context-V1.md` | Product scope for V1 |
| `docs/v1/strategy-rules-v1.md` | **Mechanical rule spec.** APPROVED (D1–D6). The strategy code must match it exactly. |
| `docs/foundation/EUR_USD Entry Strategy Guide.pdf` | Ahmad's original strategy. It is truncated at "Applying the Lot Size Formula:". |
| `config/v1.yaml` | Every parameter, each tagged with its provenance |
| `docs/v1/backtest-dataset-2026.md` | The initial backtest dataset: 2026 only, through 2026-09-24, partial year, **preliminary results only**. 2026-09-25 is the loader-validation file only. |
| `docs/v1/jev-research-spec.md` | **Proposed D11**: Jev's exact role ("Jev judges, code executes"; shadow only) and the pre-registered forward validation test. Historical backtests of Jev are invalid, because 2015–2026 may be in its training data. |
| `docs/claude_thinking/` | Claude's reviews and reasoning; advisory. `pdf-review.md` lists the PDF errors (P1–P8), `corrected-strategy.md` is the corrected rewrite. **The original PDF and context-V1.md are never edited.** |

## Hard rules for code

- **Provenance:** every parameter is tagged [PDF], [PDF-INTERP], [ENG], [POLICY] or [PDF-CORRECTION] (a documented fix of a PDF error), in the spec and in `config/v1.yaml`. Never present an [ENG]/[POLICY] value, or our interpretation, as coming from the PDF.
  - Example: RSI oversold is **30 in the PDF**; 35 is our experimental V1 default, and the backtest runs both.
- **No hard-coded strategy numbers.** Everything comes from `config/v1.yaml` (validated by `src/config/schema.ts`), including `pipValuePerLot`. A config with risk above 2% is rejected.
- **No look-ahead (spec §1, §12):**
  - The strategy for candle `i` is a pure function of `candles[0..i]` plus config.
  - The order is: prior move → first touch → confirmation candle.
  - Only closed candles are used.
  - Execution checks and outcomes never feed back into decisions.
  - Test cases NL1–NL12 are listed in spec §12.
- **Integer points:** prices are integer points (1 point = 0.00001). Use `src/core/price.ts`, never float price math.
- **Candles:** keyed by UTC open time, Bid OHLC, with optional Ask OHLC. Empty buckets produce no candle.
- **Deterministic:** the same input gives the same output. Every decision record carries a `configHash`.

## Code layout

```
src/core/        price.ts (points/pips), timeframe.ts (M15/M30/H1, UTC buckets), types.ts (Candle, Tick, Quote)
src/config/      schema.ts (zod), load.ts (YAML load, configHash)
src/core/        timezone.ts (fast UTC→local clock, HH:MM parsing)
src/data/        sources.ts (CandleSource/QuoteSource interfaces), tick-aggregator.ts, resample.ts,
                 validate.ts, exness-ticks.ts (Exness tick CSV/.zip), exness-tick-source.ts, ohlc-csv.ts,
                 tick-stats.ts (data-validation statistics)
src/strategy/    params.ts (config → points), rules.ts (4 rules), sizing.ts (entry, ref stop, lots),
                 engine.ts (decideAt = live path, decideAll = batch; pure, no look-ahead)
src/alerts/      policy.ts (daily cap, dedup, cooldown; chronological, causal)
src/backtest/    tick-store.ts (columnar ticks), execution.ts, outcomes.ts, runner.ts, variants.ts, summary.ts
scripts/         validate-ticks.ts (tick-file validation report), backtest.ts (backtest report)
src/indicators/  ema.ts (SMA-seeded), rsi.ts (Wilder, MT5 edge cases), index.ts
test/            mirrors src/; helpers/random.ts is a seeded PRNG
```

Node ≥ 22, TypeScript (ESM, NodeNext). Relative imports use `.js` extensions.

## Commands

```
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run validate:ticks -- data/raw/Exness_EURUSD_2026_09.zip   # tick-data report
npm run backtest:2026      # preliminary backtest → docs/backtest/2026-preliminary.md
npm run backtest:all       # 2024-01 → 2026-09-24 → docs/backtest/2024-2026.md
npm run validate:2015-2023 # tick validation for 2015–2023
npm run select:frequency   # V1.1 frequency only (no outcomes), 2015 → 2026-09-24
npm run select:grid        # V1.1 design grid, 2015–2021 only
npm run select:holdout -- --variant <name>   # V1.1 one-time holdout from 2022-01-01
```

## Data

- The live data provider is **not chosen yet**; it will implement `CandleSource` and `QuoteSource`.
- Backtest data preferably comes from Exness tick history (Bid/Ask; indicative), fed through `ExnessTickCandleSource`.
- **Tick data lives in `docs/data/`** as zips (GitHub's limit is 100 MB per file):
  - monthly `Exness_EURUSD_2026_01..09.zip` is the backtest dataset;
  - `_09_24.zip` is for one-day loader validation only;
  - the yearly `Exness_EURUSD_2026.zip` overlaps the monthly files and is not used;
  - `Exness_EURUSD_2024.zip` is yearly; `2025_01..12` are monthly (split locally from a 115 MB yearly zip).
  - 2015–2023: yearly zips for 2015, 2017, 2019, 2020, 2021 and 2023; monthly for 2016, 2018 and 2022. 2015 starts on 2015-08-10. Spreads were wider in 2015–2018.
  - Full span: 2015-08-10 → 2026-09-24, 169M ticks. A full run needs `NODE_OPTIONS=--max-old-space-size=8192` (already set in the npm scripts).
- **The 2025 export has whole UTC days written out of order** (Aug–Dec). `TickStore.normaliseOrder` repairs this only when each day lies in a single block, and refuses otherwise. 4 weekdays are missing from the export (2025-11-27, 12-05, 12-24, 12-26).
- Backtest JSON dumps go to `data/backtest/` (gitignored).
- `scripts/crosscheck/independent_signals.py` is an independent Python re-implementation of the rules. Rerun it after any rule change: its signal list must equal the engine's.

## Gotchas

- The PDF's own example (RSI dips to 32, then 40; price 1.0855 with the EMA at 1.0850) fails a literal reading of its rules. That is why the tolerances exist and 35 is tested.
- An RSI reference worksheet (StockCharts) rounds its intermediate averages. Our exact Wilder RSI gives 70.46 where the worksheet shows 70.53.
- The EMA needs `warmupCandles = 1000` to be independent of its seed.
- PDF lot-size fixture: $1,000 at 1% risk, entry 1.0860, SL 1.0840 (20 pips) → 0.05 lots.
- **Commission (P5):** lots = risk$ / (SL pips × pipValuePerLot + commissionPerLotRoundTrip). The value 0 is valid **only** for the approved Standard USD account. Never assume an Exness commission figure.
- **Evidence hierarchy (D7):** Buy Limit results are the primary evidence. The PDF market entry is a secondary diagnostic only; never choose a timeframe or strategy from it.
- **Live timeframe (D8):** not locked. Keep testing 15m/30m/1H and always report frequency together with the outcome metrics (fills/week, fill rate, +2R share and expectancy R with 95% intervals, per-year breakdown). The owner decides.
- **Entry (P4/P6):** production is **always a Buy Limit**. The PDF's market-at-next-open entry exists only as a backtest baseline (`backtest.includePdfMarketBaseline`), filled at the **Ask**. A long's stop triggers on the **Bid**.
- **The email shows the reference stop as "Recommended stop — set manually" (P7).** The system never places or manages it.
- **Risk is always *planned* risk** (entry − reference stop at the planned lot size); never call it "actual". The realized loss can exceed it through stop slippage (gaps/news) or manual placement differences. The backtest measures realized R vs planned R using tick data (spec §9, §11).
- **Main findings, 2024-01 → 2026-09-24** (`docs/backtest/2024-2026-findings.md`): no timeframe shows positive Buy Limit expectancy.
  - M15: −0.25R [−0.47, −0.04], negative every year.
  - M30: −0.08R, about 1 alert/week.
  - H1: −0.12R, about 0.56 alerts/week.
  - RSI is effectively "> 50 and rising".
  - The live timeframe is still the owner's decision (D8).
  - Never tune rules on this data without a holdout.
- **Backtest results on the 2026 dataset are preliminary.** It is a partial year (Jan → 2026-09-24) with warm-up taken from early 2026, so H1 evaluation starts around March. Never present them as conclusive.
- **Layer separation:** decision → alert → execution → outcome. Only the first is strategy; `src/strategy` must never import `src/backtest` or `src/alerts` (enforced by a test).
- **Tick data:** validate new files with `npm run validate:ticks -- <files.zip|csv>`, which writes a report to `docs/claude_thinking/tick-data-validation.md`. `.zip` inputs need the system `unzip`.
