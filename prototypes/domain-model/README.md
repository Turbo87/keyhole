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
    └── competition ··> Competition   role admin or scorer, at least one admin per competition unless staff deleted the last one

OrganiserTermsVersion                 built-in, immutable
```

| Entity | Fields |
|---|---|
| User | email and name (both removed on soft deletion), staff flag (cleared on soft deletion), inviter → User? (never changes, empty only for the first staff user), invitation limit (10 by default, set by staff, no limit for staff), block (staff member, time, internal note), deleted flag (soft deletion also removes the user's memberships and every pending invitation they sent or received) |
| Invitation | inviter → User, email, competition → Competition? with role, expiry (7 days). Accepting it creates the user and removes it, and revoking removes it. The limit counts the users someone invited plus their unexpired invitations |
| CompetitionInvitation | sender → User, invitee → User, competition → Competition, role, expiry (7 days). Accepting it creates the membership and removes it, and revoking removes it. Never counts toward the limit |
| Membership | user → User, competition → Competition, role (admin or scorer). The last admin can neither leave nor downgrade, and only staff deleting that user leaves a competition without an admin until staff invite or promote one |
| Session | user → User, token (stored hashed), expiry (30 days after last use, extended at most once a day) |
| LoginToken | user → User, magic link token and 6-digit code (both single use), expiry (60 minutes), wrong code attempts (the code locks after 5) |
| OrganiserTermsVersion | ID (`organiser-terms-2026-11`), text. A new version applies only to competitions created after it |

## Competition setup

```text
RuleSetEdition                        built-in, immutable
└── ClassTemplate+
    └── handicap list ··> HandicapList?

HandicapList                          built-in, immutable
└── HandicapListEntry+

Competition
├── AirspaceFile?                     the competition's airspace
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
    ├── rule set edition ··> RuleSetEdition   chosen per class
    ├── handicap list ··> HandicapList?   prefills new competitors
    ├── RuleOverrides                 class layer
    └── ClassDay*                     created lazily, one per competition date
        ├── RuleOverrides             class day layer
        ├── TaskCandidate*
        │   └── TaskPoint+            ordered, replaced whole
        ├── task ··> TaskCandidate?   the candidate published as the class day's task
        ├── AirspaceException*        by airspace name
        └── AirspaceFile*             NOTAM airspaces, always closed
            └── Airspace+
```

| Entity | Fields |
|---|---|
| RuleSetEdition | ID (`DAeC SWO 2026`, `FAI Annex A 2025a`), allowed earth models, parameter defaults (Dm, D1, zones, delivery period, margins, complaint period) |
| ClassTemplate | rule set edition → RuleSetEdition, name (Club, Standard, 18 m), Dm, D1, handicapped flag, handicap list → HandicapList? |
| HandicapList | ID (`daec-2026`), scale (1.000 or 100) |
| HandicapListEntry | handicap list → HandicapList, glider type, handicap |
| Competition | name, slug (fixed at creation, unique including tombstones), organising club or person, organiser terms acceptance (accepting user → User, version → OrganiserTermsVersion, time, organising club or person as accepted, recorded once by the creator and never replaced), location, country, IANA time zone (fixed once the competition has a class day or IGC file), competition dates (a set, usually one continuous range, with the first and last date derived from it), optional website, airfield point and elevation in m MSL (optional at creation, needed for analysis, a change marks every file of the competition stale), standing notes, flight levels, upload password (generated at creation, changeable by a scorer at any time), opened airspace names (every airspace of the airspace file is closed unless its name is listed), lifecycle (live, or archived as a tombstone with the directory fields), block (staff member, time, internal note). Deleting removes the competition entirely and frees the slug |
| RuleOverrides | owner → exactly one of Class or ClassDay, then earth model, finish measured to the cylinder edge, delivery period, default zones per role (likely exposed only per class day), Dm and D1 (class day only, overriding the class), start procedure (opening and closing time, maximum start altitude and ground speed, PEV settings), tow altitude, maximum altitude, scoring end time. Every field is optional and overrides the layer above, and each is validated against the class's rule set edition. There is no competition layer |
| AirspaceFile | owner → Competition (the competition's airspace) or ClassDay (NOTAM airspaces), original file (kept for download exactly as uploaded, in any supported format). The competition's file can be replaced until archiving |
| Airspace | airspace file → AirspaceFile, name, category, lower and upper limit (each in m MSL, m AGL or a flight level), geometry |
| TurnpointFile | competition → Competition, original file (kept for download exactly as uploaded, in any supported format) |
| Turnpoint | turnpoint file → TurnpointFile, name, position, elevation, type (the CUP style name, the CUP code is not kept) |
| Class | competition → Competition, rule set edition → RuleSetEdition (picked first in the class form, changeable at any time with a confirmation, which marks the class's files stale), handicap list → HandicapList? (prefills new competitors), name, optional colour (sRGB hex), Dm, D1, handicap scale? (1.000 or 100, empty means the class isn't handicapped), deleted flag (hides the class with everything in it until restored) |
| ClassDay | class → Class, task → TaskCandidate? (the candidate published as the class day's task), date (fixed), practice flag, QNH in hPa, day status (unplanned, task published, preliminary, unofficial, final or cancelled, a working value the scorer sets), complaint deadline (working value, suggested when publishing unofficial), reasons list (one entry per kind of unpublished change, emptied by a publish), results note (working value, copied into each publish) |
| TaskCandidate | class day → ClassDay, letter? (set by the scorer for the briefing, unique per class day, needed to publish), deleted flag (restorable, never on the class day's task), task type (racing or AAT), minimum task time (AAT only), minimum finish height in m MSL, day notes |
| TaskPoint | task candidate → TaskCandidate, turnpoint name, position in the sequence, position and elevation (copied from the turnpoint file entry of that name), zone (line length, or R1, A1, R2, A2 and orientation) |
| AirspaceException | class day → ClassDay, airspace name (copied, matching every airspace of that name in the current file), direction (open or close) |
| Competitor | competition → Competition, class → Class, competition ID (unique per class, up to 5 characters), glider type, optional registration, optional display name (otherwise the crew joined with "&"), handicap (0 means not set in handicapped classes), pure glider flag, hors concours flag, competition disqualification? (required public remark, optional internal remark), deleted flag (soft delete once none of their results is flown, frees the competition ID, lasts until archiving) |
| CrewMember | competitor → Competitor, position, first name, last name, club, country (ISO code), optional IGC Ranking List ID (scorer interface only) |
| Logger | competition → Competition, manufacturer and serial (from the `A` record), ENL threshold (500), MOP threshold (500), CUR threshold (20 A), minimum duration (30 s) |
| LoggerLink | logger → Logger, competitor → Competitor, from date (empty means from the start), role (primary or secondary, at most one primary per competitor and date) |

## Flights, results and publishing

```text
Logger
└── IgcFile*                          from the A record, which every upload needs
    ├── resolves to ··> Result?       derived from the logger link valid on the flight date
    ├── Overrides?                    only while it resolves to a result
    └── Analysis                      current analysis only, also while pending or failed
        ├── AnalysisLogEntry*
        └── StaleReason*

ClassDay
├── Result*                           one per competitor of the class
│   ├── competitor ··> Competitor
│   ├── scored file ··> IgcFile?      only with status scored file, chosen by a scorer
│   ├── ManualResult?                 only with status manual result
│   └── Penalty?
├── PublishedTask?                    latest published copy only, replaced by each publish
└── PublishedResults?                 latest published copy only, replaced by each publish
    └── ResultsRow*
        ├── competitor ··> Competitor   display fields stay live
        └── file ··> IgcFile?           by hash, public download
```

| Entity | Fields |
|---|---|
| IgcFile | logger → Logger (which gives the competition), SHA-256 (an upload of a deleted file restores it as newly uploaded, any other existing hash is rejected), upload time, recorded date (`HFDTE`, never rewritten), flight date (derived: the local date of take-off, or of the first fix without one, in the competition's time zone, with the 1024-week rollover corrected), date override (set by a scorer for any other wrong date, replacing the flight date), suggested class and competition ID (the pilot's choice), G-record validation (valid, invalid or no validator, run once), private flag (keeps its hash out of published results), deleted flag (soft delete, never on a scored file, undone by a re-upload), internal remark?. Its result is derived from the logger link valid on its flight date and never stored |
| Overrides | IGC file → IgcFile, optional start (a candidate crossing or a free time), optional flight end time, turnpoint credits, AAT pinned fixes, optional finish credit or time. Distance and speed have no override. Moving the file to another class day or leaving it unresolved drops them, and a rerun after a task edit or candidate switch drops task-dependent ones whose target no longer matches, with a warning |
| Analysis | IGC file → IgcFile, engine version, state (pending or done), output (start, credited points, finish or landing, distance, time) |
| AnalysisLogEntry | analysis → Analysis, level (debug, info, warning or error), kind (maps to a rule clause per edition), evidence (a moment, an interval or the whole file), suggestion (a flight end or another candidate start) |
| StaleReason | analysis → Analysis, reason (task, start procedure, airspace, logger settings, logger link role, rule overrides, rule set edition, airfield, class day, engine version) |
| Result | class day → ClassDay, competitor → Competitor, result status (unknown, did not fly, scored file or manual result), scored file → IgcFile? (chosen by a scorer), check reasons (the review status is derived: check while any remain, otherwise OK), optional handicap override, optional public remark, internal remark?. Switching between files or to a manual result discards nothing |
| ManualResult | result → Result, optional start time, finished flag, finish time (when finished), distance (when not finished, and always on an AAT), optional landing position (racing distance helper) |
| Penalty | result → Result, points (0 makes it an official warning), public remark, internal remark |
| PublishedTask | class day → ClassDay, publish time, letter, task with AAT distances, start procedure, open, closed and NOTAM airspaces as of the publish |
| PublishedResults | class day → ClassDay, status (preliminary, unofficial, final or cancelled), publish time, complaint deadline (unofficial only), task line (letter, task type, distance, turnpoints), day parameters (N, n1, n2, Dm, D1, Do, Vo, To, Pm), results note, rule set edition, engine version, rules hash |
| ResultsRow | published results → PublishedResults, competitor → Competitor (display fields stay live), IGC file → IgcFile? (by hash, public download), copied scoring fields (handicap, hors concours, pure glider flag, class), start, finish or landing, distance, speed, points, rank (empty for hors concours, did not fly shown as "DNF" and competition disqualification shown as "DSQ"), placeholder flag ("No result yet"), penalty points with public remark, the result's public remark |

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
- Each class has its own rule set edition, so a future Grand Prix class isn't ruled out by the layering. Since [Which gaps does the MVP coverage pass leave, and how is each resolved?](https://github.com/Turbo87/keyhole/issues/152), the class form picks it, one competition can mix SWO and Annex A classes, and rule overrides have no competition layer. This revises point 4 of [Which master data does a competition carry, and how are its classes' class days created and changed?](https://github.com/Turbo87/keyhole/issues/67).
- An analysis records no Mapterhorn version. This revises [How does Keyhole cache Mapterhorn elevation tiles?](https://github.com/Turbo87/keyhole/issues/37).
- The scorer view shows no difference against the previous analysis output, so it isn't kept. This revises point 4 of [What happens when two scorers edit the same thing at once?](https://github.com/Turbo87/keyhole/issues/70).
- The 1024-week rollover correction is recomputed on every analysis instead of being stored, and a scorer's date override covers every other wrong date.
- Accepting an invitation creates the user or the membership and removes the invitation, so the invitation limit counts invited users plus unexpired invitations.
- Airspace and turnpoint files keep the original upload for download, and Keyhole works with the parsed entries, so other formats can follow. NOTAM airspaces are an airspace file owned by the class day.
- The daily password is called the upload password.
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
- [Which class day is the upload password checked against?](https://github.com/Turbo87/keyhole/issues/130)
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

A later coverage pass, [Which gaps does the MVP coverage pass leave, and how is each resolved?](https://github.com/Turbo87/keyhole/issues/152), settled the remaining gaps and brought this draft up to date with the decisions above.

A file resolves by its flight date, the local date of take-off in the competition's time zone, per [Does a file resolve by its recorded date or its local take-off date?](https://github.com/Turbo87/keyhole/issues/151), so the `HFDTE` date never picks a logger link directly.

## Not modelled

Billing fields from [How are competitors, gliders and loggers modelled, including primary and secondary loggers?](https://github.com/Turbo87/keyhole/issues/21) (billable hors concours, billable competitor count) are left out, since [How is Keyhole monetised?](https://github.com/Turbo87/keyhole/issues/10) is out of scope. Competition approval is gone since [How does Keyhole stop bots from triggering login emails to arbitrary addresses?](https://github.com/Turbo87/keyhole/issues/91), so `competition.json` "written first on approval" in [Which public JSON files exist, and which edits rewrite them without a publish?](https://github.com/Turbo87/keyhole/issues/77) reads as "written first on creation".
