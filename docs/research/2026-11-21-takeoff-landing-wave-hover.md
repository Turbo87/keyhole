# Take-off and landing detection in wave hovers

This addendum to [Take-off and landing detection](2026-11-19-takeoff-landing-detection.md) asks how the detector of #277 can handle a glider that hovers in wave without losing its accuracy on competition files. The first implementation of that detector (`keyhole-engine/src/flight_analysis/flight_detection.rs`) is called `branch` here. It loses the real take-off in three WeGlide wave flights and reports a false landing high in the air in a fourth.

SoaringSpot files are named by competition, class, day and IGC file name, as in the first note, and each name links to its competition on SoaringSpot. WeGlide flights link to their flight page. The 29 WeGlide flights that the first round also used are the other WeGlide files here.

## Summary

A hover is not ground because the glider never comes to rest. On the ground the GNSS position stays within a few metres for minutes. In a hover the glider drifts at 1 to 3 m/s, so it leaves any 5 m circle within 14 s. The recommended detector `rest` keeps `branch` unchanged and adds one condition to the ground periods:

1. Keep a ground reference. It starts at the altitude of the first valid fix and drops to the median altitude of each accepted ground period that lies lower.
2. Take the ground periods in time order. A ground period is raised when its median altitude lies more than 50 m (the `CLIMB` of `branch`) above the ground reference.
3. A raised ground period that reaches neither the first nor the last fix is accepted only when it contains a rest. A period at the first fix is rarely raised, because the reference starts there. A rest is a fix from which every following fix stays within 5 m of it for at least 20 s. The search covers the fixes from the first fix of the period to the last fix of the 30 s still window of its last fix.
4. A ground period that fails this test is not ground. Its fixes belong to the moving segment around it, and they do not count as a reference for the climb condition or for later periods.

Everything else stays as in `branch`, except the 20 s merge rule, which `rest` drops because it no longer changes any file (see [The merge rule](#the-merge-rule)). The engine also reports each take-off at the first fix that the glider reaches at 15 km/h or more on its way into the take-off run, which in 1 s recordings lies a median of 5 s before the take-off times in this note.

On the 25,372 SoaringSpot files that the engine reads, `rest` gives the same flights as `branch` in every file, and also in all 1,215 winch and New Zealand files. It finds the real take-off and the real landing in all 46 WeGlide wave files, 30 of them downloaded for this round, and in all 29 other WeGlide files. `branch` gets 9 of the wave files wrong. The same rule also removes a false ground period that a GNSS outage in flight creates in one of the new files.

The prototype and its scripts are not part of this repository.

## Baseline port

The new prototype links `keyhole-engine` with the `branch` detector. It parses every file with `analyze_file()` and runs a port of `flight_detection.rs` on the same valid fixes. On all 26,637 files that the engine reads (26,587 of the 26,590 SoaringSpot files, the 29 other WeGlide files and the first 21 wave files), the port gives exactly the take-off and landing times of the engine. The engine rejects 3 SoaringSpot files that lack a logger identity, a recorded date or a valid fix: [`21st-fai-european-gliding-championships-pociunai-2022/club/2022-07-04/274_IV`](https://www.soaringspot.com/en_gb/21st-fai-european-gliding-championships-pociunai-2022/), [`dm-dosi-brb2025/doppelsitzer/2025-08-14/58E_FM`](https://www.soaringspot.com/en_gb/dm-dosi-brb2025/) and [`sanats2026/club/2026-10-07/6107_WM`](https://www.soaringspot.com/en_gb/sanats2026/). The corpus counts below therefore cover 25,372 of the original 25,375 files.

`branch` differs from `rec` of the first round only through its speeds. Among the files both read, 38 change their structure. 37 files now start airborne because their first fixes already exceed the take-off speed of 50 km/h, which lies below the 54 km/h (15 m/s) of `rec`. [`junior-world-gliding-championships-2022-tabor-2022/class-club/2022-08-09/289_CK`](https://www.soaringspot.com/en_gb/junior-world-gliding-championships-2022-tabor-2022/) now ends airborne because the glider stops at 15:22:35 UTC and the file ends 27 s later. The take-off moves by a median of -1 s (1st to 99th percentile -3 to 0 s) and the landing by +2 s (0 to 7 s), because the take-off and landing speeds are lower.

## The failure mechanism

`branch` marks a fix as still when every fix-to-fix speed over the 30 s after it stays below 15 km/h and the trimmed altitude range stays within 6 m (pressure) or 20 m (GNSS). A wave hover meets both conditions for a few seconds. A run of still fixes of 5 s is a ground period, so the hover becomes a ground period at wave height. The moving segment before it counts as a flight only if it climbs 50 m above the higher of the ground periods around it, and the hover sets that reference. The real launch climbs less than the hover altitude, so the take-off is lost and the segment is ground movement. The segment after the hover often climbs above the hover again and becomes the only flight.

Each airborne stretch that `branch` turns into a ground period, with its rest measured as in rule 3:

| File | Start (UTC) | Interval (s) | Duration (s) | Above reference (m) | Rest within 5 m (s) | Rest within 10 m (s) | Above terrain (m) | TAS (km/h) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [`121167`](https://www.weglide.org/flight/121167) | 15:00:47 | 1 | 12 | 2,445 | 10 | 15 | 2,764 | 103 |
| [`1222277`](https://www.weglide.org/flight/1222277) | 14:47:34 | 1 | 7 | 3,274 | 4 | 8 | 3,307 | 88 |
| [`1222277`](https://www.weglide.org/flight/1222277) | 15:08:46 | 1 | 33 | 2,814 | 14 | 26 | 1,967 | 90 |
| [`1225052`](https://www.weglide.org/flight/1225052) | 13:41:15 | 1, GNSS outage | 6 | 1,782 | 6 | 6 | 413 | none |
| [`1226707`](https://www.weglide.org/flight/1226707) | 10:26:39 | 4 to 8 | 8 | 1,054 | 0 | 4 | 1,149 | none |
| [`1229599`](https://www.weglide.org/flight/1229599) | 13:26:41 | 1 | 5 | 920 | 3 | 7 | 948 | none |
| [`1254846`](https://www.weglide.org/flight/1254846) | 11:40:59 | 2 | 10 | 3,822 | 4 | 6 | 3,729 | 129 |
| [`1254846`](https://www.weglide.org/flight/1254846) | 11:41:40 | 2 | 10 | 3,834 | 6 | 12 | 3,736 | 129 |

The reference is the lower of the first fix and the earlier ground periods. The height above terrain uses the GNSS altitude and Copernicus GLO-90 (see [Terrain elevation](#terrain-elevation)).

The ground periods that rule 3 tests in the corpus look different. 24 SoaringSpot ground periods lie more than 50 m above the reference and do not reach the end of the file. Their rest lasts at least 28 s, and the shortest are stops after a landing, followed by a push. Some are raised only because of the pressure sensor. [`13th-fai-womens-world-gliding-championship-zbraslavice-2025/club/2025-08-06/586_CK`](https://www.soaringspot.com/en_gb/13th-fai-womens-world-gliding-championship-zbraslavice-2025/) stands after landing at 14:32:04 UTC with a pressure altitude of 1,457 m against 383 m at take-off, while its GNSS altitude stays at 524 m. Such a period has a long rest and stays ground.

## Empirical results

The prototype ran every variant on the 25,372 original SoaringSpot files, the 889 winch and 326 New Zealand files, the 29 other WeGlide files and 21 wave files. The first 16 wave files were collected before this round. Five more come from a list of WeGlide wave flights screened for slow and level stretches: [`1015261`](https://www.weglide.org/flight/1015261) (Gap, HpH 304C), [`1258136`](https://www.weglide.org/flight/1258136) (Aboyne, ASW 20), [`1225365`](https://www.weglide.org/flight/1225365) (Gap, Taurus), [`1222277`](https://www.weglide.org/flight/1222277) (Gap, LS 3) and [`1225052`](https://www.weglide.org/flight/1225052) (Puimoisson, ASH 25 E). For these five, WeGlide's own take-off and landing times serve as a check, with a tolerance of 150 s on the take-off and 60 s on the landing. For [`1229599`](https://www.weglide.org/flight/1229599), [`1226707`](https://www.weglide.org/flight/1226707) and [`1254846`](https://www.weglide.org/flight/1254846) the expected take-offs are the verified launches at 12:56:41, about 09:49 and about 09:44 UTC. For all other WeGlide files the expected result is that of `branch`, which the first round and manual checks verified.

The variants:

- `branch` is the engine detector, and `branch_nomerge` drops its 20 s merge rule.
- `rest` is the recommended rest test with the merge rule of `branch`. `rest_nomerge` drops the merge rule and is the final recommendation. `rest_groundref` takes the reference from ground periods only and ignores the first fix. `rest_h0` and `rest_h100` test periods more than 0 m or 100 m above the reference. `rest_5m_15s`, `rest_5m_25s`, `rest_3m_20s` and `rest_10m_30s` change the radius and the time of the rest. `rest_noendexempt` also tests periods that reach the first or the last fix. `rest_everywhere` tests every ground period that reaches neither end, at any height, and `rest_everywhere_noendexempt` tests every ground period.
- `descent` (hypothesis 2) requires a ground period after moving fixes with a take-off run to lie at least 30 m below the highest fix of the 120 s before it. `arrival` requires a fix faster than 50 km/h within the 60 s before the ground period.
- `trusted_ref` (hypothesis 3) does not use a ground period more than 300 m above the lowest earlier ground period as a climb reference, but keeps it as ground.
- `terrain500` and `terrain250` (hypothesis 4) reject a ground period whose median GNSS altitude lies more than 500 m or 250 m above the terrain. `rest_terrain500` adds the 500 m rule to `rest`.
- `tas70` and `tas90` (hypothesis 5) mark a fix as not still when the median TAS of its window exceeds 70 or 90 km/h. `rest_tas90` adds the 90 km/h rule to `rest`.

| Variant | 1 take-off, 1 landing | >1 take-off | Relaunch within 180 s | Starts airborne | Ends airborne | Changed vs `branch` | Winch and NZ ends airborne | WeGlide files wrong |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `branch` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 5: [`1222277`](https://www.weglide.org/flight/1222277), [`1225052`](https://www.weglide.org/flight/1225052), [`1226707`](https://www.weglide.org/flight/1226707), [`1229599`](https://www.weglide.org/flight/1229599), [`1254846`](https://www.weglide.org/flight/1254846) |
| `branch_nomerge` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 6: [`121167`](https://www.weglide.org/flight/121167), [`1222277`](https://www.weglide.org/flight/1222277), [`1225052`](https://www.weglide.org/flight/1225052), [`1226707`](https://www.weglide.org/flight/1226707), [`1229599`](https://www.weglide.org/flight/1229599), [`1254846`](https://www.weglide.org/flight/1254846) |
| `rest` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 0 |
| `rest_nomerge` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 0 |
| `rest_groundref` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 1: [`1222277`](https://www.weglide.org/flight/1222277) |
| `rest_h0` | 24,514 | 34 | 4 | 761 | 57 | 6 | 3 | 0 |
| `rest_h100` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 0 |
| `rest_5m_15s` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 0 |
| `rest_5m_25s` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 0 |
| `rest_3m_20s` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 0 |
| `rest_10m_30s` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 0 |
| `rest_noendexempt` | 24,497 | 34 | 4 | 761 | 74 | 17 | 5 | 1: [`1222277`](https://www.weglide.org/flight/1222277) |
| `rest_everywhere` | 24,514 | 34 | 4 | 761 | 57 | 6 | 3 | 0 |
| `rest_everywhere_noendexempt` | 23,694 | 34 | 4 | 761 | 896 | 843 | 75 | 6: [`1253748`](https://www.weglide.org/flight/1253748), [`1258136`](https://www.weglide.org/flight/1258136), [`502165`](https://www.weglide.org/flight/502165), [`658209`](https://www.weglide.org/flight/658209), [`1190929`](https://www.weglide.org/flight/1190929), [`1191332`](https://www.weglide.org/flight/1191332) |
| `descent` | 24,483 | 34 | 4 | 764 | 89 | 39 | 5 | 2: [`1225052`](https://www.weglide.org/flight/1225052), [`496729`](https://www.weglide.org/flight/496729) |
| `arrival` | 24,486 | 34 | 4 | 761 | 86 | 31 | 3 | 3: [`1225052`](https://www.weglide.org/flight/1225052), [`1226707`](https://www.weglide.org/flight/1226707), [`496729`](https://www.weglide.org/flight/496729) |
| `trusted_ref` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 3: [`1222277`](https://www.weglide.org/flight/1222277), [`1225052`](https://www.weglide.org/flight/1225052), [`1254846`](https://www.weglide.org/flight/1254846) |
| `trusted_ref_nomerge` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 6: [`121167`](https://www.weglide.org/flight/121167), [`1222277`](https://www.weglide.org/flight/1222277), [`1225052`](https://www.weglide.org/flight/1225052), [`1226707`](https://www.weglide.org/flight/1226707), [`1229599`](https://www.weglide.org/flight/1229599), [`1254846`](https://www.weglide.org/flight/1254846) |
| `terrain500` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 1: [`1225052`](https://www.weglide.org/flight/1225052) |
| `terrain250` | 24,512 | 34 | 4 | 761 | 59 | 2 | 3 | 0 |
| `rest_terrain500` | 24,514 | 34 | 4 | 761 | 57 | 0 | 3 | 0 |
| `tas70` | 24,513 | 33 | 4 | 761 | 59 | 5 | 3 | 3: [`1225052`](https://www.weglide.org/flight/1225052), [`1226707`](https://www.weglide.org/flight/1226707), [`1229599`](https://www.weglide.org/flight/1229599) |
| `tas90` | 24,512 | 34 | 4 | 761 | 59 | 2 | 3 | 4: [`1222277`](https://www.weglide.org/flight/1222277), [`1225052`](https://www.weglide.org/flight/1225052), [`1226707`](https://www.weglide.org/flight/1226707), [`1229599`](https://www.weglide.org/flight/1229599) |
| `rest_tas90` | 24,512 | 34 | 4 | 761 | 59 | 2 | 3 | 0 |

"Changed vs `branch`" counts original corpus files whose flights differ in any time. `rest`, `rest_nomerge` and every `rest_*` variant with a height threshold of 50 m or more change no file among all 26,587 SoaringSpot files that the engine reads. The 34 files with several take-offs stay the same, among them [`wgc2021-club-std-15m-montlucon-gueret-2021/standard/2021-08-13/18D_220`](https://www.soaringspot.com/en_gb/wgc2021-club-std-15m-montlucon-gueret-2021/). So do the outlandings on higher ground such as [`dm-zwickau-2024/15-meter/2024-06-16/46G_28`](https://www.soaringspot.com/en_gb/dm-zwickau-2024/), the ground tows, the winch launches, the files near sea level and the files that start in the take-off run or end in flight. The nine fixtures in `keyhole-engine/tests/fixtures/` give the same flights under `branch`, `rest` and `rest_nomerge`.

Flights per WeGlide wave file, in UTC:

| File | Site | Interval (s) | `branch` | `branch_nomerge` | `rest` |
| --- | --- | ---: | --- | --- | --- |
| [`537399`](https://www.weglide.org/flight/537399) | Puimoisson | 1 | 11:21:57 to 18:03:40 | 11:21:57 to 18:03:40 | 11:21:57 to 18:03:40 |
| [`1015312`](https://www.weglide.org/flight/1015312) | Puimoisson | 4 | 11:18:02 to 17:48:03 | 11:18:02 to 17:48:03 | 11:18:02 to 17:48:03 |
| [`1023558`](https://www.weglide.org/flight/1023558) | Puimoisson | 1 | 09:09:27 to 16:33:17 | 09:09:27 to 16:33:17 | 09:09:27 to 16:33:17 |
| [`121167`](https://www.weglide.org/flight/121167) | Sutton Bank | 1 | 13:51:05 to 15:42:32 | 13:51:05 to 15:00:47, 15:01:40 to 15:42:32 | 13:51:05 to 15:42:32 |
| [`1226707`](https://www.weglide.org/flight/1226707) | Portmoak | 4 | 10:28:23 to 15:04:35 | 10:28:23 to 15:04:35 | 09:49:12 to 15:04:35 |
| [`1229599`](https://www.weglide.org/flight/1229599) | Portmoak | 1 | 13:27:42 to 13:53:19 | 13:27:42 to 13:53:19 | 12:56:41 to 13:53:19 |
| [`1248253`](https://www.weglide.org/flight/1248253) | Aboyne | 1 | 08:51:20 to 11:36:18 | 08:51:20 to 11:36:18 | 08:51:20 to 11:36:18 |
| [`1253748`](https://www.weglide.org/flight/1253748) | Aboyne | 1 | 11:25:55 to 13:23:15 | 11:25:55 to 13:23:15 | 11:25:55 to 13:23:15 |
| [`1254846`](https://www.weglide.org/flight/1254846) | Aboyne | 2 | 11:56:04 to 12:57:20 | 11:56:04 to 12:57:20 | 09:45:00 to 12:57:20 |
| [`1015261`](https://www.weglide.org/flight/1015261) | Gap | 1 | 12:54:29 to 16:33:47 | 12:54:29 to 16:33:47 | 12:54:29 to 16:33:47 |
| [`1222277`](https://www.weglide.org/flight/1222277) | Gap | 1 | 12:06:00 to 15:08:46 | 12:06:00 to 14:47:34, 14:49:42 to 15:08:46 | 12:06:00 to 16:15:51 |
| [`1225052`](https://www.weglide.org/flight/1225052) | Puimoisson | 1 | 10:09:22 to 13:40:52, 13:44:12 to 14:23:47 | 10:09:22 to 13:40:52, 13:44:12 to 14:23:47 | 10:09:22 to 14:23:47 |
| [`1225365`](https://www.weglide.org/flight/1225365) | Gap | 2 | 13:02:47 to 16:00:42 | 13:02:47 to 16:00:42 | 13:02:47 to 16:00:42 |
| [`1258136`](https://www.weglide.org/flight/1258136) | Aboyne | 1 | 10:09:20 to 13:44:18 | 10:09:20 to 13:44:18 | 10:09:20 to 13:44:18 |

The ten earlier wave record flights ([`1134809`](https://www.weglide.org/flight/1134809), [`359077`](https://www.weglide.org/flight/359077), [`365514`](https://www.weglide.org/flight/365514), [`367549`](https://www.weglide.org/flight/367549), [`367629`](https://www.weglide.org/flight/367629), [`370033`](https://www.weglide.org/flight/370033), [`496729`](https://www.weglide.org/flight/496729), [`502165`](https://www.weglide.org/flight/502165), [`939038`](https://www.weglide.org/flight/939038), [`978820`](https://www.weglide.org/flight/978820)) and the WeGlide flight [`658209`](https://www.weglide.org/flight/658209) give the same single flight under all three detectors. WeGlide reports 12:06:03 to 16:15:44 for [`1222277`](https://www.weglide.org/flight/1222277) and 10:09:12 to 14:23:32 for [`1225052`](https://www.weglide.org/flight/1225052), which `rest` matches within 7 s and 15 s.

[`1222277`](https://www.weglide.org/flight/1222277) shows two new failure patterns. Its file starts 24 s before the take-off run, too short for a still window, so it has no ground period before the take-off. This is the case for 24% of take-offs in the corpus, as the first round found. A reference taken from ground periods only, as in `rest_groundref`, accepts the first hover at 14:47:34 UTC as ground and measures the second one at 15:08:46 against it. The first fix gives the missing reference. The second hover is also the slowest one in the data. It lasts 33 s and stays within 5 m for 14 s. `branch` lands there at 3,379 m and loses the real landing at 16:15:51, because the segment after the hover never climbs back above it. [`1225052`](https://www.weglide.org/flight/1225052) is not a hover. Its logger loses the GNSS fix in flight from 13:40:53 to 13:44:10 UTC and records `V` fixes, with only three valid fixes at 13:41:15, 13:41:20 and 13:41:21 at 2,502 to 2,505 m. A fix before a recording gap is judged with its neighbours, so these three fixes form a ground period. `branch` lands at 13:40:52 and takes off again at 13:44:12, and the merge rule does not apply because 199 s pass between the two flights. The three fixes span 6 s, so `rest` rejects them.

### More wave files

25 more WeGlide wave flights from the same list were checked after the variants above were chosen, starting with those that drift slowest. They come from Aboyne, Gap, Portmoak, Sutton Bank, Sisteron, St Auban, Fayence and Omarama. All record at 1 s, and 22 are aerotows and 3 self-launches. `rest` finds the right single flight in all 25, within 6 s of WeGlide's take-off and 23 s of its landing. In [`939193`](https://www.weglide.org/flight/939193) WeGlide's own take-off at 08:54:19 UTC is wrong, because the pressure altitude reads 0 until 08:54:27 while the take-off run starts at 08:50:05.

`branch` fails on 4 of the 25. [`1254187`](https://www.weglide.org/flight/1254187) and [`1222194`](https://www.weglide.org/flight/1222194) lose the real take-off, [`1222343`](https://www.weglide.org/flight/1222343) lands and takes off again at 3,920 m, and [`1254393`](https://www.weglide.org/flight/1254393) gives no flight at all. The 11 airborne ground periods in these files rest 3 to 12 s, so across all 46 wave files the 19 airborne ground periods rest at most 14 s.

The new files show a different risk than slow drift. In wave a glider can stand still over the ground for longer than 20 s:

| File | Start (UTC) | Rest within 5 m (s) | Altitude during the rest |
| --- | --- | ---: | --- |
| [`1254187`](https://www.weglide.org/flight/1254187) | 10:34:26 | 36 | climbs 16 m |
| [`1024584`](https://www.weglide.org/flight/1024584) | 13:50:09 | 26 | climbs 28 m |
| [`1222194`](https://www.weglide.org/flight/1222194) | 12:40:44 | 23 | climbs 8 m |
| [`1023605`](https://www.weglide.org/flight/1023605) | 14:34:13 | 23 | climbs 55 m |
| [`1222343`](https://www.weglide.org/flight/1222343) | 13:38:26 | 18 | climbs 9 m |
| [`1024584`](https://www.weglide.org/flight/1024584) | 13:06:11 | 15 | level, 5,395 to 5,397 m |

None of these lies in a ground period, because the glider climbs more than the 6 m altitude range of the still window. Only that climb keeps them out of the rest test.

### Stricter stillness (hypothesis 1)

A rest test on its own catches every hover and the GNSS outage in the data. The question is where to apply it. Applied to every ground period that reaches neither end of the file (`rest_everywhere`), it changes 6 corpus files. All 6 are landings followed by a slow roll or taxi at 7 to 14 km/h, where `branch` puts a short ground period on the slow roll and the rest test moves the landing to the next ground period. [`2019-south-african-nationals-18m-open-and-sports-welkom-2019/sports/2019-12-15/912F_S12`](https://www.soaringspot.com/en_gb/2019-south-african-nationals-18m-open-and-sports-welkom-2019/) lands at 15:53:06 instead of 15:52:30 UTC, and the wave file [`978820`](https://www.weglide.org/flight/978820) would land at 23:43:12 instead of 23:42:24 UTC if it were tested. Limiting the test to raised ground periods removes these changes, because a slow roll stays at the height of the landing field.

The test must spare ground periods that reach the last fix. Of the 1,096 such periods more than 50 m above the reference, 32 stay within 5 m for less than 20 s, because the file ends seconds after the glider stops. `rest_noendexempt` leaves 17 more corpus files airborne, among them outlandings on higher ground.

The radius and the time are not sensitive. Every combination from 3 m and 15 s to 10 m and 30 s changes no corpus file and fixes every wave file. The hovers stay within 5 m for at most 14 s, and the corpus periods that the test applies to rest for at least 28 s. The 20 s of `rest` lies between both. A median speed or position spread over the whole period separates the same cases less well, because a landing period often includes the last metres of the roll and a push.

GSP readings of zero were not used. Many loggers do not record `GSP`, and the position test needs no extension.

### Landing into a ground period (hypothesis 2)

Hovers do not differ enough from landings in how the glider arrives. [`1226707`](https://www.weglide.org/flight/1226707) flies at 130 km/h 32 s before its hover, so `arrival` keeps that hover. A descent of 30 m within 120 s separates the hovers, which arrive level, but 204 of the 26,471 corpus ground periods at the end of a file (0.8%) also arrive with less descent after a fast fix, mostly after a long roll-out or a gap in the recording. `descent` leaves 32 more corpus files airborne and breaks [`496729`](https://www.weglide.org/flight/496729). Both variants were dropped.

### A safer climb reference (hypothesis 3)

Not using a raised ground period as the climb reference (`trusted_ref`) keeps the launch as a flight, but the hover remains ground. The flight then lands at the hover, and only the merge rule joins the two halves again when the hover is shorter than 20 s. It fixes [`1226707`](https://www.weglide.org/flight/1226707), [`1229599`](https://www.weglide.org/flight/1229599) and [`121167`](https://www.weglide.org/flight/121167) only with the merge rule and fails on [`1254846`](https://www.weglide.org/flight/1254846), whose two hovers start 41 s apart, and on [`1222277`](https://www.weglide.org/flight/1222277) and [`1225052`](https://www.weglide.org/flight/1225052). Rejecting a suspicious ground period as ground, as `rest` does, is simpler and fixes all of them.

### Terrain elevation (hypothesis 4)

The prototype read [Copernicus DEM GLO-90](https://registry.opendata.aws/copernicus-dem/) from its public AWS bucket with `gdallocationinfo` and no credentials. Its heights are above the EGM2008 geoid, while many loggers record GNSS altitude above the WGS84 ellipsoid, which explains the median of +42 m for ground periods in the corpus. The 99.9th percentile is +101 m and the highest is +364 m, caused by GNSS altitude errors on the ground, such as [`dm-clubklasse-burg-feuerstein-burg-feuerstein-2024/club/2024-06-23/46N_RW`](https://www.soaringspot.com/en_gb/dm-clubklasse-burg-feuerstein-burg-feuerstein-2024/) at 753 m GNSS altitude on a 498 m field after landing. No corpus ground period lies more than 500 m above the terrain, while the hovers lie 948 to 3,736 m above it and the outage in [`1225052`](https://www.weglide.org/flight/1225052) lies 413 m above it.

`terrain500` alone misses the outage in [`1225052`](https://www.weglide.org/flight/1225052), which lies only 413 m above the mountains near Puimoisson. `terrain250` catches it but leaves 2 corpus files airborne because of GNSS altitude errors. A threshold that is safe on the ground is too high for low hovers and outages over mountains, so terrain can only confirm what `rest` already decides. `rest_terrain500` gives the same results as `rest`.

The engine has no I/O, so terrain would be another input from the caller. The corpus alone touches 131 GLO-90 tiles of 1° by 1°. The four tiles measured hold 3.6 to 5.2 MB each, so worldwide coverage needs tens of gigabytes, or a coarser derived grid. The data is free to use under the Copernicus DEM licence with attribution. Whether its terms fit Keyhole's distribution was not reviewed. Terrain is not recommended for this detector.

### ENL and logger TAS (hypothesis 5)

ENL does not separate hovers from ground. Its median is 4 in the hovers and 4 in 95% of the corpus ground periods, because a hovering glider is quiet.

TAS separates the hovers that record it (88 to 129 km/h), and only 24 of 33,861 corpus ground periods with TAS have a median of 70 km/h or more. But TAS is wrong on the ground in exactly the files where it matters. [`egc2023/18m/2023-07-30/37U_AL`](https://www.soaringspot.com/en_gb/egc2023/) and [`wgc2026/open/2026-05-29/65T_UFO`](https://www.soaringspot.com/en_gb/wgc2026/) report a median TAS of 140 km/h while standing after landing at 15:37:51 and 15:39:32 UTC, so `tas90` leaves both airborne. Three of the hover files and the outage file have no TAS at all. TAS is not recommended as a veto, not even alongside `rest`.

## Parameters

`rest` without the merge rule has 11 parameters:

| Parameter | Value | Role |
| --- | --- | --- |
| Still window | 30 s | How long after a fix the glider has to be still |
| Still speed | 15 km/h | The highest fix-to-fix speed in a still window, and the speed below which the roll-out ends at the landing |
| Still altitude range | 6 m pressure, 20 m GNSS | The widest trimmed altitude range in a still window |
| Trim size | 5 fixes | The fewest fixes in a window from which the highest and lowest altitude are dropped |
| Still gap | 5 s | The longest gap between two still fixes of one ground period |
| Shortest ground period | 5 s | The shortest run of still fixes away from the ends of the file (3 fixes at the end) |
| Take-off speed | 50 km/h | The fix-to-fix speed of a take-off run |
| Take-off run | 10 s | The shortest take-off run |
| Climb | 50 m | How far a flight climbs above the ground around it, and how far a ground period lies above the reference to be raised |
| Rest radius | 5 m | How far the glider moves horizontally during a rest |
| Rest time | 20 s | The shortest rest |

Several of them were tested for a shared value on all 26,662 files that the engine reads, including the 46 wave files. Dropping the merge rule changes no file. A rest time equal to the still window (30 s) moves one landing by 37 s, in [`39th-fai-world-gliding-championships-tabor-2025/club/2025-06-09/569_FP`](https://www.soaringspot.com/en_gb/39th-fai-world-gliding-championships-tabor-2025/), whose ground period after the landing rests between 28 and 30 s. A shortest ground period equal to the take-off run (10 s) moves 28 landings by 36 to 99 s, and a take-off run equal to the still gap (5 s) moves 21 take-offs by 6 to 10 s. A rest radius equal to the still altitude range (6 m) changes no file, but it ties a horizontal distance to a vertical range, and GNSS files would still need their own altitude range. A rest test on every ground period instead of the raised ones removes the reference and the first fix rule, but moves 7 landings by 36 to 66 s, and with a 30 s rest it also loses the second take-off of [`wgc2026/open/2026-05-19/65J_5`](https://www.soaringspot.com/en_gb/wgc2026/).

## The merge rule

The 20 s merge rule never changes a result in the corpus, under `branch` or `rest`. Its only effect in all the data is on [`121167`](https://www.weglide.org/flight/121167) under `branch`, and `rest` handles that hover without it, because the hover lies 2,445 m above the reference. `rest_nomerge` and `rest` give identical results on every file.

The rule would still protect against a hover within 50 m of the ground reference, such as ridge soaring just above a hilltop field, but only when that hover lasts less than 20 s. No such hover is in the data, and the 46 wave files and the whole corpus give the same flights without it. `rest` drops the rule to keep the detector smaller.

## Failure cases of the recommendation

- A level hover in which the glider stays within 5 m for 20 s becomes ground. In the 46 wave files the airborne ground periods rest at most 14 s, but the glider stands still over the ground for up to 36 s while it climbs slowly, as [More wave files](#more-wave-files) shows. A level hover of that length would pass the still window and the rest test. A longer rest time cannot close this gap, because real raised ground periods rest from 28 s on.
- A hover less than 50 m above the ground reference is not tested.
- A hover that reaches the last fix is not tested, so a file that ends in a hover lands there.
- A file that starts in a hover has no low reference, so a later hover at the same height is not tested.
- A raised real ground period that never comes to rest, such as an outlanding where the crew pushes the glider and a relaunch follows, would join the flights around it. No such period is in the corpus, and the shortest rest among the 24 tested periods is 28 s.
- A GNSS outage in flight with valid fixes spread over more than 20 s within 5 m passes the rest test, although the 6 s of [`1225052`](https://www.weglide.org/flight/1225052) do not.
- A frozen GNSS position in flight with level pressure altitude passes the rest test. The first round describes this in [`nationale-kampioenschappen-zweefvliegen-2026-terlet-2026/20m-tweezitter/2026-05-16/65G_EX`](https://www.soaringspot.com/en_gb/nationale-kampioenschappen-zweefvliegen-2026-terlet-2026/). `rest` does not change that case, because the frozen period lies less than 50 m above the ground before it.

## Recommended fixtures

Each excerpt keeps the A, H and I records and the B records in the listed UTC windows, with the names in `HFPLT` and `HFCM2` removed, like the existing fixtures. The windows were chosen so that no window edge creates an extra ground period, and each excerpt gives the same flights as the full file under `branch`, `branch_nomerge` and `rest`, except where noted.

| Fixture | Source | UTC windows | Lines | Expected with `rest` | `branch` |
| --- | --- | --- | ---: | --- | --- |
| `hover-after-winch-launch.igc` | WeGlide [`1229599`](https://www.weglide.org/flight/1229599) | start to 12:58:00, 13:26:00 to 13:28:00, 13:40:00 to 13:42:00, 13:52:00 to end | 596 | 12:56:41 to 13:53:19 | 13:27:42 to 13:53:19 |
| `two-wave-hovers.igc` | WeGlide [`1254846`](https://www.weglide.org/flight/1254846) | start to 09:47:00, 11:40:30 to 11:50:00, 11:55:00 to 11:57:30, 12:55:30 to end | 594 | 09:45:00 to 12:57:20 | 11:56:04 to 12:57:20 |
| `slow-wave-hover.igc` | WeGlide [`1222277`](https://www.weglide.org/flight/1222277) | start to 12:08:00, 14:46:30 to 14:51:30, 15:07:30 to 15:14:00, 16:14:00 to end | 993 | 12:06:00 to 16:15:51 | 14:49:42 to 15:08:46 |
| `short-wave-hover.igc` | WeGlide [`121167`](https://www.weglide.org/flight/121167) | start to 13:53:00, 14:57:00 to 14:58:00, 14:59:30 to 15:05:00, 15:41:00 to end | 818 | 13:51:05 to 15:42:32 | 13:51:05 to 15:42:32, two flights without the merge rule |

`hover-after-winch-launch.igc` covers the main mechanism with a winch launch. `two-wave-hovers.igc` covers two hovers in a row. `slow-wave-hover.igc` covers the slowest hover and the missing ground period at the start. On the full file `branch` gives 12:06:00 to 15:08:46, but in the excerpt it already loses the take-off because the excerpt drops the climb above the first hover. `short-wave-hover.igc` shows that the merge rule is no longer needed for this hover. All four are flights from other pilots.

## Open questions and risks

- **Level hovers.** The 20 s rest separates 14 s (the longest rest in an airborne ground period) from 28 s (the shortest corpus rest). A level hover of 20 s or more would still become ground. Only a second signal, such as terrain or the fixes before the period, would close that gap.
- **Ground reference from the first fix.** A file that starts airborne gets a high reference from its first fix. This only weakens the test for later hovers, and no file in the data shows it.
- **No ground truth.** The wave files are checked against manual inspection and WeGlide's own times, the corpus only against `branch`.
- **Terrain as an input.** Terrain would make a hover far above the terrain impossible to miss, but it fails near mountains and needs a large external dataset. It stays out unless the engine gets terrain for other reasons.
