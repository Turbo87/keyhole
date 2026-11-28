# Flight analysis fixtures

Each IGC file is an excerpt of a real recording. It keeps the A, H and I records and the B records within the listed UTC windows. Names are removed from the H records, except in Tobias Bieniek's own flights.

| File | Source | UTC windows |
| --- | --- | --- |
| `cylinder-500m.igc` | SoaringSpot `junior-world-gliding-championships-2022-tabor-2022/class-standard/2022-07-28/27S_JS` | 12:13:00 to 12:17:00 |
| `ends-airborne.igc` | SoaringSpot `euregiocup-2024/hasen/2024-05-11/45B_L2` | start to 12:10:00, 13:44:00 to end |
| `finish-cylinder-2s-logger.igc` | SoaringSpot `dmj-edpa-2023/club/2023-06-04/364_CH` | 13:46:00 to 13:50:00 |
| `finish-cylinder-4s-logger.igc` | SoaringSpot `2020-multiclass-nationals-tocumwal-2019/standard/2019-12-16/912G_FQF` | 06:50:00 to 06:54:00 |
| `finish-line.igc` | SoaringSpot `amstelglide-2024-soesterberg-ab-2024/club/2024-06-09/469_Ag` | 15:30:00 to 15:37:00 |
| `ground-tow.igc` | SoaringSpot `11th-fai-womens-world-gliding-championship-2022/club/2022-08-11/28B_LS4` | 11:20:30 to 11:23:30, 11:35:00 to 11:39:00, 14:46:00 to end |
| `hover-after-winch-launch.igc` | WeGlide flight `1229599` | start to 12:58:00, 13:26:00 to 13:28:00, 13:40:00 to 13:42:00, 13:52:00 to end |
| `keyhole.igc` | SoaringSpot `dmj-edpa-2023/club/2023-06-04/364_CH` | 11:26:30 to 11:29:30 |
| `normal.igc` | SoaringSpot `euregiocup-2024/hasen/2024-05-11/45B_EJ` | start to 12:23:00, 16:37:00 to end |
| `outlanding-on-higher-ground.igc` | SoaringSpot `dm-zwickau-2024/15-meter/2024-06-16/46G_28` | start to 10:26:00, 14:50:00 to end |
| `sea-level.igc` | SoaringSpot `nationale-junioren-wedstrijd-2026-venlo-2026/open/2026-08-01/681_KL` | start to 12:03:00, 15:35:00 to end |
| `short-wave-hover.igc` | WeGlide flight `121167` | start to 13:53:00, 14:57:00 to 14:58:00, 14:59:30 to 15:05:00, 15:41:00 to end |
| `slow-wave-hover.igc` | WeGlide flight `1222277` | start to 12:08:00, 14:46:30 to 14:51:30, 15:07:30 to 15:14:00, 16:14:00 to end |
| `start-line-1s-late.igc` | SoaringSpot `dm-zwickau-2026/standard/2026-05-27/65R_LVN` | 13:03:00 to 13:10:00 |
| `start-line-1s-logger.igc` | SoaringSpot `13th-fai-womens-world-gliding-championship-zbraslavice-2025/club/2025-07-25/57P_JM` | 10:58:00 to 11:05:00 |
| `start-line-2s-logger.igc` | SoaringSpot `dmj-edpa-2023/club/2023-06-04/364_CH` | 11:08:00 to 11:15:00 |
| `start-line-4s-logger.igc` | SoaringSpot `2020-multiclass-nationals-tocumwal-2019/standard/2019-12-16/912G_FQF` | 03:08:00 to 03:15:00 |
| `start-line-far-out.igc` | SoaringSpot `jenacup-2026-jena-schongleina-2026/18-meter/2026-07-26/67Q_RT` | 11:12:00 to 11:19:00 |
| `starts-airborne.igc` | SoaringSpot `dm-zwickau-2024/standard/2024-06-11/46B_PB` | start to 12:02:00, 15:20:00 to end |
| `take-off-after-short-stop.igc` | SoaringSpot `wgc2021-club-std-15m-montlucon-gueret-2021/standard/2021-08-13/18D_220` | start to 13:49:00, 14:53:00 to end |
| `turnpoint-near-miss.igc` | SoaringSpot `wgc2021-club-std-15m-montlucon-gueret-2021/club/2021-08-11/18B_CH` | 15:01:00 to 15:05:00 |
| `two-wave-hovers.igc` | WeGlide flight `1254846` | start to 09:47:00, 11:40:30 to 11:50:00, 11:55:00 to 11:57:30, 12:55:30 to end |
| `two-winch-launches.igc` | SoaringSpot `nationale-junioren-wedstrijd-2025-venlo-2025/open/2025-08-05/585_28` | start to 10:47:00, 10:51:00 to 10:55:00, 11:10:00 to 11:15:00, 15:16:00 to end |
| `wave-hover.igc` | Tobias Bieniek's flight `537399` of 2025-03-31 | start to 11:25:00, 15:13:00 to 15:19:00, 18:01:00 to end |

`take-off-after-short-stop.igc` comes from an LXNAV Nano3. Like other loggers that split their recording by flight, it can start a file with the minutes before the take-off even when they hold the end of the previous flight. Here they hold the end of a short earlier flight: the recording starts in the air about 170 m above the field, the glider lands, stops at 13:44:56 UTC, is turned around and is towed out again at 13:46:05 UTC from the same spot.
