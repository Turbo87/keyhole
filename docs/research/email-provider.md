# Transactional email provider for magic links

Research for [#12](https://github.com/Turbo87/keyhole/issues/12). The question is which email provider delivers Keyhole's magic-link login emails reliably, fast, and cheaply, and whether an email-plus-password fallback is needed. Keyhole is run by one person, is used mostly in Germany, and sends tens to a few hundred emails per day in the summer and almost none in the winter. Facts were checked against provider pricing pages, provider documentation, mailbox provider postmaster pages, and the crates.io API on 2026-10-30. Prices exclude VAT.

## Summary

Every candidate can deliver a login email from Rust over plain SMTP, so the choice is about reputation, data residency, and cost rather than integration effort. Postmark has the strongest documented focus on delivery speed, but it hosts data only in the US and costs $15 per month once volume exceeds 100 emails. Scaleway Transactional Email (TEM) keeps all data in France, forbids marketing mail on the whole platform, and costs about €1 to €3 per month at Keyhole's summer volume with no fixed fee. Lettermint is a younger Dutch alternative with separate transactional IP pools, its own ASN, and an official Rust SDK. No primary source publishes inbox placement per ESP for GMX, web.de, or T-Online, so placement has to be measured with seed accounts before launch. The recommendation is Scaleway TEM over SMTP with `lettre`, a seed test against German mailboxes before the first competition, and Postmark or Lettermint as the configured second choice. A password fallback does not look necessary.

## What German mailbox providers require

Login emails are one-to-one transactional mail, so bulk sender rules mostly do not apply. The rules that do apply are met by any reputable ESP once the sending domain is set up correctly.

- **WEB.DE and GMX** (both 1&1) make DKIM mandatory, with the DKIM domain aligned to the `From` domain at least in relaxed mode. SPF alone is not enough. The sending IP needs a PTR record to a proper FQDN, HELO must be a valid FQDN, and the sender must be clearly identifiable ([WEB.DE requirements](https://postmaster.web.de/en/requirements-and-recommendations)). WEB.DE recommends the [Certified Senders Alliance](https://postmaster.web.de/en/csa) (CSA) for newsletter and advertising senders.
- **T-Online** (Telekom) neither checks SPF nor evaluates DKIM outside its "Trusted Dialog" project. It expects forward-confirmed reverse DNS, and the sending hostname must lead to the operator's website with direct contact details. Telekom offers no whitelisting ([T-Online postmaster](https://postmaster.t-online.de/)).
- **Gmail** requires SPF or DKIM, valid forward and reverse DNS, TLS, and a spam rate below 0.3 % for all senders. DMARC, alignment, and one-click unsubscribe are required only above 5,000 messages per day ([Google sender guidelines](https://support.google.com/a/answer/81126)).

**CSA.** GMX, WEB.DE, 1&1, Microsoft, and Yahoo participate in the CSA as mailbox providers. Of the candidates, Mailjet, Brevo (Sendinblue SAS and Sendinblue GmbH), and AhaSend are certified ESPs. Postmark, Amazon SES, Mailgun, Resend, Scaleway, and Lettermint are not listed. T-Online is not a participant ([CSA participants](https://certified-senders.org/participants/)). CSA certification is aimed at commercial bulk mail. It helps at GMX and WEB.DE but is not required for transactional mail that passes authentication.

**Inbox placement data.** No provider publishes placement or delivery-time figures for GMX, WEB.DE, or T-Online. Postmark's speed claims cover AOL, Apple, Gmail, Hotmail, and Yahoo only and are Postmark's own measurements ([Postmark email delivery](https://postmarkapp.com/email-delivery)). Placement at German providers therefore has to be tested directly.

## Candidates

### Postmark

Postmark is a US transactional specialist. It separates transactional and broadcast mail into Message Streams on different IP ranges, assigns customers randomly to shared pools of equal reputation, and reviews every sender before the first email ([Message Streams](https://postmarkapp.com/blog/postmark-message-streams-how-it-started-how-its-going), [Email delivery](https://postmarkapp.com/email-delivery)). It markets itself on Time-to-Inbox and says it monitors delays by the second. The free developer plan allows 100 emails per month with no overage. Basic costs $15 per month for 10,000 emails, and dedicated IPs ($50 per month) are meant for senders above 300,000 per month ([pricing](https://postmarkapp.com/pricing)). Data is hosted at Deft near Chicago and on AWS, and Postmark states it has no plans for EU servers. GDPR transfers rely on a DPA with Standard Contractual Clauses that is part of the terms of service ([EU privacy](https://postmarkapp.com/eu-privacy)).

### Amazon SES

SES is the cheapest at scale. New accounts start on the Essentials plan from July 21, 2026, at $0.16 per 1,000 emails with no fixed fee, and à la carte pricing at $0.10 per 1,000 remains available. Dedicated IPs cost $24.95 per IP per month ([pricing](https://aws.amazon.com/ses/pricing/)). SES runs in Frankfurt (`eu-central-1`) with API and SMTP endpoints ([endpoints](https://docs.aws.amazon.com/general/latest/gr/ses.html)). Every new account starts in a per-region sandbox limited to verified recipients, 200 messages per day, and 1 message per second, and the production access review takes up to 96 hours ([production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)). Shared SES IPs carry traffic from a very large and mixed customer base. Bounce and complaint handling also needs SNS or event destinations, which is more setup than the other candidates require for one person.

### Resend

Resend offers 3,000 emails per month for free, capped at 100 per day. Pro costs $20 per month for 50,000 emails, and dedicated IPs are only available on the Scale plan above 3,000 emails per day ([pricing](https://resend.com/pricing)). Mail can be sent from Ireland (`eu-west-1`), but account data, metadata, and logs are always stored in the US ([regions](https://resend.com/docs/dashboard/domains/regions)). Postmark states that Resend runs on Amazon SES ([Postmark comparison](https://postmarkapp.com/compare/resend-alternative)). That is a competitor's claim and was not confirmed on Resend's own pages. The free daily cap of 100 is too low for a competition morning.

### Mailgun

Mailgun's free plan allows 100 emails per day with one day of log retention. Basic costs $15 per month for 10,000 emails. Dedicated IPs start with the Foundation 100k plan at $59 per extra IP. Mailgun offers US and EU regions from one account ([pricing](https://www.mailgun.com/pricing/)). It is not CSA certified and offers nothing over Postmark for this volume.

### Brevo

Brevo is a French marketing platform with a transactional API and SMTP relay. The free plan allows 300 emails per day and adds Brevo branding. Starter costs $9 per month from 5,000 emails ([pricing](https://www.brevo.com/pricing/)). Data is stored in the EU on OVH in France and Google Cloud in Belgium ([data storage](https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location)), and the DPA is part of the terms of service ([DPA](https://help.brevo.com/hc/en-us/articles/15403782599570-Where-can-I-find-the-Data-Processing-Agreement-DPA)). Brevo is CSA certified. Its pricing page does not say whether transactional mail uses separate IP pools from marketing campaigns, and the free plan branding is unsuitable for login emails.

### Mailjet

Mailjet (Sinch) offers 6,000 emails per month for free, capped at 200 per day. Essential costs $19 per month for 15,000 emails, and only Essential removes the Mailjet logo. A dedicated IP is available from the 100k plan ([pricing](https://www.mailjet.com/pricing/)). Data is hosted on Google Cloud in Frankfurt and Saint-Ghislain, Belgium, and a DPA is available through Sinch ([security and privacy](https://www.mailjet.com/security-privacy/)). Mailjet is CSA certified. Like Brevo, it is a marketing-first platform.

### Scaleway Transactional Email

Scaleway TEM runs only in Paris (`fr-par`). Content, metadata, logs, webhooks, and backups stay in France, no TEM-specific subprocessor is used, and Scaleway states it is not subject to the US CLOUD Act. Email bodies are deleted once the recipient server accepts them. TEM does not add tracking pixels or rewrite links ([data privacy](https://github.com/scaleway/docs-content/blob/main/pages/transactional-email/reference-content/data-privacy.mdx)). The platform forbids marketing mail entirely ([FAQ](https://github.com/scaleway/docs-content/blob/main/pages/transactional-email/faq.mdx)), so its shared IPs carry only transactional traffic. The Essential plan is pay-as-you-go on shared IPs with 300 free emails per month and then €0.25 per 1,000. The Scale plan costs €80 per month, includes 100,000 emails, a managed dedicated IPv4 and IPv6 address, a 99.9 % SLA, and a 30-day commitment for IP warm-up ([plans](https://github.com/scaleway/docs-content/blob/main/pages/transactional-email/how-to/manage-tem-plans.mdx), [pricing](https://www.scaleway.com/en/pricing/managed-services/)). The default quota is 10,000 emails per month, raised on request after payment and identity validation, with no hourly quota since December 2023 ([capabilities and limits](https://github.com/scaleway/docs-content/blob/main/pages/transactional-email/reference-content/tem-capabilities-and-limits.mdx)). Both SMTP and an HTTP API are available. Scaleway's pricing page blocked automated fetching, so the plan prices come from search snippets of that page and should be confirmed in the console.

### Lettermint

Lettermint B.V. is a Dutch ESP that processes and stores email data only in the EU on every plan. It is ISO/IEC 27001:2022 certified, publishes a DPA and subprocessor list, and sends from its own IP ranges (AS213427) instead of a hyperscaler ([Postmark comparison page](https://lettermint.co/compare/postmark-alternative)). Each project gets separate transactional and broadcast routes on separate IP pools ([SaaS page](https://lettermint.co/for/saas)). The free plan allows 300 emails per month. Starter costs €10 per month for 10,000 emails, and dedicated IPs (€50 per month) start at 300,000 emails per month. SMTP relay and the REST API are on every plan ([pricing](https://lettermint.co/pricing)). All of these claims come from Lettermint's own pages. Lettermint is not CSA certified, and its track record is shorter than Postmark's or Scaleway's.

### AhaSend

AhaSend B.V. (Amsterdam) runs its own servers in Germany and Finland, is CSA certified, and offers SMTP and a REST API. The free plan includes 1,000 emails per month, and Pro includes 25,000 ([pricing](https://ahasend.com/pricing)). The page renders prices client-side, so the Pro price and overage rates could not be read. AhaSend is worth including in the seed test because it is the only EU-hosted, transactional-focused, CSA-certified candidate.

## Sending from Rust

All candidates accept SMTP submission, so one integration through [`lettre`](https://crates.io/crates/lettre) 0.11.23 (MIT, 22M downloads) covers every provider. Its `tokio1-rustls-tls` feature gives async SMTP over rustls on top of the default `builder`, `smtp-transport`, and `pool` features ([features](https://docs.rs/crate/lettre/latest/features)). Switching providers then means changing host, port, and credentials, which also makes a second provider cheap to keep configured.

Provider HTTP APIs add delivery IDs, tags, and webhooks for bounces, but need a provider-specific client:

| Provider | Crate | Version | Maintainer |
| --- | --- | --- | --- |
| Amazon SES | [`aws-sdk-sesv2`](https://crates.io/crates/aws-sdk-sesv2) | 1.144.0 | AWS, official |
| Resend | [`resend-rs`](https://crates.io/crates/resend-rs) | 0.35.0 | Resend, official |
| Lettermint | [`lettermint`](https://crates.io/crates/lettermint) | 2.3.0 | Lettermint, official, created March 2026 |
| Postmark | [`postmark`](https://crates.io/crates/postmark) | 2.0.1 | Community |
| Mailjet | [`mailjet-rs`](https://crates.io/crates/mailjet-rs) | 0.3.4 | Community |
| Brevo | [`brevo`](https://crates.io/crates/brevo) | 1.0.0 | Community, last release March 2025 |
| Scaleway TEM | none dedicated | | A small `reqwest` call to the TEM REST API |

For magic links, SMTP is enough. A bounce webhook is useful later to show "this address bounced" in the UI, but it is not needed for launch.

## Cost at Keyhole's volume

Assuming about 5,000 emails in a busy summer month, peaks of a few hundred per day, and near zero in winter:

| Provider | Summer month | Winter month | Daily cap on cheapest fitting plan | EU data residency |
| --- | --- | --- | --- | --- |
| Scaleway TEM Essential | about €1.20 | €0 | none (10,000 per month default quota) | Yes, France only |
| Amazon SES Essentials | about $0.80 | $0 | none after sandbox | Region in EU, US company |
| Lettermint Starter | €10 | €0 on Free (300 per month) | none | Yes |
| Brevo Starter | $9 | $0 on Free (300 per day, branded) | not stated | Yes |
| Postmark Basic | $15 | $0 on Free (100 per month) | none | No, US only |
| Mailgun Basic | $15 | $0 on Free (100 per day) | none | Yes, EU region |
| Mailjet Free | $0 | $0 | 200 per day, logo removal only on Essential | Yes |
| Resend Free | $0 | $0 | 100 per day | No, data in US |

Free tiers with daily caps of 100 or 200 are risky, because a competition morning concentrates logins and a hit cap blocks scorers exactly when they need access.

## Recommendation

Use **Scaleway TEM** on the Essential plan, sending over SMTP with `lettre`. It is the only candidate that combines full EU data residency with a European operator, a transactional-only shared IP pool, no fixed monthly cost, and negligible usage cost. Keep the SMTP settings provider neutral so that **Postmark** (best documented delivery speed, US hosting) or **Lettermint** (EU hosting, separate transactional pools, official Rust SDK) can replace it with a configuration change.

Before the first competition, run a seed test. Send magic links through Scaleway, Postmark's free plan, and one CSA-certified EU option such as AhaSend to test accounts at GMX, WEB.DE, T-Online, Gmail, and Outlook. Record time to inbox and folder placement. Pick the provider that lands in the inbox within a few seconds at GMX, WEB.DE, and T-Online. Independently of the provider, publish SPF, an aligned DKIM key, and a DMARC record, and put the operator's contact details on the website of the sending domain to satisfy T-Online.

**Password fallback.** An email-plus-password fallback does not look necessary. Every candidate meets the German mailbox requirements, and a password still needs email for sign-up and reset, so it does not remove the email dependency. The briefing risk is better reduced by long-lived sessions that cover a whole competition, a short one-time code in the same email so a scorer can log in on a device where the link opens in the wrong browser, and an early login before the first briefing. If the seed test shows consistent delays or spam placement at a major German provider with every candidate, the fallback question should be reopened.

## Open questions

- Which provider wins the seed test at GMX, WEB.DE, and T-Online, measured in time to inbox and folder placement?
- Is US hosting with Standard Contractual Clauses acceptable to Keyhole's users and clubs, or is EU-only processing a hard requirement? This decides whether Postmark stays a viable second choice.
- How long should sessions last, and should the login email carry a one-time code in addition to the link?
- Should Keyhole process bounce webhooks to flag unreachable addresses, or is SMTP submission enough?
