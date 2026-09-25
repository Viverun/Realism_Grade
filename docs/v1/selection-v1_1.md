# V1.1 daily selector: exactly 3 alerts per trading day

**Status:** BUILT, not yet validated. Production default stays `selection.mode: signals` (V1) until the holdout gate in §5 passes and the owner approves paper trading.
**Owner decision D9 (2026-09-25):** "exactly 3 alerts every day". Allowed levers:
- run 15m + 30m + 1H together;
- add 5m;
- relaxed, scored confluence;
- a wider window.

Quality bar: "must not be worse than today", checked on a holdout.

This deliberately changes context-V1 §10, which said "a genuine strategy should be allowed to produce zero signals". V1 behaviour remains available and unchanged.

## 1. Why a slot design

Two constraints drive it:
- **No look-ahead.** "The 3 best setups of the day" can't be known until the day ends. A system that must send exactly 3 in real time has to decide as the day goes.
- **Fixed timing.** Each trading day is split into **3 slots**, each producing exactly one alert.

| Rule | Definition | Tag |
|---|---|---|
| Slots | Default 08:00–13:00, 13:00–18:00, 18:00–23:00 Dubai (`selection.slots`). Slot times must be multiples of the smallest selected timeframe. | [POLICY, D9] |
| Trading days | Local weekdays Mon–Fri (`selection.weekdays`). No weekend alerts. | [POLICY] |
| Immediate send | During a slot, the first candidate scoring ≥ `immediateMinScore` (default 4, a full V1 signal) is sent at its candle close, provided it passes the send-time Ask check (§8 V3). | [ENG] |
| Slot-end fallback | If nothing was sent, at slot end take the **latest candle that closed inside the slot on each selected timeframe**. Send the best: highest score, then higher timeframe, then later close. Its entry is from that candle; it is sent at the slot end after the Ask check. | [ENG] |
| Missed | If no candidate passes, or there is no data, the slot is logged `missed`. "Exactly 3" means 3 unless data or price make an alert impossible, and misses are always reported. | [POLICY] |
| Dedup | The same candle is never sent twice. | [POLICY] |
| Cooldown / daily cap | Replaced by one alert per slot. | [POLICY] |

Causality is tested:
- a fallback never uses a candle closing after the slot end;
- later candles can't change an earlier slot;
- stream processing equals batch processing;
- see `test/alerts/daily-selector.test.ts`.

## 2. Scoring and tiers [ENG]

The score is the **number of Ahmad's four V1 rules passed**: trend, pullback, RSI, candle. It uses the unchanged rule functions, and no new strategy rules are introduced.

| Tier | Score | Meaning |
|---|---|---|
| **A** | 4/4 | A real V1 signal (Ahmad's full confluence) |
| **B** | 3/4 | One rule missing |
| **C** | 2/4 | Two rules missing |
| **D** | 0–1/4 | Mostly just "the best available candle now" |

- **Tiers B–D are not PDF setups.** Every alert carries its tier, score and failed rules. **Counter-trend** alerts (Rule 1 failed) are flagged, because the PDF says never to trade against the trend.
- **The trade plan is the V1 one for every tier:** Buy Limit at close − offset, reference stop below the candle low / EMA50, lots from the PDF formula (`src/strategy/score.ts` → `candidatePlan`).
- Candidates failing V4 (entry ≤ stop) or V5 (planned risk above 2%) are never sent.

## 3. Timeframes and windows [ENG]

- Candidate timeframes: `selection.timeframes`. **M5** is new: ticks now aggregate to M5 and M15/M30/H1 are resampled from it. M5 parameters in `config/v1.yaml` are scaled from M15.
- Window variants (slot sets) in the design grid:
  - `w08_23`: 08:00–13:00 / 13:00–18:00 / 18:00–23:00;
  - `w04_23`: 04:00–10:15 / 10:15–16:30 / 16:30–23:00;
  - `w00_24`: 00:00–08:00 / 08:00–16:00 / 16:00–24:00.

## 4. Risk note for the owner

At 1% planned risk per alert, **3 alerts/day is up to 3% planned risk per day** if all fill and stop out. No daily risk cap exists yet; one can be added (`account.maxDailyRiskPercent`) if wanted.

## 5. Validation protocol (the quality gate)

1. **Frequency check (safe on any period):** `npm run select:frequency` reports alerts/day, misses and tier/timeframe mix, with **no outcome metrics**.
2. **Design grid (design period only):** the 12 pre-declared configurations (3 windows × `immediateMinScore` 4|3 × timeframe sets {M5,M15,M30,H1} | {M15,M30,H1}) are run with `--mode grid`, with `--end` = holdout start.
   - **Pre-declared choice:** the configuration with the highest expectancy per filled trade.
3. **Freeze:** the chosen configuration's name and `configHash` are recorded in §6 of this document **before** the holdout run.
4. **Holdout (once):** `--mode holdout --variant <frozen> --holdout-start <date>`.
   - **Gate:** compute the percentile-bootstrap 95% interval (10,000 resamples, fixed seed) of the difference in expectancy per filled trade on the holdout: V1.1 minus V1 on M30.
   - **FAIL** ("clearly worse") only if the whole interval is below 0; otherwise PASS.
   - PASS means "not clearly worse", **not** profitable.
5. **Owner decision:** paper trading, then live.

**Choice of periods.**
- **Planned:** design 2015–2021, holdout 2022-01-01 → 2026-09-24, once the owner's 2015–2023 data is added.
- **Fallback if that data isn't added:** design 2024–2025, holdout 2026.
- **Caveat:** 2024–2026 has already been used for V1 research (not V1.1), including V1 on 5m for 2026 (−0.24R, n=73; `docs/backtest/2026-preliminary.md`). That is a mild contamination of the 2022–2026 holdout, recorded here. The design choice is mechanical (§5 step 2), so this knowledge can't steer it.

## 6. Frozen configuration

*Not yet frozen.* Filled in after the design grid, before the holdout run.
