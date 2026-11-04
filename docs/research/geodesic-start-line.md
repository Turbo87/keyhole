# Geodesic start line

Research for ticket #114, collected 2026-11-04. It measures how a geodesic start line, as Annex A defines it, differs from SeeYou's flat start line adopted in #17: in rule text, in matched SoaringSpot start times, in computation cost and in implementation effort.

## Sources

| Short name | Source | Version |
|---|---|---|
| Data set | SoaringSpot task pages, results and IGC files of the 20 FAI championships from 2021 to 2026 that publish IGC files, downloaded with soaringspot-downloader | Downloaded before 2026-11-04 |
| SWO | DAeC Bundeskommission Segelflug, "Wettbewerbsordnung für Segelflugmeisterschaften (SWO), Fachliche Bestimmungen", https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026.pdf, with Anlagen C and F | Ausgabe 2026 |
| Annex A | FAI Sporting Code Section 3 Annex A, https://www.fai.org/sites/default/files/document/file/SC3A_2025a.pdf | 2025a Edition, valid from 15 April 2026 |
| Tool | `research/geodesic-start-line/` on this branch, a Rust crate using geographiclib-rs 0.2 plus Python scripts | this branch |

The tool reads day directories of the data set. `points.py` reads the data set root from `SOARINGSPOT_DIR`.

## Rule text

**Annex A 2025a** defines lines as geodesics in Preliminary Remarks f), page 5, under "Geometric terms and standards":

- Lines: "Unless otherwise specified, the terms "Line", "Line Segment," "Course Line," "Leg," etc. shall be considered to be geodesics."
- Distance: "Unless otherwise specified, the terms "Distance", "Length", "Radius," "Separation," etc. shall be determined along the geodesic."
- Interpolation: "For the purpose of evaluating the crossing of lines and boundaries, straight linear interpolation between consecutive fixes shall be used."
- 7.4.3.1: "Start Line: A line, of defined length, perpendicular to the course to the first Turn Point, or the center of first Assigned Area." The Start Point is its midpoint.
- 7.4.3.3: a start without a crossing may be validated "if the Flight Log shows a valid fix within 500 metres of the Start Line after the opening of the Start".

Read literally, the Annex A Start Line is the geodesic perpendicular to the geodesic course at the Start Point. SeeYou's flat line departs from this text, so #17's statement that neither rule set prescribes the construction is wrong for Annex A.

**DAeC SWO 2026** and its Anlagen C and F say nothing about how the line is built. 7.3.1 to 7.3.3 give a line of set length, at most 20 km, crossed for the start time. 6.2.1 measures task distance from the line's midpoint, 14.3 sets WGS84 for distances, and Anlage C 4.7.3 announces the line and direction per class with the task. SWO 1.4 names "FAI Sporting Code, General Section und Section 3, Kapitel 5, Annex A" as the last source for "alle nicht ausformulierten Regeln", and 13.1.1 falls back to the current Annex A for scoring.

## Method

- **Flat line.** The #17 construction: a flat map centred on the start point, scaled by the earth model's radii of curvature at its latitude, with the line perpendicular to the geodesic course to the first point.
- **Geodesic line.** A fix lies in front of the line when `cos(Δaz) ≥ 0`, where `Δaz` is the geodesic azimuth from the start point to the fix minus the course. That boundary is exactly the geodesic perpendicular through the start point. The crossing fraction is linear in `s·cos(Δaz)`, where `s` is the geodesic distance from the start point.
- **Days.** 579 class-days with a start line. Cancelled days and the 23 start-cylinder days of the 24th EGC are left out, and Lake Keepit 2020 has no IGC files.
- **Earth model per day.** Both models were run on every day, and the one matching more flat starts was kept. The leg-length heuristic agrees on 535 of 579 days.
- **Matching.** Each published start was matched to a flat crossing within 2 s, then compared with the nearest geodesic crossing. 14 sphere and 54 WGS84 starts had no flat crossing within 2 s and are excluded.
- **Check.** On `euregiocup-2024/hasen/2024-05-11` the tool reproduces #17: the flat line matches 29 of 30 starts, and the geodesic line leaves 11 starts 1 s late.

## Matched start times

| | Sphere | WGS84 |
|---|---|---|
| Class-days | 305 | 274 |
| Matched starts | 7308 | 6132 |
| Flat line matches SeeYou | 7234 (98.99%) | 6025 (98.26%) |
| Geodesic line matches SeeYou | 7039 (96.32%) | 5841 (95.25%) |
| Starts that change | 197 | 186 |
| Flat matches, geodesic does not | 196 | 185 |
| Geodesic matches, flat does not | 1 | 1 |
| Class-days with a changed start | 116 | 103 |

- Every changed start moves by exactly 1 s, in either direction. The unrounded difference has a median of 0.012 to 0.018 s, a 99th percentile of 0.15 to 0.21 s and a maximum of 0.96 s.
- The share of changed starts grows with the distance from the line's centre: 0.4% within 2.5 km, 3.5% at 2.5 to 5 km, 6.9% at 5 to 7.5 km and 18.8% beyond 7.5 km.
- Given its own best-fit earth model per day, the geodesic line still matches only 96.59% (sphere) and 95.46% (WGS84).
- Finishes are unaffected on these days, because they finish in rings.
- Starts that differ from SeeYou in total: 181 with the flat line (74 sphere, 107 WGS84) and 560 with the geodesic line (269 sphere, 291 WGS84).

**Points and rank, estimated.** 264 of the 383 changed starts belong to finishers whose points depend on the start. Their points change estimated from each day's published points-versus-speed slope has a median of 0.12 and a maximum of 0.22 points. About 31 published integer points would change by 1, and about 6 day ranks would swap. In 15 cases the changed start belongs to the day's fastest finisher, which moves `Vo` for every finisher. These are estimates, because unrounded points are not published.

## Geometric difference between the lines

The largest along-course offset between the geodesic perpendicular and the flat line, over all courses, computed with WGS84 `direct()`:

| Latitude | 3 km | 5 km | 7.5 km | 10 km |
|---|---|---|---|---|
| 30° | 0.44 m | 1.24 m | 2.78 m | 4.95 m |
| 45° | 0.77 m | 2.14 m | 4.81 m | 8.55 m |
| 50° | 0.92 m | 2.54 m | 5.73 m | 10.18 m |
| 55° | 1.10 m | 3.05 m | 6.86 m | 12.19 m |

The offset is roughly `y²·tan(φ)/(2R)` at distance `y` from the centre, zero for east–west courses and largest for north–south and diagonal ones. At start speeds of 30 to 50 m/s, 10 m is about 0.2 to 0.3 s.

## Computation cost

Measured on an Apple M2 Pro, release build. The class-day is `23rd-fai-european-gliding-championships-bekescsaba-2025/18-meter/2025-07-30` (35 flights, median 15.7k fixes). The whole data set is 13,745 IGC files with 207.5M fixes.

| | Flat | Geodesic, sphere | Geodesic, WGS84 | Geodesic with flat prefilter (WGS84 / sphere) |
|---|---|---|---|---|
| Side test per fix | 0.86 ns | 41 to 43 ns | 382 to 406 ns | 5.5 to 6.4 ns / 2.0 to 2.2 ns |
| Per flight, class-day median | 0.020 ms | 0.67 ms | 6.0 ms | 0.078 ms / 0.030 ms |
| Longest flight, 31.6k fixes | 0.04 ms | 1.39 ms | 13.1 ms | 0.26 ms / 0.075 ms |
| Whole data set | 0.39 s | 9.5 s | 84 s | 1.3 s / 0.46 s |

- Nearly all of the geodesic cost is one `inverse()` per fix. The sphere uses a hand-written haversine, while `Geodesic::new(6_371_000.0, 0.0)` would run at WGS84 speed.
- The prefilter runs the geodesic test only on segments where the flat side changes or an endpoint lies within 200 m of the flat line, about 1.2% of fixes. It gives identical crossings to the full geodesic test on all 13,745 flights under both models.
- For comparison, IGC parsing costs 427 ns per fix, the AAT credited-point search has a median of 1.2 ms per flight, and G-record validation about 5 s per flight.

## Crossing interpolation

The exact intersection of the fix-to-fix geodesic with the geodesic start line, by Illinois regula falsi with `direct()` and `inverse()`, differs from the linear `s·cos(Δaz)` fraction by at most 7.1e-6 s (WGS84) and 7.7e-6 s (sphere) over 62.4k crossings each. No rounded start time changes. It costs about 1.6 µs per crossing on WGS84.

## Distances to the line

The half-width check and the 500 m tolerance of Annex A 7.4.3.3 need a fix's distance along and across the geodesic line. The exact distance from a point to a geodesic is Karney's iterative intercept problem. `shortcut.rs` compares it with the approximations `s·cos(Δaz)` across and `s·|sin(Δaz)|` along. Test points were placed at known distances along the line and perpendicular to it, at latitudes 30° to 55°, courses in 5° steps and offsets up to 1000 m.

| Distance along the line | Largest error across | Largest error along |
|---|---|---|
| 2.5 km | < 0.1 mm | < 0.1 mm |
| 5 km | 0.1 mm | < 0.1 mm |
| 10 km | 0.4 mm | 0.1 mm |
| 20 km | 1.6 mm | 0.2 mm |

WGS84 and the 6371 km sphere give the same errors, independent of latitude. Unlike the flat line, the approximation starts from the exact geodesic distance and azimuth, so only the final conversion is approximate.

## Implementation effort

Both constructions need about 30 to 40 lines of production code and only geographiclib-rs. The flat line needs an explicit longitude wrap at the antimeridian and degenerates near the poles. The geodesic line handles both, and its side test only flips near the antipode of the start point. Testing the geodesic line needs reference values from GeographicLib on both earth models, while flat-line tests can be computed by hand. These line counts are estimates, not measured implementations.
