# Legal documents, terms and attributions for launch

Research for [#52](https://github.com/Turbo87/keyhole/issues/52). The question is which legal documents, terms and attributions Keyhole needs before launch. [#14](https://github.com/Turbo87/keyhole/issues/14) found that Keyhole is a controller for publication rather than the organisers' processor and left open whether that is joint or independent controllership ([findings](https://github.com/Turbo87/keyhole/blob/research/gdpr/docs/research/gdpr.md)). [#7](https://github.com/Turbo87/keyhole/issues/7) removed the organiser entity, so a competition has admins and scorers but no recorded organiser, every new competition waits for approval by the Keyhole team, and pilots upload IGC files themselves with a daily password. [#10](https://github.com/Turbo87/keyhole/issues/10) ruled out revenue. [#37](https://github.com/Turbo87/keyhole/issues/37) reads Mapterhorn elevation tiles into memory for AGL airspace checks and never displays them, and [#22](https://github.com/Turbo87/keyhole/issues/22) ships IGC handicap lists converted by hand as data files in the repository.

Facts were checked on 2026-11-01 against the GDPR, EDPB Guidelines 07/2020, the DDG, the MStV, the BGB and UrhG, the licence texts of Mapterhorn's sources, Mapterhorn's `attribution.json` and issue tracker, and the FAI copyright notice in the IGC handicap document. EUR-Lex blocked automated requests, so GDPR article texts were read from the [gdpr-info.eu](https://gdpr-info.eu/) mirror and are linked to EUR-Lex below. Statements marked **Interpretation** are the author's reading of those sources and not verified fact. None of this is legal advice, and the last section lists where a lawyer's judgement is needed.

## Summary

The facts point to joint controllership with the organiser for scoring and publishing a competition's results while it runs, and to Keyhole as sole controller for anything it alone decides afterwards, such as keeping the public archive. The organiser chooses Keyhole to score and publish its own competition, and Keyhole fixes the essential means for every competition. Both decisions are needed for the processing to happen, which is the EDPB's test for converging decisions. Keyhole's terms should therefore contain an Article 26 arrangement that the person creating a competition accepts on behalf of the organiser. That arrangement needs a counterparty, and Keyhole currently records none because #7 dropped the organiser entity. The competition creation form should at least capture the organising club or person and a confirmation that the admin may act for them.

Before launch Keyhole needs terms of use with the joint controller arrangement, a privacy policy that covers Articles 13 and 14 and publishes the essence of the arrangement, a short pilot notice that organisers put in their entry documents, an Impressum, and a data sources page. § 18(1) MStV requires name and address for every telemedia service that is not purely personal or family, regardless of revenue. Whether § 5 DDG also applies to a free service depends on whether it counts as "in der Regel gegen Entgelt angeboten", and complying with it costs only an email address.

Elevation attribution depends on each licence's trigger. CC BY 4.0 and the Copernicus GLO-30 licence attach attribution to sharing or communicating the data to the public, which Keyhole does not do. Datenlizenz Deutschland Namensnennung 2.0, used by 9 German state sources including Baden-Württemberg, Sachsen and Thüringen, requires the source note "bei der Nutzung", and the French Licence Ouverte attaches it to any reuse, including inclusion in an application. Keyhole therefore needs attribution anyway, and Mapterhorn's maintainer said a link to Mapterhorn's attribution page on a product source page is enough. A public data sources page listing Mapterhorn, the link, the dl-de/by-2-0 and Licence Ouverte sources and the Copernicus notices covers every licence at no cost.

The FAI copyright notice on the IGC handicap document authorises copying only for persons acting on behalf of the FAI or one of its members, for information only and not for commercial purposes. It grants Keyhole nothing. Whether a list of glider types and numbers is protected at all is doubtful under German law, but that is a lawyer's question, and written permission from the IGC is cheaper than an opinion. Until permission arrives, Keyhole can ship DAeC lists, for which the maintainer supplies the data, and let scorers enter IGC values by hand.

## Controller roles with organisers

### What the law says

A controller determines "the purposes and means of the processing" alone or jointly with others ([Article 4(7)](https://eur-lex.europa.eu/eli/reg/2016/679/oj)). Where two or more controllers jointly determine purposes and means, they are joint controllers and must determine their respective responsibilities "by means of an arrangement between them", in particular for data subject rights and for the information under Articles 13 and 14. The arrangement may designate a contact point, must reflect the parties' roles towards data subjects, and its essence must be made available to them. Data subjects can exercise their rights against each controller regardless of the arrangement ([Article 26](https://gdpr-info.eu/art-26-gdpr/)). A processor acts on behalf of a controller under a contract that covers the items in [Article 28(3)](https://gdpr-info.eu/art-28-gdpr/).

EDPB Guidelines 07/2020 ([final version](https://www.edpb.europa.eu/system/files/documents/2023-10/EDPB_guidelines_202007_controllerprocessor_final_en.pdf)) apply this as follows:

- Joint participation can result from "converging decisions" that complement each other and are necessary for the processing, so that the processing "would not be possible without both parties' participation" (paras. 54 and 55).
- Control is assessed per operation. An entity that alone decides purposes and means of operations earlier or later in the chain is the sole controller of those operations (para. 57, citing Fashion ID C-40/17).
- Purposes need not be identical. Closely linked or complementary purposes can be enough, but a mere commercial benefit is not, and an entity with no purpose of its own that is merely paid for a service is a processor (paras. 60 to 62).
- When one party provides a platform that others choose to use for their own purposes, that choice "will likely amount to a joint decision on the means" (paras. 64 to 67). The platform provider is a joint controller only if it takes part in determining purposes and means, and a processor otherwise (footnote 29).
- A shared system does not create joint control where each party's processing is separable, or where actors in a chain have independent purposes and means. These are separate or successive independent controllers (paras. 68 to 72).
- The arrangement can take any form, but the EDPB recommends a binding document in clear language that states subject matter, purpose, data types and data subjects, allocates who informs data subjects and who answers requests, and covers legal basis, security, breaches, processors and transfers (paras. 161 to 175). The published essence should cover at least the Article 13 and 14 information and say which party is responsible for each element and who the contact point is (paras. 179 and 180).

### Applied to Keyhole

**Interpretation:** The processing splits into three operations.

1. **Scoring a competition.** The organiser decides to hold the competition, which pilots take part and which data scorers enter. Keyhole decides which data a competition holds, that IGC files are kept, that analysis runs, and who at Keyhole can access every competition. Pilots upload their IGC files directly to Keyhole. Neither side alone makes the processing happen, which fits converging decisions under paras. 54 and 55. A processor model would need Keyhole to act only on the organiser's instructions and to leave retention and access to the organiser, which contradicts the product.
2. **Publishing results while the competition runs.** Publishing results and handicaps is a purpose the organiser has under its own sporting rules (SWO 4.8, Annex A 8.2.4b, see #22), and Keyhole decides that every approved competition is public and what the pages show. The purposes are common, and the means are decided by both. This is the clearest case of joint control.
3. **Keeping the public archive after the competition.** Once the competition is archived (#34), Keyhole alone decides how long results and IGC files stay online and in which form. Under para. 57 Keyhole is most plausibly the sole controller for this later operation, with the legal basis discussed in #14 and retention decided in [#50](https://github.com/Turbo87/keyhole/issues/50).

Admin and scorer accounts, login emails and server logs are Keyhole's alone. Keyhole's approval of each competition by the Keyhole team and its staff access to every competition strengthen the case that Keyhole is a controller and not a processor.

**Interpretation:** Treating Keyhole as an independent controller from the start, with the organiser handing pilot data over, is the other defensible reading under paras. 70 and 72. It avoids the Article 26 arrangement but makes Keyhole solely responsible for informing every pilot and for the legal basis of everything, and it fits less well with organisers who choose Keyhole specifically to publish their own results. Joint control with a clear allocation puts the duty to inform pilots on the party that is in contact with them, which para. 178 suggests.

### What organisers should accept at creation

**Interpretation:** The terms accepted when a competition is created should contain, as a joint controller arrangement for operations 1 and 2:

- The subject matter and purposes (scoring and publishing the competition), the categories of pilot data (name, club, nationality if entered, glider type and registration, competition number, handicap, IGC files with logger serial number, penalties and scores), and the data subjects (pilots and crews).
- The organiser's duties. It has a legal basis for passing pilot data to Keyhole, enters only data needed for the competition, informs pilots before the competition with the notice Keyhole provides (for example in the entry form or local procedures), and forwards data subject requests it receives.
- Keyhole's duties. It is the contact point for data subject requests, publishes the privacy policy and the essence of the arrangement, secures the system, keeps its own processors under Article 28 agreements, and leads breach notification.
- That Keyhole alone decides on the archive after the competition and is sole controller for it.
- Who the organiser is. Because #7 has no organiser entity, the creation form should record the organising club or person and a confirmation by the admin that they may act for it. Without that, the arrangement's counterparty is the admin as a private person.

The terms are standard business terms under [§ 305(2) BGB](https://www.gesetze-im-internet.de/bgb/__305.html), so the admin must be pointed to them expressly and be able to read them, for example with a checkbox and link at creation. [§ 309 Nr. 7 BGB](https://www.gesetze-im-internet.de/bgb/__309.html) forbids excluding liability for injury to life, body or health caused by negligence, and for other damage caused by gross negligence, so any liability clause in the terms has to leave those intact. How far liability for a free service can be limited beyond that is a question for a lawyer.

## Privacy policy

[Article 13](https://gdpr-info.eu/art-13-gdpr/) applies where Keyhole collects data from the person: admin and scorer accounts, login emails, server logs, and IGC files that pilots upload with the daily password. [Article 14](https://gdpr-info.eu/art-14-gdpr/) applies to data Keyhole receives from organisers and scorers: pilot names, clubs, gliders and files uploaded on a pilot's behalf. Together they require:

- Identity and contact details of the controller, here Keyhole's operator, and the essence of the Article 26 arrangement with organisers.
- Purposes and legal basis for each processing, and the legitimate interests pursued where Article 6(1)(f) is the basis.
- Categories of personal data (Article 14 only) and their source, including whether they came from publicly accessible sources.
- Recipients, which includes the public for published results, and every processor with its transfer basis (adequacy decision or SCCs, see #14).
- Storage periods per data type, or the criteria for them, as decided in #50.
- The rights to access, rectification, erasure, restriction, objection and portability, the right to complain to a supervisory authority, and whether providing the data is required. The right to object must be presented clearly and separately from other information ([Article 21(4)](https://gdpr-info.eu/art-21-gdpr/)).
- No automated decision-making within Article 22, unless scoring is judged to be one. **Interpretation:** scores are reviewed and released by a scorer, so Article 22 should not apply.

Under Article 14(3) the information is due within one month, or when data are first disclosed. Keyhole has no contact details for pilots, so the information has to be made publicly available under Article 14(5)(b), as #14 found. **Interpretation:** a public privacy policy, a link to it on every upload page and public competition page, and the organiser's pilot notice together cover Articles 13 and 14. The upload page is where Article 13 information is due at collection.

## Impressum

[§ 5(1) DDG](https://www.gesetze-im-internet.de/ddg/__5.html) applies to "geschäftsmäßige, in der Regel gegen Entgelt angebotene digitale Dienste" and requires, easily recognisable, directly reachable and permanently available:

- Name and the address at which the provider is established.
- Details that allow fast electronic contact and direct communication, including an email address.
- Register entries, supervisory authority, professional rules and VAT or economic identification numbers, where any of these exist. For a private individual without a business none of them apply.

[§ 18(1) MStV](https://www.die-medienanstalten.de/fileadmin/user_upload/Rechtsgrundlagen/Gesetze_Staatsvertraege/Medienstaatsvertrag_MStV.pdf) (version in force since 1 December 2025) applies to every telemedia provider whose service does not serve "ausschließlich persönlichen oder familiären Zwecken" and requires name and address, easily recognisable, directly reachable and permanently available. § 18(2) adds a responsible person for journalistic-editorial services.

**Interpretation:** A public results service for clubs and pilots is not personal or family, so § 18(1) MStV applies even without revenue. Results pages are generated data and not journalistic-editorial content, so § 18(2) should not apply. Whether § 5 DDG applies to a free service is less clear, because the wording refers to services usually offered for payment. Showing an email address costs nothing and is needed in the privacy policy anyway, so the Impressum should simply meet § 5 DDG. It then contains the operator's name, a postal address, and an email address. Whether a c/o address or address service satisfies "Anschrift" instead of a home address remains a question for a lawyer, as #14 noted.

## Elevation data attribution

Mapterhorn's code is BSD-3, and its terrain data come from "various open-data sources" listed on its [attribution page](https://mapterhorn.com/attribution/) and in [`attribution.json`](https://download.mapterhorn.com/attribution.json) ([README](https://github.com/mapterhorn/mapterhorn#license)). On 2026-11-01 `attribution.json` listed 151 sources. Asked about caching and relaying tiles, the maintainer wrote that "https://mapterhorn.com/attribution/ shown on the map or product source page should be enough", and later that tiles may be stored and redistributed indefinitely "just make sure that you attribute the original sources if they require it", naming swissALTI3D as one that does ([mapterhorn#317](https://github.com/mapterhorn/mapterhorn/issues/317#issuecomment-5643720718), [comment](https://github.com/mapterhorn/mapterhorn/issues/317#issuecomment-5659532519)).

Whether a licence requires attribution for analysis-only use depends on what triggers the obligation:

| Licence | Sources relevant to Keyhole | Trigger | Required for analysis only |
| --- | --- | --- | --- |
| [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.en) | Bavaria, Lower Saxony, Mecklenburg-Vorpommern, Schleswig-Holstein, Bremen, Austria (BEV and states), Czechia, Slovakia, Slovenia, Denmark, Italy, others (about 60) | "If You Share the Licensed Material", where Share means providing material to the public (Section 3(a), Section 1(i)). The database clause also attaches conditions only to sharing (Section 4(c)). | No |
| [Copernicus GLO-30](https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf) | Global fallback | Article 6(a) and (c) apply "when communicating to the General Public or distributing". Article 6(b) requires a "produced using Copernicus WorldDEM-30" notice "where the data have been adapted or modified" without naming a trigger. | Unclear |
| [Datenlizenz Deutschland Namensnennung 2.0](https://www.govdata.de/dl-de/by-2-0) | Baden-Württemberg (2 sources), Brandenburg, Hamburg, Rheinland-Pfalz, Saarland, Sachsen, Sachsen-Anhalt, Thüringen | "Bei der Nutzung ist sicherzustellen, dass folgende Angaben als Quellenvermerk enthalten sind": the provider's designation, the licence with a link, and the dataset URI, as far as the provider supplies them. Changes must be marked as such. | Yes |
| [Licence Ouverte 2.0](https://www.etalab.gouv.fr/wp-content/uploads/2018/11/open-licence.pdf) | France (IGN, 21 sources) | Reuse, defined as any use for purposes other than the original, explicitly including use in one's own product or application, is subject to acknowledging the source and the date of its last update. | Yes |
| [swisstopo OGD](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices) | swissALTI3D | Source reference is mandatory "in the case of digital or analogue representations and publications" and of dissemination. | Unclear, likely no |
| CC0, Datenlizenz Deutschland Zero, US public domain | Berlin, Hessen, NRW, Bozen, Zürich, Luxembourg, Sweden | None | No |

**Interpretation:** Keyhole uses dl-de/by-2-0 and Licence Ouverte data in its application whenever a flight crosses those regions, so it needs a source note even though it never shows a tile. Neither licence says where the note must appear, and Mapterhorn's maintainer considers a product source page enough. A public "Data sources" page linked from the footer of every page should therefore contain:

- "Elevation data: Mapterhorn" with a link to https://mapterhorn.com/attribution/.
- The full list generated from `attribution.json` at build time: producer, licence name with link, and dataset URL for every source. This meets dl-de/by-2-0 item by item, gives the French sources their acknowledgement, and covers swisstopo and CC BY should a later feature start displaying elevation.
- A statement that the data were resampled and converted by Mapterhorn and sampled by Keyhole, which marks the changes dl-de/by-2-0 requires.
- The two Copernicus sentences: "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" and "The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30".

`attribution.json` does not record the "date of the most recent update" that Licence Ouverte asks for, only an `access_year`. Showing the access year and the Mapterhorn release recorded with each analysis (#37) is the closest available substitute.

**Interpretation:** If a public page ever shows elevation values derived from tiles, such as AGL heights in an airspace penalty, that could count as sharing under CC BY. The same page then already provides the attribution, so no further work is needed.

## Bundling IGC handicap lists

The IGC lists are appendices to [IGC Procedures for Handicapped Classes](https://www.fai.org/sites/default/files/sc3ah_2024a.pdf), valid from 1 October 2024. Its copyright notice reads in part: "All rights reserved. Copyright in this document is owned by the Fédération Aéronautique Internationale (FAI). Any person acting on behalf of the FAI or one of its Members is hereby authorised to copy, print, and distribute this document", subject to the conditions that "The document may be used for information only and may not be exploited for commercial purposes" and that any copy or portion "must include this copyright notice". The introduction says the document "may be republished at any time", meaning new versions by the IGC, and names an "IGC Handicap Committee (sub-committe of Annex A)" that evaluates modifications. The following section claims FAI rights in data and scoring software used at FAI International Sporting Events, which applies to events registered as such and not to national or regional competitions.

German law protects a database whose obtaining, verification or presentation required a substantial investment, and gives its maker exclusive rights over the whole or a substantial part ([§ 87a](https://www.gesetze-im-internet.de/urhg/__87a.html) and [§ 87b UrhG](https://www.gesetze-im-internet.de/urhg/__87b.html)). The Court of Justice held that investment in creating the data themselves does not count, only investment in obtaining existing data ([British Horseracing Board, C-203/02](https://curia.europa.eu/juris/liste.jsf?num=C-203/02)).

**Interpretation:** The notice grants a licence only to persons acting for the FAI or a member such as the DAeC, so Keyhole cannot rely on it. Keyhole is not commercial without revenue, but that removes only one condition of a licence it does not have. Whether a few hundred glider types with handicaps and reference masses are a copyright work or a protected database is doubtful, since the IGC creates the values rather than collecting them. That question needs a lawyer, and permission is simpler. The practical path is to ask the IGC Handicap Committee, through the IGC secretariat or the DAeC's IGC delegate, for written permission to ship converted lists with the copyright notice and a link to the source document, and to ship them only once it arrives. Without permission, scorers enter Club and two-seater handicaps by hand as #22 already allows. The DAeC lists come from their maintainer, which #22 records, and the terms of that supply should be confirmed in writing too. Their copyright terms were not checked.

## Launch checklist

**Interpretation:** Derived from the sections above.

- Terms of use accepted at competition creation, with the Article 26 arrangement, a recorded organiser and admin authority, and liability terms that respect § 309 Nr. 7 BGB.
- A privacy policy covering Articles 13, 14 and 21(4) and the essence of the arrangement, linked from upload pages and public pages.
- A pilot notice text that organisers add to their entry documents.
- An Impressum with name, postal address and email.
- A data sources page generated from `attribution.json` with the Copernicus notices.
- Written permission from the IGC before shipping converted IGC handicap lists.
- From #14: a record of processing activities and Article 28 agreements with Fly.io, Cloudflare and the email provider.

## Not covered

Licence notices for open source dependencies bundled into the SPA and the backend, and the licence of airspace files that scorers load, are outside this ticket. The flight map is out of the MVP (#6), so no base map attribution is needed yet.

## Where a lawyer is needed

- Confirming joint controllership for scoring and publication with sole control for the archive, against independent controllership from the start, and drafting the Article 26 arrangement and terms.
- Whether § 5 DDG applies to a free service and whether a c/o address satisfies § 5 DDG and § 18 MStV.
- How far liability for a free service can be limited in the terms.
- Whether Copernicus Article 6(b) applies to analysis-only use.
- Whether the IGC handicap lists are protected under copyright or §§ 87a ff. UrhG, if the IGC does not answer.
- Reviewing the privacy policy, pilot notice and Impressum before launch, as #14 already recommended.
