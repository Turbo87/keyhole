# Scoring rules: DAeC SWO and FAI/IGC Annex A

Research for ticket #2, collected 2026-10-30. It covers what the current DAeC SWO and FAI Sporting Code Section 3 Annex A define for scoring, how the two differ, which parameters local procedures change, and where SeeYou's scoring script differs from the written rules.

## Sources

| Short name | Document | Edition | URL |
|---|---|---|---|
| SWO | DAeC Bundeskommission Segelflug, "Wettbewerbsordnung für Segelflugmeisterschaften (SWO), Fachliche Bestimmungen" | Ausgabe 2026, valid from 1 March 2026 (PDF created 24 Feb 2026) | https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026.pdf |
| SWO-C | SWO Anlage C "Organisation von Meisterschaften" | Ausgabe 2026, valid from 1 March 2026 | https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026-Anlage-C.pdf |
| SWO-F | SWO Anlage F "Ausführungsbestimmungen für Wettbewerbe nach SWO" (template local procedures) | Ausgabe 2026, valid from 1 March 2026 | https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026-Anlage-F.pdf |
| Annex A | FAI Sporting Code Section 3 Annex A, "Rules for World and Continental Gliding Championships" | 2025a Edition, valid from 15 April 2026 | https://www.fai.org/sites/default/files/document/file/SC3A_2025a.pdf |
| AltScoring | IGC "Alternative Scoring – Gliding" | 7 February 2022 | https://www.fai.org/sites/default/files/altscoring.pdf |
| Naviter script | `igc_annex_a/AnnexA_scoring.pas` in naviter/seeyou_competition_scripts, script "Version 10.0 Date 2023.10.30" | commit `496773b`, 2024-07-22 | https://github.com/naviter/seeyou_competition_scripts/blob/496773b/igc_annex_a/AnnexA_scoring.pas |
| Naviter README | Script variable reference in the same repo | commit `496773b` | https://github.com/naviter/seeyou_competition_scripts/blob/496773b/README.md |
| DM 2026 | Local procedures, German Championships Standard and 15 m, Zwickau | April 2026 | https://dm.acz.de/wp-content/uploads/2026/04/Ausfuehrungsbestimmungen-DM-2026-in-Zwickau.pdf |
| Hotzenwald 2026 | Local procedures, 61st Hotzenwald competition | V1, 21 Jan 2026 | https://www.soaringspot.com/uploads/050/5091/files/AF-DE-2026_Ausfuhrung_61_Hotzenwaldwettbewerb_V1.pdf |
| EuregioCup 2026 | Announcement (Ausschreibung), EuregioCup Aachen-Merzbrück | Dec 2025 upload | https://www.lv-aachen.de/wp-content/uploads/2025/12/EC26-Ausschreibung.pdf |

The DAeC download page that links the current SWO files is https://www.daec.de/sportarten/segelflug/downloads-termine/. The FAI page that links the current Annex A is https://www.fai.org/page/documents-0.

## Verification status

Verified means read in the cited primary document. Everything in the comparison tables below was verified unless marked otherwise.

Not verified:

- **EuregioCup 50 km minimum distance.** The EuregioCup 2026 announcement does not state a minimum distance. It says the event runs under the FAI Sporting Code, the SWO, the announcement and the opening briefing, and that the organisers may change the rules at the opening or daily briefing (EuregioCup 2026, 6.4 and 6.10). The 50 km value presumably lives in the briefing or an unpublished local procedures document. It is consistent with the 2025 SoaringSpot listing of a Hasen AAT with a 57.41 km minimum task distance, far below the SWO Dm of 120 km.
- **Earth model in Annex A.** The SWO prescribes a WGS84 ellipsoid (SWO 14.3). Annex A itself does not mention one. The distance model for FAI events lives in the Sporting Code General Section or Section 3, which this research did not read.
- **Rounding in SeeYou scripts.** The Naviter script uses Pascal `Round()`. Delphi's `Round()` rounds half to even, while both rule sets require 0.5 to round up. Whether Innerfuse/RemObjects Pascal Script inherits banker's rounding was not tested.
- **Which script German scorers actually run.** Anlage C, Anlage F and DM 2026 name SeeYou as the scoring software. The Naviter repository has no SWO-specific script, but its Annex A script contains SWO-motivated features (start speed check "according to DAEC SWO 7.3.5"). Whether German scorers use that script unchanged or a private fork was not verified.
- **How SeeYou picks among multiple starts.** This happens in SeeYou itself, not in the script. The script receives all valid start crossings in `PotStarts` (Naviter README). See the SeeYou section for the circumstantial evidence.

## Precedence

The SWO governs all German championships and their qualifying championships and is recommended for other competitions (SWO 1.2). Where it is silent, the order is: law, opening briefing, local procedures and self-briefing, SWO with annexes, then the FAI Sporting Code General Section and Section 3 Annex A (SWO 1.4). Its scoring explicitly follows the Annex A 1000-point system, and the current Annex A applies where the SWO is silent or unclear (SWO 13.1.1). Local procedures only need to list deviations from the SWO (SWO 14.1).

Annex A applies to World and Continental Championships. It requires that local procedures name the scoring system (Classic or Alternative) per class and the scoring program name and version, and that a checksum or hash of the scoring algorithm is published with the daily results (Annex A 8.1, 8.1.1).

## Task types

| | SWO 2026 | Annex A 2025a |
|---|---|---|
| Types | Racing Task (RT), Assigned Area Task (AAT) (SWO 6.1) | RT, AAT, Distance Handicap Task (DHT) (6.1) |
| Mix rule | Both types roughly balanced. At least every third scoring day is an AAT (SWO 6) | No single type on more than 67 % of days (6.1) |
| RT distance | From the start line midpoint via all turnpoints to the finish ring centre minus its radius (SWO 6.2.1) | Same, from the Start Point or Credited Start Point (6.3.1c) |
| AAT distance | Through all areas to the finish (SWO 6.2.2). The SWO does not spell out the credited fix rule | Scorer chooses the set of credited fixes giving the maximum distance (6.3.2c) |
| AAT time | Marking time is the elapsed time or the minimum time, whichever is longer (SWO 6.2.2) | Same (6.3.2d iv) |
| Outlanding distance, RT | Distance via the turnpoints reached in order to the next one, minus the distance from the landing point to it (SWO 6.2.1) | Same, with achieved distance on the leg floored at zero (6.3.1d) |
| Outlanding distance, AAT | Via the areas reached, to the nearest point of the next area, minus the distance from the landing point to that point (SWO 6.2.2) | Same, floored at zero (6.3.2d iii) |
| DHT | Not defined | RT where each turnpoint cylinder radius depends on the glider's handicap and the turn angle. The algorithm is given in the local procedures and must be approved by IGC (6.3.3) |
| Steering point | Not mentioned | Allowed for all task types to align the last leg (6.2) |

## Day and point formulas

Both documents use the same "classic" formula. The SWO calls the 1000-point distance `DM` and Annex A calls it `D1`. The SWO uses `I` for the index and Annex A uses `H` for the handicap.

Day parameters (SWO 13.2, 13.4 and 13.5, Annex A 8.3.1 and 8.4):

```
Pm  = min(1000, 1250 * Do / D1 - 250, 400 * To - 200)   # To in hours
F   = min(1, 1.25 * n1 / N)
FCR = min(1, 1.2 * n2 / n1 + 0.6)
Pvm = 2/3 * (n2 / N) * Pm
Pdm = Pm - Pvm
```

Competitor score:

```
finisher:      Pv = Pvm * (Vh - 2/3 Vo) / (1/3 Vo), Pv = 0 if Vh < 2/3 Vo
               Pd = Pdm
non-finisher:  Pv = 0
               Pd = Pdm * Dh / Do
S = F * FCR * (Pv + Pd) - penalties, floored at 0, rounded half up
```

Definitions:

| Symbol | Meaning |
|---|---|
| Dm | Minimum handicapped distance to validate the day: 100 km Club and 13.5 m, 120 km Standard, 15 m and two-seater, 140 km 18 m and Open (identical in both) |
| D1 / DM | Distance for the full 1000 points: 250, 300, 350 km for the same class groups (identical in both) |
| N | Competitors who launched that day. The SWO stresses "launched from the contest airfield, whether or not they started" |
| n1 | Competitors with Dh ≥ Dm |
| n2 | Finishers with Vh > 2/3 Vo |
| n3, n4 | Annex A only: finishers regardless of speed, and competitors with Dh ≥ Dm/2. Unused in the classic formula, used by Alternative Scoring |
| Do | Highest handicapped distance of the day |
| Vo, To | Highest handicapped finisher speed and that finisher's marking time. Ties take the lower T. Annex A sets To = 100 h when there are no finishers, the SWO says the time term only applies "with speed scoring because of finishers". The effect is the same |
| Dh, Vh | D / H and V / H |

Common rules:

- **Day validity.** Every competitor had a launch opportunity and more than 25 % of launched competitors reached Dh ≥ Dm (SWO 13.4.1, Annex A 8.2.1). Otherwise all scores are 0, but some penalties still count (see below).
- **Handicaps** are applied before anything else, by dividing speed (finishers) or distance (non-finishers) by the handicap (SWO 13.3, Annex A 8.3.2). The SWO always uses handicaps in Club and two-seater classes and in all classes at qualifying championships (SWO 13.3), with the DAeC index list (Anlage I) or the IGC lists for Club and two-seater (SWO 2.1). Annex A uses them in Club Class and, at Continental Championships only, optionally in the 20 m Multi-seat Class (8.2.4).
- **Mixed classes.** The SWO recommends using the minimum distances of the weakest glider and the cross-class DAeC index list (SWO 13.4.1).
- **Rounding and precision.** Scores are whole numbers, 0.5 rounds up (SWO 13.1.2, Annex A 8.2.2). The SWO measures times to whole seconds and distances to 0.1 km (SWO 13.1.4) on a WGS84 ellipsoid (SWO 14.3). Annex A interpolates start and finish times to the nearest second (7.4.3.1, 7.8.1).
- **Disqualified flights** score 0 but still count in the day parameters (SWO 13.6, Annex A 8.2.5).
- **Penalties that reduce performance** (for example outlanded at the airspace entry point) are applied before the score is calculated. Point penalties are deducted afterwards (Annex A 8.2.5, SWO 13.6).
- **Preliminary results.** Until the finish closes, competitors not yet accounted for are treated as finishers with Dh ≥ Dm and Vh = Vo but are not shown (SWO 13.2 note, Annex A 8.3.2 note).
- **Totals** are the sum of daily scores (SWO 12.3, Annex A 8.2.6). The SWO ranks equal points equally (SWO 13.1.3).

### Alternative Scoring (Annex A option)

Annex A allows organisers to choose the IGC "Alternative Scoring" per class instead of the classic formula (Annex A Part 8 introduction, 8.1). It awards either distance or speed points, never both (AltScoring 8.4.1):

```
F   = Pm / 1000
FCR = min(1, 1.2 * n3 / n1 + 0.6)
Pv  = 1000 * Vh / Vo          (finishers)
Pd  = 750 * Dh / Do           (everyone)
SP  = F * FCR * max(Pv, Pd)
S   = SP * min(1, 200 / (SP0 - SPm))
```

SP0 is the highest provisional score and SPm the median provisional score excluding zeros. The SWO does not offer this system. Naviter ships a script for it (`AnnexA_AlternativeScoring.pas`), which this research did not review.

## Start rules

| | SWO 2026 | Annex A 2025a |
|---|---|---|
| Geometry | Start line, at most 20 km long, several start points possible (SWO 7.3.1, 7.3.2) | Line Start of defined length perpendicular to the first leg (7.4.3). Cylinder Start (radius ≥ 10 km, PEV-defined start, loss-of-height limit) only with an IGC Bureau waiver (7.4.4) |
| Opening | At least 30 min after the last regular launch of the class, announced at 30, 20, 10 and 5 min, can be postponed by at least 15 min (SWO 7.3.6, 7.3.7) | Normally 30 min after the last launch offer, at least 20 min (7.4.2.1) |
| Closing | Not specified | Contest sunset, all competitors accounted for, or as in local procedures (7.4.2.1b) |
| Pre-start altitude | Not defined | Optional, at least one fix below it after gate opening, 1 pt/m above (7.4.2.2, 8.7) |
| Max start altitude | Set by the organisers (SWO 7.3.4) | Optional Energy Control (7.4.3.5a) |
| Max start ground speed | Average speed from 8 s before to 8 s after the crossing (SWO 7.3.4) | Straight-line distance between the fixes nearest 8 s before and after, divided by their time difference (7.4.3.5b) |
| PEV start | Optional. Window opens 10 min after PEV and stays open 7 min. Up to 3 PEVs per day, PEVs within 30 s count as one, gate postponement resets the count (SWO 7.3.5) | Optional. Wait time and window are each 5 to 10 min and printed on the task sheet. Up to 3 PEVs per launch, same 30 s clustering and reset rules (7.4.3.2, 7.4.3.4) |
| Multiple starts | The start giving the most points is used (SWO 7.3.8) | Same. A start after a completed task is invalid, only the first completion counts (7.4.3.6) |
| Start line tolerance | ≤ 0.5 km from the line: 50 pts. Further: no valid start (SWO 7.5, 10.5.8) | Same (7.4.3.3, 8.7) |

## Turnpoints and areas

| | SWO 2026 | Annex A 2025a |
|---|---|---|
| RT observation zone | Keyhole: 0.5 km cylinder plus a 90° sector of 10 km radius, symmetric about the bisector (drawing in SWO 7.4.1) | 500 m cylinder. For DHT the radius comes from the task sheet (7.6.1) |
| AAT areas | Circle, or sector between two radials up to a maximum radius (SWO 7.4.2) | Same, with an optional minimum radius (7.6.2) |
| Area separation | At least 1 km (SWO 7.4.2) | Same (7.6.3) |
| Achievement | A fix inside, or a line between two consecutive fixes intersecting or touching the zone (SWO 7.4.1, 7.4.2) | Same (7.6.4) |
| Near miss | Within 0.5 km: 50 pts or no credit. Further: not achieved (SWO 7.5, 10.5.8) | Within 500 m: the scorer picks the better of credit with 50 pts or no credit (7.6.5, 8.7) |

## Finish rules

| | SWO 2026 | Annex A 2025a |
|---|---|---|
| Geometry | Finish ring with radius ≥ 5 km and a minimum altitude (SWO 7.6.1) | Finish ring with radius ≥ 3 km (preferred) or finish line, each with a minimum altitude (7.8.2) |
| Finish time | First entry into the ring after the last turnpoint, at any height (SWO 7.6.4) | First crossing or entry, interpolated to the second (7.8.1) |
| Below minimum height | ≤ 100 m below: 1 pt/m, at most Pv. More than 100 m: Pv = 0 and outlanding at the last fix before the ring (SWO 10.5.8) | 1 pt/m, at most the achieved speed points (8.7) |
| Landing inside the airfield without finishing | Not defined | Finished, with the time the glider stopped plus 5 min (7.8.3b) |
| Scoring end | Set by the organisers. Before sunset it acts as a virtual outlanding at that time (SWO 7.7) | Finish closes at contest sunset or when all are accounted for. Competitors still on task are outlanded at the last fix before closing (7.8.4c) |
| Landing after sunset | Day disqualification (SWO 10.5.8) | 10 pts/min first offence, day DQ for repeats (8.7) |

## Outlandings, engines and recorders

- **Real outlanding position.** Annex A takes the first of: glider at rest, engine (MoP) start, or end of recording (7.7.1). The SWO defines an outlanding as any landing outside the contest airfield boundary (SWO 7.2.8).
- **Virtual outlanding.** In both, the fix representing the best performance is used as the outlanding position and time (SWO 7.8.3, Annex A 7.7.2). Under the SWO, a virtual outlanding also ends the competition flight and the pilot must return (SWO 7.8.4). Anlage F offers an optional rule that the last valid fix must be at least 200 m AGL immediately before landing or engine start, using the scoring software's terrain model (SWO-F 11).
- **Engine use.** SWO: any engine use other than self-launch, relaunch, or engine test is a virtual outlanding (SWO 7.2.10). Annex A: starting the MoP, apart from the permitted procedures, is a real outlanding (7.7.1c). Both require the engine to be stopped in the release area below a maximum height, with 1 pt/m above it (SWO 4.6 and 10.5.8, Annex A 7.3.2a and 8.7). The SWO permits an in-air relaunch in the circuit, with a start allowed no earlier than 20 min after engine stop (SWO 7.2.9). Annex A allows in-air restarts only if the local procedures describe them and every glider in the class has an engine (7.3.2c).
- **Recorder outage.** In both, losing all designated recorders for more than one minute counts as an outlanding unless there is evidence of no airspace infringement or engine use (SWO 5.9.7, Annex A 5.3e).
- **Recorders.** At most two IGC-approved recorders with one designated primary, recording at 1 s (SWO 5.9.3 and 5.9.4, Annex A 5.3b and 5.3c). The primary log is scored and the secondary can fill gaps (Annex A 5.3g). Only the primary counts for PEV (both). The SWO forbids mixing altitude data from several recorders (SWO 5.9.9).
- **Altitude reference.** SWO: all altitude limits refer to altitude derived from the reference height at take-off (SWO 10.3). Annex A: MSL is the recorded pressure altitude difference from take-off plus field elevation. QNH and QNE are derived from that (5.3.1).
- **Relaunches.** The SWO allows unlimited launches, but a field landing ends the day unless caused by a launch failure (SWO 7.2.5, 7.2.8). Annex A allows at most three launches (7.3.1).

## Penalty catalogue

| Offence | SWO 2026 (10.5.8) | Annex A 2025a (8.7, first offence) |
|---|---|---|
| Overweight | 2 pts/kg | 2 pts/kg, multiplied by the offence number on repeats |
| Club Class weight deviation over ±10 kg from the reference | 3 pts/kg | n/a |
| Additional recorder used | 10 pts | Changing recorder without notice: 10, 20, max 25 |
| Recording interval over 1 s | Warning, then 10 pts | Warning, then 10, max 25 |
| Recorder switched on too late | 10 pts | n/a |
| Tracker refused or misconfigured | 10 pts | n/a |
| Late documentation or incomplete outlanding report | Warning, then discretionary | Warning, then 10, max 25 |
| No documentation | Disqualification | n/a |
| Missing take-off pressure altitude | n/a | 10, then 25 |
| Start line 0 to 0.5 km away | 50 | 50 |
| Start altitude above maximum | 1 pt per 3 m, rounded, no upper limit | 1 pt/m up to 100 m, no valid start above that |
| Start ground speed above maximum | 1 pt per 3 km/h, rounded, no upper limit | 2 pts per km/h up to 50 km/h, no valid start above that |
| PEV start violation | 1 pt per second outside the window, max 60, also if no PEV | No PEV: 60. Outside the window: 1 pt/s, max 60 |
| Turnpoint 0 to 0.5 km away | 50 or no credit | 50 |
| Finish below minimum height | See the finish table | 1 pt/m, max achieved speed points |
| Airspace infringement | Virtual outlanding | Outlanded at the entry point, then day DQ, then DQ |
| Airspace buffer (sporting limit) up to 100 m | n/a | 1 pt/m. More than 100 m: outlanded at that point |
| Above maximum altitude without airspace infringement | Up to 100 m: 1 pt/m. More than 100 m: virtual outlanding | Covered by the sporting limit row |
| Engine above shut-down height | 1 pt/m | Self-launch above limit: 1 pt/m, n pts/m on repeats |
| Late engine start after release | Discretionary | Warning, then (n-1) × 25 |
| Cloud flying, aerobatics, hazardous flying | Discretionary | 100 pts for hazardous flying with intent, otherwise 10 pts, escalating |
| Landing after sunset | Day DQ | 10 pts/min |
| Unreported crew change | Day DQ | n/a |
| Span exceeded | 1 pt per cm per day | 1 pt/cm after subtracting 0.3 cm |
| Cheating | DQ | DQ |

Penalties that apply even on invalid days or training days: airspace infringement, dangerous flying, doping and alcohol (SWO 10.5.2), or forbidden airspace and unsporting behaviour (Annex A 8.6.1, 8.6.6). The SWO airspace and recorder penalties use "warning, then points at the director's discretion" in several rows where Annex A has fixed escalation tables. Annex A also allows a general warning at briefing that replaces the first-offence warning for everyone (8.6.2).

## Results status

| SWO (8.7) | Annex A (10.1.1) |
|---|---|
| Vorläufig (preliminary): before flight data checks, optional | Preliminary |
| Inoffiziell (unofficial): after all checks and penalties, signed with the end of the complaint period, which is 14 h after publication | Unofficial |
| Endgültig (final): after the complaint period or after complaints are decided | Final |

Under the SWO, a day can only be neutralised retroactively before unofficial results are published (SWO 7.9.5), and errors always reset a day to unofficial (SWO 8.7). Annex A adds a "Jamming Day" determination before unofficial results, which can keep results preliminary or cancel the day (7.11.4).

## Parameters that local procedures change

Both rule sets expect local procedures to set many parameters, and real competitions also override fixed values. The values below come from the cited 2026 documents.

| Parameter | Rule default | Observed local values |
|---|---|---|
| Minimum day distance Dm | 100/120/140 km by class | EuregioCup reportedly uses 50 km (not verified, see above) |
| Distance for 1000 points D1 | 250/300/350 km by class | No published override found |
| Classes | SWO and IGC classes | EuregioCup uses two local classes, "Igel" (IGC Club Class and below, no water) and "Hasen" (DAeC index 107 and above, water allowed) (EuregioCup 2026, 6.6) |
| Handicap list | DAeC index (Anlage I) or IGC lists | EuregioCup: IGC Club Class list for Igel, DAeC competition index 2026 for Hasen (6.7) |
| Task types | RT, AAT (SWO) | Hotzenwald adds a handicapped-distance RT in which cylinder radii depend on the index, so an index 120 glider flies 20 % further than an index 100 glider (Hotzenwald 2026, 9.2) |
| RT observation zone | SWO keyhole, Annex A 500 m cylinder | Hotzenwald uses the keyhole "unless briefed otherwise" (9.2) |
| Start opening delay | 30 min after last launch (SWO) | Hotzenwald: 15 min, announced at 15, 10 and 5 min (9.1) |
| Max start altitude | Set daily | Hotzenwald: none (9.1) |
| PEV start | Optional | DM 2026: may be used (10.2) |
| Start closing time | Not in SWO | DM 2026: announced at briefing or on the task sheet (10.2) |
| Finish geometry | SWO ring ≥ 5 km | DM 2026: 5 km ring, 300 m above the reference point (10.3). Hotzenwald: 2 km finish line with 150 m minimum (9.3) |
| Finish height penalty | Points | Hotzenwald: 1 penalty minute per 10 m between 100 and 150 m, flight not scored below 100 m, straight-in landing without crossing adds 5 min (9.3) |
| Airspace penalty | SWO: virtual outlanding | Hotzenwald: virtual outlanding, then day DQ, then competition DQ (9.2), which follows Annex A |
| Log delivery deadline | 45 min after landing (SWO 5.9.8) | Hotzenwald: 30 min (9.3) |
| Last valid fix | Best performance point | Anlage F option: last fix at least 200 m AGL (SWO-F 11) |
| Protest fee | 200 EUR (SWO 10.7.4) | Hotzenwald: 300 EUR (10) |
| Weather-dependent daily values | Set at briefing | QNH, max start altitude, finish altitude, scoring end, task time, start points, airspace activations |

Two observations matter for a scoring system. Time penalties ("Strafminuten") appear in local procedures even though neither rule set uses them for line starts, so penalties need both a points kind and a time kind. Annex A's Cylinder Start also uses added minutes (8.7). And local classes like "Igel" and "Hasen" do not map to a fixed Dm/D1 class table, so Dm and D1 must be configurable per class rather than derived from a class name.

## SeeYou deviations

German championships score with SeeYou Competition: Anlage C lists "create the competition in SeeYou and Soaringspot" as a setup step (SWO-C 5, item 34a), and both the Anlage F template and DM 2026 name "SeeYou" as the scoring software (SWO-F 12, DM 2026 13). In SeeYou the program computes marking distance, speed, start and finish, and a Pascal script turns them into points (Naviter README). The findings below come from reading the official Annex A script (Naviter script, commit `496773b`). They describe the script as published, not necessarily what a given competition ran.

1. **Negative scores are not clamped.** The script computes `Round(F*Fcr*(Pd+Pv) - Penalty)` without a floor at zero, while both rules floor the day score at zero (SWO 10.5.1, Annex A 8.2.5).
2. **Invalid days still get points.** When `n1/N <= 0.25` the script only replaces the info line with "Day not valid", but still assigns each pilot their computed points. The rules give everyone 0 (SWO 13.2, Annex A 8.3.1).
3. **Dm and D1 are hard-coded by class ID.** The values come from `Task.ClassID` (`club`, `standard`, `18_meter` and so on). Any other class, including SeeYou's `unknown` class, falls back to 100 km and 250 km. Nothing reads Dm from the DayTag, so a local Dm such as 50 km requires editing the script.
4. **Handicaps are enabled by class ID.** With the default `UseHandicaps = 2`, handicaps are only used for `club`, `double_seater` and `unknown`. SWO qualifying championships require handicaps in all classes (SWO 13.3), so the scorer must change the constant.
5. **Handicap normalisation.** The script divides by `Hcap / Hmin`, where `Hmin` is the class's lowest handicap rounded down to a power of ten (1, 10, 100 or 1000). This makes DAeC-style indices such as 108 behave as 1.08 and gives the rule result for ordinary handicap lists. It would misbehave for a list whose values straddle one of those bands.
6. **Start speed is a warning, computed differently.** With `MaxStSpd` set in the DayTag, the script averages the ground speed of all fixes from 9 s before to 10 s after the start and only adds a warning. The SWO uses the average over ±8 s and Annex A the straight-line distance between the fixes nearest ±8 s. The penalty itself is entered by hand in the Day performance dialog.
7. **PEV start is a warning only.** Wait time and window come from the DayTag. The script ignores PEVs after the start, clusters PEVs within 30 s and counts at most three per flight. It does not handle the rule that a postponed gate makes all three PEVs available again. Penalties are entered by hand.
8. **Tie handling for To on AATs.** If two finishers tie on Vo, the tie branch takes the shorter raw time without raising it to the minimum task time. The main branch does raise it. This can lower `Pm` in a rare edge case.
9. **Rounding** uses `Round()`, which may round half to even (not verified, see above).
10. **Best start selection.** The script never chooses the start. SeeYou passes the selected start in `start` and all crossings in `PotStarts` (Naviter README). Anlage F makes the pilot responsible for the final check that the best-scoring start was used, as required by SWO 7.3.8 (SWO-F 12). This suggests SeeYou does not reliably select the best-scoring start on its own, but it was not tested.
11. **SWO-specific outcomes are not in the script.** Finishing more than 100 m too low (Pv = 0 and an outlanding), virtual outlanding for airspace or above maximum altitude, and engine-use virtual outlandings are not modelled in the script. They depend on SeeYou's flight analysis or manual overrides.
12. **Edition lag.** The script header says "Annex A 2023 Edition", and the repository was last updated in July 2024. Annex A 2025a renumbered the pre-start altitude rule (now 7.4.2.2) and is valid from 15 April 2026. The classic day formula in 2025a matches the script.

The script handles the case of no finishers by setting the time term to 1000, which matches Annex A's To = 100 h. It counts N as non-HC pilots with a take-off and checks validity with `n1/N <= 0.25`, both matching the rules.

## Implications for Keyhole

- The classic formula is identical in both rule sets. One implementation parameterised by Dm, D1, handicap use and the penalty catalogue covers SWO and Annex A.
- Most of the differences are in start, turnpoint and finish validation and the penalty catalogue, not in the point formula. Rule sets should be data (geometry defaults, thresholds, penalty rates, caps) with per-competition and per-day overrides.
- Annex A requires publishing the program name, version and a checksum or hash of the scoring algorithm with daily results (8.1.1).
- The SWO keyhole observation zone is the German default, which matches the project name.
