use std::fmt::Write;

use bytes::Bytes;
use insta::assert_snapshot;
use keyhole_engine::flight_analysis::analysis_log::{AnalysisLogDetails, Evidence, Level};
use keyhole_engine::flight_analysis::{Date, FileAnalysis, analyze_file};
use keyhole_engine::time::UtcTime;

fn analyze(contents: &str) -> FileAnalysis {
    analyze_file(Bytes::copy_from_slice(contents.as_bytes()))
}

/// Renders the analysis log, then the flight with times as time of day and
/// days after the recorded date, so that the snapshots stay readable.
fn render(analysis: &FileAnalysis) -> String {
    let mut out = String::new();
    for entry in &analysis.log {
        let level = match entry.details.kind().level() {
            Level::Error => "error",
            Level::Warning => "warning",
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
        };
        let evidence = match entry.evidence {
            Evidence::File => "file",
        };
        writeln!(out, "{level:<7} {kind:<22} {evidence:<6} {data}").unwrap();
    }

    let Some(flight) = &analysis.flight else {
        out.push_str("no flight\n");
        return out;
    };

    let logger = &flight.logger;
    writeln!(out, "logger {} {}", logger.manufacturer, logger.serial).unwrap();
    let Date { year, month, day } = flight.recorded_date;
    writeln!(out, "date   {year:04}-{month:02}-{day:02}").unwrap();

    for fix in &flight.fixes {
        let time = time(flight.recorded_date, fix.time);
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
    for &pev in &flight.pevs {
        writeln!(out, "pev    {}", time(flight.recorded_date, pev)).unwrap();
    }

    out
}

/// Formats a time as time of day, with the days after the recorded date
/// unless it lies on that date.
fn time(recorded_date: Date, time: UtcTime) -> String {
    let seconds = time.0 - recorded_date.midnight().0;
    let (days, seconds) = (seconds.div_euclid(86_400), seconds.rem_euclid(86_400));
    let (hours, minutes, seconds) = (seconds / 3600, seconds / 60 % 60, seconds % 60);
    let time = format!("{hours:02}:{minutes:02}:{seconds:02}");
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
    fix    10:00:00 V 51.37108 6.85390 100 110
    fix    10:00:01 A -51.37110 -6.85392 -10 -5
    fix    10:00:02 A 51.37112 6.85393 102 112
    ");
}

#[test]
fn dates_start_at_utc_midnight() {
    let midnight = |year, month, day| Date { year, month, day }.midnight();
    assert_eq!(midnight(1970, 1, 1), UtcTime(0));
    assert_eq!(midnight(2000, 1, 1), UtcTime(946_684_800));
    assert_eq!(midnight(2024, 2, 29), UtcTime(1_709_164_800));
    assert_eq!(midnight(2024, 3, 1), UtcTime(1_709_251_200));
    assert_eq!(midnight(2024, 6, 16), UtcTime(1_718_496_000));
}

#[test]
fn reports_a_file_without_igc_records() {
    let mut contents = "_".repeat(1000).into_bytes();
    contents.extend_from_slice(b"\n\x00\x9f\xff\x07\nB\xc3\x28\xfe\n\r\n");
    let analysis = analyze_file(Bytes::from(contents));

    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   NotIgc
    no flight
    ");
}

const FIX: &str = "B1000005122265N00651234EA0010000110\n";

#[test]
fn reports_a_file_without_a_logger_identity() {
    let analysis = analyze(&format!("HFDTE160624\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingLoggerId
    no flight
    ");
}

#[test]
fn reports_a_file_without_a_recorded_date() {
    let analysis = analyze(&format!("ALXVABC\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingRecordedDate
    no flight
    ");
}

#[test]
fn reports_a_file_without_logger_identity_and_recorded_date() {
    let analysis = analyze(&format!("HFPLTPILOT:Jane Doe\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingLoggerId
    error   file_failed_to_parse   file   MissingRecordedDate
    no flight
    ");
}

#[test]
fn reports_an_unreadable_recorded_date() {
    let analysis = analyze(&format!("ALXVABC\nHFDTEDATE:16O624,01\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingRecordedDate
    no flight
    ");
}

#[test]
fn reports_a_recorded_date_that_does_not_exist() {
    let analysis = analyze(&format!("ALXVABC\nHFDTE300224\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingRecordedDate
    no flight
    ");
}

#[test]
fn accepts_a_leap_day_as_recorded_date() {
    let analysis = analyze(&format!("ALXVABC\nHFDTE290224\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    logger LXV ABC
    date   2024-02-29
    fix    10:00:00 A 51.37108 6.85390 100 110
    ");
}

#[test]
fn reports_a_file_without_fixes() {
    let analysis = analyze("ALXVABC\nHFDTE160624\n");
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   NoValidFixes
    no flight
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
    no flight
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
    logger LXV ABC
    date   2024-06-16
    fix    10:00:00 A 51.37108 6.85390 100 110
    fix    10:00:04 A 51.37108 6.85390 100 110
    pev    10:00:04
    ");
}

#[test]
fn reports_unreadable_lines_of_files_that_fail_to_parse() {
    let analysis = analyze(&format!("ALXVABC\nHFDTE\n{FIX}"));
    assert_snapshot!(render(&analysis), @"
    error   file_failed_to_parse   file   MissingRecordedDate
    error   unreadable_lines       file   H Malformed: 2
    no flight
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
    logger LXV ABC
    date   2024-06-16
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
    logger LXV ABC
    date   2024-06-16
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
    fix    23:59:58 A 51.37108 6.85390 100 110
    fix    00:00:01 +1d A 51.37108 6.85390 100 110
    pev    23:59:57
    pev    23:59:59
    pev    00:00:00 +1d
    pev    23:59:59
    pev    00:00:02 +1d
    ");
}
