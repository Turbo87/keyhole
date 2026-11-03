# Keyhole

Keyhole is a hosted scoring system for centralised gliding competitions. Users set up their competitions, collect flights and publish daily and overall results.

## Language

### Platform

**Staff**:
The people running the Keyhole platform, with access to every competition.
_Avoid_: Keyhole team, operator, admin, owner, host

**User**:
A person with a Keyhole login, who joined through an invitation from staff or another user.
_Avoid_: Account, member

**Invitation**:
An email offer to join Keyhole, optionally as an admin or scorer of a competition, which records the inviting user.
_Avoid_: Referral, signup link

**Blocked user**:
A user whom staff have barred from logging in.
_Avoid_: Banned, suspended user

### Competitions

**Competition**:
A gliding contest run on Keyhole with its own classes, days and results.
_Avoid_: Contest, event

**Archived competition**:
A finished competition whose scoring work has been removed from Keyhole, leaving only its published results, which can no longer change.
_Avoid_: Closed, deleted, completed competition

**Blocked competition**:
A competition that staff have taken down, so that it looks like it does not exist to everyone except staff.
_Avoid_: Suspended, frozen, hidden competition

**Admin**:
A user who manages a competition's identity, its members and its lifecycle, and can do everything a scorer can.
_Avoid_: Owner, competition director

**Scorer**:
A user who sets up, scores and publishes a competition.
_Avoid_: Scorekeeper, operator

**Class day**:
One class's part of a competition day, with its own task, status and published results.
_Avoid_: Day (when the class matters), task day

**Practice day**:
A class day that is flown and scored but doesn't count toward overall results.
_Avoid_: Training day

**Day status**:
How far a class day has progressed toward final results: unplanned, task published, preliminary, unofficial, final or cancelled.
_Avoid_: Result status, day state

**Cancelled day**:
A class day the scorer has called off, with or without a task. It keeps its day number and does not count toward overall results.
_Avoid_: Neutralised day, invalid day

**Day number**:
A class day's position within its class, counting every date of the competition in order, with practice days numbered separately.
_Avoid_: Task number

### Classes

**Class**:
A group of competitors in a competition that fly the same tasks and are ranked against each other, either one of the rule set's classes or a local class such as "Hasen".
_Avoid_: Category, group

**Class template**:
One of the rule set's classes, such as Club or Standard, picked when a class is set up so that its rule values and handicap list are filled in from it.
_Avoid_: Rule set class, class type

**Handicapped class**:
A class whose competitors' speeds and distances are divided by their handicaps before scoring.
_Avoid_: Index class

**Handicap**:
The number a competitor's speed or distance is divided by to even out differences between glider types, written on the class's scale of 1.000 or 100.
_Avoid_: Index, factor, Hcap

**Handicap list**:
A published edition of handicaps per glider type, such as the DAeC Indexliste 2026 or the IGC Club Class list, used to fill in competitors' handicaps.
_Avoid_: Index list (except in the DAeC list's own name)

### Competitors

**Competitor**:
One glider's entry in one class of a competition, with its competition ID, glider and crew.
_Avoid_: Pilot (when the entry is meant), participant, entrant

**Crew**:
The one or more people who fly a competitor's glider during the competition.
_Avoid_: Team (unless it is the display name), pilots

**Hors concours**:
A competitor who is scored and shown but does not rank and does not affect other competitors' points.
_Avoid_: Guest, HC (in prose), non-competing

**Logger**:
A flight recorder identified by its manufacturer and serial, linked to at most one competitor per competition, that produces IGC files.
_Avoid_: Flight recorder, FR, recorder

**Primary logger**:
The one logger of a competitor whose files are scored by default.
_Avoid_: Main logger, first logger

**Engine run**:
A stretch of a flight where a logger's ENL, MOP or current channel stays at or above its threshold for at least the minimum duration, both set per logger. An engine run after the start ends the flight at its first fix above the threshold.
_Avoid_: Motor run, engine use, MoP run

### Scoring rules

**Rule set**:
A published body of competition rules that defines how flights are scored, such as the DAeC SWO or the IGC Sporting Code Annex A.
_Avoid_: Scoring script, ruleset formula

**Local procedures**:
Competition-specific adjustments to the rule set's parameters, such as a minimum scoring distance of 50 km instead of 100 km.
_Avoid_: Overrides, custom rules

**Earth model**:
The shape of the Earth that distances and observation zones are calculated on, either the WGS84 ellipsoid or the FAI Sphere with a radius of 6371 km.
_Avoid_: Datum, geoid, earth radius

### Tasks

**Task**:
The course a class flies on a class day: an ordered list of turnpoints from start to finish, each with an observation zone. A class day has at most one published task, which keeps the letter of the candidate it was published from.
_Avoid_: Route, course

**Task candidate**:
A task prepared for a class day under a letter such as A, B or C, with its own task sheet, which the scorer can publish as the class day's task. Candidates that are never published stay private.
_Avoid_: Alternative task, task variant

**Task sheet**:
The printed sheet for one task candidate that pilots get at briefing, with the task, launch and start settings, limits, airspace, QNH, notes, map, task QR code and daily password.
_Avoid_: Task briefing sheet, Aufgabenblatt (in prose)

**Standing notes**:
A competition's free text printed on every task sheet, such as frequencies, emergency phone and relight area.
_Avoid_: Competition notes, template

**Day notes**:
A task candidate's free text printed on its task sheet, such as grid time, expected first launch and runway.
_Avoid_: Task notes, briefing notes

**Racing task**:
A task whose turnpoints must be reached in order, scored by speed over the task distance.
_Avoid_: Speed task, polygon

**Assigned area task (AAT)**:
A task whose assigned areas must be reached in order within a minimum task time, where pilots choose how deep to fly into each area.
_Avoid_: Area task, turn area task

**Minimum task time**:
The shortest time an assigned area task is scored over. A pilot who finishes sooner is scored as if they had flown for this long.
_Avoid_: Designated time, task time

**Turnpoint file**:
The competition's published list of turnpoints that its tasks may use.
_Avoid_: Waypoint file, control point file

**Turnpoint**:
A named location from the turnpoint file that a task uses as its start, its finish or a point in between.
_Avoid_: Waypoint, control point, task point

**Observation zone**:
The area or line around a reference point that a flight has to reach or cross, such as a line, cylinder, sector or keyhole.
_Avoid_: OZ, turn area (when the shape matters)

**Reference point**:
The point an observation zone is built around and that task distance is measured from: a line's midpoint, a cylinder's centre or a sector's apex.
_Avoid_: Task point, centre, turnpoint (the named location a reference point is taken from)

**Line**:
An observation zone shaped as a straight line through its reference point, used for starts and finishes.
_Avoid_: Gate

**Cylinder**:
An observation zone shaped as a circle of a given radius around its reference point, used for starts, turnpoints, assigned areas and finishes.
_Avoid_: Ring, circle, barrel

**Keyhole**:
The SWO observation zone for racing task turnpoints between start and finish: a 10 km 90° slice of a circle facing away from the course, joined with a 0.5 km cylinder.
_Avoid_: DAeC sector

**Assigned area**:
The observation zone around a turnpoint of an assigned area task, inside which pilots choose where to turn.
_Avoid_: Turn area, AAT sector

**Start procedure**:
How starts work on a class day: the type of start and its options, such as a PEV start, with the start opening and closing times and the maximum start altitude and ground speed.
_Avoid_: Start settings, start rules

**Start opening time**:
The time from which starts are valid on a class day.
_Avoid_: Gate opening, start gate

**Start closing time**:
The time after which starts are no longer valid on a class day.
_Avoid_: Gate closing

**PEV**:
A pilot event marker that the pilot sets by pressing a button on the logger, recorded in the IGC file. Some rule sets use it to time a start.
_Avoid_: Marker, event button

**Credited start point**:
Where a flight's start is credited and where its task distance is measured from, either the reference point of the start's observation zone or the glider's position at the start time.
_Avoid_: Start position, start fix

**Maximum loss of height (MLoH)**:
The most height a pilot may lose between start and finish without a penalty, set per day.
_Avoid_: Height limit, max height loss

**Minimum finish height**:
The lowest altitude in m MSL at which a flight may reach the finish without a penalty.
_Avoid_: Finish altitude

**Tow altitude**:
The highest altitude in m MSL that a class day allows for releasing from a launch or climbing on the engine before the start. Analysis warns when a flight exceeds it.
_Avoid_: Release height, tow height

**Maximum altitude**:
The highest altitude in m MSL that a flight may reach at any point on a class day, usually set once for the whole competition.
_Avoid_: Ceiling, max height, sporting limit

**Scoring end time**:
The time on a class day after which a flight earns no further distance or speed, as if it had landed then.
_Avoid_: Scoring end, finish closing time

**QNH**:
The day's air pressure at sea level in hPa, printed on the task sheet with the competition's flight levels converted to m MSL. Scoring does not use it.
_Avoid_: Altimeter setting, pressure

### Airspace

**Airspace file**:
The competition's OpenAir airspace file, as uploaded by the organiser and fixed once the first flight is uploaded.
_Avoid_: Airspace data, airspace database

**Closed airspace**:
An airspace that competitors must not enter on a class day. Every airspace in the airspace file is closed unless the competition opens it or a class day's airspace exception opens it, and a class day's NOTAM airspaces are always closed.
_Avoid_: Forbidden airspace, prohibited airspace (prohibited is an ICAO type), active airspace

**Airspace exception**:
A class day's change to whether one airspace of the airspace file is closed, for the whole day and in either direction.
_Avoid_: Airspace override, activation

**NOTAM airspace**:
An airspace added to one class day only and closed on that day, such as a temporary restricted area published by NOTAM.
_Avoid_: Temporary airspace, day airspace, additional airspace

### Flights and results

**Flight analysis**:
Working out from a flight's IGC file what the pilot achieved on the day's task.
_Avoid_: Evaluation, check

**Stale analysis**:
A file's flight analysis whose inputs, or the version of Keyhole that analysed it, changed after it ran. It keeps its result until the scorer analyses the file again, and records why it became stale.
_Avoid_: Outdated analysis, invalid analysis

**Recorded date**:
The date an IGC file states for its flight in its `HFDTE` header. It can differ from the class day the file is assigned to, mostly because some older loggers with faulty GPS modules record dates exactly 1024 weeks early after a GPS week number rollover.
_Avoid_: File date, flight date

**Analysis log**:
The list of entries produced while analysing one uploaded IGC file, available even if parsing fails. Debug entries are hidden by default.
_Avoid_: Timeline, event log

**Analysis log entry**:
A message produced while analysing one uploaded IGC file, with the level debug, info, warning or error and supporting evidence where applicable. An entry can concern a moment, an interval or the whole file.
_Avoid_: Finding, event, timeline entry

**Analysis log level**:
What an analysis log entry means:

- **Debug**: Diagnostic detail useful for investigating analysis behaviour.
- **Info**: Routine information, such as take-off, aerotow release or an engine run before the start.
- **Warning**: Something the scorer needs to review, such as a possible airspace infringement.
- **Error**: Something could not be processed, such as an uploaded file failing to parse. The entry identifies what failed, whether the whole file or one analysis check.

Debug and info entries do not require review. Errors indicate incomplete or failed processing; acknowledging an error does not make the missing analysis complete.
_Avoid_: Severity

**Review item**:
Something about a competitor's class day that the scorer has to settle, such as a file arriving for a competitor marked did not fly, raised outside flight analysis. Unlike an analysis log entry, it does not come from a file's analysis.
_Avoid_: Notice, discrepancy, conflict

**Flight result**:
What a pilot achieved on a day (start, turnpoints, finish or landing, distance and time), whether from flight analysis or entered by the scorer.
_Avoid_: Performance, score

**Manual result**:
A flight result entered by the scorer instead of analysed from a scored file.
_Avoid_: Manual entry, virtual result

**Override**:
A scorer's correction of one part of an analysed flight result, such as the start or the flight end, that stays in place when the flight is analysed again.
_Avoid_: Correction, adjustment

**Launch status**:
Whether a competitor launched on a class day: unresolved, launched or did not fly. Competitors who launched count toward the day's number of competitors.
_Avoid_: Start status, DNS, DNF

**Placeholder result**:
The best result of a class day so far, which preliminary scoring assumes for a competitor with unresolved launch status until their flight result arrives. It counts toward the day's parameters but gets no points or rank.
_Avoid_: Hidden finisher, pending competitor, assumed result

**Penalty**:
Points a scorer deducts from a competitor's day score for a rule breach, shown with a public remark. A day score never goes below zero, so a large penalty disqualifies the competitor for the day.
_Avoid_: Deduction, Strafpunkte

**Official warning**:
A public remark about a rule breach that deducts no points.
_Avoid_: Warning (alone), caution, Verwarnung (in prose)

**Scored file**:
The one IGC file a flight result is analysed and scored from.
_Avoid_: Main file, active flight

**Publish**:
Make a class day's task or results visible to the public as a fixed copy that stays unchanged until the scorer publishes it again.
_Avoid_: Release

**Results note**:
A scorer's public remark published with a class day's results, such as which complaints led to changes or which flights are still missing.
_Avoid_: Announcement, changelog, publication comment

**Results sheet**:
The printed daily or overall results of a class, rendered from the last publish, which a competition official signs for the notice board.
_Avoid_: Score sheet, results printout

**Review status**:
Whether a scorer still has to look at a flight result:

- **OK**: The analysis reported no warnings or errors, or the result is a manual result.
- **Check**: The analysis reported warnings or errors that no scorer has reviewed.
- **Reviewed**: A scorer reviewed the analysis output that is currently shown.
- **Changed since review**: Analysis ran again after a scorer's review and produced a different output.

_Avoid_: Flight status, check status, manually OK

**Confirmation**:
A scorer's recorded decision to depart from the rule set, such as publishing unofficial results while flights are still in check, with the scorer, time and rule concerned.
_Avoid_: Override, waiver, exception
