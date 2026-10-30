# Feature inventory: scoring\*StrePla and SeeYou Competition with SoaringSpot

Research for ticket #5, collected 2026-10-30. It lists the features that scoring\*StrePla and SeeYou Competition with SoaringSpot offered to scorers, organisers, pilots and the public, as input for the MVP feature cut.

## Sources

scoring\*StrePla shut down on 31 December 2021 and its domain now serves unrelated content ([farewell notice][sp-farewell]). Every StrePla source below is an Internet Archive capture of the original strepla.de page.

| Short name | Document | Edition | URL |
|---|---|---|---|
| M16 | scoring\*StrePla scorer manual "Handbuch scoring\*StrePla", German, 63 pages | Version 3.01, April 2016 | [Wayback 2016-08-13][sp-m16] |
| About | About page with the changelog from 2010 to 2019 | Capture 2021-09-28 | [Wayback][sp-about] |
| Order | Competition order form | Capture 2019-12-18 | [Wayback][sp-order] |
| SP public | Public pages: home, competition overview, daily and overall results, competitors, downloads, task sheet, task download, flight map, IGC view, pilot upload, mobile app | Captures 2019 to 2021 | See the reference list at the end |
| Aalen 2009 | Experience report by the chief scorer of the 2009 German championships in Aalen | 2009 | [Wayback][sp-aalen] |
| SP product | Product page with highlights and price | Capture 2019-06-02 | [Wayback][sp-product] |
| strepla-api, ogn-web-viewer | Third-party clients of the public pages and JSON endpoints | 2017 to 2020 | [strepla-api][strepla-api], [ogn-web-viewer][ogn-web-viewer] |
| SYC help | "SeeYou Competition Help" (desktop module manual) | 2012-02-01 | [PDF][syc-help] |
| Naviter KB | Naviter knowledge base, Soaring Spot category | Pages updated up to 2026 | [kb.naviter.com][kb-cat] |
| SeeYou changelog | SeeYou for PC change log | Up to v10.78 | [naviter.com][changelog] |
| SS API | Soaring Spot public API documentation | Capture 2024-05-22 (live page returned HTTP 522) | [Wayback][ss-api] |
| Scripts | naviter/seeyou_competition_scripts README | Current `main` | [GitHub][scripts] |
| SS public | Public Soaring Spot pages of the German Women's Championship 2024 and the home page | Fetched 2026-10-30 | See the reference list at the end |

## Verification notes

- The StrePla manual describes the scorer back office mostly through screenshots. Field lists for the master data tabs (Wertung I, II, III, Einheiten, Layout, Sonstiges) were transcribed from those screenshots, not from body text.
- StrePla features added after April 2016 come from the About changelog only (copilot 2017, FLARM ID, pre-start height, designated start interval and result signatures 2018, IGC Ranking List and event-marker start 2019).
- The StrePla JSON API was never documented. Its endpoints are known only from third-party client code and the archived mobile and map JavaScript. The task file download is the only endpoint with an archived response.
- The SeeYou Competition help PDF is from 2012 and predates Soaring Spot 2 (SeeYou 7.0, 2015). Current behaviour was cross-checked against the Naviter KB and changelog where possible. The KB articles are short and often do not describe options in detail.
- The Soaring Spot API documentation lists only read endpoints plus one flight upload endpoint. Results, tasks and pilots are written by SeeYou through a separate, undocumented channel.
- Pricing for SeeYou Competition is "free temporary license" for organisers in exchange for a banner on the contest site ([product page][syc-product], [SYC help][syc-help] 1.3). No per-competitor fee was found.

## Legend

**Product:** `StrePla` means scoring\*StrePla (the hosted scorer back office and its public site). `SeeYou` means SeeYou Competition (the desktop module in SeeYou for PC) together with Soaring Spot (the hosted publication site). `Both` means both offered an equivalent feature, even if the mechanism differs.

**Audience:** `scorer` runs the daily scoring. `organiser` sets up and runs the event. `pilot` is a competitor. `public` is anyone viewing results.

## Competition setup

| ID | Feature | Product | Audience | Description | Source |
|---|---|---|---|---|---|
| SET-1 | Hosted competition creation | Both | organiser | StrePla created the competition after an order and sent credentials for the organiser to finish setup. Soaring Spot lets organisers create competitions themselves with a wizard in the admin area | [M16][sp-m16] 2.1, [Order][sp-order], [KB create][kb-create] |
| SET-2 | Online-only scoring | StrePla | scorer | Scoring ran directly on the central web server. A local installation was not possible | [M16][sp-m16] 2.1, 2.2 |
| SET-3 | Desktop scoring with web publication | SeeYou | scorer | Scoring runs in the SeeYou for PC desktop module and data is published to Soaring Spot | [SYC help][syc-help] 1.1, 1.2 |
| SET-4 | Competition master data | Both | organiser | Name, location, training and scoring period, contact data and description. Soaring Spot has title, short title, dates, location, country, UTC offset and permalink | [M16][sp-m16] 5.5.1, [SYC help][syc-help] 2.7, [KB name][kb-name] |
| SET-5 | Public visibility flag | StrePla | organiser | "Wettbewerb öffentlich" controls whether the competition and its results are visible to everyone | [M16][sp-m16] 5.5.1 |
| SET-6 | Classes | Both | organiser | Any number of classes per competition. StrePla recommends class names of at most 5 characters because of printouts. Soaring Spot classes have an editable permalink and a class type enum (club, standard, 15 m, 18 m, open, double seater and others) | [M16][sp-m16] 5.1, [KB classes][kb-classes], [SS API][ss-api] |
| SET-7 | Copilot flag per class | StrePla | organiser | A class can allow a second pilot, overridable per day, printed on all lists | [About][sp-about] Apr 2017 |
| SET-8 | Time system | Both | scorer | Local time or UTC with an offset. SeeYou overrides the UTC offset stored in IGC files | [M16][sp-m16] 5.5.2, [SYC help][syc-help] 8.1.9.1 |
| SET-9 | Airfield reference data | Both | scorer | Airfield reference point and take-off elevation used for altitude calibration | [M16][sp-m16] 5.5.2, [SYC help][syc-help] 8.1.9.1 |
| SET-10 | Airfield boundary and engine restart zone polygon | StrePla | scorer | Polygon editor for the airfield and the zone where motorgliders may restart. Editing was removed in 2017 | [M16][sp-m16] 5.5.2.1, [About][sp-about] Apr 2017 |
| SET-11 | Turnpoint database | Both | organiser | StrePla imports StrePla XML exported from desktop StrePla. Soaring Spot accepts one waypoint file per competition | [M16][sp-m16] 5.3, [KB files][kb-wpas] |
| SET-12 | Airspace file | Both | organiser | StrePla imports OpenAir. Soaring Spot accepts one airspace file per competition, used for scoring on every scoring computer | [M16][sp-m16] 5.4, [KB files][kb-wpas] |
| SET-13 | Scoring parameter defaults | Both | scorer | Competition-wide defaults for checks such as max start height tolerance, logger gap warnings, finish height and start speed. SeeYou keeps warning defaults per competition, overridable per day | [M16][sp-m16] 5.5.2, [SYC help][syc-help] 8.1.9.6 |
| SET-14 | Engine detection parameters | StrePla | scorer | Default ENL threshold and turbo engine-test limits (height gain, time window after release, run time) | [M16][sp-m16] 5.5.2 Wertung II |
| SET-15 | Observation zone templates | StrePla | scorer | Named templates of start, turnpoint and finish zones (line, cylinder, keyhole, sector) with one default | [M16][sp-m16] 5.5.3 |
| SET-16 | Default observation zones | SeeYou | scorer | Default zone shapes in SeeYou options, edited per task | [SYC help][syc-help] 3.2.1 |
| SET-17 | Display units | StrePla | organiser | Coordinate format plus distance, speed and height units with rounding | [M16][sp-m16] 5.5.4 |
| SET-18 | Branding | Both | organiser | StrePla stores a competition logo, sponsor logo, website URL and paper format. Soaring Spot shows the competition logo on listings | [M16][sp-m16] 5.5.5, [About][sp-about] Jul 2010, [SS home][ss-home] |
| SET-19 | Max IGC file size | StrePla | scorer | Upper limit for uploaded IGC files, default 4096 kB | [M16][sp-m16] 5.5.6 |
| SET-20 | Test competitions | Both | organiser, scorer | StrePla shipped a test data set and a guided test competition. Soaring Spot has a separate test server that ignores uploaded files | [M16][sp-m16] 5, [KB test][kb-test] |
| SET-21 | Multiple start points | SeeYou | scorer | A list of start points with per-pilot, per-day allowed starts | [SYC help][syc-help] 8.1.9.3 |

## Competitors

| ID | Feature | Product | Audience | Description | Source |
|---|---|---|---|---|---|
| CMP-1 | Competitor record | Both | organiser | Name, country or club, class, glider type, registration, competition ID, handicap index and engine flag. SeeYou adds birth date and a pilot tag for scripts | [M16][sp-m16] 5.2, [SYC help][syc-help] 2.6 |
| CMP-2 | CSV import and export of competitors | Both | organiser | StrePla imports semicolon CSV and exports to Excel. SeeYou added pilot import and export in v8.0 | [M16][sp-m16] 5.2, [About][sp-about] 2018, [changelog][changelog] v8.0 |
| CMP-3 | Load pilot data from an IGC file | SeeYou | scorer | Pilot, glider and recorder ID can be filled from a sample IGC file header | [SYC help][syc-help] 2.6, [KB FR IDs][kb-frid] |
| CMP-4 | Flight recorder IDs per competitor | Both | scorer | Recorder serials bound to a competitor. SeeYou rejects duplicates across pilots. StrePla binds the primary logger on the first upload and exposes up to three logger serials | [KB FR IDs][kb-frid], [M16][sp-m16] 5.7.9, [ogn-web-viewer][ogn-web-viewer] |
| CMP-5 | FLARM ID | StrePla | organiser | FLARM ID as a competitor attribute, imported and exported through Excel | [About][sp-about] Mar 2018 |
| CMP-6 | Several pilots per glider | Both | organiser | StrePla has a copilot per day. SeeYou lists several pilots per glider for two-seaters or shared gliders, joined with "&" | [About][sp-about] Apr 2017, [KB pilots][kb-pilots] |
| CMP-7 | Not competing (hors concours) | SeeYou | scorer | Guest pilots shown as HC and excluded from scoring parameters | [KB pilots][kb-pilots] |
| CMP-8 | Inactive competitors | StrePla | scorer | Competitors can be set inactive and later reactivated without deletion | [About][sp-about] Aug 2010 |
| CMP-9 | IGC Ranking List IDs | Both | organiser | Ranking List ID per pilot with lookup. SeeYou allows editing IDs after archiving | [About][sp-about] Apr 2019, [KB pilots][kb-pilots], [KB archive][kb-archive] |
| CMP-10 | Pure glider flag | Both | scorer | Marks gliders without engine so missing or high ENL does not raise warnings | [M16][sp-m16] 5.2, [SYC help][syc-help] 8.1.9.6 |
| CMP-11 | Public competitor list | Both | public | Competition ID, name, club or country, glider, class and handicap | [SP competitors][sp-competitors], [SS pilots][ss-pilots] |

## Tasks

| ID | Feature | Product | Audience | Description | Source |
|---|---|---|---|---|---|
| TSK-1 | Task types | Both | scorer | StrePla supports Racing Task and AAT with minimum time. SeeYou supports Racing, Assigned Area, Pilot Selected and later Distance Handicap Task | [M16][sp-m16] 5.7.1, [SYC help][syc-help] 3.5, [changelog][changelog] v10.40 |
| TSK-2 | Web task editor | StrePla | scorer | Task entry in the browser with turnpoint dropdowns, leg distance and course, and a map preview with sectors and airspace | [M16][sp-m16] 5.7.1 |
| TSK-3 | Quick route entry | StrePla | scorer | Enter a task as a list of turnpoint numbers such as `002 046 128 042 244` | [M16][sp-m16] 5.8.1 |
| TSK-4 | Desktop task editor | SeeYou | scorer | Tasks are designed in the SeeYou task editor and assigned to a contest day | [SYC help][syc-help] 3.1, 3.3 |
| TSK-5 | Push task from desktop planner | StrePla | scorer | desktop StrePla sends a planned route to the competition as the day task with a token | [M16][sp-m16] 3.2 |
| TSK-6 | Alternative tasks per day | Both | scorer | Task A, B and C per class and day. One is assigned as the active task | [M16][sp-m16] 3.2, [KB task][kb-task] |
| TSK-7 | Per-day observation zones | Both | scorer | Zone type and dimensions per turnpoint for the day | [M16][sp-m16] 5.7.1, [SYC help][syc-help] 8.1.5.4 |
| TSK-8 | Day parameters | Both | scorer | Start open time, max start altitude, max altitude, QNH, finish height, max start ground speed, landing direction. SeeYou adds a scoring script per day | [M16][sp-m16] 5.7, [SYC help][syc-help] 8.1.5.1 |
| TSK-9 | Pre-start height and designated start interval | StrePla | scorer | Optional time-below-start-height rule and fixed start intervals | [About][sp-about] Mar 2018 |
| TSK-10 | Time below start altitude | SeeYou | scorer | Warning when the required time below start altitude before the start is not met | [SYC help][syc-help] 6.3 |
| TSK-11 | Per-day airspace exceptions | Both | scorer | Deactivate individual airspaces for one day | [M16][sp-m16] 5.7.2, [Blog 7.2][blog-72] |
| TSK-12 | Day notes | Both | scorer, pilot | Free text per day. StrePla prints it on the task sheet. SeeYou stores notes such as runway, grid time and weather and publishes them | [M16][sp-m16] 5.7.3, [SYC help][syc-help] 8.1.5.7 |
| TSK-13 | Task publication | Both | pilot, public | Task page with turnpoints, zones and notes. Soaring Spot publishes a task once the scorer assigns and uploads it | [SP show task][sp-showtask], [KB task][kb-task], [SS task][ss-task] |
| TSK-14 | Task file download | Both | pilot | StrePla offers SeeYou CUP and StrePla XML. Soaring Spot offers XML through the API | [SP task file][sp-taskfile], [SS API][ss-api] |
| TSK-15 | Task push to flight computers | SeeYou | pilot | Oudie Live downloads new tasks automatically and notifies the pilot about changes | [Blog 2015][blog-friendly] |

## Flight intake

| ID | Feature | Product | Audience | Description | Source |
|---|---|---|---|---|---|
| FLT-1 | Pilot web upload with daily password | StrePla | pilot | Pilots upload with competition ID, daily password printed on the task sheet and the file. The first upload sets the primary logger | [M16][sp-m16] 5.7.9.1, [SP upload][sp-upload] |
| FLT-2 | Upload from flight computer via API | SeeYou | pilot | Oudie Live and other apps upload the flight to the scoring office through the Soaring Spot API as a zipped IGC file | [KB IGC][kb-igc], [SS API][ss-api] |
| FLT-3 | Email intake | SeeYou | scorer | The free IGC Mail tool downloads IGC attachments from a competition mailbox into a search folder | [KB IGC][kb-igc] |
| FLT-4 | Scorer upload and manual assignment | StrePla | scorer | Scorer uploads files and assigns them on a two-pane screen with logger ID and validation status | [M16][sp-m16] 5.7.9.2 |
| FLT-5 | Folder watching | SeeYou | scorer | Auto Evaluate scans local, removable and network folders and scores files as soon as they appear | [KB auto][kb-auto], [SYC help][syc-help] 6.1 |
| FLT-6 | Automatic matching by logger ID | Both | scorer | Files are matched to competitors by recorder serial. SeeYou matches on the file name, StrePla on the logger bound on day 1 | [M16][sp-m16] 5.8, [KB FR IDs][kb-frid] |
| FLT-7 | Binary logger files | SeeYou | scorer | Auto Evaluate can read LXN, CAI, ZAN and LXNAV ZIP files directly from flash cards | [SYC help][syc-help] 8.1.9.2, [changelog][changelog] v8.0 |
| FLT-8 | Logger download | SeeYou | scorer | SeeYou downloads loggers directly. Several download computers can feed one scoring computer per class | [SYC help][syc-help] 5.1 |
| FLT-9 | Multiple loggers per pilot | Both | scorer | SeeYou lists all files of one pilot and the scorer chooses which one to evaluate. StrePla distinguishes the primary logger | [SYC help][syc-help] 6.4, [M16][sp-m16] 5.7.9.1 |
| FLT-10 | IGC security validation | Both | scorer | G-record check with the result shown per file. SeeYou can disable validation | [M16][sp-m16] 5.7.9.2, [SYC help][syc-help] 8.1.9.6, [changelog][changelog] v4.21 |
| FLT-11 | Download original IGC files from Soaring Spot | SeeYou | scorer | Scoring computers fetch uploaded files from Soaring Spot if missing locally | [changelog][changelog] v7.11, v9.1 |
| FLT-12 | Corrupt file handling | StrePla | scorer | Improved error handling for corrupt IGC files | [About][sp-about] May 2015 |

## Analysis

| ID | Feature | Product | Audience | Description | Source |
|---|---|---|---|---|---|
| ANA-1 | Automatic flight evaluation | Both | scorer | Every new flight is evaluated against the day task as soon as it arrives | [M16][sp-m16] 5.7.10, [KB auto][kb-auto] |
| ANA-2 | Flight status for review | StrePla | scorer | Each result is OK, "Prüfen" (check) or manually OK | [M16][sp-m16] 5.7.10 |
| ANA-3 | Event log per flight | StrePla | scorer | Severity-filtered list (information, user, warning, penalty) of everything the analysis found | [M16][sp-m16] 5.7.10 |
| ANA-4 | Warnings column | SeeYou | scorer | Warnings with actual values in the last column of the daily list, never printed | [KB warnings][kb-warn], [changelog][changelog] v4.32 |
| ANA-5 | Observation zone and missed turnpoint checks | Both | scorer | Detects missed zones. StrePla reports the last reached area on unfinished AATs | [SYC help][syc-help] 6.3, [About][sp-about] Jul 2010 |
| ANA-6 | Airspace violation check | Both | scorer | Detects airspace entries with a height tolerance. StrePla can end the flight at the first violation | [M16][sp-m16] 5.5.2, 5.9.5, [SYC help][syc-help] 6.3 |
| ANA-7 | Start checks | Both | scorer | Max start altitude and max start ground speed. StrePla averages speed over ±8 s around the start | [M16][sp-m16] 6.2, [SYC help][syc-help] 6.3, [changelog][changelog] v4.24 |
| ANA-8 | Finish height check | Both | scorer | Min finish height. StrePla treats undershooting by more than 100 m as an outlanding at the finish line | [About][sp-about] Apr 2017, [SYC help][syc-help] 6.3 |
| ANA-9 | Max altitude check | Both | scorer | Warning when the day's max altitude is exceeded | [M16][sp-m16] 5.7, [SYC help][syc-help] 8.1.5.1 |
| ANA-10 | Engine run detection | Both | scorer | ENL analysis with engine runs before the start and after the finish. StrePla adds turbo engine tests. SeeYou warns on high or missing ENL | [M16][sp-m16] 5.5.2 Wertung II, [About][sp-about] Jul 2014, [SYC help][syc-help] 8.1.9.6 |
| ANA-11 | Logger gap and fix interval warnings | Both | scorer | Warns about gaps and recording intervals above a limit | [M16][sp-m16] 5.5.2, [SYC help][syc-help] 6.3 |
| ANA-12 | Flight started in the air | SeeYou | scorer | Warning when the recording begins in flight | [SYC help][syc-help] 6.3 |
| ANA-13 | Altitude normalisation | Both | scorer | Altitudes calibrated to take-off elevation and daily QNH | [M16][sp-m16] 6.3, [SYC help][syc-help] 8.1.5.1 |
| ANA-14 | Release detection | StrePla | scorer | Automatic aerotow release detection from turn rate, sink and speed | [About][sp-about] |
| ANA-15 | Spurious fix removal | StrePla | scorer | Optional B-record pre-analysis that removes position spikes | [About][sp-about] Jul 2010 |
| ANA-16 | Blind flying instrument events | StrePla | scorer | Warnings from BFI events in the IGC file | [About][sp-about] Jun 2014 |
| ANA-17 | Pilot event marker start | Both | scorer | Start time derived from a pilot event marker. Experimental in StrePla | [About][sp-about] Apr 2019, [changelog][changelog] v10.1 |
| ANA-18 | Re-analysis with custom time window | Both | scorer | StrePla re-runs analysis with custom start and end times. SeeYou has soaring begin and end | [M16][sp-m16] 5.7.10, [KB manual][kb-manual] |
| ANA-19 | Deep link to desktop analysis | Both | scorer, pilot | StrePla opens a flight with its task in desktop StrePla. Soaring Spot opens flights in SeeYou | [M16][sp-m16] 3.3, [Blog 2020][blog-2020] |

## Scoring

| ID | Feature | Product | Audience | Description | Source |
|---|---|---|---|---|---|
| SCR-1 | Built-in rule sets | StrePla | scorer | German and international rule sets maintained by the vendor, updated with each SWO edition | [Product page][sp-product], [About][sp-about] Mar 2018, Apr 2019 |
| SCR-2 | Scriptable scoring | SeeYou | scorer | Daily and total points computed by Pascal scripts per class. Naviter publishes an Annex A default script | [SYC help][syc-help] 2.4, [Scripts][scripts], [changelog][changelog] v10.73 |
| SCR-3 | Total results | Both | scorer, public | Sum of daily points. SeeYou allows a custom total script, for example to drop the worst day | [SP overall][sp-overall], [Scripts][scripts] |
| SCR-4 | Minimum scoring distance | StrePla | scorer | Configurable per day according to the rules | [About][sp-about] Apr 2017, Apr 2019 |
| SCR-5 | Day status workflow | Both | scorer | StrePla: unplanned, tasks planned, start open, preliminary, final, neutralised, training. Soaring Spot: practice, preliminary, unofficial, official, cancelled | [M16][sp-m16] 5.7, [SYC help][syc-help] 8.1.5.1, [SS API][ss-api] |
| SCR-6 | Edit lock by status | SeeYou | scorer | Anything can change in preliminary results, less in unofficial and nothing in official | [SYC help][syc-help] 8.1.5.1 |
| SCR-7 | Provisional results from manual times | StrePla | scorer | Start and finish times typed in on the field produce live provisional results, later replaced by IGC data | [M16][sp-m16] 5.7.7, [Aalen 2009][sp-aalen] |
| SCR-8 | Manual outlanding entry | StrePla | scorer | Outlanding positions entered before the flight arrives, overwritten by the IGC file | [M16][sp-m16] 5.7.8 |
| SCR-9 | Manual result override | Both | scorer | Override start, finish, distance, points and take-off. SeeYou keeps manual values through a full reset | [KB manual][kb-manual], [M16][sp-m16] 5.7.10 |
| SCR-10 | Recompute day | Both | scorer | Re-analyse all flights and recompute scoring after parameter changes | [M16][sp-m16] 5.7, [KB manual][kb-manual] |
| SCR-11 | Multi-user scoring | Both | scorer | StrePla is multi-user in the browser. Soaring Spot lets several scorers share a competition with roles | [M16][sp-m16] 5.7.8, [KB roles][kb-roles] |
| SCR-12 | Result integrity signatures | StrePla | public | Daily results carry a participant hash and a task hash that warn about changes after scoring started | [About][sp-about] Mar 2018 |

## Penalties

| ID | Feature | Product | Audience | Description | Source |
|---|---|---|---|---|---|
| PEN-1 | Automatic penalties | StrePla | scorer | Analysis assigns penalty points for rule breaches such as start speed, reviewed by the scorer | [M16][sp-m16] 5.8.5 |
| PEN-2 | Manual penalty points | Both | scorer | Scorer enters penalty points. SeeYou never applies penalties automatically | [M16][sp-m16] 5.7.10, [KB warnings][kb-warn] |
| PEN-3 | Penalty remark in results | Both | public | Explanatory text printed on result lists, such as "Verwarnung: Loggerabgabe zu spät" | [M16][sp-m16] 5.8.5, [SYC help][syc-help] 6.4, [SS daily][ss-daily] |
| PEN-4 | Internal remark | StrePla | scorer | Note per flight that is not published | [M16][sp-m16] 5.7.10 |
| PEN-5 | Score to a point in time | Both | scorer | End the flight at an airspace entry and score it like an outlanding | [M16][sp-m16] 5.9.5, [KB manual][kb-manual] |
| PEN-6 | Sector 2 tolerance | StrePla | scorer | Option to accept a second sector and only penalise it | [M16][sp-m16] 5.5.3 |

## Publication

| ID | Feature | Product | Audience | Description | Source |
|---|---|---|---|---|---|
| PUB-1 | Public competition site | Both | public | Competition overview with classes and days. StrePla shows a day by class matrix with day status | [SP overview][sp-overview], [SS competition][ss-dsmf24] |
| PUB-2 | Daily results | Both | public | Rank, competition ID, name, glider, start, time, speed, distance, penalty and points, with a status heading | [SP daily][sp-daily], [SS daily][ss-daily] |
| PUB-3 | Scoring parameters on results | StrePla | public | Daily formula parameters (Pmax, Pdm, Pvm, Do, f, fcr, N, n1, n2) printed above the list | [SP daily][sp-daily] |
| PUB-4 | Overall results | Both | public | Total standings per class after each day | [SP overall][sp-overall], [SS daily][ss-daily] |
| PUB-5 | Per-result publication flag | StrePla | scorer | "Results public" checkbox per day hides results until released | [M16][sp-m16] 5.7 |
| PUB-6 | One-click publish | SeeYou | scorer | "Publish to Soaring Spot" uploads tasks, results and files, with weak-connection handling | [KB publish][kb-publish], [changelog][changelog] v7.11 |
| PUB-7 | Turnpoint and airspace downloads | Both | pilot | StrePla exports turnpoints and airspace. Soaring Spot converts waypoints into CUP, LXNAV, Zander, Volkslogger, Winpilot, Garmin and other formats | [SP downloads][sp-downloads], [SS downloads][ss-downloads] |
| PUB-8 | Additional documents | SeeYou | organiser | Organisers attach PDFs and forms in a rich text downloads section | [KB downloads][kb-files] |
| PUB-9 | Flight map and replay | StrePla | public | Compare flights of a day on a Leaflet map with replay and barogram | [SP map][sp-map] |
| PUB-10 | IGC file view | Both | public | StrePla shows the IGC file text. The Soaring Spot API returns the flight for a result | [SP IGC][sp-igc], [SS API][ss-api] |
| PUB-11 | Projector view | StrePla | public | "LiveView" page of the current results of all classes for a projector | [About][sp-about] Jul 2010 |
| PUB-12 | Mobile results | Both | public | StrePla had an AngularJS mobile app. Soaring Spot is responsive | [SP mobile][sp-mobile], [Blog 2015][blog-friendly] |
| PUB-13 | News posts | SeeYou | organiser, public | Rich text blog posts by users with publishing rights | [KB news][kb-news] |
| PUB-14 | Photo gallery | SeeYou | organiser, public | Photos sorted by capture date and shown below that day's results | [KB gallery][kb-gallery] |
| PUB-15 | Competition directory | Both | public | Home page with current, recent and upcoming competitions. StrePla adds a search | [SP home][sp-home], [SS home][ss-home] |
| PUB-16 | Languages | Both | public | StrePla in German and English. Soaring Spot in Czech, German, English, French and Slovenian | [SP home][sp-home], [SS home][ss-home] |
| PUB-17 | Archive | SeeYou | organiser, public | Competitions become read-only three months after the end and stay online | [KB archive][kb-archive] |

## Output and printing

| ID | Feature | Product | Audience | Description | Source |
|---|---|---|---|---|---|
| OUT-1 | Task sheet templates | StrePla | organiser | One to three text blocks with `$PLACEHOLDER$` macros such as QNH, max altitude, upload password and inactive airspace | [M16][sp-m16] 5.6, 6.1 |
| OUT-2 | Task sheet PDF | Both | pilot | StrePla renders a PDF with task table and map. SeeYou prints task sheets from the task editor | [M16][sp-m16] 5.7.3, [SYC help][syc-help] 4.1 |
| OUT-3 | Result PDFs | StrePla | scorer, public | Daily, total and task sheet PDFs per day and class, linked from the public site | [SP daily][sp-daily] |
| OUT-4 | Printed result sheets | SeeYou | scorer | Print daily and overall results with selectable columns and a footnote | [SYC help][syc-help] 7.1, 8.1.5.1 |
| OUT-5 | HTML export | SeeYou | organiser | Day, total and task pages as HTML through XSL style sheets | [SYC help][syc-help] 7.2 |
| OUT-6 | XML export | SeeYou | organiser | Whole-contest XML with all contest data | [SYC help][syc-help] 9.1 |
| OUT-7 | DFS NOTAM form | StrePla | organiser | Pre-filled form for the German air navigation service | [M16][sp-m16] 5.7.5 |
| OUT-8 | Day data archive | StrePla | scorer | Zip download of the day data | [M16][sp-m16] 5.7 |
| OUT-9 | Start grid | StrePla | organiser | Start grid list per day | [M16][sp-m16] 5.7 |

## Integrations

| ID | Feature | Product | Audience | Description | Source |
|---|---|---|---|---|---|
| INT-1 | Public read API | Both | public | StrePla had undocumented JSON endpoints for competitions, classes, days, competitors and tasks. Soaring Spot has a documented hal+json API with HMAC keys | [strepla-api][strepla-api], [ogn-web-viewer][ogn-web-viewer], [SS API][ss-api] |
| INT-2 | Flight upload API | SeeYou | pilot | `POST /v1/contests/{id}/flights` accepts a zipped IGC file | [SS API][ss-api] |
| INT-3 | Desktop planner integration | Both | scorer | Token-based link between scoring and the vendor's desktop program for tasks and flight review | [M16][sp-m16] 3, [Blog 2020][blog-2020] |
| INT-4 | Outlanding reporting | StrePla | pilot, scorer | lowcrop.aero imports the pilot list and sends outlanding reports that the scorer accepts into preliminary scoring | [M16][sp-m16] 4 |
| INT-5 | IGC Ranking List | Both | organiser | Ranking List IDs on competitors for result submission | [About][sp-about] Apr 2019, [Blog 7.2][blog-72] |
| INT-6 | IGC files with task data | Both | scorer, pilot | Served IGC files carry the task. SeeYou can save scored flights with the task embedded | [M16][sp-m16] 3.3, [SYC help][syc-help] 8.1.9.2 |

## Administration and billing

| ID | Feature | Product | Audience | Description | Source |
|---|---|---|---|---|---|
| ADM-1 | Per-competitor fee | StrePla | organiser | EUR 5.00 including VAT per competitor, invoiced after the competition | [Order][sp-order], [Product page][sp-product] |
| ADM-2 | Free licence for a banner | SeeYou | organiser | Free temporary SeeYou Competition licence in exchange for a SeeYou banner | [Product page][syc-product], [SYC help][syc-help] 1.3 |
| ADM-3 | Order form | StrePla | organiser | Competition name, location, periods, billing address and on-site contact | [Order][sp-order] |
| ADM-4 | Roles | Both | organiser | Soaring Spot has administrator, scorer and publisher roles. StrePla had scorer logins created by the vendor | [KB roles][kb-roles], [M16][sp-m16] 2.1 |
| ADM-5 | Accounts | Both | organiser | StrePla login with password reset. Soaring Spot uses SeeYou Cloud accounts | [SP home][sp-home], [KB create][kb-create] |
| ADM-6 | API keys per competition | Both | organiser | StrePla shows an authentication token in the master data. Soaring Spot generates client ID and secret | [M16][sp-m16] 5.5.1, [SS API][ss-api] |
| ADM-7 | Vendor support | Both | organiser | StrePla offered phone support from the programmer. Naviter offers remote fixes | [Aalen 2009][sp-aalen], [Blog 2015][blog-friendly] |

## Observations for the MVP cut

- The two products split the work differently. StrePla did everything in a hosted web app. SeeYou keeps analysis and scoring on a desktop and uses Soaring Spot only for publication, flight upload and the API. Keyhole's hosted design is closer to StrePla.
- StrePla shipped fixed SWO and Annex A rules, while SeeYou delegates points to user scripts. Keyhole's oracle (SoaringSpot results) is computed by Naviter's Annex A script or a local variant.
- StrePla assigned penalties automatically from analysis events. SeeYou only warns and the scorer types penalty points.
- Day status values differ. Soaring Spot's published states (practice, preliminary, unofficial, official, cancelled) are what pilots outside Germany expect today.
- StrePla's daily upload password and automatic logger binding are absent in Soaring Spot, which relies on email, folders, flight computer upload and organiser-built upload pages.

[sp-farewell]: https://web.archive.org/web/20220117070440/http://strepla.de/
[sp-m16]: https://web.archive.org/web/20160813132019/http://www.strepla.de/scs/doc/Handbuch_scs.pdf
[sp-about]: https://web.archive.org/web/20210928082919/https://www.strepla.de/scs/etc/about.aspx
[sp-order]: https://web.archive.org/web/20191218153525/https://www.strepla.de/scs/General/Deutsch/bestellung.htm
[sp-aalen]: https://web.archive.org/web/20160813132055/http://www.strepla.de/scs/General/Deutsch/Erfahrungsbericht_DMAalen2009.pdf
[sp-home]: https://web.archive.org/web/20190717230506/https://www.strepla.de/scs/default.aspx
[sp-overview]: https://web.archive.org/web/20201027060224/https://www.strepla.de/scs/Public/overview.aspx?cId=113&idxLevel0=2&idxLevel1=0
[sp-daily]: https://web.archive.org/web/20201001171258/https://www.strepla.de/scs/Public/scoreDay.aspx?cID=135&className=Club&dateScoring=20110529
[sp-overall]: https://web.archive.org/web/20201001160009/https://www.strepla.de/scs/Public/scoreOverall.aspx?cID=135&className=Club&dateScoring=20110530
[sp-competitors]: https://web.archive.org/web/20190719162745/https://www.strepla.de/scs/Public/competitor.aspx?cID=135
[sp-downloads]: https://web.archive.org/web/20190719162551/https://www.strepla.de/scs/Public/downloads.aspx?cID=135
[sp-showtask]: https://web.archive.org/web/20190824073825/https://www.strepla.de/scs/Public/showTask.aspx?cId=472&idDay=6406
[sp-taskfile]: https://web.archive.org/web/20190722101252/https://www.strepla.de/scs/ws/createTaskFile.ashx?cID=472&dayID=6430&type=SeeYou
[sp-map]: https://web.archive.org/web/20200930064517/https://www.strepla.de/scs/Public/showFlights2d.aspx?cId=135&idDay=1197
[sp-igc]: https://web.archive.org/web/20201202062325/https://www.strepla.de/scs/Public/igcFile.aspx?idResult=117385
[sp-upload]: https://web.archive.org/web/20190514175500/https://www.strepla.de/scs/public/uploadIGCFile.aspx
[sp-mobile]: https://web.archive.org/web/20210514111838/https://www.strepla.de/scs/mobile/index.html
[sp-product]: https://web.archive.org/web/20190602220848/https://www.strepla.de/scs/General/Deutsch/seite1.htm
[strepla-api]: https://github.com/Turbo87/strepla-api
[ogn-web-viewer]: https://github.com/Turbo87/ogn-web-viewer
[syc-help]: https://downloads.naviter.com/docs/cucompetition.pdf
[syc-product]: https://naviter.com/products/seeyou-competition/
[changelog]: https://naviter.com/seeyou-makes-you-a-better-pilot/seeyou-change-log/
[scripts]: https://github.com/naviter/seeyou_competition_scripts
[ss-api]: https://web.archive.org/web/20240522040546/http://download.naviter.com/soaringspot/api/index.html
[kb-cat]: https://kb.naviter.com/en/article-categories/soairngspot/
[kb-create]: https://kb.naviter.com/en/kb/how-to-create-a-competition-at-soaring-spot/
[kb-roles]: https://kb.naviter.com/en/kb/assign-scoring-team-and-publishers-to-your-competition/
[kb-pilots]: https://kb.naviter.com/en/kb/add-pilots-to-the-competition/
[kb-frid]: https://kb.naviter.com/en/kb/enter-flight-recorder-unique-ids/
[kb-files]: https://kb.naviter.com/en/kb/publish-pdf-and-other-files-for-download/
[kb-wpas]: https://kb.naviter.com/en/kb/add-competition-waypoint-and-airspace-files/
[kb-classes]: https://kb.naviter.com/en/kb/edit-or-add-classes-to-a-competition/
[kb-name]: https://kb.naviter.com/en/kb/edit-competition-name-location/
[kb-test]: https://kb.naviter.com/en/kb/testing-soaring-spot-and-seeyou-competition/
[kb-igc]: https://kb.naviter.com/en/kb/getting-the-flight-igc-files-into-the-scoring-office/
[kb-task]: https://kb.naviter.com/en/kb/preparing-a-competition-task/
[kb-auto]: https://kb.naviter.com/en/kb/how-auto-evaluate-works/
[kb-manual]: https://kb.naviter.com/en/kb/changing-the-results-manually/
[kb-warn]: https://kb.naviter.com/en/kb/working-with-warnings/
[kb-publish]: https://kb.naviter.com/en/kb/publishing-results/
[kb-news]: https://kb.naviter.com/en/kb/publish-new-blog-post-news/
[kb-gallery]: https://kb.naviter.com/en/kb/add-pictures-to-the-gallery/
[kb-archive]: https://kb.naviter.com/en/kb/archiving-the-competition/
[blog-72]: https://naviter.com/2015/07/seeyou-7-2-for-competitions/
[blog-friendly]: https://naviter.com/2015/05/friendly-soaring-spot/
[blog-2020]: https://naviter.com/2020/02/soaring-spot-meets-seeyou/
[ss-home]: https://www.soaringspot.com/en_gb/
[ss-dsmf24]: https://www.soaringspot.com/en_gb/dsmf24/
[ss-pilots]: https://www.soaringspot.com/en_gb/dsmf24/pilots
[ss-task]: https://www.soaringspot.com/en_gb/dsmf24/tasks/18m/task-8-on-2024-08-09
[ss-daily]: https://www.soaringspot.com/en_gb/dsmf24/results/18m/task-8-on-2024-08-09/daily
[ss-downloads]: https://www.soaringspot.com/en_gb/dsmf24/downloads
