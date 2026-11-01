# CDN alternatives to Cloudflare

Research for [#42](https://github.com/Turbo87/keyhole/issues/42). The question is which CDN and static hosting options outside Cloudflare can serve Keyhole's published JSON and SPA near zero cost while the domain's DNS stays where it is. It builds on the zero-cost hosting research for [#33](https://github.com/Turbo87/keyhole/issues/33) ([findings](https://github.com/Turbo87/keyhole/blob/research/zero-cost-hosting/docs/research/zero-cost-hosting.md)), especially its "Publish models" and "Serving published files" sections, and does not repeat them. The publish model is fixed by [#34](https://github.com/Turbo87/keyhole/issues/34): at publish time axum writes JSON, and optionally per-page HTML stubs, through the plain S3 API, and a static SvelteKit SPA renders public pages from them. Readers and crawlers must never wake the backend.

Facts were checked against provider pricing pages, provider documentation, API references and SDK sources, changelogs, and legal pages on 2026-11-01. Prices exclude VAT. Dollar amounts are not converted because no exchange rate was verified. Scaleway's pricing, product-availability and API reference pages return HTTP 403 to automated fetches. Scaleway prices therefore come from the public product catalog API and the [docs-content](https://github.com/scaleway/docs-content) repository, and figures that appear only on the blocked pages are marked as taken from a search-engine extract. Claims marked **unverified** come from secondary sources or inference, or were not stated on the cited page.

## Summary

Cloudflare cannot serve the published files from a custom hostname on the Free plan without the DNS zone. Partial (CNAME) setup needs Business or Enterprise, subdomain zones need Enterprise, and R2 custom domains and Workers custom domains both need the zone in the account. The one exception is Cloudflare Pages, which accepts a custom subdomain over a plain CNAME. So the baseline splits in two. R2 Free with the zone moved costs $0. Without the zone, Pages can serve the SPA and proxy JSON from R2 through a Pages Function for $0, but every JSON read becomes a metered Function request and there is no zone-level cache or purge.

Outside Cloudflare, three options keep the DNS where it is and stay well inside the budget. **Scaleway Edge Services Starter** in front of a Scaleway bucket costs €0.99 per month plus a few cents of storage, about €12.50 per year. It keeps everything with the EU operator that already stores the IGC files, takes a CNAME with a managed Let's Encrypt certificate, purges by object through an API, and can use the bucket website feature for index and error documents. Edge Services appears to run from Paris only, so it is a TLS front end and cache rather than a global CDN. **Bunny CDN** costs its $1 account minimum every month, about $12 per year, offers 119 PoPs, free Let's Encrypt over a CNAME, an SPA rewrite on its own storage, and purge by URL or cache tag. Its operator is in Slovenia. **Gcore's free CDN plan** includes 1 TB per month at €0 from a Luxembourg operator, but origin pulls count toward the allowance and its SPA handling was not verified.

**CloudFront's Free flat-rate plan** costs $0 with 1M requests and 100 GB per month and has no overage charges, but accounts on the AWS Free Tier are not eligible, and it makes AWS the second US operator. A bare Scaleway bucket website serves custom domains over HTTP only, so it is no option without a CDN in front. KeyCDN's $4 monthly minimum uses most of the budget. Netlify Free pauses all sites when its 300 credits run out, which a single active month can exhaust. statichost.eu's Hobby plan allows 10 GB of bandwidth and deploys through git builds, so it fits the SPA at most.

## Workload assumptions

The readers and crawlers from the #33 assumptions apply. Traffic was not measured, so the comparison uses a rough estimate (**unverified**): an initial SPA load of about 0.5 MB and JSON of tens of KB per page view give 10 to 30 GB and well under 1 million requests in an active month, and 1 to 3 GB in an idle month. Published files and the SPA build stay below 5 GB. A typical year has three to four active months and eight to nine idle months.

## Cloudflare baseline without the zone

**Partial and subdomain setups.** "A CNAME setup (partial) is only available to customers on a Business or Enterprise plan" ([partial setup](https://developers.cloudflare.com/dns/zone-setups/partial-setup/)). Subdomain setup, which delegates a child zone such as `results.example.org` to Cloudflare, is marked available on Enterprise only ([subdomain setup](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/)). Both restrictions are confirmed.

**R2 custom domains.** "The domain being used must have been added as a zone in the same account as the R2 bucket", and a domain not managed by Cloudflare needs the partial (CNAME) setup ([public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)). Without the zone, only `r2.dev` is left, which "is rate-limited and should only be used for development purposes", and CNAME records pointing at `r2.dev` are an unsupported access path (same page). R2 custom domains therefore do not work on the Free plan without moving the zone.

**Workers static assets.** A Workers custom domain requires "an active Cloudflare zone" ([custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)). Without the zone, a Worker with static assets runs only on `workers.dev`, which Cloudflare says "is intended for personal or hobby projects that aren't business-critical" and recommends against for production ([workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)). Whether an external CNAME to a `workers.dev` hostname works is not documented (**unverified**).

**Cloudflare Pages.** For a subdomain, "it is not necessary for your site to be a Cloudflare zone". The subdomain is added in the Pages dashboard and then pointed at `<project>.pages.dev` with a CNAME at the external DNS provider. Only an apex domain must be a zone ([Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)). Without a top-level `404.html`, "Pages assumes that you are deploying a single-page application" and serves `/` for unknown paths. Deployed assets stay cached until the next deployment ([serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)). The Free plan allows 500 builds per month, 20,000 files and 100 custom domains per project ([Pages limits](https://developers.cloudflare.com/pages/platform/limits/)).

Published JSON does not belong in Pages deployments, because each publish would be a full deployment. A Pages Function can bind the R2 bucket ([bindings](https://developers.cloudflare.com/pages/functions/bindings/)) and serve `/data/*` from it on the same custom subdomain. Functions requests count toward the Workers Free quota of 100,000 per day, while static asset requests stay free and unlimited ([Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)). That quota is ample for the estimated workload. Whether the Function's responses can use Cloudflare's cache on a hostname whose zone is elsewhere was not checked (**unverified**), so each JSON read is assumed to be an R2 Class B operation, which the 10 million free operations per month cover. Without the zone there is no zone-level purge, so a publish appears on the next request when the Function sends no long `Cache-Control`.

## Options

### Scaleway Edge Services in front of Object Storage

**Cost.** The Starter plan costs €0.99 per month, Professional €12.99 and Advanced €109.99. Cache egress beyond the plan costs €0.0135 per GB, an extra pipeline costs about €4 per month billed pro rata (€0.005376 per node in the catalog), and the WAF add-on for Starter costs €4 per month ([product catalog](https://api.scaleway.com/product-catalog/v2alpha1/public-catalog/products)). The pricing documentation uses Starter with 1 pipeline and 100 GB of cache egress in its examples and says cache fills from the backend do not count toward the plan ([understanding pricing](https://github.com/scaleway/docs-content/blob/main/pages/edge-services/reference-content/understanding-pricing.mdx)). The pricing page lists Starter with 100 GB of cache, 1 pipeline, a custom domain and "free egress fees" (search-engine extract of the [network pricing page](https://www.scaleway.com/en/pricing/network/)). Whether Object Storage still bills its own egress for cache fills is therefore **unverified**, but the 75 GB of free monthly Object Storage egress would cover it either way. Plans are pro rata and can be changed or cancelled at any time ([subscribe](https://github.com/scaleway/docs-content/blob/main/pages/edge-services/how-to/subscribe-edge-services.mdx)). Cancelling in winter would take public pages offline and is a hand-run operation, so the plan runs all year.

Object Storage in `fr-par` costs €0.000022 per GB-hour for Standard Multi-AZ and €0.000011 for One Zone, about €0.016 and €0.008 per GB-month, and €0.01 per GB of internet egress ([product catalog](https://api.scaleway.com/product-catalog/v2alpha1/public-catalog/products)). The pricing page states "75GB free every month then €0.01/GB" for egress and no request fees (search-engine extract of the [storage pricing page](https://www.scaleway.com/en/pricing/storage/)). A few GB of published files cost about €0.05 per month.

**Custom domain and TLS.** A pipeline endpoint can be customized with a subdomain. An externally managed domain needs a CNAME to the pipeline endpoint, and Scaleway can generate and renew a free Let's Encrypt certificate. An apex domain is not possible ([custom domain](https://github.com/scaleway/docs-content/blob/main/pages/edge-services/how-to/configure-custom-domain.mdx)). The DNS zone stays where it is.

**SPA routing and deployment.** A bucket backend can have the bucket website feature enabled (`is_website` in the [Go SDK](https://github.com/scaleway/scaleway-sdk-go/blob/master/api/edge_services/v1beta1/edge_services_sdk.go)), and objects can then stay private ([create pipeline](https://github.com/scaleway/docs-content/blob/main/pages/edge-services/how-to/create-pipeline.mdx)). Bucket website takes an `IndexDocument` suffix and an `ErrorDocument` "to return when the requested key access is denied or the key does not exist" ([bucket website API](https://github.com/scaleway/docs-content/blob/main/pages/object-storage/api-cli/bucket-website-api.mdx)). Setting the error document to `index.html` gives an SPA fallback, but S3-style website endpoints usually return it with status 404, and Scaleway does not document the status (**unverified**). The index suffix serves per-page HTML stubs at `/competitions/x/` without URL rewrites. The SPA build is uploaded with the same S3 API as the published files, for example from CI with `aws s3 sync`.

**Purge and publish latency.** Purge works by single object path or for everything. Directories cannot be purged, the console takes 5 paths at a time, and the `POST /edge-services/v1beta1/purge-requests` API takes a list of assets ([configure cache](https://github.com/scaleway/docs-content/blob/main/pages/edge-services/how-to/configure-cache.mdx)). A purge request has a `pending`, `done` or `error` status, so it is asynchronous ([Go SDK](https://github.com/scaleway/scaleway-sdk-go/blob/master/api/edge_services/v1beta1/edge_services_sdk.go)). No rate limit or completion time is documented (**unverified**). An object's `Cache-Control` header always takes precedence over the pipeline's lifetime setting, so a short max-age on JSON is the alternative. Object Storage has read-after-write consistency ([Object Storage FAQ](https://github.com/scaleway/docs-content/blob/main/pages/object-storage/faq.mdx)).

**Locations.** The Edge Services docs name no edge locations. The product-availability page lists Edge Services as available in Paris only (search-engine extract of [product availability](https://www.scaleway.com/en/product-availability-by-region/)), so it is a regional cache and TLS front end, not a global CDN (**unverified**). For readers in Europe this matters little.

**History.** Edge Services was free during its public beta and became billable on 2024-11-01, when Scaleway put existing users on the cheapest fitting plan automatically ([GA](https://github.com/scaleway/docs-content/blob/main/pages/edge-services/reference-content/understanding-ga.mdx)). Multi-backend routing, which could put the SPA and published files behind one pipeline, is a public beta available only through the API ([multi-backend](https://github.com/scaleway/docs-content/blob/main/pages/edge-services/reference-content/understanding-multi-backend.mdx)).

### Scaleway bucket website without a CDN

A bucket website is served at `https://<bucket>.s3-website.<region>.scw.cloud`. A custom domain works by naming the bucket after the hostname and adding a CNAME, but "SSL is not available when connecting to a bucket in this way" ([CNAME tutorial](https://github.com/scaleway/docs-content/blob/main/tutorials/s3-customize-url-cname/index.mdx)). HTTPS on a custom domain therefore needs Edge Services or another CDN in front. The bucket website alone costs only storage and egress beyond 75 GB, effectively €0.05 per month, and suits only a `scw.cloud` URL. There is no cache to purge, so a publish is visible immediately.

### Bunny CDN

**Cost.** The Standard network costs $0.01 per GB in Europe and North America over 119 PoPs, with no request fees and a $1 monthly minimum. Storage costs $0.01 per GB per region on HDD for the first two regions, and traffic from Bunny Storage to the CDN is free ([CDN pricing](https://bunny.net/pricing/), [storage pricing](https://bunny.net/pricing/storage/)). "A minimum value of $1 per month is charged on accounts with active zones" ([FAQ](https://bunny.net/faq/)). The estimated workload uses $0.01 to $0.30 per month, so the bill is the $1 minimum every month. A pull zone can also pull from the existing Scaleway bucket, whose 75 GB of free egress covers the cache fills.

**Plain S3 API.** Bunny Storage's S3-compatible API is in public preview since 2026-07-09, with Frankfurt among its regions. S3 compatibility must be chosen when a storage zone is created and cannot be enabled later, and pull zones do not yet use stored S3 metadata such as `Cache-Control`, so caching is configured on the pull zone ([S3 docs](https://bunny.net/docs/storage/s3), [changelog](https://bunny.net/docs/storage/changelog)). Pulling from the Scaleway bucket avoids depending on the preview.

**Custom domain and TLS.** A hostname is added to the pull zone, pointed at the pull zone's `b-cdn.net` hostname with a CNAME, and gets a free, automatically renewed Let's Encrypt certificate ([custom hostname](https://bunny.net/docs/cdn/custom-hostname), [SSL setup](https://bunny.net/docs/cdn/ssl-setup)). The DNS zone stays where it is.

**SPA routing and deployment.** A storage zone can serve a custom 404 file and rewrite 404 responses "for requests without a file extension" to status 200. Bunny recommends `/index.html` with the rewrite for SPAs ([storage settings](https://bunny.net/docs/storage/settings)). This applies to Bunny Storage origins. With the Scaleway bucket as origin, the fallback depends on the bucket website error document and its status code (**unverified**). The SPA build is uploaded to the storage zone or the bucket from CI.

**Purge.** `POST /purge?url=` purges a URL, optionally asynchronously, and `POST /pullzone/{id}/purgeCache` purges a whole pull zone or a `CacheTag` ([purge URL](https://bunny.net/docs/api-reference/core/purge/purge-url), [purge pull zone](https://bunny.net/docs/api-reference/core/pull-zone/purge-cache)). Rate limits and completion time are not documented (**unverified**).

**History.** Accounts created after 2019-07-22 pay the $1 monthly minimum instead of an expiring prepaid balance ([billing changes](https://bunny.net/blog/billing-changes-for-new-accounts/)). S3 compatibility was announced in 2022, slipped from an early-2024 target, and reached public preview in 2026 ([S3 roadmap](https://bunny.net/blog/whats-happening-with-s3-compatibility/), [changelog](https://bunny.net/docs/storage/changelog)).

### Gcore CDN

**Cost.** The CDN PAYG plan lists 1 TB per month and €0.01 per GB beyond it, with no stated monthly fee ([pricing](https://gcore.com/pricing/edge-network)), and the CDN page offers "1,000 GB on us, every month" without a credit card ([CDN](https://gcore.com/cdn)). The monthly traffic limit includes "traffic from the origin to a CDN server and from a CDN server to an end user" ([billing](https://docs.gcore.com/cdn/how-the-cdn-service-and-its-additional-options-are-billed)), which still leaves the estimated workload far below 1 TB. Gcore has no storage in this setup, so the Scaleway bucket is the origin and costs about €0.05 per month. The MSA allows Gcore to change free-period terms (**unverified**, from a search-engine summary of MSA §18.4).

**Custom domain and TLS.** A CNAME at the external DNS provider points to a `*.gcdn.co` hostname, and a free Let's Encrypt certificate can be issued through HTTP-01 or DNS-01 validation and renews automatically ([issue Let's Encrypt certificate](https://docs.gcore.com/api-reference/cdn/lets-encrypt-certificates/issue-lets-encrypt-certificate)).

**SPA routing.** No SPA fallback was found in the documentation checked. It would rely on the Scaleway bucket website error document (**unverified**).

**Purge.** `POST /cdn/resources/{id}/purge` purges by URL, by pattern or everything. The limits are 2 URL requests per minute with up to 100 URLs each, and 1 pattern or purge-all request per minute ([purge cache](https://gcore.com/docs/api-reference/cdn/tools/purge-cache)). The pattern limit per request differs between sources (10 or 50), and the "Get CDN limits" endpoint returns the account's real values (**unverified**).

**History.** An older blog post described a free plan of 100 GB per month that needed a card, and the old free-plan page listed €0.03 per GB overage. Both differ from the current 1 TB at €0.01 per GB (**unverified**, from search results for [old.gcore.com/cdn/free](https://old.gcore.com/cdn/free/) and the [blog](https://gcore.com/blog/sign-up-for-a-free-cdn-account)).

### Amazon CloudFront Free flat-rate plan

**Cost.** The Free plan costs $0 per month per distribution with 1M requests, 100 GB of data transfer and 5 GB of S3 Standard storage credits, and up to 3 Free plans per account. There are no overage charges. Sustained excess usage may lead to traffic being "served from fewer or more distant edge locations". Accounts that are "using AWS Free Tier" are not eligible, and a distribution on a plan must have an AWS WAF web ACL ([flat-rate plans](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html), [pricing](https://aws.amazon.com/cloudfront/pricing/)). The plans launched in November 2025 and gained API support in September 2026 ([announcement](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-flat-rate-pricing-plans/), [API support](https://aws.amazon.com/about-aws/whats-new/2026/09/cloudfront-flat-rate-pricing-plans-api/)).

**Fit.** Keyhole could write to S3 directly, within the 5 GB credit, through the plain S3 API, or CloudFront could pull from the Scaleway bucket. Whether a non-AWS origin and a domain whose DNS is outside Route 53 are allowed on the Free plan was not stated on the pages checked (**unverified**). SPA fallback would use CloudFront custom error responses mapping 403 and 404 to `/index.html`, and invalidation is included on the Free plan, while invalidation by cache tag needs Pro or above (**unverified** for custom error responses, which were not checked on the plan page). AWS has certified to the EU-U.S. DPF under the Amazon.com, Inc. certification ([AWS DPF](https://aws.amazon.com/compliance/eu-us-data-privacy-framework/)).

### KeyCDN

Europe and North America cost $0.04 per GB for the first 10 TB, with no request fees and free TLS certificates. The "minimum charge is $4 per month" and "the minimum payment is $49" ([pricing](https://www.keycdn.com/pricing)). At $48 per year it uses most of the budget for the same function Bunny provides for $12, so it was not examined further.

### Netlify

The Free plan has 300 credits. A production deploy costs 15 credits, bandwidth 20 credits per GB and web requests 2 credits per 10,000 ([pricing](https://www.netlify.com/pricing/), [billing FAQ](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/)). Once the credits are used up, "all of your web projects (sites/apps) are paused" and visitors see a "Site not available" page. The Free plan cannot buy more credits (same FAQ). 15 GB of bandwidth alone uses all 300 credits, so an active month in the estimate would take the site offline. The Personal plan costs $9 per month for 1,000 credits. Credit-based pricing applies to accounts created from 2025-09-04, and the bandwidth rate has since doubled from the 10 credits per GB at launch ([changelog](https://www.netlify.com/changelog/netlify-pricing-update-introducing-credit-based-plans/)). The DPA is incorporated in Netlify's terms ([GDPR](https://www.netlify.com/gdpr-ccpa/)), but its transfer mechanism was not checked (**unverified**).

### statichost.eu

The Hobby plan is free with 1 site, 10 GB of bandwidth and 100 build minutes. Starter costs €9 per month with 500 GB ([pricing](https://www.statichost.eu/pricing/)). Subdomains use a CNAME to `SITENAME.statichost.page` with automatic certificates ([domains](https://www.statichost.eu/docs/domains/)). A `_redirects` rule `/* /index.html 200` gives an SPA fallback, and rewrites can also proxy to an external URL ([routing](https://www.statichost.eu/docs/routing/)). Sites deploy from git with a Docker build configured in `statichost.yml` ([build configuration](https://www.statichost.eu/docs/build-config/)), so published JSON would have to be committed or proxied to the Scaleway bucket. The operator is in Stockholm and states that all processing stays in the EEA with core systems on its own servers ([privacy](https://www.statichost.eu/privacy/)). The 10 GB limit is below an active month in the estimate, and what happens when it is exceeded was not checked (**unverified**). It fits the SPA build at most.

## Cost comparison

Idle and active month as defined above. Rows using a Scaleway bucket assume a few GB of published files and the SPA, at about €0.05 per month, with cache fills inside the 75 GB of free egress. IGC storage is left out because it is the same in every row.

| Option | Idle month | Active month | Year | DNS zone stays | Main limitation |
| --- | --- | --- | --- | --- | --- |
| Cloudflare R2 Free, zone moved (baseline) | $0 | $0 | $0 | No | DNS moves to Cloudflare |
| Cloudflare Pages with a Function proxying R2 | $0 | $0 | $0 | Yes, subdomain | JSON reads are metered Function requests, no zone purge |
| Scaleway Edge Services Starter and bucket | about €1.04 | about €1.04 | about €12.50 | Yes, subdomain | Paris only, purge limits undocumented |
| Scaleway bucket website alone | about €0.05 | about €0.05 | about €0.60 | No custom domain over HTTPS | `scw.cloud` URL only |
| Bunny pull zone over the Scaleway bucket | $1.05 | $1.05 | about $12.60 | Yes | $1 minimum, SPA fallback depends on origin |
| Bunny Storage (S3 preview) and pull zone | $1 | $1 | $12 | Yes | S3 API in public preview |
| Gcore Free over the Scaleway bucket | about €0.05 | about €0.05 | about €0.60 | Yes | Free terms can change, SPA fallback unverified |
| CloudFront Free flat-rate | $0 | $0 | $0 | Unverified | Not for Free Tier accounts, AWS as second US operator |
| KeyCDN over the Scaleway bucket | $4 | $4 | $48 | Yes | Minimum uses most of the budget |
| Netlify Free | $0 | Site paused above 15 GB | $0 | Yes | Hard pause on credit exhaustion |
| statichost.eu Hobby | €0 | Over the 10 GB limit | €0 | Yes | Git deploys, 10 GB bandwidth |

## Purge and publish latency

| Option | Purge | Limits | Publish visible |
| --- | --- | --- | --- |
| Cloudflare R2 with zone | Single URL, prefix, host, tag or all | 800 URLs per second, 5 other purges per minute on Free, per #33 | Seconds after purge |
| Cloudflare Pages Function over R2 | None without the zone | Not applicable | Next request with short `Cache-Control` |
| Scaleway Edge Services | Object list or all, asynchronous | Not documented | After the purge request completes, time not documented |
| Bunny | URL, pull zone or cache tag | Not documented | After purge, time not documented |
| Gcore | URLs, patterns or all | 2 URL requests per minute with 100 URLs each | After purge, time not documented |
| CloudFront Free | Invalidation by path | Not checked on the plan page | Seconds per the plan page |

A short `Cache-Control` max-age on published JSON works with every option and removes the purge dependency at the cost of that many seconds of staleness.

## Pricing history

| Provider | Change | Date |
| --- | --- | --- |
| Cloudflare R2 and Pages | No reduction found in the sources checked, per #33 | |
| Scaleway Edge Services | Free public beta became billable plans, existing users assigned the cheapest fitting plan | 2024-11-01 |
| Scaleway Object Storage | 750 GB free trial for 90 days for new Multi-AZ users, 75 GB free egress per month | Not dated on the sources checked |
| Bunny | Expiring prepaid balance replaced by a $1 monthly minimum for new accounts | 2019-07-22 |
| Bunny Storage | S3 API announced in 2022, closed preview January 2026, public preview | 2026-07-09 |
| Gcore | Free plan reportedly raised from 100 GB to 1 TB per month (**unverified**) | Not dated |
| AWS CloudFront | Flat-rate plans with a $0 Free plan launched | November 2025 |
| Netlify | Credit-based plans for new accounts, bandwidth later raised from 10 to 20 credits per GB | 2025-09-04 |
| KeyCDN | Not checked | |
| statichost.eu | Not checked | |

## Data residency and transfer mechanism

Published results are public by design, so serving them from a global cache is a publication question for [#14](https://github.com/Turbo87/keyhole/issues/14). The operator matters for request logs and for the files before publication.

| Provider | Operator | Edge and origin locations for Keyhole | Transfer mechanism |
| --- | --- | --- | --- |
| Cloudflare | Cloudflare, Inc., US | Global network, R2 location selectable | DPF with SCCs, per #33 |
| Scaleway | Scaleway SAS, France | Edge Services reported in Paris only, bucket in `fr-par` | EU operator |
| Bunny | BunnyWay d.o.o., Ljubljana, Slovenia ([privacy](https://bunny.net/privacy/)) | 119 global PoPs, storage in Frankfurt, traffic logs stored in the EU ([FAQ](https://bunny.net/faq/)) | EU operator. DPA in the panel and a sub-processor list ([GDPR](https://bunny.net/gdpr/)). Transfers to non-EU PoPs not addressed (**unverified**) |
| Gcore | G-Core Labs S.A., Contern, Luxembourg ([legal](https://gcore.com/legal)) | 210+ global PoPs per its pricing page (search-engine extract), origin at Scaleway | EU operator. SCCs for transfers to third countries without adequacy (MSA §9.5.3) |
| AWS | Amazon Web Services, US | Global edge, S3 region selectable | DPF under the Amazon.com, Inc. certification |
| KeyCDN | Not checked | Not checked | Not checked |
| Netlify | Netlify, Inc., US | Not checked | DPA in terms, mechanism **unverified** |
| statichost.eu | Variable Object Assignment, Stockholm, Sweden | EEA, own servers | EU operator, no third-country transfers stated |

## Exit cost

Keyhole writes through the plain S3 API, so every option that keeps the files in a Scaleway bucket shares the same exit: point the CNAME at a different CDN with the bucket as origin and replace the purge call. That covers Edge Services, Bunny as a pull zone, Gcore, KeyCDN and CloudFront with a Scaleway origin. Bunny Storage through its S3 preview, R2 and S3 move the files too, which is a bucket copy and a change of endpoint and credentials. The Cloudflare Pages Function adds a small Cloudflare-specific proxy to replace. Netlify and statichost.eu tie deployment to their build pipelines and would need the publish path changed. The SPA fallback is configured differently everywhere (bucket error document, Bunny 404 rewrite, Pages convention, `_redirects`), so it is one more setting to recreate on a move. Per-page HTML stubs with an index document make that setting matter only for unknown paths.

## Options for the grilling

These are options with tradeoffs, not a decision.

1. **Scaleway Edge Services Starter.** Published files, HTML stubs and the SPA in one `fr-par` bucket with bucket website enabled, behind one Edge Services pipeline on a subdomain. About €12.50 per year, one EU operator for storage, IGC files and the CDN, and no new vendor. The cost is a Paris-only cache, an undocumented purge rate and completion time, and an SPA fallback that probably returns status 404.
2. **Bunny pull zone over the Scaleway bucket.** About $12 per year with a global network, free TLS over a CNAME, and purge by URL or tag. The files stay on Scaleway, so leaving Bunny is a DNS change. The $1 minimum applies every month, and the SPA fallback depends on the bucket.
3. **Gcore Free over the Scaleway bucket.** €0 for the CDN with an EU operator and a global network. The free terms can change, origin pulls count toward the allowance, and SPA handling needs testing.
4. **Cloudflare Pages with a Function over R2.** €0 and no DNS move, with the SPA on Pages. Every JSON read is a Function request against 100,000 per day, there is no purge, and the public side stays with Cloudflare.
5. **Cloudflare R2 Free with the zone moved.** The #33 baseline at €0 with the best purge API, at the price of moving the DNS zone and concentrating the public side on one US operator.

CloudFront Free is €0 but adds AWS as a second US operator and has an account-eligibility catch. KeyCDN, Netlify Free and statichost.eu Hobby fail on cost or on limits that an active month exceeds.

## Open questions

- Is a subdomain such as `results.example.org` acceptable for public pages? Every option that keeps the DNS zone in place, including Pages, needs a subdomain or a provider-side ALIAS for the apex.
- What status code does a Scaleway bucket website return with its error document, and does Edge Services cache it? A 404 status on SPA routes affects crawlers.
- How fast does a Scaleway Edge Services purge complete, and how many assets does one purge request take? This needs a test before relying on purge after each publish.
- Does Scaleway Object Storage bill egress for Edge Services cache fills, or is it free as the pricing page extract suggests?
- How much traffic does Keyhole really serve? The estimate here is not measured, and Netlify, statichost.eu and CloudFront Free depend on it.
- Is a regional Paris cache fast enough for readers outside Europe, or do competitions abroad need a global network?
- Can the CloudFront Free plan use a non-AWS origin and a domain whose DNS is outside Route 53, and does a new AWS account on the paid account plan qualify?
- Are Gcore's free terms stable enough to rely on for a public service, given that the MSA lets them change?
