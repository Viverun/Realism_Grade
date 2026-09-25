# CLAUDE.md

Project context for Claude Code sessions in this repository. It summarizes the foundation docs so every session starts with the same understanding.

## Project overview

`Realism_Grade` has no code yet, only documentation. Its domain is a **rules-based EUR/USD entry strategy** (the "Confluence Framework") traded on the Exness broker.

*Inference, not stated in the docs:* the name suggests the project will grade how realistic or valid a trade setup is against these rules. Confirm with the owner before building on that assumption.

## Docs index

| File | Status |
|------|--------|
| `docs/foundation/EUR_USD Entry Strategy Guide.pdf` | 2-page "EUR/USD Entry Strategy Playbook". It is **truncated**: it ends at "Applying the Lot Size Formula:" and never shows the worked lot-size result. |
| `docs/foundation/context-V1.md` | **Empty** (0 bytes). It is probably a placeholder for the project's own context. |

## Strategy spec: Confluence Framework

Chart indicators: 50 EMA, 200 EMA, RSI(14). Enter only when **all** conditions are true.

| Parameter | Value |
|-----------|-------|
| `EMA_FAST` | 50 |
| `EMA_SLOW` | 200 |
| `RSI_PERIOD` | 14 |
| `RSI_OVERSOLD` | 30 |
| `RSI_OVERBOUGHT` | 70 |
| `RSI_MID` | 50 |
| `MAX_RISK` | 1–2% of account balance per trade |
| `DEFAULT_RR` | 1:2 (risk:reward) |

### 1. Trend (Baseline)
- **BUY:** `EMA50 > EMA200` and `price > EMA50` and `price > EMA200`.
- **SELL:** `EMA50 < EMA200` and `price < EMA50` and `price < EMA200`.
- No counter-trend trades (the doc makes an exception only for "highly experienced" traders).

### 2. Pullback (Setup)
Don't buy at a peak or sell at a bottom. Wait for price to come back to an area of value.
- **BUY:** price drops to touch the 50 EMA or support.
- **SELL:** price rises to test the 50 EMA or resistance.

### 3. Momentum (Trigger)
- **BUY:** RSI crosses above 30 (recovering from oversold) **or** RSI > 50.
- **SELL:** RSI crosses below 70 (rejecting overbought) **or** RSI < 50.

### 4. Price Action (Entry)
A candlestick must confirm that price is rejecting the level.
- **BUY:** bullish engulfing, or pin bar / hammer, at support.
- **SELL:** bearish engulfing, or shooting star, at resistance.

### Summary rule
```
ENTER TRADE = Trend Confirmed + Pullback to Value Area + RSI Momentum Alignment
              + Candlestick Confirmation + Risk Managed
```

## Risk management

```
Lot Size = (Account Balance × Risk %) / (SL Pips × Pip Value)
```
Never risk more than 1–2% of the balance on a single trade.

### Worked example from the PDF (EUR/USD long, 1H chart)
Trader profile: $1,000 balance, 1% max risk ($10).

| Step | Observed | Verdict |
|------|----------|---------|
| 1. Trend | 50 EMA = 1.0850, 200 EMA = 1.0800 | 50 > 200: uptrend, buy only |
| 2. Pullback | Price hit 1.0900, then fell to 1.0855 | Testing the 50 EMA value area |
| 3. Momentum | RSI dipped to 32, then hooked up to 40 | Selling momentum fading |
| 4. Price action | 1H candle closed as a bullish pin bar | Buyers rejected support: valid signal |

Execution:
- **Entry:** market buy at the next candle open, **1.0860**
- **Stop loss:** below the pin-bar wick and the 50 EMA, **1.0840** (20 pips)
- **Take profit:** 1:2 R:R, 40 pips, **1.0900**
- **Lot size:** *derived here, because the PDF cuts off:* $10 / (20 pips × $10 per pip per standard lot) = **0.05 lots** (5 micro lots).

## Open questions / gaps
- `docs/foundation/context-V1.md` is empty. The intended project context is missing.
- The PDF is truncated, so the final lot-size calculation (and anything after it) is missing.
- "Support/resistance" and "touch/test the 50 EMA" have no precise definition (tolerance in pips? wick vs. close?).
- Pin bar, hammer, engulfing and shooting star have no quantitative criteria (wick/body ratios, etc.).
- The RSI conditions use a loose "or": "RSI > 50" alone would satisfy the BUY trigger.
- Stop-loss placement ("safely below the wick and the 50 EMA") has no fixed buffer.
- Pip value is assumed to be $10 per standard lot for EUR/USD with a USD account.
