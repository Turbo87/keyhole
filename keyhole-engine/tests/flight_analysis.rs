use std::fmt::Write;

use bytes::Bytes;
use insta::assert_snapshot;
use jiff::civil::{Date, Time};
use jiff::tz::Offset;
use jiff::{SignedDuration, Timestamp};
use keyhole_engine::flight_analysis::analysis_log::{AnalysisLogDetails, Evidence, Level};
use keyhole_engine::flight_analysis::{FileAnalysis, FileAnalysisOptions, IgcFile, analyze_file};

const OPTIONS: FileAnalysisOptions = FileAnalysisOptions {
    maximum_recording_interval: SignedDuration::from_secs(1),
};

fn analyze(contents: &str) -> FileAnalysis {
    analyze_file(Bytes::copy_from_slice(contents.as_bytes()), OPTIONS)
}

/// Analyses an excerpt from `tests/fixtures`. The excerpts leave out most of
/// each flight, so no recording interval limit applies.
fn analyze_excerpt(contents: &[u8]) -> FileAnalysis {
    let maximum_recording_interval = SignedDuration::MAX;
    let options = FileAnalysisOptions {
        maximum_recording_interval,
    };
    analyze_file(Bytes::copy_from_slice(contents), options)
}

/// Writes a B record per second from 10:00:00 for each pair of ground speed
/// from the fix before, in km/h, and altitude, in m. The glider flies north
/// from 51°N.
fn profile(fixes: &[(f64, i32)]) -> Vec<String> {
    // One thousandth of a minute of latitude, in m.
    const LATITUDE_STEP: f64 = 6_371_000.0 * std::f64::consts::PI / 180.0 / 60_000.0;
    let mut distance = 0.0;
    let records = fixes
        .iter()
        .enumerate()
        .map(|(second, &(speed, altitude))| {
            distance += speed / 3.6;
            let latitude = (distance / LATITUDE_STEP).round() as u32;
            let (minutes, thousandths) = (latitude / 1000, latitude % 1000);
            let time = Time::constant(10, 0, 0, 0) + SignedDuration::from_secs(second as i64);
            let time = time.strftime("%H%M%S");
            format!("B{time}51{minutes:02}{thousandths:03}N00700000EA{altitude:05}{altitude:05}")
        });
    records.collect()
}

fn analyze_profile(records: &[String]) -> FileAnalysis {
    analyze(&format!("ALXVABC\nHFDTE160624\n{}\n", records.join("\n")))
}

/// Renders the analysis log, then the IGC file with times as time of day and
/// days after the recorded date, so that the snapshots stay readable.
fn render(analysis: &FileAnalysis) -> String {
    let mut out = render_log(analysis);
    let Some(igc_file) = &analysis.igc_file else {
        out.push_str("no igc file\n");
        return out;
    };

    let logger = &igc_file.logger;
    writeln!(out, "logger {} {}", logger.manufacturer, logger.serial).unwrap();
    writeln!(out, "date   {}", igc_file.recorded_date).unwrap();
    writeln!(out, "alt    {:?}", igc_file.altitude_source).unwrap();
    write_flights(&mut out, igc_file);

    for fix in &igc_file.fixes {
        let time = time(igc_file.recorded_date, fix.time);
        let validity = if fix.valid { 'A' } else { 'V' };
        write!(
            out,
            "fix    {time} {validity} {:.5} {:.5} {} {}",
            fix.latitude, fix.longitude, fix.pressure_altitude, fix.gnss_altitude,
        )
        .unwrap();
        for code in ["ENL", "FXA", "SIU"] {
            if let Some(value) = fix.extension(code) {
                write!(out, " {code}={value}").unwrap();
            }
        }
        out.push('\n');
    }
    for &pev in &igc_file.pevs {
        writeln!(out, "pev    {}", time(igc_file.recorded_date, pev)).unwrap();
    }

    out
}

fn render_log(analysis: &FileAnalysis) -> String {
    let mut out = String::new();
    for entry in &analysis.log {
        let level = match entry.details.kind().level() {
            Level::Error => "error",
            Level::Warning => "warning",
            Level::Info => "info",
        };
        let (kind, data) = match &entry.details {
            AnalysisLogDetails::FileFailedToParse { reason } => {
                ("file_failed_to_parse", format!("{reason:?}"))
            }
            AnalysisLogDetails::UnreadableLines { reason, lines } => {
                let reason = format!("{:?} {:?}", reason.record_type, reason.problem);
                ("unreadable_lines", format!("{reason}: {}", join(lines)))
            }
            AnalysisLogDetails::TimestampErrors { lines } => {
                let count = lines.len();
                (
                    "timestamp_errors",
                    format!("{count} fixes: {}", join(lines)),
                )
            }
            AnalysisLogDetails::RecordingIntervalExceeded { longest_interval } => {
                ("interval_exceeded", format!("longest {longest_interval:#}"))
            }
            AnalysisLogDetails::NoPressureAltitude => ("no_pressure_altitude", String::new()),
            AnalysisLogDetails::TakeOff => ("take_off", String::new()),
            AnalysisLogDetails::Landing => ("landing", String::new()),
            AnalysisLogDetails::Airborne { end } => ("airborne", format!("{end:?}")),
        };
        let date = || analysis.igc_file.as_ref().unwrap().recorded_date;
        let evidence = match entry.evidence {
            Evidence::File => "file".into(),
            Evidence::Interval(start, end) => {
                format!("{} to {}", time(date(), start), time(date(), end))
            }
            Evidence::Fix(fix) => time(date(), fix),
        };
        let line = format!("{level:<7} {kind:<22} {evidence:<6} {data}");
        writeln!(out, "{}", line.trim_end()).unwrap();
    }
    out
}

/// Renders the analysis log and the flights, for recordings too long to list
/// their fixes.
fn render_flights(analysis: &FileAnalysis) -> String {
    let mut out = render_log(analysis);
    write_flights(&mut out, analysis.igc_file.as_ref().unwrap());
    out
}

fn write_flights(out: &mut String, igc_file: &IgcFile) {
    let time = |time: Option<Timestamp>| {
        time.map_or("-".into(), |t| self::time(igc_file.recorded_date, t))
    };
    for flight in &igc_file.flights {
        let (take_off, landing) = (time(flight.take_off_time), time(flight.landing_time));
        writeln!(out, "flight {take_off} to {landing}").unwrap();
    }
}

/// Formats a time as time of day, with the days after the recorded date
/// unless it lies on that date.
fn time(recorded_date: Date, time: Timestamp) -> String {
    let time = Offset::UTC.to_datetime(time);
    let days = time.date().since(recorded_date).unwrap().get_days();
    let time = time.strftime("%H:%M:%S").to_string();
    if days == 0 {
        time
    } else {
        format!("{time} {days:+}d")
    }
}

fn join(lines: &[usize]) -> String {
    let lines = lines.iter().map(ToString::to_string).collect::<Vec<_>>();
    lines.join(", ")
}

#[test]
fn parses_a_well_formed_file_into_a_flight() {
    let analysis = analyze(
        "ALXVABCFLIGHT:1\r\n\
         HFDTEDATE:160624,01\r\n\
         B1000005122265N00651234EV0010000110\r\n\
         B1000015122266S00651235WA-0010-0005\r\n\
         B1000025122267N00651236EA0010200112\r\n",
    );

    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    10:00:00 V 51.37108 6.85390 100 110
    fix    10:00:01 A -51.37110 -6.85392 -10 -5
    fix    10:00:02 A 51.37112 6.85393 102 112
    ");
}

#[test]
fn reports_a_file_without_igc_records() {
    let mut contents = "_".repeat(1000).into_bytes();
    contents.extend_from_slice(b"\n\x00\x9f\xff\x07\nB\xc3\x28\xfe\n\r\n");
    let analysis = analyze_file(Bytes::from(contents), OPTIONS);

    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   NotIgc
    no igc file
    ");
}

const FIX: &str = "B1000005122265N00651234EA0010000110\n";

#[test]
fn reports_a_file_without_a_logger_identity() {
    let analysis = analyze(&format!("HFDTE160624\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingLoggerId
    no igc file
    ");
}

#[test]
fn reports_a_file_without_a_recorded_date() {
    let analysis = analyze(&format!("ALXVABC\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingRecordedDate
    no igc file
    ");
}

#[test]
fn reports_only_the_first_failure_of_a_file() {
    let analysis = analyze(&format!("HFPLTPILOT:Jane Doe\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingLoggerId
    no igc file
    ");
}

#[test]
fn reports_an_unreadable_recorded_date() {
    let analysis = analyze(&format!("ALXVABC\nHFDTEDATE:16O624,01\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingRecordedDate
    no igc file
    ");
}

#[test]
fn reports_a_recorded_date_that_does_not_exist() {
    let analysis = analyze(&format!("ALXVABC\nHFDTE300224\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingRecordedDate
    no igc file
    ");
}

#[test]
fn accepts_a_leap_day_as_recorded_date() {
    let analysis = analyze(&format!("ALXVABC\nHFDTE290224\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-02-29
    alt    Pressure
    fix    10:00:00 A 51.37108 6.85390 100 110
    ");
}

#[test]
fn reports_a_file_without_fixes() {
    let analysis = analyze("ALXVABC\nHFDTE160624\n");
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   NoValidFixes
    no igc file
    ");
}

#[test]
fn reports_a_file_without_valid_fixes() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B1000005122265N00651234EV0010000110\n\
         B1000015122266N00651235EV0010100111\n",
    );
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   NoValidFixes
    no igc file
    ");
}

#[test]
fn reports_unreadable_lines_grouped_by_record_type_and_problem() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B1000005122265N00651234EA0010000110\n\
         B100001\n\
         B1000025122267N00651236EA00102\n\
         B9900035122265N00651234EA0010000110\n\
         \n\
         just some text\n\
         B1000045122265N00651234EA0010000110\n\
         \t \n\
         E100004PEV\n\
         E1000\n",
    );
    assert_snapshot!(render(&analysis), @"
    error   unreadable_lines       file   B Malformed: 4, 5
    error   unreadable_lines       file   B OutOfRange: 6
    error   unreadable_lines       file   E Malformed: 12
    error   unreadable_lines       file   Unknown Malformed: 8
    warning interval_exceeded      10:00:00 to 10:00:04 longest 4s
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    10:00:00 A 51.37108 6.85390 100 110
    fix    10:00:04 A 51.37108 6.85390 100 110
    pev    10:00:04
    ");
}

#[test]
fn reports_no_unreadable_lines_of_files_that_fail_to_parse() {
    let analysis = analyze(&format!("ALXVABC\nHFDTE\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingRecordedDate
    no igc file
    ");
}

#[test]
fn dates_leading_invalid_fixes_before_midnight_on_the_previous_day() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B2359585122265N00651234EV0010000110\n\
         B2359595122265N00651234EV0010000110\n\
         B0000015122265N00651234EA0010000110\n\
         B0000025122265N00651234EA0010000110\n",
    );
    assert_snapshot!(render(&analysis), @"
    warning interval_exceeded      23:59:59 -1d to 00:00:01 longest 2s
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    23:59:58 -1d V 51.37108 6.85390 100 110
    fix    23:59:59 -1d V 51.37108 6.85390 100 110
    fix    00:00:01 A 51.37108 6.85390 100 110
    fix    00:00:02 A 51.37108 6.85390 100 110
    ");
}

#[test]
fn keeps_leading_invalid_fixes_up_to_12_hours_later_on_the_recorded_date() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B1300005122265N00651234EV0010000110\n\
         B0100005122265N00651234EA0010000110\n",
    );
    assert_snapshot!(render(&analysis), @"
    warning timestamp_errors       file   1 fixes: 3
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    01:00:00 A 51.37108 6.85390 100 110
    ");
}

#[test]
fn dates_stale_fixes_after_midnight_on_the_previous_day() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B2359585122265N00651234EA0010000110\n\
         B0000015122265N00651234EA0010000110\n\
         B2359595122265N00651234EA0010000110\n\
         B0000025122265N00651234EA0010000110\n",
    );
    assert_snapshot!(render(&analysis), @"
    warning timestamp_errors       file   1 fixes: 5
    warning interval_exceeded      23:59:58 to 00:00:01 +1d longest 3s
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    23:59:58 A 51.37108 6.85390 100 110
    fix    00:00:01 +1d A 51.37108 6.85390 100 110
    fix    00:00:02 +1d A 51.37108 6.85390 100 110
    ");
}

#[test]
fn dates_fixes_after_midnight_on_the_next_day() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B2359595122265N00651234EA0010000110\n\
         B0000005122265N00651234EA0010000110\n\
         B0000015122265N00651234EA0010000110\n",
    );
    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    23:59:59 A 51.37108 6.85390 100 110
    fix    00:00:00 +1d A 51.37108 6.85390 100 110
    fix    00:00:01 +1d A 51.37108 6.85390 100 110
    ");
}

#[test]
fn dates_times_past_the_end_of_the_day_on_the_next_day() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B2359595122265N00651234EA0010000110\n\
         B2400005122265N00651234EA0010000110\n\
         B0000015122265N00651234EA0010000110\n",
    );
    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    23:59:59 A 51.37108 6.85390 100 110
    fix    00:00:00 +1d A 51.37108 6.85390 100 110
    fix    00:00:01 +1d A 51.37108 6.85390 100 110
    ");
}

#[test]
fn drops_fixes_with_repeated_or_decreasing_timestamps() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B1000005122265N00651234EA0010000110\n\
         B1000015122265N00651234EA0010000110\n\
         B1000015122266N00651234EA0010000110\n\
         B1000005122267N00651234EA0010000110\n\
         B1000025122268N00651234EA0010000110\n",
    );
    assert_snapshot!(render(&analysis), @"
    warning timestamp_errors       file   2 fixes: 5, 6
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    10:00:00 A 51.37108 6.85390 100 110
    fix    10:00:01 A 51.37108 6.85390 100 110
    fix    10:00:02 A 51.37113 6.85390 100 110
    ");
}

#[test]
fn decodes_extensions_with_the_latest_i_record() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B1000005122265N00651234EA0010000110012\n\
         I023638FXA3940SIU\n\
         B1000015122265N00651234EA001000011001208\n\
         B1000025122265N00651234EA00100001100120\n\
         B1000035122265N00651234EA001000011001\n\
         I013638ENL\n\
         B1000045122265N00651234EA0010000110123\n",
    );
    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    10:00:00 A 51.37108 6.85390 100 110
    fix    10:00:01 A 51.37108 6.85390 100 110 FXA=012 SIU=08
    fix    10:00:02 A 51.37108 6.85390 100 110 FXA=012
    fix    10:00:03 A 51.37108 6.85390 100 110
    fix    10:00:04 A 51.37108 6.85390 100 110 ENL=123
    ");
}

#[test]
fn decodes_extensions_of_an_i_record_after_the_task_declaration() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTEDATE:160624,01\n\
         HFPLTPilotInCharge:Jane Doe\n\
         HFGTYGliderType:LS8\n\
         C160624092044000000000202Task\n\
         C5122265N00651234ETakeoff\n\
         C5122265N00651234ELanding\n\
         I013638ENL\n\
         B1000005122265N00651234EA0010000110042\n",
    );
    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    10:00:00 A 51.37108 6.85390 100 110 ENL=042
    ");
}

#[test]
fn dates_pilot_events_by_the_preceding_fix() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         E235957PEV\n\
         B2359585122265N00651234EA0010000110\n\
         E235959PEV\n\
         E000000PEV\n\
         B0000015122265N00651234EA0010000110\n\
         E235959PEV\n\
         E000002PEVPILOT\n\
         E000003XYZ\n",
    );
    assert_snapshot!(render(&analysis), @"
    warning interval_exceeded      23:59:58 to 00:00:01 +1d longest 3s
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    23:59:58 A 51.37108 6.85390 100 110
    fix    00:00:01 +1d A 51.37108 6.85390 100 110
    pev    23:59:57
    pev    23:59:59
    pev    00:00:00 +1d
    pev    23:59:59
    pev    00:00:02 +1d
    ");
}

#[test]
fn warns_about_each_stretch_of_intervals_over_the_limit() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B1000005122265N00651234EA0010000110\n\
         B1000015122265N00651234EA0010000110\n\
         B1000035122265N00651234EA0010000110\n\
         B1000065122265N00651234EA0010000110\n\
         B1000075122265N00651234EA0010000110\n\
         B1000085122265N00651234EA0010000110\n\
         B1000205122265N00651234EV0010000110\n",
    );
    assert_snapshot!(render(&analysis), @"
    warning interval_exceeded      10:00:01 to 10:00:06 longest 3s
    warning interval_exceeded      10:00:08 to 10:00:20 longest 12s
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    10:00:00 A 51.37108 6.85390 100 110
    fix    10:00:01 A 51.37108 6.85390 100 110
    fix    10:00:03 A 51.37108 6.85390 100 110
    fix    10:00:06 A 51.37108 6.85390 100 110
    fix    10:00:07 A 51.37108 6.85390 100 110
    fix    10:00:08 A 51.37108 6.85390 100 110
    fix    10:00:20 V 51.37108 6.85390 100 110
    ");
}

#[test]
fn ignores_a_byte_order_mark() {
    let analysis = analyze(&format!("\u{feff}ALXVABC\nHFDTE160624\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    10:00:00 A 51.37108 6.85390 100 110
    ");
}

#[test]
fn uses_gnss_altitude_when_every_pressure_altitude_reads_zero() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B1000005122265N00651234EA0000000110\n\
         B1000015122265N00651234EA0000000111\n",
    );
    assert_snapshot!(render(&analysis), @"
    warning no_pressure_altitude   file
    logger LXV ABC
    date   2024-06-16
    alt    Gnss
    fix    10:00:00 A 51.37108 6.85390 0 110
    fix    10:00:01 A 51.37108 6.85390 0 111
    ");
}

#[test]
fn keeps_pressure_altitude_when_some_fixes_read_zero() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B1000005122265N00651234EA0000000110\n\
         B1000015122265N00651234EA-000100111\n\
         B1000025122265N00651234EA0000100112\n",
    );
    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    10:00:00 A 51.37108 6.85390 0 110
    fix    10:00:01 A 51.37108 6.85390 -1 111
    fix    10:00:02 A 51.37108 6.85390 1 112
    ");
}

#[test]
fn detects_the_take_off_and_landing_of_a_flight() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/normal.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               12:19:23
    info    landing                16:39:47
    flight 12:19:23 to 16:39:47
    ");
}

#[test]
fn detects_every_take_off_and_landing_of_several_flights() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/two-winch-launches.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    warning timestamp_errors       file   2 fixes: 110, 617
    info    take_off               10:44:50
    info    landing                10:53:00
    info    take_off               11:12:20
    info    landing                15:18:43
    flight 10:44:50 to 10:53:00
    flight 11:12:20 to 15:18:43
    ");
}

/// The logger starts the file with the minutes before the take-off, which here
/// hold the end of a short earlier flight. The glider lands, is turned around
/// and is towed out again 70 s after it stopped.
#[test]
fn detects_a_take_off_shortly_after_a_landing() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/take-off-after-short-stop.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    warning airborne               13:41:16 Start
    info    landing                13:44:51
    info    take_off               13:46:09
    info    landing                14:55:36
    flight - to 13:44:51
    flight 13:46:09 to 14:55:36
    ");
}

#[test]
fn warns_about_a_file_that_starts_in_the_take_off_run() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/starts-airborne.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    warning airborne               11:58:59 Start
    info    landing                15:22:57
    flight - to 15:22:57
    ");
}

#[test]
fn warns_about_a_file_that_ends_in_flight() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/ends-airborne.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               12:07:03
    warning airborne               13:46:09 End
    flight 12:07:03 to -
    ");
}

#[test]
fn detects_no_landing_while_hovering_in_wave() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/wave-hover.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               11:21:52
    info    landing                18:03:40
    flight 11:21:52 to 18:03:40
    ");
}

#[test]
fn detects_the_take_off_before_a_hover_in_wave() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/hover-after-winch-launch.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               12:56:40
    info    landing                13:53:19
    flight 12:56:40 to 13:53:19
    ");
}

#[test]
fn detects_the_take_off_before_two_hovers_in_wave() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/two-wave-hovers.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               09:44:54
    info    landing                12:57:20
    flight 09:44:54 to 12:57:20
    ");
}

/// The recording starts too shortly before the take-off run for a ground
/// period, so the first fix is the only ground that the hovers compare with.
#[test]
fn detects_the_landing_after_a_slow_hover_in_wave() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/slow-wave-hover.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               12:05:56
    info    landing                16:15:51
    flight 12:05:56 to 16:15:51
    ");
}

#[test]
fn detects_one_flight_across_a_short_hover_in_wave() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/short-wave-hover.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               13:51:02
    info    landing                15:42:32
    flight 13:51:02 to 15:42:32
    ");
}

#[test]
fn detects_an_outlanding_far_above_the_take_off() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/outlanding-on-higher-ground.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               10:22:48
    info    landing                14:52:20
    flight 10:22:48 to 14:52:20
    ");
}

#[test]
fn detects_no_take_off_for_a_ground_tow() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/ground-tow.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               11:36:26
    info    landing                14:48:00
    flight 11:36:26 to 14:48:00
    ");
}

#[test]
fn detects_a_landing_on_pressure_altitudes_around_zero() {
    let analysis = analyze_excerpt(include_bytes!("fixtures/sea-level.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               12:00:49
    info    landing                15:37:05
    flight 12:00:49 to 15:37:05
    ");
}

#[test]
fn detects_flights_on_gnss_altitude() {
    // Bytes 26 to 30 of a B record hold its pressure altitude.
    let lines = include_str!("fixtures/normal.igc").lines();
    let contents = lines.map(|line| {
        if line.starts_with('B') {
            format!("{}00000{}\n", &line[..25], &line[30..])
        } else {
            format!("{line}\n")
        }
    });
    let analysis = analyze_excerpt(contents.collect::<String>().as_bytes());
    assert_snapshot!(render_flights(&analysis), @"
    warning no_pressure_altitude   file
    info    take_off               12:19:23
    info    landing                16:39:47
    flight 12:19:23 to 16:39:47
    ");
}

#[test]
fn detects_a_landing_despite_an_altitude_spike_and_an_invalid_fix() {
    let standing = (0..60).map(|_| (0.0, 100));
    let climbing = (1..=30).map(|second| (72.0, 100 + 5 * second));
    let descending = (1..=30).map(|second| (72.0, 250 - 5 * second));
    let stopped = (0..20).map(|_| (0.0, 100));
    let fixes = standing.chain(climbing).chain(descending).chain(stopped);
    let mut records = profile(&fixes.collect::<Vec<_>>());
    // Every 30 s window of the ground period holds an invalid fix at 999 m and
    // a 15 m altitude spike.
    records[136] = records[136].replace("EA0010000100", "EV0099900999");
    records[138] = records[138].replace("EA0010000100", "EA0011500115");
    let analysis = analyze_profile(&records);
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               10:01:00
    info    landing                10:01:59
    flight 10:01:00 to 10:01:59
    ");
}

#[test]
fn warns_about_a_take_off_run_from_the_first_fix() {
    let climbing = (0..30).map(|second| (72.0, 100 + 5 * second));
    let descending = (1..=30).map(|second| (72.0, 245 - 5 * second));
    let stopped = (0..40).map(|_| (0.0, 100));
    let fixes = climbing.chain(descending).chain(stopped);
    let analysis = analyze_profile(&profile(&fixes.collect::<Vec<_>>()));
    assert_snapshot!(render_flights(&analysis), @"
    warning airborne               10:00:00 Start
    info    landing                10:00:59
    flight - to 10:00:59
    ");
}

#[test]
fn detects_a_take_off_run_from_the_second_fix() {
    let standing = [(0.0, 100), (0.0, 100)];
    let climbing = (1..30).map(|second| (72.0, 100 + 5 * second));
    let descending = (1..=30).map(|second| (72.0, 245 - 5 * second));
    let stopped = (0..40).map(|_| (0.0, 100));
    let fixes = standing
        .into_iter()
        .chain(climbing)
        .chain(descending)
        .chain(stopped);
    let analysis = analyze_profile(&profile(&fixes.collect::<Vec<_>>()));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               10:00:02
    info    landing                10:01:00
    flight 10:00:02 to 10:01:00
    ");
}

#[test]
fn detects_a_take_off_after_a_stop_on_higher_ground() {
    let standing = (0..60).map(|_| (0.0, 100));
    let climbing = (1..=32).map(|second| (72.0, 100 + 5 * second));
    let landing = (1..=6).map(|second| (72.0, 260 - 10 * second));
    let stopped = (0..36).map(|_| (0.0, 200));
    let climbing_again = (1..=30).map(|second| (72.0, 200 + 5 * second));
    let descending = (1..=25).map(|second| (72.0, 350 - 10 * second));
    let stopped_again = (0..40).map(|_| (0.0, 100));
    let fixes = standing
        .chain(climbing)
        .chain(landing)
        .chain(stopped)
        .chain(climbing_again)
        .chain(descending)
        .chain(stopped_again);
    let analysis = analyze_profile(&profile(&fixes.collect::<Vec<_>>()));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               10:01:00
    info    landing                10:01:37
    info    take_off               10:02:14
    info    landing                10:03:08
    flight 10:01:00 to 10:01:37
    flight 10:02:14 to 10:03:08
    ");
}

#[test]
fn detects_a_take_off_after_a_slow_roll_on_the_airfield() {
    let standing = (0..60).map(|_| (0.0, 100));
    let climbing = (1..=30).map(|second| (72.0, 100 + 5 * second));
    let descending = (1..=30).map(|second| (72.0, 250 - 5 * second));
    let rolling = (0..40).map(|_| (9.0, 100));
    let climbing_again = (1..=30).map(|second| (72.0, 100 + 5 * second));
    let descending_again = (1..=30).map(|second| (72.0, 250 - 5 * second));
    let stopped = (0..40).map(|_| (0.0, 100));
    let fixes = standing
        .chain(climbing)
        .chain(descending)
        .chain(rolling)
        .chain(climbing_again)
        .chain(descending_again)
        .chain(stopped);
    let analysis = analyze_profile(&profile(&fixes.collect::<Vec<_>>()));
    assert_snapshot!(render_flights(&analysis), @"
    info    take_off               10:01:00
    info    landing                10:01:59
    info    take_off               10:02:40
    info    landing                10:03:39
    flight 10:01:00 to 10:01:59
    flight 10:02:40 to 10:03:39
    ");
}

#[test]
fn ignores_a_hover_in_wave_above_ground_lower_than_the_first_fix() {
    let descending = (1..=30).map(|second| (72.0, 1000 - 30 * second));
    let standing = (0..60).map(|_| (0.0, 100));
    let climbing = (1..=60).map(|second| (72.0, 100 + 5 * second));
    let hovering = (0..40).map(|_| (7.2, 400));
    let climbing_again = (1..=20).map(|second| (72.0, 400 + 5 * second));
    let descending_again = (1..=40).map(|second| (72.0, 500 - 10 * second));
    let stopped = (0..40).map(|_| (0.0, 100));
    let fixes = descending
        .chain(standing)
        .chain(climbing)
        .chain(hovering)
        .chain(climbing_again)
        .chain(descending_again)
        .chain(stopped);
    let analysis = analyze_profile(&profile(&fixes.collect::<Vec<_>>()));
    assert_snapshot!(render_flights(&analysis), @"
    warning airborne               10:00:00 Start
    info    landing                10:00:29
    info    take_off               10:01:30
    info    landing                10:04:09
    flight - to 10:00:29
    flight 10:01:30 to 10:04:09
    ");
}
