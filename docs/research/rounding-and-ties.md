# Rounding and ties in SeeYou results

Research for ticket #65, collected 2026-11-02. It determines where SeeYou Competition rounds when it scores a day, whether it rounds half up or half to even, and how SoaringSpot ranks and orders equal day and total scores. The findings are checked against the DAeC SWO and FAI Sporting Code Section 3 Annex A.

## Sources

| Short name | Source | Version |
|---|---|---|
| Data set | SoaringSpot daily results, total results and task pages of 31 competitions, downloaded with `research/rounding-and-ties/fetch_pages.py` | Downloaded 2026-11-02 |
| SWO | DAeC Bundeskommission Segelflug, "Wettbewerbsordnung für Segelflugmeisterschaften (SWO), Fachliche Bestimmungen", https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026.pdf | Ausgabe 2026 |
| Annex A | FAI Sporting Code Section 3 Annex A, "Rules for World and Continental Gliding Championships", https://www.fai.org/sites/default/files/document/file/SC3A_2025a.pdf | 2025a Edition, valid from 15 April 2026 |
| Naviter script | `igc_annex_a/AnnexA_scoring.pas` in naviter/seeyou_competition_scripts, https://github.com/naviter/seeyou_competition_scripts/blob/496773b/igc_annex_a/AnnexA_scoring.pas | commit `496773b` |
| Pascal Script | `Source/uPSRuntime.pas` in remobjects/pascalscript, https://github.com/remobjects/pascalscript/blob/20c4c18f8b73f9b27cd912751ee3e01070158101/Source/uPSRuntime.pas | commit `20c4c18` |
| Delphi `Round` | Embarcadero DocWiki, `System.Round`, https://docwiki.embarcadero.com/Libraries/Rio/en/System.Round | Rio |
| Scoring rules research | `docs/research/scoring-rules.md` on the `research/scoring-rules` branch | ticket #2 |
| Oracle fixtures research | `docs/research/oracle-fixtures.md` on the `research/oracle-fixtures` branch | ticket #3 |

The data set covers the DAeC competitions `dm-2022-zwickau`, `dm-zwickau-2024`, `dm-zwickau-2026`, `dm2023bayreuth`, `dm-frauen-landau-ebenberg-2022`, `dm-clubklasse-burg-feuerstein-burg-feuerstein-2024`, `dm-18m-burg-feuerstein-burg-feuerstein-2025`, `dmc2026-burg-feuerstein`, `dm-offene-klasse-2025-lachen-speyerdorf-2025`, `dm-dosi-brb2025`, `dmj-edpa-2023`, `dsmf24`, `dsmj2025` and `euregiocup-2022` to `euregiocup-2026`, and the FAI championships `10th-fai-womens-world-gliding-championship-lake-keepit-2020`, `11th-fai-womens-world-gliding-championship-2022`, `12th-fai-womens-world-gliding-championship-garray-2023`, `21st-fai-european-gliding-championships-pociunai-2022`, `23rd-fai-european-gliding-championships-bekescsaba-2025`, `37th-fai-world-gliding-championships-2022-szeged-2022`, `37th-fai-world-gliding-championships-narromine-2023`, `39th-fai-world-gliding-championships-tabor-2025`, `7th-fai-junior-european-gliding-championships-prievidza-2025`, `egc2023`, `jegc2021`, `wgc2021-club-std-15m-montlucon-gueret-2021` and `wgc2026`. Days are referred to as `<competition>/<class>/<date>`.

## Verification status

Verified means read in the cited primary document or counted in the data set with the scripts in `research/rounding-and-ties/`. Not verified:

- **Half up or half to even.** The data cannot tell the two apart. Only two rows have an exactly half unrounded score, and both round to the same value under either rule. See [Half up or half to even](#half-up-or-half-to-even).
- **Delphi `Round()` semantics.** The DocWiki page returned HTTP 403 to every fetch attempt. The statement that Delphi rounds exact halves to the even number comes from the page's search result snippet, not from reading the page. Whether SeeYou is built with Delphi, and with the default FPU rounding mode, is also unknown.
- **The DAeC script.** DAeC days run `DAeC-SWO20xx Script V9.xx`, which is not public. Its rounding was only inferred from results.
- **Order within tied scores.** Neither the daily nor the total order of tied competitors follows a single rule found here. See [Ties](#ties).
- **Handicapped club classes.** On 11 of 35 DAeC and 29 of 66 FAI club class days the recomputed scores don't match, because SoaringSpot doesn't publish the handicaps used or publishes different ones. These days say nothing about rounding and were excluded. Why they don't match was not investigated.
- **Podium ties in older Annex A editions.** The tie rule below is from the 2025a edition. The edition that governed `jegc2021` was not read.

## What the rules say

Both rule sets round only the competitor's day score, half up:

- **SWO 13.1.2.** "Die jedem Teilnehmer zugeteilten Punkte werden in ganzen Zahlen ausgedrückt, ab dem Wert 0,5 wird aufgerundet." SWO 13.1.4 sets the measuring precision to whole seconds and 0.1 km.
- **Annex A 8.2.2.** "The Score given to each competitor shall be rounded to the nearest whole number, the value of 0.5 being rounded up."
- Neither text rounds day parameters (Pm, F, FCR, Pvm, Pdm), handicapped distance or speed, or distance and speed points (SWO 13.2 to 13.4, Annex A 8.3 and 8.4). Annex A rounds only the Team Cup scores, to two decimal places (8.5.4a, 8.5.5).
- **Totals** add the daily points: SWO 12.3 ("Addition der Punkte für jeden Wettbewerbstag") and Annex A 8.2.6. Because each day score is already a whole number, totals need no rounding of their own.
- **Penalties** are deducted after the score is calculated, and a negative day score becomes zero unless 8.6.6 applies (Annex A 8.2.5). All penalties are whole points, so deducting before or after rounding gives the same result.

On ties the two differ:

- **SWO 13.1.3.** "Bei Punktgleichheit gilt gleiche Platzierung." Equal points share a place, in the day and overall. The SWO has no tie-break, not even for the title (SWO 12.3).
- **Annex A 10.2.2.** "Although tie scores may occur in the daily results and in the final results, no ties will be allowed in the final place standings for the first three (podium) places." Starting with the highest tied final score, tied competitors are ranked by their number of daily first placings, then second placings, and so on. Ties below third place are allowed. Annex A 1.2.2 points to 10.2.2 for a tie for the title and says final places for all tied results "should also be determined by the procedure stated in 10.2.2". That sentence contradicts the 10.2.2 statement that ties below third are allowed.

## Published values

- **The points `data-value` is a sort key, not the unrounded score.** In all 20523 daily rows it equals `points * 10000 + speed + distance / 1e6`, with the published whole points, the speed `data-value` in m/s and the distance `data-value` in metres. For example, CN SG on `dm-zwickau-2024/15-meter/2024-06-11` has 678 points, 33.109024 m/s and 261693.72 m, giving `6780033.3707178`. SoaringSpot publishes no unrounded score, so the rounding rule can only be tested by recomputing scores.
- **Distance and speed `data-value`s are single precision floats** (`261693.71875`, `33.109024047852`), and times are whole seconds.
- **The total `data-value` is the whole total.**
- **The Task info line rounds for display.** `Maximum Points` is Pm rounded half up on all 180 DAeC days and on 310 of 320 FAI days. The others are club class days with unpublished handicaps. F and FCR are shown with three decimals. The Naviter script builds this line with `IntToStr(Round(Pm))`, `IntToStr(Round(Pvm))` and `FormatFloat('0.000', F)` (Naviter script, lines 395 to 398).

## Where SeeYou rounds

`research/rounding-and-ties/recompute.py` recomputes every competitor's unrounded score on official and unofficial valid days. It takes N, n1, n2 and D1 from the Task info line, distance, speed and time from the `data-value`s, handicaps from the Handicap column where published (normalised like the Naviter script, lines 257 to 262), and the AAT minimum time from the task page. It uses the formulas from Annex A 8.4 without rounding anything and rounds the final score half up. Rows with a remark or penalty in the points cell are counted separately.

Outside club classes, every row without a remark matches:

| Rule set | Days | Rows without remark | Match |
|---|---|---|---|
| DAeC | 145 | 3645 | 3645 |
| FAI | 252 | 5349 | 5348 |

The one exception is CN POL on `egc2023/20m-multi-seat/2023-07-30`, recomputed at 579.81 and published as 586. A difference of 6 points is not a rounding effect.

Rounding at any other step breaks the match. Each variant below was tested by changing the corresponding line of `recompute()` in a one-off copy, on the same rows:

| Variant | DAeC match | FAI match |
|---|---|---|
| No rounding before the final score | 3645 | 5348 |
| Pm rounded to a whole number before use | 3375 | 4888 |
| Speed and distance points rounded separately | 2879 | 4267 |
| F and FCR rounded to three decimals | 3617 | 5268 |
| Distance and speed rounded to the displayed 0.01 km and 0.01 km/h | 3522 | 5155 |

So SeeYou rounds once per competitor and day, after `F * FCR * (Pv + Pd)` and the penalty deduction. Day parameters, handicapped distance and speed, and distance and speed points stay unrounded, in both rule sets. This matches the Naviter script, which computes `Pilots[i].Points := Round( F*Fcr*(Pd+Pv) - Pilots[i].Penalty )` (line 377) and rounds nowhere else in the score.

Totals don't round either. All 16869 rows of the total tables equal the sum of the published daily points of the class's non-cancelled days up to that day. Some cancelled days still show points in their daily table, for example on `jegc2021/standard` and `dsmj2025/club`, but those points are not in the totals.

## Half up or half to even

The Naviter script calls Pascal Script's `Round()`. Pascal Script implements it by calling the `Round` of the compiler it was built with (`18: Stack.SetInt(-1, Round(Stack.GetReal(-2))); // Round` in Pascal Script, line 9667). Delphi's `System.Round` rounds an exact half to the even number in its default rounding mode (Delphi `Round`, not verified, see above). If SeeYou is built with Delphi, the Naviter script therefore rounds 662.5 to 662, while both rule sets require 663.

The data can't confirm this. An exact half needs an unrounded score that doesn't depend on measured distances and speeds, such as a day winner or a finisher below 2/3 Vo on a day where Pm is 1000 or comes from the winner's whole-second time. A one-off check with exact rational arithmetic covered Max speed pts, Maximum Points, the day winner's score and the score of finishers below 2/3 Vo on 403 such days. Only two rows hit an exact half:

| Day | CN | Unrounded score | Published |
|---|---|---|---|
| `dm-2022-zwickau/club/2022-06-08` | UWE | 1000 × FCR with FCR = 1.2 × 9/32 + 0.6 = 0.9375, so 937.5 | 938 |
| `37th-fai-world-gliding-championships-narromine-2023/standard/2023-12-14` | FX | 1000 × F with F = 1.25 × 15/20 = 0.9375, so 937.5 | 938 |

937 is odd, so both rules give 938. Evaluated in double precision with the Naviter script's order of operations, the scores are 937.5 and 937.5000000000002, so floating point error can decide a half as well. Rows whose recomputed score lies within 0.0001 of a half can't be decided either, because the single precision distances and speeds limit the recomputation to roughly that accuracy.

Exact halves are therefore rare, about 2 in 12000 scored rows here, but they do occur at round values of F and FCR.

## Ties

`research/rounding-and-ties/ties.py` checks ranks and order of equal scores. `daily_order.py` and `total_order.py` test candidate orders within ties.

- **Equal scores share a rank, and the next rank skips.** In all 13070 ranked daily rows on 502 official and unofficial day tables and all 16762 ranked rows on 631 total tables, the rank is one plus the number of competitors with more points ("1224" ranking). There are 740 daily and 375 total tie groups. Example: ZL and RP2 on `dm-frauen-landau-ebenberg-2022/standardklasse/2022-05-24` both score exactly Pdm (283.42, finishers below 2/3 Vo), both are ranked 17, and the next competitor is 19. On a day that is not a Championship Day, everyone is ranked 1 with 0 points.
- **The daily rank label has a trailing dot** (`17.`), the total rank does not (`17`). DNF, DNS and HC rows show those labels instead of a rank and don't take a position.
- **SoaringSpot doesn't break podium ties in totals.** The final total of `jegc2021/club` (2021-07-23) shows CNs 5 and LE both at rank 1 with 5341 points, and the next competitor at rank 3. Intermediate totals often show podium ties too, for example `wgc2026/18-meter` after 2026-05-24 (SF and FM, rank 1). For FAI championships Annex A 10.2.2 requires the countback for the final podium, so the official final ranking can differ from SoaringSpot. Whether the organisers applied it at `jegc2021` was not checked. For DAeC competitions the shared rank matches SWO 13.1.3.
- **Order within daily ties is not fully determined.** Each of the 708 daily tie groups with points on valid days is in descending order of the recomputed unrounded score (635 groups) or of the `data-value` sort key (675 groups). The sort key ignores handicaps, so it differs from the unrounded score on handicapped days.
- **Order within total ties is not determined.** Of 304 total tie groups with points, 274 follow the order of that day's results table, 123 are in CN order, 147 in contestant name order, 222 in Annex A countback order and 68 in the order of the previous total. The order of the same tied pair also flips between days, for example LOT and MP on `11th-fai-womens-world-gliding-championship-2022/standard` after 2022-08-24 and 2022-08-25, with no change in their totals.

## Consequences for Keyhole

- Compute day parameters and points without intermediate rounding and round once per competitor and day, after the penalty deduction. Sum the rounded day scores for totals.
- The rules say half up. SeeYou probably rounds half to even and also depends on floating point error at exact halves. Both rules agreed on every case in the data. Matching SeeYou exactly on a future exact half needs a decision: follow the rules or imitate SeeYou's double arithmetic and `Round()`.
- Rank equal points equally with "1224" ranking in daily and total results. For FAI final results, the Annex A 10.2.2 podium countback is a rule that SoaringSpot doesn't show, so the oracle can't verify it.
- Keyhole can't rely on the order of tied competitors matching SoaringSpot. The oracle should compare ranks and points, not row order within ties.

## Scripts

```sh
DATA=/path/to/scratch python3 fetch_pages.py <competition>...
python3 parse_pages.py /path/to/scratch > tables.jsonl
python3 recompute.py tables.jsonl [--near 0.01]
python3 ties.py tables.jsonl [--list]
python3 daily_order.py tables.jsonl
python3 total_order.py tables.jsonl
```

`fetch_pages.py` saves the daily, total and task pages of every task day. SoaringSpot answers rate limiting with HTTP 200 and a "Too Many Requests" page, so the script retries until it gets a real page.
