# How SeeYou writes a task to `task.json`

This note records what #278 measured about the task that soaringspot-downloader saves as `task.json`, so that the line geometry of #333 and the zone geometry of #334 can rely on it. It covers `polygon` tasks only. Class days are named by competition, class and day, and each name links to its competition on SoaringSpot.

The measurements come from two sources. A throwaway Python script read every `task.json` of the local SoaringSpot download. It recomputed each leg with Vincenty's inverse formula on WGS84 and with the haversine formula on a sphere of 6371 km, and compared the results with the published fields. The oracle's full-data suite then ran over the same download with its bearing tolerance set to zero, which listed every bearing that differs from Keyhole's. The download holds 737 racing task days that aren't cancelled, of which the full-data suite checks those under Annex A or the SWO.

## Task points

- A task point's `type` is `start`, `point` or `finish`. The days of the South African nationals of 2012 to 2014 also hold a `takeoff` and a `landing` point with an `oz_type` of `unknown`, which belong to no leg.
- Positions and angles are in radians, written with 15 significant digits. An `oz_angle1` of 180° therefore reads as `3.14159265358979`, which converts to 179.99999999999972°. Rounding to a millionth of a degree restores 180°.
- Radii are in m. A line has `oz_line` set, and its `oz_radius1` is half its length.
- No zone in the download has an R2 of R1 or more, and none has an A1 of 180° together with an A2 between 0° and 180°.

## Task distance

- `task_distance` is in m and stored as a 32-bit float. It equals the sum of the `distance` fields of every task point after the start, within 0.93 m on every day. The start's `distance` holds the closing leg from the finish back to the start. Take-off and landing points don't count.
- The days of 2012 to 2014 store `task_distance` in whole m, which accounts for most of that 0.93 m.
- On WGS84 the recomputed task distance matches within 0.8 m on every committed fixture. About 15 days of the download lie 1 m to 5 m off, such as [`nationale-kampioenschappen-zweefvliegen-2026-terlet-2026`](https://www.soaringspot.com/en_gb/nationale-kampioenschappen-zweefvliegen-2026-terlet-2026/) with up to 4.7 m and [`euregiocup-2023`](https://www.soaringspot.com/en_gb/euregiocup-2023/) with 3.1 m.

## The FAI Sphere

Neither `task.json` nor the task info line states the earth model. Comparing each leg with both models shows which one a competition used. Ten FAI championships used the FAI Sphere, the ones that the full-data suite lists. Others used WGS84, such as [`12th-fai-womens-world-gliding-championship-garray-2023`](https://www.soaringspot.com/en_gb/12th-fai-womens-world-gliding-championship-garray-2023/) and [`wgc2026`](https://www.soaringspot.com/en_gb/wgc2026/). [`egc2023`](https://www.soaringspot.com/en_gb/egc2023/) used the FAI Sphere only in its 20 m multi-seat class, and WGS84 in its 18 m and open classes.

SeeYou's FAI Sphere distances don't follow a great circle on a sphere of 6371 km. Fitted per leg, the radius lies between 6370.69 km and 6370.80 km, and it varies from leg to leg. The task distances therefore run 10 m to 27 m short of Keyhole's, for example 10 m on [`37th-fai-world-gliding-championships-narromine-2023`](https://www.soaringspot.com/en_gb/37th-fai-world-gliding-championships-narromine-2023/) club 2023-12-01, 15 m on [`39th-fai-world-gliding-championships-tabor-2025`](https://www.soaringspot.com/en_gb/39th-fai-world-gliding-championships-tabor-2025/) club 2025-06-19 and up to 27 m on [`37th-fai-world-gliding-championships-2022-szeged-2022`](https://www.soaringspot.com/en_gb/37th-fai-world-gliding-championships-2022-szeged-2022/). Geocentric latitudes, reduced latitudes and a radius of 6371.0088 km don't explain the gap. Keyhole treats it as an error in SeeYou.

## Reduction and `oz_move`

- `oz_reduce` shortens every leg a zone touches by its R1, which matches Keyhole's reduction on every committed fixture.
- `oz_move` is the "Verschiebe Ursprung" option of SeeYou 10.52's task dialog. It moves the end of a leg from the reference point to the zone's boundary. A finish with both `oz_reduce` and `oz_move` set shortens its leg twice, so its `task_distance` is exactly 3 km or 5 km shorter than Keyhole's. Such finishes occur at [`dmj-edpa-2023`](https://www.soaringspot.com/en_gb/dmj-edpa-2023/), [`jwgc2026`](https://www.soaringspot.com/en_gb/jwgc2026/) and [`23rd-fai-european-gliding-championships-bekescsaba-2025`](https://www.soaringspot.com/en_gb/23rd-fai-european-gliding-championships-bekescsaba-2025/).

## Bearings

- `oz_angle12` is the resolved bearing that points into the task. SeeYou measures each course where its leg begins. A start points along the initial azimuth to the next point, and a finish along the reverse of the incoming leg's initial azimuth. A symmetric turnpoint points along the bisector of those two courses. This reproduces every `oz_angle12` of the committed fixtures within 0.0001°.
- Keyhole measures every course at the reference point instead, as ADR 0003 records. The two differ by up to 1.01° on the committed fixtures, at the finish of [`dm-zwickau-2024`](https://www.soaringspot.com/en_gb/dm-zwickau-2024/) 15 m 2024-06-16, and by up to 1.41° on the download, at turnpoint 3 of [`dm2023bayreuth`](https://www.soaringspot.com/en_gb/dm2023bayreuth/) offene 2023-06-04. Start bearings agree within 0.001° except on [`wgc2026`](https://www.soaringspot.com/en_gb/wgc2026/) 18 m 2026-05-23, whose start line is 1.86° off.
- The `oz_angle12` of a cylinder carries no meaning. The symmetric finish cylinders of [`dm-frauen-landau-ebenberg-2022`](https://www.soaringspot.com/en_gb/dm-frauen-landau-ebenberg-2022/) point about 180° away from the previous point, and the turnpoint cylinders of `wgc2026` open 2026-05-23 lie up to 17.7° off.
- Every start in the download is `next`. Seven finishes are `symmetric`, all of them cylinders. No turnpoint is `fixed`, `next` or `previous`.
