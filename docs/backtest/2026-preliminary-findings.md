# Preliminary findings: EUR/USD 2026 backtest (partial year)

> **PRELIMINARY — NOT CONCLUSIVE PERFORMANCE EVIDENCE.**
> - **Data:** January 2026 to 24 September 2026 only, one market regime, with warm-up taken from the same data (H1 evaluation starts 2 March).
> - **Sample sizes are small:** 24, 15 and 5 filled trades on M15, M30 and H1 respectively.
> - **Nothing here justifies changing the strategy or choosing a timeframe yet.** These are observations to re-test on more data.

> **Superseded for decisions** by the 33-month run: [`2024-2026-findings.md`](2024-2026-findings.md). Kept as the record of the first pipeline validation.

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

### 2.3 Buy Limit results (primary evidence) and the market-entry diagnostic

Per the owner's decision (D7), the **Buy Limit results are the primary evidence**; the PDF market entry is a secondary diagnostic only.

**Buy Limit, default, with 95% intervals:**

| | M15 | M30 | H1 |
|---|---|---|---|
| Emailed alerts / week | 1.44 | 0.68 | 0.27 |
| Filled trades / week | 0.67 | 0.44 | 0.17 |
| Fill rate | 46% | 65% | 63% |
| +2R share of resolved | 13% [4%, 31%] (n=24) | 33% [15%, 58%] (n=15) | 50% [15%, 85%] (n=4) |
| Expectancy, R per filled trade | **−0.63 [−1.04, −0.22]** | 0.00 [−0.75, 0.74] | 0.51 [−0.81, 1.82] |

- **M15 is the only cell whose interval excludes zero:** it is negative on 2026. With 3 timeframes and 9 variants examined, one such cell can appear by chance, so this needs **confirming on 2024–2025**.
- **M30 is indistinguishable from break-even.**
- **H1 has too few trades** to say anything.

**Diagnostic only (not decision evidence).** On the same M15 signals, the PDF market entry reached +2R first in 14/51 = 27% [17%, 41%] of trades. This suggests the M15 limit may fill disproportionately on setups that keep falling, and miss the ones that move straight up. On M30 there was no difference (32% vs 33%). This helps explain the M15 Buy Limit figures; it does not suggest switching production to market entry, which is out of V1 scope.

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
2. **Re-test the M15 Buy Limit result (§2.3) on 2024–2025.** Buy Limit is the primary evidence (D7); the market-entry comparison stays a diagnostic.
3. **Live timeframe: not locked (D8).** H1's ~1 alert every 3–4 weeks is too sparse to decide on alone. Compare 15m/30m/1H Buy Limit frequency and outcomes on 2024–2026.
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
