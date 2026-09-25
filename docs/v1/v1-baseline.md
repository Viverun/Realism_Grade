# V1-baseline (frozen 2026-09-25)

**Owner decision (2026-09-25):** the current V1 implementation is frozen as **V1-baseline**. It is the fixed benchmark for the diagnostic ablation and for the Jev forward test (D11). It is **not** modified for either. Any rule change is a new, separately named strategy, and it needs fresh forward data (the 2022–2026 holdout is spent).

| Item | Value |
|---|---|
| Rules | `docs/v1/strategy-rules-v1.md` (D1–D6), unchanged |
| Config | `config/v1.yaml`, config hash `sha256:72353efc195a4d3528eaafe4579ea1d654eb790a082d292962a9734b2b22e406` |
| Code | `src/strategy/*` as of commit `12a5e78` |
| Jev benchmark | `config/jev-baseline-v1.json`, fitted on 2015–2021 with the same config hash |
| Reference results | `docs/backtest/2015-2026.md`: Buy Limit expectancy per filled trade M15 −0.17R, M30 −0.11R, H1 −0.07R (2015-08 → 2026-09-24) |
| Live timeframe | Not selected (D8, deferred until the Jev forward test is evaluated) |
| Status | **Not for real money.** No timeframe shows positive expectancy. |

**Allowed without touching the baseline:** diagnostics that only *read* it (e.g. `docs/backtest/v1-ablation.md`), the email step with synthetic signals, and Jev shadow scoring.

**How to check the freeze:** `configHash(loadConfig('config/v1.yaml'))` must equal the hash above, and `git diff 12a5e78 -- src/strategy config/v1.yaml` must show no rule or parameter change. Comment-only edits don't change the hash.
