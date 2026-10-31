# PROTOTYPE: start selection among candidate line starts

Throwaway spike for the question "How does Keyhole select the best start among candidate line starts, and does it reproduce SeeYou on the fixtures?". It finds every start line crossing in each published IGC file, works out what the task would give from each crossing, and checks which crossing SeeYou credited. Nothing here is production code.

```sh
DATA=/path/to/data python3 fetch.py <competition> [class|-] [date]
cargo run --release -- /path/to/data/<competition>/<class>/<date>... > flights.jsonl
python3 summarise.py flights.jsonl [--list <category>]
```

`fetch.py` writes `task.json`, `rows.json` (the daily results table with `data-value` precision, IGC links and remarks) and `<CN>.igc.gz` per day. It does not use soaringspot-downloader. `EARTH=sphere` builds the start line on the 6371 km sphere, and `UTC_OFFSET` (default 7200) converts published local times.

## Data

2399 flights on 81 official class-days with published IGC files:

| Competitions | Rule set | Flights |
|---|---|---|
| `euregiocup-2023` to `euregiocup-2026`, `dm-zwickau-2024`, `dm-18m-burg-feuerstein-burg-feuerstein-2025`, `dm-offene-klasse-2025-lachen-speyerdorf-2025`, `dmc2026-burg-feuerstein` | DAeC SWO | 1074 |
| `39th-fai-world-gliding-championships-tabor-2025` (sphere) | Annex A | 760 |
| `23rd-fai-european-gliding-championships-bekescsaba-2025` (WGS84) | Annex A | 565 |

The start line is the flat line from ticket #17. Every published start but one (a DNS row) matches a crossing within 1 s, so the credited crossing is identified in 2398 of 2399 flights.

## How a crossing is evaluated

- A crossing goes from behind to in front of the line, within the half width plus the 500 m tolerance band. Crossings before `no_start` are dropped when it is set. It is `00:00:00` on every DAeC day here.
- A crossing during an engine run of at least 30 s is not a candidate. Each crossing gets its own flight end, the first landing or engine run after it, so starts after a self-launch count. Many airfields lie under the start line, so ground roll and self-launch crossings are common.
- From each candidate, the task is flown forward: turnpoints or areas in order, then the finish ring. The outcome is a finish with the scored time (`max(T, Tmin)` on AATs), or the marking distance and the number of points reached.

## Result

| What SeeYou credited | Flights |
|---|---|
| The only candidate | 485 |
| The single best candidate (fastest, or longest distance) | 1120 |
| The latest of several equally good candidates | 303 |
| The best candidate, where later crossings lead nowhere (crossings on the way home, after the task) | 483 |
| An earlier one of several equally good candidates | 4 |
| A worse candidate | 3 |

- **SeeYou ranks by the pilot's own performance.** Finishers by scored time, outlanders by distance. It never picked a slower start on a DAeC day.
- **Ties go to the latest crossing.** That covers 303 of 307 ties: outlanders, whose distance doesn't depend on the start, and AAT finishers under `Tmin`. The 4 exceptions are outlanders on EuregioCup days (`euregiocup-2024/igel/2024-05-10` i and FR, `euregiocup-2023/hasen/2023-05-18` 3T, and one on Tábor). Their points don't depend on the start, so this only changes the published start time. The cause is unknown, possibly a scorer's manual choice.
- **Start penalties are ignored on DAeC days.** SeeYou picks the fastest start, and the scorer enters penalties by hand. In 3 of about 70 penalised DAeC flights, a slightly slower start without the penalty would have scored more, which SWO 7.3.8 asks for:
  - `dm-18m-burg-feuerstein-burg-feuerstein-2025/18-meter/2025-06-22` J3: 8 points for start altitude, while crossing 7 is 45 m lower and about 4 points slower.
  - `dmc2026-burg-feuerstein/club/2026-06-25` LG: 3 points for start speed (162 km/h). Crossings 2 and 3 give the same scored time (`T < Tmin`) at 103 and 102 km/h.
  - `dm-offene-klasse-2025-lachen-speyerdorf-2025/open/2025-07-03` VFR: 15 points for start altitude, while crossing 1 is 54 m lower and about 13 points slower.
- **PEV windows matter on Tábor.** The 3 "worse" picks and one AAT case are faster crossings 6 to 44 s past the PEV window end (8+5 min on early days, 10+5 min later, inferred from the starts). SeeYou took the in-window crossing instead. Out-of-window starts were still credited when no in-window candidate existed. On the DAeC PEV days (`dm-18m-burg-feuerstein-burg-feuerstein-2025`), SeeYou ignored PEV and the scorer penalised (a7 3 and 7 points, 3E and LC 60, I "Kein PEV" 60).
- **No rescoring is needed.** A pilot's own points rise with their own speed or distance. The only exception is the day winner changing `Vo`, `To` or `n2` through their own start, which none of these flights shows.

## Timing caveat

On Tábor, 90 of 760 matched starts are 1 s off, more than the 1% that ticket #17 found on sphere days. The crossing is still identified unambiguously. This spike doesn't investigate it further.
