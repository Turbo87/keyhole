# PROTOTYPE: Keyhole domain model

Throwaway draft for [What entities, fields and relationships make up Keyhole's domain model?](https://github.com/Turbo87/keyhole/issues/120). It is drawn from the closed decisions of [Wayfinder: Keyhole MVP](https://github.com/Turbo87/keyhole/issues/1) and `GLOSSARY.md`. Fields are domain fields, not columns. Types are loose labels: `text`, `number`, `date` (local calendar date), `time` (instant), `enum`, `point`, `ref` and `list`.

Each tree shows what an entity owns. No suffix is exactly one, `*` is zero or more, `+` is one or more, `?` is zero or one, and `··>` is a reference to an entity owned elsewhere. Each relationship is drawn once, from the side that owns or references it, and reverse sides such as a competitor's results are not drawn. Each entity's lifetime is in [Lifetimes](#lifetimes), and everything that didn't fit cleanly is in [Contradictions and gaps](#contradictions-and-gaps).

## Platform and membership

```text
User
├── inviter ··> User?                 never changes, empty only for the first staff user
├── Session*
├── LoginToken*
├── Invitation*                       sent, brings a new person onto Keyhole
│   └── competition ··> Competition?  role granted on acceptance
├── CompetitionInvitation*            sent to an existing user, who accepts or ignores it
│   ├── invitee ··> User
│   └── competition ··> Competition
└── Membership*
    └── competition ··> Competition   role admin or scorer, at least one admin per competition
```

| Entity | Fields |
|---|---|
| User | email and name (both removed on soft deletion), staff flag, inviter, invitation limit (10 by default, staff change it, staff have none), block (staff member, time, internal note), deleted flag |
| Invitation | email, inviter, optional competition and role, expiry (7 days), revoked time, accepted time. Every open or accepted invitation counts toward the inviter's limit, and accepting one sets the new user's inviter |
| CompetitionInvitation | role, expiry (7 days), revoked time, accepted time. Never counts toward the limit and never changes the inviter |
| Membership | role |
| Session | expiry, 30 days after last use, extended at most once a day |
| LoginToken | magic link and 6-digit code, single use, valid 60 minutes, code locks after 5 wrong attempts |

## Competition setup

```text
RuleSetEdition                        built-in, immutable
└── ClassTemplate+
    └── handicap list ··> HandicapList?

HandicapList                          built-in, immutable
└── HandicapListEntry+

Competition
├── rule set edition ··> RuleSetEdition
├── RuleOverrides                     competition layer
├── AirspaceFile?
│   └── Airspace+
├── TurnpointFile?
│   └── Turnpoint+
├── Logger*                           unique per competition, entered by a scorer or created by the first file from it
│   └── LoggerLink*                   dated timeline, none until a scorer links it
│       └── competitor ··> Competitor
├── Competitor*
│   ├── class ··> Class               a class change is an edit of this reference
│   └── CrewMember+                   ordered
└── Class*
    ├── handicap list ··> HandicapList?   prefills new competitors
    ├── RuleOverrides                 class layer
    └── ClassDay*                     created lazily, one per date
        ├── RuleOverrides             class day layer
        ├── TaskCandidate*
        │   └── TaskPoint+            ordered, replaced whole
        │       └── turnpoint ··> Turnpoint   linked by name, coordinates copied
        ├── task ··> TaskCandidate?   the candidate published as the class day's task
        ├── AirspaceException*
        │   └── airspace ··> Airspace
        └── NotamAirspace*            always closed
```

| Entity | Fields |
|---|---|
| RuleSetEdition | ID (`DAeC SWO 2026`, `FAI Annex A 2025a`), allowed earth models, parameter defaults (Dm, D1, zones, delivery period, margins, complaint period) |
| ClassTemplate | name (Club, Standard, 18 m), Dm, D1, handicapped flag |
| HandicapList | ID (`daec-2026`), scale (1.000 or 100) |
| HandicapListEntry | glider type, handicap |
| Competition | name, slug (fixed at creation, unique including tombstones), organising club or person, location, country, IANA time zone, first and last date, optional website, airfield point and elevation in m MSL (optional at creation, needed for analysis), standing notes, flight levels, lifecycle (live, or archived as a tombstone with the directory fields). Deleting removes the competition entirely and frees the slug, block (staff member, time, internal note) |
| RuleOverrides | earth model, finish measured to the cylinder edge, delivery period, default zones per role (competition only), Dm and D1 (class day only, overriding the class), start procedure (opening and closing time, maximum start altitude and ground speed, PEV settings), tow altitude, maximum altitude, scoring end time. Every field is optional and overrides the layer above |
| AirspaceFile | OpenAir text as uploaded, lock time (first flight upload of the competition) |
| Airspace | name, category (`AC` and `AY`), opened flag (closed unless opened) |
| TurnpointFile | CUP text as uploaded |
| Turnpoint | name, position, elevation |
| Class | name, optional colour (sRGB hex), Dm, D1, handicapped flag, scale |
| ClassDay | date (fixed), practice flag, daily password (generated at creation), QNH in hPa, results note (working value, copied into each results publish), cancelled flag |
| TaskCandidate | letter (A, B, C, reorderable), task type (racing or AAT), minimum task time (AAT only), day notes |
| TaskPoint | position and elevation (copied from the turnpoint), zone (line length, or R1, A1, R2, A2 and orientation), minimum finish height in m MSL (finish only) |
| AirspaceException | direction (open or close) |
| NotamAirspace | OpenAir text |
| Competitor | competition ID (unique per class, up to 5 characters), glider type, optional registration, optional display name (otherwise the crew joined with "&"), handicap (0 means not set in handicapped classes), pure glider flag, hors concours flag |
| CrewMember | position, first name, last name, club, country (ISO code), optional IGC Ranking List ID (scorer interface only) |
| Logger | manufacturer and serial (from the `A` record), ENL threshold (500), MOP threshold (500), CUR threshold (20 A), minimum duration (30 s) |
| LoggerLink | from date (empty means from the start), role (primary or secondary, at most one primary per competitor and date) |

## Flights, results and publishing

```text
Competition
└── IgcFile*
    ├── logger ··> Logger             from the A record, which every upload needs
    ├── resolves to ··> Result?       derived from the logger link valid on the file's date
    └── Analysis                      current analysis only, also while pending or failed
        ├── AnalysisLogEntry*
        └── StaleReason*

ClassDay
├── Result*                           one per competitor of the class
│   ├── competitor ··> Competitor
│   ├── ScoredFile?                   only with status scored file
│   │   ├── file ··> IgcFile          chosen by a scorer
│   │   └── Override?                 corrections of the analysis
│   ├── ManualResult?                 only with status manual result
│   └── Penalty?
├── PublishedTask?                    fixed public copy, replaced by a task republish
└── PublishedResults?                 fixed public copy, history open in gap 7
    └── ResultsRow*
        ├── competitor ··> Competitor   display fields stay live
        └── file ··> IgcFile?           by hash, public download
```

| Entity | Fields |
|---|---|
| IgcFile | SHA-256 (exact duplicates ignored), delivery time (server receive time), recorded date (`HFDTE`, never rewritten), date correction (automatic 1024-week rollover), date override (set by a scorer), suggested class and competition ID (the pilot's choice), G-record validation (valid, invalid or no validator, run once), private flag (keeps its hash out of published results), reviewed flag (implied by the review status rules) |
| Analysis | engine version, Mapterhorn version, state (pending or done), output (start, credited points, finish or landing, distance, time), previous output (for changed since review) |
| AnalysisLogEntry | level (debug, info, warning or error), kind (maps to a rule clause per edition), evidence (a moment, an interval or the whole file), suggestion (a flight end or another candidate start) |
| StaleReason | reason (task, start procedure, airspace, logger settings, logger link role, rule overrides, engine version) |
| Result | result status (unknown, did not fly, scored file or manual result), review status (OK, check, reviewed or changed since review), optional handicap override (applies to scored files and manual results alike). Switching between scored file and manual result discards the other branch |
| ScoredFile | no fields of its own |
| ManualResult | optional start time, finished flag, finish time (when finished), distance (when not finished, and always on an AAT), optional landing position (racing distance helper), optional public remark |
| Override | optional start (a candidate crossing or a free time), optional flight end time, turnpoint credits, AAT pinned fixes, optional finish credit or time, optional public remark. Distance and speed have no override |
| Penalty | points (0 is an official warning), public remark, internal remark |
| PublishedTask | publish time, letter, task with AAT distances, start procedure, open, closed and NOTAM airspaces as of the publish |
| PublishedResults | status (preliminary, unofficial, final or cancelled), publish time, complaint deadline (unofficial only), task line (letter, task type, distance, turnpoints), day parameters (N, n1, n2, Dm, D1, Do, Vo, To, Pm), results note, rule set edition, engine version, rules hash |
| ResultsRow | copied scoring fields (handicap, hors concours, pure glider flag, class), start, finish or landing, distance, speed, points, rank, placeholder flag ("No result yet"), penalty points with public remark, public remarks of the override or manual result |

Derived and never stored: the day number, placeholder results, working day scores, overall results, the AAT nominal, minimum and maximum distances and the public CUP download. The public JSON files (directory, `competition.json`, `task.json`, `results.json` and `overall.json`) are renderings of the entities above.

## Lifetimes

| Lifetime | Entities and fields |
|---|---|
| Current state, live on public pages after every save | Competition master data, class, competitor display fields and current handicap, crew, logger IDs, the class day schedule |
| Current state, private working inputs | Rule overrides, task candidates, airspace exceptions, NOTAM airspaces, daily password, QNH, results note, result, manual result, override, penalty, analysis |
| Dated history | Logger link, which is the only entity with dates of validity |
| Versioned and immutable, shipped by deploy | Rule set edition, class template, handicap list, `ENGINE_VERSION` |
| Snapshotted at publish | Published task, published results and its rows. A results row copies only scoring fields and references the competitor by ID for everything else |
| Fixed after an event | Practice flag after the first publish, slug after creation, airspace file after the first flight upload, task point coordinates after copying, the user's inviter |
| Locked on final class days | The class day's own inputs and the shared inputs it used: class scoring fields and rule overrides, the competitor's class (except on practice days), handicap, hors concours and pure glider flag, the airspace and turnpoints used, the airfield, the rule set edition and the time zone. Reopening unlocks them |
| Write-only history | The audit log, which every decision names as the only place changes are kept but none defines |

## Decisions from review

These came out of reviewing the draft and revise earlier decisions.

- Every upload needs a readable `A` record, scorer uploads included, and a manual result covers flights without one. This revises the lenient scorer uploads in [How does a pilot upload a flight, and how is the competitor chosen?](https://github.com/Turbo87/keyhole/issues/95).
- A file from an unknown logger creates the logger with no link. Link entries always name a competitor, so "from date D, not linked" from [Is the primary logger's file scored ahead of a secondary that arrives first?](https://github.com/Turbo87/keyhole/issues/105) is dropped.
- Creating a competitor copies the handicap and glider type from the class's handicap list, and the competitor keeps no reference to the list entry. The "differs from the list" marker in [How are classes configured: local classes, per-class Dm and D1, and which handicap list from which source?](https://github.com/Turbo87/keyhole/issues/22) is dropped, since Club weight and winglet adjustments would set it off constantly.
- A class stores no class template. The class form applies the rule set's template values when the class is created, and any departure warning lives in that form. This revises [How are classes configured: local classes, per-class Dm and D1, and which handicap list from which source?](https://github.com/Turbo87/keyhole/issues/22) and [Which competition and class settings may a scorer change without being an admin?](https://github.com/Turbo87/keyhole/issues/81).
- Published results don't record which files were stale at publish time. This revises [Which input changes re-analyse flights automatically, and which only mark them stale?](https://github.com/Turbo87/keyhole/issues/75) and point 8 of [Which day and flight statuses does Keyhole have, and what do they lock and publish?](https://github.com/Turbo87/keyhole/issues/13).
- The layered rule parameters are called rule overrides, the way Keyhole records a competition's local procedures.
- Inviting a new person and inviting an existing user into a competition are separate. Only invitations that bring a new person onto Keyhole count toward the limit and set the inviter, and an existing user accepts or ignores a competition invitation.
- The handicap override from [Why don't SoaringSpot's handicapped club class days recompute from their published handicaps?](https://github.com/Turbo87/keyhole/issues/69) sits on the result, so it applies to manual results too.

## Contradictions and gaps

Each item is a candidate for its own ticket. None is settled here.

1. **Which date resolves a file to a logger link and class day.** [Is the primary logger's file scored ahead of a secondary that arrives first?](https://github.com/Turbo87/keyhole/issues/105) takes "its date from the IGC file", which is the UTC `HFDTE` date, while [Which analysis log entries does flight analysis report, and how are they reviewed?](https://github.com/Turbo87/keyhole/issues/26) and [How does Keyhole assign an IGC file whose recorded date doesn't match the class day?](https://github.com/Turbo87/keyhole/issues/57) use the local take-off date. They differ for flights that cross UTC midnight, such as Australian mornings.
2. **Which IGC files are public, and what archiving deletes.** [How long does Keyhole keep results and IGC files, and are IGC downloads public?](https://github.com/Turbo87/keyhole/issues/50) makes scored files public, lets a scorer keep a file private by unlinking it and has archiving delete unlinked files. Files can no longer be unlinked since [Is the primary logger's file scored ahead of a secondary that arrives first?](https://github.com/Turbo87/keyhole/issues/105). A file that was scored in a published snapshot and later replaced is still referenced by that snapshot's hash.
3. **Overrides when the scored file changes.** Overrides belong to the scored file branch of a result, but a start override can pick a candidate crossing and an AAT override pins a fix, both of which belong to one file. Nothing says whether overrides survive a switch of the scored file or a link edit that moves the scored file away.
4. **Analysis of a file that moves to another result.** A link edit, a role change or a date override can move a file to another competitor or class day. [Which input changes re-analyse flights automatically, and which only mark them stale?](https://github.com/Turbo87/keyhole/issues/75) lists only uploads, overrides and scored file switches as automatic, and a role change marks stale. Whether a moved file is analysed automatically against its new task or only marked stale is open.
5. **Where the review state lives.** The review status sits on the result per [Should a competitor's class day carry one state of unknown, did not fly, scored file or manual result?](https://github.com/Turbo87/keyhole/issues/102), but "a file no scorer has reviewed" and "the file shows up unreviewed on its new result" imply a per-file reviewed flag. Whether it exists, and whether it resets when a file moves, isn't stated.
6. **Which published snapshots are kept.** Overall results read only the latest results publish, but reverting a cancellation restores the previous status, and reopening republishes the existing snapshot. Whether earlier publishes are kept as history or only the latest and the pre-cancellation one is open, and so is whether task publishes are kept.
7. **Where the day status lives.** [Which day and flight statuses does Keyhole have, and what do they lock and publish?](https://github.com/Turbo87/keyhole/issues/13) stores the status with the snapshot and gives working results none, while the glossary and the public schedule treat it as a class day field that also covers unplanned and task published. Whether the status is a stored class day field or derived from the latest task and results publishes affects locking and the schedule in `competition.json`.
8. **Logger IDs in the public competition file under dated links.** [How does a pilot upload a flight, and how is the competitor chosen?](https://github.com/Turbo87/keyhole/issues/95) lists each competitor's logger IDs for upload prefill. With dated links, a logger can point to different competitors on different dates, and the file doesn't say which link entries it publishes or how the upload page picks the date.
9. **Which class day the daily password is checked against.** The password belongs to a class day, and the file's date now decides the class day. The upload request carries only the class and competitor, so whether the password must match the file's class day, today's class day or any open class day of the chosen class is unstated.
10. **The audit log.** Many decisions rely on it as the only history (switches, crew edits, class moves, link edits), but no ticket says what it records, who can read it, whether erasure requests and archiving remove entries, or how long it is kept.
11. **Deleting a competitor under dated links.** [How are competitors, gliders and loggers modelled, including primary and secondary loggers?](https://github.com/Turbo87/keyhole/issues/21) allows deletion only without a result on a published day and returns files to an unassigned pool. Every competitor now has a result per class day, the pool is gone, and what happens to link entries that point to the deleted competitor is open.
12. **Dm and D1 layers.** [Which scoring formulas and parameters do SWO and IGC Annex A define?](https://github.com/Turbo87/keyhole/issues/2) and [Where are the scoring engine's boundaries?](https://github.com/Turbo87/keyhole/issues/8) layer rule overrides over competition, class and class day, while [How are classes configured: local classes, per-class Dm and D1, and which handicap list from which source?](https://github.com/Turbo87/keyhole/issues/22) has no competition layer for Dm and D1. The model keeps Dm and D1 on the class and class day only, which a regional competition with one Dm for all classes would set per class.
13. **PEV start settings.** The start procedure carries "PEV starts", but no decision lists its fields, such as the PEV window, wait time and the per-day or per-launch PEV limit that [Which start rule settings does a class day carry, and how are they entered with the task?](https://github.com/Turbo87/keyhole/issues/45) says the rule sets count differently.
14. **Turnpoint file replacement.** The airspace file locks at the first flight upload, but the turnpoint file has no rule. Task points link by name and copy coordinates, so replacing the file can leave candidates pointing to names that no longer exist, and the public download would no longer match published tasks.
15. **Airspace identity across a file replacement.** Airspace exceptions and the competition's open selection reference single airspaces, and the file can be replaced until the first flight upload. Nothing says how those references carry over to the new file, since OpenAir has no stable airspace ID.
16. **Organiser terms acceptance.** [Which legal documents, terms and attributions does Keyhole need before launch?](https://github.com/Turbo87/keyhole/issues/52) has the admin accept the organiser terms with an Article 26 arrangement at creation and confirm they may act for the organiser, but the model stores no acceptance, terms version or time.

## Not modelled

Billing fields from [How are competitors, gliders and loggers modelled, including primary and secondary loggers?](https://github.com/Turbo87/keyhole/issues/21) (billable hors concours, billable competitor count) are left out, since [How is Keyhole monetised?](https://github.com/Turbo87/keyhole/issues/10) is out of scope. Competition approval is gone since [How does Keyhole stop bots from triggering login emails to arbitrary addresses?](https://github.com/Turbo87/keyhole/issues/91), so `competition.json` "written first on approval" in [Which public JSON files exist, and which edits rewrite them without a publish?](https://github.com/Turbo87/keyhole/issues/77) reads as "written first on creation".
