# PROTOTYPE: zones reached only by the line between two fixes

Throwaway spike for the question "How often does only the line between two fixes reach an observation zone, and does SeeYou credit it?". SWO 2026 7.4.1 and 7.4.2 and Annex A 2025a 7.6.4 credit a turnpoint or area when a fix lies inside or when the straight line between two consecutive fixes intersects it, and the SWO adds "oder zumindest tangiert". Earlier prototypes test only fixes. Nothing here is production code.

```sh
cargo run --release -- <soaringspot-downloader output> > flights.jsonl
python3 summarize.py flights.jsonl
```

| Variable | Effect |
|---|---|
| `ONLY` | Scores only days whose `<competition>/<class>/<date>` starts with this prefix |
| `PRACTICE` | Also scores practice and unofficial days, which `summarize.py flights.jsonl practice` reports |
| `THIN=k` | Keeps a fix only if it is at least `k` seconds after the last kept fix, to simulate a slower logger |

## Method

Every flight with a published start and an IGC file is scored from the published start to the published finish, or to the landing or engine run for outlanders. The UTC offset is inferred per day as in `prototypes/aat-credited-points`, and repeated timestamps are dropped. Each day's earth model is the one whose legs match the `distance` fields of `task.json`: WGS84, or the 6 370 775 m sphere that the AAT distance research found SeeYou uses on FAI sphere days. Zones are SeeYou's two-arc zones with `oz_angle12` as the inner bisector.

The turnpoints or areas are walked in order. A zone counts as achieved at the first fix inside it or the first segment between two fixes outside it that reaches it. It counts as **line-only** when no fix between the previous achievement and the end of the window lies inside, so only the line rule can credit it. The denominator is every zone achieved by either rule. The same walk with fixes only gives the number of zones a fix-only scorer credits.

Segments are sampled every 1 m, and each sample's depth inside the zone is measured on the day's earth model. Three segment geometries were compared: the geodesic between the fixes, a straight line on an azimuthal equidistant map centred on the zone, and a straight line in (lat, lon).

Rule sets come from the task info line and the competition: `SWO` for the DAeC script or a German competition (DM, Euregio Cup, DSMF, Jena Cup), `Annex A` for FAI championships, and `national` for the Australian and South African nationals.

For racing outlanders, the prototype computes the marking distance under both rules (achieved legs plus the best fix's progress towards the next point). For AAT finishers with a line-only area, it computes the optimum distance with each candidate credited point on the reaching segment: the deepest point, the entry and exit points, any point of the part inside, any point of the whole segment, the nearer fix and both fixes.

## Result

On official days the download holds 20 474 scored flights with 68 014 zone achievements. **None is line-only.** The 10 967 achievements on practice days include none either.

| Shape, by the flight's median fix interval | 1 s | 2 to 3 s | 4 to 5 s | 6 s or more | Line-only |
|---|---|---|---|---|---|
| Cylinder (racing) | 26 266 | 1 049 | 767 | 84 | 0 |
| Keyhole | 6 958 | 3 484 | 434 | 4 | 0 |
| AAT cylinder | 24 861 | 2 603 | 871 | 94 | 0 |
| AAT sector | 397 | 105 | 37 | 0 | 0 |

By rule set: Annex A 43 797 achievements, SWO 13 750 and national 10 467, all with no line-only zones. Plain racing sectors and other two-arc zones do not occur on official days.

Nine achievements have a segment with both fixes outside that reaches the zone, but in each a fix also lies inside, so the line rule changes nothing. Examples: `dm-2022-zwickau/club/2022-06-12` M4 keyhole 2 (1 s logger), `23rd-fai-european-gliding-championships-bekescsaba-2025/18-meter/2025-07-30` 7L cylinder 2 (2 s), `2023-australian-national-championships-open-18m-sport/sports/2023-01-17` IKS AAT sector 1 (5 s), `2020-multiclass-nationals-tocumwal-2019/15-metre/2019-12-14` T0 AAT sector 2 (4 s).

A line-only reach needs the track to pass within a segment's sagitta of the boundary, about 0.4 m for a 40 m segment on a 500 m cylinder. With most loggers at 1 s, this is rarer than the sub-metre near misses below.

### Slower loggers

Thinning the same logs shows the rule matters for slow loggers:

| Thinned to | Achievements | Line-only | Cylinder | Keyhole | AAT cylinder | AAT sector |
|---|---|---|---|---|---|---|
| 2 s | 68 007 | 2 | 1 | 0 | 0 | 1 |
| 4 s | 67 883 | 19 | 16 (0.06 %) | 2 (0.02 %) | 0 | 1 |
| 10 s | 63 825 | 667 | 533 (2.2 %) | 121 (1.2 %) | 12 (0.04 %) | 1 |

At 10 s, 34 line-only reaches go less than 1 m deep and 6 less than 0.1 m. No exact tangent occurred. Achievements fall with thinning because the chords cut across small turnpoints. Thinned flights were never scored by SeeYou, so they show detection and rates only.

### Segment geometry

The geodesic, the azimuthal equidistant line and the (lat, lon) line agree on every zone without a fix inside, on the full logs and on every thinned run. Most segments are tens to a few hundred metres long, where the three lines differ by millimetres, so the choice does not change any count.

### SeeYou

Without a single line-only reach in the published results, the download cannot show whether SeeYou credits them, and for AAT areas it cannot show which point SeeYou credits on the segment. No Naviter changelog entry mentions crediting the line between fixes. The closest entry is v10.78 "Fixed: OZ reported as not rounded ok, although fixes exist in the zone".

### Near misses

A near miss here is a zone that neither a fix nor a segment reaches, with the nearest fix or segment within 500 m. On official days there are 70:

- 27 finishers and 8 racing outlanders carry a scorer remark with 50 penalty points, such as "Missed point 102 < 0.50km" or "Wendesektor verfehlt <0,5 km", and are credited. This is the SWO 7.5 and Annex A 7.6.5 tolerance applied by hand, for example `dm-zwickau-2026/standard/2026-05-27` JK keyhole 2, 16 m out.
- 6 racing outlanders were not credited. Their published distance matches the uncredited marking distance within 50 m, for example `dm-zwickau-2026/15-meter/2026-05-27` CO keyhole 2, 339 m out.
- 5 racing outlanders score more than the uncredited distance without a remark, and 9 AAT outlanders were not compared.
- 4 finishers missed by less than 1 m and carry no remark: `37th-fai-world-gliding-championships-2022-szeged-2022/18m/2022-07-26` LR (0.04 m, sphere), `south-african-nationals-2014/18-meter/2014-12-20` SJ (0.37 m), `wgc2026/18-meter/2026-05-28` HX (0.76 m) and `23rd-fai-european-gliding-championships-bekescsaba-2025/open/2025-07-30` TJ (0.84 m). `37th-fai-world-gliding-championships-narromine-2023/club/2023-12-10` XI missed by 0.55 m and got a penalty. CUP coordinates have a resolution of 0.001 minutes, about 1.9 m, so SeeYou's zone centre can differ from `task.json` by up to a metre. This boundary noise is larger than any line-only effect at 1 s.
- 11 finishers missed by 7 to 493 m without a remark, for example `21st-fai-european-gliding-championships-pociunai-2022/club/2022-07-13` LE AAT area 2 (7 m), `jwgc2024/club/2024-07-19` VS3 AAT area 3 (14 m), and AB, W and AR on `23rd-fai-european-gliding-championships-bekescsaba-2025/18-meter/2025-07-30` (56 to 176 m). They are unexplained.

In 5 official near misses a segment passes more than 1 m closer than the nearest fix. The clearest is `2022-south-african-nationals-15m-club-and-2-seater/15m/2022-10-03` EVO, cylinder 3, where an 82 s logger gap leaves the nearest fix 529 m out and the segment 224 m out. SeeYou did not credit it. The closest case to a line-only reach is on a practice day: `dm-18m-burg-feuerstein-burg-feuerstein-2025/18-meter/2025-06-17` K8, 4 s logger, keyhole 1. The nearest fix is 4.8 m outside, the segment passes 0.76 m outside, and the published result is a finish with no turnpoint penalty.

## Caveats

- Days without IGC files or without a matching start are skipped: the Lake Keepit 2020 WWGC, 8 days of the Garray 2023 WWGC, 3 days of Narromine 2022 and 5 days of Euregio Cup 2022.
- 253 published finishers miss a zone in this walk. Most are on `leeton-multiclass-nationals-2026` (134), `39th-fai-world-gliding-championships-tabor-2025` (40) and `dm-2022-zwickau` (26) and miss by more than 500 m, which points to task changes or zone definitions this prototype does not read. They do not hide line-only reaches, because no segment reaches those zones either.
- The SWO rule set is inferred for German competitions without a script name in the task info line.
- The AAT candidate point code ran on no natural case and is untested against SeeYou.
