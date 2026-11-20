# Take-off and landing detection

This investigation asks how the file stage of #277 should detect take-offs and landings in IGC files. Keyhole analyses a complete file after the flight, so it can look both forwards and backwards. It needs every take-off and landing with time and position, the "file starts or ends airborne" warning, and the flight date as the local date of the first take-off.

## Summary

Ground speed alone is not adequate. A ground speed latch produces false landings in wave, splits flights at GPS gaps and counts car tows to the grid as flights. The guard that fixes the wave case, "no landing while 100 m above the ground reference", misses every outlanding on higher ground. In the SoaringSpot corpus it leaves 638 of 25,375 files airborne.

The recommended detector segments the file into ground periods and moving segments. It uses ground speed, altitude stability and the climb of the whole segment, and needs no airspeed, engine noise or terrain data.

1. Use valid (`A`) fixes only. Use pressure altitude, or GNSS altitude when the file has no pressure altitude.
2. Mark a fix as still when the window from the fix to 30 s after it meets all of these conditions:
   - the net speed from its first to its last fix is below 4 m/s
   - the median fix-to-fix speed is below 4 m/s
   - the highest fix-to-fix speed is below 6 m/s
   - the altitude range, without its single highest and lowest value, is at most 6 m for pressure altitude or 20 m for GNSS altitude
3. Join runs of still fixes across non-still stretches of at most 5 s. A run is a ground period when it touches the start of the file, lasts at least 5 s, or reaches the end of the file with at least 3 fixes.
4. Everything between ground periods is a moving segment. A moving segment is a flight when it has a take-off run, which is fix-to-fix ground speed above 15 m/s for at least 10 s. Its highest altitude must also be at least 50 m above the median altitude of the higher of the ground periods around it. Other moving segments are ground movement, such as a car tow, a taxi or a retrieve, and produce no entries.
5. Two flights separated by a ground period of less than 20 s merge into one flight.
6. The take-off is the first fix of the take-off run. The landing is the first fix of the ground period after the flight, moved back to the first fix from which the speed stays below 6 m/s.
7. A flight whose take-off run starts at the first fix starts airborne. A flight that reaches the last fix ends airborne. Both raise the warning.

On the full corpus this detector finds exactly one take-off and one landing in 24,553 of 25,375 files. It finds a second take-off in 34 files, and every one of them is a plausible relaunch from the same airfield. It never reports a false landing in the three wave recordings, and it finds no take-off in 10 files, all short ground-only recordings. The flight date does not depend on the detector on this corpus, as [Flight date](#flight-date) shows.

The prototype detectors, the measurement scripts and the test data are kept outside this repository.

## Rule texts

Neither rule set defines how to detect a take-off or a landing. The rules need the take-off for these reasons:

- [Annex A 2025a](https://www.fai.org/sites/default/files/document/file/SC3A_2025a.pdf) 5.3.1 derives MSL altitudes from "the recorded pressure altitude at takeoff, plus the airfield elevation" and penalises a missing take-off pressure altitude. MSL altitudes "should agree with an altimeter set to field elevation before takeoff". The penalty list in 8.7 names the offence "Failure to record takeoff pressure altitude". Neither clause defines which fix is "at takeoff".
- Annex A 5.3f requires Flight Logs from all flights of the day, and 7.3.1 allows up to three launches. A failed take-off counts as a launch only if the pilot stays airborne (7.3.1d).
- [SWO 2026](https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026.pdf) 10.3 measures all altitudes relevant to height infringements from "der Referenzhöhe beim Start" and does not define that reference further. 5.9.9 takes barometric altitudes from the submitted flight files.
- SWO 2026 5.9.3 requires the FR to run at least 2 minutes before the start. 7.2.7 allows a relaunch after sinking out at the airfield, and 7.8.2 allows a relaunch from an outlanding airfield for the return flight.

## How other tools do it

### XCSoar and OpenSoar

[`FlyingComputer`](https://github.com/XCSoar/XCSoar/blob/dd1d496283183cd521ae537f52bc6b2dfb482359/src/Computer/FlyingComputer.cpp) is a real-time state machine driven by three clocks. Each [`StateClock`](https://github.com/XCSoar/XCSoar/blob/dd1d496283183cd521ae537f52bc6b2dfb482359/src/Computer/StateClock.hpp) adds and subtracts elapsed time, limits each step to 5 s and saturates at a maximum ([`FlyingComputer.hpp` lines 25 to 39](https://github.com/XCSoar/XCSoar/blob/dd1d496283183cd521ae537f52bc6b2dfb482359/src/Computer/FlyingComputer.hpp#L25-L39)): stationary 60 s, moving 30 s and climbing 20 s.

- A fix is moving when its speed is at least the take-off speed (`Compute()`, lines 275 to 278). With an airspeed, the speed is the larger of true airspeed and ground speed (`CheckTakeOffSpeed()`, lines 155 to 169).
- Take-off happens once the moving clock reaches 10 s. Its time and position are those of the first moving fix (`Check()`, lines 67 to 85).
- The landing threshold is half the take-off speed, "to avoid false positives while wave/ridge soaring" (lines 171 to 182). Landing happens when the moving clock has drained to zero, which takes up to 30 s, at the first stationary fix (lines 90 to 99).
- A fix that has climbed more than 0.1 m since the previous evaluation feeds the climbing clock. While it holds at least the interval plus 1 s, low speed does not count as stationary (lines 191 to 202 and 279 to 282).
- Without an airspeed and without terrain, the take-off speed shrinks to 2/3, 1/2 or 1/4 when the aircraft is more than 250, 500 or 1,000 m above the last ground altitude (lines 258 to 273). A height of at least 300 m above terrain always counts as moving (lines 184 to 189).
- `Finish()` forces a landing at the end of a replay after at least 5 s stationary (lines 318 to 325).

The take-off speed is half the polar's minimum sink speed ([`GlidePolar::GetVTakeoff()`](https://github.com/XCSoar/XCSoar/blob/dd1d496283183cd521ae537f52bc6b2dfb482359/src/Engine/GlideSolvers/GlidePolar.cpp#L397-L401)), or 10 m/s without a valid polar ([`GlideComputerAirData.cpp` line 18](https://github.com/XCSoar/XCSoar/blob/dd1d496283183cd521ae537f52bc6b2dfb482359/src/Computer/GlideComputerAirData.cpp#L18)). The replay tools use `GlidePolar(1)` ([`DebugReplay.cpp` line 13](https://github.com/XCSoar/XCSoar/blob/dd1d496283183cd521ae537f52bc6b2dfb482359/test/src/DebugReplay.cpp#L13)), whose default polar and 390 kg mass give 13.3 m/s. Ground speed comes from consecutive fixes ([`GroundSpeedComputer.cpp`](https://github.com/XCSoar/XCSoar/blob/dd1d496283183cd521ae537f52bc6b2dfb482359/src/Computer/GroundSpeedComputer.cpp)), or from the `GSP` extension when present. The IGC replay ignores `V` fixes and zero pressure altitudes ([`DebugReplayIGC.cpp` lines 70 to 82](https://github.com/XCSoar/XCSoar/blob/dd1d496283183cd521ae537f52bc6b2dfb482359/test/src/DebugReplayIGC.cpp#L70-L82)). It reads `GSP` and `TAS` as their first three digits ([`IGCParser.cpp` lines 270 to 275](https://github.com/XCSoar/XCSoar/blob/dd1d496283183cd521ae537f52bc6b2dfb482359/src/IGC/IGCParser.cpp#L270-L275)), which is km/h for LXNAV's five-digit hundredths.

OpenSoar's [`FlyingComputer.cpp`](https://github.com/OpenSoaring/OpenSoar/blob/e34b3dca3f63bf534c79657b22d181449350b9ca/src/Computer/FlyingComputer.cpp) is byte-identical to the XCSoar file above.

### SkyLines and py-xcsoar

SkyLines runs XCSoar's `FlyingComputer` through py-xcsoar. [`FlightTimes.cpp`](https://github.com/XCSoar/XCSoar/blob/237a81b32a4865ddd8f4855e1bee54d4e124086c/python/src/Flight/FlightTimes.cpp) (the py-xcsoar submodule commit, with the same `FlyingComputer` thresholds as above) resets the computer for each flight, stops a flight at the first landing after a release, ends an unfinished flight at the last fix, and aborts on a jump of more than 1° latitude or 30° longitude. [`get_analysis_times()`](https://github.com/skylines-project/skylines/blob/9ef85fbb902574a0d43c46810b4a325628f895bd/skylines/lib/xcsoar_/analysis.py#L385) picks the longest scoring period among the flights. [`get_takeoff_date()`](https://github.com/skylines-project/skylines/blob/9ef85fbb902574a0d43c46810b4a325628f895bd/skylines/lib/xcsoar_/analysis.py#L170-L178) uses the local date of take-off in the time zone of the take-off location, which matches #277.

### LK8000

[`TakeoffLanding()`](https://github.com/LK8000/LK8000/blob/1dbc17fd1b3b00ea231c5064938018bd845a3c4c/Common/Source/Calc/TakeoffLanding.cpp#L54-L246) runs once per second. It counts up while the speed exceeds 11.12 m/s ([`LKProfileInitRuntime.cpp` line 98](https://github.com/LK8000/LK8000/blob/1dbc17fd1b3b00ea231c5064938018bd845a3c4c/Common/Source/LKProfileInitRuntime.cpp#L93-L99)) and counts down otherwise, but only when terrain is unknown or the aircraft is less than 300 m above it. The counter saturates at 60 for gliders. Take-off needs more than 10 and landing needs the counter at 0, which is 60 s of low speed.

### igc_lib

[igc_lib](https://github.com/marcin-osowski/igc_lib/blob/14d683768e5f970abf612e978ed8ad98013d6d0d/igc_lib.py#L928-L1053) uses ground speed only. It has no vertical criterion. Each fix emits "flying" when its fix-to-fix speed exceeds 15 km/h. A two-state Viterbi decoder smooths the emissions (staying probability 0.9995, emission probability 0.8). A second pass turns every ground run shorter than 300 s that is followed by flying back into flying, including the run at the start of the file ([`min_landing_time`](https://github.com/marcin-osowski/igc_lib/blob/14d683768e5f970abf612e978ed8ad98013d6d0d/igc_lib.py#L538-L541)). By default it reports the first take-off and the last landing of the concatenated flights.

### Others

[aeroscore](https://github.com/Turbo87/aeroscore/blob/master/src/takeoff-detector.ts) flips between flying and not flying on every fix-to-fix speed above or below 50 km/h, without a hold time. [aerofiles](https://github.com/Turbo87/aerofiles) has no take-off or landing detection. No public source was found for SeeYou or OLC.

## Recording characteristics

Real files constrain the hold times more than the flying does:

- The take-off follows the first fix after a median of 77 s, under 60 s in 39.7% of files and under 300 s in 98.4%. igc_lib's 300 s rule therefore puts the take-off on the first fix in 25,026 of 25,375 files.
- The file ends a median of 33 s after the landing, and within 40 s in 78% of files. In a random sample of 1,500 files, the 1,144 LXNAV files end a median of 31 s after landing. The top-level LXNAV files show the same 29 to 38 s, so the loggers stop recording, not SoaringSpot. Any landing rule that needs more than about 25 s of ground data must handle the end of the file.
- 728 files (2.9%) start with the glider already above 15 m/s. In 515 of them the first fixes look like a take-off run: below 25 m/s with less than 8 m of climb in 10 s. Another 125 already climb, 74 are fast and level, and 14 are too short to tell.
- Recording intervals: 21,601 files at 1 s, 2,536 at 2 s, 1,059 at 3 to 4 s, 145 at 5 to 10 s and 34 above 10 s (median interval). 548 files have gaps above 60 s, 5,128 have repeated or backward timestamps, 34 have no pressure altitude and 808 have no ENL.
- Logger TAS is not usable on the ground. In `1023558` it still reads 41 to 61 km/h for 9 s after the glider stopped at 16:33:21 UTC.

## Empirical results

The detectors ran on all 25,375 gzipped SoaringSpot files (65 competitions, 2012 to 2026, Europe, South Africa, Australia and the US) and on the 29 IGC files at the top level of the test data. The NMEA file was not evaluated. The 9 oracle fixture days correspond to 278 corpus files. The SoaringSpot day folder gives the flight date. Nothing gives true take-off and landing times, so the tables use these proxies:

- A landing followed by another take-off within 180 s is implausible as a relaunch.
- Every second take-off was inspected for the recommended detector.
- The wave files `1023558` and `537399` (Puimoisson, low ground speed above 2,900 m) give known false landings.

`gs15_7.5` is the latch from the earlier flight phase research (take-off after 10 s above 15 m/s, landing after 30 s below 7.5 m/s). `guard100` adds the "no landing more than 100 m above the ground reference" rule. `xcsoar` is the faithful port with the replay take-off speed of 13.3 m/s and the `GSP` and `TAS` extensions, and `xcsoar_noext` ignores the extensions. `rec` is the recommended detector. `rec_noalt` is an earlier variant of it (ground runs of 20 s everywhere, no bridging or trimming) without the altitude condition.

| Detector | 1 take-off, 1 landing | >1 take-off | Relaunch within 180 s | Starts airborne | Ends airborne | False landings in wave files | Top-level files not 1+1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `gs15_7.5` | 24,288 | 317 | 482 | 728 | 46 | 21 | 2 |
| `guard100` | 23,957 | 51 | 23 | 728 | 638 | 0 | 0 |
| `xcsoar` | 23,945 | 60 | 37 | 918 | 481 | 0 | 0 |
| `xcsoar_noext` | 24,449 | 44 | 46 | 796 | 82 | 0, misses 1 landing | 1 |
| `igc_lib` | 307 | 34 | 0 | 25,026 | 101 | 0 | 29 |
| `rec_noalt` | 24,542 | 45 | 26 | 725 | 56 | 5 | 1 |
| `rec` | 24,553 | 34 | 4 | 725 | 56 | 0 | 0 |

The 4 short relaunches of `rec` are real. `wgc2021-club-std-15m-montlucon-gueret-2021/standard/2021-08-13/18D_220` stops at 13:44:56 UTC and rolls again at 13:46:05 from the same spot. The other three are `11th-fai-womens-world-gliding-championship-2022/standard/2022-08-23/28N_3S` (136 s), `dm-frauen-landau-ebenberg-2022/standardklasse/2022-05-25/25P_VZ` (108 s, after a 2-minute flight with 120 m climb) and `wgc2021-club-std-15m-montlucon-gueret-2021/club/2021-08-15/18F_B6` (146 s). In the 34 files with several take-offs, 34 of the 35 intermediate landings lie within 9 m of the first take-off pressure altitude. The remaining one, `dm-frauen-landau-ebenberg-2022/18m-klasse/2022-05-22/25M_WU` at 13:25:59 UTC, lies 30 m lower and is followed by a take-off from the same place 60 minutes later.

Most of the 56 files that `rec` leaves airborne end in flight. The other detectors also leave between 46 and 56 of these files airborne.

Take-off and landing times compared with `rec` on files where both find one of each, as 5th, 50th and 95th percentiles in seconds:

| Detector | Files | Take-off | Landing |
| --- | ---: | --- | --- |
| `gs15_7.5` | 24,277 | 0 / 0 / 0 | -3 / 0 / 2 |
| `xcsoar` | 23,937 | -6 / -2 / 0 | -2 / 0 / 7 |
| `xcsoar_noext` | 24,440 | -3 / -1 / 0 | -3 / 0 / 4 |

Variants of the earlier detector barely move these numbers. Raising or lowering the altitude range (3 or 12 m) or the window (15 or 60 s) changes only the ends-airborne count, by up to 4 files. Requiring 60 s ground periods loses 2 relaunches. Dropping the 50 m climb condition adds 6 files with several take-offs, all ground tows.

### By data quality

| Median interval | Files | `rec` ends airborne / >1 take-off | `gs15_7.5` | `xcsoar_noext` |
| --- | ---: | --- | --- | --- |
| 1 s | 21,601 | 24 / 32 | 22 / 236 | 45 / 41 |
| 2 s | 2,536 | 13 / 1 | 11 / 42 | 18 / 2 |
| 3 to 4 s | 1,059 | 16 / 1 | 11 / 15 | 15 / 1 |
| 5 to 10 s | 145 | 2 / 0 | 2 / 5 | 2 / 0 |
| above 10 s | 34 | 1 / 0 | 0 / 19 | 2 / 0 |

In the 548 files with gaps above 60 s, `gs15_7.5` finds several take-offs in 163, `xcsoar_noext` in 5 and `rec` in 4. The latch in this investigation counts its hold time from the previous fix, so a single slow fix after a long gap becomes a landing. `rec` needs the altitude to stay level over the gap, which it does not when the glider circles.

### Winch launches

Eight competitions with winch launches were added to the corpus later and are evaluated separately, so the tables above cover the original 25,375 files. The launch method of each comes from the organisers' rules and from the climb profiles of the IGC files. They hold 889 files from Venlo (2025, 2026), Soesterberg (2024, 2025), Terlet (2024, 2026) and Oerlinghausen (2022, 2026). A file counts as a winch launch here when its pressure altitude rises at least 250 m within 60 s of the `rec` take-off fix, which marks 420 files.

| Detector | Winch files, 1 take-off and 1 landing | >1 take-off | Relaunch within 180 s | Ends airborne |
| --- | ---: | ---: | ---: | ---: |
| `gs15_7.5` | 408 | 12 | 22 | 1 |
| `guard100` | 416 | 2 | 0 | 2 |
| `xcsoar` | 417 | 1 | 0 | 1 |
| `xcsoar_noext` | 416 | 1 | 0 | 2 |
| `rec` | 417 | 1 | 0 | 2 |

The take-off times of `rec`, `gs15_7.5` and `xcsoar_noext` agree within 1 s on every winch file between the 5th and 95th percentile, so the 10 s run above 15 m/s handles winch launches without changes. The second take-off of `rec` is a real relaunch: `nationale-junioren-wedstrijd-2025-venlo-2025/open/2025-08-05/585_28` lands at 10:52:58 UTC at its take-off altitude and launches again at 11:12:23. The two files `rec` leaves airborne, `amstelglide-2024-soesterberg-ab-2024/club/2024-06-09/469_CO` and `469_M8`, have no pressure altitude, record every 3 s or less often and end within seconds of the last fast fix. The 22 short relaunches of `gs15_7.5` lie in flight, at pressure altitudes from 409 to 1,507 m above a field at about 0 m.

The take-off fix is a poorer altitude reference after a winch launch, because the glider is already climbing when the run reaches 15 m/s. Against the proxy of [Single fix or window](#single-fix-or-window) it has a mean absolute error of 4.19 m on the 213 winch file take-offs with a proxy, with a 95th percentile of +13 m and a 99th percentile of +35 m. The last ground fix (0.37 m) and the median of the last 30 s of the ground period (0.25 m) stay as accurate as on aerotow launches.

## Failure cases

- Ground speed latch in wave. `2026-03-30 1023558`: `gs15_7.5` lands 16 times between 09:36:50 and 15:33:54 UTC at pressure altitudes from 2,462 to 4,631 m. `xcsoar_noext` reports no final landing at all at 16:33:21 UTC. The climbing clock is saturated from the last airborne evaluation, 1 m pressure altitude noise on the ground keeps it high, and the file ends 30 s after the stop.
- Wave hover that looks like ground. `2025-03-31 537399` hovers at 3,642 to 3,657 m from 15:15:30 to 15:16:18 UTC with ground speed 1 to 2 m/s at a 3 s interval. Its 30 s windows pass every speed test, and the altitude range drops to 6 m at 15:15:51. `rec` survives because the still run lasts only a few seconds against the required 20 s. A variant with a 12 m altitude range and no minimum relaunch ground period turns the hover into ground and deletes the first take-off at 11:21:57.
- Outlanding on higher ground. `dm-zwickau-2024/15-meter/2024-06-16/46G_28` lands at 14:52:22 UTC at 692 m pressure altitude after taking off at 319 m. The file ends 26 s later. `guard100` leaves it airborne, as `guard100` does for 591 corpus files that `rec` lands, 227 of them more than 200 m above the take-off.
- Ground tows counted as flights. `11th-fai-womens-world-gliding-championship-2022/club/2022-08-11/28B_LS4` moves at 18.5 m/s for 58 s from 11:21:33 UTC with 1 m of climb. `2023-club-and-sports-nationals-kingaroy-2023/18-meter/2023-10-12/310C_XXF` drives at up to 17.8 m/s for 377 s and 569 s from 21:23:33 UTC. `gs15_7.5` and `xcsoar` report flights there, for example `xcsoar` from 11:22:07 to 11:22:32 UTC in the first file. The 50 m climb condition rejects all 13 such segments in 11 corpus files, whose climb never exceeds 14 m, while the lowest real flight climbs 120 m.
- Short tail after the landing. `2022-south-african-nationals-15m-club-and-2-seater/club/2022-10-06/2106_12` stops at 14:17:50 UTC and the crew pushes the glider at 2.5 to 3.8 m/s until the file ends at 14:18:19. This is why the still speed is 4 m/s and not walking pace.
- Altitude spike and `V` fixes on the ground. `dmc2026-burg-feuerstein/club/2026-06-24/66O_1X` lands at 16:39:50 UTC with 4 to 5 s fixes, half of them `V`, and a single 15 m pressure altitude spike at 16:40:43. The trimmed altitude range and the 5 s bridge keep the ground period together.
- Pressure altitude of exactly zero. Venlo lies near sea level, and `nationale-junioren-wedstrijd-2026-venlo-2026/open/2026-08-01/681_KL` reads -1 to 0 m on the ground after landing at 15:37:00 UTC. The first version of the prototype followed the XCSoar replay ([`DebugReplayIGC.cpp` lines 70 to 82](https://github.com/XCSoar/XCSoar/blob/dd1d496283183cd521ae537f52bc6b2dfb482359/test/src/DebugReplayIGC.cpp#L70-L82)) and treated zero as missing, then fell back to the GNSS altitude of 82 m for those fixes. The mixed altitudes broke the ground period and left the file airborne. Zero is also a real dropout value: `12th-fai-womens-world-gliding-championship-garray-2023/club/2023-07-04/374_ET1` reads 0 m on a single fix on a 943 m field. The prototype now treats pressure altitude as missing only when every fix of a file reads zero. Among the original files this changed the result of `rec` for only `jegc2021/standard/2021-07-08/178_SB`, which now lands, and the tables above use the corrected parser. A detector must never mix pressure and GNSS altitude fix by fix, and it needs a spike-tolerant altitude check because a dropout to zero is a spike.
- File ends in flight. `euregiocup-2024/hasen/2024-05-11/45B_L2` (a fixture day) ends at 13:46:09 UTC at 466 m and climbing. `gs15_7.5` reports a landing on its last fix. Every detector except the two ground speed latches correctly warns.

## Flight date

On this corpus the flight date does not depend on the detector. Every detector gives the same 50 mismatches with the SoaringSpot day folder, and in every file the local date of the first fix equals the local date of the first take-off. The 50 mismatches are data problems that #277 already handles or that the scorer must fix:

- 14 are GPS week rollovers (dates such as 2005-11-20 for 2025-07-06) or files without a date.
- 26 lie one day early, 22 of them because `2020-south-african-nationals-welkom-2020/18m/2020-12-17` contains the files of 2020-12-16.
- 10 are files from other days, up to 795 days off.

No Australian, South African or American take-off in the original corpus falls on a different UTC date. Two New Zealand competitions were added later to reproduce the morning take-off case of #277: `new-zealand-national-multi-class-gliding-championships-2025` at Omarama with 179 files and `nz-multiclass-national-championships-jan-2026-matamata-2026` at Matamata with 147 files. New Zealand daylight time is UTC+13, so a take-off before 13:00 local time falls on the previous UTC date. That is the case for 103 of the 326 files. The local date of the first `rec` take-off in `Pacific/Auckland` matches the SoaringSpot day folder in 325 files, while its UTC date matches in only 224 and the `HFDTE` date in only 220. The remaining file carries a wrong `HFDTE` date from its recorder and needs a date override. UTC midnight falls at 13:00 local time, in the middle of the flight for 107 files, so the midnight crossing handling of #276 matters there as well. `rec` finds exactly one take-off and one landing in 320 of the 326 files. Five files start airborne, one ends airborne and none has a second take-off. Those six files were not inspected.

## Take-off reference altitude

This measurement compares the pressure altitude of the take-off fix (the first fix of the take-off run) with the last fix of the ground period before it. It covers every `rec` take-off in a file with pressure altitude that has a ground period before the run: 18,829 take-offs in the corpus (18,793 first take-offs and 36 relaunches) and 24 in the top-level files. IGC pressure altitudes have a resolution of 1 m. Because a still fix needs 30 s of stillness after it, the last ground fix lies a median of 37 s (1st to 99th percentile 33 to 46 s) before the take-off fix.

| Take-off fix minus | 1% | 5% | 25% | 50% | 75% | 95% | 99% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| last ground fix | -7 | -5 | -2 | -1 | 1 | 3 | 5 |
| median of the ground period | -7 | -5 | -2 | -1 | 1 | 3 | 5 |
| fix just before the take-off run | -3 | -2 | -1 | 0 | 0 | 1 | 2 |

The difference reaches 5 m in 1,643 take-offs (8.7%), 10 m in 88 (0.5%), 20 m in 15 and 50 m in 10. Winch-like launches (at least 100 m gained in the 30 s after the take-off fix, 716 take-offs) look the same as the rest. The top-level files stay within -6 to 3 m.

The 15 differences of 20 m or more come from the take-off fix, not from the ground:

- Recording gaps over the take-off run, where the first fast fix is already airborne. `dsmf24/club-klasse/2024-08-02/482_PE` records at 30 s intervals on the ground at 73 m, and its next fix at 10:41:33 UTC is at 840 m and 29 m/s. `37th-fai-world-gliding-championships-narromine-2023/15m/2023-12-05/3125_210` records every 10 s and its first fast fix at 02:29:45 UTC is already 30 m above the ground.
- Pressure altitude spikes on the take-off fix. `sa-gliding-nationals-2015-welkom-airfield-2015/open/2015-12-14/512E_133` stands at 1,362 to 1,365 m and records 683 m at its first moving fix at 10:26:21 UTC, while its GNSS altitude stays at 1,339 m. `12th-fai-womens-world-gliding-championship-garray-2023/club/2023-07-04/374_ET1` stands at 943 m and records a pressure altitude of exactly 0 at its take-off fix at 12:52:01 UTC.
- Ground gaps of more than 60 s before the run cause 7 of the 10 differences above 50 m.

5,807 more files with pressure altitude have a take-off but no ground period before it, because the recording starts a median of 22 s before the take-off run, too short for a 30 s still window. In those files the take-off fix differs from the first fix by -5 to 3 m (5th to 95th percentile), by 10 m or more in 14 files and by 50 m or more in 7.

In normal files the choice does not matter, because both fixes agree within the 1 m resolution plus a few metres of noise. The ground fix is more robust because a recording gap or a pressure spike on the take-off fix moves the reference by tens or hundreds of metres.

### Single fix or window

A second measurement compares single fixes with medians and means over windows. It covers 25,525 take-offs from the original corpus, the [winch competitions](#winch-launches) and the top-level files. The roll start is the last fix before the take-off run whose fix-to-fix speed is below 2 m/s. It lies a median of 10 s (5th to 95th percentile 7 to 15 s) before the take-off fix. No ground truth exists, so the proxy is the median pressure altitude 60 to 120 s before the roll start, in the 7,529 take-offs (213 of them winch launches) where the glider was stationary over that whole minute. The proxy shares fixes with the ground period estimators below and slightly favours them. The last two rows combine an estimator with a fallback for take-offs without a ground period before them.

| Estimator | MAE (m) | 1% / 99% (m) | 3 m or more | 10 m or more |
| --- | ---: | --- | ---: | ---: |
| take-off fix | 2.19 | -8 / 7 | 30.1% | 72 |
| roll start fix | 0.56 | -2 / 3 | 2.0% | 8 |
| first fix of the file | 0.48 | -3 / 1 | 1.4% | 28 |
| last ground fix | 0.34 | -2 / 1 | 0.6% | 1 |
| median of the 30 s before the roll start | 0.32 | -2 / 1 | 0.6% | 1 |
| mean of the 30 s before the roll start | 0.36 | -1.9 / 1.2 | 0.5% | 1 |
| median of the 60 s before the roll start | 0.26 | -2 / 1 | 0.4% | 1 |
| median of the last 30 s of the ground period | 0.24 | -1.5 / 1 | 0.3% | 1 |
| last ground fix, else roll start fix | 0.34 | -2 / 1 | 0.6% | 1 |
| ground period median, else 30 s median before the roll start | 0.24 | -1.5 / 1 | 0.3% | 1 |

The winch take-offs alone give the same order. Their take-off fix has a mean absolute error of 4.19 m, and every other estimator stays between 0.20 and 0.48 m without a single error of 3 m or more.

The altitude stays flat before the roll. The mean of the 5 s bins relative to the proxy stays within 0.1 m from 180 s before the roll start to the roll start, then drops to -0.45 m 5 s into the roll and -1.15 m 10 s into it. The take-off fix therefore carries a systematic bias of about -1 m on top of its noise. The single outlier shared by all window estimators is `22nd-fai-european-gliding-championships-tabor-2024/club/2024-08-14/48E_311`, which stands at 425 m and then at 449 m at the launch point. That is a real change of position, so the launch point value is the right one.

Every window estimator removes the noise of a single fix, and the gain over the last ground fix is a few tenths of a metre. A median rejects a single pressure spike, while a mean does not. Restricting the 30 s window to fixes below 2 m/s changes no result, because the window already ends at the roll start.

The proxy needs a stationary minute, so it misses the hardest cases. Among the 17,996 take-offs without a proxy, the last ground fix, the ground period median and the 30 s and 60 s medians before the roll start differ by 5 m or more in 15 take-offs. Inspecting them shows three failure modes:

- GNSS position frozen during the launch. In `22nd-fai-european-gliding-championships-tabor-2024/standard/2024-08-01/481_YA` the position stays at 49.39047, 14.70943 with zero ground speed from 10:53:10 to 10:53:46 UTC while the pressure altitude climbs from 414 to 569 m. The roll start found from ground speed lies after the launch, and the 30 s median before it gives 483 m against 413 m on the ground. `39th-fai-world-gliding-championships-tabor-2025/standard/2025-06-15/56F_ET` gives 528 m against 452 m. The ground period requires the altitude to stay within 6 m, so it gives 413 m and 452 m.
- A pressure dip at the start of a winch launch. `teutorace-22-oerlinghausen-2022/double-seater/2022-08-07/287_BA` stands at 69 m, and the pressure altitude drops to 62 m at 10:54:55 UTC as the winch accelerates the glider, while its GNSS position stays frozen. The roll start fix lands in the dip, while the 30 s median gives 69 m. In nine take-offs without a ground period, the roll start fix differs from the 30 s median by 4 to 11 m, among them `286_BA` and `283_BA` from the same glider and four `S4` files from the junior championships of 2022 and 2023. Only `287_BA` was inspected fix by fix, so the cause of the other offsets is not confirmed.
- A frozen position after an unrecorded launch that looks like ground. `nationale-kampioenschappen-zweefvliegen-2026-terlet-2026/20m-tweezitter/2026-05-16/65G_EX` stands at 131 m until 13:59:58 UTC. The next four fixes, from 13:59:59 to 14:00:14, keep the same position at 179 to 184 m, and the next fix at 14:01:17 is at 239 m and 25 m/s. The four airborne fixes stay within 6 m and form their own ground period, so the last ground fix (181 m) and the ground period median (179 m) are wrong, while the 30 s and 60 s medians before the roll start give 131 m. The ground period detector should reject a ground period that starts 48 m above the one before it without a moving segment between them.

The recommended reference is the median pressure altitude of the last 30 s of the ground period before the take-off run. When no ground period precedes the take-off, which is the case for 24% of take-offs, the fallback is the median of the 30 s before the roll start, which in those files usually reaches back to the first fix. The simpler pair of the last ground fix with the roll start fix as fallback is as accurate against the proxy, but its fallback can land in the pressure dip at the start of the roll. A single fix is acceptable only from the ground period, where the altitude check excludes the dip.

## Open questions and risks

- **Files that start in the take-off run.** 515 files start at 15 to 25 m/s on the runway. A strict reading of "first fix already flying" warns for them. Their first fix is still close to field elevation, but the pressure altitude "before takeoff" that Annex A 5.3.1 wants is not recorded, and the missing take-off warning suggests a penalty under Annex A. The user needs to decide whether such a file has a take-off.
- **Take-off reference fix.** Neither rule set says which fix gives the pressure altitude "at takeoff" (Annex A 5.3.1) or the "Referenzhöhe beim Start" (SWO 10.3). The chosen reference is the median of the last 30 s of the ground period before the take-off run, with the median of the 30 s before the roll start as fallback, as [Single fix or window](#single-fix-or-window) explains.
- **Ground periods after an unrecorded launch.** A frozen GNSS position with level pressure altitude after a launch the logger did not record forms a false ground period, as in `65G_EX`. The ground period detector should reject a ground period that starts far above the one before it without a moving segment between them. No threshold for this was evaluated.
- **Wave hover margin.** The only protection against the `537399` hover is the 6 m altitude range together with the 20 s ground period. The corpus contains almost no wave or ridge flying. A hover that holds altitude within 6 m for 50 s would become a landing and could delete the take-off before it. Logger TAS above about 70 km/h could veto still fixes when present, at the cost of a second input.
- **No ground truth.** All numbers use proxies and manual inspection, not labelled take-offs and landings. The landing is the end of the roll-out (speed below 6 m/s), not the touchdown, which matters for the Annex A outlanding position at the flight end.
- **Winch launches and motor gliders.** [Winch launches](#winch-launches) shows that the detector needs no changes for winch launches. Engine runs do not affect the detector. A motor glider that relaunches in the air under SWO 7.2.9 has no landing, which is correct.
