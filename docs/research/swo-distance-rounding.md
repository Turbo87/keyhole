# SWO distance precision in SeeYou results

Research for ticket #112, collected 2026-11-04. It reads SWO 13.1.4, which sets the precision of distances to 0.1 km, and tests whether SeeYou's published SWO results are consistent with distances rounded to 0.1 km before scoring. It does not decide whether Keyhole follows the rule or SeeYou.

## Sources

| Short name | Source | Version |
|---|---|---|
| SWO | DAeC Bundeskommission Segelflug, "Wettbewerbsordnung für Segelflugmeisterschaften (SWO), Fachliche Bestimmungen", https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026.pdf | Ausgabe 2026 |
| SWO 2025 | Same title, https://www.daec.de/media/files/Dateien/Sportarten/Segelflug/Downloads/SWO2025_20250228.pdf | Ausgabe 2025 |
| SWO 2022 | Same title, copy hosted by a club, https://s54f3b86144277229.jimcontent.com/download/version/1647202197/module/14048026429/name/SWO2022.pdf | Ausgabe 2022 |
| SWO 2015 | Same title, copy hosted by a club, http://www.fsv-rudolstadt.de/wp-content/uploads/2016/11/SWO2015_final.pdf | Ausgabe 2015 |
| Annex A | FAI Sporting Code Section 3 Annex A, "Rules for World and Continental Gliding Championships", https://www.fai.org/sites/default/files/document/file/SC3A_2025a.pdf | 2025a Edition |
| DAeC script | Naviter SeeYou scoring script `DAEC_SWO_V9_09`, not public, copy supplied by the project owner | Version 9.09, 12.05.2026 |
| Data set | SoaringSpot daily, total and task pages of the 18 DAeC competitions of the rounding research, downloaded with `fetch_pages.py` from that research | Downloaded 2026-11-04 |
| Rounding research | `docs/research/rounding-and-ties.md` and `research/rounding-and-ties/` on the `research/rounding-and-ties` branch | ticket #65 |
| Handicap research | `docs/research/handicapped-club-days.md` on the `research/handicapped-club-days` branch | ticket #69 |
| Scoring rules research | `docs/research/scoring-rules.md` on the `research/scoring-rules` branch | ticket #2 |

The data set covers `dm-2022-zwickau`, `dm-zwickau-2024`, `dm-zwickau-2026`, `dm2023bayreuth`, `dm-frauen-landau-ebenberg-2022`, `dm-clubklasse-burg-feuerstein-burg-feuerstein-2024`, `dm-18m-burg-feuerstein-burg-feuerstein-2025`, `dmc2026-burg-feuerstein`, `dm-offene-klasse-2025-lachen-speyerdorf-2025`, `dm-dosi-brb2025`, `dmj-edpa-2023`, `dsmf24`, `dsmj2025` and `euregiocup-2022` to `euregiocup-2026`, all classes. Days are referred to as `<competition>/<class>/<page>`, and "rows" means scored rows without a remark, as in the rounding research.

## Verification status

Verified means read in the cited document or counted in the data set with `research/swo-distance-rounding/variants.py`. Not verified:

- **What the rule authors meant.** The SWO doesn't define "ermittelt" or "genau", and no commentary, FAQ or scorer guidance on 13.1.4 was found. The readings below come from the wording and its context only.
- **SeeYou's own distance and speed computation.** The DAeC script receives each competitor's distance and speed from SeeYou and doesn't show how SeeYou computes them. That they arrive unrounded is inferred from the published values.
- **Manually entered flights.** 36 finisher rows have a distance on an exact 10 m multiple and a speed on an exact 0.01 km/h that is not distance divided by marking time. They look like values a scorer typed in, but SoaringSpot doesn't mark them, so that is a guess.
- **SWO 2019 and older editions than 2015.** The 2019 copy found returned an HTML page, not a PDF. Editions from 2016 to 2021 and 2023 to 2024 were not read.
- **FAI days.** Annex A has no distance precision rule, so FAI days were not tested.

## What the rule says

SWO 2026, 13.1 "Allgemeines", in full:

> 13.1.1 Das Wertungsverfahren orientiert sich am 1.000-Punkte-Wertungssystem gemäß Sporting Code 3 Annex A. Für fehlende Festlegungen bzw. im Zweifelsfall gilt der aktuelle Annex A.
>
> 13.1.2 Die Bewertung wird in Punkten ausgedrückt. Die höchste erreichbare Tageswertung beträgt 1.000 Punkte. Die jedem Teilnehmer zugeteilten Punkte werden in ganzen Zahlen ausgedrückt, ab dem Wert 0,5 wird aufgerundet.
>
> 13.1.3 Bei Punktgleichheit gilt gleiche Platzierung.
>
> 13.1.4 Wertungsstrecken und Abflugzeit/Zielzeit werden aus den Flugrekorder-Daten ermittelt. Zeiten werden auf ganze Sekunden und Strecken auf 0,1 km genau ermittelt.

SWO 2025 and SWO 2022 have the same 13.1 word for word. SWO 2015 has the rule as 13.1.3, in a measurement context: "Bei GNSS- Dokumentation werden Wertungsstrecken und Abflugzeit / Zielzeit aus den GNSS-Daten ermittelt. Zeiten werden auf ganze Sekunden und Strecken auf 0,1 km genau ermittelt. Bei mehreren Abflügen ist die Abflugzeit für die Wertung heranzuziehen, die die höchste Punktzahl ergibt."

How the text reads:

- **"ermittelt" means determined, as an input to scoring.** The first sentence of 13.1.4 uses the same verb for deriving scoring distances and start and finish times from the recorder data. The second sentence sets the precision of that determination. Nothing in 13.1 says the values are displayed, and the display of results is not regulated in 13.1. Read literally, the rule makes every scoring distance a value with 0.1 km resolution before it enters the formulas.
- **"auf 0,1 km genau" names a precision, not a rounding method.** "Genau ermittelt" can mean "measured to an accuracy of 0.1 km", a tolerance that unrounded computation more than meets, or "stated to 0.1 km", which requires rounding. Unlike 13.1.2 ("ab dem Wert 0,5 wird aufgerundet") and the start penalties in 10.5.8 ("kaufmännisch auf ganze Punkte gerundet"), 13.1.4 doesn't say how to round. Half up and truncation are both possible readings.
- **Speeds have no precision rule.** The SWO defines `V = D / T` and `Vh = D / T / I` in km/h (SWO 13.2) and says nothing about their precision. Under the literal reading, speeds inherit the 0.1 km distance and the whole-second time.
- **13.1.4 overrides Annex A on DAeC days.** Annex A only applies where the SWO has no rule or is unclear (SWO 13.1.1). Annex A 2025a itself has no distance precision. It rounds only the score (8.2.2) and interpolates start and finish times to the nearest second (7.4.3.1, 7.8.1).
- **The effect is at most about one point.** SWO 13.5 states "dass die Wertungsdifferenz auf max. 4 Punkte pro km und max. 11 Punkte pro Minute begrenzt ist". 0.1 km is at most 0.4 points before rounding.

### Which values are "Strecken"

"Wertungsstrecken" in 13.1.4 are the scoring distances of chapter 6. The AAT drawing in SWO 6.2.2 labels the credited path "Wertungsstrecke". The distances that enter the formulas (SWO 6.2 and 13.2) are:

| Value | Definition | Role |
|---|---|---|
| Aufgabendistanz (RT task distance) | Start line midpoint via all turnpoints to the finish ring centre minus its radius (6.2.1) | D of an RT finisher, so it sets V |
| Wertungsdistanz, RT outlanding | Via the turnpoints reached in order to the next one, minus the distance from it (6.2.1) | D of an RT outlander |
| Wertungsdistanz, AAT | Through all areas to the finish, or for an outlanding to the nearest point of the next area minus the distance to it (6.2.2) | D of every AAT competitor, and V of AAT finishers |
| D | "Wertungsdistanz des jeweiligen Teilnehmers" in km (13.2) | The measured value 13.1.4 applies to |
| Dh | "Dh = D / I" (13.2) | Derived from D. Whether it is rounded again after dividing by the index is open |
| Do | "Größte indexkorrigierte Distanz (Dh) des Tages in km" (13.2) | Derived from Dh. It enters Pm and every outlander's Pd |
| Dm, DM | 100, 120 or 140 km and 250, 300 or 350 km by class (13.2, 13.4.1) | Constants in whole km, which the rule doesn't change |

Through these values the rule would reach Pm (`1250 * Do / DM - 250`), Pdm and Pvm, Pd (`Pdm * Dh / Do`), V, Vh and Vo, Pv, and the counts n1 (`Dh >= Dm`) and n2 (`Vh > 2/3 Vo`). Times T and To are already whole seconds under 13.1.4.

## Published values

On the 169 DAeC days that recompute without rounding (see [Recomputation](#recomputation)):

- **Published distances are not rounded to 0.1 km.** Of 4960 nonzero distance `data-value`s, 4825 are single precision values off any 10 m grid, such as `238827.796875`. 135 are exact 10 m multiples, and 17 of those are exact 100 m multiples, about what chance gives among 10 m values.
- **Published speeds are distance divided by marking time.** 3921 of 3957 finisher speeds equal the published distance divided by the elapsed time, or the AAT minimum time where that is longer, to a relative 1e-6. The other 36 have the manual-entry pattern described above.
- **Times are whole seconds** in all 4960 rows, as both 13.1.4 and Annex A require.
- **Do in the Info line is the unrounded D0.** On all 169 days the printed Do, with two decimals, lies within 0.01 km of the largest handicapped distance recomputed from unrounded `data-value`s. Only 19 printed values are 0.1 km multiples, again about chance.
- **n1 and n2 in the Info line** equal the counts from unrounded values on all 169 days.

The 10 days of `dmj-edpa-2023/club`, where SoaringSpot hides the Handicap column, print a Do that the unhandicapped distances don't reproduce, as the handicap research explains.

## The DAeC script

DAeC days are scored by the SeeYou scoring script `DAEC_SWO_V9_09` (version 9.09 of 12.05.2026). It doesn't implement 13.1.4:

- **Distances and speeds enter unrounded.** The script reads `Pilots[i].dis` and `Pilots[i].speed` as SeeYou supplies them and uses them directly for D0 (`Pilots[i].dis*Href/Pilots[i].Hcap`), n1, Vo, n2, Pv and outlander Pd (`Pdm * (Pilots[i].dis*Href/Pilots[i].Hcap/D0)`).
- **Only the score is rounded.** The single `Round()` in the scoring path is `Pilots[i].Points := Round( F*Fcr*(Pd+Pv) - Pilots[i].Penalty )`. Pm, Pvm and Dm are rounded only for the Info line.
- **The result sheet shows the same unrounded values.** `Pilots[i].sdis:=Pilots[i].dis` and `Pilots[i].sspeed:=Pilots[i].speed` pass them on, and the Info line prints `FormatFloat('0.00',D0/1000.0)`.

The script's version history back to 9.01 (10.03.2022) mentions no distance rounding.

## Recomputation

`variants.py` recomputes every competitor's score with the formulas and data of `recompute.py` from the rounding research, then repeats it with distances rounded to 0.1 km at different steps:

- **D** rounds each credited distance before the handicap, so Dh, Do, Pm and outlander Pd change.
- **Dh** rounds the handicapped distance instead. It differs from D only on handicapped days.
- **D0** rounds only the day's largest handicapped distance, the input of Pm and Pd.
- **V** derives speeds from the rounded distance, by scaling the published speed with `rounded D / D`.
- **D+V** and **Dh+V** combine both, the literal reading of 13.1.4.

Each variant rounds half up and truncates. 11 days already fail without rounding and are excluded: the 10 `dmj-edpa-2023/club` days with hidden handicaps and `dmc2026-burg-feuerstein/club/task-6-2026-06-20` with the unexplained CN AW row (handicap research). Of the 180 DAeC days scored, 169 days with 4337 rows remain. "Changed" counts rows whose rounded score differs from the unrounded recomputation.

| Variant | Rounding | Match | Changed | Changed and matching | Days with a wrong row |
|---|---|---|---|---|---|
| Unrounded | | 4337 | 0 | 0 | 0 |
| D | half up | 4264 | 73 | 0 | 48 |
| D | truncated | 4180 | 157 | 0 | 55 |
| Dh | half up | 4253 | 84 | 0 | 52 |
| Dh | truncated | 4190 | 147 | 0 | 57 |
| D0 only | half up | 4284 | 53 | 0 | 34 |
| D0 only | truncated | 4226 | 111 | 0 | 46 |
| V | half up | 4135 | 202 | 0 | 59 |
| V | truncated | 4072 | 265 | 0 | 66 |
| D+V | half up | 4076 | 261 | 0 | 96 |
| D+V | truncated | 3932 | 405 | 0 | 102 |
| Dh+V | half up | 4069 | 268 | 0 | 94 |
| Dh+V | truncated | 3943 | 394 | 0 | 102 |

Every changed row differs from the published points by exactly one point, and not one of them matches. No variant changes n1 or n2 on any day. An example: on `dm-2022-zwickau/15-meter/task-1-2022-06-06`, D0 is 241673.48 m. Rounded half up to 241700 m, it raises Pm and moves CN 44 from 698.483 to 698.585, which rounds to 699. SeeYou published 698.

The rounding research found the same for the displayed precision: distance and speed rounded to 0.01 km and 0.01 km/h matched 3522 of 3645 non-club rows.

## Findings

- SWO 13.1.4 reads as a precision rule for the scoring distances that feed the formulas, not as a display rule. It doesn't name a rounding method and says nothing about speeds. The wording has been the same since at least 2015.
- The DAeC script V9.09 scores with SeeYou's unrounded distances and speeds and rounds only the final points.
- SeeYou's published SWO results are consistent only with unrounded distances. The published distances, speeds and Do are unrounded, and every tested way of rounding to 0.1 km produces rows that don't match, with no row improving.
- Following 13.1.4 literally (D+V) would make 261 rows wrong on 96 of 169 oracle days with half up rounding, and 405 rows on 102 days with truncation. Even the smallest variant, rounding only Do half up, breaks 53 rows on 34 days. Every difference is one point.
- The rule would touch the credited distance D of every competitor, which includes the RT task distance of finishers, and through it Dh, Do, Pm, Pdm, Pvm, Pd, V, Vh, Vo and Pv. It could also change n1 and n2, though it doesn't in this data. Dm and DM are whole kilometres and unaffected.

## Scripts

`variants.py` reads the `tables.jsonl` that `parse_pages.py` from the `research/rounding-and-ties` branch writes. Download the competitions listed above with `fetch_pages.py` from that branch.

```sh
DATA=/path/to/scratch python3 fetch_pages.py <competition>...
python3 parse_pages.py /path/to/scratch > tables.jsonl
python3 variants.py tables.jsonl [--list '<variant>']
```

`--list` prints the changed rows of one variant, named as in the output, for example `--list 'D+V half_up'`, with the unrounded, rounded and published points.
