# Wrong IGC dates from GPS week number rollover

Research for [#56](https://github.com/Turbo87/keyhole/issues/56). The question is which loggers write wrong dates into IGC files because of GPS week number rollover, what those files look like, whether they still validate, and how SeeYou and SoaringSpot handle them. The facts here feed the decision in [#57](https://github.com/Turbo87/keyhole/issues/57) and do not make it.

Facts were checked on 2026-11-02 against manufacturer notices, the IGC technical specification, the local SoaringSpot download of 63 competitions (25,065 IGC files) and a fresh SoaringSpot download of the JenaCup 2026 (310 files). G-record validation used the eight-DLL test kit from [#54](https://github.com/Turbo87/keyhole/issues/54) with Debian's 32-bit Wine 10.0. No IGC file is committed.

## Summary

Older LXNAV LX8000 and LX9000 units whose u-blox LEA-4S GPS module still runs its original firmware have written dates exactly 1024 weeks (7168 days, about 19.6 years) too early since 6 July 2025. The receiver maps every date into a fixed window of 1024 GPS weeks that ended on 5 July 2025, so a flight on 25 July 2026 is stored as 9 December 2006. LXNAV confirms the bug and fixes it in main firmware 9.03 (GEN2) and 9.53a (GEN3). An old LX7007 with a u-blox TIM-LP module shows the same 7168-day offset. Classic FLARM devices had a similar problem that FLARM fixed in 2024, and Volkslogger and Cambridge 302 units fell back to 1995 dates in 2014 when their GPS backup battery ran down.

The two downloads contain 11 such files from 5 loggers in 5 competitions, all from July 2025 or later, and no earlier case. Only the date is wrong. `HFDTE` is off by exactly 7168 days, the weekday and the UTC time of day are correct, B records don't cross midnight, and SoaringSpot scored every file on the right class day with start times that match the B records to the second. All ten LXNAV files pass G-record validation with both the 2021 and the current LXV DLL, and correcting `HFDTE` to the real date makes them fail, so the wrong date is signed content. The one LX7007 file fails validation even untouched, for a reason that was not pinned down.

Most LEA-4S units in the download are not affected. After the rollover, 33 of 37 loggers with a LEA-4S-2 module and all 36 with a LEA-4S-1 module wrote only correct dates, including several on main firmware older than LXNAV's fix. What decides whether a unit is affected was not found.

## The rollover

The GPS week number broadcast by the satellites has 10 bits and wraps every 1024 weeks. Receivers resolve the ambiguity with a reference week from their firmware and map each date into the 1024 weeks starting there. u-blox [documents](https://content.u-blox.com/sites/default/files/u-blox-GPS-WeekNumberRolloverWorkaround_IN_(UBX-19039990).pdf) that its receivers delay the rollover "until about 20 years from the creation of the GNSS receiver firmware" and after that "will show a 20-year-old date". The note lists end dates from 2027-08-14 for u-blox 5 to 2036-09-27 for M8 firmware 3.5x, but not the ANTARIS 4 generation that the LEA-4S and TIM-LP belong to.

The files pin down the LEA-4S window. The earliest wrong file, from 6 July 2025, says 20 November 2005, and the latest correct LEA-4S-2 file before it is from 3 July 2025 on the same firmware. Both dates are Sundays at the start of a GPS week, 2374 and 1350, so the window covers GPS weeks 1350 to 2373, from 2005-11-20 to 2025-07-05. Any affected file recorded after that is dated `real date − 7168 days` until the next wrap in 2045. The week of the year and the weekday stay the same, and so does the time of day, because only the week count is wrong.

## Affected loggers

| Manufacturer | Logger | GNSS module | Evidence | Fix |
|---|---|---|---|---|
| LXNAV | LX8000, LX9000 and derivatives, GEN1 to GEN3 | u-blox LEA-4S | [LXNAV notice](https://gliding.lxnav.com/news/incorrect-gps-date-on-gen1-3-units/), 10 files | GEN2: firmware 9.03 on request. GEN3: beta 9.53a. GEN1 LX8000: none. GEN4 and GEN5 are "not affected at all". |
| LX Navigation | LX7007 | u-blox TIM-LP | 1 file, forum report | None known |
| FLARM | Classic FLARM devices | older GPS receivers | [Firmware 7.25 release notes](https://www.flarm.com/wp-content/uploads/2024/04/FTD-037-FLARM-Firmware-release-notes-7.40.pdf), [configuration specification](https://www.flarm.com/wp-content/uploads/2024/04/FTD-014-FLARM-Configuration-Specification-1.18.pdf) §3.1.34 | Firmware 7.25, published 2024-07-03 |
| Garrecht, Cambridge | Volkslogger, Cambridge 302 and older Cambridge models | Garmin GPS25 | [IGC GFAC memo of 2014-11-29](https://www.gliderpilotshop.com/date-error-frs?___store=glider_fr), [rec.aviation.soaring](https://groups.google.com/g/rec.aviation.soaring/c/3tHpsgoORxQ/m/Rc11I2OYTmcJ) | Replace backup battery or GPS board |

LXNAV's notice says older LX8000 and LX9000 units "may show incorrect dates, typically reverting to November 2005" and blames "a firmware bug inside the GPS receiver" of the LEA-4S. The page carries no absolute date. Forum posts on [volavoile.net](https://www.volavoile.net/topic/14722-lx-9000-vols-non-enregistr%C3%A9s/) date the problem to early July 2025 and report an LX9000 GEN3 flight of 12 July 2025 stored as 26 November 2005 and an LX7007 flight of 11 July 2025 stored as 25 November 2005, both exactly 7168 days. The [firmware request page](https://gliding.lxnav.com/firmware-request/) lists GEN1 firmware 5.06 and GEN2/GEN3 firmware 9.05 released on 2025-10-03, without saying whether they contain the fix. In the download, LX8000F units on 5.06 and GEN2 units on 9.05 wrote correct dates after the rollover.

FLARM's 7.25 notes say "Classic: Solve incorrect date in NMEA sentences due to GPS week rollover", and its configuration specification adds a `ROLLOVER` setting because "legacy FLARM devices with old GPS receivers suffer from the week-rollover issue, resulting in a date around 19.6 years in the past". The notes mention NMEA output, not IGC files. In the download, the 46 files from FLARM-based IGC recorders with LEA-4P or TIM-LP modules recorded after the rollover all have correct dates.

The 2014 cluster had a different mechanism. The GFAC memo describes "older models of Cambridge and Garrecht Volkslogger FRs" whose GPS clock reverts after the backup battery runs down, adding that the problem "may also be present in other types of FR". A pilot report quoted in an [XCSoar mailing list thread](https://groups.google.com/g/xcsoar-user/c/DJqDIi_8Y4k/m/my-groups) names the Garmin GPS25 OEM board, whose units "think they are 1024 weeks ago", which then meant 1995. None of these files is in the download, which starts in 2012. No report was found for Zander, Filser, Cambridge's later models, EW or LXNAV's Nano and Colibri loggers.

## Files in the download

Comparing each file's `HFDTE` with the date of its class day found 11 files exactly 7168 days early. Apart from one unrelated S10 file described below, they are the only files more than 800 days off. The JenaCup 2026 was downloaded for this research because the glider with competition ID YB was reported as affected there.

| Competition | Class | Class day | ID | Logger | Firmware | Module | `HFDTE` | Validation |
|---|---|---|---|---|---|---|---|---|
| 7th FAI Junior EGC Prievidza 2025 | Standard | 2025-07-06 | S2 | LX8000F GEN2 | 9.02 | LEA-4S-2 | 2005-11-20 | pass |
| 7th FAI Junior EGC Prievidza 2025 | Club | 2025-07-06 | AO | LX9000 GEN2 | 9.02 | LEA-4S-2 | 2005-11-20 | pass |
| DSMJ 2025 | Club | 2025-07-29 | 9Y | LX9000F | 7.13 | LEA-4S-2 | 2005-12-13 | pass |
| DM Doppelsitzer Brandenburg 2025 | Doppelsitzer | 2025-08-14 | LT | LX7007F | 1.2 | TIM-LP | 2005-12-29 | fail |
| EuregioCup 2026 | Hasen | 2026-05-14 | YB | LX9000F GEN3 | 9.50 | LEA-4S-2 | 2006-09-28 | pass |
| EuregioCup 2026 | Hasen | 2026-05-16 | YB | LX9000F GEN3 | 9.50 | LEA-4S-2 | 2006-09-30 | pass |
| JenaCup 2026 | Doppelsitzer | 2026-07-25 | YB | LX9000F GEN3 | 9.50 | LEA-4S-2 | 2006-12-09 | pass |
| JenaCup 2026 | Doppelsitzer | 2026-07-26 | YB | LX9000F GEN3 | 9.50 | LEA-4S-2 | 2006-12-10 | pass |
| JenaCup 2026 | Doppelsitzer | 2026-07-28 | YB | LX9000F GEN3 | 9.50 | LEA-4S-2 | 2006-12-12 | pass |
| JenaCup 2026 | Doppelsitzer | 2026-07-29 | YB | LX9000F GEN3 | 9.50 | LEA-4S-2 | 2006-12-13 | pass |
| JenaCup 2026 | Doppelsitzer | 2026-07-30 | YB | LX9000F GEN3 | 9.50 | LEA-4S-2 | 2006-12-14 | pass |

YB is a Duo Discus XLT whose LX9000F wrote correct dates at the EuregioCups of 2023, 2024 and 2025, the last on 2025-05-30 with the same firmware 9.50, and wrong dates on every day it flew in 2026. It did not fly on the JenaCup's practice day and its two cancelled days. No other JenaCup competitor is affected, including other LX8000 and LX9000 units with LEA-4S-2 modules on firmware 5.06, 9.05 and 9.55d. AO wrote a correct date on 2025-07-03, the wrong one on 2025-07-06, and correct dates again from 2025-07-13 after an update to firmware 9.03, which matches LXNAV's GEN2 fix.

The files look normal apart from the date. The A record keeps the logger's serial, the header names the logger, firmware and module, the B records run from late morning to afternoon UTC without crossing midnight, and `HFDTE` comes in both the `HFDTE201105` and the `HFDTEDATE:091206,1` form depending on the firmware. The flight number in the A record and `HFDTEDATE` is 1 throughout. YB's header also gives its glider registration and competition ID, which allowed matching it to the pilot without the logger serial.

Not every LEA-4S unit is affected. Of the loggers that recorded after 2025-07-05, 4 of 37 with a LEA-4S-2 module wrote wrong dates, as did 1 of 8 with a TIM-LP module. All 36 with a LEA-4S-1 module wrote correct dates, among them units on firmware 8.0 and GEN2 9.02. Correct LEA-4S-2 units include GEN2 units on 9.02 and 9.04 and GEN3 units on 9.07, 9.51 and 9.52, all older than LXNAV's fix. The IGC header doesn't report the module's own firmware, so whether those units carry a newer receiver firmware or something else protects them could not be determined.

## G-record validation

The 2021 and current `igc-lxv.dll` and `igc-lxn.dll` from the #54 kit ran under Debian trixie's 32-bit Wine 10.0 on Apple Silicon through the #39 harness, one Wine process per file.

All ten LXNAV files pass with both DLL versions, as does YB's correct-date file from 2025 and S2's from 2025-07-03. Three controls fail with both versions as expected: YB's file of 2026-07-25 with `HFDTE` corrected to the real date, S2's file of 2025-07-06 corrected the same way, and YB's file with one B record digit changed. The wrong date is therefore covered by the G record, and correcting it in the file invalidates the signature. [WeGlide's logger documentation](https://docs.weglide.org/contests/loggers.html) says the same: "The date can not be changed retroactively, as it is part of the file signature".

The LX7007 file fails with both DLL versions even untouched. Six LX7007 files from other competitions, firmware 2.0 and 3.2, pass. The failing file is the only one on firmware 1.2 and is laid out differently, with its single short G record among the header lines and a conversion comment from a 2019 LX conversion DLL, where the passing files end with their G records. Whether the file was altered or the DLL can't check this firmware's format is unknown, so the failure says nothing about the date.

## IGC specification

The [IGC technical specification](https://www.fai.org/sites/default/files/igc_fr_specification_with_al8_2023-2-1_0.pdf) (2nd edition with AL8, 2023-02-01) defines the date only as UTC. A2.5.4 says "the date used in the file name and in the H-record (DTE code) is the UTC date of the first valid fix in the B-record", adding that near midnight UTC "this is not necessarily the local date". A3.2.4 makes `HFDTEDATE:DDMMYY,NN` mandatory, B records carry only `HHMMSS`, and A2.5.5 says the file name is not protected by the security system. The short file name encodes the year as one digit "cycling every 10 years". The specification says nothing about week rollover, about B records crossing midnight, or about implausible dates, and the approval documents checked for the LX7000 series and FLARM don't mention date errors.

## SeeYou and SoaringSpot

SoaringSpot scored all 11 files on their class days. Ranks range from 1st to 27th, and in every file the published start time, converted from local time, matches a B record fix to within 2 seconds. Scoring with SeeYou Competition therefore used the time of day as recorded and was not disturbed by the date. Whether the scorers had to assign these files by hand could not be determined, because SeeYou Competition's import is not documented in that detail. Naviter's [flight recorder ID article](https://kb.naviter.com/en/kb/enter-flight-recorder-unique-ids/) only explains that recorder IDs come from the IGC file name and allow scoring "literally hands free".

SoaringSpot names downloads by class day, not by `HFDTE`. The download link for YB's file of 2026-07-25 is served as `67P_YB.igc`, where `67P` is the short-name code for 2026-07-25, while the content still says 9 December 2006. The results pages show no date per flight and no sign that the file is unusual.

Other services handle the problem differently. WeGlide treats a wrong date as a sign of a defective logger, except that "old LXNAV devices with the date error in the firmware are an exception, WeGlide detects such files and shows the correct date (even though the wrong date persists in the file to not invalidate it)". The [OLC FAQ](https://www.onlinecontest.org/olc-3.0/segelflugszene/cms.html?url=help%2Ffaq) accepts flights with wrong dates from loggers "not activated for a while" but doesn't score them. Pilots on volavoile.net report that affected flights still appear in the LX logbook, sorted to the bottom under the 2005 date.

## Look-alike date mismatches

The download contains other files whose `HFDTE` differs from the class day, none of them by a multiple of 1024 weeks:

- A file from 2023-10-12 at Kingaroy says 11 October because its first fix was at 21:03 UTC on 11 October, which is 07:03 on 12 October in Queensland. This is A2.5.4's UTC-date rule and is correct.
- 21 files on a cancelled day of the South African Nationals 2020 are the previous day's flights uploaded again and dated one day earlier.
- 13 files on practice or cancelled days are 1 to 795 days off, apparently because pilots uploaded an older flight. All but one were scored as DNS.
- A file on a scored day of the South African Nationals 2021 is one day early and was scored as an 18 km flight.
- An LXNAV S10 file from 2019-12-14 says 30 December 1999, 7289 days off and on a different weekday. LX devices use `301299` as a placeholder date elsewhere, for example in declarations, so this looks like an unset date rather than a rollover. It passes validation and was scored.
- An LX8030 file on 2024-08-02 says 30 July. Its first 88 fixes are from an earlier power-on, after which the time jumps back to the real flight, so the file spans several days.
- Two files have no `HFDTE` at all.

Of the 25,375 files checked, the rollover files are the only ones whose `HFDTE` plus exactly 7168 days gives the class day.

## What remains open

- What decides whether a LEA-4S unit is affected. Most units on firmware older than LXNAV's fix recorded correct dates, and the IGC header doesn't show the module's firmware.
- Whether LXNAV's later 5.06 and 9.05 firmware fixes the bug or only happens to run on unaffected units. No changelog names the fix.
- Whether the LX7007 problem is the same receiver bug. LX Navigation published nothing, and the only file fails validation for an unclear reason.
- Whether leap seconds are applied correctly. The 2006 and 2026 offsets between GPS time and UTC differ by 4 seconds. Start times match the B records, but there is no independent reference for the fixes' absolute time.
- How SeeYou Competition imports such a file without manual help, and which file name the logger itself writes. The spec requires the file name to use the same date as `HFDTE`, but the original upload names are not visible on SoaringSpot.
- Statements from LXNAV on Nano, Nano3, Colibri II and LX7007, and from other manufacturers on 2025 rollover dates.
