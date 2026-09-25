# CLAUDE.md

Project context for Claude Code sessions in this repository.

## What we're building: V1

**EUR/USD BUY Entry Alert, V1.** A backend service that watches EUR/USD from 08:00 to 23:00 Dubai time (`Asia/Dubai`). It detects a BUY setup using Ahmad's Confluence Framework (the PDF), computes a **BUY LIMIT entry price and lot size**, and **emails** the trader, who places the order manually in Exness.

- **In scope:** EUR/USD only, BUY only, 50 EMA / 200 EMA / RSI(14), bullish engulfing or pin bar/hammer, email alerts, at most **3 alerts per day**, de-duplication, logging of every decision (including why a candle was rejected), and 15m/30m/1H support for backtesting.
- **Out of scope:** SELL signals, broker/Exness API, order execution, SL/TP placement or management, position monitoring, AI ("Jev") in the decision, multiple pairs, dashboard/mobile/frontend.
- **Stack:** TypeScript/Node.js. The strategy logic lives in code and must be deterministic and unit-testable. n8n may later handle scheduling and email only, never strategy logic.
- **Build order:** rule definitions → historical data → EMA/RSI → pullback + candle detection → strategy engine → backtest (15m vs 30m vs 1H) → entry + lots → email → cap + dedup → paper/live.

## Docs

| File | What it is |
|---|---|
| `docs/foundation/context-V1.md` | The full V1 product spec: scope, email format, logging, lifecycle, build order. **The source of truth for scope.** |
| `docs/foundation/EUR_USD Entry Strategy Guide.pdf` | Ahmad's strategy (4-step confluence and risk formula). It is truncated at "Applying the Lot Size Formula:". |
| `docs/v1/strategy-rules-v1.md` | **The mechanical rule spec**: exact formulas and parameters for the 4 rules, entry, lot size, cap, dedup and cooldown. **The source of truth for strategy code.** Still a DRAFT until decisions D1–D6 are signed off. |

## Strategy summary (details in `docs/v1/strategy-rules-v1.md`)

Evaluated on the last **closed** candle `i`:
1. **Trend:** `EMA50 > EMA200` and `close > EMA50` and `close > EMA200`.
2. **Pullback:** a candle low within `TOUCH_TOL_PIPS` of EMA50 in the last 3 candles, **and** a prior swing high at least `MIN_SWING_PIPS` above EMA50 in the last 20 candles. Support = 50 EMA only in V1.
3. **RSI(14):** RSI rising **and** either (dipped to ≤ `RSI_OVERSOLD` within the last 5 candles and now above it) or (RSI > 50).
4. **Candle:** a bullish engulfing (body engulfs body) or a pin bar (lower wick ≥ 2× body and ≥ 60% of the range, upper wick ≤ 20% of the range), touching the EMA50 zone.

- **Entry:** `close − ENTRY_OFFSET_PIPS`, valid for 1 candle.
- **Lots:** the PDF formula `(Balance × Risk%) / (SL pips × $10)` using a reference SL = min(pattern low, EMA50) − buffer. The SL is shown for information only and never placed.

## Gotchas

- The PDF's own worked example (RSI dips to 32, then 40) **fails** the literal "crosses above 30" rule, hence decision D1 (30 vs 35).
- Its pullback (price falls to 1.0855 with the EMA at 1.0850) needs a non-zero touch tolerance.
- Do price math in integer points (1 point = 0.00001), not floats.
- EMA200 needs about 600 candles of warm-up to match MT5 values.
- Worked example from the PDF: $1,000 at 1% risk, entry 1.0860, SL 1.0840 (20 pips) → **0.05 lots**. Use it as a test fixture.
