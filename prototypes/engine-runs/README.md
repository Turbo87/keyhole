# PROTOTYPE: engine run detection from ENL and MOP

Throwaway spike for the question "How does Keyhole detect engine runs from ENL and MOP data, and does it reproduce SeeYou on the fixtures?". It reads every IGC file in the SoaringSpot download, records ENL, MOP, RPM and CUR around take-off, launch, start, task and landing, and compares engine run detectors with the flight end that SeeYou published. Nothing here is production code.

```sh
cargo run --release -- $DATA/*/*/*/ > flights.jsonl
DATA=/path/to/soaringspot python3 summarise.py flights.jsonl [section...]
```

`DATA` is the SoaringSpot download (`<competition>/<class>/<date>/` with `task.json`, `results.csv` and `<prefix>_<CN>.igc.gz`). The Rust pass takes about 40 s for all files. Published times are converted with the `LCU::HPTZNTIMEZONE` offset that SeeYou writes into each file. The task is flown from the published start over the whole track up to the landing, so the result shows where SeeYou's flight end must have been. `summarise.py` prints every table below, and its `endfix` section rereads the IGC files.

## Data

25375 IGC files on 64 competitions. 24567 files have ENL, 5291 MOP, 528 RPM and 593 CUR (current, LXNAV FES bridge). 801 files have no engine channel at all, mostly FLARM, XCSoar and other app loggers. Files are grouped by rule set from the competition name: DAeC (EuregioCup, DM, DMJ, DSM, Jena Cup, 5.9k flights), Annex A (FAI championships, 15.9k) and national (Australia and South Africa, 4.1k).

Every flight with a task and a published result falls in one category:

| Category | Meaning | DAeC | Annex A | National |
|---|---|---|---|---|
| finisher | published finish, track finishes | 4649 | 11489 | 3152 |
| cut_finish | track finishes, published as outlanding | 206 | 339 | 81 |
| out_cut | racing outlanding, published distance below the distance at landing | 123 | 716 | 60 |
| out_nocut | racing outlanding, published distance equals the distance at landing | 464 | 746 | 267 |
| other | AAT outlandings, mismatches, no task | 524 | 2058 | 501 |

A finisher means SeeYou saw no engine run between the start and the finish. A `cut_finish` or `out_cut` flight ended early for some reason: engine, airspace or a scorer entry. On racing outlandings, the published distance pins SeeYou's flight end to one fix, because the best marking distance up to that fix reproduces the published distance within 0.0 to 0.5 m on DAeC days. The scale factor between the earth models is taken per day from the finishers.

## Detectors against the published results

A detector is "ENL or MOP at or above T for at least D seconds", with the flight end at the first fix of the run. Only the first run that ends after the start counts. TP means SeeYou ended the flight there (within 5 s on racing outlandings, or anywhere before the finish on `cut_finish`), FP means SeeYou flew on past the run, FN? means the flight was cut without such a run, which also covers airspace and scorer cuts.

| DAeC, ENL or MOP | TP | FP | FN? |
|---|---|---|---|
| 300 for 30 s | 252 | 62 | 72 |
| 500 for 0 s (one fix) | 246 | 790 | 55 |
| 500 for 10 s | 245 | 78 | 77 |
| **500 for 30 s** | **238** | **40** | **83** |
| 500 for 60 s | 234 | 19 | 85 |
| 700 for 30 s | 208 | 27 | 112 |
| **500 for 30 s, altitude gain > 0** | **232** | **3** | **93** |

The altitude gain gate compares the altitude at the first fix of the run with 60 s after the run reached its minimum duration. The 40 DAeC false positives at 500/30 are almost all descents (median -125 m): high-speed glides on noisy installations and MOP sensors on JS jets. Across all rule sets, true runs climb at a median 1.2 m/s (10th percentile 0.36), and false ones sink at a median 1.8 m/s. Turn rate does not separate them. With the gate, Annex A drops from 125 to 28 false positives while losing 6 of 303 true positives, and the national competitions from 122 to 11.

## Which fix SeeYou credits

On 62 DAeC racing outlandings with ENL or MOP of at least 300 within 5 s of SeeYou's flight end:

| Detector start | Exact fix | Within 5 s | Later | Not detected |
|---|---|---|---|---|
| first fix >= 500 of a run >= 500 for 30 s | 37 | 14 | 4 | 7 |
| first fix >= 500 of a run >= 500 for 10 s | 37 | 16 | 2 | 7 |
| first fix >= 400 of a run allowing dips up to 10 s, 30 s long, mean >= 450 | 35 | 19 | 1 | 7 |

- **The first fix at or above 500 is right most of the time.** It reproduces the issue #11 day (`euregiocup-2024/hasen/2024-05-11` MRL and WIM) and 37 of 62 DAeC flight ends to the fix.
- **SeeYou sometimes ends 1 to 3 s earlier, at the start of the rise.** For example `dm-offene-klasse-2025-lachen-speyerdorf-2025/open/2025-07-09` FU: ENL 4, 146, **486**, 450, 490, 960, with SeeYou's end at 486. In other flights a value of 361 before the end was not credited while 356 was elsewhere, so no single threshold explains the start fix. MOP runs are sometimes credited one fix after the first value above 500 (`dm-2022-zwickau/15-meter/2022-06-08` SP: 526, **784**). One second is 20 to 40 m of marking distance.
- **SeeYou detects runs that dip below 500.** `euregiocup-2025/hasen/2025-05-30` NF runs the engine at ENL 416 to 668 with frequent dips below 500, and SeeYou ended the flight 20 minutes before the first continuous 30 s at 500. `dm-zwickau-2026/standard/2026-05-27` EM and `dm-frauen-landau-ebenberg-2022/standardklasse/2022-05-25` 71 are similar. A dip-tolerant run removes the misses over 60 s.
- The 7 undetected cases have high ENL near SeeYou's end only by coincidence (noisy loggers whose ENL sits around 300 to 500 all flight). Their ends come from something else.
- Naviter's script API exposes a per-fix `EngineOn` computed inside SeeYou, and the changelog mentions revised engine detection algorithms. The algorithm itself is not public, so exact reproduction is not a realistic goal.

Annex A and national days reproduce much worse (21 of 80 and 12 of 29 exact). Many of their cut flights have unexplained distances (position-based marking, finish ring settings, scorer entries), so their oracle is weaker.

## Pure gliders, noise and launches

- **PureGlider.** SeeYou writes `LSEEYOU PureGlider=True` into 14528 files and `False` into 10847. With the gain-gated detector, 588 cuts were on `False` and 8 on `True`. All 8 `True` cuts are motor gliders with a wrong flag (Ventus 2CXM, DG-800, EB 29R, JS3, Diana 2). The 23 false positives on `True` are mostly pure glider types (LS 8, LS 4, LS 7, ASW 20, ASW 27B, LAK 19) with climbing noise, plus a few more misflagged motor gliders. 19 false positives are on `False`. So SeeYou does not trust the flag blindly, but whether it gates on it can't be told apart from noise in this data.
- **Noise floor by logger** (files flagged pure, free flight): LXNAV loggers sit at ENL 4 in cruise with 99th percentiles of 10 to 20. Naviter sits at 13, LX Navigation (`LXN`) at 39 with 99th percentiles up to 151, FLARM at 39. Triadis (14 of 39) and Cambridge (13 of 34, constant 996) hold ENL >= 500 for 30 s on pure gliders, so their ENL can't be used with the same threshold. LXNAV still has 209 of 10114 such flights, mostly descents.
- **Launches.** On files flagged pure, ENL >= 500 for 30 s during an aerotow occurs in 0.9% and for 10 s during a winch launch in 1.3%. Tug noise is not a real problem. Self-launches and engine-assisted takeoffs give 19%.
- **Before the start.** 869 finishers had a climbing engine run between release and the start, and SeeYou scored all of them normally. SeeYou ignores runs before the start. 12 finishers had a climbing run in progress at the published start. Without the climb filter there are 34, from stuck or noisy sensors (`38th-fai-world-gliding-championship-uvalde-garner-field-2024/18-meter` 5M with MOP high for hours on 13 days, `south-african-national-championships-2013/15-meter` 2R with ENL noise for hours) and start dives on noisy pure gliders.
- **Electric sustainers.** Of 84 flights with CUR >= 100 for 30 s, ENL >= 500 for 30 s accompanied it in 39, MOP in 61, neither in 11. FES needs MOP, and ENL alone misses most of them.
- **SoaringBegin/SoaringEnd** are B record indices. They are set in 72 files only, begin near the release (median 14 s before the launch end found here) and end near the landing (median 40 s before), or at the engine start in 2 files. They are SeeYou's own soaring bounds, not scorer decisions, and too rare to be an oracle.

## Recommendations

- **Threshold and duration.** ENL or MOP at least 500 for at least 30 s, with the flight end at the first fix at or above 500, plus an altitude gain gate. That reproduces SeeYou closely enough (51 of 62 DAeC ends within 5 s). Alternatives: no gate (13 times the false positives on DAeC), or 60 s (half the false positives, a few late detections).
- **Dips.** Allow short dips below the threshold within a run (about 10 s), so fluctuating sustainers like NF are not missed. Backtracking to the start of the rise does not improve the fix match.
- **Logger and glider dependence.** One threshold for both channels. Logger noise differs, but the gain gate removes most of it. Loggers with broken ENL scaling (Cambridge constant 996, Triadis) and stuck MOP sensors need a per-file "engine channel not usable" decision by the scorer instead of a per-manufacturer threshold. Don't gate on the glider: the PureGlider flag is wrong on motor gliders, and pure gliders' noise is handled by the gate.
- **What the competition setting controls.** The ENL threshold (default 500) and the minimum duration (default 30 s), applied to ENL and MOP, plus a separate current threshold where CUR exists. SeeYou's own setting is a "High ENL" warning level, not the detection.
- **Before the start.** Engine runs before the start are logged (info) but do not end the flight. A run in progress at a start crossing excludes that crossing, as in issue #24.

## Proposed fixtures

| Day | CN | Case |
|---|---|---|
| `euregiocup-2024/hasen/2024-05-11` | MRL, WIM | ENL cut at the first fix >= 500 (exact) |
| `dm-zwickau-2024/15-meter/2024-06-16` | HL | MOP only, ENL 4, exact |
| `dm-offene-klasse-2025-lachen-speyerdorf-2025/open/2025-07-09` | FU, 7, SKY | SeeYou ends 2 to 5 s before the first fix >= 500 |
| `dm-2022-zwickau/15-meter/2022-06-08` | SP | MOP, SeeYou ends one fix after the first >= 500 |
| `euregiocup-2025/hasen/2025-05-30` | NF | sustainer at ENL 416 to 668 with dips, missed by strict 500/30 |
| `dm-zwickau-2026/standard/2026-05-27` | EM | short burst then low engine noise, SeeYou cut at the burst |
| `jenacup-2026-jena-schongleina-2026/18-meter/2026-07-28` | TW | FES with ENL, MOP, RPM and CUR |
| `dm-18m-burg-feuerstein-burg-feuerstein-2025/18-meter/2025-06-22` | K8, DB | track finishes, published as outlanding after an engine run |
| `dm-18m-burg-feuerstein-burg-feuerstein-2025/18-meter/2025-06-19` | SB | engine run before the start, then a finish |
| `dm-2022-zwickau/15-meter/2022-06-08` | AT | engine run after the best distance, no effect |
| `dm-offene-klasse-2025-lachen-speyerdorf-2025/open/2025-07-04` | 8S | ENL 500 for 116 s in a descent, finisher (high-speed noise) |
| `dm2023bayreuth/18m/2023-06-03` | WJ | JS jet MOP noise around 300 to 600, finisher |
| `dmj-edpa-2023/club/2023-06-09` | Y4 | pure glider (LS 4b) with ENL median 510, finisher |
| `38th-fai-world-gliding-championship-uvalde-garner-field-2024/18-meter/2024-08-12` | 5M | stuck MOP for hours, finisher |

## Open

- SeeYou's exact start fix for a run (rise start against first fix above the threshold) is not explained.
- The 23 pure-glider climbing runs SeeYou ignored could mean that SeeYou skips files flagged pure, or that its algorithm rejects them. A flight flagged pure with a clear engine run that SeeYou ignored would settle it, and none was found.
- On racing outlandings, the gain gate only checks the first run after the start. A noise run that is gated out hides a later real run in this spike, which inflates FN? slightly.
- Annex A cut flights mostly don't match the best fix distance, so the Annex A oracle needs the marking distance rules first.
