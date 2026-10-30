# PROTOTYPE: score one SoaringSpot day

Throwaway spike for the question "Can we reproduce one SoaringSpot day's scores?". It scores `euregiocup-2024/hasen/2024-05-11` (DAeC SWO script V9.06, local `Dm = 50km`, keyhole turnpoints, handicaps on the 100 scale) and diffs every row against SoaringSpot's `results.csv`. Nothing here is production code.

```sh
cargo run --release -- <soaringspot-downloader output>/euregiocup-2024/hasen/2024-05-11 [igc|csv]
```

`csv` feeds the published distances and times into the day formula. `igc` (the default) derives them from the IGC files first. Scorer inputs that no file carries (launch status, manual results, penalties) are hard-coded in `INPUTS` in `src/main.rs`.

Environment variables used to test hypotheses:

| Variable | Values | Effect |
|---|---|---|
| `TIME_RULE` | `fix` (default), `floor`, `round` | Start at the last fix before the line and finish at the first fix in the ring, or floor/ceil or round the interpolated crossings |
| `START_ROT_DEG` | degrees | Rotates the start line |
| `START_MODEL` | `sphere` | Tests the start line on a 6371 km sphere |
| `ENGINE_THRESHOLD` | ENL/MOP value, default 500 | Engine run threshold, held for 30 s |
| `DEBUG` | any | Prints every start line crossing |

## Result

The day formula fed from `results.csv` reproduces all 36 rows and every published day parameter (`N`, `n1`, `n2`, `Do`, `Vo`, `Pm`, `F`, `Fcr`, `Pvm`).

From the 31 IGC files plus scorer inputs, the spike reproduces all turnpoint sequences, all 21 finish times, all 8 outlanding distances and all day parameters. 35 of 36 rows score the exact points. 11 start times are 1 s off, which costs VF one point.

## Findings

- Finisher distance is the leg sum minus the finish ring radius when `oz_reduce` is set (SWO 6.2.1). WGS84 geodesics give 284.61789 km against SoaringSpot's 284.61775 km. The 0.14 m changes the second decimal of LD's speed.
- `oz_angle12` in `task.json` is the inner bisector. The keyhole sector points the opposite way.
- The finish time is the time of the first fix inside the ring, without interpolation.
- The start time does not reproduce. Using the geodesic perpendicular to the first leg and the last fix before the line, 18 of 29 starts match and 10 are 1 s late. L2, which logs every 2 s, starts 1 s early, so SeeYou interpolates. A floored interpolation with the line rotated by 0.045° fits all but 2 starts. That is curve fitting, not a model. The rotated or spherical line alone does not fit either.
- An ENL or MOP value of 500 or more held for 30 s ends the flight. SeeYou still credits the first fix above the threshold, which closes a 20 m gap on MRL. Four of eight outlanders ended by engine, and without engine detection J2 would get 38.24 km instead of 31.96 km.
- `N = 34` cannot be derived from `results.csv`. 35 rows are not DNS, so one DNF row did not launch. Launch status is a scorer input.
- MW, ME and V have published start times but no published IGC file. The oracle has to take them as scorer-entered results.
- The finish ring penalties (YB 5, NW 6, EJ 8) do not order by GPS finish altitude (615, 644, 632 m). They are manual inputs here, and deriving them needs the day's minimum finish altitude and the altitude reference.
- Dividing handicaps by the lowest handicap rounded down to a power of ten (100) and rounding half up reproduces every score.
- `igc` 0.3 parsed all files, including the 2 s logger and the caret CN. ENL and MOP columns come from the I record, parsed by hand. Precomputing distance and azimuth from every task point to every fix makes evaluating every start crossing cheap. The whole day runs in about 1 s.
