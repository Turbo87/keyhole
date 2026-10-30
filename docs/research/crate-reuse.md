# Crate reuse for flight analysis

Research for [#4](https://github.com/Turbo87/keyhole/issues/4). The question is which existing Rust crates Keyhole can reuse for flight analysis, and what reuse would take. Facts were checked against crate sources, `Cargo.toml` manifests, and the crates.io API on 2026-10-30.

## Summary

Parsing is mostly solved. `igc`, `seeyou-cup`, and `openair` are published, permissively licensed, and already used by Updraft. Geodesy is solved by `geographiclib-rs` for WGS84 and `geo` for a sphere of configurable radius. Scoring logic is not solved anywhere: no crate offers observation zone geometry beyond a fixed cylinder, crossing detection for lines, sectors, or keyholes, G-record validation, or ENL/MOP engine detection. Keyhole has to write those itself. The Updraft `updraft_*` libraries are the best foundation for shared types (`LatLon`, units, EGM96, terrain), but none is published, so reuse means either a git dependency or publishing them first.

## Needs and candidates

### IGC parsing

[`igc`](https://crates.io/crates/igc) 0.3.0 ([Joey9801/igc-rs](https://github.com/Joey9801/igc-rs), MIT, 13k downloads) is a zero-copy, line-based parser for every record type A through L. Release 0.3.0 (July 2026) added whole-file parsing via `parse_records` with line-numbered errors and brought crates.io up to date with the repository. I/J record extension definitions are parsed, so ENL, MOP, and other B-record extensions can be read by byte range. The G record is exposed only as raw text (`GRecord { data: &str }`), with no validation. Updraft already depends on `igc = "=0.3.0"` in `updraft_replay` and in `updraft_core` tests. The crate has 83 unit tests plus proptest regressions. Fit is good for a low-level layer. Keyhole still needs its own typed flight model on top (fix time series, date rollover, extension decoding, header normalisation).

[`rustigc`](https://crates.io/crates/rustigc) 0.2.0-rc.3 ([jbrun3t/rustigc](https://github.com/jbrun3t/rustigc)) is a newer `winnow`-based parser with flight detection and free-distance cross-country scoring (XContest and CFD rulesets, aimed at paragliding). It has 126 tests and documents IGC spec violations seen in the wild. Its licence is `GPL-2.0-or-later WITH Classpath-exception-2.0`, it is a release candidate, and its scoring targets free flight rather than racing tasks. It is worth reading as a reference for real-world IGC quirks, not as a dependency.

[`igc_parser`](https://crates.io/crates/igc_parser) 0.1.7 ([LWEdslev/igc_parser](https://github.com/LWEdslev/igc_parser), MIT) offers an owned-type, builder-based parser. It has 24 tests and no release since September 2024. It offers nothing over `igc`.

[`rust-igc`](https://github.com/Turbo87/rust-igc) is an archived 2018 to 2020 regex-based parser (Rust 2015 edition, `failure`, unpublished under its own name). `nom-igc` is an early `nom` 4 experiment that was never published. Neither is worth reviving.

**G records and security.** No Rust crate validates G records. The signature scheme is manufacturer specific, and the IGC approval process relies on per-manufacturer validation programs. Keyhole can parse and store G records with `igc`, but validation needs a separate approach (calling external validators or an online service). That is a product and operations decision, not a crate choice.

### Geodesic distance

[`geographiclib-rs`](https://crates.io/crates/geographiclib-rs) 0.2.7 ([georust/geographiclib-rs](https://github.com/georust/geographiclib-rs), MIT, 22M downloads) is a port of Karney's GeographicLib. It solves inverse and direct problems on WGS84 with sub-millimetre accuracy and is the de facto standard.

[`geo`](https://crates.io/crates/geo) 0.33.1 ([georust/geo](https://github.com/georust/geo), MIT OR Apache-2.0, 25M downloads) wraps `geographiclib-rs` as its `Geodesic` metric space. Its `HaversineMeasure::new(radius)` takes an arbitrary sphere radius, so the FAI sphere (6371 km) is `HaversineMeasure::new(6_371_000.0)`. The default `Haversine` uses the IUGG mean radius of 6371.0088 km, which is not the FAI sphere. `geo` also provides polygon predicates and `rstar` integration that are useful for airspace checks.

[`updraft_geo`](https://github.com/Turbo87/updraft/tree/main/libs/updraft_geo) wraps `geographiclib-rs` behind a unit-typed `LatLon` with `distance()`, `bearing()`, `destination()`, a `CheapRuler` port, an antimeridian-aware `BoundingBox`, and optional `geo-types` conversion. It has 60 tests. Its `haversine_distance()` hardcodes the IUGG mean radius, so FAI-sphere distances need a radius parameter or a separate method.

[`aeroscore-rs`](https://github.com/glide-rs/aeroscore-rs) (unpublished, MIT, last push December 2023) holds an OLC Classic optimiser on a flat projection via [`flat_projection`](https://crates.io/crates/flat_projection). [`score-rs`](https://github.com/moldhouse/score-rs) (unpublished, MIT, a fork used by WeGlide) extends it with a triangular distance matrix and PyO3 bindings. Both solve free-distance optimisation, which centralised racing scoring does not need. A related local `flight-solver-rs` experiment is not public.

### Observation zones and crossing detection

No crate implements competition observation zone geometry. The closest pieces are:

- The private `crossings()` function in [Updraft's `cylinder.rs`](https://github.com/Turbo87/updraft/blob/main/libs/updraft_core/src/task/cylinder.rs) finds entry and exit fractions along a geodesic segment for a hardcoded 500 m cylinder, using ternary and bisection search on WGS84. It shows a workable approach but is not a general library.
- [`seeyou-cup`](https://crates.io/crates/seeyou-cup) parses CUP `ObsZone` lines into `ObservationZone { style, r1, a1, r2, a2, a12, line }`, which describes cylinders, sectors, lines, and keyholes as data only.
- [`xcsoar-tasks`](https://crates.io/crates/xcsoar-tasks) 0.1.0 ([glide-rs/xcsoar-tasks](https://github.com/glide-rs/xcsoar-tasks), MIT OR Apache-2.0) parses XCSoar `.tsk` XML into an `ObservationZone` enum with `Cylinder`, `Line`, `Keyhole`, `FAISector`, and `Sector` variants. It has 9 tests with snapshot fixtures, 56 downloads, and is also data only.

Keyhole has to build the zone geometry (containment, line crossing direction, sector bisector orientation per `ObsZoneStyle`, keyhole as cylinder union sector) and the fix-to-fix crossing interpolation itself. `geo` predicates on a local projection, or `geographiclib-rs` direct and inverse solutions, are the building blocks.

### CUP task and waypoint parsing

[`seeyou-cup`](https://crates.io/crates/seeyou-cup) 0.3.2 ([glide-rs/seeyou-cup](https://github.com/glide-rs/seeyou-cup), MIT OR Apache-2.0, last release September 2026) reads and writes CUP waypoints and the task section, including task options (`NoStart`, `TaskTime`, `WpDis`, `MinDis`, `RandomOrder`, and others), observation zones, and multiple starts. Integration tests cover encoding, edge cases, task options, and round-trip writing. [`updraft_waypoint`](https://github.com/Turbo87/updraft/tree/main/libs/updraft_waypoint) is a 91-line adapter that maps CUP waypoints onto `updraft_geo` and `updraft_units` types with warnings. It ignores tasks. Related published crates are [`seeyou-cupx`](https://crates.io/crates/seeyou-cupx) for the zipped CUPX variant and [`seeyou-cub`](https://crates.io/crates/seeyou-cub) for SeeYou binary airspace.

### OpenAir airspace

[`openair`](https://crates.io/crates/openair) 0.6.1 ([glide-rs/openair-rs](https://github.com/glide-rs/openair-rs), MIT OR Apache-2.0, 10k downloads) reads and writes OpenAir with arcs and circles as geometry primitives, plus extended types, activation times, frequencies, and transponder codes. It has 78 tests including snapshot tests. [`updraft_airspace`](https://github.com/Turbo87/updraft/tree/main/libs/updraft_airspace) converts that output into canonical airspace types, polygonises arcs and circles to within 1 m of the curve, and exports GeoJSON. It has 48 tests. Keyhole needs airspace only if it scores infringements automatically, which is a scope question.

### Terrain model for outlanding heights

[`updraft_terrain`](https://github.com/Turbo87/updraft/tree/main/libs/updraft_terrain) samples MSL elevation with bilinear interpolation from Terrarium-encoded WebP tiles stored in MBTiles SQLite files, with a `moka` decode cache. It has 12 tests. It suits server use if Keyhole hosts a regional Terrarium MBTiles dataset, but it depends on `anyhow` in its public API. [`updraft_egm96`](https://github.com/Turbo87/updraft/tree/main/libs/updraft_egm96) embeds a 1 degree EGM96 grid (about 64 KB) for ellipsoid to MSL conversion, which matters because IGC GNSS altitudes are ellipsoidal or geoid-referenced depending on the recorder header. [`egm96`](https://crates.io/crates/egm96) 0.3.2 (Zlib) is a published alternative. [`srtm_reader`](https://crates.io/crates/srtm_reader) 0.5.3 (BSD-3-Clause) reads raw SRTM HGT tiles and was not evaluated in depth.

### ENL and MOP engine detection

No crate implements engine-run detection. `igc` and `rustigc` both decode I-record extension definitions, so raw ENL and MOP values per fix are available. Thresholds, recorder-specific calibration, and run segmentation are Keyhole logic.

## Updraft extraction work

All `updraft_*` crates are at version `0.0.0`, have no `description` or `repository` metadata, depend on each other via path, and pin dependencies with `=` versions. The workspace is dual licensed MIT OR Apache-2.0 per crate manifest. Reuse options:

1. **Git dependency** on `Turbo87/updraft` with a pinned revision. This needs no Updraft changes but couples Keyhole builds to Updraft's toolchain and exact pins, and `cargo` resolves the whole workspace.
2. **Publish the leaf crates** (`updraft_units`, `updraft_geo`, `updraft_egm96`, then `updraft_terrain`). This needs metadata, relaxed version requirements for libraries, a release process, and API review (for example `anyhow` in `updraft_terrain`). It is moderate work with ongoing maintenance.
3. **Move the generic crates into `glide-rs`** next to `seeyou-cup`, `openair`, and `xcsoar-tasks`, under neutral names. This has the same work as option 2 plus renaming, but it signals shared ownership.

`updraft_core` is an instrument runtime (NMEA, traffic, sensor fusion) and is not a reuse candidate as a whole.

## Recommendation

| Need | Recommendation | Crate | Status | Licence | Work to reuse |
| --- | --- | --- | --- | --- | --- |
| IGC parsing | Reuse | `igc` 0.3.0 | crates.io | MIT | Build a typed flight model on top |
| IGC quirks reference | Read, do not depend | `rustigc` 0.2.0-rc.3 | crates.io (RC) | GPL-2.0+ with Classpath exception | None |
| G-record validation | Build or integrate externally | none | | | Decide on validator strategy |
| WGS84 distance | Reuse | `geographiclib-rs` 0.2.7 | crates.io | MIT | None |
| FAI sphere distance | Reuse | `geo` 0.33.1 `HaversineMeasure::new(6_371_000.0)` | crates.io | MIT OR Apache-2.0 | None |
| Shared position and unit types | Reuse after extraction | `updraft_geo`, `updraft_units` | unpublished | MIT OR Apache-2.0 | Publish or git dependency, add FAI sphere radius |
| Observation zones and crossings | Build | none (`updraft_core` cylinder as reference) | | | Full implementation |
| CUP waypoints and tasks | Reuse | `seeyou-cup` 0.3.2 | crates.io | MIT OR Apache-2.0 | Map OZ data to Keyhole zone types |
| XCSoar tasks | Reuse if needed | `xcsoar-tasks` 0.1.0 | crates.io | MIT OR Apache-2.0 | None |
| OpenAir airspace | Reuse | `openair` 0.6.1 | crates.io | MIT OR Apache-2.0 | Polygonise arcs (or extract from `updraft_airspace`) |
| Terrain heights | Reuse after extraction | `updraft_terrain` | unpublished | MIT OR Apache-2.0 | Publish, source a Terrarium dataset |
| Geoid conversion | Reuse | `updraft_egm96` or `egm96` 0.3.2 | unpublished or crates.io | MIT OR Apache-2.0 or Zlib | Publish `updraft_egm96`, or use `egm96` |
| ENL/MOP detection | Build | none | | | Full implementation on `igc` extensions |
| Free-distance optimisation | Skip | `aeroscore-rs`, `score-rs` | unpublished | MIT | Not needed for racing tasks |

## Open questions

- How should Keyhole validate G records, given that validation programs are manufacturer specific?
- Which terrain dataset (source, resolution, licence) does Keyhole host for outlanding heights?
- Does Keyhole score airspace infringements automatically, or is airspace display only?
- Should the generic Updraft crates be published under `updraft_*` names or moved to `glide-rs`?
