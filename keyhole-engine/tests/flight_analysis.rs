use std::fmt::Write;

use bytes::Bytes;
use insta::assert_snapshot;
use keyhole_engine::flight_analysis::{Date, FileAnalysis, analyze_file};
use keyhole_engine::time::UtcTime;

fn analyze(contents: &str) -> FileAnalysis {
    analyze_file(Bytes::copy_from_slice(contents.as_bytes()))
}

/// Renders the flight with fix times relative to midnight of the recorded
/// date, so that the snapshots stay readable.
fn render(analysis: &FileAnalysis) -> String {
    let mut out = String::new();
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
