# SeeYou's AAT distance since 2024

Research for [What changed in SeeYou's AAT distance around 2024, and which rule reproduces it?](https://github.com/Turbo87/keyhole/issues/68). It follows the AAT prototype on [`prototype/aat-credited-points`](https://github.com/Turbo87/keyhole/tree/prototype/aat-credited-points/prototypes/aat-credited-points), which reproduces SoaringSpot's finisher distances within 1 m on WGS84 days up to 2023 but not on FAI sphere days or on days from 2024 on.

Facts were checked on 2026-11-02 against the documents listed below and the local SoaringSpot download. The experiments use a copy of the prototype at `f39c3f1` in [`prototypes/aat-credited-points`](../../prototypes/aat-credited-points) with four extra variables, `SPHERE_RADIUS`, `THIN`, `THIN_M` and `CROSSINGS`, described in its README. Counts below exclude `dmj-edpa-2023`, `egc2023`, `24th-fai-egc` and `jwgc2026`, whose finish or start handling the prototype does not reproduce for other reasons.

## Sources

| Short name | Document | Edition | URL |
|---|---|---|---|
| GS 2024 | FAI Sporting Code General Section | Effective 1 January 2024 | https://www.fai.org/sites/default/files/documents/fai_sporting_code_general_section_2024_v1_0.pdf |
| GS 2025 | FAI Sporting Code General Section | Effective 1 January 2025 | https://www.fai.org/sites/default/files/documents/fai_sporting_code_general_section_2025_v1_0.pdf |
| SC3 2024 | FAI Sporting Code Section 3 | Valid from 1 October 2024 | https://www.fai.org/sites/default/files/sc3_2024.pdf |
| Annex A 2023 | Section 3 Annex A | Valid from 1 September 2023 | https://www.fai.org/sites/default/files/sc3a_2023.pdf |
| Annex A 2024 | Section 3 Annex A | Valid from 1 October 2024 | https://www.fai.org/sites/default/files/sc3a_2024.pdf |
| Annex A 2025 | Section 3 Annex A | Valid from 11 November 2025 | https://www.fai.org/sites/default/files/sc3a_2025.pdf |
| Annex A 2025a | Section 3 Annex A | Valid from 15 April 2026 | https://www.fai.org/sites/default/files/document/file/SC3A_2025a.pdf |
| IGC proposal | "Change of Earth Model for scoring", Year-1 proposal | Last amendment 14 January 2024 | https://www-2025.fai.org/sites/default/files/6_2_3_2024_y1_igc_sc3a_-_change_of_earth_model_for_scoring.pdf |
| IGC 2025 minutes | IGC Plenary minutes, Celje, 7 and 8 March 2025 | Final version 10 April 2025 | https://www.fai.org/sites/default/files/documents/igc_2025_plenary_meeting_-_minutes_final_draft.pdf |
| SeeYou changelog | Naviter "SeeYou change log" | Read 2026-11-02, undated entries | https://naviter.com/seeyou-makes-you-a-better-pilot/seeyou-change-log/ |
| SeeYou help | SeeYou Help 6.03 | © 1995 to 2014 | https://downloads.naviter.com/seeyou/seeyou.pdf |
| CUC help | SeeYou Competition Help | Updated 2/1/2012 | http://download.naviter.com/docs/cucompetition.pdf |
| Naviter KB | "Measure distance on great circle" | Updated 2 February 2026 | https://kb.naviter.com/en/kb/measure-distance-on-great-circle/ |
| CUP spec | Naviter `CUP_file_format.md` | Last changed 2025-10-14 | https://github.com/naviter/seeyou_file_formats/blob/main/CUP_file_format.md |

The changelog has no reliable dates. Wayback Machine snapshots of the changelog bracket the versions: v10.51 is the newest entry on 2023-02-02, v10.60 the newest on 2023-09-21, 2024-04-25 and 2024-07-13, and no later snapshot exists.

## Summary

Two separate effects explain the prototype's gaps.

On FAI sphere days SeeYou measures on a sphere of radius 6 370 775 m, 35.3 ppm smaller than the 6371 km FAI sphere. This holds for task legs and for AAT finishers from 2022 to 2025. With that radius, 949 of 962 sphere finishers from 2022 and 2023 match within 1 m. No FAI document defines that radius. The 36 ppm gap up to 2023 is therefore the radius alone, and the larger gap from 2024 is the radius plus the same change that affects WGS84 days.

From May 2024 on, SeeYou no longer credits the exact optimum over the logged fixes on most days. The change is independent of the earth model, began between 19 January and 11 May 2024, and mostly affects 1 s logs. Where all credited points lie inside the areas, SeeYou comes out shorter than the optimum. Where an optimal credited point lies at the outer radius, SeeYou is often longer. No tested rule reproduces it: thinning the fixes by time or distance, crediting boundary crossings, or testing zones on the sphere. SoaringSpot does not publish the credited points, so the rule cannot be read off the results.

No source documents the change. The only AAT algorithm entries in the SeeYou changelog are in v10.60, which shipped between February and September 2023, and in later undated versions. No Annex A edition changes the AAT credited fix, the zone achievement rules or the earth model in 2024.

## Earth model

### Rules

GS 2024 defines the "FAI Sphere" as having "a radius of 6371km exactly" and says "If not otherwise specified by the ASC, the earth model to be used for geometric calculations shall be the WGS84 ellipsoid. If a sphere is specified, it shall be the 'FAI Sphere.'" (Definitions, 8.2.2). GS 2025 keeps both. SC3 2024 measures badge and record distances on WGS84 (1.3.7).

Annex A 2023 and 2024 state in Preliminary Remarks (f): "The Earth Model to be used for all calculations specified in this Annex shall be a sphere of radius 6371.0 kilometers." Annex A 2025 and 2025a drop the row, so Annex A events fall back to WGS84 under GS 8.2.2. The IGC proposal of January 2024 asked for WGS84 from 1 April 2024 and argued that "The errors are measurable, particularly for long geodesic lines such as Assigned Area Task (AAT) Area Boundaries". It also reports that Naviter told GFAC "calculations can be carried out with equal accuracy on either a spherical Earth Model or the WGS84 Ellipsoid". The IGC 2025 minutes record the Year-2 proposal as "approved unanimously" (6.1.1).

### SeeYou

SeeYou help says "You can choose to measure distance on WGS-84 Ellipsoid or FAI Sphere". The Naviter KB still describes the same user-selectable option. Neither gives the sphere radius.

### Which competitions used which model

The `distance` field of each task point in `task.json` holds the leg into that point. Comparing it with the leg between the published coordinates sorts every competition into one model:

- WGS84 competitions match the WGS84 geodesic within about 1 ppm.
- Ten FAI championships from 2022 to 2025 match neither model: WGC Szeged 2022, Narromine 2023, Uvalde 2024 and Tabor 2025, WWGC 2022 and 2025, EGC Tabor 2024, JWGC Tabor 2022, and JEGC 2023 and Prievidza 2025. Their 1495 legs are 35.3 ppm shorter than on the 6371 km sphere, with no dependence on latitude or leg direction. A least squares fit gives a radius between 6 370 773 m and 6 370 775 m for eight of them, 6 370 770 m for Narromine 2023 and 6 370 779 m for Prievidza 2025. The remaining residual is a median of 0.01 m to 0.19 m per leg, the size of coordinate rounding.
- WGC 2026 and the other Annex A events of 2026 match WGS84, which fits Annex A 2025.
- WGC 2021, EGC 2022, the FAI championship in Pociunai 2022, WWGC Garray 2023 and EGC 2023 also match WGS84, although Annex A then required the sphere.

Scoring the AAT finishers with `SPHERE_RADIUS=6370775` gives:

| Sphere days | Finishers | Within 1 m | Median optimum minus published |
|---|---|---|---|
| 2022 and 2023 | 962 | 949 | 0.0 m |
| 2024 and 2025 | 1478 | 192 | 6 to 20 m per competition |

The origin of 6 370 775 m is unknown. It equals 6371 km times 0.99996468 and is not one of the usual earth radii.

## Version records

No published file records the SeeYou version.

- The IGC files carry the `LSEEYOU` L-records `OZ=`, `TSK,`, `PureGlider=`, `SoaringBegin=` and `SoaringEnd=`, plus `LCU::` records. None holds a version. The `TSK,` record copies the day's task options, such as `WpDis=False,NearDis=0.0km`.
- `results.html` and `task.html` show only a "Task version" such as "Start gate Open 13:18 (v3)", which counts task edits.
- `results.csv` and `task.json` have no version field.
- Live SoaringSpot daily pages link the IGC files and "Open in SeeYou" downloads but no credited points or flight analysis.

## The change from 2024

### When

The change begins between two consecutive days of one competition. Up to Benalla on 19 January 2024, 98 % of finishers match. At the Euregio Cup 2024, 26 of 27 finishers match on 10 May (class Hasen) and 1 of 12 on 11 May (class Igel). After that, most days show the change, but six class days still match in full:

- Lake Keepit 2024 Open class, 25 and 27 November 2024
- JEGC Prievidza 2025 Standard class, 6, 11 and 12 July 2025, while the Club class on the same days does not match
- Euregio Cup 2026 class Hasen, 16 May 2026

Neither handicapping nor the task options in the `LSEEYOU TSK` record separate these days from the others. The pattern fits per class scoring runs with different SeeYou versions or settings, but no source confirms that.

### Which flights

Over WGS84 and sphere days, with the sphere radius above:

| Era | Log interval | Finishers | Within 1 m | Median optimum minus published |
|---|---|---|---|---|
| To 2023 | 1 s | 2283 | 98 % | 0.0 m |
| To 2023 | 2 to 3 s | 444 | 96 % | 0.0 m |
| To 2023 | 4 s or more | 99 | 95 % | 0.0 m |
| 2024 on | 1 s | 3699 | 13 % | 11.5 m |
| 2024 on | 2 to 3 s | 78 | 51 % | 0.1 m |
| 2024 on | 4 s or more | 34 | 88 % | 0.1 m |

From 11 May 2024 on, the share of matches falls with the number of fixes in the log: 65 % below 5000 fixes, 11 to 12 % between 10 000 and 20 000 and 6 % above 20 000. There is no sharp threshold.

The sign of the gap depends on where the optimal credited points lie. For WGS84 finishers with 1 s logs from 11 May 2024 on:

| Optimal credited points within 50 m inside the outer radius | Finishers | Median | SeeYou longer by more than 1 m | SeeYou shorter by more than 1 m |
|---|---|---|---|---|
| None | 1661 | 13.3 m | 0 % | 88 % |
| One | 432 | 4.6 m | 28 % | 61 % |
| Two or more | 92 | -7.9 m | 54 % | 42 % |

SeeYou is never longer when all optimal points lie inside the areas. It must therefore credit something other than logged fixes inside the zone near the boundary, and something coarser than all fixes inside.

### Tested rules

On `dm-zwickau-2026` and `jwgc2024`, 540 finishers, 61 of which match with the plain optimum:

| Variant | Within 1 m | Median | p10 to p90 |
|---|---|---|---|
| All fixes | 61 | 7.6 to 13.5 m | -0.2 to 36.5 m |
| `THIN=2`, at least 2 s between fixes | 62 | 4.1 to 7.2 m | -8.3 to 30.0 m |
| `THIN=3` | 58 | -0.1 to 0.0 m | -23.4 to 23.4 m |
| `THIN=4` | 47 | -1.9 to -11.7 m | -40.7 to 21.2 m |
| `THIN_M=50`, at least 50 m between fixes | 70 | 4.1 to 7.4 m | -10.4 to 30.0 m |
| `THIN_M=100` | 41 | -1.1 to -7.9 m | -39.7 to 18.9 m |
| `CROSSINGS`, boundary crossings as candidates | 62 | 7.6 to 13.8 m | -0.2 to 36.5 m |
| `CROSSINGS` with `THIN=3` | 59 | -0.1 to 0.0 m | -23.4 to 23.4 m |
| `ZONE_EARTH=sphere`, zones tested on the 6371 km sphere | 62 | 10.2 to 13.8 m | 0.1 to 39.8 m |

Medians and percentiles are per competition, and the table gives the range over both. Thinning to about one fix per 3 s centres the median but leaves a spread of ±23 m. Per flight, 361 of the 540 finishers match under none of `THIN=1` to `THIN=5`. Boundary crossings fix 1 of the 17 flights where SeeYou is more than 5 m longer, and zone tests on the sphere fix 3. None of these is the rule.

### Release notes

The SeeYou changelog lists these AAT and zone entries for SeeYou for PC, which includes SeeYou Competition:

- v10.60, between February and September 2023: "Calculate AAT result faster" and "Same logic for pie-slice AAT sectors as LX9000, Oudie".
- v10.70: "Fix problem with displaying AAT task in rare cases".
- v10.73: "Make IGC Annex A script default for SeeYou Competition" and "Fix Observation zone direction bug".
- v10.74: "Unified Observation zone orientation between SeeYou, Oudie N, Navigator & LXNAV instruments".
- v10.78: "Fixed: OZ reported as not rounded ok, although fixes exist in the zone" and "Fixed: Outlanding subtracts the Finish ring distance".
- v10.81: "AAT outlanding location bug" and "AAT calculation bug in rare cases".
- Older: v2.1 "Calculation of distances on WGS 84 Ellipsoid (Sphere still possible as an option)", v5.2 "Always uses Ellipsoid to measure distances", v8.1 "FAI Spheroid renamed to FAI Sphere".

"Calculate AAT result faster" is the only entry that could make the result coarser. It predates the change by months if the Wayback dates are right, so it fits only if SoaringSpot or the scorers adopted it later. No Naviter forum post, blog post or KB article on the AAT algorithm was found.

### Rules on zones and credited points

Annex A 2024 6.3.2c says "For each Assigned Area, a single fix will be determined which will be taken as the end of the previous leg and the beginning of the next leg. The scorer will choose the set of Credited Fixes that results in the maximum possible credited distance." Zone achievement in 7.6.4 credits "a valid fix within the Observation Zone, or if a straight line between two consecutive valid fixes intersects the Observation Zone", and 7.6.5 handles a fix within 500 m outside as a near miss with a penalty. The wording is identical in Annex A 2023, 2024, 2025 and 2025a. The SWO uses the same achievement rule (SWO 7.4.1, see the [zones research](https://github.com/Turbo87/keyhole/blob/research/task-zones-and-formats/docs/research/task-zones-and-formats.md)).

SeeYou help describes the credited points as fixes: "The fixes that produce longest distance (one from each area) become actual waypoints used for distance and speed computations". Its "Allow missed zones" option is a "missed zone buffer horizontally and vertically" that issues "a warning" when a flight misses an area by less than the buffer. CUC help and the CUP spec name the same values `NearDis` and `NearAlt`, "Distance tolerance" and "Altitude tolerance". Every day in the download has `NearDis` absent or `0.0km`. No source says that SeeYou credits points between fixes, credits points beyond the zone or tests zones on a different earth model than it measures.

## Outlanders

The prototype's best rule for outlanders matches Annex A 2024 6.3.2d(iii): the distance "through each Credited Fix, to the point of the next Assigned Area which is nearest to the Outlanding Position, less the distance from the Outlanding Position to this nearest point". Annex A 7.7.2 takes "the fix that represents the point of best performance" as the outlanding position for incomplete flights. SeeYou help describes the matching "Uncompleted leg" option: "calculate minimum distance to next observation zone from point of landing or virtual outlanding (used for TDT/AA and DST/AA tasks)".

No source explains the remaining residual on WGS84 days up to 2023. The changelog fixes an "AAT outlanding location bug" in v10.81 and "Outlanding subtracts the Finish ring distance" in v10.78, both after July 2024, so earlier results may contain both bugs. Neither entry describes the bug. The sphere radius above does not affect these WGS84 days.

## Open questions

- Which rule SeeYou applies to AAT credited points since May 2024. Credited points from SeeYou, for example from a SeeYou Competition `.cuc` file or a scorer's export, would settle it.
- Why some class days from 2024 on still match the optimum, and whether they were scored with another SeeYou version.
- Where the 6 370 775 m radius comes from, and whether SeeYou has used it since before 2022.
- What the v10.78 and v10.81 outlanding bugs changed, and whether they explain the outlander residuals up to 2023.
- Release dates of SeeYou 10.60 to 10.81 and of the SoaringSpot backend move to SeeYou Cloud.
