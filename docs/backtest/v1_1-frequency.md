# V1.1 daily selector — frequency check

> **V1.1 daily selector (D9): exactly 3 alerts per trading day, one per slot.** Tier A = all four of Ahmad's rules (a real V1 signal); B/C/D meet 3/2/≤1 of them and are **not** PDF setups. Counter-trend alerts fail Rule 1 ("never trade against the trend"). Buy Limit only (D7).

> **Frequency only.** This report deliberately contains **no outcome metrics**, so it does not spend any holdout data. Outcomes are evaluated only by the pre-declared design grid and the one-time holdout run.

Data: `Exness_EURUSD_2015.zip`, `Exness_EURUSD_2016_01.zip`, `Exness_EURUSD_2016_02.zip`, `Exness_EURUSD_2016_03.zip`, `Exness_EURUSD_2016_04.zip`, `Exness_EURUSD_2016_05.zip`, `Exness_EURUSD_2016_06.zip`, `Exness_EURUSD_2016_07.zip`, `Exness_EURUSD_2016_08.zip`, `Exness_EURUSD_2016_09.zip`, `Exness_EURUSD_2016_10.zip`, `Exness_EURUSD_2016_11.zip`, `Exness_EURUSD_2016_12.zip`, `Exness_EURUSD_2017.zip`, `Exness_EURUSD_2018_01.zip`, `Exness_EURUSD_2018_02.zip`, `Exness_EURUSD_2018_03.zip`, `Exness_EURUSD_2018_04.zip`, `Exness_EURUSD_2018_05.zip`, `Exness_EURUSD_2018_06.zip`, `Exness_EURUSD_2018_07.zip`, `Exness_EURUSD_2018_08.zip`, `Exness_EURUSD_2018_09.zip`, `Exness_EURUSD_2018_10.zip`, `Exness_EURUSD_2018_11.zip`, `Exness_EURUSD_2018_12.zip`, `Exness_EURUSD_2019.zip`, `Exness_EURUSD_2020.zip`, `Exness_EURUSD_2021.zip`, `Exness_EURUSD_2022_01.zip`, `Exness_EURUSD_2022_02.zip`, `Exness_EURUSD_2022_03.zip`, `Exness_EURUSD_2022_04.zip`, `Exness_EURUSD_2022_05.zip`, `Exness_EURUSD_2022_06.zip`, `Exness_EURUSD_2022_07.zip`, `Exness_EURUSD_2022_08.zip`, `Exness_EURUSD_2022_09.zip`, `Exness_EURUSD_2022_10.zip`, `Exness_EURUSD_2022_11.zip`, `Exness_EURUSD_2022_12.zip`, `Exness_EURUSD_2023.zip`, `Exness_EURUSD_2024.zip`, `Exness_EURUSD_2025_01.zip`, `Exness_EURUSD_2025_02.zip`, `Exness_EURUSD_2025_03.zip`, `Exness_EURUSD_2025_04.zip`, `Exness_EURUSD_2025_05.zip`, `Exness_EURUSD_2025_06.zip`, `Exness_EURUSD_2025_07.zip`, `Exness_EURUSD_2025_08.zip`, `Exness_EURUSD_2025_09.zip`, `Exness_EURUSD_2025_10.zip`, `Exness_EURUSD_2025_11.zip`, `Exness_EURUSD_2025_12.zip`, `Exness_EURUSD_2026_01.zip`, `Exness_EURUSD_2026_02.zip`, `Exness_EURUSD_2026_03.zip`, `Exness_EURUSD_2026_04.zip`, `Exness_EURUSD_2026_05.zip`, `Exness_EURUSD_2026_06.zip`, `Exness_EURUSD_2026_07.zip`, `Exness_EURUSD_2026_08.zip`, `Exness_EURUSD_2026_09.zip`. 169,304,390 ticks, 2015-08-10 → 2026-09-24; cut-off (exclusive) 2026-09-25T00:00:00Z. 5 file(s) reordered by day blocks.

| Configuration | Trading days | Alerts / day | Missed slots | Immediate / fallback | Tier A / B / C / D | Counter-trend | Timeframes |
|---|---|---|---|---|---|---|---|
| w08_23-imm4-all4 | 2865 | 3.00 | 5 | 2978 / 5612 | 3088 / 638 / 2269 / 2595 | 4005 (47%) | M5 2619, M15 1466, M30 1289, H1 3216 |
| w08_23-imm4-no5 | 2857 | 3.00 | 4 | 1460 / 7107 | 1571 / 723 / 2675 / 3598 | 4901 (57%) | M15 2076, M30 1875, H1 4616 |
| w08_23-imm3-all4 | 2865 | 3.00 | 4 | 7065 / 1526 | 811 / 6332 / 505 / 943 | 4054 (47%) | M5 4140, M15 1552, M30 1120, H1 1779 |
| w08_23-imm3-no5 | 2857 | 3.00 | 3 | 5043 / 3525 | 601 / 4605 / 1167 / 2195 | 4702 (55%) | M15 3288, M30 1945, H1 3335 |
| w04_23-imm4-all4 | 2873 | 2.99 | 25 | 3294 / 5300 | 3339 / 517 / 1985 / 2753 | 3871 (45%) | M5 2844, M15 1961, M30 1481, H1 2308 |
| w04_23-imm4-no5 | 2865 | 2.99 | 23 | 1681 / 6891 | 1735 / 524 / 2459 / 3854 | 4861 (57%) | M15 2989, M30 2280, H1 3303 |
| w04_23-imm3-all4 | 2873 | 2.99 | 24 | 7232 / 1363 | 820 / 6439 / 402 / 934 | 3945 (46%) | M5 4346, M15 1814, M30 1200, H1 1235 |
| w04_23-imm3-no5 | 2865 | 2.99 | 22 | 5284 / 3289 | 617 / 4743 / 1033 / 2180 | 4601 (54%) | M15 4047, M30 2140, H1 2386 |
| w00_24-imm4-all4 | 2880 | 2.98 | 67 | 3572 / 5001 | 3629 / 414 / 1816 / 2714 | 3692 (43%) | M5 2893, M15 1403, M30 1262, H1 3015 |
| w00_24-imm4-no5 | 2872 | 2.97 | 97 | 1830 / 6689 | 1893 / 467 / 2410 / 3749 | 4651 (55%) | M15 2149, M30 1934, H1 4436 |
| w00_24-imm3-all4 | 2881 | 2.98 | 43 | 7424 / 1174 | 792 / 6664 / 294 / 848 | 3919 (46%) | M5 4402, M15 1490, M30 1104, H1 1602 |
| w00_24-imm3-no5 | 2873 | 2.98 | 57 | 5579 / 2981 | 632 / 5019 / 885 / 2024 | 4546 (53%) | M15 3545, M30 1943, H1 3072 |

