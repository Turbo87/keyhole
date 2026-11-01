# Mapterhorn zoom level for AGL airspace checks

Research for [#36](https://github.com/Turbo87/keyhole/issues/36). Flight analysis compares closed airspace with AGL limits against the fix altitude minus the Mapterhorn ground elevation sampled per fix ([#33](https://github.com/Turbo87/keyhole/issues/33), point 12). The question is which zoom level gives enough ground elevation accuracy and how many tiles and bytes a competition area needs at that zoom. Caching is out of scope and belongs to [#37](https://github.com/Turbo87/keyhole/issues/37).

Facts were checked on 2026-11-01 against the Mapterhorn repository at [`2c4195d`](https://github.com/mapterhorn/mapterhorn/tree/2c4195dd90b91a8dde5cfa3e27a1167f64808a41), its live download index and tiles, the dataset publishers, and the SWO 2026. The tile sizes and elevation errors below were measured on the live Mapterhorn archives with range requests.

## Summary

Zoom 12 is the right level. In Germany and all neighbouring countries, Mapterhorn's zoom 12 is not Copernicus GLO-30 but an average of the national 0.25 to 5 m terrain models, and its interpolated elevation differs from the full-resolution data by less than 1 m on average and by 2.8 m at the 95th percentile in the steepest Alpine terrain sampled. That is negligible against the 1000 ft (305 m) limits that closed airspace uses and below the other errors in the AGL comparison. Zoom 12 is also the highest zoom in the single global `planet.pmtiles` archive. Zoom 13 and above live in separate per-region archives and multiply the data by four per level for no relevant gain.

A competition area at zoom 12 holds about 1,750 to 2,060 tiles (110 to 180 MB) within 150 km and 6,800 to 8,100 tiles (460 to 660 MB) within 300 km, with the Alps at the high end. Zoom 11 is a valid cheaper choice at a quarter of the size, with a 95th percentile error of 6 m and a worst sampled error of 43 m in the Alps. Zoom 10 still keeps the Alpine 99th percentile under 30 m. At zoom 9 and below, the worst Alpine points are 42 to 334 m off, comparable to the limits themselves.

## What Mapterhorn offers

### Archive layout

Mapterhorn publishes Terrarium-encoded WebP tiles of 512 by 512 pixels in PMTiles archives ([pipelines README](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/pipelines/README.md)). `planet.pmtiles` "covers the entire planet on zoom levels 0 to 12", and higher zooms "are stored in subpyramids named 6-x-y.pmtiles. Their minzoom is 13 with a variable maxzoom; some go only to zoom 14, others up to 17" ([distribution README](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/distribution/README.md)). The live [`download_urls.json`](https://download.mapterhorn.com/download_urls.json) lists `planet.pmtiles` at 355.6 GB and 458 subpyramids, 12 of which go to zoom 18.

The subpyramids that cover Germany are large because they carry the 1 m data at zoom 16:

| Archive | Area | Zooms | Size |
| --- | --- | --- | --- |
| `6-33-20` | 5.6 to 11.3°E, 52.5 to 55.8°N | 13 to 17 | 62.1 GB |
| `6-34-20` | 11.3 to 16.9°E, 52.5 to 55.8°N | 13 to 17 | 59.5 GB |
| `6-33-21` | 5.6 to 11.3°E, 48.9 to 52.5°N | 13 to 18 | 221.3 GB |
| `6-34-21` | 11.3 to 16.9°E, 48.9 to 52.5°N | 13 to 16 | 60.3 GB |
| `6-33-22` | 5.6 to 11.3°E, 45.1 to 48.9°N | 13 to 18 | 614.9 GB |
| `6-34-22` | 11.3 to 16.9°E, 45.1 to 48.9°N | 13 to 17 | 166.1 GB |

### How the zoom levels are built

Mapterhorn reprojects every source to Web Mercator at "the smallest web mercator zoom level to oversample the source data", with a floor of zoom 12 ([`aggregation_covering.py`](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/pipelines/aggregation_covering.py#L96-L127)). Where sources overlap, "higher maxzoom is more important than lower" and lower-priority sources only fill no-data pixels, with a Gaussian blur along the seam ([pipelines README](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/pipelines/README.md)). Every lower zoom is then built from the next higher one by averaging 2 by 2 pixels ([`downsampling_run.py`](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/pipelines/downsampling_run.py#L59)).

Two consequences follow. First, the zoom 12 tiles over Germany are averages of the 1 m state terrain models, not GLO-30. GLO-30 only fills gaps. Second, averaging means coarser zooms smooth peaks and valley floors instead of picking a sample. A narrow valley floor reads too high and a ridge too low.

Elevations are rounded before encoding. Zoom 11 and below use 1 m steps and zoom 12 uses 0.5 m. The README gives a pixel size of 38.2 m at zoom 11 and 19.1 m at zoom 12 in projected EPSG:3857 metres. On the ground that is the projected size times the cosine of the latitude, so zoom 12 is about 12.3 m per pixel at 50°N and 13.2 m at 46.5°N.

| Zoom | Pixel, EPSG:3857 | Pixel on the ground at 50°N | Vertical step |
| --- | --- | --- | --- |
| 9 | 153 m | 98 m | 1 m |
| 10 | 76.4 m | 49 m | 1 m |
| 11 | 38.2 m | 24.6 m | 1 m |
| 12 | 19.1 m | 12.3 m | 0.5 m |
| 13 | 9.55 m | 6.1 m | 0.25 m |
| 14 | 4.78 m | 3.1 m | 0.125 m |
| 16 | 1.19 m | 0.77 m | 3.1 cm |

### Sources in Germany and neighbouring countries

All sources below appear in the live [`attribution.json`](https://download.mapterhorn.com/attribution.json). Resolutions are from each source's `metadata.json` in the [source catalog](https://github.com/mapterhorn/mapterhorn/tree/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/source-catalog). The native zoom follows from the rule above: a 1 m grid at 47 to 55°N is 1.5 to 1.7 m in EPSG:3857, so the first zoom with smaller pixels is 16.

| Country | Mapterhorn sources | Resolution | Native zoom |
| --- | --- | --- | --- |
| Germany | DGM1 of all 16 states (`debayern` to `dethueringen`), plus `debw025` (Baden-Württemberg ALS, 0.25 m) | 1 m | 16 (18 for `debw025`) |
| Switzerland | `swissalti3d`, plus `chzh` (Kanton Zürich, 0.25 m) | 0.5 m | 17 (18 for `chzh`) |
| Austria | `at1` (BEV ALS-DGM), `atkaernten`, `atoberoesterreich`, `atsalzburg` at 1 m, `atburgenland` 5 m, `at10` 10 m | 1 m | 16 |
| France | `frrgealti1metro` (RGE ALTI 1 m), `frrgealti5metro`, `frhd2154*` (LiDAR HD 0.5 m) | 0.5 to 5 m | 14 to 17 |
| Belgium, Luxembourg | `beflanders` 1 m, `bewallonie` 0.5 m, `lu` 0.5 m | 0.5 to 1 m | 16 to 17 |
| Netherlands | `nlahn5lowresfilled` (AHN5) | 5 m | 14 |
| Denmark | `dk` (Danmarks Højdemodel) | 0.4 m | 17 |
| Poland | `pl1`, `pl5` | 1 to 5 m | 14 to 16 |
| Czechia | `cz` (DMR 4G) | 5 m | 14 |
| Italy | `itbozen` 2.5 m, `itaosta` 2 m, `ittrentino`, `itlombardia`, `itpiemonte` 5 m, elsewhere `tinitaly` 10 m | 2 to 10 m | 13 to 15 |
| Gaps and sea | `glo30` (Copernicus GLO-30) | 30 m | 11 to 12, raised to 12 |

Vertical accuracy as stated by the publishers:

- **German DGM1.** The BKG's federal DGM1 states "Höhengenauigkeit: 0.3 m" and a grid of "1 m x 1 m" ([BKG metadata](https://mis.bkg.bund.de/trefferanzeige?docuuid=C6F3F00E-8154-439A-94E5-EB1523434981)). Mapterhorn uses the state releases of the same data.
- **swissALTI3D.** New-generation LiDAR guarantees "eine Höhengenauigkeit von 0.3 m (1 Sigma)", older LiDAR 0.5 m, and stereo correlation, used in high Alpine areas not yet updated, "zwischen 1 m und 3 m (1 Sigma)". One sixth of Switzerland is updated with new LiDAR every year since the 2019 release ([swisstopo release report 2025](https://backend.swisstopo.admin.ch/fileservice/sdweb-docs-prod-swisstopoch-files/files/2025/01/17/d39dd07e-4a20-408e-9113-509963f215c6.pdf)).
- **Copernicus GLO-30.** "< 4m (90% linear error)" absolute, relative "< 2m for slopes below or equal 20%" and "< 4m for slopes above 20%", horizontal "< 6m (90% circular error)". It is "a Digital Surface Model (DSM)", so forests and buildings are included ([Copernicus Data Space](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)). In the countries above it only fills gaps.

The publisher figures for Austria, France and the other neighbours were not checked. They are lidar or photogrammetric terrain models with metre-level grids, and the measurements below show that the zoom-dependent error dominates any sub-metre source error at every zoom of interest.

## Vertical tolerance that matters

The SWO has no vertical tolerance for airspace. SWO 10.5.3 counts an entry "wenn mindestens 1 FR-Aufzeichnungspunkt im gesperrten Luftraum aufgezeichnet ist" or the line between two consecutive fixes passes through it, and the penalty catalogue (10.5.8) answers "Luftraumverletzung" with a virtual outlanding ([SWO 2026](https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026.pdf)). A terrain error therefore only changes a result for fixes within that error of the limit, but there it flips the result completely.

The AGL limits found in [the terrain dataset research](https://github.com/Turbo87/keyhole/blob/research/terrain-dataset/docs/research/terrain-dataset.md) for airspace that competitions close are 1000 ft (305 m) for the Basel CTR, Bale-Mulhouse 1 and the Mellenthin sector, 2500 ft for ED-R Klixbüll, and 1000 to 2000 ft for Swiss TMAs, TMZ and nature reserves. The smallest AGL limits in the German file are the 250 to 500 ft (76 to 152 m) military low-flying areas, which are normally not closed.

The terrain error is one of several in `altitude − ground`:

- **Altitude.** SWO 10.3 derives every relevant height from the reference height at take-off, so the fix altitude is pressure altitude calibrated once. Near sea level 1 hPa corresponds to about 8.3 m (from the barometric formula, `R·T/(g·p)` with 287 J/(kg·K), 288 K and 1013 hPa), so every hPa of pressure change since take-off shifts the fix altitude by about 8 m.
- **Horizontal position.** A fix that is 10 m off on a 35° slope, the median slope of the Alpine samples below, samples ground that is about 7 m higher or lower.
- **Terrain.** The source error (0.3 m in Germany, up to 3 m in high Swiss terrain, below 4 m LE90 for GLO-30) plus the zoom-dependent smoothing measured below.

A zoom level is good enough when its error stays well below the first two terms. Its contribution to a 305 m limit should not exceed a few percent.

## Measured error by zoom

### Method

For five areas, six zoom 16 tiles (about 390 m square each) were picked at random inside one zoom 12 tile, and 800 random points were sampled in each, 4,800 points per area. Each point was sampled bilinearly at pixel centres, as [`updraft_terrain`](https://github.com/Turbo87/updraft/tree/a7e5358514372b47328441f152b1b84f3f980510/libs/updraft_terrain) does, at zoom 16 and at every lower zoom. The tables give the absolute difference to zoom 16. Zoom 16 is the native zoom of the German DGM1 and a 2 by 2 average of swissALTI3D, so the difference isolates what the coarser zoom loses. It excludes the source's own error from the previous section. Slope statistics are computed from the zoom 16 pixels.

| Area | Centre | Elevation range | Median slope | 95th percentile slope |
| --- | --- | --- | --- | --- |
| Fläming, lowland near Lüsse | 12.66°E, 52.10°N | 64 to 99 m | 1.7° | 7.8° |
| Fichtelgebirge, low mountains | 11.85°E, 50.05°N | 602 to 1017 m | 9.3° | 21.2° |
| Basel, Rhine valley and Jura edge | 7.62°E, 47.53°N | 256 to 365 m | 3.3° | 24.4° |
| Wetterstein, Bavarian Alps | 11.05°E, 47.43°N | 1027 to 2335 m | 35.5° | 61.9° |
| Lauterbrunnen, Swiss Alps | 7.91°E, 46.58°N | 1598 to 2720 m | 32.2° | 53.7° |

### Results

95th percentile and maximum of the absolute error in metres:

| Zoom | Fläming | Fichtelgebirge | Basel | Wetterstein | Lauterbrunnen |
| --- | --- | --- | --- | --- | --- |
| 6 | 5.7 / 7.9 | 61.1 / 80.4 | 19.0 / 23.5 | 173.6 / 333.8 | 206.9 / 273.8 |
| 7 | 5.2 / 7.4 | 25.8 / 33.7 | 14.4 / 19.2 | 81.9 / 183.6 | 81.1 / 158.6 |
| 8 | 2.9 / 5.8 | 12.1 / 21.6 | 9.0 / 14.9 | 49.5 / 131.9 | 43.8 / 84.0 |
| 9 | 1.6 / 4.6 | 5.2 / 14.0 | 4.4 / 9.6 | 24.4 / 75.8 | 18.9 / 42.0 |
| 10 | 0.8 / 3.6 | 2.0 / 7.2 | 2.0 / 7.1 | 11.8 / 62.1 | 10.2 / 26.8 |
| 11 | 0.5 / 2.1 | 0.9 / 3.7 | 1.2 / 6.0 | 6.0 / 42.9 | 4.9 / 21.1 |
| 12 | 0.3 / 1.4 | 0.5 / 2.0 | 0.7 / 4.3 | 2.8 / 41.7 | 2.4 / 18.5 |
| 13 | 0.2 / 0.7 | 0.2 / 1.0 | 0.4 / 1.8 | 1.3 / 18.7 | 1.1 / 15.1 |
| 14 | 0.1 / 0.4 | 0.1 / 0.6 | 0.2 / 1.2 | 0.6 / 15.6 | 0.5 / 10.7 |

Mean absolute error and 99th percentile at zooms 10 to 12 in the Alpine areas:

| Zoom | Wetterstein mean / p99 | Lauterbrunnen mean / p99 |
| --- | --- | --- |
| 10 | 3.7 / 28.6 | 3.2 / 17.5 |
| 11 | 1.8 / 15.0 | 1.5 / 9.7 |
| 12 | 0.9 / 8.4 | 0.7 / 5.1 |

The signed mean error is at most 1 m in every area at zoom 9 and above, so smoothing does not shift AGL heights systematically in one direction. The error roughly halves with every zoom step, as expected for averaging over pixels of half the size. In lowlands and low mountains every zoom from 9 upward stays within a few metres. Terrain roughness drives the error. The Alps need about three more zoom levels than the Fläming for the same error.

The maxima come from single points on cliffs and are poorly sampled with 4,800 points. They mark where a horizontal fix error of 10 m would already produce a similar difference on the same slope.

### Reading against the tolerance

At zoom 12 the 99th percentile is below 1.2 m outside the Alps and below 8.4 m in the steepest Alpine area, about 3 percent of a 305 m limit, and below the error from a single hPa of pressure drift. At zoom 10 the Alpine 99th percentile of 18 to 29 m is still under 10 percent of a 305 m limit. At zoom 9 and below, the worst Alpine points are 42 to 334 m off, the size of the limit itself. Against the 76 m low-flying areas, only zoom 11 and above keep the Alpine maximum clearly below the limit.

## Tiles per competition area

Tiles were counted that intersect a circle of 150 km and 300 km around three airfields, with coordinates rounded to about 1 km: Lüsse (12.66°E, 52.14°N, lowland with the Baltic coast inside 300 km), Bayreuth (11.64°E, 49.985°N, low mountains) and Königsdorf (11.47°E, 47.83°N, Alpine foothills with the Alps inside both radii). Sizes are the exact tile lengths from the PMTiles directories, in decimal MB. Zoom 12 and below come from `planet.pmtiles`, zoom 13 and above from the subpyramids.

| Radius | Zoom | Lüsse | Bayreuth | Königsdorf |
| --- | --- | --- | --- | --- |
| 150 km | 10 | 150 tiles, 9.3 MB | 136 tiles, 12.4 MB | 130 tiles, 16.4 MB |
| 150 km | 11 | 540 tiles, 25.0 MB | 499 tiles, 32.9 MB | 461 tiles, 42.8 MB |
| 150 km | 12 | 2,059 tiles, 112 MB | 1,888 tiles, 146 MB | 1,747 tiles, 180 MB |
| 150 km | 13 | 8,057 tiles, 477 MB | 7,354 tiles, 594 MB | 6,755 tiles, 714 MB |
| 150 km | 14 | 31,855 tiles, 1.89 GB | 29,042 tiles, 2.27 GB | 26,653 tiles, 2.82 GB |
| 300 km | 10 | 544 tiles, 35.2 MB | 488 tiles, 44.1 MB | 455 tiles, 54.0 MB |
| 300 km | 11 | 2,062 tiles, 99.8 MB | 1,884 tiles, 123 MB | 1,739 tiles, 152 MB |
| 300 km | 12 | 8,064 tiles, 463 MB | 7,364 tiles, 560 MB | 6,769 tiles, 660 MB |
| 300 km | 13 | 31,904 tiles, 1.97 GB | 29,081 tiles, 2.33 GB | 26,698 tiles, 2.68 GB |
| 300 km | 14 | 126,809 tiles, 7.75 GB | 115,550 tiles, 9.02 GB | 105,990 tiles, 10.3 GB |

At zoom 13 within 300 km of Lüsse, 1,578 tiles do not exist, and at zoom 14 within 300 km of Lüsse and Königsdorf, 6,167 and 5,265 tiles do not exist. These are areas where the best source ends at a lower zoom, such as TINITALY in northern Italy at zoom 13, or open sea. A reader has to fall back to the parent tile there.

An average zoom 12 tile is 55 KB at Lüsse, 77 KB at Bayreuth and 103 KB at Königsdorf. Rough terrain compresses worse, so the Alpine areas are larger per tile, while smaller tiles at higher latitudes give the northern site more tiles per circle. The zoom 12 tiles average more bytes than zoom 11 tiles because the vertical step halves from 1 m to 0.5 m at zoom 12.

## Recommendation

1. **Sample zoom 12 from `planet.pmtiles`.** It keeps the Alpine 99th percentile below 9 m and every other area below about 1 m, well under the altitude and position errors, at 110 to 180 MB per 150 km area and 460 to 660 MB per 300 km area. It needs one archive for the whole world, so foreign competitions and cross-border tasks need no per-region archive selection and no fallback logic.
2. **Do not go above zoom 12.** Zoom 13 and 14 cost four and sixteen times the data, live in subpyramids of 60 to 615 GB each over Germany, have holes that need fallback, and improve an error that is already below the other terms.
3. **Zoom 11 is the acceptable floor for closed airspace.** If #37 needs to cut size, zoom 11 at about a quarter of the bytes keeps the Alpine 95th percentile at 5 to 6 m and the worst sampled point at 43 m. Zoom 10 is still usable against 1000 ft limits, but not against the 250 to 500 ft limits of the low-flying areas if those are ever closed. Zoom 9 and below are not acceptable in the Alps.

## Reproduction

The measurements used a small PMTiles v3 reader over HTTP range requests against `https://download.mapterhorn.com/`. Tile counts used the directory entries only. The error measurement decoded the WebP tiles with Pillow and the Terrarium formula `R·256 + G + B/256 − 32768`, sampled bilinearly at pixel centres with a fixed random seed of 36. The sample areas are small, so the maxima and the 99th percentiles in the Alps are indicative rather than exact.

## Open questions

- Should #37 cache whole competition areas at zoom 12, or only the tiles along each flight, given that a flight touches a small fraction of a 300 km area?
- Mapterhorn does not harmonise vertical datums, so German state heights meet Swiss LN02 heights (EPSG:5728 in the swissALTI3D file names) at the border. The offset was not measured at the Basel CTR, though any sub-metre step is irrelevant against these limits.
- The Austrian, French and Italian publisher accuracy figures were not verified. They would matter only if a zoom above 12 were chosen.
- How large is the pressure altitude drift from SWO 10.3's single take-off calibration over a competition day? It is likely the dominant error in the AGL comparison but was not quantified here.
