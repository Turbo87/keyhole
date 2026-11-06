# PROTOTYPE: scoring inputs in SoaringSpot downloads

Throwaway spike for the question "Which scoring inputs does a SoaringSpot download carry beyond the task and IGC files?". It inventories what soaringspot-downloader keeps per row and per day, maps each field onto the Keyhole terms in `GLOSSARY.md`, and counts the rows whose published result needs more than flight analysis of their IGC file. Nothing here is production code.

```sh
python3 -I inventory.py <soaringspot-downloader output> > report.md
```

| Variable or flag | Effect |
|---|---|
| `ONLY` | Reads only days whose `<competition>/<class>/<date>` starts with this prefix |
| `--remarks` | Appends every remark text of official days by group. The output then contains free text with personal data and must not be committed |

## Method

The download was made with soaringspot-downloader at commit `1ea9f83`, whose `src/results_csv.rs` defines `results.csv`. It holds 64 competitions with 1553 class days. Each day directory has `task.json`, `task.cup` (missing on 18 days), the unmodified `task.html` and `results.html` pages, `results.csv` and one `<IGC date prefix>_<CN>.igc.gz` per flight. No CN has two IGC files on a day.

`inventory.py` reads `result_status` from `task.json`, every row of `results.csv`, and from `results.html` the page heading, the table columns, the Task info line and whether each row's CN links to a flight on SoaringSpot. It matches IGC files to rows by CN, ignoring case. Rows are classified by the first reason that applies:

1. The rank label `DNS` or `DNF`, split by whether an IGC file exists.
2. No IGC file: the whole day has no published flight, SoaringSpot links a flight the download lacks, or SoaringSpot has no flight for the row.
3. Penalty points.
4. A remark without penalty points, grouped by regular expressions over the remark text.

Each reason maps to the Keyhole input that would reproduce the row and to whether the download carries that input. "Carried" means the fields state it exactly, "partly" means they state some of it and "not carried" means they lack it. A day counts under the worst reason of its rows. Official days are the reference. The other statuses are counted for comparison only.

The N check reads `N` from the Task info line, which Annex A and the SWO define as the competitors with a competition launch, and solves for how many DNF and DNS rows it includes.

## Result

| `result_status` | Days | Competitions | Rows |
|---|---|---|---|
| official | 989 | 56 | 21 851 |
| unofficial | 46 | 9 | 853 |
| preliminary | 61 | 9 | 752 |
| practice | 217 | 33 | 5 630 |
| cancelled | 240 | 49 | 5 246 |

The page heading repeats the status ("Official results for", "Unofficial", "Preliminary", "practice task", "Task cancelled") and agrees with `task.json` on every day.

### Fields per row

Presence on official rows. A competition counts if any of its official rows fills the field.

| Field | Rows | Competitions | Keyhole concept |
|---|---|---|---|
| `rank` | 100 % | 56/56 | Rank, or the labels `DNF`, `DNS` and `HC` that stand for a result status or hors concours |
| `cn` | 100 % | 56/56 | Competition ID, the key to the IGC file |
| `contestant`, `countries`, `club`, `team` | 100 %, 67 %, 22 %, 35 % | 56, 30, 23, 14 | Crew and competitor data, no scoring input |
| `glider` | 100 % | 56/56 | Glider type, input for a handicap list |
| `handicap` | 47 % | 37/56 | Handicap, but only the final value of the competition |
| `start_time_local` | 97 % | 56/56 | Start time, usable for a start override or a manual result |
| `finish_time_local` | 80 % | 56/56 | Finish time of finishers only |
| `duration` | 80 % | 56/56 | Finish time minus start time on all 17 493 finishers |
| `speed_kmh` | 80 % | 56/56 | Unhandicapped speed, distance divided by the larger of duration and the AAT minimum time on all finishers |
| `distance_km` | 99.7 % | 56/56 | Distance, the only achievement of non-finishers |
| `points` | 100 % | 56/56 | Day score after penalties, the oracle |
| `points_sort_key` | 100 % | 56/56 | Tie order, no scoring input |
| `penalty_points` | 6.9 % | 52/56 | Penalty points |
| `remarks` | 9.7 % | 55/56 | Public remark of a penalty, official warning or note |

No landing time, landing position or flight end is published. On all 3 722 official non-finishers with a start, `duration` and `speed_kmh` are empty, so an outlander's result is its start time and distance only. Turnpoints and the credited start point are not published either.

The table columns differ between days: `Handicap` on 454 of 989 official days, `Club` on 392 and `Team` on 298. All other columns are always present. Handicaps come on three scales: about 1 (6 898 rows), about 100 (1 788) and about 1000 (1 586).

### Status notations

The only non-numeric rank labels are `DNF`, `DNS` and `HC`:

| Label | Official | Practice | Cancelled | With IGC file (official) | Counted in N (official days) |
|---|---|---|---|---|---|
| `DNF` | 575 | 2 702 | 4 777 | 5 | Not on 237 days, yes on 3 |
| `DNS` | 61 | 277 | 147 | 57 | Yes on 27 days, not on 1 |
| `HC` | 174 | 14 | 1 | 174 | Not, except on 4 South African days |

Judged by N, SoaringSpot's `DNF` is a competitor without a launch, which is Keyhole's result status did not fly. It has no start, distance 0 and 0 points, and rarely an IGC file. SoaringSpot's `DNS` is a launch without a valid start: it counts toward N and usually has an IGC file, so it is a scored file whose analysis finds no start, or a manual result without achievements. On 12 days with both labels, N is ambiguous or matches neither. All rows of cancelled days are `DNF` or `DNS` with 0 points, and 96 cancelled `DNF` rows have an IGC file.

Remarks without points add finer notations to 111 official `DNF` rows and 2 `DNS` rows: `DNF` 69, `Withdrawn` and `Withdrawn from Competition` 31, `DNL` 4, `DNS` 2, `Did not fly` 3, `Did not launch` 2, and two German phrases for no start. A withdrawn competitor is not a separate status in the labels.

`HC` rows keep their points (170 of 174) and are hors concours, a competitor property. Six `DNF` rows of CN 1MM in two classes of `2020-multiclass-nationals-tocumwal-2019` carry points but distance 0.

### Penalties

1 502 official rows have penalty points. 1 490 remarks end in `(N penalty points)` after scorer text, 12 are just `N penalty points` without a reason. All penalties are positive, one is fractional, and 102 leave the row at 0 points, which includes day disqualifications such as `Disqualified (N penalty points)`. A Keyhole penalty is points plus a public remark, so these rows carry everything a penalty needs. Six penalty texts also name a virtual outlanding or a time penalty, which needs an override as well.

Grouped remark texts on official rows:

| Group | With points | Without points | Keyhole concept |
|---|---|---|---|
| Finish height (`Zielhöhe`, `Finish altitude`) | 579 | 22 | Penalty, or scoring as an outlanding when more than 100 m too low |
| Start (start altitude or speed, PEV, engine stop altitude) | 571 | 21 | Penalty |
| Official warning (`Warning`, `Verwarnung`, `First Offence`, `W -`) | 25 | 219 | Official warning |
| Status notation | 0 | 113 | Result status |
| Disqualification | 81 | 7 | Day or competition disqualification |
| Airspace or competition area | 7 | 45 | Penalty or flight end, effect not stated |
| Scored file (`Secondary FR used`, `Sekundärlogger`) | 18 | 40 | Scored file from another logger |
| Logger check (fix interval, GPS) | 4 | 35 | None, a note for the scorer |
| Start time (`5 min penalty`, `went early`, `PEV from primary`) | 8 | 27 | Start override |
| Flight end (`Virtuelle Außenlandung`, `Engine start`) | 5 | 24 | Flight end override after an engine run |
| Turnpoint (`Missed`, `not rounded OK`) | 38 | 5 | Penalty, or a manual distance |
| Rule reference only (`SC3A 1.4.5.3`, `SWO 10.5.3`) | 19 | 20 | Unknown |
| Landing note (`L/O`, `LANDED OUT`) | 0 | 15 | None |
| Crew list (`P1 ... P2 ...`) | 1 | 5 | Crew, no scoring input |
| Administrative and other | 134 | 26 | Mostly penalties, some unknown |

Time penalties exist only as remarks. SoaringSpot has no field for them, and the start time column already holds the shifted start.

### Fields per day

| Source | Field | Official days | Keyhole concept |
|---|---|---|---|
| `task.json` | `result_status` | 989/989 | Day status, `practice` for practice days |
| `results.html` Task info | Maximum points | 976 | Oracle for the day formula |
| | `Dm`, `D1`, `N`, `n1`, `n2`, `Do`, `Vo`, handicapping flag | 777 (45/56 competitions) | Rule set parameters and day oracle |
| | `F`, `Fcr` | 768 | Day oracle |
| | PEV settings | 725 | Start procedure |
| | Pre-start altitude | 107 (8) | Start procedure |
| | `DAeC-SWO<year> Script V<n>` | 88 (11) | Rule set edition |
| | Annex A script hash | 324 (15) | Rule set edition, opaque |
| | `Day not valid` | 9 (5) | Day validity |
| | Australian line (`Nd`, `Nv`, `Pvmax`) | 126 (7) | National rule set |
| | Day handicaps per CN (`66=10000; L1=9800`, `Day Handicaps`) | 90 (5) | Handicap per competitor and day, South African competitions only |
| | Older FAI line (`Day factor`) | 82 (4) | Day oracle |
| `task.html` | Task notes | 557 (35) | Day notes, the only source of minimum finish height, start altitude and speed limits, and start opening rules |
| `results.html` | Flight link per CN | 989 | Whether SoaringSpot has a flight, which `results.csv` drops |

Four official days have an empty Task info line. `results.csv` drops the Task info line, the page heading, the flight link per row and the overall placement column `OP`. The Task info line and task notes are free text in several languages and formats, so they need hand-written structured data in a fixture.

### Rows that need more than their IGC file

| Reason | Keyhole input | Download carries it | Official rows | Official days | Practice rows |
|---|---|---|---|---|---|
| `DNF` without IGC file | Result status did not fly | Carried | 570 | 361 | 2 688 |
| `DNF` with IGC file | Did not fly, with a deleted IGC file | Carried | 5 | 5 | 14 |
| `DNS` with IGC file | Scored file without a start | Carried | 57 | 49 | 274 |
| `DNS` without IGC file | Manual result without achievements | Carried | 4 | 4 | 3 |
| Penalty | Penalty | Carried | 1 393 | 485 | 197 |
| Remark: official warning | Official warning | Carried | 199 | 120 | 68 |
| Remark: logger check | None | Carried | 32 | 18 | 9 |
| Remark: landing note | None | Carried | 15 | 11 | 0 |
| Remark: crew list | None | Carried | 5 | 5 | 0 |
| No flight on SoaringSpot, row scored | Manual result | Partly | 72 | 42 | 3 |
| Day without any published flight (`euregiocup-2022`) | Manual result | Partly | 117 | 5 | 33 |
| Remark: scored file | Scored file from another logger | Partly | 40 | 21 | 1 |
| Remark: start time | Start override | Partly | 27 | 21 | 2 |
| Remark: finish height | Minimum finish height from the day notes | Partly | 21 | 15 | 2 |
| Remark: flight end | Flight end override after an engine run | Partly | 8 | 7 | 12 |
| Remark: disqualification | Disqualification | Partly | 2 | 1 | 0 |
| SoaringSpot links a flight, the download lacks it | IGC file | Not carried | 550 | 36 | 93 |
| Remark: airspace or competition area | Unknown | Not carried | 42 | 29 | 21 |
| Remark: start | Unknown | Not carried | 15 | 13 | 50 |
| Remark: rule reference only | Unknown | Not carried | 14 | 11 | 1 |
| Remark: turnpoint | Unknown | Not carried | 4 | 4 | 0 |
| Remark: other | Unknown | Not carried | 15 | 15 | 28 |
| Remark: administrative | Unknown | Not carried | 1 | 1 | 2 |
| **Total** | | | **3 208** | | **3 501** |

Of 21 851 official rows, 18 643 need only their IGC file, 2 280 need an input the download states exactly, 287 one it states partly and 641 one it lacks. Of 989 official days, 198 need nothing beyond their IGC files, 583 at most carried inputs, 102 at most partly carried ones and 106 have at least one row that cannot be reproduced. The 550 rows with a missing download are all on `10th-fai-womens-world-gliding-championship-lake-keepit-2020` (422), `12th-fai-womens-world-gliding-championship-garray-2023` (127) and one row of `11th-fai-womens-world-gliding-championship-2022`. 43 official days have no IGC file at all.

A manual result built from `results.csv` gets the start time, finish time and distance, which is enough for the points. It lacks the turnpoints and the landing. Of the 72 scored rows without a flight, 30 finished and 42 did not, and 17 of these carry a flight end remark such as a virtual outlanding.

The six fixture days of the oracle fixtures research need these inputs:

| Day | Rows | Beyond IGC files |
|---|---|---|
| `39th-fai-world-gliding-championships-tabor-2025/club/2025-06-19` | 42 | 1 `DNF`, 4 penalties |
| `39th-fai-world-gliding-championships-tabor-2025/club/2025-06-10` | 42 | 1 airspace remark without points |
| `euregiocup-2024/hasen/2024-05-11` | 36 | 2 `DNF`, 1 `DNS` with file, 3 penalties, 1 logger note, 3 rows without a flight |
| `dm-zwickau-2024/15-meter/2024-06-16` | 31 | 1 penalty, 1 official warning, 1 virtual outlanding without a flight |
| `dm-offene-klasse-2025-lachen-speyerdorf-2025/open/2025-07-02` | 32 | 12 penalties, 1 logger note, 1 finisher without a flight |
| `37th-fai-world-gliding-championships-2022-szeged-2022/20m-multi-seat/2022-08-01` | 19 | None |

A fixture day commits only the IGC files with edge cases, so its other rows become manual results from `results.csv`, which the table above says is enough for the points.

## Caveats

- "Reproducible by analysis" means only that nothing in the download asks for more. No flight was analysed here. The line-only zone reach prototype found 253 published finishers that miss a zone in its walk, mostly on `leeton-multiclass-nationals-2026`, `39th-fai-world-gliding-championships-tabor-2025` and `dm-2022-zwickau`, so some of these rows hide task changes or overrides without a remark.
- Remark groups come from regular expressions over free text in English and German. A few remarks fit more than one group and count in the first.
- The Keyhole input for "start time" remarks assumes the published start already includes any time penalty. This was not checked against the IGC files.
- The handicap column shows the last published handicap, not the one of each day, as the handicapped club days research found. Only the South African day handicap lists in the Task info line carry per-day values.
- The download lacks the IGC files SoaringSpot links for 550 official rows. Whether a new download fetches them was not tried.
- The term "launch decision" from the ticket is not in `GLOSSARY.md`. This README uses the result status did not fly instead.

## Open questions

- Should `DNS` rows with an IGC file become scored files whose analysis must find no start, or manual results without achievements? The download does not say whether a scorer rejected a start.
- Should a fixture keep remark-only rows of unknown effect (airspace, rule references, missed starts) as known deviations, or should those days be avoided as fixtures?
- Does Keyhole need a home for remarks that are neither penalties nor official warnings, such as withdrawals, logger notes and time penalties, or do fixtures drop them?
- Is a withdrawn competitor a result status, a deleted competitor, or did not fly on each remaining day?
