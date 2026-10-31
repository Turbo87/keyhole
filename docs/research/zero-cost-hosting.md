# Zero-cost hosting and stack

Research for [#33](https://github.com/Turbo87/keyhole/issues/33). The question is which hosting and stack keep Keyhole at €0, or at most about €5 per month averaged over the year, without hand-run operations. It builds on the hosting research for [#15](https://github.com/Turbo87/keyhole/issues/15) ([findings](https://github.com/Turbo87/keyhole/blob/research/hosting/docs/research/hosting.md)) and does not repeat options that research already ruled out on cost. Rust and Svelte are fixed. Public results, task pages, competitor lists and the competition directory must be readable all year, while scoring and flight analysis happen in short bursts in summer.

Facts were checked against provider pricing pages, provider documentation, the Scaleway public product catalog API, the GitHub releases API and the crates.io API on 2026-10-31 unless a row says otherwise. Prices exclude VAT. US providers price in dollars, and dollar amounts are not converted because no exchange rate was verified. A $5 charge is close to the €5 ceiling either way. Claims marked **unverified** come from secondary sources, inference, or were not stated on the cited page.

## Summary

Keyhole can run for well under €1 per month averaged over the year, and for €0 in idle months, if public pages stop depending on a running backend. The decisive change is publishing to object storage behind a CDN. Once results are files in an R2 bucket served through Cloudflare, readers never wake a container or a database, so the backend and database can sleep for the whole winter and the free tiers of Neon and R2 cover the rest.

The cheapest viable combination is a Fly.io Machine that stops when idle, Neon Free in Frankfurt, R2 for published files and IGC files, and Cloudflare static assets for the SPA. It costs a few cents per month idle and about $1.30 to $1.50 in an active month. Scaleway Serverless Containers in place of Fly.io cost the same or less and keep compute with an EU operator, but publish no cold-start figure. SQLite with Litestream on a Fly volume costs about the same and removes the database vendor and its CU-hour limit, but gives up Postgres. Cloudflare Workers with D1 are free but require rewriting the backend around `workers-rs` and D1, which fails the "plain container, plain database" exit criterion. No VM option meets both the budget and the no-hand-run-operations rule.

The single-process design from [#9](https://github.com/Turbo87/keyhole/issues/9) with SvelteKit SSR also scales to zero on Fly.io, but every public reader and crawler wakes both the Machine and the database all year. On Neon Free that risks exhausting the 100 CU-hour monthly allowance, which suspends the database until the next month. Publishing static files removes that coupling and is what makes the free tiers safe to rely on.

Of the two publish models, JSON with an SPA is simpler because no Node runtime is needed anywhere, and per-page HTML stubs written by axum restore link previews. Static HTML publish gives the best no-JavaScript and indexing behaviour but needs Svelte server rendering at publish time, which means keeping Node in the backend image.

## Workload assumptions

The same assumptions as in the #15 research apply, so the numbers compare directly:

- **Idle month:** no competitions, a few admin logins at most.
- **Active month:** two competitions with about 20 flying days, and the backend awake about 12 hours on each, so 240 hours. This is a ceiling, because scale-to-zero platforms stop after minutes of inactivity.
- **Database:** 2 GB after a few seasons.
- **IGC files:** about 15 to 30 GB per season.
- **Readers:** a few hundred people loading small pages, plus crawlers all year.

A typical year has three to four active months and eight to nine idle months.

## Publish models

### Static HTML publish

At publish time Keyhole renders each published snapshot, task page, competitor list and the directory to HTML and JSON and writes them to object storage. Only the scorer UI and pilot uploads need the backend.

Rendering Svelte components to HTML outside SvelteKit uses `render()` from `svelte/server`, which takes a component and props and returns `head` and `body` strings ([svelte/server](https://svelte.dev/docs/svelte/svelte-server)). It is "only available on the server", so axum would run a small Node script at publish time. Node stays in the container image as in #9 but no longer serves requests. Hydrating the static HTML with the same components on the client needs the client bundle and the publish-time renderer to come from the same build. A full SvelteKit `adapter-static` prerender on every publish is the alternative, but it runs a Vite build per publish and is slower (**unverified**, not measured).

What it keeps compared with SSR: link previews, indexing and pages without JavaScript all work, because every page is complete HTML.

### JSON publish with an SPA

Publishing writes only JSON, and a static SPA renders the public pages from it. The SPA is plain static files, so no Node runtime is needed in production at all.

What it gives up: link preview crawlers and some search engines do not execute JavaScript, so a bare SPA shows the same title and description for every URL (**unverified** for specific crawlers, general behaviour). axum can write a small HTML stub for each public page at publish time, with the page title, Open Graph tags and the SPA bundle, using plain string templating in Rust. That restores link previews without Node. Indexing then depends on crawlers that render JavaScript.

### Serving published files

**Cloudflare R2 behind a custom domain.** R2 Standard storage costs $0.015 per GB-month with 10 GB-month, 1 million Class A operations and 10 million Class B operations free each month, and egress is free ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). A public bucket needs a custom domain that "must have been added as a zone in the same account as the R2 bucket" to use Cloudflare's cache, and `r2.dev` access "is rate-limited and should only be used for development purposes" ([public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)). "HTML and JSON are not cached unless you create a Cache Rule" ([R2 and cache](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)), so the zone needs one Cache Rule. Public buckets serve exact object keys only, so `/competitions/x/` needs a URL rewrite rule to `index.html` or object keys without the trailing slash (**unverified**, inferred from the docs). Keyhole writes through the plain S3 API, so the files can move to any S3 store and CDN.

**Cloudflare Workers static assets** serve the SPA build. "Requests to static assets are free and unlimited", and `not_found_handling = "single-page-application"` rewrites unknown paths to `index.html` without invoking a Worker script ([billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)). Static assets are deployed with the code, so they suit the SPA build but not files written at publish time. Cloudflare Pages remains available with 500 builds per month and up to 20,000 files per site on the Free plan ([Pages limits](https://developers.cloudflare.com/pages/platform/limits/)).

**GitHub Pages** is free with a 1 GB site limit and a soft 100 GB per month bandwidth limit, but it is "not intended for or allowed to be used as a free web-hosting service" for a business or SaaS ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). Publishing would mean committing results to a repository from the backend. It is a fallback for the SPA build, not for published results.

**Publish latency.** An R2 write is visible at the origin immediately. The cache then serves the old version until it expires or is purged. The Free plan supports purge by single-file URL at 800 URLs per second, and purge by prefix, hostname, tag or everything at 5 requests per minute ([purge cache](https://developers.cloudflare.com/cache/how-to/purge-cache/)). Purging the changed URLs after each publish makes a publish visible within seconds. A short `Cache-Control` max-age is the provider-neutral alternative, at the cost of up to that many seconds of staleness.

## Backend runtime

### Fly.io Machine that stops when idle

A shared-cpu-1x Machine costs $2.19 (256 MB), $3.69 (512 MB) or $6.70 (1 GB) per month while running. A stopped Machine's root filesystem costs $0.15 per GB per month. Volumes cost $0.15 per GB-month, snapshots $0.08 per GB-month with the first 10 GB free, and European egress $0.02 per GB ([pricing](https://docs.fly.io/about/pricing)). There is no free tier for new organizations beyond a trial, and the pricing and billing pages state no minimum invoice or waiver ([billing](https://docs.fly.io/about/billing)).

Cold start from stopped "takes about 2 seconds or more for common apps", and resume from suspend "takes a few hundred milliseconds" ([autostop](https://docs.fly.io/launch/autostop-autostart/)). The same page documents the pattern Keyhole needs for background analysis: "you can code your app to exit when idle" with `auto_start_machines = true` and `auto_stop_machines = "off"`. axum then exits only when no request has arrived for some minutes and no analysis is pending, so Fly Proxy never stops it in the middle of an analysis. An exited Machine is stopped, not suspended, so the next request takes the slower start.

Free tier history: Fly.io started charging new organizations a $5 minimum in early 2024, replaced it with pay-as-you-go, and stopped selling the Hobby, Launch and Scale plans on 2024-10-07. Old free allowances apply only to grandfathered organizations ([discontinued plans](https://docs.fly.io/about/discontinued-plans)).

### Scaleway Serverless Containers

Rates in `fr-par` are €0.00001 per vCPU-second and €0.000002 per GB-second, with ingress and egress free ([catalog](https://api.scaleway.com/product-catalog/v2alpha1/public-catalog/products), [FAQ](https://github.com/scaleway/docs-content/blob/main/pages/serverless-containers/faq.mdx)). The monthly free tier is 200,000 vCPU-seconds and 400,000 GB-seconds, which the FAQ gives as 400,000 seconds, about 111 hours, for a 0.5 vCPU and 1 GB container. A 0.25 vCPU and 512 MB container gets about 222 hours. "Health checks will not wake up Serverless Containers if no instance is up", but "a new container instance will always start after each deployment" (same FAQ). Instances stop after 15 minutes of inactivity per the #15 research. Scaleway publishes no cold-start figure. The free tier's history was not found in Scaleway's public docs (**unverified**).

Scaleway is an EU operator and already Keyhole's email provider, so compute there adds no third-country transfer.

### Cloudflare Workers with Rust

Rust runs on Workers as Wasm through `workers-rs` ([Rust on Workers](https://developers.cloudflare.com/workers/languages/rust/)). Its `http` feature makes "it much easier to use crates which use these standard types such as `axum` and `hyper`", but "all crates in your Worker project must compile to `wasm32-unknown-unknown`", so there is "no Tokio or async_std support" ([workers-rs README](https://github.com/cloudflare/workers-rs)). The current release is `worker` 0.8.7 from 2026-09-25 ([releases](https://github.com/cloudflare/workers-rs/releases)). `diesel-async` with `deadpool` on Tokio does not run there. Database access goes through the D1 binding, or through Hyperdrive to an external Postgres, which the Free plan allows at 100,000 queries per day ([Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/)).

The Free plan allows 100,000 requests per day and 10 ms of CPU time per request, with a 128 MB memory limit and a 64 MiB uncompressed bundle limit. The Paid plan has a $5 per month minimum and allows up to 5 minutes of CPU per request ([pricing](https://developers.cloudflare.com/workers/platform/pricing/), [limits](https://developers.cloudflare.com/workers/platform/limits/)). 10 ms is enough for small CRUD handlers but not for parsing and analysing a multi-megabyte IGC file (**unverified**, not measured). On the Free plan, analysis would have to run in the scorer's browser, where the pure-Rust engine compiled to Wasm can run, and the server would have to trust the browser's result.

This option costs €0 but replaces axum on Tokio, `diesel-async` and the plain container with a Cloudflare-specific runtime and database. Leaving would mean rewriting the server and database layer again.

### Cloudflare Containers

Containers run a plain image behind a Worker and are only available on the Workers Paid plan. They are billed per 10 ms while running and can sleep after a timeout, and the $5 plan includes 25 GiB-hours of memory, 375 vCPU-minutes and 200 GB-hours of disk per month ([Containers pricing](https://developers.cloudflare.com/containers/pricing/)). Cold starts "can often be in the 1-3 second range", and disk "is ephemeral by default" ([architecture](https://developers.cloudflare.com/containers/platform-details/architecture/)), so the database must live elsewhere. The $5 minimum applies every month of the year, which uses the whole budget for what Fly.io or Scaleway provide for cents.

### Other runtimes

**AWS Lambda** includes "one million requests and 400,000 GB-seconds per month" ([Lambda pricing](https://aws.amazon.com/lambda/pricing/)). The AWS free tier page no longer lists which services are always free, and new accounts get credits for 6 months ([AWS Free Tier](https://aws.amazon.com/free/)), so whether Lambda's allowance continues after 6 months was not confirmed (**unverified**). Aurora DSQL has a free tier of 100,000 DPUs and 1 GB per month and scales to zero ([DSQL pricing](https://aws.amazon.com/rds/aurora/dsql/pricing/)), but its Postgres compatibility for Diesel was not checked. Lambda needs an adapter around axum and is not a plain container.

**Google Cloud Run** has the free tier recorded in #15. Its request-based billing gives no CPU outside requests, and its Cloud Storage volume mounts provide no file locking ([volume mounts](https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts)), so SQLite on a mount is unsafe. Current regional prices could not be extracted from the pricing page (**unverified**).

## Database

### Neon Free

The Free plan includes 100 CU-hours and 1 GB of storage per project, 100 projects, 5 GB of public network transfer per project, a 6-hour history window, and scale to zero after 5 minutes that "cannot be turned off". The Launch plan costs $0.106 per CU-hour and $0.35 per GB-month with no monthly minimum, and "invoices under $0.50 are not collected" ([pricing](https://neon.com/pricing)). A suspended compute reactivates "within a few hundred milliseconds" ([scale to zero](https://neon.com/docs/introduction/scale-to-zero)). When it restarts, "the session context resets", including temporary tables and prepared statements ([scale-to-zero guide](https://neon.com/docs/guides/scale-to-zero-guide)).

Exhausting the CU-hours suspends the compute until the next billing period (**unverified**, from Neon FAQ pages found through search). Free autoscaling goes up to 2 CU, so the compute must be capped at 0.25 CU to make 100 CU-hours last 400 awake hours. At 0.25 CU the 240-hour ceiling uses 60 CU-hours. The 1 GB storage limit is below the 2 GB assumption, so a few seasons in, Keyhole would move to Launch at about $0.70 per month for storage plus compute, or about $6.36 for 60 CU-hours in an active month.

`LISTEN`/`NOTIFY` and session-level advisory locks are not supported on pooled connections ([connection pooling](https://neon.com/docs/connect/connection-pooling)), so Keyhole would use the direct connection string. A suspend drops the session, so a `LISTEN` connection must reconnect. Whether an idle open connection keeps the compute awake is not stated in the docs (**unverified**). This matters because a long-lived connection could keep Neon awake and burn CU-hours.

Backups beyond 6 hours need a `pg_dump`. Standard GitHub-hosted runners "are free" in public repositories ([GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)), so a scheduled workflow can dump to R2 at no cost. Each dump wakes the database for a few minutes.

Free tier history: after Databricks acquired Neon in 2025, Neon doubled Free compute from 50 to 100 CU-hours ([changelog 2025-09-19](https://neon.com/docs/changelog/2025-09-19)) and cut the Launch compute price from $0.14 to $0.106 and storage from $1.75 to $0.35 per GB-month ([price reduction](https://neon.com/blog/major-compute-price-reduction-on-neon)). The changes have so far been increases.

### SQLite with Litestream

Litestream 0.5.17 was released on 2026-08-31 ([releases](https://github.com/benbjohnson/litestream/releases)) and streams SQLite changes to object storage such as R2 ([litestream.io](https://litestream.io/)). It warns that "multiple applications replicating into the same bucket & path can cause situations where you will be unable to restore" and that preventing this is the operator's responsibility ([tips](https://litestream.io/tips/)).

In WAL mode "readers do not block writers and a writer does not block readers", but "there can only be one writer at a time", and "WAL does not work over a network filesystem" ([WAL](https://www.sqlite.org/wal.html)). A handful of concurrent scorers in one axum process is well within that. Two instances writing the same database is not.

On Fly.io the database lives on a volume, which "exists on one server in a single region". Fly takes daily snapshots kept for five days by default but says snapshots "shouldn't be your primary backup method" ([volumes](https://docs.fly.io/reference/volumes/)), so Litestream to R2 is the real backup. A 1 GB volume costs $0.15 per month all year. Fly runs one Machine per volume, so a deploy cannot start a second writer.

On Scaleway Serverless Containers there is no persistent disk, so the container would restore from Litestream at startup and replicate while running. Because "a new container instance will always start after each deployment", the old and new instance can briefly both write, which is exactly the case Litestream warns about. That makes SQLite a poor fit for Scaleway.

SQLite gives up `NOTIFY`, advisory locks, `SKIP LOCKED` and the Postgres decisions in #9. Diesel supports SQLite only through its synchronous connection, so `diesel-async` would use its sync wrapper (**unverified**, not checked against the current `diesel-async` release).

### Hosted SQLite

**Cloudflare D1.** The Free plan allows 5 million rows read and 100,000 rows written per day, 500 MB per database, 5 GB per account and 7 days of Time Travel. Workers Paid raises this to 10 GB per database and 30 days ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)). It is used through the Workers binding, so it ties the backend to Workers.

**Turso.** The Free plan includes 100 databases, 5 GB of storage, 500 million rows read and 10 million rows written per month, and 1 day of point-in-time restore. Developer costs $4.99 per month ([pricing](https://turso.tech/pricing)). "Databases get archived after 10 days of inactivity for users on a free plan" and must be unarchived through the CLI or API ([group unarchive](https://docs.turso.tech/cli/group/unarchive)), which every Keyhole season would hit. Turso announced on 2026-10-02 that it is joining Supabase ([blog](https://turso.tech/blog)), so its plans may change. Its privacy policy names only "Turso" with a Delaware address and mentions neither DPF nor SCCs ([privacy policy](https://turso.tech/privacy-policy)), so its transfer mechanism is **unverified**.

### Other Postgres free tiers

**Supabase Free** caps the database at 500 MB, includes no automatic backups, and pauses projects "after 1 week of inactivity" ([pricing](https://supabase.com/pricing)). With static publishing the database is idle all winter, so it would be paused every season.

**Scaleway Serverless SQL Database** has no free tier, bills storage whether active or idle, and recommends at least 1 vCPU to avoid cold starts ([FAQ](https://github.com/scaleway/docs-content/blob/main/pages/serverless-sql-databases/faq.mdx)). #15 put an active month at €17 to €37, which is over budget.

**PlanetScale** retired its free Hobby plan on 2024-04-08 and put remaining databases to sleep ([deprecation FAQ](https://planetscale.com/docs/plans/hobby-plan-deprecation-faq)). It is listed only as an example of a withdrawn free tier.

## VMs

A VM qualifies only with automated updates, backups and restores.

**Hetzner** CX23 costs €5.99 and CAX11 €6.49 per month including IPv4, and both were again "currently unavailable" on 2026-10-31 ([cost-optimized](https://www.hetzner.com/cloud/cost-optimized/)). With the 20 % backup fee that is about €7.20, above the €5 ceiling.

**Oracle Cloud Always Free** includes Ampere A1 capacity equivalent to 2 OCPUs and 12 GB of memory, 200 GB of block storage and 20 GB of object storage. Oracle may reclaim instances that are idle over 7 days, meaning 95th-percentile CPU, network and, on A1, memory utilization all below 20 % ([Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)). Keyhole is idle most of the year, so the instance would be reclaimed unless it burns CPU on purpose.

An automated setup on either would be an image-based OS such as Fedora CoreOS or Flatcar with automatic updates and reboots, Postgres or SQLite in a container, a systemd timer pushing `pg_dump` or Litestream to R2, and a scripted restore tested in CI (**unverified**, not built or priced). Postgres major-version upgrades and OS stream changes would still need occasional hands-on work, so no VM option fully meets the devops rule within budget.

## Cost comparison

Idle and active month as defined above. All rows include R2 for published files and IGC files, and Cloudflare static assets for the SPA. R2 costs $0 while under 10 GB and about $0.30 per month at 30 GB, growing by roughly $0.20 to $0.45 per month for each further season of IGC files. Infrequent Access at $0.01 per GB-month halves that for old files but has no free tier, a 30-day minimum and a $0.01 per GB retrieval fee ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). The domain is needed in every option and is left out.

| Option | Idle month | Active month | Scorer and upload cold start | Exit cost |
| --- | --- | --- | --- | --- |
| Static or JSON publish, Fly.io 512 MB Machine exiting when idle, Neon Free | about $0.03 (root filesystem) | about $1.25 (240 h) | about 2 s Machine start plus a few hundred ms Neon resume | Low: plain container, plain Postgres, S3 |
| Static or JSON publish, Scaleway Serverless Containers 0.25 vCPU and 512 MB, Neon Free | €0 | about €0.20 at 240 h, €0 under 222 h | Not published, needs a measurement, plus Neon resume | Low |
| Static or JSON publish, Fly.io Machine with SQLite on a 1 GB volume and Litestream to R2 | about $0.18 | about $1.40 | About 2 s | Low: plain container, SQLite file, S3. Postgres features lost |
| Static or JSON publish, Fly.io and Neon Launch once over 1 GB | about $0.75 | about $8.30 at 240 h | Same as first row | Low |
| Single process as in #9 (axum and SvelteKit SSR) on Fly.io with autostop and Neon Free | Unbounded by crawlers, from $0.03 up to $3.69 | about $1.25 to $3.69 | Every public reader can hit a cold start | Low, but Neon Free can run out of CU-hours |
| Cloudflare Workers Free with `workers-rs`, D1 and R2 | $0 | $0 | Isolate start, analysis in the browser | High: rewrite of server and database layer |
| Cloudflare Containers with Neon Free | $5 | $5 plus usage beyond the included amounts | 1 to 3 s plus Neon resume | Low, but $60 per year |
| Hetzner CX23 with backups | €7.19 | €7.19 | None | Low, but over budget and ops-heavy |

Averaged over a year with four active months, the first three rows cost well under €1 per month before IGC storage grows. The single-process row is cheap only if crawler traffic stays low, which Keyhole does not control.

## What each option gives up compared with #9

**Link previews and indexing.** Static HTML publish keeps them fully. JSON publish keeps link previews through axum-written HTML stubs and relies on JavaScript-rendering crawlers for indexing. The Workers-native option can do either.

**`NOTIFY` and advisory locks.** Neon keeps both on direct connections, but a suspend drops the session. SQLite and D1 have neither. The `SKIP LOCKED` lease loop recommended in #15 works on Neon and does not need them. On SQLite, a single process with one in-memory queue and a pending-analysis column covers the same need, because there is only one writer.

**Concurrent scorers.** Postgres has no practical limit at this scale. SQLite in WAL mode serialises writers inside one process, which a few scorers do not notice. SQLite rules out a second instance.

**Background analysis outside requests.** On Fly.io the app exits itself only when no analysis is pending, which keeps the in-process `spawn_blocking` design from #9. Scaleway keeps an instance for up to 15 minutes after the last request, so analysis has to finish in that window or run in a Serverless Job. Workers Free cannot analyse on the server at all.

**How quickly a publish appears.** With R2 and a URL purge, within seconds. With a cache TTL only, within the TTL. The single-process SSR design shows changes on the next request.

**Always-on behaviour.** #9 chose an always-on Machine to avoid cold starts and connection-pool recovery. Every option here reintroduces one cold start for the first scorer or pilot after an idle period, and the pool must reconnect after a Neon suspend.

## Free tier limits and history

| Free tier | Limits that matter for Keyhole | History |
| --- | --- | --- |
| Cloudflare R2 | 10 GB-month, 1M Class A, 10M Class B, free egress | No reduction found in the sources checked |
| Cloudflare Workers and static assets | 100,000 requests per day, 10 ms CPU, static asset requests free and unlimited | No reduction found in the sources checked |
| Cloudflare D1 | 500 MB per database, 5 GB per account, daily row limits, 7-day Time Travel | Result size limit of 50 MB enforced from 2026-11-04 ([changelog](https://developers.cloudflare.com/changelog/)) |
| Neon Free | 100 CU-hours and 1 GB per project, 6-hour history | Raised from 50 CU-hours and 0.5 GB in 2025 |
| Scaleway Serverless Containers | 200,000 vCPU-seconds and 400,000 GB-seconds per month | Not found |
| Turso Free | 100 databases, 5 GB, archived after 10 days idle | Removed cold starts with the Developer plan, database count now 100. Joining Supabase |
| Supabase Free | 500 MB, paused after 1 week idle, no backups | Not checked |
| Fly.io | None for new organizations | Withdrawn in 2024 |
| PlanetScale | None | Withdrawn on 2024-04-08 |
| Oracle Always Free | 2 OCPU and 12 GB A1, reclaimed when idle | Not checked |

## Data residency and transfer mechanism

The #15 research recorded the mechanisms for the providers it covered, and [#14](https://github.com/Turbo87/keyhole/issues/14) accepts US operators under DPF or SCCs.

| Provider | Operator | Location for Keyhole | Transfer mechanism |
| --- | --- | --- | --- |
| Cloudflare (R2, Workers, CDN) | Cloudflare, Inc., US | Global network, R2 EU jurisdiction available | DPF with SCCs for restricted transfers, per #15 |
| Fly.io | Fly.io, Inc., US | `fra`, `ams`, `cdg`, `arn` | DPF with 2021 SCCs, per #15 |
| Neon | Databricks, Inc., US | Frankfurt | DPF with SCCs available, per #15 |
| Scaleway | Scaleway SAS, France | Paris, Amsterdam, Warsaw | EU operator |
| GitHub Actions (backup job) | GitHub, Inc., US | US runners | Not checked. Only touches database dumps, which could be encrypted before upload |
| Turso | Turso, US address | Not checked | **Unverified**, not stated in its privacy policy |
| Oracle Cloud | Oracle, US | EU home region selectable | Not checked |

Published results contain pilot names and are public by design, so serving them from Cloudflare's global cache is a publication question for #14 rather than a processor-location question. IGC files in an R2 EU-jurisdiction bucket stay in the EU, but whether EU-jurisdiction buckets support public custom domains was not checked (**unverified**).

## Options for the grilling

These are options with tradeoffs, not a decision.

1. **JSON publish, Fly.io and Neon Free.** axum on a Fly.io Machine in `fra` that exits when idle and no analysis is pending, Neon Free in Frankfurt capped at 0.25 CU, R2 for IGC files and published JSON, the SPA on Cloudflare static assets, and per-page HTML stubs for link previews. A few cents idle and about $1.30 to $1.50 active. Node disappears from production, which removes the axum front door and child-process handling from #16. The cost is a cold start of about 2 s for the first scorer or pilot, connection-pool recovery after a Neon suspend, and indexing that depends on crawlers running JavaScript.
2. **Static HTML publish on the same hosting.** The same costs as option 1, with full HTML for crawlers and readers without JavaScript. Node stays in the image to run `svelte/server` at publish time, and the publish path gains a renderer that must stay in sync with the client bundle.
3. **Scaleway compute instead of Fly.io.** Serverless Containers in `fr-par` with Neon Free, for €0 to about €0.20 per month and compute with an EU operator. The cold start is unknown and needs a measurement, and analysis must finish within 15 minutes of the last request.
4. **SQLite with Litestream on Fly.io.** The fewest vendors at about the same cost, with no CU-hour cliff. It reverses the Postgres and `diesel-async` decisions from #9, gives up `NOTIFY`, advisory locks and `SKIP LOCKED`, and allows only one instance.

The Workers-native option is the only one at a guaranteed €0, but it gives up the plain-container exit, Tokio and server-side analysis. The single-process SSR design is viable only with a paid database or a CDN cache in front of it that absorbs crawler traffic.

## Open questions

- Does Keyhole need pages that work without JavaScript and full indexing, or are link previews through HTML stubs enough? This decides between static HTML and JSON publish, and whether Node stays in production.
- How long does analysing one IGC file take on 0.25 to 0.5 vCPU? It decides whether analysis fits in the upload request, in Scaleway's 15-minute window, or in a Workers request.
- Is a cold start of a few seconds for the first scorer or pilot of the day acceptable, or should a scheduled warm-up run before briefing on competition days?
- How long do real cold starts of a Keyhole image take on Fly.io from stopped and on Scaleway Serverless Containers? Scaleway publishes no figure.
- Does an idle open Postgres connection keep a Neon compute awake? This needs a test before relying on the 100 CU-hour allowance.
- Is Neon Free's 6-hour history plus a daily `pg_dump` from GitHub Actions an acceptable recovery point during competitions?
- How long are IGC files kept, given that each season adds 15 to 30 GB and the R2 free tier covers 10 GB?
- Should Keyhole stay on Postgres, or is SQLite's single-writer model acceptable in exchange for one vendor less?
- Is moving the domain's DNS to Cloudflare acceptable, since an R2 custom domain requires the zone in the same Cloudflare account?
