# Hosting for backend, database, frontend and IGC files

Research for [#15](https://github.com/Turbo87/keyhole/issues/15). The question is where Keyhole can host its Rust backend, Postgres database, Svelte frontend, and IGC flight files, and what each option costs in an idle winter month and in an active competition month. Keyhole is run by one person in Germany. Usage is near zero from October to March and then a few regional competitions in summer, with a handful of scorers uploading a few hundred IGC files of 0.5 to 5 MB per competition day and a few hundred people reading results. Facts were checked against provider pricing pages, provider documentation, the Scaleway public product catalog API, and the crates.io API on 2026-10-30. Prices exclude VAT. Euro prices are quoted for EU providers and US dollar prices for US providers.

## Summary

At Keyhole's scale every viable option costs less than about €15 per month, so cost alone does not decide the architecture. The real tradeoff is between a flat-cost single VM with some operations work and serverless platforms that cost almost nothing in winter but add cold starts and constrain background work.

A single Hetzner VM running axum, Postgres, and the frontend costs about €7.20 per month with backups, the same in every month, with no cold starts and an always-on job worker. Scaleway Serverless Containers with Serverless SQL Database costs well under €1 in idle months, but Serverless SQL bills at least 1 vCPU (about €0.14) for every hour the database is awake, so a busy competition month costs roughly €17 to €37 depending on how long the database stays awake. Fly.io with Neon costs under $1 in idle months and about $8 to $9 in an active month. Railway is about $5 flat. Cloud Run with Cloud SQL, Render, Supabase Pro, and Fly Managed Postgres cost more for the same load or have unusable free tiers.

IGC storage is a few tens of GB per season and costs cents on any S3-compatible store. A CDN is not needed. For background flight analysis, a custom `SELECT ... FOR UPDATE SKIP LOCKED` loop is small, works on serverless Postgres variants that do not guarantee `LISTEN`/`NOTIFY` or advisory locks, and can stop polling so that a serverless database can sleep. `graphile_worker` and `apalis-postgres` are the maintained crates if more features are wanted.

## Workload assumptions

The cost tables use these assumptions:

- **Idle month:** no competitions, a few admin logins at most, no background jobs.
- **Active month:** two competitions with about 20 flying days in total. The backend is awake about 12 hours on each of those days, so 240 hours per month.
- **Database:** 2 GB including indexes after a few seasons.
- **IGC files:** about 300 files per day at an average of 2 to 3 MB, so 0.6 to 0.9 GB per flying day and roughly 15 to 30 GB per season.
- **Results traffic:** a few hundred readers loading small HTML or JSON pages and occasional IGC downloads. Monthly egress stays in the low tens of GB.

## Backend hosting

### Single VM (baseline)

**Hetzner Cloud.** The Cost-Optimized line starts with CX23 (2 vCPU, 4 GB RAM, 40 GB NVMe, 20 TB traffic) at €5.99 per month and CAX11 (2 Ampere vCPU, 4 GB, 40 GB) at €6.49, in Falkenstein, Nuremberg, and Helsinki ([cost-optimized](https://www.hetzner.com/cloud/cost-optimized/)). The Regular Performance line starts at €6.49 for CPX02 (1 vCPU, 1 GB) and €11.99 for CPX12 (2 vCPU, 2 GB) ([regular performance](https://www.hetzner.com/cloud/regular-performance/)). On the check date the Cost-Optimized page said "This product is currently unavailable", so plan availability has to be checked when ordering. Prices are labelled "incl. IPv4". Backups are daily with seven slots ([backups](https://docs.hetzner.com/cloud/servers/backups-snapshots/overview)) and cost a flat 20 % of the server price. Powered-off servers are billed until they are deleted ([billing FAQ](https://docs.hetzner.com/cloud/billing/faq/)), so there is no winter saving.

A 4 GB VM comfortably runs axum, Postgres, a reverse proxy such as Caddy, and a Node process for SvelteKit SSR if that is chosen. Postgres is self-managed, which means OS updates, Postgres major upgrades, and a tested backup routine. Hetzner backups are whole-disk images and are not a substitute for a consistent off-site `pg_dump` or WAL archive. A nightly `pg_dump` to a separate object store covers that for cents.

**Scaleway Instances** are an EU alternative. DEV1-S (2 shared vCPU, 2 GB) costs €0.008976 per hour, about €6.55 per month, plus a flexible IPv4 address, which the catalog lists at €0.005 for zonal IPs ([Scaleway product catalog API](https://api.scaleway.com/product-catalog/v2alpha1/public-catalog/products)). The catalog does not state the billing period for IPv4. Hetzner is cheaper for the same resources.

### Scale-to-zero containers

**Scaleway Serverless Containers** cost €0.00001 per vCPU-second and €0.000002 per GB-second with no charge for ingress or egress ([catalog](https://api.scaleway.com/product-catalog/v2alpha1/public-catalog/products), [billing FAQ](https://github.com/scaleway/docs-content/blob/main/pages/serverless-containers/faq.mdx)). The monthly free tier is 200,000 vCPU-seconds and 400,000 GB-seconds, which is about 111 hours at 0.5 vCPU and 1 GB. Billing is on container run duration, not per request. With `min-scale` 0, instances are terminated after 15 minutes of inactivity ([limitations](https://github.com/scaleway/docs-content/blob/main/pages/serverless-containers/reference-content/containers-limitations.mdx)), and a new instance always starts after each deployment. Scaleway publishes no cold-start figure. It recommends small images and sandbox v2, and suggests CRON triggers or `min-scale` 1 to keep containers warm. HTTP requests can run up to 60 minutes, and Serverless Jobs handle tasks up to 24 hours.

**Fly.io** bills Machines per second while running. A shared-cpu-1x Machine costs $2.19 (256 MB), $3.69 (512 MB), or $6.70 (1 GB) per 30 days. Stopped Machines cost $0.15 per GB of root filesystem per month, outbound traffic in Europe costs $0.02 per GB, and shared IPv4 and IPv6 are free. There is no free allowance and no minimum charge ([pricing](https://docs.fly.io/about/pricing)). Fly Proxy can stop or suspend idle Machines. A stopped Machine takes "about 2 seconds or more" to start, and a suspended one resumes in "a few hundred milliseconds" ([autostop](https://docs.fly.io/launch/autostop-autostart/)). Suspend requires 2 GB of RAM or less and no swap, and after resume the process still believes its database connections are alive, so the connection pool must reconnect on error ([suspend](https://docs.fly.io/reference/suspend-resume/)). EU regions are `ams`, `arn`, `cdg`, and `fra` ([regions](https://docs.fly.io/reference/regions/)).

**Google Cloud Run** request-based billing costs $0.000024 per vCPU-second and $0.0000025 per GiB-second of active time at us-central1 list prices, with a monthly free tier of 180,000 vCPU-seconds, 360,000 GiB-seconds, and 2 million requests that is aggregated per billing account ([pricing](https://cloud.google.com/run/pricing)). Regional rates differ and the Frankfurt rates were not extracted. With request-based billing, "CPU is only allocated during request processing", so in-process background work does not run between requests. Instance-based billing allocates CPU for the whole instance lifetime, and idle instances are shut down at the latest 15 minutes after the last request ([billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings)).

**Railway** charges a $5 Hobby fee that includes $5 of usage, and bills actual usage at about $20 per vCPU-month, $10 per GB of RAM per month, $0.15 per GB-month of volume, and $0.05 per GB of egress ([pricing](https://railway.com/pricing), [plans](https://docs.railway.com/reference/pricing/plans)). Optional App Sleeping puts a service to sleep after 5 to 10 minutes without outbound packets. Open database connections count as activity, and the first request after sleep may return a 502 ([app sleeping](https://docs.railway.com/reference/app-sleeping)). The only EU region is Amsterdam ([regions](https://docs.railway.com/reference/regions)).

**Render** web services start at $7 per month (512 MB, 0.5 CPU) on the free Hobby workspace, which includes 5 GB of bandwidth and then $0.15 per GB ([pricing](https://render.com/pricing)). Free web services spin down after 15 minutes without traffic and take "about one minute" to spin up ([free tier](https://render.com/docs/free)), which is too slow for a scorer at a briefing. Frankfurt is the only EU region ([regions](https://render.com/docs/regions)).

**Cloudflare Workers** cannot run an axum binary as is. They are relevant for the frontend only (see below).

### Cold starts for a Rust container

A statically linked Rust binary itself starts in milliseconds, so platform overhead dominates. Published platform figures are about 2 seconds for a stopped Fly Machine, a few hundred milliseconds for a suspended one, and about one minute for Render's free tier. Scaleway and Google publish no number. A serverless database adds its own wake-up time on top (see below), so the first request after an idle period can take several seconds on a fully serverless stack. This matters only for the first scorer of the day and can be hidden with a scheduled warm-up before briefing.

## Database hosting

**Self-hosted on the VM.** No extra cost. Backups are a nightly `pg_dump` (or WAL archiving with a tool such as pgBackRest) to object storage in another provider or region, plus the Hetzner disk backups.

**Scaleway Serverless SQL Database.** Compute costs €0.0000382 per vCPU-second and storage €0.000272 per GB per catalog period, which is about €0.20 per GB-month if the period is hourly like the other catalog storage items ([catalog](https://api.scaleway.com/product-catalog/v2alpha1/public-catalog/products)). Storage includes 7 days of automated backups. A database with a minimum of 0 vCPU is not billed for compute while idle ([FAQ](https://github.com/scaleway/docs-content/blob/main/pages/serverless-sql-databases/faq.mdx)). It becomes idle after 5 minutes without a query, and a cold start "usually takes less than five seconds" ([concepts](https://github.com/scaleway/docs-content/blob/main/pages/serverless-sql-databases/concepts.mdx)). While active it scales down to at least 1 vCPU and 4 GB ([overview](https://github.com/scaleway/docs-content/blob/main/pages/serverless-sql-databases/reference-content/serverless-sql-databases-overview.mdx)), so every awake hour costs about €0.14. Connections go through a built-in pooler. `LISTEN`/`NOTIFY` work but "message delivery is not guaranteed", `pg_advisory_lock` "is not guaranteed", and temporary tables are not supported ([known differences](https://github.com/scaleway/docs-content/blob/main/pages/serverless-sql-databases/reference-content/known-differences.mdx)).

**Scaleway Managed PostgreSQL.** The smallest node, DB-DEV-S, costs €0.0136 per hour plus €0.002 per hour management, about €11.39 per month. DB-PLAY2-PICO costs about €17. Block storage is €0.000136 per GB-hour (about €0.10 per GB-month) and backup storage €0.00004 per GB-hour ([catalog](https://api.scaleway.com/product-catalog/v2alpha1/public-catalog/products)). It is full Postgres without the serverless restrictions, but it runs and bills all year.

**Neon.** The Free plan includes 100 CU-hours and 1 GB of storage per project with a 6-hour history window, and always scales to zero after 5 minutes. The Launch plan has no monthly minimum and costs $0.106 per CU-hour and $0.35 per GB-month, with up to 7 days of history ([pricing](https://neon.com/pricing)). A suspended compute "reactivates automatically within a few hundred milliseconds" ([scale to zero](https://neon.com/docs/introduction/scale-to-zero)). EU regions are Frankfurt (`aws-eu-central-1`) and London ([regions](https://neon.com/docs/introduction/regions)). At 0.25 CU, 240 awake hours are 60 CU-hours, which fits inside the Free plan and costs about $6.36 on Launch.

**Google Cloud SQL.** The shared-core `db-f1-micro` costs $0.0105 per hour, about $7.67 per month, plus $0.17 per GB-month of SSD and $0.08 per GB-month of used backup storage at us-central1 rates. Instance pricing applies only while the activation policy is `ALWAYS` ([pricing](https://cloud.google.com/sql/pricing)), so the instance can be stopped manually over winter and then costs only storage.

**Supabase.** The Free plan pauses projects after one week of inactivity. Pro costs $25 per month including $10 of compute credits that cover a Micro instance, 8 GB of disk, and daily backups kept for 7 days ([pricing](https://supabase.com/pricing)). EU regions include Frankfurt, Paris, Ireland, and Stockholm ([regions](https://supabase.com/docs/guides/platform/regions)).

**Render Postgres** starts at $6 per month for 256 MB with storage at $0.30 per GB. Free databases expire 30 days after creation and have no backups ([pricing](https://render.com/pricing), [free tier](https://render.com/docs/free)).

**Fly Managed Postgres** starts at $38 per month (Basic, shared-2x, 1 GB) plus $0.28 per GB-month of storage, with high availability and backups included ([MPG](https://docs.fly.io/mpg/)). It is available in `ams` and `fra`.

**Railway Postgres** runs as a service with a volume and is billed as compute plus storage under the Hobby usage credit. The pricing pages do not describe volume backups.

## Frontend hosting

**Static SPA.** Any option serves a static SPA for free or nearly free. On the VM, axum or Caddy serves the build output. Cloudflare static assets are "free and unlimited" ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)), and Render static sites are free. On Scaleway the SPA can be served from the backend container or an Object Storage bucket.

**SvelteKit SSR on Node.** On the VM, a Node process adds roughly 100 MB of RAM and no cost. On Scaleway it would be a second Serverless Container, which shares the free tier and adds a second cold start in front of the backend. On Fly it is a second Machine at $2.19 to $3.69 per 30 days while running. On Render it is another $7 per month. Cloudflare Workers run SvelteKit through `adapter-cloudflare`, which is a Workers runtime rather than Node. The Free plan allows 100,000 requests per day at 10 ms CPU per request, and the Paid plan costs at least $5 per month ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)). SSR therefore costs little in money but adds a runtime and, on serverless platforms, another cold start.

## IGC file storage

At 15 to 30 GB per season, storage costs are negligible on every S3-compatible store:

| Store | Storage | Egress | Notes |
| --- | --- | --- | --- |
| Cloudflare R2 | $0.015 per GB-month, first 10 GB free | Free | EU jurisdiction buckets keep objects in the EU ([pricing](https://developers.cloudflare.com/r2/pricing/), [data location](https://developers.cloudflare.com/r2/reference/data-location/)) |
| Scaleway Object Storage | €0.000022 per GB-hour Multi-AZ (about €0.016 per GB-month), half that for One Zone | €0.01 per GB | [catalog](https://api.scaleway.com/product-catalog/v2alpha1/public-catalog/products) |
| Hetzner Object Storage | €6.49 per month base, includes 1 TB storage and 1 TB egress | €1 per extra TB | Base fee applies for every hour with at least one bucket ([pricing](https://www.hetzner.com/storage/object-storage/)) |
| Local VM disk | Included | Included | 40 GB on CX23 fills within one or two seasons |

Hetzner Object Storage is the expensive choice at this volume because of the base fee. R2 or Scaleway Object Storage costs well under €1 per month even after several seasons, and either can also hold the nightly database dumps.

## CDN

A CDN is not needed. A few hundred readers loading results pages and occasional IGC files produce tens of GB per month at most, which Hetzner's 20 TB included traffic, Fly's $0.02 per GB, or Scaleway's free container egress absorb without effort. Cloudflare's proxy in front of any origin is an optional extra for TLS and DDoS protection. Scaleway sells Edge Services from €0.99 per month for the starter plan plus €0.0135 per GB of cache egress ([catalog](https://api.scaleway.com/product-catalog/v2alpha1/public-catalog/products), [Edge Services FAQ](https://github.com/scaleway/docs-content/blob/main/pages/edge-services/faq.mdx)). Render and Cloudflare include a CDN for static sites. Hetzner has none.

## Background flight analysis

### Scale to zero and background work

An in-process worker needs CPU and an awake database while it runs.

- **VM:** no constraint. The worker runs all the time.
- **Scaleway Serverless Containers:** billed on run duration, and an instance lives up to 15 minutes after the last request. A worker in the same process can finish jobs enqueued by an upload as long as they complete in that window. Longer work fits Serverless Jobs.
- **Cloud Run:** request-based billing gives no CPU outside requests, so in-process background work requires instance-based billing, Cloud Tasks, or Cloud Run jobs.
- **Fly.io:** Fly Proxy stops Machines based on traffic, not on in-process work, so a running analysis can be cut off when the Machine stops. Analysis should either run inside the upload request or a Machine should stay running while the queue is not empty.
- **Railway App Sleeping:** any outbound packet, including database polling, keeps the service awake, so an idle-polling worker prevents sleep.

The bigger cost effect is on the database. Neon and Scaleway Serverless SQL only sleep after 5 minutes without queries. A worker that polls every few seconds keeps the database awake for as long as the backend runs, which on Scaleway costs about €0.14 per hour. A worker on a serverless database should therefore poll only after an enqueue or on startup, back off when the queue is empty, and stop polling entirely after a few empty minutes. If analysis of one IGC file takes only a second or two, running it inside the upload request with a queue only for retries and re-scoring is simpler still.

### Postgres-backed job queue crates

Data from the crates.io API on 2026-10-30. Recent downloads cover the last 90 days.

| Crate | Latest | Released | Downloads (recent) | sqlx | Mechanism |
| --- | --- | --- | --- | --- | --- |
| [`apalis-postgres`](https://crates.io/crates/apalis-postgres) | 1.0.0 | 2026-10-12 | 215k (145k) | 0.9 | Polling storage or a shared `NOTIFY` listener, heartbeats and orphaned job re-enqueueing ([repo](https://github.com/apalis-dev/apalis-postgres)). Core crate [`apalis`](https://crates.io/crates/apalis) 1.0.0 has 1.4M downloads. |
| [`graphile_worker`](https://crates.io/crates/graphile_worker) | 0.14.1 | 2026-10-11 | 88k (47k) | 0.9 | `SKIP LOCKED` claiming, `LISTEN`/`NOTIFY` wake-ups, retries, cron, job keys, schema compatible with the Node.js Graphile Worker ([repo](https://github.com/leo91000/graphile_worker_rs)) |
| [`pgmq`](https://crates.io/crates/pgmq) | 0.33.7 (0.34 alpha) | 2026-09-14 | 275k (43k) | 0.9 | Client for the pgmq message queue schema, a message queue rather than a job runner |
| [`fang`](https://crates.io/crates/fang) | 0.11.0 | 2026-07-02 | 113k (9k) | 0.8 | Background job library with sqlx or Diesel backends |
| [`sqlxmq`](https://crates.io/crates/sqlxmq) | 0.6.0 | 2025-05-25 | 205k (25k) | 0.8 | "NOTIFY-based polling", retries with exponential backoff, scheduled jobs ([repo](https://github.com/Diggsey/sqlxmq)) |
| [`underway`](https://crates.io/crates/underway) | 0.2.0 | 2025-07-16 | 24k (4k) | 0.8 | Durable workflows with cron, retries, heartbeats ([repo](https://github.com/maxcountryman/underway)) |

sqlx 0.9 was released on 2026-05-21. Crates still on sqlx 0.8 pull in a second sqlx version if Keyhole uses 0.9. `apalis-postgres` and `graphile_worker` are the actively released options that already use sqlx 0.9. Both rely on `LISTEN`/`NOTIFY` for low-latency wake-ups, which Scaleway Serverless SQL does not guarantee, so on that database they would fall back to their polling intervals.

### Custom `SKIP LOCKED` loop

A custom queue is one table (`id`, `kind`, `payload`, `run_at`, `attempts`, `locked_until`, `last_error`) and a claim query of the form `UPDATE jobs SET locked_until = now() + lease ... WHERE id = (SELECT id FROM jobs WHERE run_at <= now() AND (locked_until IS NULL OR locked_until < now()) ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`. The lease replaces advisory locks for crash recovery, and enqueueing happens in the same transaction as the IGC upload. It needs no `NOTIFY` and no advisory locks, so it works on every database above. It also gives Keyhole direct control over when polling stops, which is what lets a serverless database sleep. The cost is writing retries, backoff, and a small amount of observability by hand, likely a couple of hundred lines with tests. The crates become worthwhile if cron schedules, job deduplication keys, or a UI for failed jobs are needed.

## Cost comparison

Idle month and active month as defined above. Object storage for IGC files adds under €1 per month in every row and is left out.

| Option | Idle month | Active month | Backups | Cold start | Background work |
| --- | --- | --- | --- | --- | --- |
| Hetzner CX23 with Postgres on the VM | €7.19 | €7.19 | Daily disk images (20 %) plus own `pg_dump` | None | Always on |
| Hetzner CPX12 (if CX23 or CAX11 are unavailable) | €14.39 | €14.39 | Same | None | Always on |
| Scaleway Serverless Containers (0.5 vCPU, 1 GB) and Serverless SQL | about €0.40 | about €3.25 container plus €0.14 per awake database hour, so €17 to €37 for 120 to 240 hours | 7 days included | Container plus database wake, up to several seconds | Up to 15 minutes after last request, polling keeps database billed |
| Scaleway Serverless Containers and Managed PostgreSQL DB-DEV-S (5 GB) | about €12 | about €15 | Managed | Container only | Same as above |
| Fly.io 512 MB Machine with autostop and Neon Launch | about $0.75 | about $8.50 | Neon history up to 7 days | Hundreds of ms (suspend) to 2 s (stop) plus Neon resume | Cut off when Machine stops |
| Fly.io and Neon Free | $0 | about $1.25 | 6-hour history only, needs own `pg_dump` | Same | Same |
| Railway Hobby with Postgres service (Amsterdam) | about $5 | about $5 to $8 | Not documented on pricing pages | None unless App Sleeping | Polling keeps service awake |
| Cloud Run and Cloud SQL `db-f1-micro` (10 GB) | about $9.60, or about $2 if stopped manually | about $9.60, Cloud Run likely within free tier | Automated backups at $0.08 per GB-month | Cloud Run cold start, Cloud SQL always on | Needs instance-based billing or Cloud Tasks |
| Render Starter and Postgres basic-256mb | about $13.30 | about $13.30 | PITR included | None on paid plan | Separate worker service costs extra |
| Supabase Pro with a separate backend host | $25 plus backend | $25 plus backend | Daily, 7 days | None | Depends on backend host |
| Fly.io and Fly Managed Postgres Basic | about $38.60 | about $40 | Included | Machine only | Same as Fly row |

Over a year with six idle and six active months, the cheapest options cost tens of euros and the difference between the VM and the serverless setups is about €40 to €80, which is less than the time spent on any one of them.

## Data residency and transfer mechanism

| Provider | Operator | EU regions | Transfer mechanism |
| --- | --- | --- | --- |
| Hetzner | Hetzner Online GmbH, Germany | Falkenstein, Nuremberg, Helsinki | No third-country transfer when EU locations are chosen. DPA concluded by checkbox in the customer account ([data privacy FAQ](https://docs.hetzner.com/general/general-terms-and-conditions/data-privacy-faq/)) |
| Scaleway | Scaleway SAS, France | Paris, Amsterdam, Warsaw | EU operator. Its general DPA was not re-checked because scaleway.com blocks automated fetching. TEM data stays in France ([TEM data privacy](https://github.com/scaleway/docs-content/blob/main/pages/transactional-email/reference-content/data-privacy.mdx)) |
| Fly.io | Fly.io, Inc., US | `ams`, `arn`, `cdg`, `fra` | DPF certified, self-service DPA with 2021 SCCs Module 2 for transfers DPF does not cover ([security questionnaire](https://fly.io/legal/security-questionnaire/)) |
| Railway | Railway, US | Amsterdam | DPA with EU SCCs deemed entered into, DPF where the recipient is certified ([DPA](https://railway.com/legal/dpa)) |
| Render | Render Services, Inc., US | Frankfurt | DPF first, EU SCCs as fallback, DPA incorporated into the terms ([DPA](https://render.com/dpa)) |
| Neon | Databricks, Inc., US | Frankfurt | Databricks, Inc. and Neon, LLC are DPF certified, DPA with SCCs available ([Databricks privacy notice](https://www.databricks.com/legal/privacynotice)) |
| Supabase | Supabase, Inc., US | Frankfurt, Paris, Ireland, Stockholm | SCCs, accepted with the agreement. The DPA does not mention DPF ([DPA](https://supabase.com/legal/dpa)) |
| Cloudflare | Cloudflare, Inc., US | Global network, R2 EU jurisdiction | DPF, with EU SCCs for restricted transfers ([DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)) |
| Google Cloud | Google LLC, US | Frankfurt and others | Cloud Data Processing Addendum with SCCs, plus an "Alternative Transfer Solution" ([CDPA](https://cloud.google.com/terms/data-processing-addendum)) |

Every option has a documented GDPR transfer mechanism, so none is ruled out on this basis alone.

**Email tiebreaker.** Of the candidates, only Scaleway also sells transactional email, which is already chosen. Hosting on Scaleway would put compute, database, storage, and email on one invoice and one DPA.

## Recommendation for the architecture grilling

These are options with tradeoffs, not a decision.

1. **Single Hetzner VM.** axum, Postgres, Caddy, and optionally a Node process for SvelteKit SSR on one CX23 or CAX11, with IGC files and nightly `pg_dump` output in R2 or Scaleway Object Storage. About €7.20 per month all year. No cold starts, full Postgres, and an always-on worker, so any job queue design works. The cost is operations work for OS updates, Postgres upgrades, monitoring, and restore drills, plus a single point of failure during competitions. It also pays about €40 per winter for an idle machine.
2. **Scaleway serverless.** Serverless Containers, Serverless SQL Database, Object Storage, and TEM from one EU vendor. Almost free in winter and no servers to patch. Active months cost more than the VM, and the cost depends on keeping the database asleep, which constrains the job queue to a polling loop that goes quiet. Serverless SQL lacks guaranteed `NOTIFY`, advisory locks, and temporary tables, and the first request of the day waits for two cold starts. Swapping Serverless SQL for Managed PostgreSQL removes those limits for about €12 per month all year.
3. **Fly.io and Neon.** Machines in `fra` that suspend when idle and a Neon database in Frankfurt. Under $1 in winter and about $8 to $9 in an active month, with fast resume on both sides. Both are US companies relying on DPF and SCCs. Background work must not depend on the Machine staying up, and suspend requires the connection pool to recover from stale connections.

Railway (about $5 flat) is a simpler variant of option 3 with less control over sleeping. Cloud Run with Cloud SQL works but has the most moving parts. Render, Supabase Pro, and Fly Managed Postgres cost more for no benefit at this scale.

Independently of the host, a static SPA keeps the frontend free everywhere, while SvelteKit SSR is cheap on a VM and adds a runtime and a cold start on serverless platforms. For background analysis, a custom `SKIP LOCKED` loop with leases fits every option. `graphile_worker` is the strongest crate if cron or job keys are needed and the database supports `NOTIFY`.

## Open questions

- Is Keyhole willing to own OS and Postgres operations on a VM, or is paying more and accepting cold starts preferable to avoid them?
- How long does analysing one IGC file take? If it is a second or two, analysis can run inside the upload request and the queue only handles retries and re-scoring.
- Static SPA or SvelteKit SSR? The answer decides whether a Node or Workers runtime is needed at all.
- What recovery point objective is acceptable during a competition? Daily dumps may lose a day of uploads.
- How long are real cold starts for a Keyhole Rust image on Scaleway Serverless Containers and Fly.io? No provider publishes figures, so this needs a measurement.
- Are the cheapest Hetzner plans orderable again, given that the Cost-Optimized page showed them as unavailable on the check date?
- Does the GDPR ticket accept US operators with DPF and SCCs, or does it narrow the choice to Hetzner and Scaleway?
