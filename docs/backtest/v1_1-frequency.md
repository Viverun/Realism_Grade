# V1.1 daily selector — frequency check

> **V1.1 daily selector (D9): exactly 3 alerts per trading day, one per slot.** Tier A = all four of Ahmad's rules (a real V1 signal); B/C/D meet 3/2/≤1 of them and are **not** PDF setups. Counter-trend alerts fail Rule 1 ("never trade against the trend"). Buy Limit only (D7).

> **Frequency only.** This report deliberately contains **no outcome metrics**, so it does not spend any holdout data. Outcomes are evaluated only by the pre-declared design grid and the one-time holdout run.

Data: `Exness_EURUSD_2024.zip`, `Exness_EURUSD_2025_01.zip`, `Exness_EURUSD_2025_02.zip`, `Exness_EURUSD_2025_03.zip`, `Exness_EURUSD_2025_04.zip`, `Exness_EURUSD_2025_05.zip`, `Exness_EURUSD_2025_06.zip`, `Exness_EURUSD_2025_07.zip`, `Exness_EURUSD_2025_08.zip`, `Exness_EURUSD_2025_09.zip`, `Exness_EURUSD_2025_10.zip`, `Exness_EURUSD_2025_11.zip`, `Exness_EURUSD_2025_12.zip`, `Exness_EURUSD_2026_01.zip`, `Exness_EURUSD_2026_02.zip`, `Exness_EURUSD_2026_03.zip`, `Exness_EURUSD_2026_04.zip`, `Exness_EURUSD_2026_05.zip`, `Exness_EURUSD_2026_06.zip`, `Exness_EURUSD_2026_07.zip`, `Exness_EURUSD_2026_08.zip`, `Exness_EURUSD_2026_09.zip`. 40,175,230 ticks, 2024-01-01 → 2026-09-24; cut-off (exclusive) 2026-09-25T00:00:00Z. 5 file(s) reordered by day blocks.

| Configuration | Trading days | Alerts / day | Missed slots | Immediate / fallback | Tier A / B / C / D | Counter-trend | Timeframes |
|---|---|---|---|---|---|---|---|
| w08_23-imm4-all4 | 702 | 3.00 | 1 | 669 / 1436 | 686 / 160 / 630 / 629 | 980 (47%) | M5 645, M15 355, M30 327, H1 778 |
| w08_23-imm4-no5 | 695 | 3.00 | 0 | 318 / 1767 | 335 / 176 / 678 / 896 | 1187 (57%) | M15 511, M30 472, H1 1102 |
| w08_23-imm3-all4 | 702 | 3.00 | 1 | 1725 / 380 | 169 / 1572 / 136 / 228 | 968 (46%) | M5 1032, M15 361, M30 291, H1 421 |
| w08_23-imm3-no5 | 695 | 3.00 | 0 | 1205 / 880 | 128 / 1114 / 301 / 542 | 1115 (53%) | M15 803, M30 477, H1 805 |
| w04_23-imm4-all4 | 706 | 2.98 | 11 | 750 / 1357 | 756 / 132 / 510 / 709 | 958 (45%) | M5 702, M15 495, M30 375, H1 535 |
| w04_23-imm4-no5 | 699 | 2.98 | 11 | 380 / 1706 | 391 / 131 / 570 / 994 | 1194 (57%) | M15 747, M30 578, H1 761 |
| w04_23-imm3-all4 | 706 | 2.98 | 11 | 1751 / 356 | 179 / 1580 / 96 / 252 | 936 (44%) | M5 1060, M15 425, M30 298, H1 324 |
| w04_23-imm3-no5 | 699 | 2.98 | 11 | 1259 / 827 | 131 / 1147 / 236 / 572 | 1099 (53%) | M15 972, M30 534, H1 580 |
| w00_24-imm4-all4 | 709 | 2.98 | 17 | 820 / 1290 | 830 / 111 / 444 / 725 | 934 (44%) | M5 700, M15 344, M30 313, H1 753 |
| w00_24-imm4-no5 | 702 | 2.98 | 17 | 408 / 1681 | 421 / 118 / 566 / 984 | 1141 (55%) | M15 546, M30 475, H1 1068 |
| w00_24-imm3-all4 | 710 | 2.97 | 17 | 1803 / 308 | 184 / 1628 / 72 / 227 | 932 (44%) | M5 1085, M15 368, M30 278, H1 380 |
| w00_24-imm3-no5 | 703 | 2.97 | 17 | 1317 / 773 | 151 / 1185 / 219 / 535 | 1073 (51%) | M15 873, M30 470, H1 747 |

