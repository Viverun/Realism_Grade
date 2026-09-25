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
  4. Pullback and candle detection
  5. Strategy engine
  6. Backtest
  7. Entry and lots
  8. Email
  9. Cap and dedup
  10. Paper/live

## Source-of-truth docs

| File | Role |
|---|---|
| `docs/foundation/context-V1.md` | Product scope for V1 |
| `docs/v1/strategy-rules-v1.md` | **Mechanical rule spec.** APPROVED (D1–D6). The strategy code must match it exactly. |
| `docs/foundation/EUR_USD Entry Strategy Guide.pdf` | Ahmad's original strategy. It is truncated at "Applying the Lot Size Formula:". |
| `config/v1.yaml` | Every parameter, each tagged with its provenance |

## Hard rules for code

- **Provenance:** every parameter is tagged [PDF], [PDF-INTERP], [ENG] or [POLICY], in the spec and in `config/v1.yaml`. Never present an [ENG]/[POLICY] value, or our interpretation, as coming from the PDF.
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
src/data/        sources.ts (CandleSource/QuoteSource interfaces), tick-aggregator.ts, resample.ts,
                 validate.ts, exness-ticks.ts (Exness tick CSV), exness-tick-source.ts, ohlc-csv.ts
src/indicators/  ema.ts (SMA-seeded), rsi.ts (Wilder, MT5 edge cases), index.ts
test/            mirrors src/; helpers/random.ts is a seeded PRNG
```

Node ≥ 22, TypeScript (ESM, NodeNext). Relative imports use `.js` extensions.

## Commands

```
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit
```

## Data

- The live data provider is **not chosen yet**; it will implement `CandleSource` and `QuoteSource`.
- Backtest data preferably comes from Exness tick history (Bid/Ask; indicative), fed through `ExnessTickCandleSource`.
- Raw data goes in `data/raw/`, which is gitignored.

## Gotchas

- The PDF's own example (RSI dips to 32, then 40; price 1.0855 with the EMA at 1.0850) fails a literal reading of its rules. That is why the tolerances exist and 35 is tested.
- An RSI reference worksheet (StockCharts) rounds its intermediate averages. Our exact Wilder RSI gives 70.46 where the worksheet shows 70.53.
- The EMA needs `warmupCandles = 1000` to be independent of its seed.
- PDF lot-size fixture: $1,000 at 1% risk, entry 1.0860, SL 1.0840 (20 pips) → 0.05 lots.
