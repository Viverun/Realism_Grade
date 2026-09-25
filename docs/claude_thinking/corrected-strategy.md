# EUR/USD Confluence Entry: corrected version (BUY side)

This is Ahmad's PDF strategy rewritten with the errors from [`pdf-review.md`](pdf-review.md) corrected. **✎** marks every correction and links to its finding. The original PDF is unchanged in `docs/foundation/`. Exact V1 thresholds and tolerances live in `docs/v1/strategy-rules-v1.md` and `config/v1.yaml`. This page stays conceptual, like the original, so it doesn't repeat them.

Chart setup: 50 EMA, 200 EMA, RSI(14). Enter only when all conditions align.

## The four conditions (BUY)

1. **Trend:** the 50 EMA is above the 200 EMA, and price closes above both.
2. **Pullback:** after a move up, price pulls back to **touch or come within a small tolerance** of the 50 EMA. ✎ [P2](pdf-review.md#p2-the-pullback-example-never-touches-the-50-ema-medium-already-handled): the original example "tests" the EMA without touching it.
3. **Momentum:** RSI is turning up, and either it recently dipped into oversold and has recovered back above that level, or it is above 50. The PDF's oversold level is **30**; because its own example uses a dip to 32, V1 also tests **35**. ✎ [P1](pdf-review.md#p1-the-rsi-example-contradicts-the-rsi-rule-high-already-handled)
4. **Price action:** a bullish engulfing candle or a pin bar/hammer forms at the 50 EMA and rejects it.

**Summary rule:** ENTER = Trend + Pullback + Momentum + Candlestick + **Risk Managed**. Risk is managed only if a stop is actually set. The alert therefore always gives a **recommended stop, which the trader sets manually**. ✎ [P7](pdf-review.md#p7-risk-managed-is-a-required-condition-but-v1-places-no-stop-high-corrected)

## Position sizing

Never risk more than 1–2% of the balance on one trade.

```
Lots = (Balance × Risk %) / (SL pips × Pip value per lot + Commission per lot, round trip)
```

✎ [P5](pdf-review.md#p5-the-risk-formula-omits-commission-medium-on-commission-accounts-corrected): commission added.
- On a spread-only account, such as the approved Exness Standard USD account, commission = 0 and this is the PDF's formula.
- On any other account, use that account's actual commission.
- Always round lots **down**.

**SL pips** are measured from the actual fill price: the **Ask** for a buy. The stop triggers when the **Bid** reaches it. ✎ [P4](pdf-review.md#p4-spread-is-ignored-on-the-market-entry-lowmedium-corrected-for-the-baseline)

## Worked example: EUR/USD long, 1H, $1,000 balance, 1% risk ($10)

**Chart checks (unchanged):** 50 EMA 1.0850 > 200 EMA 1.0800. Price pulls back from 1.0900 to 1.0855, within 5 pips of the EMA. RSI dips to 32 and hooks up to 40. A bullish pin bar closes. Valid signal.

**Execution:**

| | PDF original | Corrected |
|---|---|---|
| Entry | Market buy at next open, **1.0860** (a chart/Bid price) | Market buy fills at the **Ask**: 1.0860 + spread. With a 1.0-pip spread that is **1.0861**. ✎ P4 |
| Stop loss | 1.0840 | 1.0840 (Bid-triggered), shown as **"Recommended stop — set manually"**. ✎ P7 |
| SL distance | 20 pips | **21 pips** (1.0861 − 1.0840) |
| Take profit | 1.0900 (1:2) | Unchanged in the PDF strategy; not part of V1 |
| Lot size | *(truncated)* | ✎ [P3](pdf-review.md#p3-the-lot-size-section-is-truncated-medium-completed) |

**Lot size, three ways:**

| Case | Calculation | Lots (rounded down) | Planned risk |
|---|---|---|---|
| PDF as written (no spread, no commission) | $10 / (20 × $10) = 0.0500 | **0.05** | $10.00 on paper, but really $10.50 (1.05%) once the spread is paid |
| ✎ With a 1-pip spread (Standard account) | $10 / (21 × $10) = 0.0476 | **0.04** | $8.40 (0.84%) |
| ✎ Hypothetical commission account ($7 round trip, **illustration only, not an Exness figure**), 20 pips | $10 / (20 × $10 + $7) = 0.0483 | **0.04** | 0.04 × $207 = $8.28 (0.83%) |

Rounding down means the planned risk is always at or below the target. The realized loss can be larger if the stop slips through a gap or news spike. See spec §9, "Planned vs realized risk".

## How V1 differs from this page (by design, not errors)

- **V1 production entry is a Buy Limit**, a few pips below the signal close, and not the PDF's market buy. A limit fills at its own price (the Ask), so the spread issue above doesn't arise, and risk = entry − recommended stop exactly.
- The PDF's market entry is kept **only as a backtest baseline**, to measure whether the Buy Limit helps or hurts. ✎ [P6](pdf-review.md#p6-the-pdf-enters-at-market-v1-uses-a-buy-limit-and-nothing-compares-the-two-medium-corrected)
- V1 is **BUY only**, sends an email at most 3 times per day, and **never places, monitors or modifies** stops or take-profits.
