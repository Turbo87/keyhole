# Flight analysis fixtures

Each IGC file is an excerpt of a real recording. It keeps the A, H and I records and the B records within the listed UTC windows. Names are removed from the H records, except in Tobias Bieniek's own flights.

| File | Source | UTC windows |
| --- | --- | --- |
| `ends-airborne.igc` | SoaringSpot `euregiocup-2024/hasen/2024-05-11/45B_L2` | start to 12:10:00, 13:44:00 to end |
| `ground-tow.igc` | SoaringSpot `11th-fai-womens-world-gliding-championship-2022/club/2022-08-11/28B_LS4` | 11:20:30 to 11:23:30, 11:35:00 to 11:39:00, 14:46:00 to end |
| `normal.igc` | SoaringSpot `euregiocup-2024/hasen/2024-05-11/45B_EJ` | start to 12:23:00, 16:37:00 to end |
| `outlanding-on-higher-ground.igc` | SoaringSpot `dm-zwickau-2024/15-meter/2024-06-16/46G_28` | start to 10:26:00, 14:50:00 to end |
| `sea-level.igc` | SoaringSpot `nationale-junioren-wedstrijd-2026-venlo-2026/open/2026-08-01/681_KL` | start to 12:03:00, 15:35:00 to end |
| `starts-airborne.igc` | SoaringSpot `dm-zwickau-2024/standard/2024-06-11/46B_PB` | start to 12:02:00, 15:20:00 to end |
| `take-off-after-short-stop.igc` | SoaringSpot `wgc2021-club-std-15m-montlucon-gueret-2021/standard/2021-08-13/18D_220` | start to 13:49:00, 14:53:00 to end |
| `two-winch-launches.igc` | SoaringSpot `nationale-junioren-wedstrijd-2025-venlo-2025/open/2025-08-05/585_28` | start to 10:47:00, 10:51:00 to 10:55:00, 11:10:00 to 11:15:00, 15:16:00 to end |
| `wave-hover.igc` | Tobias Bieniek's flight `537399` of 2025-03-31 | start to 11:25:00, 15:13:00 to 15:19:00, 18:01:00 to end |

`take-off-after-short-stop.igc` comes from an LXNAV Nano3. Like other loggers that split their recording by flight, it can start a file with the minutes before the take-off even when they hold the end of the previous flight. Here they hold the end of a short earlier flight: the recording starts in the air about 170 m above the field, the glider lands, stops at 13:44:56 UTC, is turned around and is towed out again at 13:46:05 UTC from the same spot.
