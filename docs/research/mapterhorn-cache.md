# Mapterhorn tile caching for AGL airspace checks

Research for [#37](https://github.com/Turbo87/keyhole/issues/37). Flight analysis samples Mapterhorn ground elevation for every fix and fetches each tile once ([#26](https://github.com/Turbo87/keyhole/issues/26), point 12). [#36](https://github.com/Turbo87/keyhole/issues/36) settled on zoom 11 or zoom 10 from `planet.pmtiles` and left the choice to this ticket. The backend is one axum process on a Fly.io Machine that exits when idle, with SQLite on a Fly volume and one Cloudflare R2 bucket for IGC files, published JSON and the Litestream replica ([#34](https://github.com/Turbo87/keyhole/issues/34)). The question is where fetched tiles live, how they are fetched, and which zoom level to use.

Facts were checked on 2026-11-01 against the [PMTiles v3 specification](https://github.com/protomaps/PMTiles/blob/aec8fa1341222fdddb3318e9ffa8e18e19b312f7/spec/v3/spec.md), the Mapterhorn repository at [`2c4195d`](https://github.com/mapterhorn/mapterhorn/tree/2c4195dd90b91a8dde5cfa3e27a1167f64808a41), the live `planet.pmtiles` and its HTTP headers, the [`pmtiles` crate 0.26.0](https://github.com/stadiamaps/pmtiles-rs/tree/v0.26.0), Updraft at [`a7e5358`](https://github.com/Turbo87/updraft/tree/a7e5358514372b47328441f152b1b84f3f980510), and the Fly.io and Cloudflare pricing pages. Directory and tile figures were measured on the live archive with range requests from Germany.

## Summary

Use zoom 11 and a read-through tile cache in Keyhole's R2 bucket, filled lazily from `planet.pmtiles` per tile and never evicted. On upload, the application computes the set of zoom 11 tiles that the fixes touch, loads the missing ones from R2 or, failing that, from Mapterhorn, and then runs the blocking analysis against decoded tiles held in a bounded in-memory cache. A flight touches a median of 43 zoom 11 tiles (at most 72 in a sample of 29 flights) instead of tens of thousands of fix lookups, and all flights within Germany's bounding box together can never fetch more than about 3,600 tiles (210 MB) from Mapterhorn.

The cache is also the version pin. Mapterhorn replaces `planet.pmtiles` in place every 2 to 14 weeks, keeps no older release online, and its last release changed the rounding of every downsampled tile, which includes all of zoom 10 and 11. Once a tile is in R2, every rerun reads the same bytes, which keeps the review status from turning into "changed since review" because of an upstream release. Zoom 11 over zoom 10 costs 2 to 3 times the tiles per flight and 140 MB more per German season, which is negligible next to the R2 free tier, and keeps the 250 to 500 ft low-flying areas checkable.

## How a tile is read from `planet.pmtiles`

### Requests per tile

A PMTiles v3 archive starts with a 127-byte header, followed by a root directory, metadata, optional leaf directories and tile data. The root directory "MUST be contained in the first 16,384 bytes (16 KiB) so that latency-optimized clients can retrieve the root directory in advance", and directories are lists of entries that point either at a tile or at a leaf directory ([spec, chapters 2 and 4](https://github.com/protomaps/PMTiles/blob/aec8fa1341222fdddb3318e9ffa8e18e19b312f7/spec/v3/spec.md)). The spec discourages more than one level of leaf directories. A clustered archive stores tile data in TileID order, which follows a Hilbert curve per zoom level, so neighbouring tiles tend to be adjacent in the file.

The live `planet.pmtiles` header shows:

| Field | Value |
| --- | --- |
| Size | 355,579,263,191 bytes (355.6 GB) |
| Root directory | 6,572 bytes gzip, 2,294 entries, all of them leaf directories |
| Leaf directories | 2,294, 6.5 to 13.6 KB each (median 9.3 KB), 21.0 MB in total, 4,096 entries each |
| Addressed tiles, entries, unique contents | 13,485,266, 9,394,750, 9,316,839 |
| Clustered | yes |
| Internal and tile compression | gzip, none (WebP tiles) |

A reader therefore needs one 16 KiB request for the header and root directory, one request of about 10 KB per leaf directory, and then exactly one range request per tile. Every 150 km and 300 km circle around Lüsse, Bayreuth and Königsdorf (the sites from [the zoom research](https://github.com/Turbo87/keyhole/blob/research/mapterhorn-zoom/docs/research/mapterhorn-zoom.md)) falls into a single leaf directory at zoom 10 and into two or three at zoom 11. Once the directories are cached, the request count equals the tile count.

Within these circles the tiles form 17 to 29 contiguous byte runs at zoom 10 and 25 to 50 at zoom 11, so a batch reader that merges adjacent ranges, as `pmtiles extract --overfetch` does ([PMTiles CLI docs](https://docs.protomaps.com/pmtiles/cli)), downloads a whole competition area in a few dozen requests. Single z11 tile requests from Germany took 0.28 s minimum, 0.49 s median and 0.83 s maximum over 15 tiles. Responses carry `cf-cache-status: DYNAMIC`, so every range read goes to the R2 origin behind Cloudflare.

### The `pmtiles` crate

[`pmtiles` 0.26.0](https://crates.io/crates/pmtiles) (MIT or Apache-2.0, released 2026-10-29) reads and writes PMTiles v3. Reading is async on Tokio only, with backends for mmap, HTTP via reqwest (`http-async`), S3 and `object_store` ([README](https://github.com/stadiamaps/pmtiles-rs/blob/v0.26.0/README.md)). `AsyncPmTilesReader` reads the first 16,384 bytes once at construction and keeps the root directory. Leaf directories go through a `DirectoryCache`, either `NoCache`, `HashMapCache` or the bounded `MokaCache` ([`cache.rs`](https://github.com/stadiamaps/pmtiles-rs/blob/v0.26.0/src/cache.rs#L41-L69)). The crate does not cache tile bytes and has no extract function.

The HTTP backend records the `ETag` (or `Last-Modified`) of every response, and the reader returns `PmtError::SourceModified` when a later read carries a different value than the initial one ([`async_reader.rs`](https://github.com/stadiamaps/pmtiles-rs/blob/v0.26.0/src/async_reader.rs#L357-L373), [`http.rs`](https://github.com/stadiamaps/pmtiles-rs/blob/v0.26.0/src/backends/http.rs#L81)). This matters because a replaced archive has different offsets, and a range read through a stale directory would return bytes from the wrong tile. Mapterhorn's server also honours `If-Match`: a range request with the current ETag returned 206, one with a different ETag returned 412. A reader that hits either case has to drop its directories and reopen the archive.

The download server answered requests with Python's default `Python-urllib` User-Agent with 403, while curl, an empty User-Agent and `reqwest/0.12` got 206. Keyhole should send a descriptive User-Agent anyway.

### Decode cost

Mapterhorn tiles are lossless WebP of 512 by 512 pixels without alpha, about 70 KB each in the Alps. Decoding 15 z11 tiles 20 times each with `image-webp` 0.2.4, the decoder `updraft_terrain` uses, took 2.5 ms per tile on an Apple M2 Pro and yields 786,432 bytes of RGB. Decoding per fix would cost about a minute for a median flight of 23,000 fixes, so decoded tiles need to be kept in memory for at least the duration of one analysis, not just the compressed bytes.

## What Mapterhorn permits and how the archive changes

### Hosting and usage terms

`planet.pmtiles` is served from `https://download.mapterhorn.com/planet.pmtiles`, which the [distribution README](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/distribution/README.md) calls the primary download server. Mapterhorn credits Cloudflare with "R2 Object Storage, Workers, and bandwidth" on the [data access page](https://mapterhorn.com/data-access/), which also offers a single-tile endpoint at `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp` and documents `pmtiles extract --bbox` for area extracts. The only mirror listed in [`mirrors.json`](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/distribution/mirrors.json) is Source Coop, whose `download_urls.json` still reports version 0.0.11 while the primary reports 0.0.13.

No page or repository file states rate limits or a usage policy for either endpoint. Asked about server-side relaying and caching of tiles in [mapterhorn#317](https://github.com/mapterhorn/mapterhorn/issues/317), the maintainer answered that "you are allowed to store and redistributed the tiles indefinitely, just make sure that you attribute the original sources if they require it", pointing to [`attribution.json`](https://download.mapterhorn.com/attribution.json), and that "ideally you download the data you need as PMTiles archives" ([comment](https://github.com/mapterhorn/mapterhorn/issues/317#issuecomment-5659532519), [comment](https://github.com/mapterhorn/mapterhorn/issues/317#issuecomment-5659549590)). Keeping fetched tiles permanently is therefore allowed, and reading `planet.pmtiles` is the access path the maintainer prefers.

The zxy endpoint returned the same bytes as `planet.pmtiles` for three sampled z11 tiles. It sends `cache-control: public, max-age=604800` and no ETag, so after a release it can serve tiles from either version for up to a week, and a client cannot tell which.

### Release cadence and in-place replacement

Archive names carry no version since 0.0.5, when the version tag was removed from the metadata so that unchanged subpyramids keep their md5sum ([mapterhorn#122](https://github.com/mapterhorn/mapterhorn/pull/122)). Each release overwrites `planet.pmtiles` under the same URL, and `download_urls.json` lists only the current file with its md5sum. The [changelog](https://github.com/mapterhorn/mapterhorn/blob/2c4195dd90b91a8dde5cfa3e27a1167f64808a41/CHANGELOG.md) commits date the releases from 0.0.6 to 0.0.13 at 2025-12-15, 2025-12-29, 2026-02-06, 2026-03-13, 2026-04-08, 2026-05-12, 2026-08-19 and 2026-09-11, so the gap is 2 to 14 weeks. The live archive has `Last-Modified: Fri, 11 Sep 2026 14:58:22 GMT` and `ETag: "fa356a37f6efbb757fe00d1767bddf01-2650"`, which matches 0.0.13.

Releases change elevations at the zooms Keyhole would use. 0.0.13 fixed missing rounding in the downsampling step that builds every zoom below the native one ([mapterhorn#307](https://github.com/mapterhorn/mapterhorn/issues/307), [mapterhorn#308](https://github.com/mapterhorn/mapterhorn/pull/308)), which changed all zoom 10 and 11 values by up to half a metre. Source updates such as Hessen in 0.0.13 and swissALTI3D in 0.0.11 change them locally by whatever the new survey changed. Mapterhorn keeps no older release online, so reproducing an earlier elevation later is only possible from a copy Keyhole keeps.

The effect on results is small but not zero. A sub-metre or metre-level shift only changes an AGL check for fixes within that distance of a limit, but under [#26](https://github.com/Turbo87/keyhole/issues/26) point 9 any rerun that changes the analysis output turns a reviewed result into "changed since review". Without a pinned copy, a Mapterhorn release in the middle of a competition could do that for a result nobody touched.

## Tiles a flight actually needs

29 WeGlide flights from 2026 in a local test set, between 43.5°N in Provence and 51.4°N in Germany, were mapped to the tiles that bilinear sampling at pixel centres reads, including neighbour tiles near edges:

| | Zoom 10 | Zoom 11 |
| --- | --- | --- |
| Tiles per flight, min / median / max | 1 / 19 / 35 | 4 / 43 / 72 |
| Union of 14 flights on 2026-08-05 | 30 | 92 |
| 150 km competition area | 130 to 150 tiles, 9 to 16 MB | 461 to 540 tiles, 25 to 43 MB |
| 300 km competition area | 455 to 544 tiles, 35 to 54 MB | 1,739 to 2,062 tiles, 100 to 152 MB |
| Germany bounding box (5.8 to 15.1°E, 47.2 to 55.1°N) | 999 tiles, 925 unique, 73 MB | 3,942 tiles, 3,570 unique, 208 MB |
| Europe bounding box (11°W to 32°E, 35 to 71°N) | 23,064 tiles, 13,378 unique, 1.03 GB | 91,266 tiles, 50,714 unique, 2.93 GB |

The flights have a median of 23,453 fixes, so caching per tile cuts the lookups from the source by a factor of about 500. The 14 flights of one day touch 92 z11 tiles, a fifth of a 150 km area. 9 of the 29 flights reach more than 150 km from their take-off position and the farthest 378 km, so a circle around the airfield does not bound the tiles a competition needs. Unique counts are lower than tile counts because Mapterhorn stores identical sea tiles once. Area sizes are from the zoom research and the bounding boxes from the live directories.

## Storage costs

| | Price | Free | Notes |
| --- | --- | --- | --- |
| R2 Standard storage | $0.015 per GB-month | 10 GB-month | |
| R2 Class A (`PutObject`) | $4.50 per million | 1 million per month | |
| R2 Class B (`GetObject`, `HeadObject`) | $0.36 per million | 10 million per month | Egress is free |
| Fly volume | $0.15 per GB-month provisioned | none | Default 1 GB, can grow but not shrink, up to 500 GB, not replicated |
| Fly volume snapshots | $0.08 per GB-month stored | 10 GB | Daily, kept 5 days by default |
| Fly outbound transfer | $0.02 per GB in Europe | | Inbound is free |

Sources: [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Fly.io pricing](https://docs.fly.io/about/pricing), [Fly volumes](https://docs.fly.io/volumes/overview). A whole German season at zoom 11 is 0.2 GB in R2 and at most about 3,600 `PutObject` calls, and each analysis run costs about 43 `GetObject` calls. Both stay well inside the free tier next to Litestream's writes. On the volume the same 0.2 GB would cost nothing extra if the default 1 GB volume still has room next to SQLite, and $0.15 per month per added GB otherwise.

## Updraft's `updraft_terrain`

`TerrainReader` samples Terrarium WebP tiles from MBTiles files through `rusqlite` and keeps decoded tiles in a synchronous `moka` cache of 16 MiB weighted by decoded pixel bytes ([`lib.rs`](https://github.com/Turbo87/updraft/blob/a7e5358514372b47328441f152b1b84f3f980510/libs/updraft_terrain/src/lib.rs#L30-L67)). At 786 KB per decoded 512 px tile that holds 21 tiles. It caches misses as well, invalidates everything when a file is added or removed, interpolates bilinearly at pixel centres with neighbour tiles across edges, and falls back to lower zooms where a tile is missing ([`lib.rs`](https://github.com/Turbo87/updraft/blob/a7e5358514372b47328441f152b1b84f3f980510/libs/updraft_terrain/src/lib.rs#L136-L224)). The crate comment says it "does not manage downloads".

The decoding and sampling fit Keyhole as they are. The tile source does not, because it only reads local MBTiles files whose contents "must remain unchanged until removal or replacement". Reuse needs either a tile source trait in `updraft_terrain` or a Keyhole-side adapter that hands it decoded tiles, on top of the publishing work from [#4](https://github.com/Turbo87/keyhole/issues/4). The 16 MiB capacity is too small for a whole z11 flight but sufficient for sequential fixes, since a fix only reads its own tile and up to three neighbours.

## Options

**(a) Lazy per-tile fetch from Mapterhorn with a permanent cache.** The application fetches each missing tile once, by one range request into `planet.pmtiles`, and stores the WebP bytes. It needs no area defined in advance, covers foreign competitions and flights that leave the area, and touches only the tiles flights use. Mapterhorn sees a few thousand requests per season. A Mapterhorn outage only affects flights over tiles not yet cached, and then the AGL check fails with the error from #26. Tiles cached before and after a Mapterhorn release can come from different versions, which only shows as a metre-level seam at a tile edge.

**(b) Prefetched extract per competition.** `pmtiles extract --bbox` downloads a 150 km area in about 25 requests and stores it as one archive, 25 to 43 MB at zoom 11, which pins one version per competition. It needs the Go CLI, since the Rust crate has no extract, a bounding box per competition before the first upload, and a fallback for flights that leave it. It stores five times the tiles the flights of a day use.

**(c) Mirror zoom 0 to 11 for Europe into R2.** Zoom 11 alone is about 2.9 GB and zooms 0 to 11 about 4.3 GB, as one extract read by range requests, within the free tier. It removes Mapterhorn from the upload path and pins one version for everything. It needs a manual refresh step, still needs a fallback outside Europe, and a refresh changes all elevations at once, which is exactly the rescoring drift that pinning is meant to avoid.

**(d) In-memory cache of decoded tiles.** Needed in every option, because decoding dominates sampling. It is lost on every scale-to-zero, so on its own it is per-analysis caching, not "fetch once".

For the cache location in (a), the volume and R2 differ in durability more than in cost. The volume survives scale-to-zero and gives local reads, but it is a single unreplicated disk, and #34 already treats it as replaceable by restoring SQLite from R2 onto an empty volume. A cache that only lives there is silently refetched from a newer Mapterhorn release after such a restore or a platform move. R2 keeps the tiles with the rest of Keyhole's durable state and needs no sizing, at the cost of one `GetObject` per tile per analysis instead of a file read. Keeping tiles inside SQLite would put them under Litestream's replication, but would grow every database snapshot by the whole cache.

## Recommendation

1. **Zoom 11 from `planet.pmtiles`.** With per-tile caching, the footprint that made zoom 10 attractive in #36 stops mattering. Zoom 11 costs a median of 43 instead of 19 tiles per flight and 208 instead of 73 MB for all of Germany, both far inside the R2 free tier. In exchange it halves the Alpine error to a 99th percentile of 10 to 15 m and stays usable if 250 to 500 ft low-flying areas are ever closed, which zoom 10 does not.
2. **Option (a) with R2 as the store of record.** Store each fetched tile unchanged under a key such as `terrain/mapterhorn/11/{x}/{y}.webp`, with the archive ETag and the Mapterhorn version from `download_urls.json` as object metadata. Write a tile only if it is absent and never evict or refresh during a season, so that a tile's bytes never change once analysis has used them. Clearing the prefix between seasons is a deliberate dataset update.
3. **Prepare tiles before the blocking analysis.** After parsing, compute the set of z11 tiles the fixes and their bilinear neighbours read, load missing ones concurrently from R2 and then from Mapterhorn, and pass the decoded tiles into the `spawn_blocking` analysis. This keeps the async `pmtiles` reader and HTTP latency out of the engine and bounds a cold flight to a few seconds even at 0.5 s per Mapterhorn request.
4. **One `pmtiles` reader per process.** Open `AsyncPmTilesReader` with the `http-async` backend and a `HashMapCache` lazily on the first cache miss, so scale-to-zero restarts that hit only R2 never contact Mapterhorn. On `SourceModified` or a 412, drop the reader and reopen it once. Send a User-Agent naming Keyhole.
5. **A process-wide decoded tile cache.** A `moka` cache weighted by decoded bytes, as in `updraft_terrain`, sized to hold the largest flight at zoom 11 (72 tiles, about 57 MB in RGB), lets concurrent and repeated analyses share decoded tiles. It is rebuilt from R2 after every cold start.

The volume is not part of the design. If R2 reads from `fra` prove too slow, a local copy on the volume in front of R2 can be added without changing the pinning, because R2 stays authoritative. Options (b) and (c) remain fallbacks if Mapterhorn's availability on the upload path becomes a problem.

## Reproduction

Directory figures came from a small PMTiles v3 reader over HTTP range requests against `https://download.mapterhorn.com/planet.pmtiles` that parses the header, the root directory and the leaf directories covering each area. Tile sets used the same circles as the zoom research and Web Mercator bounding boxes. Flight tile sets used every B record of each IGC file and the four pixel-centre neighbours at 512 px per tile. Decode timing used a release build of `image-webp` 0.2.4 on 15 z11 tiles around Königsdorf, each decoded 20 times. Latencies were measured from a residential connection in Germany, not from Fly's `fra` region.

## Open questions

- How fast are R2 `GetObject` calls from a Fly Machine in `fra`? Neither R2 nor Mapterhorn latency was measured from Fly, and the answer decides whether a volume copy in front of R2 is worth adding.
- Should a Mapterhorn outage on an uncached tile retry later, for example in the startup sweep, or stay a "check failed" error until the scorer reruns the analysis?
- Does analysis need elevation for every fix, or only for fixes horizontally inside an AGL-limited closed airspace? The latter would cut the tiles per flight to the few under such airspace.
- Which source attributions from `attribution.json` must Keyhole show, and where, given that it does not display the tiles? swissALTI3D, for example, requires attribution.
- When and how is the cache cleared between seasons, and does an archived competition need its elevations again after that?
