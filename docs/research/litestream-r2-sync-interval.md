# Litestream sync interval and R2 Class A operations

Research for [#48](https://github.com/Turbo87/keyhole/issues/48). The question is which Litestream settings keep Cloudflare R2 Class A operations within the free 1 million per month, and what data loss window each setting implies. The hosting is fixed by [#34](https://github.com/Turbo87/keyhole/issues/34): axum on a Fly.io Machine in `fra` that exits when idle, SQLite on a Fly volume replicated by Litestream to one R2 bucket, which also holds the IGC files and the published results JSON, with about 7 days of point-in-time restore.

Facts were checked on 2026-11-01 against the Litestream source at the [v0.5.17](https://github.com/benbjohnson/litestream/releases/tag/v0.5.17) tag (2026-08-31, the latest release), the Litestream `main` branch, the [Litestream configuration reference](https://litestream.io/reference/config/), the [R2 pricing page](https://developers.cloudflare.com/r2/pricing/) and the Fly.io documentation. Running Litestream against a local S3 server to count requests was not possible in this environment, so every operation count below is derived from the source code and marked **from source**. Workload figures are assumptions and marked **unverified**.

## Summary

Litestream stays far inside the free tier for Keyhole, but its default background loops cost more than its writes do. With default settings, v0.5.17 issues about 613 `ListObjects` requests per hour while the Machine is running, even with no writes at all. For a Machine that is awake about 110 hours in an active month this adds up to about 87,000 Class A operations from Litestream and about 89,000 with the app's IGC uploads and published JSON, 9 % of the free tier. With `l0-retention-check-interval: 1h` and two compaction levels at 5 minutes and 1 hour, the background drops to about 15 requests per running hour, and the active month comes to about 15,000 Class A operations in total. An idle month costs about 400.

The `sync-interval` setting is not the cost lever. Litestream writes one L0 file per `monitor-interval` tick that finds new WAL frames and uploads each L0 file with its own `PutObject`, so a longer `sync-interval` only delays the same number of uploads. The documentation's cost section says the opposite and appears to be wrong (**from source**). The write-driven cost is bounded by `monitor-interval`, at most 3,600 PUTs per hour of continuous writes at the default 1 s, and Keyhole's writes are bursty enough that this is a few thousand per month.

Keeping `monitor-interval` and `sync-interval` at their 1 s defaults costs nothing measurable and limits the loss window to about 2 s plus upload time, which applies only when the Fly volume itself is lost. A clean idle exit loses nothing, because Litestream runs axum with `-exec` and performs a final sync after axum exits. Fly-initiated stops need a `kill_timeout` long enough for that final sync, because the default of 5 s is shorter than Litestream's 30 s shutdown sync timeout.

## R2 operation classes

R2 counts `ListObjects`, `PutObject`, `CreateMultipartUpload`, `UploadPart` and `CompleteMultipartUpload` as Class A, `HeadObject` and `GetObject` as Class B, and `DeleteObject` as free. The free tier includes 1 million Class A and 10 million Class B requests per month for Standard storage, after which Class A costs $4.50 per million, and usage is rounded up to the next million ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). The page does not list `DeleteObjects`, the batch delete that Litestream uses, in any class (**unverified**). Litestream issues at most one such call per retention pass, so its class does not change the estimates.

## What Litestream v0.5.17 sends to the replica

**Defaults.** `monitor-interval` is 1 s ([db.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/db.go#L33)), `sync-interval` is 1 s ([replica.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/replica.go#L26)), the compaction levels are 30 s, 5 min and 1 h ([compaction_level.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/compaction_level.go#L14)), snapshots are taken every 24 h and kept 24 h, and L0 files are kept 5 min after compaction with a retention check every 15 s ([store.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/store.go#L60)). The configuration reference documents the same values ([config reference](https://litestream.io/reference/config/)).

**Listing.** Every `LTXFiles()` call on the S3 client is a `ListObjectsV2` paginator over the level's prefix, one request per 1,000 keys, and the `seek` argument filters on the client, so a call lists the whole level ([s3/replica_client.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/s3/replica_client.go#L1554)). With an `endpoint` configured, as for R2, the client skips the bucket region lookup ([s3/replica_client.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/s3/replica_client.go#L375)).

**Writes.** The database monitor wakes every `monitor-interval`, and each sync that finds new WAL frames writes one L0 file with the next TXID ([db.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/db.go#L2006)). The replica loop then uploads every L0 file since its last position one at a time ([replica.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/replica.go#L222)). Files below 5 MiB go up with one `PutObject`, larger ones with a multipart upload, which costs one Class A operation per 5 MiB part plus two ([s3/replica_client.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/s3/replica_client.go#L802)). The time-based checkpoint after `checkpoint-interval` (1 min) writes a sequence row and so adds about one L0 file per minute of write activity ([db.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/db.go#L1471)).

**Sync interval.** Because each L0 file gets its own PUT, the number of PUTs depends on how many `monitor-interval` ticks saw writes, not on `sync-interval` (**from source**). The configuration reference states that `sync-interval: 1m` with constant writes makes about 43,200 requests per month and that "Litestream batches writes by time interval" ([config reference, Cost Considerations](https://litestream.io/reference/config/)), which the v0.5.17 code does not do. An R2 user in [litestream#1171](https://github.com/benbjohnson/litestream/issues/1171) also found that a 1 h `sync-interval` did not reduce Class A operations.

**Compaction.** Each level from L1 up and the snapshot level L9 run a monitor that fires on an absolute time grid and once immediately at startup ([store.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/store.go#L562), [config reference](https://litestream.io/reference/config/)). A compaction with new data costs one LIST of the source level and one PUT ([compactor.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/compactor.go#L104)), and a compaction into L1 also runs the L0 retention pass described below ([db.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/db.go#L2917)). On an idle tick, v0.5.17 compares the source level's newest TXID with the destination's newest **minimum** TXID ([store.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/store.go#L812)), so whenever the newest destination file spans more than one transaction, each tick lists the source level and finds nothing. That is up to 120 LISTs per hour at L1, 12 at L2 and 1 at L3 with the default levels. [litestream#1564](https://github.com/benbjohnson/litestream/pull/1564) fixed this on `main` on 2026-10-19, but no release contains the fix yet.

**L0 retention.** A separate monitor runs every `l0-retention-check-interval` and lists L1 and then L0 to find compacted L0 files older than `l0-retention`, deleting them in one batch ([store.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/store.go#L630), [db.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/db.go#L3019)). At the default 15 s that is 480 LISTs per hour regardless of writes, the cause identified in [litestream#1171](https://github.com/benbjohnson/litestream/issues/1171) and [litestream#1468](https://github.com/benbjohnson/litestream/issues/1468). The fix proposed in [litestream#1481](https://github.com/benbjohnson/litestream/pull/1481) is still open, and `main` lists L1 on every tick as v0.5.17 does. The same pass also runs after every compaction into L1, so a long check interval only delays the cleanup of L0 files after the last write of a session.

**Snapshots and retention.** The L9 monitor takes a snapshot when the 24 h grid boundary, aligned to midnight UTC, has passed since the last snapshot and the database has changed ([store.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/store.go#L769)). Because it also fires at startup, a Machine that is never awake at midnight takes its snapshot on the first start of each UTC day with changes. After each L9 tick, retention lists L9 and every level from L1 up, deletes snapshots older than `snapshot.retention` but always keeps the newest, and deletes files in L1 and above that are older than the oldest retained snapshot ([store.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/store.go#L835)). Files in L1 and above therefore stay for the whole snapshot retention, so with 7 days of retention their count sets how many pages each L1 listing needs.

**Startup.** Opening the database lists L0 to compare local and remote positions, and the first tick of each compaction monitor and the snapshot monitor lists its levels before caching them. A start costs roughly 10 to 15 Class A operations plus any compaction or snapshot that is due (**from source**, not counted exactly).

**Restore.** `litestream restore` lists L9 and then every level from L8 down to L0, 10 LISTs, and reads the planned files with `GetObject`, which is Class B ([replica.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/replica.go#L1525)). It runs only when the volume has no database.

## Workload assumptions

An active month has 10 scoring days. The Machine is awake about 10 hours on each scoring day and about 1 hour on 10 setup days, 110 hours in total, and starts up to 20 times per scoring day, 200 times in total. A few hundred pilots upload about 500 IGC files. Uploads, validation and analysis results, scorer edits and publishing produce writes in about 4,000 distinct seconds, and the checkpoint adds about 1,500 more L0 files, one per minute of write activity. Each publish rewrites about 10 JSON files, with 3 classes publishing 5 times on each of the 10 scoring days. The database stays below 5 MiB, so a snapshot is one PUT. All of these are **unverified** estimates, not measurements.

An idle month has 10 wake-ups of 30 minutes each, for example a staff member checking the directory, with writes in about 50 seconds and no publishing. Readers fetch published JSON through Cloudflare's cache, which costs at most Class B `GetObject` requests on cache misses.

## Estimates

Counts are Class A operations per month. "Recommended" means the settings in the next section on v0.5.17.

| Source | Active, defaults | Active, recommended | Idle, defaults | Idle, recommended |
| --- | --- | --- | --- | --- |
| Background while awake (L0 retention monitor and idle compaction ticks) | 67,000 (613 per hour) | 1,700 (15 per hour) | 3,100 | 80 |
| L0 uploads (writes and checkpoints) | 5,500 | 5,500 | 100 | 100 |
| Compactions with new data, including L0 retention after L1 | 11,400 | 3,000 | 100 | 50 |
| Startups | 2,400 | 2,400 | 120 | 120 |
| Snapshots and retention | 150 | 150 | 60 | 60 |
| App: IGC uploads | 500 | 500 | 0 | 0 |
| App: published JSON | 1,500 | 1,500 | 0 | 0 |
| **Total** | **about 89,000** | **about 15,000** | **about 3,500** | **about 400** |

The defaults row assumes one page per listing. With the default 30 s L1 level and 7 days of retention, an active week can leave more than 1,000 L1 files, and each L0 retention pass then needs a second page, adding about 26,000 more in the active month. In both configurations the app's own writes are a small share, and every month stays well within the free tier.

**Where the free tier would break.** A Machine that never stops, for example because a client keeps it busy, costs about 440,000 Class A operations per month from the default background alone, or about 11,000 with the recommended settings. Writes every second around the clock produce about 2.6 million L0 PUTs per month at `monitor-interval: 1s`, beyond the free tier with any `sync-interval`. At 1 s the free tier covers writes in about 950,000 distinct seconds per month, about 11 days of writes every second. Keyhole should therefore avoid writing to the database on every request, for example to refresh a session's last-seen time, because that turns read traffic into L0 uploads.

## Recommended settings

```yaml
levels:
  - interval: 5m
  - interval: 1h
snapshot:
  interval: 24h
  retention: 168h
l0-retention: 5m
l0-retention-check-interval: 1h
shutdown-sync-timeout: 30s

dbs:
  - path: /data/keyhole.db
    monitor-interval: 1s
    replica:
      type: s3
      bucket: <bucket>
      path: litestream/keyhole
      endpoint: https://<account-id>.r2.cloudflarestorage.com
      sync-interval: 1s
```

**Levels.** Two levels at 5 minutes and 1 hour reduce idle compaction ticks from up to 133 to up to 13 per hour and keep L1 to at most 12 files per awake hour, so L1 stays on one listing page across 7 days. Point-in-time restore then has 5 minute granularity for the retained week once L0 files are cleaned up, which is enough to undo an operator mistake. The latest state is always restorable because L0 files stay until they are compacted into L1.

**Snapshots.** `snapshot.retention: 168h` gives the 7 days of point-in-time restore from #34, with at most one snapshot per UTC day that has changes. A retention shorter than the interval is rejected on `main` since [litestream#1471](https://github.com/benbjohnson/litestream/pull/1471).

**L0 retention.** `l0-retention-check-interval: 1h` removes the 480 LISTs per hour. L0 cleanup still runs after every compaction into L1, so L0 files from a session's last 5 minutes are removed at the next compaction or hourly check. `l0-retention` stays at 5 min. On v0.5.17 a value of 0 passes validation but makes `EnforceL0RetentionByTime()` return early, so L0 files would never be deleted ([db.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/db.go#L3019)). The configuration reference says 0 is rejected at startup, which the v0.5.17 code does not do.

**Monitor and sync intervals.** Both stay at 1 s. A longer `sync-interval` widens the loss window without saving PUTs. A longer `monitor-interval` does batch writes into fewer L0 files, but Keyhole's writes are too sparse for that to matter.

**Upgrades.** Once a release contains [litestream#1564](https://github.com/benbjohnson/litestream/pull/1564), idle compaction ticks stop listing, and the background drops to the 2 LISTs per hour of the L0 retention check.

## Data loss window

The loss window is how much committed data is not yet in R2. It matters only if the Fly volume is lost, because a crashed process or Machine restarts with the WAL and Litestream's local state on the same volume and resumes uploading. A volume is a slice of an NVMe drive on one physical server and is not replicated, and Fly's daily snapshots "shouldn't be your primary backup method" ([Fly Volumes overview](https://fly.io/docs/volumes/overview/)).

| `monitor-interval` | `sync-interval` | L0 PUTs per hour of continuous writes | Loss window if the volume is lost |
| --- | --- | --- | --- |
| 1s | 1s | up to 3,600 | about 2 s plus upload time |
| 1s | 10s | up to 3,600 | about 11 s |
| 1s | 1m | up to 3,600 | about 1 min |
| 10s | 10s | up to 360 | about 20 s |
| 1m | 1m | up to 60 | about 2 min |

The first row is the recommendation. The PUT counts follow from one L0 file per monitor tick with writes (**from source**).

## Idle exit and startup on Fly.io

**Process layout.** Litestream runs as the container's main process with `litestream replicate -exec "<keyhole server>"`. When the child exits, Litestream logs that the subprocess exited, performs a final database sync and a replica sync that it retries every `shutdown-sync-interval` for up to `shutdown-sync-timeout`, 30 s by default, and then exits ([cmd/litestream/main.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/cmd/litestream/main.go#L166), [db.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/db.go#L818)). When axum exits itself after the idle period, the Machine stops only after the replica has everything, so a clean idle exit loses nothing. Litestream passes the child's error through as its own exit status, so axum should exit with status 0 when idle to keep Fly's restart policy from restarting the Machine (**unverified** against Fly's restart policy).

**Fly-initiated stops.** On `fly deploy`, `fly machine stop` and host maintenance, Fly sends `kill_signal` (SIGINT by default) to the main process, waits up to `kill_timeout`, 5 s by default and at most 300 s, and then sends SIGTERM ([Fly configuration reference](https://fly.io/docs/reference/configuration/)). Litestream handles SIGINT and SIGTERM, forwards the first signal to axum and waits for it to exit before its final sync. A second signal interrupts the shutdown sync ([cmd/litestream/main.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/cmd/litestream/main.go#L172)). `kill_timeout` should therefore cover axum's drain plus the 30 s shutdown sync, for example `kill_timeout = 60`. Fly calls the timeout best-effort, so a stop that cuts the final sync short leaves the remaining L0 files on the volume, where the next start uploads them.

**Startup.** #34 restores from the replica when the volume holds no database. Running `litestream restore -if-db-not-exists -if-replica-exists /data/keyhole.db` in the entrypoint before `litestream replicate` does that, and it exits successfully when the database already exists or no replica exists ([cmd/litestream/restore.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/cmd/litestream/restore.go#L393)). The restore costs 10 LISTs and a few Class B reads. The startup migrations from #34 then run inside axum after Litestream has started, so they are replicated like any other write. Each normal start costs roughly 10 to 15 Class A operations, 2,000 to 3,000 in a month with 200 starts, so a short idle timeout that causes many restarts costs little.

## Open questions

- Do the request counts match a real run? Running v0.5.17 against MinIO with request tracing, or against a test R2 bucket with its metrics, for an idle hour and a scripted active hour would confirm the estimates.
- Does R2 bill `DeleteObjects` as Class A, free like `DeleteObject`, or per key?
- Does Litestream's documentation or code intend `sync-interval` to batch L0 uploads? If a future release batches them, the cost table changes but the recommendation does not.
- How many distinct write seconds does Keyhole actually produce per IGC upload and per scorer session? This depends on whether analysis results are written in one transaction or several.
- How large is the database after a season? Above 5 MiB each snapshot becomes a multipart upload of one Class A operation per 5 MiB part plus two, which is still negligible at one snapshot per day.
- Will [litestream#1481](https://github.com/benbjohnson/litestream/pull/1481) or a successor make the L0 retention check skip unchanged databases, so `l0-retention-check-interval` can return to its default?
