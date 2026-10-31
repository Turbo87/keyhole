# Keyhole

Keyhole is a hosted scoring system for centralised gliding competitions. Users set up their competitions, collect flights and publish daily and overall results.

## Language

### Platform

**Keyhole team**:
The people running the Keyhole platform.
_Avoid_: Operator, admin, owner, host

**User**:
A person with a Keyhole login who works on one or more competitions.
_Avoid_: Account, member

### Competitions

**Competition**:
A gliding contest run on Keyhole with its own classes, days and results, and invoiced as one unit.
_Avoid_: Contest, event

**Approved competition**:
A competition the Keyhole team has accepted, which makes it publicly visible and lifts the limits on competitions awaiting approval.
_Avoid_: Confirmed, activated, verified competition

**Billing details**:
The name, postal address, email and optional VAT ID that a competition is invoiced to.
_Avoid_: Invoice address, customer data

**Admin**:
A user who manages a competition, including its billing details and who works on it.
_Avoid_: Owner, competition director

**Scorer**:
A user who enters tasks, processes flights and releases results for a competition.
_Avoid_: Scorekeeper, operator

**Class day**:
One class's part of a competition day, with its own task, status and published results.
_Avoid_: Day (when the class matters), task day

**Practice day**:
A class day that is flown and scored but doesn't count toward overall results.
_Avoid_: Training day

**Day status**:
How far a class day has progressed toward final results: no task, task published, preliminary, unofficial, final or cancelled.
_Avoid_: Result status, day state

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
A flight recorder identified by its manufacturer and serial, assigned to a competitor, that produces IGC files.
_Avoid_: Flight recorder, FR, recorder

**Primary logger**:
The one logger of a competitor whose files are scored by default.
_Avoid_: Main logger, first logger

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

**Observation zone**:
The area or line around a reference point that a flight has to reach or cross, such as a line, cylinder, sector or keyhole.
_Avoid_: OZ, turn area (when the shape matters)

**Reference point**:
The point an observation zone is built around and that task distance is measured from: a line's midpoint, a cylinder's centre or a sector's apex.
_Avoid_: Task point, centre, waypoint (a waypoint is an entry in a turnpoint file)

**Line**:
An observation zone shaped as a straight line through its reference point, used for starts and finishes.
_Avoid_: Gate

**Cylinder**:
An observation zone shaped as a circle of a given radius around its reference point, used for starts, turnpoints and finishes.
_Avoid_: Ring, circle, barrel

**PEV**:
A pilot event marker that the pilot sets by pressing a button on the logger, recorded in the IGC file. Some rule sets use it to time a start.
_Avoid_: Marker, event button

**Credited start point**:
Where a flight's start is credited and where its task distance is measured from, either the reference point of the start's observation zone or the glider's position at the start time.
_Avoid_: Start position, start fix

**Maximum loss of height (MLoH)**:
The most height a pilot may lose between start and finish without a penalty, set per day.
_Avoid_: Height limit, max height loss

### Flights and results

**Flight analysis**:
Working out from a flight's IGC file what the pilot achieved on the day's task.
_Avoid_: Evaluation, check

**Finding**:
Something flight analysis reports for the scorer to judge, such as an airspace entry or an engine run, with its evidence.
_Avoid_: Warning, event

**Flight result**:
What a pilot achieved on a day (start, turnpoints, finish or landing, distance and time), whether from flight analysis or entered by the scorer.
_Avoid_: Performance, score

**Scored file**:
The one IGC file a flight result is analysed and scored from.
_Avoid_: Main file, active flight

**Publish**:
Make a class day's results visible to the public as a fixed copy that stays unchanged until the scorer publishes again.
_Avoid_: Release

**Review status**:
Whether a scorer still has to look at a flight result: check, OK or manually OK.
_Avoid_: Flight status, check status
