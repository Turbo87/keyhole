# PROTOTYPE: score one SoaringSpot day

Throwaway spike for the question "Can we reproduce one SoaringSpot day's scores?". It scores `euregiocup-2024/hasen/2024-05-11` (DAeC SWO script V9.06, local `Dm = 50km`, keyhole turnpoints, handicaps on the 100 scale) and diffs every row against SoaringSpot's `results.csv`. Nothing here is production code.

```sh
cargo run --release -- <soaringspot-downloader output>/euregiocup-2024/hasen/2024-05-11 [igc|csv]
```

`csv` feeds the published distances and times into the day formula. `igc` (the default) derives them from the IGC files first. Scorer inputs that no file carries (launch status, manual results, penalties) are hard-coded in `INPUTS` in `src/main.rs`.

Environment variables used to test hypotheses:

| Variable | Values | Effect |
|---|---|---|
| `TIME_RULE` | `against-pilot` (default), `fix`, `round` | Floor the interpolated start and ceil the interpolated finish, or take the last fix before the line and the first fix in the ring, or round both interpolated crossings |
| `START_ROT_DEG` | degrees | Rotates the start line |
| `START_MODEL` | `sphere` | Tests the start line on a 6371 km sphere |
| `ENGINE_THRESHOLD` | ENL/MOP value, default 500 | Engine run threshold, held for 30 s |
| `DEBUG` | any | Prints every start line crossing |

## Result

The day formula fed from `results.csv` reproduces all 36 rows and every published day parameter (`N`, `n1`, `n2`, `Do`, `Vo`, `Pm`, `F`, `Fcr`, `Pvm`).

From the 31 IGC files plus scorer inputs, the spike reproduces all turnpoint sequences, all 21 finish times, all 8 outlanding distances and `N`, `n1`, `n2` and `Do`. 11 start times are 1 s late. One of them is SP's, which sets `Vo`, so 8 rows score one point off. With `TIME_RULE=fix`, SP's start happens to match and 35 of 36 rows score the exact points.

## Findings

- Finisher distance is the leg sum minus the finish ring radius when `oz_reduce` is set (SWO 6.2.1). WGS84 geodesics give 284.61789 km against SoaringSpot's 284.61775 km. The 0.14 m changes the second decimal of LD's speed.
- `oz_angle12` in `task.json` is the inner bisector. The keyhole sector points the opposite way.
- The finish time is the interpolated ring entry rounded up to the next whole second. On 1 s loggers this equals the first fix inside the ring. The download holds 1580 finishers whose loggers record every 2 to 12 s, mostly every 2 s, and 12 of them on EuregioCup 2023 and 2024 racing days (`hasen/2024-05-09` SP, `igel/2024-05-09` TH, `igel/2023-05-17` to `2023-05-19` BA, E4, N4 and i) all match this rule. The first fix inside the ring misses 3 of them, and rounding to the nearest second misses most.
- Fixes with a repeated or decreasing timestamp have to be dropped. VF's logger writes 15:58:13 twice at the ring entry, which shifts the interpolated finish by a second. Keyhole should report a finding instead of dropping them silently, because it changes a scored time.
- The start time does not reproduce. The interpolated crossing rounded down matches L2 (2 s logger) and 11 of 12 slow-logger starts on the other days, so both crossing times round against the pilot. With the geodesic perpendicular to the first leg as the line, 11 of 29 starts on this day are still 1 s late, most of them far out on the line, so SeeYou's line geometry differs slightly. A line rotated by 0.045° fits all but 2 starts. That is curve fitting, not a model. A spherical line does not fit either.
- An ENL or MOP value of 500 or more held for 30 s ends the flight. SeeYou still credits the first fix above the threshold, which closes a 20 m gap on MRL. Four of eight outlanders ended by engine, and without engine detection J2 would get 38.24 km instead of 31.96 km.
- `N = 34` cannot be derived from `results.csv`. 35 rows are not DNS, so one DNF row did not launch. Launch status is a scorer input.
- MW, ME and V have published start times but no published IGC file. The oracle has to take them as scorer-entered results.
- The finish ring penalties (YB 5, NW 6, EJ 8) do not order by GPS finish altitude (615, 644, 632 m). They are manual inputs here, and deriving them needs the day's minimum finish altitude and the altitude reference.
- Dividing handicaps by the lowest handicap rounded down to a power of ten (100) and rounding half up reproduces every score.
- `igc` 0.3 parsed all files, including the 2 s logger and the caret CN. ENL and MOP columns come from the I record, parsed by hand. Precomputing distance and azimuth from every task point to every fix makes evaluating every start crossing cheap. The whole day runs in about 1 s.
