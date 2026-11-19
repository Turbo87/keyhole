use std::fmt::Write;

use bytes::Bytes;
use insta::assert_snapshot;
use keyhole_engine::flight_analysis::analysis_log::{AnalysisLogDetails, Evidence, Level};
use keyhole_engine::flight_analysis::{Date, FileAnalysis, analyze_file};
use keyhole_engine::time::UtcTime;

fn analyze(contents: &str) -> FileAnalysis {
    analyze_file(Bytes::copy_from_slice(contents.as_bytes()))
}

/// Renders the analysis log, then the flight with fix times relative to
/// midnight of the recorded date, so that the snapshots stay readable.
fn render(analysis: &FileAnalysis) -> String {
    let mut out = String::new();
    for entry in &analysis.log {
        let level = match entry.details.kind().level() {
            Level::Error => "error",
        };
        let (kind, data) = match &entry.details {
            AnalysisLogDetails::FileFailedToParse { reason } => {
                ("file_failed_to_parse", format!("{reason:?}"))
            }
            AnalysisLogDetails::UnreadableLines { reason, lines } => {
                let lines = lines.iter().map(ToString::to_string).collect::<Vec<_>>();
                let reason = format!("{:?} {:?}", reason.record_type, reason.problem);
                (
                    "unreadable_lines",
                    format!("{reason}: {}", lines.join(", ")),
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

    let midnight = flight.recorded_date.midnight().0;
    for fix in &flight.fixes {
        let seconds = fix.time.0 - midnight;
        let (hours, minutes, seconds) = (seconds / 3600, seconds / 60 % 60, seconds % 60);
        let validity = if fix.valid { 'A' } else { 'V' };
        writeln!(
            out,
            "fix    {hours:02}:{minutes:02}:{seconds:02} {validity} {:.5} {:.5} {} {}",
            fix.latitude, fix.longitude, fix.pressure_altitude, fix.gnss_altitude,
        )
        .unwrap();
    }

    out
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
