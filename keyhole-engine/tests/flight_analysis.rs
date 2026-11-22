use std::fmt::Write;

use bytes::Bytes;
use insta::assert_snapshot;
use jiff::civil::{Date, Time};
use jiff::tz::Offset;
use jiff::{SignedDuration, Timestamp};
use keyhole_engine::flight_analysis::{
    AltitudeSource, Flight, FlightBound, IgcFile, ParseError, RecordKind, TimeWarning,
    UnreadableLines, choose_default_flight, fix_gaps, recording_interval,
};

/// The outputs of the steps for one IGC file, dated on its recorded date.
struct Analysis {
    unreadable_lines: Vec<UnreadableLines>,
    time_warnings: Vec<TimeWarning>,
    igc_file: IgcFile,
    altitude_source: AltitudeSource,
    flights: Vec<Flight>,
}

fn analyze(contents: impl AsRef<[u8]>) -> Analysis {
    let contents = Bytes::copy_from_slice(contents.as_ref());
    let (igc_file, unreadable_lines) = IgcFile::parse(contents).unwrap();
    let recorded_date = igc_file.date;
    let (igc_file, time_warnings) = igc_file.resolve_times(recorded_date).unwrap();
    Analysis {
        unreadable_lines,
        time_warnings,
        altitude_source: igc_file.altitude_source(),
        flights: igc_file.flights(),
        igc_file,
    }
}

fn parse_error(contents: impl AsRef<[u8]>) -> ParseError {
    IgcFile::parse(Bytes::copy_from_slice(contents.as_ref())).unwrap_err()
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

fn analyze_profile(records: &[String]) -> Analysis {
    analyze(format!("ALXVABC\nHFDTE160624\n{}\n", records.join("\n")))
}

/// Renders the warnings, then the IGC file with times as time of day and
/// days after the recorded date, so that the snapshots stay readable.
fn render(analysis: &Analysis) -> String {
    let mut out = render_warnings(analysis);
    let igc_file = &analysis.igc_file;
    let logger = &igc_file.logger;
    writeln!(out, "logger {} {}", logger.manufacturer, logger.serial).unwrap();
    writeln!(out, "date   {}", igc_file.date).unwrap();
    writeln!(out, "alt    {:?}", analysis.altitude_source).unwrap();
    write_flights(&mut out, analysis);

    let mut pevs = Vec::new();
    for record in &igc_file.records {
        let time = time(igc_file.date, record.time);
        let fix = match &record.kind {
            RecordKind::Fix(fix) => fix,
            RecordKind::Event(event) => {
                if event.code == "PEV" {
                    pevs.push(time);
                }
                continue;
            }
        };
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
    for pev in pevs {
        writeln!(out, "pev    {pev}").unwrap();
    }

    out
}

/// Renders the parse warnings, then the time warnings.
fn render_warnings(analysis: &Analysis) -> String {
    let mut out = String::new();
    for UnreadableLines { reason, lines } in &analysis.unreadable_lines {
        let reason = format!("{:?} {:?}", reason.record_type, reason.problem);
        writeln!(out, "unreadable {reason}: {}", join(lines)).unwrap();
    }
    for warning in &analysis.time_warnings {
        writeln!(out, "warning {warning:?}").unwrap();
    }
    out
}

/// Renders the warnings and the flights, for recordings too long to list
/// their fixes.
fn render_flights(analysis: &Analysis) -> String {
    let mut out = render_warnings(analysis);
    write_flights(&mut out, analysis);
    out
}

fn write_flights(out: &mut String, analysis: &Analysis) {
    for flight in &analysis.flights {
        writeln!(out, "flight {}", flight_times(analysis, flight)).unwrap();
    }
}

/// Formats a flight's start and end, marking those reached airborne.
fn flight_times(analysis: &Analysis, flight: &Flight) -> String {
    let date = analysis.igc_file.date;
    let bound = |bound| match bound {
        FlightBound::Detected(time) => self::time(date, time),
        FlightBound::Airborne(time) => format!("{} (airborne)", self::time(date, time)),
    };
    format!("{} to {}", bound(flight.start), bound(flight.end))
}

/// Renders the default flight of the analysis, or `scored none`.
fn render_default_flight(analysis: &Analysis) -> String {
    match choose_default_flight(&analysis.flights) {
        Some(flight) => format!("scored {}", flight_times(analysis, flight)),
        None => "scored none".into(),
    }
}

/// A flight at 72 km/h that climbs for `seconds` and descends for as long,
/// followed by 40 s on the ground.
fn short_flight(seconds: i32) -> impl Iterator<Item = (f64, i32)> {
    let climbing = (1..=seconds).map(|second| (72.0, 100 + 5 * second));
    let top = 100 + 5 * seconds;
    let descending = (1..=seconds).map(move |second| (72.0, top - 5 * second));
    let stopped = (0..40).map(|_| (0.0, 100));
    climbing.chain(descending).chain(stopped)
}

/// Formats a time as time of day, with the days after the given date unless
/// it lies on that date.
fn time(date: Date, time: Timestamp) -> String {
    let time = Offset::UTC.to_datetime(time);
    let days = time.date().since(date).unwrap().get_days();
    let time = time.strftime("%H:%M:%S").to_string();
    if days == 0 {
        time
    } else {
        format!("{time} {days:+}d")
    }
}

/// Parses a file and resolves the times of its records on the given date.
fn resolve_times(contents: &str, date: Date) -> (IgcFile, Vec<TimeWarning>) {
    let contents = Bytes::copy_from_slice(contents.as_bytes());
    let (igc_file, _) = IgcFile::parse(contents).unwrap();
    igc_file.resolve_times(date).unwrap()
}

/// Renders the time warnings, the recorded date and each record with its
/// line number and point in time.
fn render_dated((igc_file, warnings): &(IgcFile, Vec<TimeWarning>)) -> String {
    let mut out = String::new();
    for warning in warnings {
        writeln!(out, "warning {warning:?}").unwrap();
    }
    writeln!(out, "date    {}", igc_file.date).unwrap();
    for record in &igc_file.records {
        let kind = match &record.kind {
            RecordKind::Fix(fix) if fix.valid => "fix A".into(),
            RecordKind::Fix(_) => "fix V".into(),
            RecordKind::Event(event) => format!("event {}", event.code),
        };
        writeln!(out, "line {:<2} {} {kind}", record.line, record.time).unwrap();
    }
    out
}

/// Dates a file with a `B` record at each UTC time of day, written as
/// `HHMMSS`, and fix validity.
fn recording(fixes: &[(&str, char)]) -> IgcFile {
    let records = fixes
        .iter()
        .map(|(time, validity)| format!("B{time}5122265N00651234E{validity}0010000110\n"));
    let contents = format!("ALXVABC\nHFDTE160624\n{}", records.collect::<String>());
    resolve_times(&contents, Date::constant(2024, 6, 16)).0
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
    assert_eq!(parse_error(contents), ParseError::NotIgc);
}

const FIX: &str = "B1000005122265N00651234EA0010000110\n";

#[test]
fn reports_a_file_without_a_logger_identity() {
    assert_eq!(
        parse_error(format!("HFDTE160624\n{FIX}")),
        ParseError::MissingLoggerId
    );
}

#[test]
fn reports_a_file_without_a_recorded_date() {
    assert_eq!(
        parse_error(format!("ALXVABC\n{FIX}")),
        ParseError::MissingRecordedDate
    );
}

#[test]
fn reports_only_the_first_failure_of_a_file() {
    assert_eq!(
        parse_error(format!("HFPLTPILOT:Jane Doe\n{FIX}")),
        ParseError::MissingLoggerId
    );
}

#[test]
fn reports_an_unreadable_recorded_date() {
    assert_eq!(
        parse_error(format!("ALXVABC\nHFDTEDATE:16O624,01\n{FIX}")),
        ParseError::MissingRecordedDate
    );
}

#[test]
fn reports_a_recorded_date_that_does_not_exist() {
    assert_eq!(
        parse_error(format!("ALXVABC\nHFDTE300224\n{FIX}")),
        ParseError::MissingRecordedDate
    );
}

#[test]
fn accepts_a_leap_day_as_recorded_date() {
    let analysis = analyze(format!("ALXVABC\nHFDTE290224\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-02-29
    alt    Pressure
    fix    10:00:00 A 51.37108 6.85390 100 110
    ");
}

#[test]
fn parses_a_file_without_fixes() {
    let analysis = analyze("ALXVABC\nHFDTE160624\n");
    assert_snapshot!(render(&analysis), @"
    warning NoValidFix
    logger LXV ABC
    date   2024-06-16
    alt    Gnss
    ");
}

#[test]
fn parses_a_file_without_valid_fixes() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B1000005122265N00651234EV0010000110\n\
         B1000015122266N00651235EV0010100111\n",
    );
    assert_snapshot!(render(&analysis), @"
    warning NoValidFix
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    10:00:00 V 51.37108 6.85390 100 110
    fix    10:00:01 V 51.37110 6.85392 101 111
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
         B1000045122265N00651234EA0010000110\n\
         \t \n\
         E100004PEV\n\
         E1000\n",
    );
    assert_snapshot!(render(&analysis), @"
    unreadable B Malformed: 4, 5
    unreadable B OutOfRange: 6
    unreadable E Malformed: 11
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    10:00:00 A 51.37108 6.85390 100 110
    fix    10:00:04 A 51.37108 6.85390 100 110
    pev    10:00:04
    ");
}

#[test]
fn skips_lines_of_unknown_record_types() {
    let analysis = analyze(format!("ALXVABC\nHFDTE160624\nXLXVOLTAGE:12.4\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    10:00:00 A 51.37108 6.85390 100 110
    ");
}

#[test]
fn reports_an_empty_recorded_date() {
    assert_eq!(
        parse_error(format!("ALXVABC\nHFDTE\n{FIX}")),
        ParseError::MissingRecordedDate
    );
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
fn dates_a_leading_invalid_fix_12_hours_away_on_the_previous_day() {
    let analysis = analyze(
        "ALXVABC\n\
         HFDTE160624\n\
         B1300005122265N00651234EV0010000110\n\
         B0100005122265N00651234EA0010000110\n",
    );
    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    13:00:00 -1d V 51.37108 6.85390 100 110
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
    warning OutOfOrderFixes { lines: [5] }
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
fn dates_the_records_on_a_date_override() {
    let contents = "ALXVABC\n\
                    HFDTE160624\n\
                    B2359595122265N00651234EA0010000110\n\
                    E000000PEV\n\
                    B0000015122265N00651234EA0010000110\n";
    let resolved = resolve_times(contents, Date::constant(2024, 7, 1));
    assert_snapshot!(render_dated(&resolved), @"
    date    2024-07-01
    line 3  2024-07-01T23:59:59Z fix A
    line 4  2024-07-02T00:00:00Z event PEV
    line 5  2024-07-02T00:00:01Z fix A
    ");
}

#[test]
fn drops_leading_fixes_that_do_not_come_before_the_fixes_after_them() {
    let contents = "ALXVABC\n\
                    HFDTE160624\n\
                    B1000005122265N00651234EV0010000110\n\
                    B0900005122265N00651234EV0010000110\n\
                    E103000PEV\n\
                    B1030005122265N00651234EV0010000110\n\
                    B1100005122265N00651234EA0010000110\n";
    let resolved = resolve_times(contents, Date::constant(2024, 6, 16));
    assert_snapshot!(render_dated(&resolved), @"
    warning OutOfOrderFixes { lines: [3] }
    date    2024-06-16
    line 4  2024-06-16T09:00:00Z fix V
    line 5  2024-06-16T10:30:00Z event PEV
    line 6  2024-06-16T10:30:00Z fix V
    line 7  2024-06-16T11:00:00Z fix A
    ");
}

#[test]
fn orders_the_records_by_time_and_line_number() {
    let contents = "ALXVABC\n\
                    HFDTE160624\n\
                    B1000015122265N00651234EA0010000110\n\
                    E100000PEV\n\
                    E100001PEV\n\
                    B1000025122265N00651234EA0010000110\n";
    let resolved = resolve_times(contents, Date::constant(2024, 6, 16));
    assert_snapshot!(render_dated(&resolved), @"
    date    2024-06-16
    line 4  2024-06-16T10:00:00Z event PEV
    line 3  2024-06-16T10:00:01Z fix A
    line 5  2024-06-16T10:00:01Z event PEV
    line 6  2024-06-16T10:00:02Z fix A
    ");
}

#[test]
fn detects_no_flights_without_a_valid_fix() {
    let contents = "ALXVABC\nHFDTE160624\nB1000005122265N00651234EV0010000110\n";
    let (igc_file, _) = resolve_times(contents, Date::constant(2024, 6, 16));
    assert!(igc_file.flights().is_empty());
}

#[test]
fn returns_the_records_between_two_times() {
    let contents = "ALXVABC\n\
                    HFDTE160624\n\
                    B1000005122265N00651234EA0010000110\n\
                    B1000015122265N00651234EA0010000110\n\
                    E100001PEV\n\
                    B1000025122265N00651234EA0010000110\n\
                    B1000035122265N00651234EA0010000110\n";
    let (igc_file, _) = resolve_times(contents, Date::constant(2024, 6, 16));
    // Takes UTC times of day on the recorded date.
    let lines_between = |start: &str, end: &str| {
        let time = |time: &str| format!("2024-06-16T{time}Z").parse().unwrap();
        let records = igc_file.records_between(time(start), time(end));
        records.iter().map(|record| record.line).collect::<Vec<_>>()
    };
    assert_eq!(lines_between("10:00:01", "10:00:02"), [4, 5, 6]);
    assert_eq!(lines_between("10:00:00.5", "10:00:01.5"), [4, 5]);
    assert!(lines_between("10:00:04", "11:00:00").is_empty());
    assert!(lines_between("10:00:02", "10:00:01").is_empty());
}

#[test]
fn measures_the_recording_interval_despite_a_dropout() {
    let igc_file = recording(&[
        ("100000", 'A'),
        ("100001", 'V'),
        ("100002", 'A'),
        ("100003", 'V'),
        ("100004", 'A'),
        ("100007", 'A'),
        ("100008", 'A'),
    ]);
    let interval = recording_interval(&igc_file.records);
    assert_eq!(interval, Some(SignedDuration::from_secs(1)));
}

#[test]
fn measures_the_recording_interval_the_logger_is_set_to() {
    let igc_file = recording(&[("100000", 'A'), ("100004", 'A'), ("100008", 'A')]);
    let interval = recording_interval(&igc_file.records);
    assert_eq!(interval, Some(SignedDuration::from_secs(4)));
}

#[test]
fn measures_the_shorter_of_equally_common_intervals() {
    let igc_file = recording(&[("100000", 'A'), ("100002", 'A'), ("100003", 'A')]);
    let interval = recording_interval(&igc_file.records);
    assert_eq!(interval, Some(SignedDuration::from_secs(1)));
}

#[test]
fn measures_no_recording_interval_without_two_fixes() {
    let igc_file = recording(&[("100000", 'A')]);
    assert_eq!(recording_interval(&igc_file.records), None);
}

#[test]
fn lists_the_gaps_between_valid_fixes_from_a_given_length_on() {
    let igc_file = recording(&[
        ("100000", 'A'),
        ("100001", 'A'),
        ("100003", 'V'),
        ("100005", 'A'),
        ("100006", 'A'),
        ("100008", 'A'),
        ("100009", 'A'),
    ]);
    let gaps = |minimum| {
        let gaps = fix_gaps(&igc_file.records, SignedDuration::from_secs(minimum));
        let gaps = gaps.iter().map(|gap| {
            let (start, end) = (time(igc_file.date, gap.start), time(igc_file.date, gap.end));
            format!("{start} to {end}")
        });
        gaps.collect::<Vec<_>>()
    };
    assert_eq!(gaps(2), ["10:00:01 to 10:00:05", "10:00:06 to 10:00:08"]);
    assert_eq!(gaps(3), ["10:00:01 to 10:00:05"]);
    assert!(gaps(5).is_empty());
}

#[test]
fn fails_to_date_records_outside_the_supported_range() {
    let contents = "ALXVABC\nHFDTE160624\nB2300005122265N00651234EA0010000110\n";
    let (igc_file, _) = IgcFile::parse(Bytes::from_static(contents.as_bytes())).unwrap();
    assert!(igc_file.resolve_times(Date::MAX).is_err());
}

#[test]
fn dates_a_file_without_a_valid_fix_from_its_first_fix() {
    let contents = "ALXVABC\n\
                    HFDTE160624\n\
                    E235958PEV\n\
                    B2359595122265N00651234EV0010000110\n\
                    B0000015122265N00651234EV0010000110\n";
    let resolved = resolve_times(contents, Date::constant(2024, 6, 16));
    assert_snapshot!(render_dated(&resolved), @"
    warning NoValidFix
    date    2024-06-16
    line 3  2024-06-16T23:59:58Z event PEV
    line 4  2024-06-16T23:59:59Z fix V
    line 5  2024-06-17T00:00:01Z fix V
    ");
}

#[test]
fn dates_a_file_without_fixes_from_its_first_record() {
    let contents = "ALXVABC\nHFDTE160624\nE100000PEV\n";
    let resolved = resolve_times(contents, Date::constant(2024, 6, 16));
    assert_snapshot!(render_dated(&resolved), @"
    warning NoValidFix
    date    2024-06-16
    line 3  2024-06-16T10:00:00Z event PEV
    ");
}

#[test]
fn dates_a_file_without_records() {
    let resolved = resolve_times("ALXVABC\nHFDTE160624\n", Date::constant(2024, 6, 16));
    assert_snapshot!(render_dated(&resolved), @"
    warning NoValidFix
    date    2024-06-16
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
    warning OutOfOrderFixes { lines: [5, 6] }
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
    logger LXV ABC
    date   2024-06-16
    alt    Pressure
    fix    23:59:58 A 51.37108 6.85390 100 110
    fix    00:00:01 +1d A 51.37108 6.85390 100 110
    pev    23:59:57
    pev    23:59:59
    pev    23:59:59
    pev    00:00:00 +1d
    pev    00:00:02 +1d
    ");
}

#[test]
fn ignores_a_byte_order_mark() {
    let analysis = analyze(format!("\u{feff}ALXVABC\nHFDTE160624\n{FIX}"));
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
    let analysis = analyze(include_bytes!("fixtures/normal.igc"));
    assert_snapshot!(render_flights(&analysis), @"flight 12:19:23 to 16:39:47");
}

#[test]
fn detects_every_take_off_and_landing_of_several_flights() {
    let analysis = analyze(include_bytes!("fixtures/two-winch-launches.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    warning OutOfOrderFixes { lines: [110, 617] }
    flight 10:44:50 to 10:53:00
    flight 11:12:20 to 15:18:43
    ");
}

/// The logger starts the file with the minutes before the take-off, which here
/// hold the end of a short earlier flight. The glider lands, is turned around
/// and is towed out again 70 s after it stopped.
#[test]
fn detects_a_take_off_shortly_after_a_landing() {
    let analysis = analyze(include_bytes!("fixtures/take-off-after-short-stop.igc"));
    assert_snapshot!(render_flights(&analysis), @"
    flight 13:41:16 (airborne) to 13:44:51
    flight 13:46:09 to 14:55:36
    ");
}

#[test]
fn detects_no_take_off_in_a_file_that_starts_in_the_take_off_run() {
    let analysis = analyze(include_bytes!("fixtures/starts-airborne.igc"));
    assert_snapshot!(render_flights(&analysis), @"flight 11:58:59 (airborne) to 15:22:57");
}

#[test]
fn detects_no_landing_in_a_file_that_ends_in_flight() {
    let analysis = analyze(include_bytes!("fixtures/ends-airborne.igc"));
    assert_snapshot!(render_flights(&analysis), @"flight 12:07:03 to 13:46:09 (airborne)");
}

#[test]
fn detects_no_landing_while_hovering_in_wave() {
    let analysis = analyze(include_bytes!("fixtures/wave-hover.igc"));
    assert_snapshot!(render_flights(&analysis), @"flight 11:21:52 to 18:03:40");
}

#[test]
fn detects_the_take_off_before_a_hover_in_wave() {
    let analysis = analyze(include_bytes!("fixtures/hover-after-winch-launch.igc"));
    assert_snapshot!(render_flights(&analysis), @"flight 12:56:40 to 13:53:19");
}

#[test]
fn detects_the_take_off_before_two_hovers_in_wave() {
    let analysis = analyze(include_bytes!("fixtures/two-wave-hovers.igc"));
    assert_snapshot!(render_flights(&analysis), @"flight 09:44:54 to 12:57:20");
}

/// The recording starts too shortly before the take-off run for a ground
/// period, so the first fix is the only ground that the hovers compare with.
#[test]
fn detects_the_landing_after_a_slow_hover_in_wave() {
    let analysis = analyze(include_bytes!("fixtures/slow-wave-hover.igc"));
    assert_snapshot!(render_flights(&analysis), @"flight 12:05:56 to 16:15:51");
}

#[test]
fn detects_one_flight_across_a_short_hover_in_wave() {
    let analysis = analyze(include_bytes!("fixtures/short-wave-hover.igc"));
    assert_snapshot!(render_flights(&analysis), @"flight 13:51:02 to 15:42:32");
}

#[test]
fn detects_an_outlanding_far_above_the_take_off() {
    let analysis = analyze(include_bytes!("fixtures/outlanding-on-higher-ground.igc"));
    assert_snapshot!(render_flights(&analysis), @"flight 10:22:48 to 14:52:20");
}

#[test]
fn detects_no_take_off_for_a_ground_tow() {
    let analysis = analyze(include_bytes!("fixtures/ground-tow.igc"));
    assert_snapshot!(render_flights(&analysis), @"flight 11:36:26 to 14:48:00");
}

#[test]
fn detects_a_landing_on_pressure_altitudes_around_zero() {
    let analysis = analyze(include_bytes!("fixtures/sea-level.igc"));
    assert_snapshot!(render_flights(&analysis), @"flight 12:00:49 to 15:37:05");
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
    let analysis = analyze(contents.collect::<String>().as_bytes());
    assert_eq!(analysis.altitude_source, AltitudeSource::Gnss);
    assert_snapshot!(render_flights(&analysis), @"flight 12:19:23 to 16:39:47");
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
    assert_snapshot!(render_flights(&analysis), @"flight 10:01:00 to 10:01:59");
}

#[test]
fn detects_no_take_off_for_a_take_off_run_from_the_first_fix() {
    let climbing = (0..30).map(|second| (72.0, 100 + 5 * second));
    let descending = (1..=30).map(|second| (72.0, 245 - 5 * second));
    let stopped = (0..40).map(|_| (0.0, 100));
    let fixes = climbing.chain(descending).chain(stopped);
    let analysis = analyze_profile(&profile(&fixes.collect::<Vec<_>>()));
    assert_snapshot!(render_flights(&analysis), @"flight 10:00:00 (airborne) to 10:00:59");
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
    assert_snapshot!(render_flights(&analysis), @"flight 10:00:02 to 10:01:00");
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
    flight 10:00:00 (airborne) to 10:00:29
    flight 10:01:30 to 10:04:09
    ");
}

#[test]
fn chooses_the_longest_flight() {
    let analysis = analyze(include_bytes!("fixtures/two-winch-launches.igc"));
    assert_snapshot!(render_default_flight(&analysis), @"scored 11:12:20 to 15:18:43");
}

#[test]
fn chooses_the_earlier_of_two_equally_long_flights() {
    let standing = (0..60).map(|_| (0.0, 100));
    let fixes = standing.chain(short_flight(30)).chain(short_flight(30));
    let analysis = analyze_profile(&profile(&fixes.collect::<Vec<_>>()));
    assert_snapshot!(render_flights(&analysis), @"
    flight 10:01:00 to 10:01:59
    flight 10:02:40 to 10:03:39
    ");
    assert_snapshot!(render_default_flight(&analysis), @"scored 10:01:00 to 10:01:59");
}

#[test]
fn chooses_a_flight_by_its_time_from_the_first_fix() {
    let fixes = short_flight(40).chain(short_flight(30));
    let analysis = analyze_profile(&profile(&fixes.collect::<Vec<_>>()));
    assert_snapshot!(render_flights(&analysis), @"
    flight 10:00:00 (airborne) to 10:01:19
    flight 10:02:00 to 10:02:59
    ");
    assert_snapshot!(render_default_flight(&analysis), @"scored 10:00:00 (airborne) to 10:01:19");
}

#[test]
fn chooses_a_flight_by_its_time_to_the_last_fix() {
    let standing = (0..60).map(|_| (0.0, 100));
    let climbing = (1..=80).map(|second| (72.0, 100 + 5 * second));
    let fixes = standing.chain(short_flight(30)).chain(climbing);
    let analysis = analyze_profile(&profile(&fixes.collect::<Vec<_>>()));
    assert_snapshot!(render_flights(&analysis), @"
    flight 10:01:00 to 10:01:59
    flight 10:02:40 to 10:03:59 (airborne)
    ");
    assert_snapshot!(render_default_flight(&analysis), @"scored 10:02:40 to 10:03:59 (airborne)");
}

#[test]
fn chooses_no_flight_in_a_file_without_flights() {
    let standing = (0..60).map(|_| (0.0, 100));
    let analysis = analyze_profile(&profile(&standing.collect::<Vec<_>>()));
    assert_snapshot!(render_flights(&analysis), @"");
    assert_snapshot!(render_default_flight(&analysis), @"scored none");
}
