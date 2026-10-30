# Oracle fixtures from SoaringSpot data

Research for ticket #3, collected 2026-10-30. It inventories a SoaringSpot download of German and FAI competitions, maps which rule sets, task types, handicaps, penalties and odd cases appear, and proposes a small first set of oracle fixtures. It also covers how pilot data can be anonymised and which flights can serve as unanonymised signature-check fixtures.

## Sources

| Short name | Source | Version |
|---|---|---|
| Data set | SoaringSpot pages, tasks, results and IGC files of 40 competitions, downloaded with soaringspot-downloader using `--gzip` | Downloaded up to 2026-10-30 |
| Downloader README | https://github.com/Turbo87/soaringspot-downloader/blob/a9ae646/README.md | commit `a9ae646` |
| Downloader data notes | https://github.com/Turbo87/soaringspot-downloader/blob/a9ae646/docs/soaringspot-data.md | commit `a9ae646` |
| Scoring rules research | `docs/research/scoring-rules.md` on the `research/scoring-rules` branch | ticket #2 |

Data is referenced as `<competition>/<class>/<date>/<file>`, relative to the root of a soaringspot-downloader output directory. The competition and class parts are the SoaringSpot URL slugs. IGC files are named `<IGC date prefix>_<CN>.igc.gz`.

All counts below come from scripts that parsed every `task.json`, `results.csv`, the "Task info" line of every `results.html`, and the A, H, I, G and L records of every IGC file. Competitors are referred to by competition ID (CN) only.

## Verification status

Verified means counted or read directly in the data set. Not verified:

- **G-record validity.** No IGC validation program was run. Whether the published files pass validation, with or without the records SeeYou appends after the G record, is open. See [Signature-check fixtures](#signature-check-fixtures).
- **Hidden handicaps.** Some DAeC days report "handicapping enabled" in the Task info line but publish no handicap column. Whether all gliders had equal handicaps on those days was not checked.
- **Meaning of the `LCU::W` and `LCU::PO` records** that SeeYou appends to IGC files.

## Data set inventory

The download holds 40 competitions, not the 26 the ticket mentions. It covers 93 classes, 1048 class-days, 28200 result rows and 21004 IGC files (9.9 GB compressed).

| Competitions | Rule set | Notes |
|---|---|---|
| `euregiocup-2022` to `euregiocup-2026` | DAeC SWO with local procedures | Classes `hasen` and `igel`. Handicapped. No IGC files at all for 2022 |
| `dm-2022-zwickau`, `dm-zwickau-2024`, `dm-zwickau-2026`, `dm2023bayreuth`, `dm-frauen-landau-ebenberg-2022`, `dm-clubklasse-burg-feuerstein-burg-feuerstein-2024`, `dm-18m-burg-feuerstein-burg-feuerstein-2025`, `dmc2026-burg-feuerstein`, `dm-offene-klasse-2025-lachen-speyerdorf-2025`, `dm-dosi-brb2025`, `dmj-edpa-2023`, `dsmf24`, `dsmj2025` | DAeC SWO | German championships and qualifiers |
| WGC, WWGC, EGC, JEGC and JWGC from 2020 to 2026 (22 competitions) | FAI Annex A | `10th-fai-womens-world-gliding-championship-lake-keepit-2020` has no IGC files. `12th-fai-womens-world-gliding-championship-garray-2023` lacks them on 8 official days |

Result status from `task.json`:

| `result_status` | Class-days |
|---|---|
| `official` | 668 |
| `practice` | 213 |
| `cancelled` | 148 |
| `unofficial` | 17 |
| `preliminary` | 2 |

Every class-day has a `results.csv`, including cancelled ones. On cancelled days all rows carry `DNF` or `DNS` with zero points, so `DNF` there does not mean a flight was flown. Practice days use negative `task_number` values. 647 of the 687 official, unofficial and preliminary days have IGC files.

## Rule sets and scoring scripts

The Task info line in `results.html` identifies the scoring setup. It is not part of `results.csv`.

- **DAeC SWO script.** From 2024 on, DAeC competitions end the Task info line with a script version: `DAeC-SWO2024 Script V9.06` and `V9.07`, `DAeC-SWO2025 Script V9.07` and `V9.08`, `DAeC-SWO2026 Script V9.09`. The 2022 and 2023 DAeC competitions publish no marker. DAeC lines use a decimal comma (`F = 0,919`, `Do: 266,00km`).
- **FAI Annex A script.** FAI competitions publish the Annex A parameter line (`Dm`, `D1`, `N`, `n1`, `n2`, `Do`, `Vo`) and, from about 2023, a base64 hash of the scoring algorithm. Each competition has its own hash, and some change during the event, for example in `egc2023` and `wgc2026`.
- **Older variant.** `wgc2021-club-std-15m-montlucon-gueret-2021` shows a different line on some days (`Day factor = 0.395, Completion factor = 1.000, Start time interval = 0min`).
- **Local Dm.** EuregioCup scored with `Dm = 50km, D1 = 250km` on every official day of 2023 and 2024 and on two `hasen` days of 2022. EuregioCup 2025 and 2026 used `Dm = 100km`. This confirms the 50 km value that the scoring rules research could not find in the published announcement.
- **Earth model.** Comparing published leg distances with distances computed from the task point coordinates, all checked DAeC days (EuregioCup 2023 to 2025, DM Zwickau 2024 and 2026, DM 18 m 2025) match the WGS84 ellipsoid to within 0.002 %. `39th-fai-world-gliding-championships-tabor-2025` and `37th-fai-world-gliding-championships-2022-szeged-2022` match a sphere slightly smaller than 6371 km, and `wgc2021-club-std-15m-montlucon-gueret-2021` matches WGS84. The downloader data notes report the same split for other FAI events.

## Day validity and devaluation

| Case | Example |
|---|---|
| Annex A day not valid, official with all points zero | `39th-fai-world-gliding-championships-tabor-2025/club/2025-06-10` (`Day not valid - rule 8.2.1b`) |
| DAeC day not valid by the n1/N rule | `dsmf24/club-klasse/2024-08-07` (`!! n1/N <= 25% -> Day not valid and has to be canceled !!`) |
| Completion ratio below 1 | `dm-zwickau-2024/15-meter/2024-06-16` (`Fcr = 0,724`, 3 finishers out of 31) |
| Day factor below 1 | `euregiocup-2025/hasen/2025-05-30` (`F = 0,609`, maximum 525 points) |
| Scripts warning about configuration | `Error: Lowest handicap is zero!` on `dm-zwickau-2024/15-meter/2024-06-09`, `Warning: Glider MG ihas a hadicap 0` on `38th-fai-world-gliding-championship-uvalde-garner-field-2024/double-seater/2024-08-11` |

## Task types and observation zones

`task_type` values: `assigned_area` 552, `polygon` (racing task) 489, `unknown_triangle` 4 and `broken_leg` 3. The last two are racing tasks with a different SoaringSpot label. `dm2023bayreuth/offene/2023-06-07` is an official `unknown_triangle` day with keyhole turnpoints. `start_on_entry` is never set. One task, `dmj-edpa-2023/standard/2023-05-27`, has a `multiple_start` point.

Observation zones on official, unofficial and preliminary days:

| Zone | Where |
|---|---|
| Start line, 5 to 10 km | Almost every task |
| Start cylinder | `24th-fai-egc/15-meter/2026-07-16` |
| Start line with `oz_max_altitude` (2000 m) | `dm-offene-klasse-2025-lachen-speyerdorf-2025/open/2025-07-02` |
| Turnpoint cylinder 500 m | FAI racing tasks |
| Keyhole (10 km 45° sector plus 500 m cylinder) | DAeC racing tasks |
| AAT cylinder, 0.5 to 70 km | All AATs |
| AAT fixed sector | `37th-fai-world-gliding-championships-2022-szeged-2022` (2022-08-01), `23rd-fai-european-gliding-championships-bekescsaba-2025/double-seater`, `dmc2026-burg-feuerstein/club/2026-06-20` |
| AAT annular sector (inner radius set) | `37th-fai-world-gliding-championships-2022-szeged-2022/20m-multi-seat/2022-08-01` (35 km outer, 25 km inner, 90°) |
| Finish ring 3 to 10 km with `oz_reduce` | Most tasks |
| Finish ring without `oz_reduce` | `dmj-edpa-2023` |
| Finish line | Never |

Task notes in `task.html` carry rules that `task.json` lacks: minimum finish altitude, maximum start altitude and speed, pre-start altitude, PEV settings and the start opening time. A fixture needs these as structured data written by hand.

## Handicaps

Two scales appear in the `handicap` column:

- Around 1.0, as in `1.034`, in FAI club, double-seater and junior classes and in most DAeC handicapped classes.
- Around 100, as in `108` or `101.9`, in EuregioCup, `dm-frauen-landau-ebenberg-2022`, `dm-clubklasse-burg-feuerstein-burg-feuerstein-2024`, `jegc2021` and `7th-fai-junior-european-gliding-championships-prievidza-2025`.

Some DAeC classes report "handicapping enabled" without a handicap column, for example `dm-zwickau-2024/15-meter` and `dm-18m-burg-feuerstein-burg-feuerstein-2025/18-meter`.

## Penalties and remarks

1668 rows carry penalty points and 770 rows a remark without points. The text is free-form, in English or German, and the same offence is phrased many ways. Frequent groups:

| Group | Examples of remark text |
|---|---|
| Finish below minimum altitude | `Finish altitude 545m (-105)`, `Zielhöhe: 815m`, `Zielkreishöhe` |
| Start too high or too fast | `Abflug zu hoch`, `Abflughöhe 1807m ->`, `Abfluggeschwindigkeit`, `Maximalhöhe` |
| PEV start | `Start outside PEV interval (-21)`, `PEV Gate not open`, `No PEV`, `Abflug 3 Sekunden außerhalb Marker Fenster` |
| Pre-start altitude | `Pre-start altitude 1865m (-65)`, `Invalid PreStart Alt` |
| Engine | `Motorabstellhöhe: 1879m`, `5.2.2 no return home after engine use`, `Self-launch above altitude limit`, `No engine registered` |
| Administrative and safety | `Disqualified`, `Dangerous Flying`, `Omitted weight control`, `Abfluggewicht`, `Landing after legal daylight` |
| Penalty capped at speed points | `141p penalty - finish alt 245m (speed points cap applied)` on `24th-fai-egc/club/2026-07-20`, `Zielkreis 649m --> Strafpunkte = Speedpunkte` on `dmc2026-burg-feuerstein/club/2026-06-20` |

Numbers inside the text do not always equal the penalty. On `euregiocup-2026/hasen/2026-05-14`, CN TA2 has `Flarm Defekt! [Verwarnung] (187 penalty points)`, a warning that removes 187 points. Some penalties have no text at all (`31 penalty points` on `euregiocup-2023/hasen/2023-05-18`).

Penalties are not floored at zero on practice and cancelled days. `dm2023bayreuth/18m/2023-05-28` (practice) shows -789 points after engine-stop altitude penalties.

## Missing and unscored flights

- **Scored without IGC file.** On official and unofficial days that have IGC files, 35 rows on 27 days have a distance but no IGC file. Most carry `Virtuelle Außenlandung` (virtual outlanding after an engine start), `Wettbewerbsraum` (left the competition area) or `Admin Penalty`. Examples: CN GI on `dm-zwickau-2024/15-meter/2024-06-16`, CNs MY and SB on `dm-zwickau-2026/standard/2026-06-02`, five CNs on `dmc2026-burg-feuerstein/club/2026-06-15`.
- **Virtual outlanding with zero points.** On `euregiocup-2024/hasen/2024-05-11`, CNs MW, ME and V have a start time, zero distance and points, rank 31, and no IGC file.
- **Finisher without IGC file.** CN 8S on `dm-offene-klasse-2025-lachen-speyerdorf-2025/open/2025-07-02` and CN M1 on `37th-fai-world-gliding-championships-narromine-2023/standard/2023-12-10`.
- **Manual changes without penalty points.** On `11th-fai-womens-world-gliding-championship-2022/18-meter/2022-08-21`, CN MM finished but scored 0 points with remark `Admin Penalty` and an empty `penalty_points`.
- **IGC file for a DNS row.** `euregiocup-2024/hasen/2024-05-11/45B_NW2.igc.gz` belongs to a row ranked `DNS`.
- **Hors concours.** 146 `HC` rows in 11 competitions. HC rows keep their points but are excluded from `N`, for example on `dm-offene-klasse-2025-lachen-speyerdorf-2025/open/2025-07-02` (32 rows, `N: 30`).
- **Ties.** Equal ranks are common, and the zero-point rows above share a rank.

These flights cannot be re-scored from an IGC file. The oracle needs scorer-entered results as an input, which also matters for the scorer workflow.

## Odd IGC files

| File | Oddity |
|---|---|
| `21st-fai-european-gliding-championships-pociunai-2022/club/2022-07-04/274_IV.igc.gz` | The first 256 KiB are underscores, followed by binary garbage. No A, H or I records. Scored rank 2 |
| `dm-zwickau-2024/15-meter/2024-06-16/46G_47.igc.gz` | Triadis RU3 logger, no G record, mixed-case H record keys (`HFPLTPilotInCharge`), I record after the C records |
| `euregiocup-2024/hasen/2024-05-11/45B_L2.igc.gz` | FLARM logger with a 2 s fix interval and remark `Validierung Prüfen! Loggerintervall >1 sec` |
| `euregiocup-2024/hasen/2024-05-11/45B_AX^2.igc.gz` | CN `AX^2` with a caret in the file name |
| `dm-18m-burg-feuerstein-burg-feuerstein-2025/18-meter/2025-06-19/56J_a7.igc.gz` | Lower-case CN `a7`. Other competitions use `A7` |

36 IGC files have no G record. 440 files declare neither ENL nor MOP. 4131 declare MOP.

All 3000 sampled IGC files, every seventh of the data set, have records that SeeYou Competition appended after the G record: `LCU::HP...` copies of the competitor list (pilot name, glider registration, CN), `LCU::C` copies of the task declaration, `LSEEYOU OZ=...` zone definitions, and `LCU::W` and `LCU::PO` records. The published files are therefore not the files the logger produced.

## Two kinds of oracle check

Fixtures support two checks with different inputs:

1. **Day formula.** Published distance, time, speed, handicap and penalty of every row reproduce the day parameters and all points. This needs only `task.json` and `results.csv`. The downloader data notes show this works on `39th-fai-world-gliding-championships-tabor-2025/club/2025-06-19` for all 41 competitors.
2. **Flight analysis.** An IGC file and the task reproduce one row's start time, finish time, distance and speed. This needs the IGC file and the task notes.

A day fixture with the complete `results.csv` and a few IGC files supports both checks.

## Proposed first fixture set

Each fixture is a day's `task.json`, `task.cup` and anonymised `results.csv`, plus a hand-written file with the task notes that affect scoring and the known deviations. `task.html` and `results.html` should not be committed because they contain names and phone numbers.

| Day | Why | IGC files |
|---|---|---|
| `39th-fai-world-gliding-championships-tabor-2025/club/2025-06-19` | Annex A racing task, handicapped club class, sphere earth model, PEV start, pre-start altitude, finish ring with `oz_reduce`, 13 outlandings, 1 DNF without file. Day formula already reproduced | `56J_AM` (winner, sets `Vo`), `56J_CX` (finish altitude penalty), `56J_HR3` (start outside PEV interval, outlanding), `56J_GM` (outlanding below `Dm`) |
| `39th-fai-world-gliding-championships-tabor-2025/club/2025-06-10` | Official AAT that is not valid under Annex A 8.2.1b, all points zero | None |
| `euregiocup-2024/hasen/2024-05-11` | DAeC SWO script V9.06, local `Dm = 50km`, handicaps on the 100 scale, keyhole turnpoints, WGS84, finish ring altitude penalties, zero-point virtual outlandings without files, DNS with file | `45B_EJ` (maintainer, finish ring altitude penalty, unanonymised), `45B_L2` (FLARM logger, 2 s interval), `45B_NW2` (DNS row with file), `45B_AX^2` (caret in CN) |
| `dm-zwickau-2024/15-meter/2024-06-16` | DAeC racing task without handicap column, `Fcr = 0,724`, 28 of 31 outlanded, virtual outlanding without file, start altitude penalty | `46G_JH` (winner), `46G_IYB` (longest outlanding), `46G_J3` (start too high), `46G_47` (no G record, unusual headers) |
| `dm-offene-klasse-2025-lachen-speyerdorf-2025/open/2025-07-02` | DAeC AAT of 4 h, no handicaps, start line with maximum altitude, 12 penalties for start height and speed, 2 HC rows, finisher without file | `572_FE` (winner), `572_OT` (maximum altitude penalty), `572_1P` (HC) |
| `37th-fai-world-gliding-championships-2022-szeged-2022/20m-multi-seat/2022-08-01` | Annex A AAT with fixed and annular sectors, no penalties, all 19 finished | `281_MG` (winner), `281_FNC` (longest distance), `281_HUX` (slowest) |

Candidates for a second round:

- `dsmf24/club-klasse/2024-08-07` for the DAeC n1/N rule.
- `dm-18m-burg-feuerstein-burg-feuerstein-2025/18-meter/2025-06-19` for DAeC PEV penalties, a 3 s marker window penalty, and a virtual outlanding with a penalty.
- `wgc2026/18-meter/2026-05-13` (practice) for "no return home after engine use".
- `dm2023bayreuth/18m/2023-05-28` (practice) for engine-stop altitude penalties and negative points.
- `euregiocup-2024/hasen/2024-05-10` for an AAT flight by the maintainer.
- `21st-fai-european-gliding-championships-pociunai-2022/club/2022-07-04/274_IV.igc.gz` as a parser robustness case.

The 18 IGC files above take about 9.4 MB compressed. One complete class-day, such as the Tábor club day, takes about 36 MB.

## Anonymising pilot data

`results.csv` names people in `contestant`, `club` and `team`. Replacing them with a placeholder derived from the CN keeps every column the scorer needs (`cn`, `countries`, `glider`, `handicap`). Remarks are free text and need a manual review.

IGC files name people in several places:

- H records `HFPLTPILOT` or `HFPLTPILOTINCHARGE`, `HFCM2CREW2`, and `HFGIDGLIDERID` (registration).
- Appended `LCU::HPPLTPILOT`, `LCU::HPGIDGLIDERID` and `LCU::HPCIDCOMPETITIONID`. These carry the competitor's name even when the logger header is empty, as in `euregiocup-2026/hasen/2026-05-16/65G_RS.igc.gz`.
- Logger and FLARM serial numbers in A and L records, for example `LLXVFLARM:NG,7.22,<FLARM ID>`, which can be linked to a registration.

Any change to a record before the G record invalidates the signature. Anonymisation is also only pseudonymisation, because SoaringSpot publishes the same results with names under the same CN.

## Signature-check fixtures

Flights by the maintainer, Tobias Bieniek, who agreed to their publication as-is, appear in the `hasen` class of every EuregioCup:

| Day | CN | Result | IGC file |
|---|---|---|---|
| `euregiocup-2022/hasen/2022-05-25` | SG | Outlanding, 398 km, 645 points | None published |
| `euregiocup-2023/hasen/2023-05-17` | EJ | Finisher | `35H_EJ.igc.gz` |
| `euregiocup-2023/hasen/2023-05-18` | EJ | Finisher, 31 penalty points without text | `35I_EJ.igc.gz` |
| `euregiocup-2023/hasen/2023-05-19` | EJ | Finisher | `35J_EJ.igc.gz` |
| `euregiocup-2024/hasen/2024-05-09` | EJ | Finisher | `459_EJ.igc.gz` |
| `euregiocup-2024/hasen/2024-05-10` | EJ | AAT finisher | `45A_EJ.igc.gz` |
| `euregiocup-2024/hasen/2024-05-11` | EJ | Finisher, 8 points finish ring altitude penalty | `45B_EJ.igc.gz` |
| `euregiocup-2025/hasen/2025-05-30` | EJ | Finisher | `55U_EJ.igc.gz` |
| `euregiocup-2026/hasen/2026-05-14` | RS | AAT finisher | `65E_RS.igc.gz` |
| `euregiocup-2026/hasen/2026-05-16` | RS | AAT finisher | `65G_RS.igc.gz` |

His other rows are `DNF`, on the official days 2022-05-27 and 2022-05-28 and on four cancelled days. All nine files come from LXNAV loggers and have G records. The 2026 files have an empty `HFPLTPILOT` and name him only in the appended `LCU::HPPLTPILOT` record. CN SG in 2026 belongs to a different pilot.

Because SeeYou appends records after the G record, the published files may fail validation even without anonymisation. A validator should check one published file and the same file with the appended block removed before these become signature fixtures. If neither passes, the original logger downloads are needed.

## Open questions

- Fixture layout: compressed or plain IGC files, and the format of the hand-written task notes and known-deviation file.
- How Keyhole models scorer-entered results such as virtual outlandings and area violations, which have no IGC file.
- Whether the hidden-handicap DAeC days had equal handicaps or need handicaps from another source.
- Which IGC validator to use for the signature check, and whether the appended SeeYou records break validation.
- Whether the Annex A hash and the DAeC script version should be stored per fixture to explain deviations between script versions.
