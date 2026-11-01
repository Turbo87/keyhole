# Altitude errors in AGL airspace checks

Research for [#49](https://github.com/Turbo87/keyhole/issues/49). Flight analysis compares fixes against closed airspace with AGL limits by subtracting the Mapterhorn ground elevation, sampled bilinearly at zoom 10 from `planet.pmtiles`, from the fix altitude ([#26](https://github.com/Turbo87/keyhole/issues/26) point 12, [#36](https://github.com/Turbo87/keyhole/issues/36), [#37](https://github.com/Turbo87/keyhole/issues/37)). The fix altitude is pressure altitude calibrated once at take-off, as SWO 10.3 and Annex A 5.3.1 prescribe. The question is how far that altitude drifts from the true altitude over a competition flight, how other tools and rule sets deal with it, how large the height datum steps between the national terrain models in Mapterhorn are, and what tolerance or analysis log level follows for AGL entries.

Facts were checked on 2026-11-01 against the SWO 2026, FAI Annex A 2025a, CIVL Section 7A 2025, the IGC flight recorder specification with AL8, the GFAC report to the 2020 IGC plenary, the SeeYou help files and change log, the EPSG dataset in PROJ 9.7.0 (EPSG v12.022), the Mapterhorn repository at [`2c4195d`](https://github.com/mapterhorn/mapterhorn/tree/2c4195dd90b91a8dde5cfa3e27a1167f64808a41) and the data publishers. The drift figures were measured on the 25,065 IGC files of the local SoaringSpot download described in the [oracle fixtures research](https://github.com/Turbo87/keyhole/blob/research/oracle-fixtures/docs/research/oracle-fixtures.md). Claims marked **unverified** come from secondary sources or inference.

## Summary

The take-off calibrated pressure altitude is not the true altitude, but it is the altitude the rules define. Measured against GNSS altitude over 3,515 flights from 17 German competitions, it is off by a median of 5 m and a 95th percentile of 18 m within 500 m of the take-off height, 16 m and 44 m between 500 and 1000 m above it, and 31 m and 90 m between 1500 and 2000 m above it. Two effects cause this. The surface pressure changes during the day, which shows as a median 13 m and 95th percentile 28 m difference after landing back at the home field. Air warmer than the standard atmosphere makes pressure altitude understate height gains, by a median 22 m and up to about 45 m per 1000 m above take-off in Germany and 55 to 72 m in Australia, South Africa and Texas. Neither the SWO nor Annex A grants a vertical tolerance, and Annex A says the scored altitude should agree with an altimeter set to field elevation before take-off, which has the same errors.

The height datum steps between the national terrain models are negligible. Mapterhorn reprojects each source horizontally and leaves heights in the source's own datum, so steps appear at borders. They are 0.33 m between German DHHN2016 and Swiss LN02 heights at Basel, 0.50 m between German and French heights, 0.18 m between Swiss and French heights, about 0.3 m between German and Austrian GHA heights and 2.3 m on the Belgian border. All are under 1 percent of a 1000 ft limit, and all but the Belgian one are below the 1 m vertical step of the zoom 10 tiles.

Keyhole should keep comparing the take-off calibrated altitude with the terrain, without a tolerance, and keep every entry into closed airspace a warning as #26 decided. The errors Keyhole adds itself are the zoom 10 terrain error (99th percentile 2 m in lowlands, 18 to 29 m in the Alps) and the datum steps. The rule-defined altitude adds 18 to 44 m (95th percentile) at the heights where 1000 ft AGL limits usually sit and around 100 m in the Alps. The evidence of an AGL entry should therefore record the vertical depth of the penetration and the terrain elevation, and mark entries that are only vertical and no deeper than 50 m as marginal. Organisers who want a tolerance should put it into the airspace file as a buffer, as Annex A recommends with Sporting Limits.

## What the rules and tools prescribe

### Competition rules

**SWO.** "Bezugshöhe aller für Höhenverstöße relevanter Höhen (Überflug-/Luftraum-/Motorabstellhöhen/etc.) ist die aus der Referenzhöhe beim Start errechnete Höhe" (10.3). An entry happens when one fix is inside the closed airspace or the line between two consecutive fixes crosses it (10.5.3). The penalty is a virtual outlanding (10.5.8) and there is no vertical tolerance ([SWO 2026](https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026.pdf)).

**Annex A.** "The MSL altitude of a glider will be taken as the difference in recorded pressure altitude and the recorded pressure altitude at takeoff, plus the airfield elevation", and "MSL altitudes determined by the Scorer should agree with an altimeter set to field elevation before takeoff" (5.3.1). QNH and QNE altitudes are derived from it with the daily QNH and 1013.2 hPa. Entering forbidden airspace is an outlanding at the point of entry. Organisers can add "Sporting Limits" around forbidden airspace, horizontally or vertically, which must be part of the forbidden airspace file (1.4.5.3). Crossing them costs 1 point per metre up to 100 m, beyond that it counts as an outlanding. Annex A encourages organisers to avoid QNH and QNE limits and to use such buffers instead ([Annex A 2025a](https://www.soaringspot.com/uploads/053/5371/files/SC3A_2025a.pdf)). Neither rule set mentions AGL limits or terrain models.

**CIVL.** Hang gliding and paragliding go the other way. "Airspace violation checks rely on the GNSS altitude as recorded on the flight instrument", with barometric altitude as evidence in disputes after compensating "sensor drift errors" with a reference point (7A 4.4.5). The competition airspace must include "a buffer of at least 100 metres vertically and horizontally" around restricted areas, and penetration up to 100 m costs a linear share of the day's points (7A 6.3.1) ([Section 7A 2025](https://www.fai.org/sites/default/files/civl/documents/sporting_code_s7_a_-_cross_country_2025.pdf)). This is the only competition rule found with an explicit vertical allowance.

### IGC files

Pressure altitude in a B record is "the pressure altitude in metres with respect to the ICAO International Standard Atmosphere", so it is a QNE value. Other zero datums may be used for cockpit displays, but 1013.25 hPa "must always be used in the IGC file" (4.1). A flight recorder must record a baseline of fixes before take-off and after landing for comparison with airfield pressure (4.2). The calibration tolerances are 1 hPa at sea level, 3 hPa up to 2000 m (25 to 30 m) and 1 percent of altitude above (4.4.5) ([IGC FR specification, 2nd edition with AL8](https://xp-soaring.github.io/igc_file_format/igc_fr_specification_with_al8_2023-2-1_0.pdf)). Calibrating at take-off removes the offset but not the gain error.

GNSS altitude must be relative to the WGS84 ellipsoid, declared with `HFALG` as `ELL`, or `GEO` for the geoid. The specification notes vertical GNSS errors of 1.8 to 2.2 times the horizontal ones and "short-term variations compared to pressure altitude" ([AL8](https://xp-soaring.github.io/igc_file_format/igc_fr_specification_with_al8_2023-2-1_0.pdf)). GFAC found in 2019 that "many IGC-approved Flight Recorders use a Geoid earth model for GPS altitude", asked manufacturers to switch to the ellipsoid, and notes that LXNAV and Naviter did so in December 2019 ([GFAC report 2020](https://www.fai.org/sites/default/files/10_2_5_gfac_report_to_igc_plenary_2020.pdf)).

The download confirms the mix. In Germany and Czechia the geoid lies roughly 40 to 50 m above the ellipsoid (**unverified**, inferred from the medians below). GNSS altitude at take-off minus the Mapterhorn ground elevation is 47 m in the median for 4,945 LXNAV (`LXV`) files declaring `ELL`, and 47 to 54 m for Naviter, Flarm, LX Navigation `XFL` and Triadis files without `HFALG`. 111 old LX Navigation (`LXN`) and 21 `LXV` files without `HFALG` record geoid heights (median 0 and 2 m). A GNSS-based AGL check would therefore need per-logger datum handling and would still be 47 m off for a misdeclared file.

### SeeYou

SeeYou Competition calibrates pressure altitude with the day's QNH and a "Takeoff altitude", which "determines the QNH altitude to which all flights are referenced" and "makes checking the airspace violations possible in the first place". With no take-off altitude, "flights are evaluated as QNE". It also warns when the "Flight recorder QNH correction is more than the preset value" ([SeeYou Competition help](http://download.naviter.com/docs/cucompetition.pdf), 2012). The SeeYou change log lists "If pressure altitude is not recorded, GPS altitude is used", "No altitude correction when GPS altitude is used" and, in v10.45 (December 2024), "Do not make Auto QNH correction when only GPS altitude is recorded in IGC file" ([SeeYou change log](https://naviter.com/seeyou-makes-you-a-better-pilot/seeyou-change-log/)). No document says how SeeYou evaluates AGL limits or whether it applies any vertical tolerance, as [#28](https://github.com/Turbo87/keyhole/issues/28) already found.

WeGlide's documentation describes no airspace check. Its scoring errors only reject implausible altitudes and a derived QNH outside 980 to 1050 hPa ([WeGlide scoring errors](https://docs.weglide.org/contests/errors.html)). OLC was not checked.

## Pressure altitude drift over a flight

### Method

For every IGC file, take-off is the first fix from which the glider covers more than 12 m/s over the next 60 s, and landing is the end of the last such window. The calibration is the median of `GNSS altitude − pressure altitude` over the stationary fixes from 150 s to 15 s before take-off. Each later fix then gives the change of that difference, which is how far the take-off calibrated altitude of SWO 10.3 deviates from GNSS altitude, ignoring GNSS noise. The datum offset of the GNSS altitude cancels out. Files without a stationary baseline before take-off, without a working pressure sensor or with flights under 1 hour were skipped, which left 14,916 flights from 61 competitions. The change after landing uses the median over 10 to 180 s after landing and only counts while the logger stays put.

GNSS altitude is the better reference for true height but carries its own vertical error of a few metres and occasional glitches. Single glitches of several hundred metres appear in the maxima and are ignored in the percentiles.

### Results

Absolute change of `GNSS − pressure` since take-off in metres, as median / 95th percentile / 99th percentile across flights. Height bands are pressure height above take-off, and each flight contributes its median within the band.

| Measure | German competitions (3,515 flights) | All European (11,876) | Australia and South Africa (2,406) | Texas (634) |
| --- | --- | --- | --- | --- |
| After landing at home | 13 / 28 / 34 | 12 / 27 / 33 | 21 / 40 / 51 | 27 / 39 / 52 |
| After landing at home, flights over 4 h | 15 / 29 / 35 | 14 / 29 / 35 | 23 / 42 / 51 | 28 / 40 / 52 |
| In flight, 0 to 500 m above take-off | 5 / 18 / 27 | 6 / 20 / 28 | 7 / 26 / 35 | 6 / 20 / 28 |
| In flight, 500 to 1000 m | 16 / 44 / 54 | 21 / 48 / 58 | 39 / 65 / 75 | 49 / 66 / 73 |
| In flight, 1000 to 1500 m | 24 / 63 / 78 | 32 / 75 / 88 | 64 / 100 / 109 | 84 / 107 / 118 |
| In flight, 1500 to 2000 m | 31 / 90 / 106 | 46 / 101 / 117 | 92 / 134 / 147 | 109 / 146 / 162 |
| In flight, above 2000 m | 52 / 118 / 137 | 86 / 133 / 149 | 126 / 188 / 209 | 144 / 198 / 217 |
| Slope per 1000 m above take-off, p10 / p50 / p90 | 5 / 22 / 44 | 8 / 28 / 53 | 30 / 55 / 74 | 59 / 72 / 79 |

The median flight lasted 4.2 to 4.8 hours and reached 1,770 m above take-off in Germany.

**Surface pressure change.** On the ground after landing, the signed median is −13 m in Germany and −21 to −27 m elsewhere, so the pressure altitude reads higher than at take-off. That is a pressure fall of about 1.5 to 3 hPa over a soaring day at 8.3 m per hPa. 95 percent of German flights stay within 28 m, regardless of whether they land at home or elsewhere.

**Temperature.** The difference grows with height and is almost always positive. A glider climbing in air warmer than the ISA gains more true height than pressure height, by about `ΔT / T` of the climb, so 22 m per 1000 m corresponds to about 6 K above the standard atmosphere (derived from the hypsometric equation, not from a cited source). The hot sites show 55 to 72 m per 1000 m, or 15 to 20 K. This effect is zero at the take-off height and dominates higher up.

**For AGL limits.** What matters is the height above take-off at which the limit lies, which is the terrain elevation plus the limit minus the take-off elevation. Over terrain near the take-off height, a 1000 ft AGL limit sits 300 to 700 m above take-off, where the take-off calibrated altitude deviates by up to 18 to 44 m (95th percentile, Germany). Over Alpine terrain 1500 m above the take-off height, it deviates by up to about 100 m. Because the deviation is mostly positive, the scored altitude is usually lower than the true altitude. A glider flying below a closed airspace with an AGL floor, such as the Swiss TMA Basel 1 and 2 from 1000 ft AGL, is then less likely to be flagged than it should be. A glider above a closed airspace with an AGL ceiling, such as the Basel CTR from GND to 1000 ft AGL, is more likely to be flagged than it should be.

## Height datums in Mapterhorn

### Source datums

| Country | Mapterhorn source | Height datum | Source |
| --- | --- | --- | --- |
| Germany | DGM1 of the states | DHHN2016 | [Bavarian DGM1 notes](https://www.geodaten.bayern.de/odd/m/3/html/datenhinweise/datenhinweise_dgm.html), other states **unverified** |
| Switzerland | `swissalti3d` | LN02 (EPSG:5728) | file names in the [source catalog](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/source-catalog/swissalti3d/file_list.txt) end in `_2056_5728.tif` |
| Austria | `at1` (BEV ALS DTM, series 2024-09-15) | EVRF2000 Austria, orthometric (EPSG:9274), except the 2021-09-15 series in GHA (EPSG:5778) | [BEV ALS height raster](https://www.bev.gv.at/Services/Produkte/Digitales-Gelaendehoehenmodell/ALS-Hoehenraster.html). The state sources `atkaernten`, `atoberoesterreich` and `atsalzburg` are **unverified** |
| France | `frrgealti1metro` and others | NGF-IGN69 | `LAMB93-IGN69` in the file names of the [source catalog](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/source-catalog/frrgealti1metro/file_list.txt) |
| Belgium | `bewallonie` | DNG, Ostend (EPSG:5710) | [Walloon catalogue](https://geoportail.wallonie.be/catalogue/a004e570-99d6-4fe5-b83d-49b774409278.html). Flanders (`beflanders`) is **unverified** |
| Czechia | `cz` | EVRF2007 | [ČÚZK metadata](https://geoportal.cuzk.cz/(S(rtmc0jv2tukm5cadwnkwsgd2))/Default.aspx?lng=EN&mode=TextMeta&side=vyskopis&metadataID=CZ-CUZK-EL&mapid=8&menu=304) |
| Poland | `pl1` | EVRF2007 | `NumerycznyModelTerenuEVRF2007` service in the [source catalog](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/source-catalog/pl1/README.md) |
| Gaps | `glo30` | EGM2008 (EPSG:3855) | [Copernicus Data Space](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) |

### Mapterhorn does not normalise heights

Mapterhorn warps every source with `gdalwarp -t_srs EPSG:3857 -r cubicspline` and no vertical CRS or `-vshift` option ([`aggregation_reproject.py`](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/pipelines/aggregation_reproject.py#L53-L69)), and no pipeline step mentions height datums. Where sources meet, the higher-resolution source wins and a Gaussian blur smooths the seam ([pipelines README](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/pipelines/README.md)). Each country's heights therefore stay in their national datum, and the step between datums lies at the border, blurred over a few pixels.

The heights are orthometric or normal heights, not ellipsoidal. Sampled at zoom 12, Lake Constance reads 395.5 m off the German, Swiss and Austrian shores, Lake Geneva 372.0 m off Lausanne and Évian and Lago Maggiore 193.5 m off Locarno and Luino, in line with their usual water levels (**unverified** against gauge data). The lakes are flat in all sources, so these samples cannot reveal the datum steps themselves.

### Steps at the borders

The steps follow from the EPSG "Vertical Offset and Slope" transformations of each national datum to EVRF2007, or to EVRF2000 where no EVRF2007 transformation exists, evaluated at the border point. The transformations come from BKG via [CRS-EU](https://epsg.org/transformation_7838/DHHN2016-height-to-EVRF2007-height-1.html) and are stated with an accuracy of 0.1 m. A positive value means the first datum gives the larger height for the same point.

| Place | Datums | Step | EPSG transformations |
| --- | --- | --- | --- |
| Basel | DHHN2016 minus LN02 | −0.33 m | 7838, 5207 |
| Basel | DHHN92 minus NGF-IGN69 | −0.50 m | 5420, 5419 |
| Basel | LN02 minus NGF-IGN69 | −0.18 m | 5431, 5419 |
| Konstanz | DHHN2016 minus LN02 | −0.36 m | 7838, 5207 |
| Salzburg | DHHN2016 minus GHA | −0.34 m | 7838, 5557 |
| Bregenz | LN02 minus GHA | +0.08 m | 5207, 5557 |
| Strasbourg | DHHN92 minus NGF-IGN69 | −0.50 m | 5420, 5419 |
| Aachen | DHHN2016 minus Ostend | −2.33 m | 7838, 5199 |
| Aachen | DHHN92 minus NAP | −0.02 m | 5420, 5425 |
| Chiasso | LN02 minus Genoa 1942 | −0.22 m | 5207, 5215 |

DHHN2016 and DHHN92 differ by about 1 mm at these points (EPSG 7838 and 5211). The 0.33 m step at Basel is consistent with the 27 cm that the planners of the Laufenburg Rhine bridge used between Swiss heights and the old German NN, which they applied with the wrong sign ([Kanton Aargau](https://www.ag.ch/de/medien/medienmitteilungen?mm=bruecke-laufenburg-korrektur-noetig-9fe99eed-eecb-461c-aed8-0d1c4dcf41a5_de)). Where `at1` uses EVRF2000 Austria, the German-Austrian step shrinks to a few centimetres, since DHHN92 is 0.014 m from EVRF2000 (EPSG 5420). Orthometric and normal heights differ by centimetres at low elevations and by decimetres in high mountains (**unverified**). GLO-30 in EGM2008 only fills gaps and its own error of under 4 m (LE90) dominates there.

The Basel CTR touches German, Swiss and French data, so all three steps of 0.18 to 0.50 m apply around it. Against a 1000 ft (305 m) limit that is at most 0.16 percent, below the 1 m rounding of zoom 10 tiles and far below the 2 m lowland terrain error at zoom 10 from #36. The only large step is the 2.3 m on the Belgian border, still under 1 percent of the limit.

## Error budget for an AGL entry

| Term | Size | Introduced by |
| --- | --- | --- |
| Take-off calibrated altitude versus true altitude, 300 to 1000 m above take-off | 18 to 44 m (p95, Germany), up to 66 m at hot sites | the rule-defined altitude |
| Same, 1500 to 2500 m above take-off (Alps) | 90 to 118 m (p95, Germany) | the rule-defined altitude |
| Logger calibration gain | up to 3 hPa or 25 to 30 m up to 2000 m within the IGC tolerance | the logger |
| Terrain at zoom 10 | p99 0.8 to 2 m in lowlands, 18 to 29 m in the Alps (#36) | Keyhole |
| Horizontal fix error on a 35° slope | about 7 m per 10 m (#36) | the logger |
| Datum steps | 0.02 to 0.5 m, 2.3 m in Belgium | Mapterhorn sources |

The first three terms also affect a pilot's altimeter set to field elevation before take-off, which is what Annex A says the scored altitude should agree with. They are part of the altitude the rules define and no different for MSL limits, where nobody applies a tolerance either. The terms Keyhole adds are the terrain and the datum steps, at most about 30 m in the Alps and a few metres elsewhere.

## Recommendation

1. **Keep the take-off calibrated altitude.** Compare AGL limits with pressure altitude calibrated at take-off minus the Mapterhorn elevation, as for MSL limits. GNSS altitude contradicts SWO 10.3 and Annex A 5.3.1, and its datum is 47 m off for a share of the files.
2. **No vertical tolerance in the check.** The rules define none, Annex A puts buffers into the airspace file as Sporting Limits, and a built-in tolerance would flag fewer entries than the rule text requires. Organisers who want one convert the AGL limit to MSL or add a buffer in the scoring airspace file (SWO 10.5.5).
3. **Keep the warning level.** Every entry into closed airspace stays a warning under #26, so a marginal AGL entry already reaches the scorer, and no separate level is needed.
4. **Mark marginal vertical entries.** The evidence of an AGL entry should record the vertical depth relative to the AGL limit and the terrain elevation under the deepest fix. An entry that is only vertical, with the fix inside the lateral boundary only because of the AGL limit, and no deeper than 50 m (about 160 ft) should be marked as within the vertical uncertainty. 50 m covers the 95th percentile of the altitude deviation at 500 to 1000 m above take-off in Germany (44 m) and the Alpine 99th percentile terrain error at zoom 10 (29 m). The mark is information for the scorer and does not change the suggested flight end. Whether the threshold should grow with height above take-off in the Alps is left open.
5. **Ignore the datum steps.** No normalisation of Mapterhorn heights is needed. Belgium's 2.3 m step is the only one above 0.5 m and still under 1 percent of a 1000 ft limit.

At Basel the AGL value separates two airspaces that competitions close together, the CTR from GND to 1000 ft AGL and the Bale-Mulhouse 1 sector from 1000 ft AGL to FL100 ([terrain dataset research](https://github.com/Turbo87/keyhole/blob/research/terrain-dataset/docs/research/terrain-dataset.md)). As long as both are closed, the AGL limit only decides which airspace an entry is logged against, and the errors above do not change whether one happened.

## Reproduction

The drift measurement is a Python script over the gzipped IGC files that reads the B records (pressure altitude in bytes 26 to 30, GNSS altitude in bytes 31 to 35) and keeps fixes with validity `A` and non-zero GNSS altitude. The datum check sampled Mapterhorn zoom 12 bilinearly at the take-off positions between 47 and 55°N and 6 and 15°E. The lake samples used the same reader with the [`pmtiles`](https://pypi.org/project/pmtiles/) package and Pillow over range requests to `https://download.mapterhorn.com/planet.pmtiles`. The datum steps evaluate EPSG method 1046 with the parameters from `proj.db` of PROJ 9.7.0 on the GRS80 ellipsoid. No data was committed.

## Open questions

- Whether SeeYou Competition evaluates AGL limits at all, and against which terrain, is still undocumented. A test with a file crossing the Basel TMA would settle it.
- The vertical datums of the German states other than Bavaria, of the Austrian state sources and of Flanders were not checked individually. Any of them in an older datum would still differ by decimetres only.
- The GNSS reference for the drift measurement has its own error. GNSS altitude was not checked against an independent reference in flight.
- Whether the 50 m mark should scale with height above take-off, for example as a fixed part plus 50 m per 1000 m, depends on how many Alpine competitions close AGL airspace.
