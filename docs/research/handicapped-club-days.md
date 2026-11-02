# Handicapped club class days in SeeYou results

Research for ticket #69, collected 2026-11-02. It explains why the recomputation in the rounding and ties research fails on 11 DAeC and about 30 FAI club class days, recovers the handicaps SeeYou applied on those days from the published points, and lists which handicapped days can serve as exact oracle fixtures.

## Sources

| Short name | Source | Version |
|---|---|---|
| Data set | SoaringSpot daily, total and task pages of the `club`, `club-klasse`, `hasen` and `igel` classes of 19 competitions, downloaded with `fetch_pages.py` from the rounding and ties research plus a class filter | Downloaded 2026-11-02 |
| Rounding research | `docs/research/rounding-and-ties.md` and `research/rounding-and-ties/recompute.py` on the `research/rounding-and-ties` branch | ticket #65 |
| Naviter script | `igc_annex_a/AnnexA_scoring.pas` in naviter/seeyou_competition_scripts, https://github.com/naviter/seeyou_competition_scripts/blob/496773b/igc_annex_a/AnnexA_scoring.pas | commit `496773b` (2024-07-22) |
| Naviter script 8.01 | Same file, https://github.com/naviter/seeyou_competition_scripts/blob/84b6e0e/igc_annex_a/AnnexA_scoring.pas | commit `84b6e0e` (2021-04-20) |
| Naviter script 9.01 | Same file, https://github.com/naviter/seeyou_competition_scripts/blob/27be4af/igc_annex_a/AnnexA_scoring.pas | commit `27be4af` (2022-07-08) |
| Naviter script 9.02 | Same file, https://github.com/naviter/seeyou_competition_scripts/blob/ab510b4/igc_annex_a/AnnexA_scoring.pas | commit `ab510b4` (2022-07-17) |
| Scoring rules research | `docs/research/scoring-rules.md` on the `research/scoring-rules` branch | ticket #2 |
| Oracle fixtures research | `docs/research/oracle-fixtures.md` on the `research/oracle-fixtures` branch | ticket #3 |

The data set covers the club classes of `dm-2022-zwickau`, `dm-clubklasse-burg-feuerstein-burg-feuerstein-2024`, `dmc2026-burg-feuerstein`, `dmj-edpa-2023`, `dsmf24` and `dsmj2025`, the `hasen` and `igel` classes of `euregiocup-2022` to `euregiocup-2026`, and the club classes of `10th-fai-womens-world-gliding-championship-lake-keepit-2020`, `11th-fai-womens-world-gliding-championship-2022`, `12th-fai-womens-world-gliding-championship-garray-2023`, `21st-fai-european-gliding-championships-pociunai-2022`, `37th-fai-world-gliding-championships-narromine-2023`, `39th-fai-world-gliding-championships-tabor-2025`, `jegc2021` and `wgc2021-club-std-15m-montlucon-gueret-2021`. These are all club classes of the rounding research's 31 competitions. Days are referred to as `<competition>/<class>/<date>`, and "rows" means scored rows without a remark, as in the rounding research.

## Verification status

Verified means counted in the data set with the scripts in `research/handicapped-club-days/` or read in the cited script revision. Not verified:

- **Which script version each competition ran.** The Info line names the script only on DAeC days from 2024 and as a hash on `39th-fai-world-gliding-championships-tabor-2025`. The reference used on older FAI days was inferred from the results and the script's change log.
- **The scale of hidden handicaps.** Under the current script, a recovered handicap is H divided by the power of ten below the lowest handicap, so 1.022 and 102.2 can't be told apart. Under the older script, only ratios between handicaps are recoverable (see [Lake Keepit 2020](#lake-keepit-2020)).
- **The source of the recovered values.** Whether they come from the IGC Club Class list or the DAeC index with per-glider adjustments was not checked against those lists.
- **Whether the older script took Hmin over the day's pilots or the whole class.** In the data, the competitor with the lowest handicap flew on every valid day, so the two give the same result.
- **Why SoaringSpot omits the handicap column** on some handicapped days. It might be a SoaringSpot display setting. Nothing in the pages says.
- **CN AW on `dmc2026-burg-feuerstein/club/2026-06-20`.** The row shows 4.71 km and 0 points without a remark, where the formula gives 5.42. This is not a handicap effect, and the cause was not found.
- **The FAI day count.** This data set has 67 FAI club class days, 30 of them failing. The rounding research reported 29 of 66. The difference was not traced.

## Why the days fail

`recompute.py` from the rounding research uses the published Handicap column, or 1.0 without one, and divides by the lowest handicap rounded down to a power of ten. Every failing club class day falls into one of four groups:

| Cause | Days | Competitions |
|---|---|---|
| No Handicap column, although handicapping was enabled | 27 | `dmj-edpa-2023` (10), `12th-fai-womens-world-gliding-championship-garray-2023` (8), `10th-fai-womens-world-gliding-championship-lake-keepit-2020` (9) |
| Older script that divides by the unrounded lowest handicap | 7 | `wgc2021-club-std-15m-montlucon-gueret-2021` |
| One competitor's handicap changed during the competition, and SoaringSpot shows only the final value | 5 | `37th-fai-world-gliding-championships-narromine-2023` |
| Not a handicap problem | 2 | `39th-fai-world-gliding-championships-tabor-2025/club/2025-06-10` (invalid day, Annex A 8.2.1b, all scores zero, which `recompute.py` doesn't model), `dmc2026-burg-feuerstein/club/2026-06-20` (CN AW, see above) |

With the handicaps and reference recovered below, every row of every failing day matches, apart from the two days in the last group. Scale guessing between 100 and 1.0, per-class Dm and D1, and the n-values are not causes. Dm and D1 are printed in the Info line on every day, 100 km and 250 km for the club classes and the local 50 km Dm for the EuregioCup. N, n1 and n2 are printed as well. On every day that has a Handicap column, the current power-of-ten normalisation handles the 1.0 scale (FAI, most DAeC), the 100 scale (`euregiocup-*`, `jegc2021`) and the 1000 scale (`dm-clubklasse-burg-feuerstein-burg-feuerstein-2024`, values 988 to 1068) alike.

## How the handicap reference works

Every Naviter script version divides speed and distance by `Hcap / Hmin`. The versions differ in `Hmin`:

- **8.01 and earlier** set `Hmin` to the lowest handicap of all non-HC pilots and use it unrounded (Naviter script 8.01, lines 184 to 194).
- **9.01** removed `Hmin` and divides by `Hcap` alone (Naviter script 9.01, line 228, "Removed all reference to Hmin").
- **9.02 and later** round the lowest handicap down to 1, 10, 100 or 1000 (Naviter script 9.02, lines 218 to 223, Naviter script lines 257 to 262). The 2022-07-17 change log entry says this was "to be able to calculate results for Handicaps between 80-130".

Scaling every handicapped speed and distance by the same factor leaves `Vh / V0` and `Dh / D0` unchanged. The reference therefore only matters where it enters an absolute value. Those are the `1250 * D0 / D1 - 250` term of Pm and the `Dh >= Dm` test for n1. On days where Pm is 1000 or set by the time term, both references give the same scores. That is why `wgc2021-club-std-15m-montlucon-gueret-2021/club` fails on 7 of 9 days, not all of them, and why `jegc2021/club`, whose lowest handicap is exactly 100, recomputes under both.

`reference.py` recomputes every day that has a Handicap column under both references:

| Competition | Club days | Current reference | Unrounded Hmin |
|---|---|---|---|
| `wgc2021-club-std-15m-montlucon-gueret-2021` (August 2021, lowest handicap 0.994) | 9 | 2 days match | 9 days, 270 of 270 rows |
| `jegc2021` (July 2021, lowest 100) | 7 | 7 days | 7 days |
| `21st-fai-european-gliding-championships-pociunai-2022` (July 2022) | 8 | 8 days | 4 days |
| All other club, `hasen` and `igel` classes with a Handicap column, 2022 to 2026 | 74 | All except the Narromine, AW and invalid-day cases above | Fails on every day where the two references give a different Pm |

On the 7 failing `wgc2021` days the published Maximum Points equal the recomputed Pm with the unrounded reference, for example 992 instead of 1000 on 2021-08-17 and 610 instead of 615 on 2021-08-19. The 2021 championship thus ran a script from before 9.01, and later competitions ran 9.01 or later. The DAeC script behaves like 9.02 on all DAeC days, including the 1000-scale list of 2024.

## Hidden handicap columns

On 27 days SoaringSpot publishes speed and distance unhandicapped, Glider types, and the handicapped Do and Vo in the Info line, but no Handicap column. The handicaps can be recovered from the points:

- For a finisher above 2/3 Vo, `Points / (F * Fcr) = Pdm + Pvm * (Vh - 2/3 V0) / (V0 / 3)`, which gives Vh and so `H / Hn = V / Vh`.
- For an outlander, `Points / (F * Fcr) = Pdm * Dh / D0` gives `H / Hn = D / Dh`.
- Published points are whole numbers, so each row gives a range of `H / Hn`. With Pm, Do and Vo from the Info line, a finisher's range is about 0.0006 wide and an outlander's a few thousandths.

`recover.py` intersects these ranges per CN over all days of the class and picks the nearest three-decimal value. Finishers below 2/3 Vo give no information, and rows with a remark are skipped.

**`dmj-edpa-2023/club`.** All 40 competitors are recovered, and recomputing with the recovered values matches all 343 rows on all 10 days. Each value is unique: changing any single handicap by 0.001 breaks at least one row. The values range from 0.987 (LS 1d) to 1.060 (ASW 20 C). The same glider type gets different values, for example LS 4 at 1.022, 1.025 and 1.029, so the handicaps can't be filled in from the Glider column and a type list. That makes them per-competitor values. The lowest value is below 1, so the current reference is in effect, and under the older one the lowest competitor would come out at exactly 1.

**`12th-fai-womens-world-gliding-championship-garray-2023/club`.** All 19 competitors are recovered, from 0.994 (DG 100) to 1.064 (ASW 20), each unique. They match all 139 rows on all 8 days. On 2023-07-10 the published Maximum Points of 920, which recompute to 946 with equal handicaps, recompute correctly.

### Lake Keepit 2020

The three competitors IIC, KW and T1 are listed as "Disqualified" on every day with a penalty equal to their score, for example `Disqualified (975 penalty points)` and 0 points. Their flights still count for the day parameters (Annex A 8.2.5 per the scoring rules research), so their handicaps must be recovered as well. `--dq-penalty` scores those rows with their penalty.

With that, the ranges of all 17 competitors are consistent across days. The lowest, CN JO (LS 1 f), comes out at exactly 1.0000. That pattern is what the 2020 script gives, which divides by the unrounded lowest handicap. Under that reference, only ratios between handicaps are determined. The three-decimal values that match all 146 rows on all 9 days follow from assuming JO's handicap is 1.002, for example LS 4 at 1.022 to 1.029 and ASW 20 at 1.055. `hmin_search.py` tries every Hmin from 0.950 to 1.059, and 1.002 is the only one that matches every row. With 1.000, 137 rows match. No Lake Keepit day has a distance-limited Pm, so the data confirms the ratios but not the absolute values.

## Handicap changes during a competition

On `37th-fai-world-gliding-championships-narromine-2023/club`, CN IV is listed as "ASW 20L / Std Cirrus" with handicap 1 on every day, including the practice days. Back-solving gives 1.0587 to 1.0597 on the first five days and a range that contains 1.000 on 2023-12-09. IV did not finish on the later days. With IV at 1.059 up to 2023-12-08 and 1 afterwards, all 273 rows of the 10 days match. With the published handicap of 1, IV has the fastest handicapped speed on each of the first four days, which moves V0, so every row of those days fails. On 2023-12-08 IV is not the fastest even with 1, and only IV's own row fails.

SoaringSpot therefore shows one handicap per competitor, the one current when the results were last published. SeeYou applies a per-day value. A day fixture needs the handicap that applied on that day.

## Oracle fixtures

Days that recompute exactly from published data alone:

| Rule set | Days | Handicap scale |
|---|---|---|
| DAeC | `dm-2022-zwickau/club` (8 days), `dm-clubklasse-burg-feuerstein-burg-feuerstein-2024/club` (5), `dmc2026-burg-feuerstein/club` (7 of 8), `dsmf24/club-klasse` (4), `euregiocup-*/hasen` and `igel` (23) | 1.0, 1000 and 100 |
| FAI | `11th-fai-womens-world-gliding-championship-2022/club` (6), `21st-fai-european-gliding-championships-pociunai-2022/club` (8), `39th-fai-world-gliding-championships-tabor-2025/club` (9 valid days), `37th-fai-world-gliding-championships-narromine-2023/club` (5 days from 2023-12-09), `jegc2021/club` (7) | 1.0 and 100 |

Good handicapped fixtures among them are distance-limited days, because only those test the reference. Examples are `dm-clubklasse-burg-feuerstein-burg-feuerstein-2024/club/2024-07-05` (1000 scale, Pm 412, 43 rows) and `euregiocup-2025/hasen/2025-05-30` (100 scale, Pm 863, 39 rows). `39th-fai-world-gliding-championships-tabor-2025/club/2025-06-12` (Pm 887) and the already proposed `39th-fai-world-gliding-championships-tabor-2025/club/2025-06-19` are good FAI fixtures with the current script. The invalid day `39th-fai-world-gliding-championships-tabor-2025/club/2025-06-10` is a fixture for Annex A 8.2.1b.

Days that recompute exactly only with recovered or corrected handicaps:

- `dmj-edpa-2023/club` and `12th-fai-womens-world-gliding-championship-garray-2023/club` with the recovered values. These test the formula against values derived from the same results, so they are weaker fixtures than days with a published column.
- `37th-fai-world-gliding-championships-narromine-2023/club` from 2023-12-03 to 2023-12-08 with IV at 1.059. This is a fixture for a per-day handicap.
- `wgc2021-club-std-15m-montlucon-gueret-2021/club` and `10th-fai-womens-world-gliding-championship-lake-keepit-2020/club` need the pre-9.01 reference, which no current rule or script uses.

## Consequences for Keyhole

- Store the handicap per competitor and day, not per competitor. SeeYou applies per-day values, and SoaringSpot shows only the last one.
- Normalise by the lowest handicap rounded down to a power of ten, as the current scripts do. This covers the 1.0, 100 and 1000 scales seen. Lists whose values straddle a power of ten would need a decision (scoring rules research, item 5).
- An oracle importer can't rely on the Handicap column. When it is missing, or when a day fails only through V0 or D0, the handicaps can be recovered from the points as above. The importer has to flag such a fixture as using derived handicaps.
- Fixtures from before July 2022 can follow the older reference. A fixture should record which reference it needs, or such days should be excluded.

## Scripts

The scripts import `recompute.py` from `../rounding-and-ties/`, which is on the `research/rounding-and-ties` branch, and read the `tables.jsonl` that `parse_pages.py` from that branch writes.

```sh
python3 reference.py tables.jsonl [<day-prefix>]
python3 recover.py tables.jsonl <comp>/<class> [--dq-penalty] [--tol 0.0003] [--digits 3]
python3 hmin_search.py tables.jsonl <comp>/<class> [--dq-penalty] CN=ratio...
python3 check.py tables.jsonl <day-prefix> [--hmin] [--dq-penalty] [--unique] [CN=H...]
```

`reference.py` compares the two references on days with a Handicap column. `recover.py` back-solves and checks handicaps per class and prints the recovered values and the range midpoints. `hmin_search.py` turns the midpoints of an older-reference class into a three-decimal list. `check.py` recomputes days with given handicaps and, with `--unique`, tests each value against its 0.001 neighbours.
