//! The opt-in full-data check of how flights reach their task points over a local
//! soaringspot-downloader output, and its behaviour on small synthetic
//! datasets.

use std::env;
use std::fs;
use std::io::Write;
use std::path::Path;

use flate2::Compression;
use flate2::write::GzEncoder;
use insta::assert_snapshot;
use keyhole_oracle::check_task_points;
use tempfile::TempDir;

/// Checks the task points of every class day of the dataset that
/// `KEYHOLE_ORACLE_DATASET` names and prints the report, and does nothing
/// without it. With `KEYHOLE_ORACLE_ACCEPT` set, it first writes the current
/// failing rows as the dataset's baseline.
#[test]
fn downloaded_class_days_reach_their_task_points_as_published() {
    let Some(dataset) = env::var_os("KEYHOLE_ORACLE_DATASET") else {
        return;
    };
    let dataset = Path::new(&dataset);
    let check = || check_task_points(dataset).unwrap_or_else(|error| panic!("{error:#}"));
    let mut report = check();
    if env::var_os("KEYHOLE_ORACLE_ACCEPT").is_some() {
        let written = report.write_baseline(dataset);
        written.unwrap_or_else(|error| panic!("{error:#}\n{report}"));
        report = check();
    }
    println!("{report}");
    assert!(report.passes(), "the class days above fail");
}

const HEADER: &str = "rank,cn,contestant,countries,club,team,glider,handicap,start_time_local,finish_time_local,duration,speed_kmh,distance_km,points,points_sort_key,penalty_points,remarks";

/// A class day of a competition in Europe/Warsaw, two hours ahead of UTC in
/// June.
const DAY: &str = "egc2023/club/2026-06-01";

/// A start line through 0°N 0°E crossed to the east and a finish line through
/// 0.001 rad of longitude, about 6.4 km further east, crossed to the east as
/// well. Both lines are 20 km long.
const TASK_POINTS: &str = r#"[
  {"type": "start", "latitude": 0, "longitude": 0, "oz_type": "next", "oz_radius1": 10000, "oz_radius2": 0, "oz_angle1": 0, "oz_angle2": 0, "oz_angle12": 1.5707963267949, "oz_line": true, "oz_reduce": false},
  {"type": "finish", "latitude": 0, "longitude": 0.001, "oz_type": "previous", "oz_radius1": 10000, "oz_radius2": 0, "oz_angle1": 0, "oz_angle2": 0, "oz_angle12": 4.71238898038469, "oz_line": true, "oz_reduce": false}
]"#;

fn task_json(status: &str, task_points: &str) -> String {
    format!(
        r#"{{"task_type": "polygon", "task_date": "2026-06-01", "result_status": "{status}", "task_distance": 6378.137, "task_points": {task_points}}}"#
    )
}

/// An airborne flight along the equator at 100 m/s from 11:59:50 UTC, about
/// 1 km west of the start line, that crosses the start line at 12:00:00 and
/// the finish line at 12:01:03.66, ending at 12:01:20.
fn igc_file(latitude: &str) -> String {
    let mut igc_file = String::from("ALXVABC\nHFDTE010626\n");
    for second in 0..=90 {
        let minutes = -540 + 54 * second;
        let (east_west, minutes) = if minutes < 0 {
            ('W', -minutes)
        } else {
            ('E', minutes)
        };
        let time = 11 * 3600 + 59 * 60 + 50 + second;
        let (hours, minute, second) = (time / 3600, time / 60 % 60, time % 60);
        let longitude = format!("000{:02}{:03}{east_west}", minutes / 1000, minutes % 1000);
        igc_file += &format!("B{hours:02}{minute:02}{second:02}{latitude}{longitude}A0100001000\n");
    }
    igc_file
}

/// A flight right on the equator.
fn equator_flight() -> String {
    igc_file("0000000N")
}

/// A row with its published local start and finish times.
fn row(competition_id: &str, start: &str, finish: &str) -> String {
    format!("1,{competition_id},Crew,de,,,Arcus,,{start},{finish},0:01:04,,6.4,1000,0,,")
}

/// Writes a class day under `<competition>/<class>/<date>` as
/// soaringspot-downloader does, with an IGC file per competition ID.
fn write_day(
    dataset: &TempDir,
    day: &str,
    task: &str,
    rows: &[String],
    flights: &[(&str, String)],
) {
    let directory = dataset.path().join(day);
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join("task.json"), task).unwrap();
    let results = format!("{HEADER}\n{}\n", rows.join("\n"));
    fs::write(directory.join("results.csv"), results).unwrap();
    for (competition_id, flight) in flights {
        let file = fs::File::create(directory.join(format!("61A_{competition_id}.igc.gz")));
        let mut encoder = GzEncoder::new(file.unwrap(), Compression::default());
        encoder.write_all(flight.as_bytes()).unwrap();
        encoder.finish().unwrap();
    }
}

fn dataset(rows: &[String], flights: &[(&str, String)]) -> TempDir {
    let dataset = TempDir::new().unwrap();
    let task = task_json("official", TASK_POINTS);
    write_day(&dataset, DAY, &task, rows, flights);
    dataset
}

#[test]
fn matching_rows_pass_with_the_earth_model_and_time_zone_of_their_class_day() {
    let rows = [row("A", "14:00:00", "14:01:04")];
    let dataset = dataset(&rows, &[("A", equator_flight())]);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    egc2023/club/2026-06-01 (WGS84, Europe/Warsaw):
      start line: matching 1, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 0
      finish line: matching 1, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 0
    Checked class days: 1, failing: 0
    ");
}

#[test]
fn rows_1_s_off_are_counted_and_pass() {
    let rows = [row("A", "13:59:59", "14:01:05")];
    let dataset = dataset(&rows, &[("A", equator_flight())]);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    egc2023/club/2026-06-01 (WGS84, Europe/Warsaw):
      start line: matching 0, 1 s early 0, 1 s late 1, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 0
      finish line: matching 0, 1 s early 1, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 0
    Checked class days: 1, failing: 0
    ");
}

#[test]
fn rows_more_than_1_s_off_fail() {
    let rows = [row("A", "14:00:05", "14:01:04")];
    let dataset = dataset(&rows, &[("A", equator_flight())]);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    egc2023/club/2026-06-01 (WGS84, Europe/Warsaw):
      start line: matching 0, 1 s early 0, 1 s late 0, more than 1 s off 1, no crossing 0, no IGC file 0, unreadable IGC file 0
      finish line: matching 1, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 0
      A start: published 14:00:05, Keyhole 14:00:00
    Checked class days: 1, failing: 1
    ");
}

#[test]
fn rows_without_a_crossing_within_half_the_line_plus_500_m_fail() {
    let rows = [row("A", "14:00:00", "14:01:04")];
    // 0.15' is about 11 km north of the equator.
    let dataset = dataset(&rows, &[("A", igc_file("0006000N"))]);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    egc2023/club/2026-06-01 (WGS84, Europe/Warsaw):
      start line: matching 0, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 1, no IGC file 0, unreadable IGC file 0
      finish line: matching 0, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 1, no IGC file 0, unreadable IGC file 0
      A start: published 14:00:00, Keyhole no crossing
      A finish: published 14:01:04, Keyhole no crossing
    Checked class days: 1, failing: 1
    ");
}

#[test]
fn rows_without_an_igc_file_are_counted_and_pass() {
    let rows = [row("A", "14:00:00", "14:01:04"), row("B", "14:00:00", "")];
    let dataset = dataset(&rows, &[("A", equator_flight())]);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    egc2023/club/2026-06-01 (WGS84, Europe/Warsaw):
      start line: matching 1, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 1, unreadable IGC file 0
      finish line: matching 1, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 0
    Checked class days: 1, failing: 0
    ");
}

#[test]
fn class_day_of_a_competition_without_a_time_zone_fails() {
    let dataset = TempDir::new().unwrap();
    let task = task_json("official", TASK_POINTS);
    let rows = [row("A", "14:00:00", "14:01:04")];
    let day = "some-competition/club/2026-06-01";
    write_day(&dataset, day, &task, &rows, &[("A", equator_flight())]);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    some-competition/club/2026-06-01: the competition some-competition has no time zone
    Checked class days: 1, failing: 1
    ");
}

#[test]
fn left_out_class_days_are_counted_by_reason() {
    let dataset = TempDir::new().unwrap();
    let rows = [row("A", "14:00:00", "14:01:04")];
    let flights = [("A", equator_flight())];
    let write = |date, task: &str, flights: &[(&str, String)]| {
        let day = format!("egc2023/club/2026-06-{date}");
        write_day(&dataset, &day, task, &rows, flights);
    };
    write("01", &task_json("cancelled", TASK_POINTS), &flights);
    let multiple_start = TASK_POINTS.replacen(
        r#""oz_reduce": false"#,
        r#""oz_reduce": false, "multiple_start": true"#,
        1,
    );
    write("02", &task_json("official", &multiple_start), &flights);
    let without_angle12 = TASK_POINTS.replace(r#""oz_angle12": 1.5707963267949, "#, "");
    write("03", &task_json("official", &without_angle12), &flights);
    let start_cylinder = TASK_POINTS.replacen(r#""oz_line": true"#, r#""oz_line": false"#, 1);
    write("04", &task_json("official", &start_cylinder), &flights);
    write("05", &task_json("official", TASK_POINTS), &[]);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    egc2023/club/2026-06-04 (WGS84, Europe/Warsaw):
      finish line: matching 1, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 0
    Checked class days: 1, failing: 0
    Left out class days (cancelled): 1
    Left out class days (multiple start points): 1
    Left out class days (no IGC files): 1
    Left out class days (start cylinder): 1
    Left out class days (task points without oz_angle12, oz_radius2 and oz_angle2): 1
    ");
}

#[test]
fn rows_with_an_unreadable_igc_file_fail() {
    let rows = [row("A", "14:00:00", "14:01:04")];
    let dataset = dataset(&rows, &[("A", "not an IGC file".into())]);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    egc2023/club/2026-06-01 (WGS84, Europe/Warsaw):
      start line: matching 0, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 1
      finish line: matching 0, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 1
      A start: published 14:00:00, Keyhole unreadable IGC file
      A finish: published 14:01:04, Keyhole unreadable IGC file
    Checked class days: 1, failing: 1
    ");
}

/// The start line of `TASK_POINTS`, a 500 m turnpoint cylinder 0.0005 rad
/// east of it on the equator and another 0.001 rad north of that, and a
/// 500 m finish cylinder where `TASK_POINTS` has its finish line. The flight
/// along the equator enters the cylinder at about 12:00:58.66.
const CYLINDER_TASK_POINTS: &str = r#"[
  {"type": "start", "latitude": 0, "longitude": 0, "oz_type": "next", "oz_radius1": 10000, "oz_radius2": 0, "oz_angle1": 0, "oz_angle2": 0, "oz_angle12": 1.5707963267949, "oz_line": true, "oz_reduce": false},
  {"type": "point", "latitude": 0, "longitude": 0.0005, "oz_type": "symmetric", "oz_radius1": 500, "oz_radius2": 0, "oz_angle1": 3.14159265358979, "oz_angle2": 0, "oz_angle12": 0, "oz_line": false, "oz_reduce": false},
  {"type": "point", "latitude": 0.001, "longitude": 0.0005, "oz_type": "symmetric", "oz_radius1": 500, "oz_radius2": 0, "oz_angle1": 3.14159265358979, "oz_angle2": 0, "oz_angle12": 0, "oz_line": false, "oz_reduce": false},
  {"type": "finish", "latitude": 0, "longitude": 0.001, "oz_type": "previous", "oz_radius1": 500, "oz_radius2": 0, "oz_angle1": 3.14159265358979, "oz_angle2": 0, "oz_angle12": 4.71238898038469, "oz_line": false, "oz_reduce": false}
]"#;

#[test]
fn finishers_need_a_visit_to_every_turnpoint_and_the_finish_cylinder_entry_at_the_published_time() {
    let dataset = TempDir::new().unwrap();
    let task = task_json("official", CYLINDER_TASK_POINTS);
    let rows = [
        row("A", "14:00:00", "14:00:59"),
        row("B", "14:00:00", "14:01:00"),
        row("C", "14:00:00", ""),
    ];
    let flights = [
        ("A", equator_flight()),
        ("B", equator_flight()),
        ("C", equator_flight()),
    ];
    write_day(&dataset, DAY, &task, &rows, &flights);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    egc2023/club/2026-06-01 (WGS84, Europe/Warsaw):
      start line: matching 3, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 0
      turnpoints: visited 2, no visit 2, no IGC file 0, unreadable IGC file 0
      finish cylinder: matching 1, 1 s early 1, 1 s late 0, more than 1 s off 0, no entry 0, no IGC file 0, unreadable IGC file 0
      A turnpoint 2: published 14:00:59, Keyhole no visit
      B turnpoint 2: published 14:01:00, Keyhole no visit
      B finish: published 14:01:00, Keyhole 14:00:59
    Checked class days: 1, failing: 1
    ");
}

fn baseline(dataset: &TempDir) -> String {
    let path = dataset
        .path()
        .join("keyhole-oracle-task-points-baseline.toml");
    fs::read_to_string(path).unwrap()
}

/// A class day whose start is published 5 s after its crossing and whose
/// second row has no crossing, with both rows accepted into the baseline.
fn accepted_dataset() -> TempDir {
    let rows = [row("A", "14:00:05", "14:01:04"), row("B", "14:00:00", "")];
    let flights = [("A", equator_flight()), ("B", igc_file("0006000N"))];
    let dataset = dataset(&rows, &flights);
    let report = check_task_points(dataset.path()).unwrap();
    report.write_baseline(dataset.path()).unwrap();
    dataset
}

#[test]
fn accept_mode_writes_the_failing_rows_as_the_baseline() {
    let dataset = accepted_dataset();
    assert_snapshot!(baseline(&dataset), @r#"
    [["egc2023/club/2026-06-01"]]
    competition_id = "A"
    point = "start"
    explanation = "published 14:00:05, Keyhole 14:00:00"

    [["egc2023/club/2026-06-01"]]
    competition_id = "B"
    point = "start"
    explanation = "published 14:00:00, Keyhole no crossing"
    "#);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    egc2023/club/2026-06-01 (WGS84, Europe/Warsaw):
      start line: matching 0, 1 s early 0, 1 s late 0, more than 1 s off 1, no crossing 1, no IGC file 0, unreadable IGC file 0
      finish line: matching 1, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 0
    Checked class days: 1, failing: 0
    ");
}

#[test]
fn new_failing_row_fails_against_the_baseline() {
    let dataset = accepted_dataset();
    let rows = [
        row("A", "14:00:05", "14:01:04"),
        row("B", "14:00:00", "14:01:04"),
    ];
    let flights = [("A", equator_flight()), ("B", igc_file("0006000N"))];
    let task = task_json("official", TASK_POINTS);
    write_day(&dataset, DAY, &task, &rows, &flights);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    egc2023/club/2026-06-01 (WGS84, Europe/Warsaw):
      start line: matching 0, 1 s early 0, 1 s late 0, more than 1 s off 1, no crossing 1, no IGC file 0, unreadable IGC file 0
      finish line: matching 1, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 1, no IGC file 0, unreadable IGC file 0
      B finish: published 14:01:04, Keyhole no crossing
    Checked class days: 1, failing: 1
    ");
}

#[test]
fn baseline_row_with_changed_values_fails() {
    let dataset = accepted_dataset();
    let rows = [row("A", "14:00:06", "14:01:04"), row("B", "14:00:00", "")];
    let flights = [("A", equator_flight()), ("B", igc_file("0006000N"))];
    let task = task_json("official", TASK_POINTS);
    write_day(&dataset, DAY, &task, &rows, &flights);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    egc2023/club/2026-06-01 (WGS84, Europe/Warsaw):
      start line: matching 0, 1 s early 0, 1 s late 0, more than 1 s off 1, no crossing 1, no IGC file 0, unreadable IGC file 0
      finish line: matching 1, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 0
      A start: published 14:00:06, Keyhole 14:00:00
    Baseline rows that no longer occur (1):
      egc2023/club/2026-06-01 A start: published 14:00:05, Keyhole 14:00:00
    Checked class days: 1, failing: 1
    ");
}

#[test]
fn baseline_row_that_starts_matching_fails() {
    let dataset = accepted_dataset();
    let rows = [row("A", "14:00:00", "14:01:04"), row("B", "14:00:00", "")];
    let flights = [("A", equator_flight()), ("B", igc_file("0006000N"))];
    let task = task_json("official", TASK_POINTS);
    write_day(&dataset, DAY, &task, &rows, &flights);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    egc2023/club/2026-06-01 (WGS84, Europe/Warsaw):
      start line: matching 1, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 1, no IGC file 0, unreadable IGC file 0
      finish line: matching 1, 1 s early 0, 1 s late 0, more than 1 s off 0, no crossing 0, no IGC file 0, unreadable IGC file 0
    Baseline rows that no longer occur (1):
      egc2023/club/2026-06-01 A start: published 14:00:05, Keyhole 14:00:00
    Checked class days: 1, failing: 1
    ");
}

#[test]
fn baseline_rows_of_a_class_day_no_longer_checked_fail() {
    let dataset = accepted_dataset();
    let task = task_json("cancelled", TASK_POINTS);
    let rows = [row("A", "14:00:05", "14:01:04")];
    write_day(&dataset, DAY, &task, &rows, &[("A", equator_flight())]);
    let report = check_task_points(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    Baseline rows of class days that weren't checked (2):
      egc2023/club/2026-06-01 A start: published 14:00:05, Keyhole 14:00:00
      egc2023/club/2026-06-01 B start: published 14:00:00, Keyhole no crossing
    Checked class days: 0, failing: 0
    Left out class days (cancelled): 1
    ");
}

#[test]
fn accept_mode_refuses_class_day_errors_and_keeps_the_baseline() {
    let dataset = accepted_dataset();
    let accepted = baseline(&dataset);
    let rows = [row("A", "14:00:00", "14:01:04")];
    let day = "some-competition/club/2026-06-01";
    let task = task_json("official", TASK_POINTS);
    write_day(&dataset, day, &task, &rows, &[("A", equator_flight())]);
    let report = check_task_points(dataset.path()).unwrap();
    let error = report.write_baseline(dataset.path()).unwrap_err();
    assert_snapshot!(error, @"accept mode writes no baseline while class days have errors: 1");
    assert_eq!(baseline(&dataset), accepted);
}
