# Review of Ahmad's PDF: errors, inaccuracies and weaknesses

**Reviewed:** `docs/foundation/EUR_USD Entry Strategy Guide.pdf` (2 pages, "EUR/USD Entry Strategy Playbook")
**Reviewer:** Claude, 2026-09-25, at the owner's request: "if you see anything wrong in the PDF or inaccurate you may change it … and just let me know".
**Ground rule:** the PDF itself is **not modified**. Corrections that V1 uses go into `docs/v1/strategy-rules-v1.md` / `config/v1.yaml`, tagged **[PDF-CORRECTION]**. Everything else is a recommendation.

**Summary:**
- 8 findings in the PDF (P1–P8): 5 already handled by the approved spec, 3 new corrections applied.
- 3 strategy weaknesses (R1–R3): recommendations only.
- 2 inaccuracies in `context-V1.md` (C1–C2): flagged, not changed.
- The worked example's arithmetic and pip values were checked and are correct (see the end).

| ID | Finding | Severity | Action |
|---|---|---|---|
| P1 | RSI example contradicts the RSI rule | High | Already handled (D1: baseline 30, variant 35) |
| P2 | Pullback example never touches the EMA | Medium | Already handled (touch tolerance) |
| P3 | The lot-size section is truncated | Medium | Completed: 0.05 lots |
| P4 | Spread ignored on the market entry | Low–Medium | **Corrected** for the PDF-baseline backtest entry |
| P5 | The risk formula omits commission | Medium on commission accounts | **Corrected**: `commissionPerLotRoundTrip` |
| P6 | PDF entry (market) ≠ V1 entry (Buy Limit), with no baseline to compare | Medium | **Corrected**: PDF market entry added as a backtest-only baseline |
| P7 | "Risk Managed" is required, but V1 places no stop | High | **Corrected**: the email shows a "Recommended stop — set manually" |
| P8 | "Safely below" the wick/EMA is undefined | Low | Already handled (`slBufferPips`) |
| R1 | The oversold branch rarely fires in an uptrend | Info | Recommendation: quantify in the backtest |
| R2 | No news filter | Medium | Recommendation: V1.1 / backtest tagging |
| R3 | Trend test has no slope | Low | Recommendation: backtest variant later |
| C1 | The trading window isn't quite "European + US" | Info | Flagged; the window is the owner's policy |
| C2 | The sample email time "14:32" is impossible | Low | Flagged |

---

## Errors and inaccuracies in the PDF

### P1: The RSI example contradicts the RSI rule (High, already handled)
- **The PDF's rule:** for a BUY, RSI must be "recovering from oversold (crossing above 30) or sitting above 50".
- **The PDF's example:** "RSI dipped to 32 but hooks upwards to 40." Its verdict: "buyers stepping in", so the setup is valid.
- **The problem:** 32 never went below 30, so nothing crossed above 30; and 40 is not above 50. Read literally, **the PDF's own example fails its own rule.** Either the author thinks of "oversold" loosely (the low 30s), or the example is wrong.
- **Action:** already in the approved spec (§4, D1). The PDF's 30 is kept as the baseline, 35 is an explicit [PDF-INTERP] variant, and the backtest runs both. Nothing further.

### P2: The pullback example never touches the 50 EMA (Medium, already handled)
- **The PDF's rule:** "Wait for price to drop and **touch** the 50 EMA."
- **The PDF's example:** EMA50 is 1.0850 and price "falls to 1.0855", so it stops 5 pips short, yet the verdict is "price has dropped to test the 50 EMA".
- **Action:** already in the spec (§3). A touch is `low ≤ EMA50 + touchTolPips`. With zero tolerance, the PDF's own example would be rejected.

### P3: The lot-size section is truncated (Medium, completed)
- The PDF ends mid-sentence at "Applying the Lot Size Formula:".
- **Completion:** $1,000 × 1% = $10. SL distance = 1.0860 − 1.0840 = 20 pips. $10 / (20 × $10 per pip per lot) = **0.05 lots**.
- **Action:** this is the fixture in spec §9. The corrected rewrite (`corrected-strategy.md`) includes the finished step.

### P4: Spread is ignored on the market entry (Low–Medium, corrected for the baseline)
- **The PDF says:** "Market buy at the opening of the next candle: 1.0860", and the SL distance is 20 pips.
- **The problem:** chart prices in MT5 are **Bid**, but a market buy fills at the **Ask**. The fill is therefore about 1.0860 plus the spread (≈ 1.0861 with a 1-pip spread). A long's stop triggers when the **Bid** reaches it, so the real SL distance is **21 pips**, not 20.
  - Sizing with the PDF's 0.05 lots actually risks 0.05 × 21 × $10 = **$10.50 = 1.05%**, not 1%.
  - Correct sizing: $10 / (21 × $10) = 0.0476 → **0.04 lots** after rounding down.
- **Does it affect V1 production?** No. V1 uses a Buy Limit whose price *is* the Ask fill price (it fills when Ask ≤ ENTRY). The stop triggers on the Bid, so the risk is exactly `ENTRY − REF_SL`, with no hidden spread.
- **Action [PDF-CORRECTION]:** the PDF market-entry baseline in the backtest (P6) fills at the **Ask**: the first tick's Ask at placement, or the next candle's Bid open plus `assumedSpreadPips` when there is no Ask data. The SL distance is measured from that fill.

### P5: The risk formula omits commission (Medium on commission accounts, corrected)
- **The PDF says:** `Lot Size = (Balance × Risk %) / (SL Pips × Pip Value)`.
- **The problem:** the formula counts only the loss from the stop. On account types that charge a per-lot commission, that commission is also lost on a stopped-out trade, so the formula understates risk. The approved account (Exness **Standard**, USD) is spread-only, so for it the PDF's formula is correct.
- **Corrected formula:**
  ```
  Lots = (Balance × Risk%) / (SL_pips × PipValuePerLot + CommissionPerLotRoundTrip)
  ```
- **Action [PDF-CORRECTION]:**
  - Added `account.commissionPerLotRoundTrip`. It is **0, and 0 only because the approved account is Standard USD.**
  - It is a required config value with no hidden default. Any other account type must set it to that account's actual commission, taken from the broker's current terms.
  - **We make no claim about what Exness charges.** The $7 round-trip used in `corrected-strategy.md` is a hypothetical, for illustration only.
  - The spec's §9 formula and PLANNED_RISK now include it.

### P6: The PDF enters at market; V1 uses a Buy Limit, and nothing compares the two (Medium, corrected)
- **The PDF says:** a market buy at the next candle's open.
- **V1 (product decision, context-V1):** a Buy Limit a few pips below the signal close.
- **The problem:** a limit order changes the strategy's results, not just its execution.
  - It misses the strongest setups, where price never pulls back to the limit.
  - It fills more often on setups where price keeps falling (adverse selection).
  - Without the PDF's own entry as a baseline, the backtest can't show whether the Buy Limit helps or hurts Ahmad's strategy.
- **Action [PDF-CORRECTION]:**
  - Added `backtest.includePdfMarketBaseline` (default true). The backtest also runs the PDF's market entry (Ask-filled, P4) as a **baseline only**.
  - It is deliberately **not** an `entry.mode` value. Production can only ever produce Buy Limit alerts.

### P7: "Risk Managed" is a required condition, but V1 places no stop (High, corrected)
- **The PDF says:** "ENTER TRADE = (Trend) + (Pullback) + (Momentum) + (Candlestick) + **(Risk Managed)**". The sizing formula is built on a stop-loss.
- **The problem:** V1 correctly excludes placing or managing stops. But if the email shows the stop only as background information, a trader can reasonably skip it. The lot size then no longer corresponds to 1% risk; the loss is unbounded. That violates the PDF's fifth condition.
- **Action [PDF-CORRECTION]:** the spec (§9) now says the email presents the reference stop as **"Recommended stop — set manually"**, next to the entry and lots, with the caveat that the stated risk only holds if it is set.
  - The system still never places, monitors or modifies it, so the V1 scope is unchanged.

### P8: "Safely below the pin bar's wick and 50 EMA" is undefined (Low, already handled)
- **The PDF's example:** SL 1.0840 is 10 pips below the EMA (1.0850) and 15 pips below the stated low (1.0855). "Safely" has no rule.
- **Action:** already in the spec. `REF_SL = min(pattern low, EMA50) − slBufferPips`, configurable per timeframe.

---

## Weaknesses in the strategy (recommendations only; V1 unchanged)

### R1: The oversold branch rarely fires in a confirmed uptrend
- Rules 1 and 2 require price above EMA50, which is above EMA200, and a shallow pullback to EMA50. In that state RSI(14) typically bottoms well above 30; reaching 30 usually takes a deeper drop that breaks the 50 EMA. This is a market-behaviour expectation, not a measured fact; the backtest will confirm or refute it.
- So the "recovering from oversold" branch will seldom fire, and "RSI > 50" will produce most signals, which makes the RSI filter weak.
- **Recommendation:** the decision log already records which branch fired. The backtest should report the split, and results for `recovery_only` versus `above_mid_only`.

### R2: No news filter
- High-impact EUR/USD events (US NFP and CPI, FOMC, ECB decisions) can move price tens of pips within minutes. A pin bar or engulfing candle printed just before a release says little.
- **Recommendation:** in V1.1, add an economic-calendar flag to the email ("high-impact news within ±30 min"). In the backtest, tag signals near known release times and compare the results.

### R3: The trend test has no slope condition
- Two flat EMAs slightly apart (sideways market) pass "50 EMA > 200 EMA".
- **Recommendation:** a later backtest variant requiring EMA50 to be rising over N candles. It is not in V1.

---

## Inaccuracies in `context-V1.md` (flagged; the owner's policy, not changed)

### C1: The trading window isn't quite "European + US"
- 08:00–23:00 Dubai (UTC+4, no daylight saving) = **04:00–19:00 UTC**.
- London opens at 07:00 UTC (summer) / 08:00 UTC (winter), which is 11:00 / 12:00 Dubai. The window therefore starts about **3–4 hours before London**, in the late Asian session.
- The New York FX session runs to about 17:00 New York, which is 01:00 / 02:00 Dubai. The window therefore **ends 2–3 hours before the New York close**.
- It **does** fully cover the London–New York overlap (12:00–16:00 UTC in summer), the most liquid period for EUR/USD.
- Dubai has no daylight saving but London and New York do, so the window's position relative to the sessions shifts by an hour twice a year.
- **No change:** the window is a [POLICY] choice. If "European + US" is the real intent, something like 11:00–01:00 Dubai would match it better. That is the owner's decision.

### C2: The sample email's "Signal Time: 14:32 Dubai" can't happen
- Signals are generated only at candle **close** times (spec §1). For 1H, that means on the hour (e.g. 15:00); for 15m, at :00, :15, :30 and :45.
- **No change** to context-V1. The email template in Phase 8 will use the candle close time.

---

## Checked and correct
- Trend verdict: 50 EMA 1.0850 > 200 EMA 1.0800 ✓
- SL distance 1.0860 − 1.0840 = 20 pips ✓ (ignoring spread; see P4)
- TP arithmetic: 1.0860 + 0.0040 = 1.0900, which is 1:2 R:R ✓. It coincides with the prior swing high of 1.0900, a sensible target at resistance. TP is out of scope for V1.
- Pip value: $10 per pip per standard lot for EUR/USD on a USD account ✓
- The formula's structure is correct for spread-only accounts ✓
- Risk of 1–2% per trade: a standard, conservative guideline ✓
