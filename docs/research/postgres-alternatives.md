# Postgres alternatives to Neon

Research for [#41](https://github.com/Turbo87/keyhole/issues/41). The question is which Postgres-compatible managed databases beyond Neon keep Keyhole at €0, or at most about €5 per month averaged over the year, without hand-run operations. It builds on the zero-cost hosting research for [#33](https://github.com/Turbo87/keyhole/issues/33) ([findings](https://github.com/Turbo87/keyhole/blob/research/zero-cost-hosting/docs/research/zero-cost-hosting.md)) and uses the same workload. Public pages are published as JSON to R2, so only scorers, pilot uploads and flight analysis wake the database. That happens during three to four active months a year, with about 240 awake hours per active month as a ceiling. The database is idle the rest of the year and grows to about 2 GB after a few seasons. The backend is axum with `diesel` and `diesel-async` on Tokio, running on a Fly.io Machine in `fra`.

#33 already ruled out Supabase Free, Turso, Cloudflare D1, Scaleway Serverless SQL and PlanetScale Hobby, and those are not repeated here. Neon Free is the baseline: 100 CU-hours and 1 GB per project, a 6-hour history window, and scale to zero after 5 minutes.

Facts were checked against provider pricing pages, provider documentation, changelogs, privacy policies and DPAs, PlanetScale's public pricing database, the GitHub issues API, the crates.io API and the source of `diesel_migrations` 2.3.2 and `diesel-async` 0.9.2 on 2026-11-01 unless a row says otherwise. Prices exclude VAT and are in dollars unless stated. No exchange rate was verified. Claims marked **unverified** come from secondary sources, inference, or were not stated on the cited page.

## Summary

No candidate beats Neon Free on every axis, but three come close on cost. CockroachDB Basic and Prisma Postgres Free both hold 2 GB for $0 and offer Frankfurt. Xata has no free tier but scales to zero and costs about $1.50 per month averaged over the year. Neon Free itself only stays at $0 while the database is under 1 GB.

**CockroachDB Basic** has the most generous allowance: $15 of usage per month, which covers 50 million Request Units and 10 GiB, with daily backups kept for 30 days. It is not Postgres, though. `LISTEN`/`NOTIFY` and session-level advisory locks are unsupported, Diesel's tracking issue on the CockroachDB side is still open, and `pg_dump` only exports the schema, so leaving is not a plain `pg_dump`. The current pricing page also no longer lists Basic, which casts doubt on its future.

**Prisma Postgres Free** is real Postgres with 2 GB and 200,000 operations per month. It blocks the database when either limit is reached and has no backups on Free. 2 GB is exactly Keyhole's assumption, and the operation count needs measuring, because `diesel-async`'s default pool check alone doubles the number of queries.

**Xata** costs nothing in compute while hibernated, about $3.44 in an active month and about $0.56 in an idle month at 2 GB, and is plain Postgres with Frankfurt and a documented wake-up of about 1 second. **PlanetScale Postgres PS-5** is plain Postgres at a flat $5 per month in Frankfurt with 12-hourly backups and point-in-time recovery, but it never scales to zero, so it uses the whole budget.

**Aiven Free** is ruled out. It has 1 GB and no region choice, and it powers off inactive services, which it then deletes after 180 days. Keyhole's idle season is longer than that. **Aurora DSQL** is always free with 100,000 DPUs and 1 GB per month in Frankfurt, but it breaks the default Diesel migration flow, has no `SKIP LOCKED` semantics and needs IAM token authentication. It does not meet the "plain Postgres connection" requirement.

## Neon baseline

From #33: Neon Free costs $0 while under 100 CU-hours and 1 GB, and Keyhole at 0.25 CU uses about 60 CU-hours in a 240-hour month. At 2 GB it must move to Launch, which costs $0.35 per GB-month and $0.106 per CU-hour with invoices under $0.50 not collected ([pricing](https://neon.com/pricing)). That is about $0.70 in an idle month and about $7.06 in an active month (60 CU-hours plus storage), or about $2.82 per month averaged over a year with four active months.

## Candidates

### Aiven Free and Developer

**Cost and limits.** Aiven Free for PostgreSQL is a single node with 1 CPU, 1 GB RAM, 1 GB of disk and `max_connections` set to 20 ([PostgreSQL free tier](https://aiven.io/docs/products/postgresql/concepts/pg-free-tier)). It needs no credit card and has no time limit ([free plans](https://aiven.io/docs/platform/concepts/free-plan)). The Developer tier costs $5 per month for 1 CPU, 1 GB RAM and up to 8 GB of storage ([pricing](https://aiven.io/pricing?product=pg), [Developer tier](https://aiven.io/blog/new-developer-tier-for-aiven-for-postgres)). Neither page says what happens when the disk fills (**unverified**). 1 GB is below Keyhole's 2 GB, so Free only lasts the first seasons.

**Idle behaviour.** Aiven may "power off free services with no initial usage within the first few hours" and services "with no continuative activity", with a notification first. The inactivity period is not stated ([free plans](https://aiven.io/docs/platform/concepts/free-plan)). "Services powered off for more than 180 days are automatically deleted", and on power-off "if there are no backups, all service data is lost" ([power cycle](https://aiven.io/docs/platform/concepts/service-power-cycle)). Keyhole's idle season is eight to nine months, about 240 to 270 days, so a Free service powered off in autumn would be deleted before spring. Whether the single Free backup survives power-off and deletion was not stated (**unverified**). Developer services "are not automatically powered off if inactive" ([Developer tier](https://aiven.io/blog/new-developer-tier-for-aiven-for-postgres)). Aiven bills powered-on services hourly ([free plans](https://aiven.io/docs/platform/concepts/free-plan)), but whether Developer is billed hourly or as a flat $5 is not stated (**unverified**). Powering it off for the winter would hit the same 180-day deletion rule.

**Diesel compatibility.** Aiven runs community PostgreSQL. No page mentions limits on `LISTEN`/`NOTIFY`, advisory locks or `SKIP LOCKED`, and the only stated restriction is that superuser-only extensions cannot be installed ([extensions](https://aiven.io/docs/products/postgresql/reference/list-of-extensions)). Full compatibility is inferred, not stated (**unverified**). Connection pooling is not available on Developer ([free plans](https://aiven.io/docs/platform/concepts/free-plan)), which does not matter for a single axum process.

**Backups.** Free and Developer keep a "single backup only, for disaster recovery" ([pricing](https://aiven.io/pricing?product=pg)). No point-in-time recovery is listed for these tiers.

**Region and operator.** Free and Developer "cannot select a specific cloud or region". Only a geographic area such as Europe can be chosen ([Developer tier](https://aiven.io/blog/new-developer-tier-for-aiven-for-postgres)). The free plan page says Aiven may also "change the cloud provider, region, or configuration at any time" ([free plans](https://aiven.io/docs/platform/concepts/free-plan)). Which European location a free service lands in was not found (**unverified**). The controller is Aiven Ltd, business ID 2795743-5, a Finnish company with headquarters in Helsinki ([privacy](https://aiven.io/privacy), [press release](https://aiven.io/press/aiven-launches-free-plans-for-postgresql-mysql-and-redis)). Transfers outside the EEA use SCCs, and a DPA is published at `aiven.io/dpa`.

**Exit.** Plain `pg_dump`.

### CockroachDB Basic

**Cost and limits.** Each pay-as-you-go organization gets "$15 of resource consumption", equivalent to 50 million Request Units and 10 GiB of storage, each month across all Basic clusters. Beyond that, RUs cost $0.20 per million and storage $0.50 per GiB-month. A spend limit can be set. When the storage limit is reached the cluster cannot write, and when the RU limit is reached the cluster is disabled until the limit is raised or the next billing cycle starts ([plan a Basic cluster](https://docs.cockroachlabs.com/docs/cockroachcloud/plan-your-cluster-basic)). The free allowance applies to organizations "paying monthly by credit card or marketplace", so a payment method is expected (**unverified** whether one is strictly required). 2 GB uses $1 of the allowance. How many RUs Keyhole's queries consume is not known without a measurement.

The pricing page checked on 2026-11-01 lists only Standard, from $0.057 per vCPU-hour, and Mission Critical, plus a 30-day trial with $400 of credit. It does not mention Basic ([pricing](https://www.cockroachlabs.com/pricing/)). The Basic docs and the cloud release notes up to July 2026 still describe Basic ([release notes](https://www.cockroachlabs.com/docs/releases/cloud)). Whether new organizations can still create Basic clusters is **unverified**.

**Idle behaviour.** RU consumption "scales to zero when your cluster has no activity" ([plan a Basic cluster](https://docs.cockroachlabs.com/docs/cockroachcloud/plan-your-cluster-basic)). No page states a cold-start time or says whether idle clusters are deleted (**unverified**).

**Diesel compatibility.** CockroachDB v26.4 supports transaction-scoped advisory locks but not session-scoped ones ([PostgreSQL compatibility](https://docs.cockroachlabs.com/docs/stable/postgresql-compatibility)). `LISTEN`/`NOTIFY` support is still an open request ([cockroach#41522](https://github.com/cockroachdb/cockroach/issues/41522)). `SELECT ... FOR UPDATE SKIP LOCKED` is supported, but under `SERIALIZABLE` not "for tables with multiple column families" ([SELECT FOR UPDATE](https://docs.cockroachlabs.com/docs/stable/select-for-update)). Diesel's own tracking issue was closed in 2018 ([diesel#1667](https://github.com/diesel-rs/diesel/issues/1667)), but CockroachDB's "support diesel-rs" issue is still open ([cockroach#13787](https://github.com/cockroachdb/cockroach/issues/13787)). Known problems include `diesel print-schema` and the PL/pgSQL `diesel_manage_updated_at()` function in the default setup migration. Triggers, stored procedures and UDFs are now listed as partial ([SQL feature support](https://docs.cockroachlabs.com/docs/stable/sql-feature-support)), so whether these still fail on v26.4 is **unverified**. CockroachDB also defaults to `SERIALIZABLE`, which makes retry handling for transaction conflicts part of the application.

**Backups.** Basic takes a managed backup every 24 hours on a "non-configurable schedule" and keeps it for 30 days ([managed backups](https://docs.cockroachlabs.com/docs/cockroachcloud/managed-backups-basic)). No point-in-time restore is described for Basic.

**Region and operator.** Basic offers AWS `eu-central-1` (Frankfurt), `eu-west-1` and `eu-west-2`, and GCP `europe-west1`, `europe-west2` and `europe-west3` (Frankfurt) ([regions](https://docs.cockroachlabs.com/docs/cockroachcloud/regions)). The operator is Cockroach Labs, Inc., New York, which "complies with the EU-US Data Privacy Framework" ([privacy](https://www.cockroachlabs.com/privacy/)). The privacy policy does not name SCCs or link a DPA.

**Exit.** Not a plain `pg_dump`. CockroachDB supports PostgreSQL 18's `pg_dump` for "schema-only dumps in plain format" only, and "data dumps, non-plain archive formats, `pg_restore`, and `pg_dumpall` are not supported" ([PostgreSQL compatibility](https://docs.cockroachlabs.com/docs/stable/postgresql-compatibility)). Data would leave through CSV exports or changefeeds (**unverified**, not tested).

### Prisma Postgres

**Cost and limits.** The Free plan includes 200,000 operations and 2 GB of storage per month across up to 50 databases, with the spend limit "fixed at $0, no card required". Starter costs $10 per month for 1 million operations, 10 GB and $8 per further million ([pricing](https://www.prisma.io/pricing)). Every query counts as one operation, "even `SELECT 1` is billable", and execution time does not matter. When the Free allowance is used up "the database stops accepting read and write requests" until an upgrade or the next calendar month, with a one-time 24-hour restore per workspace for exporting data ([FAQ](https://www.prisma.io/docs/postgres/faq)).

2 GB is exactly Keyhole's storage assumption, so there is no headroom. 200,000 operations across 240 hours is about 830 per hour. `diesel-async`'s default `RecyclingMethod::Verified` runs `SELECT 1` on every pool checkout (`diesel-async` 0.9.2, `src/pooled_connection/mod.rs`), which doubles the count unless the pool is set to `Fast`. A `SKIP LOCKED` lease loop polling every 10 seconds adds about 86,000 operations in 240 hours on its own. Whether `BEGIN` and `COMMIT` count as operations is **unverified**.

**Idle behaviour.** Early Prisma posts describe unikernel snapshots that resume "in a matter of single-digit milliseconds" ([life of a query](https://www.prisma.io/blog/cloudflare-unikernels-and-bare-metal-life-of-a-prisma-postgres-query)). Prisma's own 2026 troubleshooting page says the docs "don't describe scale to zero or a wake time for the database" ([slow first request](https://www.prisma.io/postgres/slow-first-request-after-idle)). Billing is per query, so idle time costs nothing. Whether idle Free databases are paused or deleted is not stated (**unverified**).

**Diesel compatibility.** The direct connection string `postgres://...@db.prisma.io:5432/postgres?sslmode=require` works with any Postgres client, and `LISTEN`/`NOTIFY` and session state need it ([direct connections](https://www.prisma.io/docs/postgres/database/direct-connections)). The pooler runs PgBouncer in transaction mode, where "advisory locks, or temporary tables are lost after each transaction boundary". The Free plan allows 10 pooled and 10 direct connections, of which "five of these are reserved for platform maintenance and monitoring" ([connection pooling](https://www.prisma.io/docs/postgres/database/connection-pooling)), which may leave only five direct connections (**unverified** reading). `SKIP LOCKED` is not mentioned and is assumed to work as in community Postgres (**unverified**).

**Backups.** Free has none. Starter and Pro keep daily snapshots for 7 days, taken "only on days when the database has activity", and point-in-time recovery "is coming to Prisma Postgres in November 2026" ([backups](https://www.prisma.io/docs/postgres/database/backups)). On Free, a scheduled `pg_dump` is the only backup.

**Region and operator.** Regions include Frankfurt (`eu-central-1`) and Paris (`eu-west-3`) ([FAQ](https://www.prisma.io/docs/postgres/faq)). The operator is Prisma Data, Inc., which "complies with the EU-U.S. Data Privacy Framework" ([privacy](https://www.prisma.io/privacy)). The DPA names DPF and the 2021 SCCs, and a signed copy must be requested by email ([DPA](https://www.prisma.io/legal/dpa)).

**Exit.** Plain `pg_dump` over the direct connection, which the FAQ recommends before deleting a database.

### Xata

**Cost and limits.** Xata Cloud has no free tier, only "a 14-day free trial", after which it is pay-as-you-go. The smallest instance, `micro` with 1 GB RAM, costs $0.012 per hour or $9 per month if always on, and storage costs $0.28 per GB-month ([pricing](https://xata.io/pricing)). The page labels these as regional prices, and the Frankfurt rate was not extracted (**unverified**). With scale to zero, an active month of 240 hours costs about $2.88 in compute plus $0.56 for 2 GB, and an idle month $0.56. No minimum invoice is stated.

**Idle behaviour.** Automatic scale to zero hibernates a branch after a configurable inactivity period, 30 minutes by default, and a new connection wakes it. "The branch will now start tracking the open connections", so an idle pooled connection presumably keeps it awake and the axum pool must drop idle connections ([scale to zero](https://xata.io/docs/core-concepts/scale-to-zero.md)). The pricing page gives a wake-up time of about 1 second on Xata Cloud ([pricing](https://xata.io/pricing)). Whether the inactivity period can be set below 30 minutes is **unverified**. With a 30-minute period, each wake-up costs at least 30 minutes of compute, which the 240-hour ceiling already covers.

**Diesel compatibility.** Xata runs PostgreSQL 14 to 18 with a direct `rw` endpoint and a separate `pooled_rw` pooler ([branches](https://xata.io/docs/platform/branch.md), [extensions](https://xata.io/docs/platform/extensions.md)). No restrictions on `LISTEN`/`NOTIFY`, advisory locks or `SKIP LOCKED` are documented (**unverified**, inferred from plain Postgres). A branch with no replicas "is not suitable for production workloads" because a primary restart makes the database unavailable until it returns ([deployment models](https://xata.io/docs/core-concepts/deployment.md)). For Keyhole that is a short outage risk, not a data risk.

**Backups.** The docs found do not describe backup frequency, retention or point-in-time restore for Xata Cloud (**unverified**). The branch API reports whether a branch's region supports backups ([branch details](https://xata.io/docs/api-reference/branches/get-branch-details.md)).

**Region and operator.** AWS Frankfurt has been available since 2025-09-10. Current regions are AWS `us-east-1`, `us-west-2` and `eu-central-1` and GCP `us-central1` ([changelog](https://xata.io/docs/changelog.md)). The controller is Xatabase, Inc., San Francisco. The privacy policy names the Commission's standard data protection clauses for transfers, does not mention DPF and links no DPA ([privacy](https://xata.io/privacy)).

**Exit.** Plain `pg_dump`.

### PlanetScale Postgres

**Cost and limits.** The smallest size is PS-5 with 1/16 vCPU and 512 MiB, and the single-node version is $5 per month ([pricing](https://www.planetscale.com/pricing), [single node](https://planetscale.com/changelog/single-node)). PlanetScale's public pricing database lists `PS-5-ARM` with replication factor 1 in `eu-central-1` at $5 per month, including a 10 GiB gp3 volume and 10 GB of network transfer, and $15 with three nodes. It runs all month, and the pricing pages do not mention scale to zero, so the $5 applies in every idle month too. Backup storage beyond twice the disk size costs $0.023 per GB-month ([Postgres pricing](https://planetscale.com/docs/postgres/pricing)).

**Diesel compatibility.** PlanetScale Postgres is community Postgres. Port 5432 is a direct connection with "full Postgres session capabilities", and port 6432 goes through PgBouncer in transaction mode, where `LISTEN`/`NOTIFY` and session-level advisory locks do not work ([PgBouncer](https://planetscale.com/docs/postgres/connecting/pgbouncer)). `SKIP LOCKED` is not mentioned and is assumed to work (**unverified**).

**Backups.** Every cluster is backed up every 12 hours, with point-in-time recovery through WAL archiving ([backups under the hood](https://planetscale.com/blog/postgres-backups-under-the-hood), [plans](https://planetscale.com/docs/planetscale-plans)). The default retention was not found (**unverified**).

**Free tier history and operator.** PlanetScale withdrew its free Hobby plan on 2024-04-08, as recorded in #33. The operator is PlanetScale Inc., San Francisco, which "participates in the EU-US Data Privacy Framework" ([privacy](https://planetscale.com/legal/privacy)).

**Exit.** Plain `pg_dump`.

### Aurora DSQL

**Cost and limits.** Each month, "the first 100,000 DPUs and 1 GB of storage are free". Beyond that, US East (Ohio) charges $8 per million DPUs and about $0.33 per GB-month ([pricing](https://aws.amazon.com/rds/aurora/dsql/pricing/)). The Frankfurt rates were not listed (**unverified**). The AWS Free Tier page states that "Aurora DSQL is an always free service on the Free and Paid plans", unlike the 6-month credits for new accounts ([AWS Free Tier](https://aws.amazon.com/free/)). At 2 GB, storage costs about $0.33 per month all year. How many DPUs Keyhole uses is not known without a measurement. 100,000 DPUs is worth $0.80 at the Ohio rate.

**Idle behaviour.** DSQL is serverless and bills DPUs per use. No page found states a cold start (**unverified**).

**Diesel compatibility.** This is the blocker. DSQL fixes isolation at Repeatable Read, and "DDL and DML operations require separate transactions" and "a transaction can include only 1 DDL statement". A transaction can modify at most 3,000 rows and last at most 5 minutes, and connections time out after 60 minutes ([PostgreSQL compatibility](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html), [quotas](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/CHAP_quotas.html)). There are no temporary tables, no triggers and no PL/pgSQL, and `TRUNCATE` is replaced by `DELETE`. Foreign keys and sequences are now supported.

`diesel_migrations` 2.3.2 runs each migration's SQL and the `__diesel_schema_migrations` insert inside one transaction when `run_in_transaction` is true, the default (`src/migration_harness.rs`, `run_migration()`). That mixes DDL and DML, so every default Diesel migration fails on DSQL. With `run_in_transaction = false` in each migration's metadata, the SQL runs through `batch_execute()` and the insert runs separately. Each migration would then need exactly one DDL statement (**unverified** whether a multi-statement simple query counts as one transaction on DSQL). The default `diesel setup` migration creates PL/pgSQL helpers, which DSQL rejects.

DSQL uses optimistic concurrency, and `SELECT ... FOR UPDATE` "produce[s] results through optimistic conflict detection at commit time rather than locking" ([concurrency control](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-concurrency-control.html)). A `SKIP LOCKED` lease queue therefore has no locks to skip and turns into serialization errors and retries. `LISTEN`/`NOTIFY` and advisory locks are not documented on the pages checked and are presumably unavailable without a lock manager (**unverified**). Passwords are IAM tokens that expire after 15 minutes by default and at most one week, while established connections stay valid ([auth tokens](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_authentication-token.html)). The pool would have to sign a new token through `aws-sdk-dsql` for every connection, for example in `diesel-async`'s `custom_setup` callback. AWS ships a connector for SQLx but none for Diesel.

**Backups.** Through AWS Backup with configurable schedules and retention, and restores always create a new cluster ([backup](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/backup-aurora-dsql.html)). AWS Backup storage is billed separately.

**Region and operator.** European regions are Frankfurt, Ireland, London, Paris, Spain and Stockholm ([what is DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)). AWS "has certified to the EU-U.S. Data Privacy Framework" ([DPF](https://aws.amazon.com/compliance/eu-us-data-privacy-framework/)).

**Exit.** AWS's own `aurora-dsql-loader` has a separate `export` command that writes a plain `.sql` file and "does not export views, foreign keys, grants, or triggers" ([aurora-dsql-loader](https://github.com/aws-samples/aurora-dsql-loader)). Whether stock `pg_dump` works against DSQL is **unverified**. Leaving is not a plain `pg_dump`.

### Other options

**Nile.** The Free plan includes 1 GB of storage, then $1.50 per GB, 50 million query tokens, and "the db never pauses", with no backups. Pro costs $15 per month ([pricing](https://www.thenile.dev/pricing)). Whether storage beyond 1 GB is billed on Free or blocks writes, which EU regions exist, and how Nile's tenant-aware Postgres handles Diesel are **unverified**.

**Koyeb.** Postgres is available in Frankfurt and scales to zero. The free instance has 0.25 vCPU, 1 GB RAM and 1 GB of storage with "5h" of compute, and the page does not say per what period. The paid Small instance costs $0.04 per hour and storage $0.50 per GB-month ([pricing](https://www.koyeb.com/pricing)). At 240 hours that is about $10.60 in an active month and $1 in an idle month, or about $4.20 averaged over the year, which is close to the ceiling.

**Render Free** expires 30 days after creation and is deleted 14 days later, with no backups ([free](https://render.com/docs/free)). **Tiger Data** has no free plan, only a 30-day trial, with paid plans from $30 per month ([pricing](https://www.tigerdata.com/pricing)). Neither fits.

## Cost comparison

Database only, for the workload above at 2 GB. The idle month assumes no wake-ups, and the active month assumes 240 awake hours. The yearly average assumes four active and eight idle months. Fly.io, R2 and the domain from #33 come on top and are the same in every row.

| Option | Idle month | Active month | Yearly average | Limit behaviour | Exit |
| --- | --- | --- | --- | --- | --- |
| Neon Free | $0 | $0 | $0 | Over 1 GB, so Launch is needed at 2 GB | `pg_dump` |
| Neon Launch, 0.25 CU | about $0.70 | about $7.06 | about $2.82 | Billed | `pg_dump` |
| Aiven Free | $0 | $0 | $0 | Over 1 GB. Powered off when idle, deleted after 180 days off | `pg_dump` |
| Aiven Developer | $5 | $5 | $5 | 8 GB | `pg_dump` |
| CockroachDB Basic | $0 | $0 if under 50M RUs | $0 | Disabled at the RU limit, read-only at the storage limit | Schema only |
| Prisma Postgres Free | $0 | $0 if under 200,000 operations | $0 | Blocked until next month. 2 GB with no headroom | `pg_dump` |
| Prisma Postgres Starter | $10 | $10 | $10 | Billed | `pg_dump` |
| Xata `micro` with scale to zero | about $0.56 | about $3.44 | about $1.52 | Billed | `pg_dump` |
| PlanetScale PS-5 single node | $5 | $5 | $5 | 10 GiB included | `pg_dump` |
| Aurora DSQL | about $0.33 | about $0.33 plus DPUs over 100,000 | about $0.33 plus DPUs | Billed | Custom export tool |
| Koyeb Small with scale to zero | about $1.00 | about $10.60 | about $4.20 | Billed | `pg_dump` |

The $0 rows depend on usage that has not been measured. CockroachDB RUs, Prisma operations and DSQL DPUs per scoring day are the numbers that decide whether those rows stay at $0.

## Free tier history

| Free tier | Limits that matter for Keyhole | History |
| --- | --- | --- |
| Neon Free | 100 CU-hours and 1 GB, 6-hour history | Raised from 50 CU-hours and 0.5 GB in 2025, per #33 |
| Aiven Free | 1 CPU, 1 GB RAM, 1 GB disk, powered off when idle | Launched on 2023-04-12 for PostgreSQL, MySQL and Redis ([press release](https://aiven.io/press/aiven-launches-free-plans-for-postgresql-mysql-and-redis)). The $5 Developer tier was added on 2025-11-12 ([Developer tier](https://aiven.io/blog/new-developer-tier-for-aiven-for-postgres)). No reduction found |
| CockroachDB Basic | $15 per month, equal to 50M RUs and 10 GiB | Serverless was renamed Basic on 2024-09-25 ([release notes](https://www.cockroachlabs.com/docs/releases/cloud)). The 2026-11-01 pricing page no longer lists Basic |
| Prisma Postgres Free | 200,000 operations, 2 GB, no backups | Doubled from 100,000 operations on 2026-08-28 ([changelog](https://www.prisma.io/changelog/2026-08-28)) |
| Xata | None, 14-day trial | The legacy free tier with 15 GB lost search and file APIs on 2025-01-10 ([blog](https://xata.io/blog/changes-free-tier)), and the classic platform was renamed Xata Lite ([blog](https://xata.io/blog/serverless-postgres-platform)). The current platform has no free tier |
| PlanetScale | None | Hobby withdrawn on 2024-04-08. PS-5 at $5 added later ([single node](https://planetscale.com/changelog/single-node)) |
| Aurora DSQL | 100,000 DPUs and 1 GB per month, always free | AWS moved new accounts to 6-month credits, but DSQL stays always free on both plans ([AWS Free Tier](https://aws.amazon.com/free/)) |
| Render Free Postgres | 1 GB, expires after 30 days | Not checked |

## Data residency and transfer mechanism

[#14](https://github.com/Turbo87/keyhole/issues/14) accepts US operators under DPF or SCCs.

| Provider | Operator | EU location for Keyhole | Transfer mechanism |
| --- | --- | --- | --- |
| Neon | Databricks, Inc., US | Frankfurt | DPF with SCCs available, per #33 |
| Aiven | Aiven Ltd, Finland | Europe area only, no region choice. Free services run on a provider Aiven picks | EU operator, SCCs for transfers outside the EEA |
| CockroachDB | Cockroach Labs, Inc., US | AWS or GCP Frankfurt | DPF. SCCs not named, no public DPA found |
| Prisma Postgres | Prisma Data, Inc., US | Frankfurt or Paris | DPF and 2021 SCCs in the DPA |
| Xata | Xatabase, Inc., US | AWS Frankfurt | SCCs named in the privacy policy, DPF not mentioned, no public DPA found |
| PlanetScale | PlanetScale Inc., US | AWS Frankfurt | DPF |
| Aurora DSQL | Amazon Web Services, US | Frankfurt and five other EU regions | DPF |

The infrastructure providers under Prisma, Xata and Aiven Free, such as AWS or DigitalOcean, were not checked as sub-processors (**unverified**).

## Options for the grilling

These are options with tradeoffs, not a decision.

1. **Stay on Neon Free and move to Launch past 1 GB.** $0 at first, then about $2.82 per month on average. Plain Postgres with a documented resume of a few hundred milliseconds, and a free tier that has only grown so far. The cost is the CU-hour cliff and a 6-hour history on Free.
2. **Prisma Postgres Free.** $0 at 2 GB, plain Postgres in Frankfurt, under DPF and SCCs. The cost is hard limits on operations and storage that block the database when reached, no backups on Free, and a Starter plan at $10 per month once either limit is exceeded. It needs a measured operation count per scoring day and a `Fast` pool recycling method.
3. **Xata with scale to zero.** About $1.50 per month on average, plain Postgres in Frankfurt with no usage cliff. The cost is a card on file from day one, an undocumented backup story, and a policy that names SCCs but not DPF.
4. **CockroachDB Basic.** Likely $0 with daily backups for 30 days. The cost is giving up `NOTIFY` and session advisory locks, Diesel friction in migrations and schema inference, an exit that is not a plain `pg_dump`, and uncertainty about whether Basic stays on sale.
5. **PlanetScale PS-5.** A flat $5 per month for plain Postgres with point-in-time recovery and no cold start. It uses the whole budget for a database that sits idle most of the year.

Aiven Free fails the idle-season and region requirements. Aurora DSQL is cheap but fails the "plain Postgres connection" and plain `pg_dump` requirements.

## Open questions

- How many queries does a scoring day issue? This decides whether Prisma's 200,000 operations or CockroachDB's 50 million RUs are enough, and needs a count from a realistic day, including pool checks and `BEGIN`/`COMMIT`.
- Is a hard block at the free limit acceptable during a competition, or must the database degrade into billing instead?
- Can new CockroachDB organizations still create Basic clusters, and does the free allowance require a card?
- What are Xata Cloud's backup frequency, retention and point-in-time restore for a single-instance branch, and what is the Frankfurt `micro` price?
- What is the shortest Xata inactivity period, and does an idle pooled connection keep a branch awake?
- Does Prisma Postgres pause or delete Free databases that are idle for eight months?
- Is a daily `pg_dump` to R2 from GitHub Actions enough as the only backup on Prisma Free, as #33 already assumes for Neon Free?
- Does `diesel print-schema` and the default `diesel setup` migration still fail on CockroachDB v26.4?
