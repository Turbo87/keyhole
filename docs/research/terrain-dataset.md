# Terrain elevation for the MVP

Research for [#28](https://github.com/Turbo87/keyhole/issues/28). The ticket assumed that outlanding and finish checks need ground elevation. That assumption does not hold, and the MVP drops the optional 200 m AGL rule from SWO Anlage F. The revised question is whether anything in the MVP still needs terrain elevation, and if so, which dataset Keyhole should use and how it is hosted. Facts were checked against the rule texts, the DAeC and openAIP airspace files, tool source code, dataset pages, licence texts, and provider pricing on 2026-10-31.

## Summary

The scoring rules need no terrain. SWO 10.3 computes every height that matters for a height violation (overflight, airspace, engine stop) from the reference height at take-off, and outlanding position and distance use no height at all. Annex A 5.3.1 says all altitudes in the rules, local procedures, task sheets, and briefings are given as MSL or QNH.

The one remaining MVP need comes from the airspace check (ANA-6). OpenAir files express some limits as AGL, and testing a fix against an AGL limit needs the ground elevation under the glider. In the DAeC file for Germany, the airspaces that competitions usually close (C, D, CTR, ED-R, TMZ, parachute zones) are almost all referenced to MSL or flight levels. Only the Basel CTR and the Bale-Mulhouse 1 sector above it, the Mellenthin D sector, and ED-R Klixbüll use AGL. RMZs and military low-flying areas use AGL as well, but they are normally not closed. Across the borders the picture changes. Swiss, French, and Austrian data has AGL limits on TMAs, CTRs, restricted areas, and nature reserves, and the Hotzenwald competition flies into Switzerland next to Basel.

The recommendation is to ship the MVP without a terrain dataset. Keyhole should show AGL limits at airspace import and treat a horizontal entry into a closed airspace with an AGL limit as "vertical limit not checked" instead of guessing. SWO 10.5.5 makes the organiser's airspace file the authority, so organisers can convert relevant AGL limits to MSL, as Hotzenwald already does for its restart area. If terrain becomes necessary later, the best fit is Copernicus GLO-30 (or Mapterhorn, which builds on it), converted to Terrarium WebP tiles that `updraft_terrain` can read. A Europe dataset costs cents to a few euros per month on the chosen hosting.

## What the rules need

- **Height reference.** SWO 10.3: "Bezugshöhe aller für Höhenverstöße relevanter Höhen (Überflug-/Luftraum-/Motorabstellhöhen/etc.) ist die aus der Referenzhöhe beim Start errechnete Höhe." This defines how the glider's altitude is derived (pressure altitude calibrated at take-off). It says nothing about the ground, so an airspace limit given in AGL still needs ground elevation to be compared with that altitude. SeeYou Competition implements the same idea with its "Takeoff altitude" setting, which calibrates "all flights to the same takeoff altitude which makes checking the airspace violations possible in the first place" ([SeeYou Competition Help](http://download.naviter.com/docs/cucompetition.pdf), 2012).
- **Outlandings.** Outlanding distance (SWO 6.2.1) and the virtual outlanding fix, "der Flugrekorder-Fix, der den Punkt der besten Leistung darstellt" (SWO 7.8.3), use no height ([SWO 2026](https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026.pdf)).
- **200 m AGL option.** SWO Anlage F section 11 defines an optional minimum of 200 m AGL for the last valid fix, determined with "das jeweils aktuelle, in der Auswertesoftware hinterlegte Höhenmodell" ([SWO 2026 Anlage F](https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026-Anlage-F.pdf)). It is out of MVP scope.
- **Airspace infringement.** SWO 10.5.3 counts an infringement if at least one fix lies inside a closed airspace or the line between two consecutive fixes passes through it. SWO 10.5.5 makes the airspace file used for scoring the authoritative definition, including temporary sectors.
- **Annex A.** Annex A 5.3.1 takes the MSL altitude of a glider as the pressure altitude difference from take-off plus airfield elevation. It requires all altitudes in rules, local procedures, task sheets, and briefings to be MSL or QNH, and allows flight levels in the forbidden airspace file ([Annex A 2025a](https://www.fai.org/sites/default/files/document/file/SC3A_2025a.pdf)). Annex A has no rule that refers to terrain.
- **Other MVP analysis.** Zone checks, start checks, finish height (SWO 10.3 and the local finish height above the reference point), maximum altitude, ENL detection, and aerotow release detection all work on recorded altitude, position, and time. None needs ground elevation.

## Airspace limits referenced to ground

### DAeC airspace file for Germany

The DAeC OpenAir file ([`2026_09_Airspace_Germany_OA1.txt`](https://www.daec.de/media/files/Dateien/Fachbereiche/Luftraum_und_Flugsicherheit/2026_09_Airspace_Germany_OA1.txt), effective 15 September 2026, maintained by Peter Kemme, linked from the [DAeC airspace data page](https://www.daec.de/fachbereiche/luftraum-flugsicherheit-betrieb/luftraumdaten/)) contains 692 airspaces and no class E. A count of floor and ceiling references per `AC` class gives:

| Class | Airspaces | With an AGL limit | AGL examples |
| --- | --- | --- | --- |
| C | 104 | 0 | |
| CTR | 66 | 1 | Bale-Mulhouse GND to 1000 ft AGL |
| D | 82 | 2 | Bale-Mulhouse 1 1000 ft AGL to FL100, Sector Mellenthin GND to 1000 ft AGL |
| R (ED-R) | 144 | 1 | ED-R Klixbüll GND to 2500 ft AGL |
| Q (ED-D, LFA) | 115 | 10 | LFA 1 to 10, 250 to 500 ft AGL (military low-flying areas) |
| TMZ | 56 | 0 | |
| RMZ | 33 | 26 | RMZ around uncontrolled airfields, GND to 1000 ft AGL |
| G | 6 | 5 | Satellitenzone Nord and Süd, RMZ Sektor Pfarrkirchen, GND to 1000 ft AGL |
| W | 86 | 1 | Baumholder-West 1500 ft AGL to FL95 |

GND as a floor needs no terrain, because a glider in flight is always above the ground. Only numeric AGL limits do.

The [DM 2026 local procedures](https://dm.acz.de/wp-content/uploads/2026/04/Ausfuehrungsbestimmungen-DM-2026-in-Zwickau.pdf) (section 9) close all airspace that needs a clearance and treat TMZs and parachute jump zones the same way, unless the competition director releases them. RMZs only require radio contact and are not closed there. In the German file, the closed classes therefore have only four AGL limits. Two of them are at Basel, one is on Usedom, and one is on the Danish border.

### openAIP data and neighbouring countries

The EuregioCup 2026 airspace file ([Updraft fixture](https://github.com/Turbo87/updraft/blob/a7e5358514372b47328441f152b1b84f3f980510/testdata/airspace/euregiocup_2026.txt), "WRITTEN_BY: OpenAIP") has the same AGL pattern as the DAeC file. It also contains class E with 1000 ft AGL floors and 2500 ft AGL ceilings, and an "ALPINE AREA" E from 2500 ft AGL. Class E is not closed to gliders.

The neighbouring countries look different. Enroute Flight Navigation publishes openAIP-derived airspace per country as GeoJSON ([catalog](https://enroute-data.akaflieg-freiburg.de/enroute-GeoJSONv003/maps.json)). A count over the Switzerland, France, Austria, and Netherlands files of 23 to 25 October 2026 found AGL limits in:

- **Switzerland:** CTR Basel (GND to 1000 ft AGL), TMA Basel 1 and 2 (class D from 1000 ft AGL), TMZ Northeast (2000 ft AGL to FL100), 21 Swiss gliding areas (`LSR`, from 2000 ft AGL), 15 nature reserves (GND to 2000 ft AGL), and 15 restricted areas, among them French areas covered by the same file.
- **France:** 8 CTRs, 14 class D areas, 197 restricted areas (many of them parks with minimum overflight heights, such as "PARC/RESERVE PYRENNEES GND - 3300 AGL"), and 41 prohibited areas.
- **Austria:** a TMA Ljubljana sector from 1000 ft AGL, Hungarian restricted areas from GND to 1500 ft AGL, and nature reserves.
- **Netherlands:** a few restricted areas from GND to 500 ft AGL and the German LFAs.

The [Hotzenwald 2026 local procedures](https://www.soaringspot.com/uploads/050/5091/files/AF-DE-2026_Ausfuhrung_61_Hotzenwaldwettbewerb_V1.pdf) define the competition area by the Stuttgart and Switzerland ICAO charts and state that the scoring software detects airspace violations automatically. That area is next to Basel, so an MVP-type SWO competition can meet AGL-limited closed airspace. The same document gives its restart area in MSL ("1150mNN (ca. 300m GND)"), which shows that organisers already convert ground-referenced heights to MSL where it matters.

The Naviter OpenAir specification allows `AGL` on both `AL` and `AH`, defines `GND` as "Ground, no altitude. AL only", and forbids mixed references such as `100m AGL/423m AMSL` ([OpenAir_File_Format_Support.md](https://github.com/naviter/seeyou_file_formats/blob/main/OpenAir_File_Format_Support.md)). The file itself never carries an MSL equivalent for an AGL limit.

## How other tools evaluate AGL limits

- **XCSoar** stores AGL limits as height above terrain and evaluates them against the terrain under the aircraft: `altitude_above_terrain + (state.altitude - state.altitude_agl)`. GND floors are always treated as below the aircraft "even if the aircraft's AGL altitude turns out to be negative due to terrain file inaccuracies" ([`AirspaceAltitude.cpp`](https://github.com/XCSoar/XCSoar/blob/50e9280cda2fae8a814dbbe7c7eee329dff6b447/src/Engine/Airspace/AirspaceAltitude.cpp)).
- **SeeYou Navigator 3.10** draws AGL boundaries that "follow the terrain profile" in its side view and asks users to "load your airspace and elevation data" ([Naviter, May 2026](https://naviter.com/2026/05/side-view/)). The terrain source is not named.
- **SeeYou desktop** checks violations through View > Airspace Violation, and "only visible airspace is checked" ([SeeYou Help 6.03](https://downloads.naviter.com/seeyou/seeyou.pdf)). The manual does not say how AGL limits are evaluated. It says SeeYou downloads "HGT maps" automatically "from the NASA or SeeYou servers", which indicates SRTM-format terrain. SeeYou Competition documents no terrain source and no AGL handling.
- **SeeYou Competition scoring scripts** ([naviter/seeyou_competition_scripts](https://github.com/naviter/seeyou_competition_scripts/tree/496773b)) receive airspace and outlanding results from SeeYou and contain no terrain logic.

## Recommendation for the MVP

1. **No terrain dataset in the MVP.** No scoring rule in scope needs one, and in German competition airspace the closed classes almost never use AGL.
2. **Surface AGL limits instead of guessing.** At airspace import (SET-12), Keyhole should list airspaces with numeric AGL limits so the organiser can convert them to MSL in the scoring file, which SWO 10.5.5 makes authoritative. During analysis (ANA-6), a fix that is horizontally inside a closed airspace with an AGL limit produces a "vertical limit not checked" warning for scorer review. Analysis only raises warnings in the MVP, so the scorer stays in control.
3. **No take-off elevation as ground.** Substituting the airfield elevation for the ground is wrong wherever the terrain differs from the airfield, which is exactly the hilly and alpine case where AGL limits appear. Near Basel the ground is several hundred metres below the Hotzenwald plateau.

Terrain becomes a real requirement if Keyhole adopts the Anlage F 200 m AGL option, scores competitions in Switzerland or France with their AGL-heavy airspace without converting limits, or shows ground under the barogram.

## Appendix: datasets if terrain is added later

### `updraft_terrain` input format

[`updraft_terrain`](https://github.com/Turbo87/updraft/tree/a7e5358514372b47328441f152b1b84f3f980510/libs/updraft_terrain) reads MBTiles SQLite files whose metadata has `format = webp` and `encoding = terrarium`. Tiles must be square WebP images of the same size in every file, in Web Mercator with TMS row order. It samples the highest available zoom with bilinear interpolation at pixel centres, decodes `R * 256 + G + B / 256 - 32768`, and returns MSL metres. Its test fixture is nine zoom-10 tiles from Enroute's France file.

Enroute's `.terrain` files are exactly this format. They are built by [`generateTerrainMaps.py`](https://github.com/Akaflieg-Freiburg/enrouteServer/blob/751b3b77e9d5df9683702ce938b078dea05f8eb7/scripts/generateTerrainMaps.py), which downloads AWS Terrain Tiles Terrarium PNGs at zoom 7 to 10, zeroes the blue (fractional) channel, clamps everything below 0 m to 0 m, and re-encodes the result as lossless 256 px WebP. Zoom 10 at 256 px is about 98 m per pixel at 50°N. The Germany file is 23 MB, and all European files together are 506 MB. Clamping to 0 m flattens Dutch polders that lie a few metres below sea level.

### Candidate datasets

| Dataset | Resolution | Coverage | Vertical datum | Licence for a hosted commercial service | Europe size |
| --- | --- | --- | --- | --- | --- |
| [Copernicus GLO-30](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) | 1 arcsec (about 30 m), wider longitude spacing above 50°N | Global land. The AWS mirror lacks 25 tiles in the Caucasus (38 to 41°N, 43 to 49°E). | EGM2008 | Reproduction, distribution, communication to the public, and adaptation, free of charge, worldwide, with no non-commercial clause. Requires a fixed notice, a liability disclaimer, and passing the obligations on ([licence PDF](https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf)). | 42.5 GB of float32 COGs for 34 to 72°N, 25°W to 45°E (1,659 tiles) |
| Copernicus GLO-90 | 3 arcsec (about 90 m) | Global land | EGM2008 | Same terms as GLO-30 | 5.2 GB for the same box |
| [SRTMGL1 v3](https://www.earthdata.nasa.gov/data/catalog/lpcloud-srtmgl1-003) | 1 arcsec | 56°S to 60°N only, so no Scandinavia north of 60° | EGM96 ([user guide](https://lpdaac.usgs.gov/documents/179/SRTM_User_Guide_V3.pdf)) | "Openly shared, without restriction", citation requested | Not measured |
| [ASTER GDEM v3](https://www.earthdata.nasa.gov/data/catalog/lpcloud-astgtm-003) | 1 arcsec | 83°S to 83°N | EGM96 | "Openly shared, without restriction", as is | Not measured, and the product "may contain anomalies and artifacts" |
| [EU-DEM v1.1](https://sdi.eea.europa.eu/catalogue/srv/api/records/3473589f-0854-4601-919e-2e7dd172ff50?language=eng) | 25 m, EPSG:3035 | EEA39 | EVRS2000 according to [Open Topo Data](https://www.opentopodata.org/datasets/eudem/) | Copernicus full, free and open, with source attribution | Status "Obsolete", no longer distributed by Copernicus. The EEA names Copernicus DEM as the successor. |
| [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) | Mixed. Zoom 10 to 15 use SRTM plus national sources, and EU-DEM appears only at zoom 9 ([sources](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md)). | Global | Mixed by source | Per-source attribution. The UK and New Zealand notices say "All rights reserved" ([attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)). | 506 MB at zoom 7 to 10 (Enroute) |
| [Mapterhorn](https://mapterhorn.com/) | GLO-30 globally, national DTMs at 0.25 to 20 m, for example DGM1 in most German states and swissALTI3D | Global | Not harmonised. Each source keeps its own height system. | 151 open sources, mostly CC BY, CC0, and Datenlizenz Deutschland. Non-commercial sources (Lithuania, Azores) are excluded ([EXCLUDED.md](https://github.com/mapterhorn/mapterhorn/blob/ccfd5b5/source-catalog/EXCLUDED.md), [attribution.json](https://download.mapterhorn.com/attribution.json)). | Planet file for zoom 0 to 12 is 356 GB. A Europe extract was not measured. |

Copernicus DEM is a surface model that "represents the surface of the Earth including buildings, infrastructure and vegetation" (AWS registry), so forests read 20 to 30 m high. Mapterhorn's national sources are mostly terrain models without vegetation. The datum differences between EGM96, EGM2008, and the European national height systems are below a few metres in Europe, which is irrelevant against airspace limits given in hundreds of feet.

Mapterhorn delivers Terrarium-encoded lossless WebP at 512 px in PMTiles archives ([data access](https://mapterhorn.com/data-access/), [pipeline](https://github.com/mapterhorn/mapterhorn/blob/ccfd5b5/pipelines/README.md)). This matches `updraft_terrain` apart from the container. Keyhole would need either a PMTiles backend or a conversion step to MBTiles.

### Size and access pattern

At zoom 12 (256 px, about 25 m per pixel at 50°N, matching GLO-30), sample AWS Terrarium tiles re-encoded like Enroute's averaged 9 KiB (Netherlands), 13 KiB (Rhön), and 24 KiB (Écrins). Germany needs about 15,000 tiles at zoom 12, so roughly 200 MB. The Europe bounding box holds 631,000 zoom-12 tiles, about half of them land, which suggests a few GB. These figures are estimates from 48 sample tiles, not a full build.

A flight samples terrain along a few hundred kilometres, which touches tens of zoom-12 tiles, well under 1 MB of tile data per flight. The GLO-30 COGs use 1024 by 1024 float32 blocks with DEFLATE, so a range request against them fetches about 2 MB per block ([readme](https://copernicus-dem-30m.s3.amazonaws.com/readme.html)). Pre-tiled Terrarium WebP is far cheaper per lookup.

### Hosting cost on Fly.io and Scaleway

| Option | Cost per month | Notes |
| --- | --- | --- |
| Terrarium MBTiles on a Fly volume | $0.15 per provisioned GB, so about $0.50 for Germany or about $1.50 for a 10 GB Europe set | `updraft_terrain` works unchanged. A volume lives on one physical server, ties the Machine to that host, and is not replicated ([volumes](https://docs.fly.io/volumes/overview), [pricing](https://docs.fly.io/about/pricing)). |
| Terrarium tiles in Scaleway Object Storage, synced to local disk at startup | €0.000022 per GB-hour Multi-AZ (about €0.016 per GB-month), €0.01 per GB egress ([catalog](https://api.scaleway.com/product-catalog/v2alpha1/public-catalog/products)) | Cents per month. Inbound traffic to Fly is free. It needs a local copy, because SQLite does not read over range requests. |
| PMTiles in Scaleway Object Storage with range requests | Same storage price, plus egress for each uncached tile | Lookups need no local disk. It needs a PMTiles reader in Keyhole and adds request latency on cache misses. |
| Raw GLO-30 COGs for Europe | About €0.68 per month in Object Storage or about $6.40 on a Fly volume | Point lookups read about 2 MB blocks. Conversion to tiles is cheaper to serve. |

Fly's image size limit is "roughly 8GB" uncompressed ([Fly community announcement](https://community.fly.io/t/docker-image-size-limit-raised-from-2gb-to-8gb/14749)). A Germany-sized MBTiles file could ship in the image, but a Europe set belongs on a volume or in object storage.

## Open questions

- Should Keyhole require organisers to convert AGL limits of closed airspace to MSL in the scoring airspace file, or only warn at import?
- Do German competitions ever close RMZs or LFAs, which carry most of the AGL limits in the DAeC file?
- Which competitions outside Germany (Switzerland, France, Annex A championships) are post-MVP targets, given their AGL-heavy airspace?
- If terrain is added, does Keyhole build its own GLO-30 Terrarium tiles or reuse Mapterhorn, and does `updraft_terrain` gain a PMTiles backend?
- How does SeeYou Competition evaluate AGL airspace limits, and with which terrain model? Naviter does not document it.
