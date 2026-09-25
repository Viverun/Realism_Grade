# V1 Strategy Rules: Mechanical Specification

**Status:** APPROVED (D1–D6 approved with clarifications, 2026-09-25). This is Phase 1 of the build order in `docs/foundation/context-V1.md`.
**Source:** `docs/foundation/EUR_USD Entry Strategy Guide.pdf` (Ahmad's Confluence Framework).
**Scope:** EUR/USD, BUY only, 15m / 30m / 1H.
**Config:** every parameter below lives in `config/v1.yaml`. Strategy code contains **no** hard-coded strategy numbers.

## Provenance tags

Every rule and parameter carries a tag, so we never confuse what the PDF says with what we decided.

| Tag | Meaning |
|---|---|
| **[PDF]** | Stated in Ahmad's PDF. |
| **[PDF-INTERP]** | The PDF is ambiguous or internally inconsistent here; this is our explicit interpretation. The PDF baseline is recorded next to it. |
| **[ENG]** | An engineering parameter we introduced to make a rule mechanical. Tunable, and compared in the backtest. |
| **[POLICY]** | A V1 product, alert or execution policy. It is not strategy logic and does not come from the PDF. |
| **[PDF-CORRECTION]** | A documented correction of an error or omission in the PDF. The PDF itself is unchanged; the reasoning is in `docs/claude_thinking/pdf-review.md` (finding IDs P1–P8). |

Jev (AI) is **outside the V1 decision path entirely**. Nothing in this document can be overridden by Jev.

---

## 0. Conventions

| Item | Rule | Tag |
|---|---|---|
| Pip | `PIP = 0.0001` = 10 points. Prices are 5-digit, e.g. `1.13691`. | [ENG] |
| Arithmetic | Prices are stored and compared as **integer points** (1 point = 0.00001). `1.13710 − 1.13690` = exactly 20 points. Indicator values are floating-point in point units. | [ENG] |
| Candle time | Every candle is keyed by its **open time**, in UTC. Close time = open time + timeframe. Candles align to UTC boundaries. Exness server time is GMT+0. | [ENG] |
| Candle prices | Strategy OHLC is **Bid**, which matches Exness MT5 charts. Ask is carried separately where the source provides it and is used only for execution validation (§6, §11). | [ENG] |
| Signal candle | `i` = the **most recently closed** candle. A forming candle is never evaluated. | [ENG] |
| Gaps | Periods with no ticks (weekends, holidays) produce **no** candle. Candles are never fabricated or forward-filled. Indicators run over the candle sequence, not wall-clock time. | [ENG] |
| Determinism | The same candles plus the same config always produce the same decision. | [POLICY] |

### Indicators

| Indicator | Definition | Tag |
|---|---|---|
| `EMA(n)` | `α = 2/(n+1)`, seeded with the SMA of the first `n` closes, then `EMA[k] = α·close[k] + (1−α)·EMA[k−1]`. `n` = 50 and 200. | [PDF] periods / [ENG] seeding |
| `RSI(n)` | Wilder's RSI with `n` = 14. The first average gain/loss is the SMA of the first `n` close-to-close changes; after that, `avg = (avg·(n−1) + current)/n`. `RSI = 100 − 100/(1 + avgGain/avgLoss)`. Edge cases follow MT5: `avgLoss = 0` gives 100 if `avgGain > 0`, else 50. | [PDF] period / [ENG] method |
| Warm-up | A candle is evaluated only when at least `warmupCandles = 1000` candles precede it. Our EMA can't match MT5 exactly, because MT5 seeds from the first bar of whatever history it has loaded. After 1000 candles, the EMA200 difference from any seed is below 0.01% of the initial seed error. | [ENG] |

### Candle anatomy (candle `k`)

```
range      = high − low
body       = |close − open|
upperWick  = high − max(open, close)
lowerWick  = min(open, close) − low
bullish    = close > open
bearish    = close < open
```

---

## 1. Temporal ordering and no-look-ahead (hard constraint)

> All strategy conditions are evaluated using only information available at the **close of the signal candle `i`**. The **prior-move** condition must occur **strictly before** the qualifying pullback/touch. The pullback/touch must occur **before or on** the signal candle. No candle after `i`, and no data timestamped after `closeTime[i]`, may be used by the strategy.

The required order:

```
prior move (candles strictly before the first touch t)
        ↓
pullback / touch (first touch t, with i−2 ≤ t ≤ i)
        ↓
bullish confirmation candle (i, plus i−1 for engulfing)
        ↓
signal at closeTime[i]
```

- The strategy function receives only `candles[0..i]`. It is structurally unable to see later data. It is a pure function of that prefix and the config.
- The confirmation candle **cannot** create the prior move: the prior-move window ends at `t − 1 ≤ i − 1`.
- Execution checks (§6) and backtest outcomes (§11) happen **after** the decision and never feed back into it.
- Test cases that enforce this are listed in §12.

---

## 2. Rule 1: Bullish trend [PDF]

```
TREND_OK =
      EMA50[i]  > EMA200[i]
  AND close[i]  > EMA50[i]
  AND close[i]  > EMA200[i]
```

"Current price" means the **Bid close of the signal candle**.

---

## 3. Rule 2: Pullback to the 50 EMA

Source: the PDF says to wait for the price to drop and touch the 50 EMA **or support** [PDF]. **V1 uses the 50 EMA only; horizontal support is deferred to V2** [PDF-INTERP, D5].

**2a. Touch.** Collect the candles in the pullback window whose low reached the EMA50 zone:

```
zone(k)  = EMA50[k] + touchTolPips · PIP
T        = { k ∈ [i − pullbackLookback + 1 … i] : low[k] ≤ zone(k) }
TOUCH_OK = T is not empty
t        = min(T)                       // the first touch candle of this pullback
```

**2b. Prior move, strictly before the touch.** Some candle before the first touch was extended above the EMA:

```
SWING_OK = ∃ j ∈ [t − swingLookback … t − 1] :
               high[j] − EMA50[j] ≥ minSwingPips · PIP
```

`PULLBACK_OK = TOUCH_OK AND SWING_OK`

- **Wick (low), not close:** the PDF's entry is a rejection of the level. The wick tests the EMA, and Rule 1 requires the close back above it.
- **The swing is measured against the EMA at the same candle `j`.** This asks whether price was extended above its EMA at that moment, and avoids mixing EMA values from different candles.

| Parameter | 15m | 30m | 1H | Tag |
|---|---|---|---|---|
| `touchTolPips` | 2 | 3 | 5 | [ENG] |
| `minSwingPips` | 8 | 10 | 15 | [ENG] |
| `pullbackLookback` | 3 | 3 | 3 | [ENG] |
| `swingLookback` | 20 | 20 | 20 | [ENG] |

**PDF example:** EMA50 is 1.0850 and price falls to 1.0855, 5 pips above, so it passes at 1H with a 5-pip tolerance. With **zero** tolerance, the PDF's own example would be rejected. The prior high of 1.0900 is 50 pips above the EMA ✓.

---

## 4. Rule 3: RSI(14) momentum confirmation

The PDF says: "RSI recovering from oversold (crossing above 30) **or** sitting above 50" [PDF].

```
RISING       = RSI[i] > RSI[i−1]                                        [PDF-INTERP] "recovering"

RECOVERY_OK  = min(RSI[k] : k ∈ [i − rsiLookback … i]) ≤ rsiOversold
               AND RSI[i] > rsiOversold
               AND RISING

ABOVE_MID_OK = RSI[i] > rsiMid AND RISING

RSI_OK = RECOVERY_OK OR ABOVE_MID_OK          (rsiMode = both; see below)
```

| Parameter | Value | Tag |
|---|---|---|
| `rsiPeriod` | 14 | [PDF] |
| `rsiMid` | 50 | [PDF] |
| `rsiOversold`, **PDF baseline** | **30** | [PDF] |
| `rsiOversold`, **V1 default** | **35** (experimental; backtest 30 vs 35) | [PDF-INTERP, D1] |
| `requireRising` | true | [PDF-INTERP] |
| `rsiLookback` | 5 candles | [ENG] |
| `rsiMode` | `both` \| `recovery_only` \| `above_mid_only` (backtest comparison) | [ENG] |

**Why 35 is tested:** the PDF's worked example is inconsistent with a literal "crossing above 30". RSI "dips to 32, hooks upwards to 40": it never went below 30, and 40 is not above 50. We do **not** claim the PDF says 35. The PDF's rule is 30; 35 is our explicit variant, and the backtest runs both.

**Caution:** in an uptrend RSI is often above 50, so the `above_mid` branch is weak on its own. The decision log records which branch fired, so the backtest can quantify this.

---

## 5. Rule 4: Bullish price-action confirmation [PDF], geometry [ENG]

This rule is evaluated on signal candle `i` (and `i−1` for engulfing). **Location** reuses the touch set `T` from Rule 2: the pattern must form **at** the value area, as the PDF requires with "at support".

### 5a. Bullish engulfing [PDF], definition [ENG]

```
ENGULF =
      bearish[i−1]
  AND bullish[i]
  AND open[i]  ≤ close[i−1]
  AND close[i] ≥ open[i−1]
  AND body[i]  > body[i−1]
  AND (i−1 ∈ T OR i ∈ T)                 // at the value area
```

Only bodies are compared; wicks are ignored. `≤`/`≥` are used because FX candles often open at the previous close.

### 5b. Bullish pin bar / hammer [PDF], geometry [ENG]

```
PIN =
      range[i]     ≥ minRangePips · PIP
  AND lowerWick[i] ≥ pinWickBodyRatio  · body[i]
  AND lowerWick[i] ≥ pinWickRangeRatio · range[i]
  AND upperWick[i] ≤ pinMaxUpperRatio  · range[i]
  AND (pinRequireBullishBody = false OR bullish[i])
  AND i ∈ T                              // the wick itself tested the value area
```

| Parameter | Default | Tag |
|---|---|---|
| `pinWickBodyRatio` | 2.0 | [ENG] |
| `pinWickRangeRatio` | 0.6 | [ENG] |
| `pinMaxUpperRatio` | 0.2 | [ENG] |
| `minRangePips` | 15m: 3, 30m: 4, 1H: 5 | [ENG] |
| `pinRequireBullishBody` | false (a hammer may have either colour) | [PDF-INTERP] |

`CANDLE_OK = ENGULF OR PIN`. If both match, both are logged and the signal fires once.

---

## 6. BUY signal and trading window

```
BUY_SIGNAL = TREND_OK AND PULLBACK_OK AND RSI_OK AND CANDLE_OK AND IN_WINDOW
IN_WINDOW  = closeTime[i] in Asia/Dubai ∈ [08:00, 23:00] (inclusive)          [POLICY]
```

All four rules are **always evaluated and logged**, even after one fails.

Example: a 1H candle opening at 07:00 Dubai (closing at 08:00) is in the window. One opening at 22:00 (closing at 23:00) is in. One opening at 23:00 (closing at 00:00) is out.

---

## 7. Entry price (BUY LIMIT)

```
ENTRY = close[i] − entryOffsetPips · PIP            (integer points)
```

| Parameter | 15m | 30m | 1H | Tag |
|---|---|---|---|---|
| `entryOffsetPips` | 1.0 | 1.5 | 2.0 | [ENG] |
| `entryMode` | `close_offset` (default) \| `candle_mid` (backtest variant) | | | [ENG, D3] |

- The PDF enters at market on the next candle's open (≈ `close[i]`) [PDF]. V1 uses a Buy Limit a few pips below instead [POLICY, context-V1].
- **Order validity:** the email states "valid until the close of the next candle (Dubai time)". This is **[POLICY]** (a V1 alert/execution policy); it is **not in the PDF**. V1 doesn't track fills; the expiry is advisory. `entryValidCandles = 1`.
- **Spread note:** candle prices are Bid, but a Buy Limit fills when **Ask ≤ ENTRY**. For a fill, Bid must therefore drop to about `ENTRY − spread`.
- **PDF market-entry baseline (backtest only)** [PDF] entry, [PDF-CORRECTION P4, P6] fill:
  - When `backtest.includePdfMarketBaseline` is true, the backtest also evaluates the PDF's own entry: a market buy at the start of the next candle.
  - It is filled at the **Ask**: the first tick's Ask at or after `P` (§11), or the next candle's Bid open + `assumedSpreadPips` without Ask data. SL_PIPS is measured from that fill.
  - It is **not** an `entryMode` value. **V1 production alerts are always Buy Limits.**

---

## 8. Live-price validation (before any email is sent) [POLICY]

Exness defines a Buy Limit as an order **below** the current market price, and buys execute at the **Ask**. The alert is validated against a live quote at send time. The strategy (§2–§6) stays purely OHLC-based; this check is execution-side only.

At send time `now`, for a signal on candle `i`:

| # | Check | Fail status (no email) |
|---|---|---|
| V1 | **Latency:** `now − closeTime[i] ≤ maxSignalLatencySec` (default 120 s) | `stale_signal` |
| V2 | **Quote freshness:** a live quote `q = {bid, ask, time}` exists and `now − q.time ≤ maxQuoteAgeSec` (default 10 s) | `no_quote` |
| V3 | **Buy Limit placement:** `ENTRY ≤ q.ask − minLimitDistancePips · PIP`, and at least strictly `ENTRY < q.ask`. `minLimitDistancePips` defaults to 0; set it to the Exness stop level for the account if non-zero. | `entry_not_below_market` |
| V4 | **Risk geometry:** `ENTRY > REF_SL` (§9) | `invalid_risk_geometry` |
| V5 | **Risk cap:** planned risk after lot rounding `≤ maxRiskPercent` (§9) | `risk_exceeds_max` |
| V6 | **Cap / dedup / cooldown** (§10) | `capped` / `duplicate` / `cooldown` |

- **Order of evaluation:** V1 → V6. Only a signal that passes all six is emailed, and only emailed signals count toward the daily cap and cooldown.
- **`quoteMode`:**
  - `strict` (default): V2 must pass.
  - `candle_close_fallback`: only if the chosen data provider has no live bid/ask. Then `ask ≈ close[i] + assumedSpreadPips`, and the email is flagged "entry not validated against a live quote".
- **Provider revisions:** live candles are fetched `candleSettleSec` (default 5 s) after close. The exact OHLC used is stored in the decision record, so a replay uses the same values even if the provider later revises the candle.
- The email tells the trader: "If price is already below the entry when you place the order, skip this signal."

---

## 9. Lot size: PDF formula with a reference stop [PDF formula, D2]

```
Lot Size = (Account Balance × Risk %) / (SL Pips × Pip Value)            [PDF]
```

Corrected to include per-lot commission [PDF-CORRECTION P5]. With commission = 0 (the approved Standard USD account), this is exactly the PDF formula:

V1 places no SL. The formula still needs an SL distance, so a **reference stop** follows the PDF's placement rule ("safely below the pin bar's wick and the 50 EMA") [PDF-INTERP]. It is used for sizing and shown in the email as **"Recommended stop — set manually"** [PDF-CORRECTION P7]. The PDF requires "Risk Managed" as an entry condition, and the lot size only equals the target risk if this stop is set. The system never places, monitors or modifies it [POLICY].

```
REF_SL        = min(low of pattern candles, EMA50[i]) − slBufferPips · PIP       (floored to a point)
SL_PIPS       = max((ENTRY − REF_SL) / PIP, minSlPips)
LOTS_RAW      = (balance × riskPercent/100) / (SL_PIPS × pipValuePerLot + commissionPerLotRoundTrip)
LOTS          = clamp(floor_to_step(LOTS_RAW, lotStep), minLot, maxLot)
PLANNED_RISK_$ = LOTS × (SL_PIPS × pipValuePerLot + commissionPerLotRoundTrip)
PLANNED_RISK_% = PLANNED_RISK_$ / balance × 100
```

| Parameter | Default | Tag |
|---|---|---|
| `account.currency` / `account.type` | USD / standard | [POLICY, D6] configuration assumption, not architecture |
| `account.balance` | set by the trader, updated manually (no Exness API) | [POLICY] |
| `riskPercent` | 1.0 | [PDF] (1–2%) |
| `maxRiskPercent` | 2.0. Config above this is **rejected at load**; PLANNED_RISK above it is rejected at V5. | [PDF] |
| `pipValuePerLot` | 10 (USD per pip per 1.00 lot; EUR/USD, USD account, 100,000 units). **Read from config, never hard-coded.** | [ENG, D6] |
| `commissionPerLotRoundTrip` | **0**, valid **only** for the approved Standard USD account (spread-only). A required config value with no implicit default: any other account must set its actual commission from the broker's current terms. No Exness commission figure is assumed anywhere. | [PDF-CORRECTION P5] |
| `lotStep` / `minLot` / `maxLot` | 0.01 / 0.01 / config | [ENG] / [POLICY] safety cap |
| `slBufferPips` | 15m: 2, 30m: 2, 1H: 3 | [ENG] |
| `minSlPips` | 5 (prevents oversized lots) | [ENG] |

- **Lots are always rounded down**, so risk never rounds up.
- If `LOTS_RAW < minLot`, `LOTS = minLot`. That usually pushes PLANNED_RISK above target; if it exceeds `maxRiskPercent`, the signal is rejected (V5).
- **Caveat stated in the email:** "Planned risk: $X (Y%). The actual loss can be larger if the stop slips (gaps/news) or the order is placed differently." The planned figure also assumes the trader sets the recommended stop.

### Planned vs realized risk [POLICY]

Everything this system computes is **planned** risk: `ENTRY − REF_SL` at the planned lot size. The **realized** loss on a stopped-out trade can differ:

| Source | Direction | Notes |
|---|---|---|
| **Stop slippage** | Worse | A stop executes as a market order once the Bid reaches it. Through gaps (weekend open, news releases) it fills at the next available Bid, possibly well below `REF_SL`. **This is the main risk.** |
| Limit entry fill | Same or better | A Buy Limit normally fills at its price or better, e.g. when price gaps below it. Confirm this in the account's execution terms. |
| Manual placement | Either | The trader may edit the price, place it late, or use a market order instead. The system cannot see this (no Exness API). |
| Lot rounding / `minLot` | Lower / higher | Rounding down lowers risk; being forced up to `minLot` raises it (bounded by V5). |
| Stop not set | Unbounded | The PDF's "Risk Managed" condition is not met (P7). |

The backtest measures the stop-slippage component (§11). The email and the log always label the figure as **planned**.
- **PDF example:** $1,000 × 1% = $10, with an SL of 20 pips: $10 / (20 × $10) = **0.05 lots**. This is a test fixture.

---

## 10. Daily cap, de-duplication, cooldown [POLICY]

| Rule | Definition | Tag |
|---|---|---|
| Day | The calendar date in `Asia/Dubai` of `closeTime[i]` | [POLICY] |
| Cap | `maxAlertsPerDay = 3`, counted across the whole system | [POLICY] |
| Over the cap | **Chronological first three**, by signal-candle close time. Later signals are logged `capped`. | [POLICY] |
| Signal ID | `EURUSD|<timeframe>|<signal candle open time, UTC ISO>`. Emailed at most once, including across restarts. | [POLICY] |
| Cooldown | After an **emailed** alert on a timeframe, no alert on that timeframe for `cooldownCandles = 3` candle-durations: blocked while `openTime − lastAlertOpenTime ≤ cooldownCandles × timeframe`. It is time-based so it is identical in live and backtest regardless of how much history is loaded; a weekend gap does not extend it. Skipped signals are logged `cooldown`. | [POLICY, D4] |
| Live timeframe | Live mode runs **one** timeframe, chosen from the backtest. The backtest runs 15m, 30m and 1H independently. | [POLICY] |

---

## 11. Backtest execution model

**Initial dataset:** 2026 only (Jan → 2026-09-24, partial year); see `docs/v1/backtest-dataset-2026.md`. Its results are preliminary, not conclusive.

This section applies the live-price validation to historical data. The preferred data is **Exness historical Bid/Ask ticks** (exness.com/tick-history; indicative data), which lets execution assumptions be checked against Exness's own prices. Third-party candle data can be used for signal counts, but fill results from it are marked **approximate**.

For each signal on candle `i` (decision already made from `candles[0..i]`):

1. **Send-time validation (§8 V3):** the quote is the first tick at or after `closeTime[i]`. If `ENTRY ≥ ask`, the status is `entry_not_below_market` (not "emailed"). V1 latency and V2 freshness are assumed to pass in backtest.
2. **Cap / dedup / cooldown (§10)** is applied chronologically to signals that pass step 1.
3. **Trader placement:** the placement time is `P = closeTime[i] + placementDelaySec` (default 60 s) [ENG]. The quote is the first tick at or after `P`. If `ENTRY ≥ ask(P)`, the status is `invalid_at_placement`. It was emailed and counts toward the cap, but is not filled.
4. **Fill:** the expiry is `E = closeTime[i] + entryValidCandles × timeframe`. The order is **filled** at `ENTRY` at the first tick in `(P, E]` with `ask ≤ ENTRY`; otherwise it is `expired`. No positive slippage is modelled.
   - With candle-only data: filled if candle `i+1` has `askLow ≤ ENTRY`, or `bidLow + assumedSpreadPips·PIP ≤ ENTRY` without ask data. Marked approximate.
5. **Outcome metrics** use only data **after the fill time** and never feed back into decisions:
   - Return after N candles (`outcomeHorizons`, e.g. 1H: 4, 8, 24).
   - MFE and MAE in pips over each horizon.
   - **Stop exit and slippage:** a simulated stop exits at the **Bid of the first tick at or below `REF_SL`**. With tick data this captures gap slippage. Report **realized R vs planned R** per trade, plus the slippage distribution in pips. With candle-only data the exit is at `REF_SL` and marked approximate.
   - `+2R before −1R`, where R = SL_PIPS from §9. This is PDF-consistent (1:2 R:R) and reported as a research metric, **not** a win rate. If both levels are hit inside the same candle with candle-only data, it is counted as `ambiguous`.
6. **Report per timeframe and variant:** signal count, signals per day, status breakdown, fill rate, and the outcome distributions.

**Evidence hierarchy (owner decision, 2026-09-25) [POLICY]:**
- **Buy Limit results are the primary evidence** for timeframe and strategy decisions, because production V1 is Buy Limit only.
- The PDF market-entry baseline is a **secondary diagnostic only**, e.g. for spotting adverse selection. It is never used on its own to choose a timeframe or strategy.

**Timeframe selection [POLICY]:** the live timeframe is **not locked**. 15m, 30m and 1H are all tested, and each report shows **signal frequency together with the outcome metrics** for the Buy Limit:
- alerts and fills per week;
- fill rate;
- +2R share with a 95% Wilson interval;
- expectancy in R per filled trade and per emailed alert, with 95% intervals;
- a per-year breakdown.

The owner selects the live timeframe after comparing these.

**Variants:**
- `rsiOversold` 30 vs 35
- `rsiMode` both / recovery_only / above_mid_only
- `touchTolPips` at 0.5×, 1× and 2×
- `entryMode` close_offset vs candle_mid (both Buy Limit)
- PDF market-entry baseline (`backtest.includePdfMarketBaseline`, Ask-filled): answers whether the Buy Limit helps or hurts the PDF strategy [PDF-CORRECTION P6]
- `cooldownCandles` 0 / 3 / 6

---

## 12. No-look-ahead and causality test cases

| ID | Test | Phase |
|---|---|---|
| **NL1** | **Indicator prefix invariance:** EMA/RSI at index `k` computed on `closes[0..k]` equals the value at `k` computed on the full series. | 3 ✅ |
| **NL2** | **Closed candles only:** the tick aggregator and resampler never emit a candle with `closeTime > asOf`. Appending ticks at or after `asOf` doesn't change the emitted candles. A higher-TF bucket whose close time is after `asOf` is not emitted, even if some of its M15 candles already exist. | 2 ✅ |
| **NL3** | **Decision prefix invariance:** for every `i`, `evaluate(candles[0..i])` equals the record at `i` from a full-history run. | 5 ✅ |
| **NL4** | **Future perturbation:** randomly rewriting every candle after `i` leaves the decision at `i` byte-identical. | 5 ✅ |
| **NL5** | **Prior move precedes the touch:** the only candle with `high − EMA50 ≥ minSwing` is at or after the first touch `t` → PULLBACK fails. The same candle moved to `t − 1` → passes. | 4 ✅ |
| **NL6** | **The signal candle can't create the prior move:** a large engulfing signal candle whose high exceeds `EMA50 + minSwing`, with no earlier extension → fails. | 4 ✅ |
| **NL7** | **Touch after the signal is ignored:** a touch only at `i+1` → fails at `i` (also covered by NL3). | 4 ✅ |
| **NL8** | **RSI window is bounded:** a dip to ≤ oversold at `i − rsiLookback − 1` → the recovery branch fails; at `i − rsiLookback` → passes. | 4 ✅ |
| **NL9** | **Stream equals batch:** a candle-by-candle live-path replay (`decideAt` on each prefix + `AlertPolicy`) produces the same alert log as the batch path (`decideAll` + `AlertPolicy`). | 9 ✅ |
| **NL10** | **Cap/cooldown causality:** deleting a later signal on the same day never changes the status of an earlier one. | 9 ✅ |
| **NL11** | **Execution causality:** send-time and placement checks and fill search use only ticks at or after `closeTime[i]` / `P`. Fixture: the signal candle's own low is below ENTRY but later ticks never reach it → `expired`, not filled. | 6 ✅ |
| **NL12** | **Outcome isolation:** decision records contain no outcome fields. The strategy module does not import the backtest/outcome module (checked by a test on the import graph). | 6 ✅ |
| **T1** | **Window boundaries:** closes at 08:00 and 23:00 Dubai are in; 07:45 and 23:15 are out. | 5 ✅ |

---

## 13. Per-candle decision record (logged for every evaluated candle)

```jsonc
{
  "id": "EURUSD|H1|2026-09-25T10:00:00.000Z",
  "timeframe": "H1",
  "closeTimeDubai": "2026-09-25T15:00:00+04:00",
  "ohlc": [1.13690, 1.13720, 1.13585, 1.13710],
  "ema50": 1.13620, "ema200": 1.12980, "rsi14": 44.2, "rsiPrev": 38.9,
  "trend": true,
  "pullback": { "touch": true, "firstTouch": "2026-09-25T10:00:00.000Z", "swing": true },
  "rsi": { "ok": true, "branch": "recovery" },
  "candle": { "ok": true, "patterns": ["pin_bar"] },
  "inWindow": true,
  "buySignal": true,
  "entry": 1.13690, "refSl": 1.13555, "slPips": 13.5, "lots": 0.07, "plannedRiskUsd": 9.45, "plannedRiskPct": 0.945,
  "configHash": "sha256:…",
  "status": "emailed"   // emailed | capped | cooldown | duplicate | no_signal | outside_window
                        // | stale_signal | no_quote | entry_not_below_market
                        // | invalid_risk_geometry | risk_exceeds_max | warmup
}
```

`configHash` ties every decision to the exact parameter set that produced it.

**Status layers (kept separate for NL12).** The implementation logs three layers, each produced strictly after the previous one:

| Layer | Produced by | Values |
|---|---|---|
| Decision | `src/strategy/engine.ts` (pure, candles only) | `warmup`, `no_signal`, `outside_window`, `signal`, `invalid_risk_geometry` (V4), `risk_exceeds_max` (V5) |
| Alert | send-time check (§8 V1–V3) + `src/alerts/policy.ts` (V6) | `entry_not_below_market`, `no_data`, `duplicate`, `cooldown`, `capped`, `emailed` (plus live-only `stale_signal`, `no_quote`) |
| Execution (backtest only) | `src/backtest/execution.ts` | `invalid_at_placement`, `expired`, `filled`, `no_data` |

The combined `status` in the example above is the most advanced layer reached.

---

## 14. Decision log

| # | Decision | Outcome |
|---|---|---|
| D1 | RSI oversold | PDF baseline **30** kept as the reference; V1 default **35** as an explicit experimental variant; backtest both. |
| D2 | Lot sizing | PDF formula with a reference stop (sizing only, never placed). `pipValuePerLot` from config. |
| D3 | Entry | `close − entryOffsetPips` (configurable) plus live Buy Limit validation against Ask (§8). |
| D4 | Cooldown | 3 candles per timeframe, configurable; it is a safeguard, not a claim of correctness. |
| D5 | Support | 50 EMA only in V1. |
| D6 | Account | USD standard, as a config assumption (`account.*`), not architecture. |
| D7 | Evidence hierarchy | Buy Limit = primary evidence; PDF market entry = secondary diagnostic only (2026-09-25). |
| D8 | Live timeframe | Not locked. Chosen by the owner after comparing Buy Limit frequency and outcomes on 15m/30m/1H (2026-09-25). One alert every 3–4 weeks (1H on 2026 data) is considered too sparse to decide on alone. |
| D9 | Exactly 3 alerts per trading day | Built as the V1.1 daily selector (`docs/v1/selection-v1_1.md`), 2026-09-25. Holdout 2022–2026: gate PASS (not clearly worse than V1) but −0.18R per filled trade; V1 (`signals`) remains the production default. |
| PDF review | Corrections (2026-09-25) | P4 market-baseline fill at Ask; P5 commission in sizing (0 for Standard USD only); P6 PDF market entry as a backtest-only baseline; P7 recommended stop shown in the email. See `docs/claude_thinking/pdf-review.md`. The original PDF is unchanged. |
