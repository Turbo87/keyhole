# Observation zones, finish geometries and task file formats

Research for [Which observation zones, finish geometries and task file formats do SWO, Annex A and real competitions use?](https://github.com/Turbo87/keyhole/issues/60). It collects which turnpoint zones, AAT areas, start and finish geometries the rule sets allow, which ones real competitions used, and what the SeeYou CUP task section and other task formats can express. The facts feed [Which task types, observation zones and import formats does task entry support?](https://github.com/Turbo87/keyhole/issues/61) and do not make that decision.

Facts were checked on 2026-11-02 against the documents listed below, the local SoaringSpot download (64 competitions including the JenaCup 2026, 63 of them with scored days) and SoaringSpot task pages of the Hotzenwald competitions 2024 to 2026, which are not in the download. Counts use the `task.json` of every class day with status official, unofficial or preliminary, 1096 class days in total. Practice and cancelled days are excluded unless stated.

## Sources

| Short name | Document | Edition | URL |
|---|---|---|---|
| SWO | DAeC "Wettbewerbsordnung für Segelflugmeisterschaften (SWO)" | Ausgabe 2026 | https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026.pdf |
| SWO-F | SWO Anlage F, template local procedures | Ausgabe 2026 | https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026-Anlage-F.pdf |
| Annex A | FAI Sporting Code Section 3 Annex A | 2025a Edition, valid from 15 April 2026. The FAI documents page lists no newer edition | https://www.fai.org/sites/default/files/document/file/SC3A_2025a.pdf |
| DM 2026 | Local procedures, German Championships Standard and 15 m, Zwickau | April 2026 | https://dm.acz.de/wp-content/uploads/2026/04/Ausfuehrungsbestimmungen-DM-2026-in-Zwickau.pdf |
| Hotzenwald 2026 | Local procedures, 61st Hotzenwald competition | V1, 21 Jan 2026 | https://www.soaringspot.com/uploads/050/5091/files/AF-DE-2026_Ausfuhrung_61_Hotzenwaldwettbewerb_V1.pdf |
| CUP spec | Naviter "SeeYou CUP file format" | © 2023 | https://downloads.naviter.com/docs/SeeYou_CUP_file_format.pdf |
| XCSoar CUP | `src/Task/TaskFileSeeYou.cpp` in XCSoar | commit `dfb49d2` | https://github.com/XCSoar/XCSoar/blob/dfb49d229040a8e359b7868a1e8fcf6052aa60fb/src/Task/TaskFileSeeYou.cpp |
| XCSoar tsk | `doc/task_file.rst` and `src/Task/Serialiser.cpp` in XCSoar | commit `dfb49d2` | https://github.com/XCSoar/XCSoar/blob/dfb49d229040a8e359b7868a1e8fcf6052aa60fb/doc/task_file.rst |
| XCSoar xctsk | `src/Task/XCTrackTaskDecoder.cpp` in XCSoar | commit `dfb49d2` | https://github.com/XCSoar/XCSoar/blob/dfb49d229040a8e359b7868a1e8fcf6052aa60fb/src/Task/XCTrackTaskDecoder.cpp |
| LXNAV manual | LX90xx and LX80xx user manual | Version 9.x, rev 53 | https://gliding.lxnav.com/wp-content/uploads/manuals/lx90xx-80xxUserManualEnglishVer900rev53.pdf |

The scoring rules research on [`research/scoring-rules`](https://github.com/Turbo87/keyhole/blob/research/scoring-rules/docs/research/scoring-rules.md), the oracle fixture inventory on [`research/oracle-fixtures`](https://github.com/Turbo87/keyhole/blob/research/oracle-fixtures/docs/research/oracle-fixtures.md) and the feature inventory on [`research/feature-inventory`](https://github.com/Turbo87/keyhole/blob/research/feature-inventory/docs/research/feature-inventory.md) already cover parts of this. The rule citations below were re-read in the documents above.

## Summary

Both rule sets know only two shapes per role. Turnpoints are the SWO keyhole (a 10 km 90° sector plus a 0.5 km cylinder) or the Annex A 500 m cylinder. AAT areas are a cylinder or a sector between two radials, which Annex A also allows with a minimum radius. Finishes are a ring of at least 5 km (SWO) or 3 km (Annex A), and Annex A also allows a line. Starts are lines, at most 20 km long under the SWO, and Annex A allows a cylinder start only with an IGC Bureau waiver. Annex A also has the Distance Handicap Task, whose turnpoint cylinder radius differs per glider.

Real competitions stay close to that. All 17 German competitions in the download that flew racing tasks used the keyhole on every racing task turnpoint, and all 18 German competitions used a 20 km start line and a finish ring, and their AAT areas are cylinders except on one day at the DM Club Class 2026. FAI championships use the 500 m cylinder. Sectors, sectors combined with a cylinder, finish lines, larger racing cylinders and a start cylinder appear only at FAI, Australian and South African events. No task in the download or at Hotzenwald 2024 to 2026 is a Distance Handicap Task.

The CUP task section can express every shape that was used, as up to two overlapping sectors per point, but its semantics are only partly documented. SoaringSpot writes `Line`, `Reduce` and `MaxAlt` keys that the specification does not list, never writes the task type and marks an AAT only through `TaskTime`. CUP has nothing for per-glider radii, PEV settings, start closing time, maximum start speed or minimum finish height.

## Rules

### Turnpoints

| | SWO 2026 | Annex A 2025a |
|---|---|---|
| Racing task | Keyhole. The drawing in SWO 7.4.1 shows a "WP-Sektor" of 10 km radius and 90° with a 0.5 km cylinder around the turnpoint, symmetric about the bisector of the legs | "a vertical cylinder centered on the Turn Point. The radius of the cylinder is 500m for a Racing Task" (7.6.1) |
| Distance Handicap Task | Not defined | Radius "specified on the Task Sheet" (7.6.1). The radii "vary according to the glider's handicap and the angle through which the courseline turns", are published per glider, and the algorithm must be in the local procedures and approved by IGC (6.3.3) |
| Steering point | Not mentioned | "For all Task types, a 'Steering Point' may be used to align the last leg" (6.2, also 7.8.2). Its zone is not defined |
| Credit | A fix inside, or a line between two consecutive fixes cutting or touching the zone (7.4.1) | Same (7.6.4) |
| Tolerance | 500 m (7.5) | 500 m (7.6.5) |

### AAT areas

| | SWO 2026 | Annex A 2025a |
|---|---|---|
| Shapes | "Kreis mit einem bestimmten Radius um einen zentralen Wendepunkt herum" or "Kreissegment begrenzt durch 2 Kurslinien von einem Wendepunkt aus mit einem maximalen Radius von diesem Punkt" (7.4.2) | "A circle of a given radius, centered on a Turn Point" or "A geometric figure on the ground bounded by two lines of specified initial bearing from a Turn Point, a maximum distance from that point, and, optionally, a minimum distance from that point" (7.6.2) |
| Separation | At least 1 km between consecutive areas (7.4.2) | Same (7.6.3) |
| Minimum task time | The organisers set a "Mindestwertungszeit (Mindestzeit)" (6.2.2). No range is given | Part of the task definition (6.2.2, 6.3.2a). No range is given |
| Distances on the task sheet | Not required | Nominal distance via the area centres plus minimum and maximum distance (6.3.2a) |

Neither rule set limits radius or sector angle. The sector is described by two radials, not by a centre bearing and an angle.

### Starts

| | SWO 2026 | Annex A 2025a |
|---|---|---|
| Line | "Jeder Abflugpunkt hat eine Abfluglinie mit vorgegebener Länge" (7.3.1), "max. 20 km lang" (7.3.2). Several start points per task are possible (7.3.1) | "A line, of defined length, perpendicular to the course to the first Turn Point, or the center of first Assigned Area" (7.4.3.1). No maximum length |
| Cylinder | Not defined | Only "approved by a specific waiver from the IGC Bureau" (7.4.3 note). Radius on the task sheet, "should not be less than 10 km" (7.4.4.1) |

### Finishes

| | SWO 2026 | Annex A 2025a |
|---|---|---|
| Ring | "Zielkreis ... mit definiertem Radius von mindestens 5 km und definierter Höhe" (7.6.1). The height must let pilots normally land on the airfield (7.6.2). Distance is measured to the centre minus the radius (6.2.1, 6.2.2) | "A circle of specified radius (minimum 3 km) around the Finish Point", with a minimum altitude, "regarded as the preferred finish procedure" (7.8.2a) |
| Line | Not defined | "A line, of defined length, at the elevation of the contest site", crossed in the direction on the task sheet. A minimum altitude "should be imposed" (7.8.2b, 7.8.3a) |
| Choice | Fixed by the rule | Stated in the local procedures "including length or radius and minimum height" (7.8.2, local procedures checklist) |

### German local procedures 2026

- **SWO Anlage F** gives the template text "Der Zielkreis wird voraussichtlich einen Radius von 5 km und eine minimale Überflughöhe von hhh m MSL (hhh m AAL) haben" (SWO-F 10.2).
- **DM 2026 Zwickau** uses "einen Zielkreis mit einem Radius von 5,0 km um den Flugplatzbezugspunkt" with a minimum of "620m AMSL (300m über der Höhe des Flugplatzbezugspunktes von 320m AMSL)" (DM 2026 10.3). It defines no turnpoint or area shapes beyond the SWO.
- **Hotzenwald 2026** uses a 20 km start line (9.1), the keyhole for racing tasks "sofern im Briefing nicht anders vorgegeben" (9.2), and a finish line "rechtwinklig zum Kurs vom letzten Wendepunkt durch die Bahnmitte mit 2 km Breite" with a minimum crossing height of 150 m, time penalties between 100 m and 150 m and a 5 minute penalty for a straight-in landing (9.3). It lists a "Handicapped Distance Task (HDT)": a racing task where the turnpoint cylinder diameter depends on the glider's index so that an index 120 glider flies 20 % further than an index 100 glider (9.2).

## Observed zones in the download

The tables count points by role. "Sector 10 km 90°" means a sector of 10 km radius with a total opening angle of 90°. SoaringSpot stores half the angle in `oz_angle1` and CUP `A1`, so the keyhole is `A1=45`. A zone with a second radius and `A2=180` is the union of the sector and a cylinder of the second radius, written "sector plus cylinder" below.

### Task types

`task_type` on scored days is `polygon` 578, `assigned_area` 511, `unknown_triangle` 6 and `fai_triangle` 1. The "Task info" line on the results pages names "Racing Task" or "Assigned Area Task" where it is present, and it calls the `unknown_triangle` days at the DM Bayreuth 2023 "Racing Task". Triangles are therefore racing tasks with a SoaringSpot label. No Distance Handicap Task or other type appears. In `task.cup`, a `TaskTime=` option is present exactly on the AAT days, and on scored days the two never disagree.

The Hotzenwald competitions are not in the download. Their SoaringSpot task pages for 2024 to 2026 show 38 official class days, all racing tasks (`polygon` or, once, `broken_leg`) or AATs. The racing tasks use the keyhole and the AATs use cylinders. The "Handicapped Distance Task" from the local procedures was not flown in these three years.

### Starts

| Start | Racing task | AAT | Competitions |
|---|---|---|---|
| Line 10 km | 382 | 357 | 37 |
| Line 20 km | 142 | 99 | 19, all German competitions among them |
| Line 15 km | 59 | 49 | 5 |
| Line 1 km or 6 km | 2 | 0 | 2 South African |
| Cylinder 10 km | 0 | 6 | 24th FAI EGC 2026 |

Twelve start lines carry `oz_max_altitude` between 1500 m and 2500 m, at the JenaCup 2026 and the DM Open Class 2025. One start line at the JWGC 2026 has `oz_move` set. One task, `dmj-edpa-2023/standard/2023-05-27`, has a `multiple_start` point, written as a `STARTS=` line in `task.cup`. Hotzenwald 2026 used a 40 km start line on its first Club and Newcomer day, which exceeds the SWO maximum.

### Racing task turnpoints

| Zone | Points | Competitions |
|---|---|---|
| Cylinder 0.5 km | 1521 | 37 FAI, South African and Australian |
| Keyhole, sector 10 km 90° plus cylinder 0.5 km | 419 | 19, 333 points of them at all 17 German competitions with racing tasks |
| Keyhole, sector 30 km 90° plus cylinder 0.5 km | 106 | Leeton 2026 |
| Keyhole, sector 5 km 90° plus cylinder 0.5 km | 64 | Narromine 2022, Kingaroy 2023 |
| Keyhole, sector 3 km 90° plus cylinder 0.5 km | 28 | Australian Nationals 2023 |
| Keyhole, sector 100 km 90° plus cylinder 0.5 km | 1 | Lake Keepit 2024 |
| Cylinder 1 km | 67 | 7 |
| Cylinder 2 to 20 km | 34 | 4 South African and Australian |

No racing task turnpoint is a plain sector, a line or a fixed-direction zone. All are `symmetric`.

### AAT areas

| Zone | Areas | Competitions |
|---|---|---|
| Cylinder | 1679 | All 58 with AATs. Radii from 0.5 km to 65 km, most often 20, 15, 25, 30 and 10 km |
| Sector, `fixed` radials | 33 | 7. Opening angles from 10° to 280° |
| Sector, `symmetric` | 5 | 11th Women's WGC 2022 |
| Sector, `previous` | 2 | Australian Nationals 2023 |
| Sector plus cylinder, `fixed` | 2 | 37th WGC Szeged 2022 (35 km 180° plus 25 km, 35 km 320° plus 8 km) |

The German competitions used only cylinders, except `dmc2026-burg-feuerstein/club/2026-06-20` with three fixed sectors (20 km 280°, 60 km 180°, 50 km 180°) and two fixed cylinders. No area has an inner radius that cuts out its centre. The oracle fixture inventory calls the Szeged 2022 zone an annular sector of 25 to 35 km. The stored values are `R1=35000m,A1=90,R2=25000m,A2=180`, and the SoaringSpot task page lists "Radius1=25.00 km, Radius2=35.00 km, Radial1=270.0°, Radial2=90.0°, Cylinder R=25.00 km". Both describe a 35 km half disc joined with a 25 km cylinder, which covers the centre.

Minimum task times range from 1:30 to 5:00. The most common are 3:00 (137 days), 2:00 (100), 2:30 (78) and 3:30 (58).

### Finishes

| Finish | Racing task | AAT | Competitions |
|---|---|---|---|
| Ring 5 km | 247 | 259 | 39 |
| Ring 3 km | 228 | 159 | 26 |
| Ring 4 km | 41 | 41 | 5 |
| Ring 10 km | 14 | 28 | 4 |
| Ring 6 km | 21 | 9 | DM Bayreuth 2023 |
| Ring 20 km | 0 | 3 | 10th Women's WGC 2020 |
| Line 1 to 20 km | 34 | 12 | Leeton 2026, two South African competitions |

Most rings have `oz_reduce` set, which matches distance being measured to the ring rather than its centre. 120 rings at 11 competitions do not, among them the EuregioCup 2022 and `dmj-edpa-2023`. 46 rings have `oz_move` set. The DM Women 2022 used 3 km rings and stored them as `symmetric` instead of `previous`. Hotzenwald used a 1 km finish line in 2024 to 2026, not the 2 km line of its local procedures.

The download has finish lines, which the oracle fixture inventory of 40 competitions did not find. Minimum finish heights are not in `task.json` or `task.cup` and were not counted. They appear only as free text in the task notes.

### Mixed zones within one task

119 scored tasks have turnpoints or areas of more than one shape or size.

- 29 AATs at 9 competitions mix cylinders and sectors, including the DM Club Class 2026 day above.
- 7 racing tasks combine keyholes with a cylinder. At Kingaroy 2023 the last turnpoint is a 3 km cylinder after 5 km keyholes, and at Lake Keepit 2024 one 100 km keyhole sits among 0.5 km cylinders.
- 83 racing tasks at 9 competitions use cylinders of different radii. In most of them the last turnpoint is a 1 to 5 km cylinder near the airfield, which matches the Annex A steering point. Szeged 2022 uses a 1 km cylinder this way. Some South African tasks also use 20 km or 2.5 km cylinders on ordinary turnpoints.

All German racing tasks use one zone for every turnpoint.

## SeeYou CUP task section

The CUP spec defines a task as a line of waypoint names, "description, takeoff, 1 turnpoint, 2 turnpoint, ..... , last turnpoint, landing", followed by an `Options` line and one `ObsZone` line per point, where `ObsZone=0` is the start. Points can also be defined inline with `Point=`, and `STARTS=` lists alternative starts that share one zone.

Documented `ObsZone` keys are `Style` (0 fixed, 1 symmetric, 2 to next point, 3 to previous point, 4 to start point), `R1`, `A1`, `R2`, `A2` and `A12`. The spec gives them only as "Radius 1", "Angle 1 in degrees" and so on. Its example uses `Line=1` without explaining it. Documented `Options` are `NoStart` (start opening), `TaskTime` ("Designated Time for the task"), `WpDis`, `NearDis`, `NearAlt`, `MinDis`, `RandomOrder`, `MaxPts`, `BeforePts`, `AfterPts` and `Bonus`.

What SoaringSpot writes, counted over every `task.cup` in the download:

- One task per file. Takeoff and landing appear as the first and last names.
- `ObsZone` keys `Style`, `R1`, `A1` (every line), `Line=1` (1564), `Reduce=1` (1340), `R2` and `A2` (848), `A12` (49, only with `Style=0`) and `MaxAlt` (23, all on start lines except one finish ring).
- `Options` keys `NoStart` (1054) and `TaskTime` (775) only. `WpDis`, `NearDis` and the others never appear.
- `STARTS=` once.
- `Move` never appears, although `task.json` has `oz_move` set on 65 points across all days. That flag is lost in CUP.

SeeYou Competition writes the same zone definitions into the published IGC files as `LSEEYOU OZ=` lines, for example `LSEEYOU OZ=0,Style=0,SpeedStyle=1,R1=35000m,A1=90,R2=25000m,A2=180,A12=0,MaxAlt=0.0m,AAT=1`. These lines also carry `SpeedStyle` and an explicit `AAT=1`, which `task.cup` lacks.

Expressible in CUP, as used by SoaringSpot: lines with their half length in `R1`, cylinders (`A1=180`), symmetric and fixed sectors, sectors pointing to the previous or next point, the keyhole and other "sector plus cylinder" zones through `R2` and `A2=180`, finish ring reduction, a maximum start altitude and alternative starts.

Not expressible in CUP:

- The task type. An AAT is recognisable only by `TaskTime`.
- Per-glider zone radii for a Distance Handicap Task.
- A true annular sector. The spec has no inner radius key. XCSoar reads `R2` with `A2=0` as an inner radius, while SeeYou and SoaringSpot use `R2` with `A2=180` for a second, overlapping zone. No file in the download uses `A2=0` with `R2` set.
- A start cylinder as a PEV cylinder start rather than a geometric zone, PEV wait and window times, start closing time, maximum start ground speed, minimum finish height and finish line direction.
- The `oz_move` flag and the steering point role of a turnpoint.

## Other task formats

- **XCSoar `.tsk`.** XML with one task per file. Task types are `FAIGeneral`, `FAITriangle`, `FAIOR`, `FAIGoal`, `RT`, `AAT`, `MAT`, `Mixed` and `Touring`. Zone types are `Line`, `Cylinder`, `MatCylinder`, `Sector` (fixed radials, optional `inner_radius` for an annular sector), `FAISector`, `SymmetricQuadrant`, `Keyhole` ("DAeC keyhole: 90 degree, 10000 m sector plus a 500 m cylinder"), `CustomKeyhole`, `BGAStartSector`, `BGAFixedCourse` and `BGAEnhancedOption`. It also stores the minimum task time, maximum start speed and height, PEV wait time and window, and minimum finish height (XCSoar tsk). It can carry a true annular sector. A sector plus cylinder exists only as the symmetric `CustomKeyhole`, so a fixed-radial sector joined with a cylinder, as at Szeged 2022, has no direct equivalent.
- **XCSoar's CUP reader.** XCSoar builds an AAT only when `Options` has `WpDis=False` and otherwise a racing task (XCSoar CUP, `wp_dis`). No SoaringSpot `task.cup` contains `WpDis`, so XCSoar would load SoaringSpot AATs as racing tasks. The reader recognises the keyhole only at exactly 10 km, 45° half angle and 500 m, turns fixed racing sectors into cylinders, and ignores `R2` with `A2=180` on AAT areas. The effect on SoaringSpot files was read from the code and not tested.
- **XCTrack `.xctsk`.** A paragliding format. XCSoar accepts only `taskType` `CLASSIC` and builds a racing task of cylinders (XCSoar xctsk). It cannot express lines, sectors or AATs.
- **LXNAV.** The LX90xx manual says "CUP and CUPX files also store tasks. Tasks will also be uploaded to the main display unit" and are loaded with Task, Edit, Load. Declarations are stored as binary `.hdr` files. No separate LXNAV task exchange format was found.
- **StrePla.** The StrePla task download offered SeeYou CUP and a StrePla XML format, and SoaringSpot offers task XML through its API (feature inventory, TSK-14). Neither XML format was read.
- **IGC files.** The C records of a declaration carry only the points, not their zones. SeeYou Competition adds `LCU::C` copies of the task and `LSEEYOU OZ=` zone lines to the published files (oracle fixture inventory).

## Not verified

- How SeeYou Competition and SoaringSpot represent a Distance Handicap Task, and whether SeeYou's DHT matches the Hotzenwald "Handicapped Distance Task". Neither appears in the data.
- What `oz_move` and the `Move` setting do in SeeYou, and what SeeYou does with `R2` and `A2=0`.
- Whether SeeYou Competition imports `task.cup` files from SoaringSpot without losing zones, and whether XCSoar really scores SoaringSpot AATs as racing tasks.
- The StrePla and SoaringSpot XML task formats, and the LXNAV device behaviour beyond the manual text.
- Minimum finish heights and finish line directions on real tasks, which only appear in free-text task notes.
- Why Hotzenwald used a 40 km start line and a 1 km finish line, and whether briefings changed the zones.
