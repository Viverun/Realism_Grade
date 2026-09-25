# V1.1 "exactly 3 alerts per trading day": validation findings

> **Bottom line.**
> - **Mechanics work:** the 3-per-day selector delivers exactly what was asked, **3.00 alerts per trading day** over about 11 years, with almost no missed slots.
> - **The quality gate passed**, but only in the narrow sense agreed in advance: it is **not clearly worse than V1**.
> - **Both lose money on average.** On the untouched 2022 → 2026-09 holdout, the 3-per-day stream lost **−0.18R per filled trade (95% interval −0.23 to −0.12)**, which is clearly negative.
> - **At 1% risk per trade** that is roughly **−0.3% of the account per trading day** on average.
> - **Recommendation:** do not trade it with real money. Production stays on V1 `signals` mode (the config default).

Analysis by Claude, 2026-09-25. Protocol: [`../v1/selection-v1_1.md`](../v1/selection-v1_1.md). Reports: [frequency](v1_1-frequency.md), [design grid](v1_1-design-grid.md), [holdout](v1_1-holdout.md). Data validation: [2015–2023](../claude_thinking/tick-data-validation-2015-2023.md) and [2024–2026](../claude_thinking/tick-data-validation-2024-2026.md).

## 1. Data
- **Coverage:** 2015-08-10 → 2026-09-24, 169.3M Exness EUR/USD ticks.
- **Validation:** PASS with warnings. Timestamps are millisecond-precision and the symbol is `EURUSD`.
- **Day-order repair:** needed only in the 2025 export (Aug–Dec).
- **Missing non-holiday weekdays:**
  - 2015-09-21..23;
  - 2016-01-25/26;
  - 2016-03-29..31;
  - 2021-03-03;
  - 2025-11-27, 12-05, 12-24 and 12-26.
- **Spreads:** wider in 2015–2018 (median 0.8–1.1 pips) than 2020 onwards (0.6).
- **Integrity:** the protocol order is in git history:
  1. design grid and frozen configuration committed (`99ac423`);
  2. holdout run afterwards, once.

## 2. Frequency: the requirement is met
| Period | Trading days | Alerts / day | Missed slots | Tier A / B / C / D | Counter-trend |
|---|---|---|---|---|---|
| Design 2015-08 → 2021 | 1,633 | **3.00** | 3 | 354 / 2,582 / 662 / 1,298 (7% / 53% / 14% / 27%) | 55% |
| Holdout 2022 → 2026-09 | 1,224 | **3.00** | 0 | 247 / 2,023 / 505 / 897 (7% / 55% / 14% / 24%) | 54% |

**Only about 7% of the alerts are Ahmad's full setup** (Tier A). The rest meet 3, 2 or fewer of his four rules, and **more than half are counter-trend** (they fail "never trade against the trend").

## 3. Design grid (2015–2021): every configuration negative
- **All 12 lose money.** Expectancy per filled trade runs from −0.13R to −0.22R, and every 95% interval lies below 0.
- **Frozen by the pre-declared rule:** `w08_23-imm3-no5`, at −0.13R [−0.18, −0.09] (n=2,882).
- **By tier:** only Tier A was not negative, at +0.10R [−0.09, +0.30]; tiers B/C/D were each clearly negative.

## 4. Holdout (2022-01-01 → 2026-09-24, run once)
| | Filled | +2R share (break-even ≈ 33%) | Expectancy R / filled trade | R / alert |
|---|---|---|---|---|
| **V1.1 (3/day)** | 2,229 | 26% [24, 28] | **−0.18 [−0.23, −0.12]** | −0.11 |
| Tier A | 135 | 18% [12, 26] | −0.40 [−0.60, −0.21] | −0.22 |
| Tier B | 1,235 | 28% [26, 31] | −0.12 [−0.20, −0.05] | −0.08 |
| Tier C | 307 | 29% [23, 35] | −0.07 [−0.20, +0.06] | −0.04 |
| Tier D | 552 | 22% [19, 26] | −0.30 [−0.40, −0.20] | −0.19 |
| *V1 baseline, M15* | 254 | | −0.26 [−0.41, −0.10] | |
| *V1 baseline, M30* | 159 | | −0.16 [−0.36, +0.04] | |
| *V1 baseline, H1* | 92 | | −0.13 [−0.39, +0.13] | |

**Gate (§5 of the protocol): PASS.**
- V1.1 − V1(M30) = −0.02R [−0.23, +0.18]. The interval is not entirely below 0.
- That only means the 3-per-day stream is **about as bad as V1**, not better. "Not clearly worse" was the agreed bar, and it is met.

### What this means in money (planned risk 1% per trade, as configured)
- There are about **1.8 filled trades per trading day** (2,229 fills / 1,224 days). At −0.18R each, the average loss is about **0.33% of the account per trading day**, roughly **7% per month**.
  - This is an average; actual paths vary widely.
  - It assumes the trader places every alert exactly as emailed and sets every recommended stop.
- **Up to 3% planned risk per day** if all three fill and stop out. There is still no daily risk cap.

### Important secondary finding
- **Ahmad's full setup (Tier A, the V1 signal) did not hold up out of sample:** +0.10R on 2015–2021, but **−0.40R [−0.60, −0.21]** on 2022–2026.
- **This matches the V1 runs,** where no timeframe showed an edge on 2024–2026.
- **The mechanised rules show no durable edge on EUR/USD 2015–2026** under our interpretation of the PDF. That is a statement about the rules as implemented and tested here, including the spec's [PDF-INTERP] and [ENG] choices, not about Ahmad's discretionary trading.

## 5. Recommendations (owner decides)
1. **Do not trade V1.1 with real money.** Keep `selection.mode: signals` (the default).
2. **If the goal is to exercise the product** (email, timing, trader workflow), run V1.1 in **paper mode**, clearly labelled "not a trading recommendation", to test operations, not profit.
3. **Before any live money, revisit the strategy with Ahmad.** No variant tested so far (V1 on 4 timeframes and 9 variants; V1.1 in 12 configurations) shows a positive expectancy. Any new rule set should follow the same discipline:
   - design on 2015–2021;
   - freeze in git;
   - test once on 2022–2026, which is now **spent for V1.1**, so a fresh holdout (e.g. the live paper period from today) is needed.
4. **If you keep sending alerts, add a daily risk cap** (e.g. `maxDailyRiskPercent`) and consider lowering the per-alert risk.

## 6. Caveats
- **Indicative broker data.** The execution is simulated: Buy Limit fills with no price improvement, a 60 s placement delay, and stops exiting at the first Bid at or below the stop.
- **Mild contamination:** 2024–2026 had already been used for V1 (not V1.1) research, recorded in the protocol before the holdout. The design choice was mechanical.
- **Tier intervals are wide** because the tier subsets are small (e.g. Tier A: 135 holdout fills).
- **About the gate:** "not clearly worse than V1" is the owner's bar. Because V1 is itself negative, passing the gate is not evidence of profitability.
