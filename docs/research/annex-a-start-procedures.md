# Annex A start procedures and the EGC 2026 start-cylinder days

Research for ticket #18, collected 2026-10-31. It covers which start procedures FAI Sporting Code Section 3 Annex A defines, how the Cylinder Start and its Maximum Loss of Height (MLoH) work, and how SeeYou scored the start-cylinder days of the 24th FAI European Gliding Championships. Start times, credited start points, finish times, task distances and MLoH penalties were reproduced from the published IGC files.

## Sources

| Short name | Source | Version |
|---|---|---|
| Annex A | FAI Sporting Code Section 3 Annex A, "Rules for World and Continental Gliding Championships" | 2025a Edition, valid from 15 April 2026 (PDF last modified 15 Apr 2026). https://www.fai.org/sites/default/files/document/file/SC3A_2025a.pdf |
| Annex A 2024 | Same document, previous edition | 2024 Edition (PDF created 1 Oct 2024). https://www.fai.org/sites/default/files/document/file/sc3a_2024.pdf |
| Data set | soaringspot-downloader output for `24th-fai-egc`, classes `15-meter`, `club` and `standard`: `task.json`, `results.csv`, `results.html` and `*.igc.gz` | Downloaded up to 2026-10-30 |
| Downloader data notes | https://github.com/Turbo87/soaringspot-downloader/blob/a9ae646/docs/soaringspot-data.md | commit `a9ae646` |
| Scoring rules research | `docs/research/scoring-rules.md` on the `research/scoring-rules` branch | ticket #2 |
| Score-day spike | `prototypes/score-day/` on the `prototype/reproduce-soaringspot-day` branch | ticket #17 crossing model |

Data is referenced as `<competition>/<class>/<date>/<file>`. Times below are UTC as recorded in the IGC files unless marked local. The championship ran on CEST, so local times are UTC + 2 h.

No "Annex A 2026" edition was found. The 2025a Edition, valid from 15 April 2026, is the newest file on fai.org and is the one in force for the July 2026 championships.

## Verification status

Verified means read in the cited document or counted in the data set.

Not verified:

- **Local procedures and task sheets.** The championship website `egc2026.pl` answered every request with a redirect loop, and the SoaringSpot downloads page of the event only holds turnpoint and airspace files. The day's MLoH, maximum start groundspeed, start radius choice and the IGC Bureau waiver that Annex A requires for the Cylinder Start were therefore not read. The MLoH and groundspeed values below are inferred from the penalties.
- **Why SeeYou switched PEV clustering between practice and championship days.** See [Start time](#start-time). A SeeYou update or a scorer setting are both plausible.
- **SeeYou's AAT credited-fix optimiser.** AAT distances from the credited start point are within 113 m, not exact. See [Task distance](#task-distance).
- **Exit starts.** Four starts without a valid PEV are 1 to 3 s off the interpolated cylinder exit, in both directions. See [Starts without a valid PEV](#starts-without-a-valid-pev).
- **Gate opening and closing** were not checked against the starts. `task.json` `no_start` is set on most of these days, but none of the reproduced starts needed it.

## Rule text

### Start types

Annex A defines two start types, the Line Start and the Cylinder Start. The type of the day is announced at briefing and printed on the task sheet, with its options (7.4.1). Both share the opening and closing rules (7.4.2.1) and the optional pre-start altitude (7.4.2.2).

The **Line Start** is a crossing of a finite line perpendicular to the course to the first turnpoint or the centre of the first area. The Start Point is the line's midpoint and the Start Time is the crossing interpolated to the nearest second (7.4.3, 7.4.3.1). Options are the Normal Start and the PEV Start with a PEV Wait Time and PEV Start Window of 5 to 10 min (7.4.3.2, 7.4.3.4). Energy control uses a maximum start altitude and a maximum start groundspeed measured between the fixes nearest 8 s before and after the start (7.4.3.5). With multiple valid starts the competitor is scored with the best one (7.4.3.6).

The **Cylinder Start** is only used with a specific waiver from the IGC Bureau (note before 7.4.4). The pilot starts by pressing PEV on the primary flight recorder while inside the Start Cylinder, and the start altitude determines the minimum penalty-free finish altitude (7.4.4). It is not new in 2026. The 2024 Edition already contains it with the same definitions, and the 2025a Edition only adds that a later PEV "creates a new valid Start", that a new start within the Minimum PEV Interval is penalised again, and moves "the latest Start is used for scoring" from a note into 7.4.4.6.

### Cylinder Start definitions (7.4.4.1)

| Term | Definition |
|---|---|
| Start Cylinder | Cylinder around the Start Point with the radius from the task sheet, normally at least 10 km |
| Start Time | Time of the latest PEV within the Start Cylinder, or the latest exit of the cylinder if no PEV is present |
| Minimum PEV Interval | 10 minutes between consecutive PEVs |
| Credited Start Point | Coordinates recorded at the Start Time |
| Start Altitude | Altitude recorded at the Start Time |
| Finish Altitude | Altitude recorded at the Finish Time, the crossing of the finish line or ring |
| Loss of Height | Start Altitude minus Finish Altitude |
| Maximum Loss of Height | Greatest Loss of Height without penalty, printed on the task sheet |
| Groundspeed at the Start | Straight-line distance between the Credited Start Point fix and the fix nearest 8 s before it, divided by the elapsed time |
| Maximum Groundspeed | Printed on the task sheet |

### Cylinder Start procedure

- A PEV inside the cylinder sets the time, position and altitude of the start. A later PEV inside the cylinder creates a new start, invalidates the previous one and cancels its penalties, and is penalised again if it comes within 10 min of the previous one (7.4.4.2).
- PEVs within 30 s count as one PEV at the time of the first one. PEVs outside the cylinder and PEVs in other recorders are ignored (7.4.4.2).
- A start is valid with a fix inside the cylinder after the opening. Without a PEV inside, the cylinder exit is the start and is penalised. If a PEV is inside, the exit is not a start (7.4.4.3).
- The latest start is used for scoring (7.4.4.6), unlike the best-scoring start of the Line Start.
- Marking Distance is measured from the Credited Start Point (7.4.4.7). Racing and AAT distances in Part 6 say "from the Start Point or Credited Start Point" (6.3.1c, 6.3.1d, 6.3.2).

### Maximum Loss of Height (7.4.4.4, second 7.4.4.7)

If the Loss of Height exceeds the MLoH, a penalty proportional to the excess applies. It is independent of the minimum finish altitude penalty, and both can apply. Annex A numbers this "Finish Penalty" paragraph 7.4.4.7 a second time. It caps the penalty at the competitor's achieved speed points and at 15 % of the highest score before penalties.

Altitudes are MSL, taken as the recorded pressure altitude minus the pressure altitude at takeoff plus the airfield elevation (5.3.1). The takeoff offset cancels in a Loss of Height, so it is a pressure altitude difference.

### Penalties (8.7)

| Offence | First | Subsequent | Maximum |
|---|---|---|---|
| No fix in the cylinder, but less than 0.5 km outside | 50 pts | 50 pts | 50 pts |
| No fix within the cylinder radius plus 0.5 km | No valid start | | |
| No PEV inside the Start Cylinder | 5 min added | 10 min added | 10 min added |
| 0 to 50 km/h above the maximum start groundspeed | 2 pts per km/h | 2 pts per km/h | 2 pts per km/h |
| More than 50 km/h above | No valid start | | |
| PEV interval less than minimum | 5 min added | 10 min added | 10 min added |
| Finishing below the altitude determined at the start | 1 pt per 3 m | 1 pt per 3 m | Lesser of speed points and 15 % of the highest score |

These are the only time penalties in Annex A. A scoring system needs penalties that add time, not just points.

## The EGC 2026 start-cylinder days

`task.json` marks a cylinder start with a `start` point whose `oz_line` is false and `oz_angle1` is π. Across the whole download, only `24th-fai-egc` has such starts. On the 2026-07-08 to 2026-07-10 days, which are practice days with negative `task_number`, all three classes used cylinders. The championship also used them on 6 official class-days, so the line-start days are not "every other day":

| Class | Cylinder start days (radius) | Line start days |
|---|---|---|
| `15-meter` | 07-08 (20 km), 07-09, 07-10, 07-16, 07-20 (cancelled), 07-22 (10 km) | 07-13, 07-17, 07-18, 07-24 |
| `club` | 07-08 (20 km), 07-09, 07-10, 07-17, 07-24 (10 km) | 07-13, 07-16, 07-18, 07-20, 07-22 |
| `standard` | 07-08 (20 km), 07-09, 07-10, 07-13, 07-18 (10 km) | 07-16, 07-17, 07-20 (cancelled), 07-22, 07-24 |

The Task info line in `results.html` reads `PEVStarts: OFF` on every cylinder day and `PEVWaitTime: 10min, PEVStartWindow: 5min` on every line day. The algorithm hash is the same on all days, so one script scored both start types. The checked tasks (2026-07-10 and 2026-07-13, all classes) match WGS84 leg distances to within 0.3 m.

### Start time

Published start times on cylinder days are PEV times, not cylinder crossings. The scored start is the latest PEV whose B record at the same second lies inside the cylinder, taken before the pilot's last exit of the cylinder ahead of the first turnpoint or area. That explains why the published times sit about 20 s away from any exit or have no exit near them.

The 30 s clustering of 7.4.4.2 differs between the two groups of days:

| Days | Rule that fits | Start times reproduced |
|---|---|---|
| Practice, 9 class-days | Latest raw PEV, no clustering. Applying Annex A clustering breaks 16 of these rows and fixes none | 106 of 121 |
| Championship, 6 class-days | Latest PEV after Annex A clustering, so a second PEV within 30 s is ignored. Taking the latest raw PEV instead breaks 20 rows and fixes 1 | 162 of 167 |

The 288 rows are every row with a published start on the 15 class-days, and all have an IGC file.

On the practice day 2026-07-08, HI pressed PEV at 12:47:57 and 12:48:15. The published start is 12:48:15. On the championship day 2026-07-16, 3J pressed PEV at 13:11:40 and 13:11:51, and the published start is 13:11:40.

The 5 unexplained championship rows:

| Row | Observation |
|---|---|
| `club/2026-07-17` AL | Remark "PEV from primary logger 13:33:49". The scored file is the secondary recorder, and the scorer entered the primary recorder's PEV by hand |
| `club/2026-07-17` CH | PEVs at 11:36:28 and 11:36:30. The published start uses the second one, against the clustering rule |
| `club/2026-07-17` CK, `club/2026-07-24` A3, `standard/2026-07-13` OK | Starts without a valid PEV, see below |

The 15 unexplained practice rows include MN on `club/2026-07-08`, who has PEVs inside the cylinder but was scored from the cylinder exit, and 2L and IV on `15-meter`, whose start position is their last PEV fix but whose start time is 45 s and 116 s later. The other 12 are outlanders, mostly without a first turnpoint, where the reproduction picks the wrong cylinder exit to anchor on. In 6 of them (WE, CH, SN, EEE, I, Y1) the published start is one of the pilot's PEVs inside the cylinder. In the other 6 (451, PP twice, 56, XW, HUN) it is neither a PEV nor an exit, and the `LCU::C` start lies 95 m to 10 km away from the fix at the published time.

### Credited start point

SeeYou writes a per-pilot task into each scored IGC file as `LCU::C` records after the G record. On cylinder days the start of that task is a waypoint named after the day and CN, for example `Official_day2_IV`, `15m_day5_ZE` or `Club_day6_CH`, at the credited start point. On line days it is the regular start point. In all 162 reproduced championship rows and 106 reproduced practice rows, the `LCU::C` start is the B fix at the start time to within 1 m. It is a useful oracle for Keyhole, because it records SeeYou's start position directly.

### Starts without a valid PEV

Four championship rows were scored from a cylinder exit, three of them with "5min penalty - No PEV inside Start Cylinder" or "PEV 600m outside of Start Cylinder". L4 on `standard/2026-07-13` matches the interpolated exit rounded down. A3 is 1 s and CK is 3 s after it, and OK is 3 s before it. In all four the `LCU::C` start is the B fix at the published time. The rule SeeYou uses to pick that fix was not found.

### Time penalties

The 5 min penalties are added to the finish time, not to the start. All 6 rows with a 5 min penalty remark ("No PEV inside Start Cylinder", "PEV interval <10min", "PEV outside of PEV interval") publish a finish time exactly 300 s after the reproduced ring entry, and the published duration includes the 5 min. The other 145 finish times on championship days match the interpolated ring entry rounded up, as in the line-start model from ticket #17.

### Task distance

Per-pilot task distances differ because every pilot's first leg starts at the own credited start point (7.4.4.7). Measuring from the task's start point instead is off by up to 14 km.

| Rows | Result |
|---|---|
| Racing task finishers (practice) | All 9 within 1 m of the published distance |
| Racing task outlanders (practice) | 58 of 59 within 2 m, using Annex A 6.3.1d from the credited start point and the closest fix to the next turnpoint, with no engine detection |
| AAT finishers (all cylinder days) | 134 of 162 within 30 m and all within 113 m. The reproduction maximises the distance over every fix inside each area and is longer than SeeYou in most rows |

Racing distances are the geodesic leg sum on WGS84 from the credited start point via the turnpoint centres to the finish point, less the finish ring radius.

### Maximum Loss of Height

SeeYou's Loss of Height is the pressure altitude of the start fix minus the pressure altitude at the interpolated finish ring crossing. For all 16 rows with an MLoH penalty, the MLoH implied by the remark is one of a few round values to within 1 m. GPS altitude would be 20 to 80 m off.

| Class-day | Implied MLoH | Penalised rows |
|---|---|---|
| `15-meter/2026-07-08`, `15-meter/2026-07-10`, `standard/2026-07-08`, `standard/2026-07-13` | 800 m | Z3, BB, EC, JB |
| `15-meter/2026-07-16` | about 810 m, from one row | HI |
| `15-meter/2026-07-22`, `club/2026-07-17` | 1000 m | ZE, AX, P1, Z3, PP, OO |
| `club/2026-07-24`, `standard/2026-07-18` | 700 m | AL, OO, EC, TC, PI |

The penalty is the published excess in metres divided by 3 and rounded down, in all 16 rows ("26m over MLoH" gives 8 points, "50m" gives 16). AL on `club/2026-07-24` shows the cap: "116p penalty - 349 over MLoH (speed points cap applied - 72p)". The MLoH penalty is entered by hand as remark text, so it is not part of the published script's output.

Three finishers exceed the implied MLoH without a penalty: C on `15-meter/2026-07-16` by about 3 m, 56 on `club/2026-07-17` by 8 m, and YB on `standard/2026-07-13` by 43 m. YB has a remark about late delivery of the primary log, so the published file may not be the scored one.

### Groundspeed at the start

The Annex A definition from the credited start point fix and the fix nearest 8 s before it gives the penalised groundspeeds of BB (181 km/h), M7 (183 against 182), ZE (183), EC (163) and SN (183) to within 1 km/h. The penalties fit 2 points per km/h above 180 km/h on `15-meter` and `club` and 160 km/h on `standard/2026-07-13`. SN's remark says "3kmh over MLoH" but is a groundspeed penalty. D7 on `standard/2026-07-13` reaches 161 km/h without a penalty, and the 2026-07-08 practice penalties do not fit this definition. Groundspeed is therefore only partly verified.

## Implications for Keyhole

- Start procedures need a type per day. A Cylinder Start is not a variant of the start line. It needs the primary recorder's PEV events, a cylinder radius, the MLoH and the maximum groundspeed, and it uses "latest start" instead of "best start".
- The credited start point has to be stored per flight and used for distance, so task distance becomes a per-flight value. The AAT optimiser has to start from it too.
- Penalties need a time kind that adds minutes to the finish time, with offence counting (5 min first, 10 min after).
- MLoH depends on pressure altitudes, so finish altitude has to come from the interpolated ring crossing.
- The PEV clustering difference between practice and championship days shows that SeeYou's behaviour can change during one event. Fixtures from this event should pin the championship days.
- Primary and secondary recorders matter. Several unexplained rows come from secondary files or hand-entered PEVs, so scorer overrides of the start time and position must be possible.
