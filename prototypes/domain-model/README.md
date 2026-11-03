# PROTOTYPE: Keyhole domain model

Throwaway draft for [What entities, fields and relationships make up Keyhole's domain model?](https://github.com/Turbo87/keyhole/issues/120). It is drawn from the closed decisions of [Wayfinder: Keyhole MVP](https://github.com/Turbo87/keyhole/issues/1) and `GLOSSARY.md`. Fields are domain fields, not columns. Types are loose labels: `text`, `number`, `date` (local calendar date), `time` (instant), `enum`, `point`, `ref` and `list`.

Each tree shows what an entity owns, and the field tables list every entity's relationships first, with `→` for a reference and `?` for an optional one. No suffix is exactly one, `*` is zero or more, `+` is one or more, `?` is zero or one, and `··>` is a reference to an entity owned elsewhere. Each relationship is drawn once, from the side that owns or references it, and reverse sides such as a competitor's results are not drawn. Everything that didn't fit cleanly is in [Contradictions and gaps](#contradictions-and-gaps).

## Platform and membership

```text
User
├── inviter ··> User?                 never changes, empty only for the first staff user
├── Session*
├── LoginToken*
├── Invitation*                       sent, brings a new person onto Keyhole, removed once accepted
│   └── competition ··> Competition?  role granted on acceptance
├── CompetitionInvitation*            sent to an existing user, who accepts or ignores it, removed once accepted
│   ├── invitee ··> User
│   └── competition ··> Competition
└── Membership*
    └── competition ··> Competition   role admin or scorer, at least one admin per competition
```

| Entity | Fields |
|---|---|
| User | email and name (both removed on soft deletion), staff flag, inviter → User? (never changes, empty only for the first staff user), invitation limit (10 by default, set by staff, no limit for staff), block (staff member, time, internal note), deleted flag |
| Invitation | inviter → User, email, competition → Competition? with role, expiry (7 days). Accepting it creates the user and removes it, and revoking removes it. The limit counts the users someone invited plus their unexpired invitations |
| CompetitionInvitation | sender → User, invitee → User, competition → Competition, role, expiry (7 days). Accepting it creates the membership and removes it, and revoking removes it. Never counts toward the limit |
| Membership | user → User, competition → Competition, role (admin or scorer, at least one admin per competition) |
| Session | user → User, expiry (30 days after last use, extended at most once a day) |
| LoginToken | user → User, magic link and 6-digit code (single use, valid 60 minutes, the code locks after 5 wrong attempts) |

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
| ClassTemplate | rule set edition → RuleSetEdition, name (Club, Standard, 18 m), Dm, D1, handicapped flag, handicap list → HandicapList? |
| HandicapList | ID (`daec-2026`), scale (1.000 or 100) |
| HandicapListEntry | handicap list → HandicapList, glider type, handicap |
| Competition | rule set edition → RuleSetEdition, name, slug (fixed at creation, unique including tombstones), organising club or person, location, country, IANA time zone, first and last date, optional website, airfield point and elevation in m MSL (optional at creation, needed for analysis), standing notes, flight levels, lifecycle (live, or archived as a tombstone with the directory fields), block (staff member, time, internal note). Deleting removes the competition entirely and frees the slug |
| RuleOverrides | owner → exactly one of Competition, Class or ClassDay, then earth model, finish measured to the cylinder edge, delivery period, default zones per role (competition only), Dm and D1 (class day only, overriding the class), start procedure (opening and closing time, maximum start altitude and ground speed, PEV settings), tow altitude, maximum altitude, scoring end time. Every field is optional and overrides the layer above |
| AirspaceFile | competition → Competition, OpenAir text as uploaded, lock time (first flight upload of the competition) |
| Airspace | airspace file → AirspaceFile, name, category (`AC` and `AY`), opened flag (closed unless opened) |
| TurnpointFile | competition → Competition, CUP text as uploaded |
| Turnpoint | turnpoint file → TurnpointFile, name, position, elevation |
| Class | competition → Competition, handicap list → HandicapList? (prefills new competitors), name, optional colour (sRGB hex), Dm, D1, handicapped flag, scale |
| ClassDay | class → Class, task → TaskCandidate? (the candidate published as the class day's task), date (fixed), practice flag, daily password (generated at creation), QNH in hPa, results note (working value, copied into each results publish), cancelled flag |
| TaskCandidate | class day → ClassDay, letter (A, B, C, reorderable), task type (racing or AAT), minimum task time (AAT only), day notes |
| TaskPoint | task candidate → TaskCandidate, turnpoint → Turnpoint (linked by name), position in the sequence, position and elevation (copied from the turnpoint), zone (line length, or R1, A1, R2, A2 and orientation), minimum finish height in m MSL (finish only) |
| AirspaceException | class day → ClassDay, airspace → Airspace, direction (open or close) |
| NotamAirspace | class day → ClassDay, OpenAir text |
| Competitor | competition → Competition, class → Class, competition ID (unique per class, up to 5 characters), glider type, optional registration, optional display name (otherwise the crew joined with "&"), handicap (0 means not set in handicapped classes), pure glider flag, hors concours flag |
| CrewMember | competitor → Competitor, position, first name, last name, club, country (ISO code), optional IGC Ranking List ID (scorer interface only) |
| Logger | competition → Competition, manufacturer and serial (from the `A` record), ENL threshold (500), MOP threshold (500), CUR threshold (20 A), minimum duration (30 s) |
| LoggerLink | logger → Logger, competitor → Competitor, from date (empty means from the start), role (primary or secondary, at most one primary per competitor and date) |

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
| IgcFile | competition → Competition, logger → Logger, SHA-256 (exact duplicates ignored), delivery time (server receive time), recorded date (`HFDTE`, never rewritten), local take-off date (derived), date correction (automatic 1024-week rollover), date override (set by a scorer), suggested class and competition ID (the pilot's choice), G-record validation (valid, invalid or no validator, run once), private flag (keeps its hash out of published results), reviewed flag. Its result is derived from the logger link valid on its date and never stored |
| Analysis | IGC file → IgcFile, engine version, Mapterhorn version, state (pending or done), output (start, credited points, finish or landing, distance, time), previous output (for changed since review) |
| AnalysisLogEntry | analysis → Analysis, level (debug, info, warning or error), kind (maps to a rule clause per edition), evidence (a moment, an interval or the whole file), suggestion (a flight end or another candidate start) |
| StaleReason | analysis → Analysis, reason (task, start procedure, airspace, logger settings, logger link role, rule overrides, engine version) |
| Result | class day → ClassDay, competitor → Competitor, result status (unknown, did not fly, scored file or manual result), review status (OK, check, reviewed or changed since review), optional handicap override. Switching between scored file and manual result discards the other branch |
| ScoredFile | result → Result, IGC file → IgcFile (chosen by a scorer) |
| ManualResult | result → Result, optional start time, finished flag, finish time (when finished), distance (when not finished, and always on an AAT), optional landing position (racing distance helper), optional public remark |
| Override | scored file → ScoredFile, optional start (a candidate crossing or a free time), optional flight end time, turnpoint credits, AAT pinned fixes, optional finish credit or time, optional public remark. Distance and speed have no override |
| Penalty | result → Result, points (0 makes it an official warning), public remark, internal remark |
| PublishedTask | class day → ClassDay, publish time, letter, task with AAT distances, start procedure, open, closed and NOTAM airspaces as of the publish |
| PublishedResults | class day → ClassDay, status (preliminary, unofficial, final or cancelled), publish time, complaint deadline (unofficial only), task line (letter, task type, distance, turnpoints), day parameters (N, n1, n2, Dm, D1, Do, Vo, To, Pm), results note, rule set edition, engine version, rules hash |
| ResultsRow | published results → PublishedResults, competitor → Competitor (display fields stay live), IGC file → IgcFile? (by hash, public download), copied scoring fields (handicap, hors concours, pure glider flag, class), start, finish or landing, distance, speed, points, rank, placeholder flag ("No result yet"), penalty points with public remark, public remarks of the override or manual result |

Derived and never stored: the day number, placeholder results, working day scores, overall results, the AAT nominal, minimum and maximum distances and the public CUP download. The public JSON files (directory, `competition.json`, `task.json`, `results.json` and `overall.json`) are renderings of the entities above.

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

My own pass and two independent reviews, one by Claude and one by Codex, found these open questions. Each is now its own ticket:

- [How is a class day's status stored, and which published results are kept?](https://github.com/Turbo87/keyhole/issues/123)
- [Is a result's review status stored or derived, and do files carry their own reviewed flag?](https://github.com/Turbo87/keyhole/issues/124)
- [What replaces the first competition-day launch as the cut-off for class changes?](https://github.com/Turbo87/keyhole/issues/125)
- [What happens to logger links and published rows when a competitor is deleted?](https://github.com/Turbo87/keyhole/issues/126)
- [What happens to overrides and analysis when the scored file changes or a file moves to another result?](https://github.com/Turbo87/keyhole/issues/127)
- [What does the audit log record, who can read it, and how long is it kept?](https://github.com/Turbo87/keyhole/issues/128)
- [Which logger IDs does the public competition file list under dated logger links?](https://github.com/Turbo87/keyhole/issues/129)
- [Which class day is the daily password checked against?](https://github.com/Turbo87/keyhole/issues/130)
- [What happens to task points when the turnpoint file is replaced?](https://github.com/Turbo87/keyhole/issues/131)
- [When can an IGC file be deleted?](https://github.com/Turbo87/keyhole/issues/132)
- [On which class days does a late entrant get a result?](https://github.com/Turbo87/keyhole/issues/133)
- [Which settings make up a PEV start procedure?](https://github.com/Turbo87/keyhole/issues/134)
- [How do airspace exceptions and the open selection carry over when the airspace file is replaced?](https://github.com/Turbo87/keyhole/issues/135)
- [Do changes to the airfield or time zone mark files stale?](https://github.com/Turbo87/keyhole/issues/136)
- [Is the reopen reason stored?](https://github.com/Turbo87/keyhole/issues/137)
- [When can classes, class days and task candidates be deleted?](https://github.com/Turbo87/keyhole/issues/138)
- [Can a task candidate be re-lettered after it is published?](https://github.com/Turbo87/keyhole/issues/139)
- [What happens to a soft-deleted user's competition memberships?](https://github.com/Turbo87/keyhole/issues/140)
- [Is acceptance of the organiser terms recorded?](https://github.com/Turbo87/keyhole/issues/141)

A file's date is its local take-off date in the competition's time zone, as [Which analysis log entries does flight analysis report, and how are they reviewed?](https://github.com/Turbo87/keyhole/issues/26), [How does Keyhole assign an IGC file whose recorded date doesn't match the class day?](https://github.com/Turbo87/keyhole/issues/57) and [Which master data does a competition carry, and how are its classes' class days created and changed?](https://github.com/Turbo87/keyhole/issues/67) already decide, so the `HFDTE` date never picks a logger link directly.

## Not modelled

Billing fields from [How are competitors, gliders and loggers modelled, including primary and secondary loggers?](https://github.com/Turbo87/keyhole/issues/21) (billable hors concours, billable competitor count) are left out, since [How is Keyhole monetised?](https://github.com/Turbo87/keyhole/issues/10) is out of scope. Competition approval is gone since [How does Keyhole stop bots from triggering login emails to arbitrary addresses?](https://github.com/Turbo87/keyhole/issues/91), so `competition.json` "written first on approval" in [Which public JSON files exist, and which edits rewrite them without a publish?](https://github.com/Turbo87/keyhole/issues/77) reads as "written first on creation".
