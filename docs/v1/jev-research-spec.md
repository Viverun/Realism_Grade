# Jev research: role and validation test (D11)

**Status: APPROVED by the owner on 2026-09-25 (D11).** Pricing is not a constraint (owner). Nothing here changes V1: Jev stays **outside the V1 decision path** (context-V1 §28, CLAUDE.md) until this test passes **and** the owner approves the next phase.

**References** (patterns only; no code, thresholds or strategies are copied), cited from the owner's review of the gist `drillan/6916b16e…`:
- `buberlo/jev-trader`: feature engine → atomic judgments → deterministic policy → calibration log;
- `Gamma-Software/jev-signals-lab`: one snapshot → a battery of independent questions → a rule engine in code.

The gist found no forex projects, so there is no reference implementation to adopt.

**Why this matters now:**
- **No edge in the rules alone:** Ahmad's full setup alone (D10) is −0.17R per filled trade over 2015–2026 (`docs/backtest/full-setup-only.md`).
- **What Jev must do:** it can only help if it **discriminates** between setups that go on to work and setups that fail. This test measures exactly that before Jev influences anything.

## 1. Jev's exact role

| Jev **does** | Jev **never does** |
|---|---|
| Answer a fixed battery of atomic, typed questions about a compact state snapshot that **our code** computes | Decide BUY / NO BUY in V1 |
| Return typed outputs (probability, score or choice) that are logged with the decision | Set entry, stop, lots, risk or timing |
| (Phase B only, if validated) feed a **deterministic policy in code**, e.g. a veto threshold fixed in advance | Place, modify or cancel orders |
| | See raw dates, absolute prices, account data or anything after the snapshot |
| | Appear in the trader's email before validation. An unvalidated "confidence 0.87" would mislead. |

The flow is **"Jev judges, code executes"**:

```
ticks → candles → V1 engine (EMA50/200, RSI, pullback, candle)          code
      → compact state snapshot (§2)                                     code
      → Jev: question battery (§3), typed answers                       Jev
      → log (snapshot, answers, V1 decision, model/prompt versions)     code
      → [Phase B only] deterministic policy on the answers              code
      → outcome labelled later from ticks (§4)                          code
```

## 2. Compact state snapshot (computed by code, versioned)

The snapshot uses relative, unit-free features only. There are **no timestamps, dates or absolute price levels**. That limits anchoring and memorisation, and makes every sample comparable.
- **Timeframe** and **session bucket** (Asia / London / London–NY overlap / NY), derived from time but not revealing the date.
- **Trend:**
  - EMA50−EMA200 and close−EMA50, in pips and in units of recent range;
  - EMA50 slope over 5 and 20 candles.
- **Pullback:**
  - distance from the low to EMA50, in pips and as a fraction of the touch tolerance;
  - size of the prior swing, and how many candles ago it happened.
- **Momentum:** RSI now, RSI 1 and 5 candles ago, and the minimum RSI over the lookback.
- **Candle:** body/range, lower-wick/range and upper-wick/range for candles i and i−1, plus the pattern flags.
- **Volatility and cost:**
  - the mean range of the last 20 candles, in pips;
  - the current spread, in pips.
- **V1 context:** which of the 4 rules pass (score and tier). The planned entry and stop are given as distances in pips.

The snapshot schema gets a `snapshotVersion`. Any change to it restarts the test clock (§5).

## 3. Question battery (fixed wording, versioned by `promptHash`)

Every question is independent and asked separately, so one answer can't anchor another.

| ID | Question (paraphrased; exact text frozen at launch) | Jev primitive |
|---|---|---|
| Q1 | Will price reach **entry + 2R before entry − 1R**, where R = the planned stop distance, for a long entered at the planned Buy Limit? | **Noul** (P(yes)) — **primary** |
| Q2 | Will the uptrend continue over the next 8 candles? | Noul |
| Q3 | Is the pullback exhausted (sellers losing control)? | Noul |
| Q4 | Market regime | Choice: trending / ranging / volatile-choppy |
| Q5 | Is momentum confirming or diverging? | Choice: confirming / neutral / diverging |

- **Only Q1 is primary evidence;** Q2–Q5 are exploratory.
- **API (from the owner-supplied TypeSafe docs):** `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`, text-only `state` plus a list of typed questions (Choice / Score / Noul). Questions within one request are answered independently, so the whole battery is **one request per snapshot** (~800 requests/month at 40 samples/day).
- **Model choice:** the test uses `jev-latest`. The API also lists `jev-preview` (same release date, described as "should be better in most ways"); it is **not** used, because a preview can change without notice, which would restart the clock.
- **Pinned model:** `jev-latest` is a moving alias. The log records the model identifier the API reports; if it changes mid-test, the clock restarts (§5).
- **Confidence:** every answer's reported `confidence` is logged but is **not** used for gating in phase A; it is evaluated as an exploratory calibration check.
- **Settings:** as deterministic as the API allows.
- **Logged every time:** model identifier, `promptHash`, `snapshotVersion` and the raw responses.
- **No tools:** Jev gets no browsing, search or other tools, so it can't look up what happened.

## 4. The validation test (pre-registered)

**Population:** every in-window candle on **M30 and H1** with a valid V1 trade plan (tiers A–D), plus every **tier-A** candle on M5/M15.
- About 30–50 samples per trading day. This gives enough samples in weeks rather than years; tier A alone would give about 1 per day, far too few.
- Configurable sampling is available if cost requires it.

**Data:** only candles **after Jev's knowledge cutoff**.
- **The primary window starts on 2026-09-28 00:00 UTC** (`src/jev/protocol.ts`): the first full trading week after approval, and after `jev-latest`'s release date (**2026-09-10**, confirmed by `npm run jev:probe` against the live API on 2026-09-25), so no candle in it can be in Jev's training data. `npm run jev:probe` re-checks the release date; if a newer model is released, the window must move after it (clock restart).
- **Earlier candles are excluded:** any candle from before that date may be in Jev's training data and **can never count as evidence**. That rules out every backtest on 2015–2026.
- **Scoring can be done later in batches** from monthly Exness tick downloads. Candles after the cutoff are unknown to Jev whenever they're scored. No live feed is needed for the research phase.

**Label, computed by code from ticks, independent of Jev:** the V1 Buy Limit execution model (spec §11).
- The outcome is `target` (+2R first), `stop` (−1R first) or `open`.
- Unfilled plans are excluded from the primary metric and reported separately.
- A secondary label, a market entry at close, is reported as a diagnostic.

**Baselines Jev must beat:**
1. **Base rate:** a constant equal to the observed target share.
2. **Simple statistical model:** logistic regression on the same snapshot features, fitted on **2015–2021 only** and frozen at launch. If Jev can't beat a 20-line model, it adds nothing.

**Duration and sample size:** at least **3 calendar months and at least 1,500 labelled (filled, resolved) samples**, whichever comes later.
- Interim reports cover operational health only: latency, errors and cost.
- **No metric-based early stopping or peeking-driven changes.**

**Primary metrics (Q1), with intervals from a day-block bootstrap** (samples on the same day are correlated):
| Metric | What it measures |
|---|---|
| **AUC** of Q1 vs target/stop | Discrimination: do higher probabilities go with more wins? |
| **Brier skill score** vs the base rate, and vs logistic regression | Accuracy of probabilities beyond the baselines |
| **ECE + reliability diagram** | Calibration: does "0.4" mean about 40%? |
| **Top-tercile vs bottom-tercile expectancy (R)** | Economic relevance |

**PASS (all required):**
1. AUC 95% lower bound > **0.52**, and Jev's AUC > the logistic baseline's, with the bootstrap interval of the difference entirely above 0.
2. Brier skill score vs the base rate: lower bound > 0.
3. Top-tercile minus bottom-tercile expectancy: interval entirely above 0.
4. Same sign of (3) in at least 2 of the 3 months, so it's not driven by a single month.

**FAIL:** Jev remains a logged, unused column, or is dropped. **No threshold tuning on the test data.**

## 5. After the test

| Phase | What happens | Evidence needed |
|---|---|---|
| **A — Shadow (this spec)** | Jev scores and everything is logged. No influence, and nothing shown to the trader. | — |
| **B — Policy design** | If A passes, design **one** deterministic policy, e.g. "send a tier-A alert only if Q1 ≥ x". x is chosen on phase-A data and frozen in git. | Phase A PASS |
| **C — Policy test** | Run the frozen policy on **new** forward data (≥ 3 months), vs V1 without Jev: Buy Limit expectancy and frequency, as D7/D8 require. | New data only |
| **D — Owner decision** | Show Jev's output in emails, and/or use the veto live. | Phase C result |

Any change to the model version, `promptHash`, `snapshotVersion`, question set or population **restarts the clock**.

## 6. What we are deliberately not taking from the referenced projects
- High-frequency Jev calls and order-book logic;
- Avellaneda–Stoikov pricing and Kelly sizing;
- autonomous execution;
- multi-asset or platform infrastructure (e.g. QuantDinger as a whole).

These solve different problems.

## 7. Owner inputs (status)
1. ~~Approve D11~~ **Approved 2026-09-25.**
2. **Jev access:** the API key as the environment secret `JEV_API_KEY` (never in chat or git), pricing and rate limits, and the documented **training/knowledge cutoff**. The start date must be after it. The API shape is now known (§3); the cutoff and pricing are still missing.
3. ~~A cost budget per month.~~ Owner: pricing is not a constraint. For reference, about 40–50 samples/day is about 1,000 requests/month (one request carries all 5 questions).
4. **A monthly Exness tick export** from the start date onwards, or the live data provider decision, if real-time scoring is wanted.

## 8. Implementation (done)
| File | Role |
|---|---|
| `src/jev/snapshot.ts` | Pure function from (Series, i, Decision, plan) to the §2 snapshot; `SNAPSHOT_VERSION`; feature vector for the baseline. Tested for prefix invariance (no look-ahead) and for containing no dates, times or absolute prices. |
| `src/jev/battery.ts` | The frozen Q1–Q5 wording (Noul/Choice), the state preamble, `PROMPT_HASH`. |
| `src/jev/client.ts` | `JevJudge` interface; `TypeSafeJudge` (`POST /v1/systemone`, Bearer key from `JEV_API_KEY`, retries 408/429/5xx, validates every answer); `FakeJudge` (deterministic, carries no information) for tests and dry runs. |
| `src/jev/population.ts` | The §4 population (M30/H1 all tiers, M5/M15 tier A; in window; trading days) and tick-based labels with the V1 Buy Limit model. |
| `src/jev/log.ts` | Append-only JSONL log (`docs/jev/jev-log.jsonl`, committed: git history timestamps every judgment before its outcome is known). |
| `src/jev/logistic.ts` | The logistic baseline (standardised, Newton–IRLS, L2). **Frozen 2026-09-25** in `config/jev-baseline-v1.json`: fitted on 2015–2021 by `npm run jev:fit-baseline`, 78,694 population candles → 41,111 filled and resolved (10,553 reached +2R first, 25.7%). Committed before the primary window opens. |
| `src/jev/metrics.ts` | AUC, Brier skill, ECE/reliability, tercile spread, day-block bootstrap, and the PASS/FAIL/INSUFFICIENT_DATA verdict. |
| `src/jev/protocol.ts` | All §4 constants, including the primary window start. |
| `scripts/jev.ts` | `probe`, `fit-baseline`, `score`, `evaluate`. `score` refuses any candle before the primary window unless `--fake`. |

**Pilot (2026-09-25, operational only, never evidence):** `npm run jev:score -- <zips> --start 2026-09-18T00:00:00Z --end 2026-09-25T00:00:00Z --pilot`, report [`../jev/pilot.md`](../jev/pilot.md), log `docs/jev/jev-log.pilot.jsonl`. A pilot may only cover candles ending at or before the window start (`checkScoringRange`), and its report has no outcome metrics.
- **Result:** 235/235 requests succeeded, all answered by **`jev-1.13.0`** (the concrete model behind `jev-latest` at launch; a different model in the evidence log restarts the clock). Latency median 124 ms (p95 range under 320 ms). About 1,300 input and 155 output tokens per request.
- **Q1 is not degenerate:** 0.18–0.39, sd 0.037. Answers come rounded to 0.01, so many ties. AUC uses average ranks; the tercile spread breaks ties in chronological order (deterministic).
- **Decision:** no wiring problem, so the battery, snapshot and population are **frozen as is** from the window start (2026-09-28).

**Monthly routine (batch mode, no live feed needed):**
1. Add the new month's Exness tick zip to `docs/data/`.
2. `npm run jev:score -- docs/data/Exness_EURUSD_2026_0[7-9].zip docs/data/Exness_EURUSD_2026_1*.zip --start 2026-09-28T00:00:00Z --end <first day of next month>`. Include about 3 months before the start for warm-up. Already-logged samples are skipped.
3. Commit `docs/jev/jev-log.jsonl`.
4. `npm run jev:evaluate -- <same files> --end <same>` writes `docs/jev/validation.md`. Until the minimum duration and sample size are reached, the verdict is `INSUFFICIENT_DATA` and nothing may change (no peeking).
