# Preliminary findings: EUR/USD 2026 backtest (partial year)

> **PRELIMINARY — NOT CONCLUSIVE PERFORMANCE EVIDENCE.**
> - **Data:** January 2026 to 24 September 2026 only, one market regime, with warm-up taken from the same data (H1 evaluation starts 2 March).
> - **Sample sizes are small:** 24, 15 and 5 filled trades on M15, M30 and H1 respectively.
> - **Nothing here justifies changing the strategy or choosing a timeframe yet.** These are observations to re-test on more data.

Generated report: [`2026-preliminary.md`](2026-preliminary.md). Dataset definition: [`../v1/backtest-dataset-2026.md`](../v1/backtest-dataset-2026.md). Analysis by Claude, 2026-09-25.

## 1. What this phase set out to validate, and the result

| Objective | Result |
|---|---|
| **Data pipeline** | ✅ PASS (reports in `docs/claude_thinking/tick-data-validation-2026*.md`). 9,173,272 ticks, symbol `EURUSD`, format `YYYY-MM-DD hh:mm:ss.sssZ` (UTC). No parse errors, out-of-order ticks, crossed quotes or non-positive prices. About 6% of prices carry float-formatting noise (`1.1381999999999999`), which rounds exactly and is harmless. Candles: 18,251 M15 / 9,126 M30 / 4,563 H1, with 0 integrity issues and 100% Ask coverage. |
| **Loader validation (one day)** | ✅ PASS on `Exness_EURUSD_2026_09_24.zip`, which is **byte-identical** to 24 September inside the monthly file (49,055 ticks, same MD5). The 2026-09-25 CSV exists only on the owner's machine and was not pushed. |
| **Data quirks, all benign** | Weekday gaps of 5–9 min fall almost entirely at the daily rollover (21:00/22:00 UTC = 01:00/02:00 Dubai, outside the window). Jumps of over 20 pips are Sunday re-opens plus two 12:30/13:30 UTC (8:30 New York time) US-data releases, e.g. 2026-02-11 (27 pips) and 2026-07-14 (24 pips). |
| **Strategy implementation** | ✅ An **independent Python re-implementation** written from the spec (`scripts/crosscheck/independent_signals.py`, no shared code) found **exactly the same 89 signals** as the TypeScript engine: 58 M15 + 23 M30 + 8 H1, every ID identical. |
| **No look-ahead** | ✅ NL1–NL12 and T1 are covered by unit tests: prefix invariance, perturbing future candles, temporal order, fills only after the signal, outcome isolation, stream = batch. |
| **Signal generation** | ✅ Works end to end: signals, send-time Ask check, cap/dedup/cooldown, placement, fill, outcome. |
| **Preliminary results** | See below: indicative only. |

## 2. Observations (default configuration)

### 2.1 Signals are rare, so the daily cap never binds
| | M15 | M30 | H1 |
|---|---|---|---|
| Signals / trading day | 0.32 | 0.14 | 0.05 (8 signals in ~6.7 months) |
| Capped by the 3/day limit | 0 | 0 | 0 |
| Cooldown-blocked | 6 | 0 | 0 |

The four-way confluence is strict. The candle rule is the narrowest filter: only about 7.5–7.8% of in-window candles pass it on its own. On H1, eight alerts in half a year is probably too few to be useful as an alert product on its own.

### 2.2 RSI: the "recovery from oversold" branch is almost inactive (PDF review R1 confirmed)
- **Most signals come from the "above 50" branch:** 52 of 58 on M15, 22 of 23 on M30, 8 of 8 on H1.
- **The recovery branch alone** gives 6, 1 and 0 signals.
- **RSI 30 (PDF) vs 35 (our variant)** makes almost no difference: M15 goes from 58 to 55 signals, and M30/H1 are identical.

So D1's 30-vs-35 question is practically irrelevant on this data. In practice the RSI rule acts as "RSI > 50 and rising".

### 2.3 The Buy Limit appears to fill mostly on setups that keep falling (PDF review P6)
Same signals, different entry. The "+2R first" share among resolved filled trades, with 95% Wilson intervals:

| | Buy Limit (V1 production) | PDF market entry (baseline) |
|---|---|---|
| M15 | 3/24 = 12% (4–31%) | 14/51 = 27% (17–41%) |
| M30 | 5/15 = 33% (15–58%) | 7/22 = 32% (16–53%) |
| H1 | 2/4 = 50% (15–85%) | 1/4 = 25% (5–70%) |

- **On M15:**
  - Only 46% of emailed limits fill.
  - The median return 4 candles after the fill is **−4.7 pips**.
  - The filled subset does worse than entering at market.

  This matches the adverse-selection concern in P6: the limit fills when price keeps falling and misses when price moves straight up. The intervals overlap, so it is **not established**, but it is the most important thing to re-test.
- **On M30 there is no visible difference.**
- **H1 has too few trades** to say anything.
- For reference: with a 1:2 target and stop, **33%** "+2R first" is break-even before costs. Spread is already included, because fills are at the Ask and exits at the Bid.

### 2.4 Stop slippage was negligible in this sample
- **Realized R on stops:** median −1.00, mean −1.00 to −1.01.
- **Maximum slippage:** 0.3 pips (M30); 15 of 33 stops slipped by at most 0.3 pips.

No stop in this sample was hit during a large gap. Planned risk ≈ realized risk *here*. This does not show that gap risk is small: the dataset contains 20–60-pip Sunday gaps and news spikes; none happened to coincide with an open trade.

### 2.5 Variant sensitivity (one change at a time)
- **Touch tolerance ×2** gives about 40% more M15 signals, with a similar "+2R" share.
- **Midpoint entry** improves the M15 share (5/19) but fills less often.
- **Cooldown 0 or 6** barely changes anything.

With these sample sizes, every one of these differences is within noise. **None should be adopted on the basis of 2026 alone** (overfitting risk).

## 3. Suggested next steps (for the owner to decide)
1. **Get more data before judging performance.** 2025 (and earlier) Exness ticks would give an out-of-sample check and 2–3× the trades. The code needs no changes; add the zips and run `npm run backtest -- … --end …`.
2. **Treat the Buy Limit vs market entry question (§2.3) as the top research item.** It is a product decision from context-V1, so the owner decides. The backtest already measures both.
3. **Decide whether H1's frequency (~1 alert every 3–4 weeks) is acceptable** for the product, or whether M15/M30 should be the live timeframe. That is a product question, not something this data can answer statistically.
4. **The RSI "recovery" branch is almost inert (§2.2).** Whether to keep it as written (faithful to the PDF) is the owner's call. Changing it would move away from Ahmad's rules.
5. **Push the 2026-09-25 CSV** (zipped) if a validation report for that exact day is still wanted. The 09-24 file already validates the loader.

## 4. How to reproduce
```bash
npm ci
npm run validate:ticks -- docs/data/Exness_EURUSD_2026_09_24.zip --out docs/claude_thinking/tick-data-validation-2026-09-24.md
npm run validate:ticks -- docs/data/Exness_EURUSD_2026_0?.zip --out docs/claude_thinking/tick-data-validation-2026.md
npm run backtest:2026
python3 scripts/crosscheck/independent_signals.py docs/data/Exness_EURUSD_2026_0?.zip --end 2026-09-25T00:00:00Z
```
The run is deterministic: the same data and config give the same report, apart from the generation date. Default config hash: see the report header.
