# PROTOTYPE: AAT credited point search with a convex hull

Throwaway spike for part of the question "How does Keyhole score an assigned area task, and does it reproduce SeeYou on AAT fixture days?". It checks whether a convex hull of each area's fixes can replace the exhaustive search for the credited points, and whether the result reproduces SoaringSpot's finisher distances. Nothing here is production code.

```sh
BRUTE=1 cargo run --release -- <soaringspot-downloader output>/<competition>/<class>/<date>... > flights.jsonl
```

Finishers on official AAT days are scored by default. The window is the published start to the published finish, with the UTC offset inferred per day from the start point. Every flight is scored on WGS84 and on the 6371 km FAI sphere.

| Variable | Effect |
|---|---|
| `BRUTE` | Also runs the exhaustive search over every in-zone fix |
| `SAMPLE=k` | Keeps only fixes on multiples of `k` seconds |
| `ZONE_EARTH` | `sphere` or `wgs84`, tests zones on another earth model than distances |
| `ZONE_MARGIN` | Widens the area radius by this many metres |
| `FLIGHT_END=log` | Ends outlanders' flights at the end of the log instead of the first landing or engine run |
| `OUTLANDERS` | Scores the outlanders instead of the finishers, with the flight end from the start selection prototype |

## Method

The credited points maximise the distance from the start point through one fix per area, in time order, to the finish point minus the finish radius when `oz_reduce` is set. The exhaustive search is a dynamic program over all in-zone fixes, which costs the product of the candidate counts of consecutive areas.

The pruned search runs the same dynamic program over the convex hull vertices of each visit, a run of consecutive in-zone fixes. With the neighbouring credited points fixed, the leg sum through a point is a convex function of its position, so its maximum over a set of fixes lies on a hull vertex. A whole visit lies between the neighbouring credited times unless it shares a fix with an adjacent area. Such visits would keep all their fixes, but none occurred.

The hull is built in raw (lon, lat). Every equirectangular flat map, cheap-ruler on WGS84 as well as the same map on the FAI sphere, is a per-axis scaling of (lon, lat), and hull vertices are invariant under linear maps. The candidate set is therefore the same for both earth models, and only the distances measured between candidates depend on the earth model. The convexity argument holds exactly only on a flat map, so the scored geodesic optimum was checked against the exhaustive search.

## Result

The download holds 7908 finishers with IGC files on 415 official AAT days. A finisher has a median of 3700 in-zone fixes, and the hulls keep a median of 131 of them (243 at p90, 1554 at most). No visit shared a fix with an adjacent area.

On 52 sampled days, the hull search and the exhaustive search agree to 1e-6 m on all 1943 flight and earth model pairs, so the flat-map convexity argument held for geodesic distances on every sampled flight. The hull search takes a median of 1.2 ms (10 ms at p99) against 0.88 s (5.8 s at p99) for the exhaustive search. The per-flight speedup has a median of 550 times, from 59 times at p10 to 3500 times at p90, and the total search time drops by a factor of 720. Times are wall-clock times of the search alone, measured while flights ran in parallel.

Against SoaringSpot:

- WGS84 competitions from 2015 to 2023 match within 1 m on almost every flight, for example `dm2023bayreuth` 247 of 252, `jegc2021`, `wgc2021-club-std-15m-montlucon-gueret-2021`, `dm-2022-zwickau` and the Australian and South African nationals. SeeYou credited the exact optimum over the logged fixes.
- WGS84 competitions from 2024 on (`dm-zwickau-2024` and `-2026`, `jwgc2024`, `wgc2026`, `23rd-fai-european-gliding-championships-bekescsaba-2025`) come out a median of 8 to 17 m longer than published, with a tail where SeeYou is up to 50 m longer. Subsampling the fixes or measuring on flat maps does not explain it. On `dm-zwickau-2026`, 13 flights are more than 5 m shorter than published. For 5 of them, a fix 6 to 14 m beyond the outer radius on WGS84, and inside it on the FAI sphere, reproduces the published distance within 2.3 m. Widening the zones changes nothing for 4 others, which stay 38 to 67 m short, and overshoots on the rest. Wider zones do not explain the median gap either.
- Sphere competitions come out 36 ppm longer than published up to 2023, for example 14.5 m on 421 km at Szeged, and 60 to 86 ppm longer from 2024. The proportional part points to a different sphere radius or distance formula in SeeYou.
- `dmj-edpa-2023` and `jwgc2026` have a finish ring with `oz_move` set and `oz_reduce` unset, and the published distances are still about the 5 km radius shorter. The `LSEEYOU OZ=` records in the published IGC files agree with `task.json`: `Move=1` without `Reduce` on these days, and `Reduce=1` on the two `jwgc2026` days that match.
- `24th-fai-egc` uses a cylinder start with a credited start point, and the South African nationals 2012 and 2013 find no fix in the areas. This spike does not handle either.

Findings beyond the search:

- `oz_angle12` is the inner bisector on fixed AAT sectors as well, the same as on the symmetric keyhole.
- The second arc with `A2=180` on the Szeged sectors is a full 25 km cylinder unioned with the 35 km semicircle, not an inner radius.

## Minimum task time

The published speed is the distance divided by `max(T, Tmin)` for 8330 of 8337 finishers with a published speed, 960 of them under `Tmin`. The other seven are under `Tmin` and carry speeds with two decimals, such as 130.00 km/h, so they look like manually entered results.

## Outlanders

With `OUTLANDERS=1`, the prototype scores the 1333 outlanders with a published distance. The marking distance runs through credited points in the areas achieved in order, to the point of the next area or the finish nearest to the outlanding position, less the distance from the outlanding position to that point, floored at zero on the last leg. Three choices of outlanding position were compared:

| Outlanding position | Within 1 m | Within 30 m |
|---|---|---|
| Flight end (landing, engine run or end of log) | 15 | 140 |
| Flight end, with the next area's centre instead of its nearest point | 9 | 90 |
| Best fix after the last credited point, chosen jointly with the credited points | 90 | 658 |

SeeYou uses the best fix, which matches the virtual outlanding rule (SWO 7.8.3, Annex A 7.7.2) applied to every outlanding. Choosing the last credited point first and the best fix afterwards fits worse. The hull pruning still applies because the last leg is convex in the last credited point once the outlanding position is fixed.

On WGS84 days up to 2023, 72 of 313 outlanders within 1 km match within 1 m and 136 within 5 m, with the middle half from -1.5 to +19 m. The rest of the residual is not explained yet. Most outlanders that are more than 1 km longer than published carry a remark for an airspace infringement, leaving the competition area or a low finish, which are scorer inputs. Of the 24 outlanders that are more than 1 km shorter than published, 7 come within about 100 m with `FLIGHT_END=log`, which ignores landings and engine runs, so SeeYou ended those flights later. For 4 more, the end of the log gives 19 to 43 km too much, so SeeYou's flight end lies between the two, and 1 stays 0.6 km short. 8 are on `24th-fai-egc`, whose cylinder start with a credited start point this prototype does not model. 4 stay short with the whole log and are unexplained.
