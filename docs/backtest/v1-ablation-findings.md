# V1 diagnostic ablation: findings (2015-08 → 2026-09-24)

> **Diagnostic only.** Nothing here changes the frozen V1-baseline (`docs/v1/v1-baseline.md`), proposes a new strategy, or chooses a live timeframe (D8 is deferred). The Jev benchmark is untouched. Full tables: [`v1-ablation.md`](v1-ablation.md).

Analysis by Claude, 2026-09-25. **Method:** every in-window candle on 15m/30m/1H that passes the rules of a row is one hypothetical trade with the unchanged V1 trade plan (99,911 candles in total). There is no cooldown or cap, so 95% intervals are clustered by day. **BL** = production Buy Limit (primary evidence, D7). **Market** = the PDF next-open entry at the Ask (diagnostic only).

**Consistency check:** the all-four rows reproduce the V1 backtest within noise: 15m −0.18 vs −0.17, 30m −0.08 vs −0.11, 1H −0.06 vs −0.07.

## Bottom line

1. **The edge is not lost at any one check. It is absent from the start.** "Trend" alone is already negative on every timeframe: −0.10 / −0.12 / −0.09R per filled Buy Limit, with every interval below 0. Adding Pullback, RSI and Candle never moves any timeframe above 0.
2. **No single check is responsible, and none clearly helps.** Dropping any one check from the full set leaves the result within noise of the full set, on every timeframe. The checks mostly filter frequency, not quality.
3. **Setup failure first, fill failure second.** Even with the PDF market entry, the setup is at best break-even (30m 0.00R, 1H −0.04R, 15m −0.06R). The Buy Limit then costs roughly 0.02–0.12R on top, because it fills mostly on the trades that go on to fail.
4. **No robust regime.** Sessions, volatility and trend-strength buckets show no pattern that holds across timeframes. Every "good" cell is small, reverses on another timeframe, and is exactly what 100+ comparisons produce by chance.

## 1. Ladder: adding the checks (BL R per filled trade [95%])

| Step | 15m | 30m | 1H |
|---|---|---|---|
| 1. Trend | −0.10 [−0.13, −0.06] | −0.12 [−0.16, −0.07] | −0.09 [−0.14, −0.05] |
| 2. + Pullback | −0.19 [−0.24, −0.15] | −0.17 [−0.22, −0.12] | −0.12 [−0.18, −0.05] |
| 3. + RSI | −0.16 [−0.22, −0.11] | −0.09 [−0.16, −0.02] | −0.07 [−0.15, +0.01] |
| 4. + Candle (V1) | −0.18 [−0.28, −0.07] | −0.08 [−0.22, +0.06] | −0.06 [−0.24, +0.12] |
| Candles / day at step 4 | 0.56 | 0.36 | 0.22 |

- **Pullback is the one step that measurably worsens things,** clearly on 15m, where the intervals barely overlap. Candles touching EMA50 inside an uptrend do *worse* than trend candles in general.
- **RSI partly undoes that, but never reaches 0.** It is effectively "RSI > 50 and rising" (next section).
- **The candle pattern adds nothing:** step 3 ≈ step 4 on every timeframe. It only cuts frequency by about 5×.

## 2. Drop one check (from the full set)

| Removed | 15m | 30m | 1H |
|---|---|---|---|
| none (all four) | −0.18 | −0.08 | −0.06 |
| Trend | −0.19 | −0.07 | −0.08 |
| Pullback | −0.17 | −0.05 | −0.04 |
| RSI | −0.21 | −0.12 | −0.08 |
| Candle | −0.16 | −0.09 | −0.07 |

All within noise of each other. Even the trend filter, the PDF's "never trade against the trend", makes no measurable difference once the other three checks pass.

## 3. RSI and candle definitions

- **RSI:** in practice it is the "> 50 and rising" branch. The recovery branch fires on only 76 / 53 / 14 candles in 11 years (15m/30m/1H), and oversold 30 vs 35 changes almost nothing (1,307 vs 1,328 candles on 15m; same R). Changing the RSI definition cannot plausibly fix the result.
- **Candle type:** engulfing and pin bar are indistinguishable on 30m and 1H. On 15m, pin-bar-only looks worse (−0.35 [−0.57, −0.14], n=134 fills vs engulfing −0.14). That is a single cell among many, so treat it as a hypothesis only.

## 4. Buy Limit vs market entry (setup vs fill)

| All four checks | 15m | 30m | 1H |
|---|---|---|---|
| BL fill rate | 53% | 60% | 65% |
| **BL R / filled trade** | **−0.18** | **−0.08** | **−0.06** |
| Market R / trade (diagnostic) | −0.06 [−0.15, +0.02] | 0.00 [−0.11, +0.11] | −0.04 [−0.18, +0.10] |
| Market R, candles where the BL **filled** | −0.30 | −0.17 | −0.18 |
| Market R, candles where the BL **did not fill** | +0.21 | +0.26 | +0.23 |

- **Adverse selection is large and consistent:** the Buy Limit fills on the candles whose market entry would have done badly, and misses the ones that ran straight up.
  - Part of this is mechanical: "not filled" means price did not dip back to the entry, so it is not something the trader could know in advance.
  - But it means **a Buy Limit below the close systematically selects the weaker half** of these setups.
- **The market entry is not the fix either.** It is at best break-even, and D7 forbids choosing a strategy from it.
- **Conclusion:** the setup has no measurable edge, and the Buy Limit makes it somewhat worse.

## 5. Trade geometry (MFE/MAE)

- **Movement before the exit:** filled Buy Limit trades move on average about **0.9R in favour and 0.8R against** before exiting (every timeframe, every step). The median trade ends at −1R.
- **Target hit rate:** the +2R target is reached first in 27–30% of resolved trades, against about 33% needed to break even.
- **Implication:** the typical move after these signals is small relative to a 2R target measured from a tight structure stop. That is an observation about the V1 geometry, **not a proposal** to change the stop or target. Any such change would be a new strategy needing fresh data.

## 6. Regimes, sessions, years

- **Sessions:** no session is positive with an interval above 0 on any timeframe. The "bad" and "good" sessions differ by timeframe (e.g. New York −0.34 on 15m, +0.04 on 30m).
- **Volatility:** high volatility is the worst bucket on 15m (−0.25) and the best on 30m (+0.12). The pattern reverses, so it's not a regime.
- **Trend strength:** weak trends look best on 1H (+0.30 [−0.10, +0.69], n=91) but among the worst on 15m (−0.24). It's not consistent.
- **Years:** Trend + Pullback is negative in most years on every timeframe. The all-four sets swing between about −0.6 and +0.7R per year on small samples, with no durable good period.

## What this means (owner decides)

- **The four-check idea, as mechanised here, is not failing because of one miscalibrated check.** The base condition (uptrend by EMA50/200) has no edge on EUR/USD intraday in 2015–2026, and the extra checks don't add discrimination. So tweaking RSI levels, touch tolerances or candle definitions is unlikely to help, and would mainly overfit.
- **The main open question is structural rather than a threshold:** which entry and trade geometry, if any, fits these setups? That would be a new strategy, designed on 2015–2021 and tested on fresh forward data (the 2022–2026 holdout is spent). It is not a change to V1-baseline.
- **Jev's forward test is unaffected and still meaningful.** It asks whether Jev can tell the good setups from the bad ones, which is exactly what the four checks fail to do here.
