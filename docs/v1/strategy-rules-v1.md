# V1 Strategy Rules: Mechanical Specification

**Status:** DRAFT for sign-off. This is Phase 1 of the build order in `docs/foundation/context-V1.md`.
**Source:** `docs/foundation/EUR_USD Entry Strategy Guide.pdf` (Ahmad's Confluence Framework).
**Scope:** EUR/USD, BUY only, 15m / 30m / 1H.

This document turns the four PDF conditions, the entry price and the lot size into exact, testable rules. Every number here is a named parameter in config, so the backtest (Phase 6) can compare variants without code changes. Items marked **DECISION** need the owner's sign-off.

---

## 0. Conventions

| Item | Rule |
|---|---|
| Pip | `PIP = 0.0001`. Prices are 5-digit, e.g. `1.13691`. |
| Arithmetic | Price comparisons and pip math use **integer points** (1 point = 0.00001 = 0.1 pip) to avoid floating-point error. For example, `1.13710 − 1.13690` must equal exactly 20 points. |
| Candle series | OHLC candles with an **open time**, in UTC internally. |
| Signal candle | `i` = the **most recently closed** candle. A forming candle is never evaluated. |
| Prices | Bid-based candles, which match what Exness MT5 charts show. If the data source only provides mid prices, record that; the difference is under 1 pip. |
| Evaluation moment | Once per timeframe, right after candle `i` closes. |
| Determinism | The same candle series and config always produce the same result. There is no randomness and no wall-clock dependence except the trading-window check, which uses the candle close time. |

### Indicators

| Indicator | Definition |
|---|---|
| `EMA(n)` | `α = 2 / (n + 1)`, seeded with the SMA of the first `n` closes, then `EMA[k] = α·close[k] + (1 − α)·EMA[k−1]`. |
| `RSI(14)` | Wilder's RSI, the same method as MT5 and TradingView. The first average gain and loss is the SMA of the first 14 changes; after that, `avg = (prev·13 + current) / 14`. `RSI = 100 − 100 / (1 + avgGain/avgLoss)`. If `avgLoss = 0`, RSI is 100. |
| Warm-up | A candle is evaluated only once at least `WARMUP_CANDLES = 600` candles precede it (3 × EMA200). This lets EMA200 converge to within a fraction of a pip of the value MT5 shows. |

### Candle anatomy (for candle `k`)

```
range      = high − low
body       = |close − open|
upperWick  = high − max(open, close)
lowerWick  = min(open, close) − low
bullish    = close > open
bearish    = close < open
```

---

## Rule 1: Bullish trend

```
TREND_OK =
      EMA50[i]  > EMA200[i]
  AND close[i]  > EMA50[i]
  AND close[i]  > EMA200[i]
```

- "Current price" means the **close of the signal candle**.
- This is a literal translation of the PDF; nothing is added.

---

## Rule 2: Pullback to the 50 EMA

The PDF says to wait for the price to drop and **touch** the 50 EMA after moving higher. There are two parts.

**2a. Touch.** Within the last `PULLBACK_LOOKBACK = 3` candles (`i−2 … i`), at least one candle's **low** reached the 50 EMA zone:

```
touch(k) = low[k] <= EMA50[k] + TOUCH_TOL_PIPS · PIP
TOUCH_OK = any(touch(k) for k in [i − PULLBACK_LOOKBACK + 1 … i])
```

**2b. A prior move up.** Before the pullback, price had actually moved away from the EMA. Without this, price drifting sideways along the EMA would count as a pullback.

```
SWING_OK = max(high[j] for j in [i − SWING_LOOKBACK … i − 1]) − EMA50[i]
           >= MIN_SWING_PIPS · PIP
```

`PULLBACK_OK = TOUCH_OK AND SWING_OK`

**Why the wick (low) and not the close:** the PDF's entry pattern is a *rejection* of the level. The wick tests the EMA, and Rule 1 then requires the close to be back above it. Requiring the *close* near the EMA would reject the most typical pin bars.

**Support levels:** V1 uses **the 50 EMA only**. Detecting horizontal support automatically is a separate problem (swing-point clustering, etc.) and belongs in V2. **DECISION D5** below.

| Parameter | 15m | 30m | 1H |
|---|---|---|---|
| `TOUCH_TOL_PIPS` | 2 | 3 | 5 |
| `MIN_SWING_PIPS` | 8 | 10 | 15 |
| `PULLBACK_LOOKBACK` | 3 | 3 | 3 |
| `SWING_LOOKBACK` | 20 | 20 | 20 |

Check against the PDF example (1H): the EMA50 is 1.0850 and price "falls to 1.0855", which is 5 pips above the EMA, so ✓ with a 5-pip tolerance. A zero tolerance would **reject the PDF's own example**. The prior high of 1.0900 is 50 pips above the EMA, well over 15 ✓.

---

## Rule 3: RSI(14) momentum confirmation

The PDF says: "RSI recovering from oversold (crossing above 30) **or** sitting above 50." There are two branches, and both also require RSI to be rising on the signal candle, which is the literal meaning of "recovering".

```
RISING       = RSI[i] > RSI[i−1]

RECOVERY_OK  = min(RSI[k] for k in [i − RSI_LOOKBACK … i]) <= RSI_OVERSOLD
               AND RSI[i] > RSI_OVERSOLD
               AND RISING

ABOVE_MID_OK = RSI[i] > RSI_MID AND RISING

RSI_OK = RECOVERY_OK OR ABOVE_MID_OK
```

| Parameter | Default |
|---|---|
| `RSI_PERIOD` | 14 |
| `RSI_OVERSOLD` | **35**, see DECISION D1 |
| `RSI_MID` | 50 |
| `RSI_LOOKBACK` | 5 candles |
| `RSI_MODE` | `both` (default) \| `recovery_only` \| `above_mid_only`, for backtest comparison |

**The PDF's own example fails its literal wording.** In the example, RSI "dipped to 32, hooks upwards to 40". It never went below 30, so it never "crossed above 30", and 40 is not above 50. With `RSI_OVERSOLD = 30` the PDF example is **rejected**. With 35 it passes. Hence D1.

**Warning on the `above_mid` branch:** in an uptrend, RSI sits above 50 most of the time, so this branch alone makes Rule 3 weak. The `RISING` requirement tightens it slightly. The backtest will show how many signals each branch contributes, and the log records which branch fired.

---

## Rule 4: Bullish price-action confirmation

This rule is evaluated on the signal candle `i` (and `i−1` for engulfing). If both patterns match, the log records both and the signal fires once.

### 4a. Bullish engulfing

```
ENGULF =
      bearish[i−1]
  AND bullish[i]
  AND open[i]  <= close[i−1]
  AND close[i] >= open[i−1]
  AND body[i]  >  body[i−1]
  AND min(low[i−1], low[i]) <= EMA50[i] + TOUCH_TOL_PIPS · PIP   // at the value area
```

- Only bodies are compared; **wicks are ignored**, which is the common definition.
- `<=` / `>=` are used because in FX the next candle often opens exactly at the previous close.

### 4b. Bullish pin bar / hammer

```
PIN =
      range[i] >= MIN_RANGE_PIPS · PIP
  AND lowerWick[i] >= PIN_WICK_BODY_RATIO  · body[i]
  AND lowerWick[i] >= PIN_WICK_RANGE_RATIO · range[i]
  AND upperWick[i] <= PIN_MAX_UPPER_RATIO  · range[i]
  AND low[i] <= EMA50[i] + TOUCH_TOL_PIPS · PIP                  // wick tested the value area
```

| Parameter | Default | Meaning |
|---|---|---|
| `PIN_WICK_BODY_RATIO` | 2.0 | Lower wick at least 2× the body |
| `PIN_WICK_RANGE_RATIO` | 0.6 | Lower wick at least 60% of the candle |
| `PIN_MAX_UPPER_RATIO` | 0.2 | Upper wick at most 20% of the candle, so the close is in the upper part |
| `MIN_RANGE_PIPS` | 15m: 3, 30m: 4, 1H: 5 | Ignore tiny noise candles |
| `PIN_REQUIRE_BULLISH_BODY` | `false` | A hammer may have either body colour. Set to `true` to accept only green pin bars. |

`CANDLE_OK = ENGULF OR PIN`

---

## BUY signal

```
BUY_SIGNAL = TREND_OK AND PULLBACK_OK AND RSI_OK AND CANDLE_OK
             AND in_trading_window(close_time[i])
```

- **Trading window:** the signal candle's **close time** in `Asia/Dubai` is within `08:00 – 23:00` inclusive.
- **All four rules are always evaluated and logged**, even after one fails, so every rejection shows exactly which rules failed.

---

## Entry price (BUY LIMIT)

A Buy Limit must sit **below** the current price. The signal is produced at the close of candle `i`.

```
ENTRY = round5( close[i] − ENTRY_OFFSET_PIPS · PIP )
```

| Parameter | 15m | 30m | 1H |
|---|---|---|---|
| `ENTRY_OFFSET_PIPS` | 1.0 | 1.5 | 2.0 |
| `ENTRY_VALID_CANDLES` | 1 | 1 | 1 |

- This stays close to the PDF, which uses a market buy at the next open (≈ `close[i]`) while giving a small limit discount.
- **Expiry:** the email states "Valid until <close of the next candle, Dubai time>". If the order isn't filled by then, the trader cancels it. V1 doesn't track fills; the expiry is advisory.
- If the market has already dropped below `ENTRY` when the trader reads the email, the limit price would be above market. Exness would then treat it as invalid for a Buy Limit, so the trader should skip the signal. The email says this.
- An alternative for the backtest is `ENTRY_MODE = candle_mid`, which places the limit at 50% of the signal candle's range. It gets a better price but fills less often. **DECISION D3.**

---

## Lot size: recommended **Option A (PDF formula, reference SL)**

The PDF formula:

```
Lot Size = (Account Balance × Risk %) / (SL Pips × Pip Value)
```

V1 places no SL, but the formula needs an SL distance. So the system computes a **reference SL** from the PDF's own rule ("safely below the pin bar's wick and the 50 EMA"). It uses that only to size the lot and shows it in the email as information. The system never places or manages it.

```
REF_SL  = round5( min(low of pattern candles, EMA50[i]) − SL_BUFFER_PIPS · PIP )
SL_PIPS = max( (ENTRY − REF_SL) / PIP , MIN_SL_PIPS )
LOTS    = floor_to_0.01( (BALANCE × RISK_PCT) / (SL_PIPS × PIP_VALUE_PER_LOT) )
LOTS    = clamp(LOTS, 0.01, MAX_LOTS)
```

| Parameter | Default | Note |
|---|---|---|
| `BALANCE` | config (USD) | Set by the trader. V1 has no Exness API, so this is updated manually. |
| `RISK_PCT` | 1% | The PDF allows 1–2%. The config rejects values above 2%. |
| `PIP_VALUE_PER_LOT` | $10 | EUR/USD, USD account, standard lot of 100,000. **Must change for a cent account.** |
| `SL_BUFFER_PIPS` | 15m: 2, 30m: 2, 1H: 3 | |
| `MIN_SL_PIPS` | 5 | Prevents oversized lots when the reference SL is very close. |
| `MAX_LOTS` | config | Hard safety cap. |

- If the computed lot is below 0.01, the email shows 0.01 with the warning "exceeds target risk".
- Why A over B: it keeps Ahmad's sizing method, which is what "lots according to the PDF" asks for. It also gives the backtest a natural adverse-move yardstick. **The honest caveat:** the 1% risk only holds if the trader actually sets that SL. The email states this.
- Option B (fixed `FIXED_LOTS`, e.g. 0.10) stays available as `LOT_MODE = fixed`. **DECISION D2.**

Check against the PDF example: $1,000 × 1% = $10. Entry 1.0860 with SL 1.0840 gives 20 pips, and $10 / (20 × $10) = **0.05 lots**. Our reference SL depends on the pin bar's actual low, which the PDF doesn't give, so the lot size may differ slightly.

---

## Daily cap, de-duplication, cooldown

| Rule | Definition |
|---|---|
| Day | The calendar date in `Asia/Dubai`. |
| Cap | `MAX_ALERTS_PER_DAY = 3` across the whole system. |
| Over the cap | **Chronological first three**, by signal candle close time. Later signals are logged as `capped` and no email is sent. |
| Signal ID | `EURUSD|<timeframe>|<signal candle open time UTC>`. An ID is emailed at most once, even if the job re-runs or restarts. |
| Cooldown | After an alert, no new alert on the same timeframe for `COOLDOWN_CANDLES = 3` candles. This stops one pullback from using up all 3 daily alerts with back-to-back candles. The skipped candle is logged as `cooldown`. **DECISION D4.** |
| Live timeframe | Live mode runs **one** timeframe, chosen from the backtest. The backtest runs 15m, 30m and 1H independently. |

---

## Per-candle decision record (logged for every evaluated candle)

```jsonc
{
  "id": "EURUSD|1H|2026-09-25T10:00:00Z",
  "timeframe": "1H",
  "candleCloseDubai": "2026-09-25T15:00:00+04:00",
  "ohlc": [1.13690, 1.13720, 1.13585, 1.13710],
  "ema50": 1.13620, "ema200": 1.12980, "rsi14": 44.2, "rsiPrev": 38.9,
  "trend": true,
  "pullback": { "touch": true, "swing": true },
  "rsi": { "ok": true, "branch": "recovery" },
  "candle": { "ok": true, "patterns": ["pin_bar"] },
  "inWindow": true,
  "buySignal": true,
  "entry": 1.13690, "refSl": 1.13555, "slPips": 13.5, "lots": 0.07,
  "status": "emailed"   // emailed | capped | cooldown | duplicate | no_signal | outside_window
}
```

---

## Decisions for the owner

| # | Decision | Recommended default |
|---|---|---|
| **D1** | RSI oversold threshold: **30** (PDF text) or **35** (makes the PDF's own example pass) | **35**, with 30 backtested alongside |
| **D2** | Lot method: **A** (PDF formula plus reference SL shown as info) or **B** (fixed lots) | **A** |
| **D3** | Entry: **close − offset** or **candle midpoint** | **close − offset** |
| **D4** | Cooldown of 3 candles after an alert | **On** |
| **D5** | Support = 50 EMA only in V1 (horizontal support deferred to V2) | **Yes** |
| **D6** | Account currency/type for pip value (USD Standard vs cent account) | USD Standard, $10/pip/lot |

## Backtest variants (Phase 6)

Run each timeframe (15m, 30m, 1H) with:
- `RSI_OVERSOLD` 30 vs 35, and `RSI_MODE` both / recovery_only / above_mid_only
- `TOUCH_TOL_PIPS` at 0.5×, 1× and 2× the default
- `ENTRY_MODE` close_offset vs candle_mid

Report signal count, signals per day, whether the limit would fill, price move after N candles, MFE / MAE, and whether price reaches +X pips before −Y pips. No "win rate" is reported unless an exit is defined.
