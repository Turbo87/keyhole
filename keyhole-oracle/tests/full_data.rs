//! The opt-in full-data suite over a local soaringspot-downloader output, and
//! its behaviour on small synthetic datasets.

use std::env;
use std::fs;
use std::path::Path;

use insta::assert_snapshot;
use keyhole_oracle::check_dataset;
use tempfile::TempDir;

/// Scores every class day of the dataset that `KEYHOLE_ORACLE_DATASET` names
/// and prints the report, and does nothing without it. With
/// `KEYHOLE_ORACLE_ACCEPT` set, it first writes the current mismatches as the
/// dataset's baseline.
#[test]
fn downloaded_class_days_match_the_published_results() {
    let Some(dataset) = env::var_os("KEYHOLE_ORACLE_DATASET") else {
        return;
    };
    let dataset = Path::new(&dataset);
    let check = || check_dataset(dataset).unwrap_or_else(|error| panic!("{error:#}"));
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

const FINISHER: &str = "1,A,Crew A,de,,,Arcus,,12:00:00,15:00:00,3:00:00,100,300,1000,0,,";

const DAY: &str = "some-competition/club/2026-06-01";

const NEXT_DAY: &str = "some-competition/club/2026-06-02";

const LINE: &str = "Assigned Area Task, Maximum Points: 1000, F = 1,000, Fcr = 1,000
; Dm = 120km, D1 = 300km, no handicaps
; N: 1, n1: 1, n2: 1, Do: 300,00km, Vo: 100,00km/h";

/// A start line at 0°, a 20 km area at 1° of longitude and a finish cylinder
/// back at 0°, all on the equator.
const TASK_POINTS: &str = r#"[
  {"type": "start", "latitude": 0, "longitude": 0, "oz_type": "next", "oz_radius1": 10000, "oz_radius2": 0, "oz_angle1": 0.785398163397448, "oz_angle2": 0, "oz_angle12": 1.5707963267949, "oz_line": true, "oz_reduce": false},
  {"type": "point", "latitude": 0, "longitude": 0.0174532925199433, "oz_type": "symmetric", "oz_radius1": 20000, "oz_radius2": 0, "oz_angle1": 3.14159265358979, "oz_angle2": 0, "oz_angle12": 4.71238898038469, "oz_line": false, "oz_reduce": false},
  {"type": "finish", "latitude": 0, "longitude": 0, "oz_type": "previous", "oz_radius1": 3000, "oz_radius2": 0, "oz_angle1": 3.14159265358979, "oz_angle2": 0, "oz_angle12": 1.5707963267949, "oz_line": false, "oz_reduce": false}
]"#;

/// Writes a class day under `<competition>/<class>/<date>` as
/// soaringspot-downloader does.
fn write_day(dataset: &TempDir, day: &str, status: &str, line: &str, row: &str) {
    let directory = dataset.path().join(day);
    fs::create_dir_all(&directory).unwrap();
    let task = format!(
        r#"{{"task_type": "assigned_area", "task_duration": 10800, "result_status": "{status}", "task_points": {TASK_POINTS}}}"#
    );
    fs::write(directory.join("task.json"), task).unwrap();
    fs::write(directory.join("results.csv"), format!("{HEADER}\n{row}\n")).unwrap();
    let page = format!(r#"<span class="info">Task info:</span><span>{line}</span>"#);
    fs::write(directory.join("results.html"), page).unwrap();
}

#[test]
fn missing_dataset_directory_is_an_error() {
    let error = check_dataset(Path::new("no-such-dataset")).unwrap_err();
    assert_snapshot!(format!("{error:#}"), @"the dataset directory no-such-dataset doesn't exist");
}

#[test]
fn dataset_directory_without_class_days_is_an_error() {
    let dataset = TempDir::new().unwrap();
    fs::write(dataset.path().join(".DS_Store"), "").unwrap();
    let error = check_dataset(dataset.path()).unwrap_err();
    let expected = format!(
        "the dataset directory {} holds no class days",
        dataset.path().display()
    );
    assert_eq!(error.to_string(), expected);
}

#[test]
fn matching_class_days_pass() {
    let dataset = TempDir::new().unwrap();
    write_day(&dataset, DAY, "official", LINE, FINISHER);
    write_day(&dataset, NEXT_DAY, "practice", LINE, FINISHER);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    Checked class days: 2, failing: 0
    Rows with remarks of unknown effect: 0, matching anyway: 0
    ");
}

#[test]
fn mismatching_class_day_fails() {
    let dataset = TempDir::new().unwrap();
    let finisher = FINISHER.replace(",1000,0,", ",999,0,");
    write_day(&dataset, DAY, "official", LINE, &finisher);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    points, finished (1):
      some-competition/club/2026-06-01 A: published 999, Keyhole 1000
    Checked class days: 1, failing: 1
    Rows with remarks of unknown effect: 0, matching anyway: 0
    ");
}

#[test]
fn class_day_of_unknown_family_fails() {
    let dataset = TempDir::new().unwrap();
    let line = "Warning: Number of competition pilots launched is zero";
    write_day(&dataset, DAY, "official", line, FINISHER);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    some-competition/club/2026-06-01: cannot infer the rule set family of some-competition from a slug table entry, an SWO script or an Annex A parameter line
    Checked class days: 1, failing: 1
    Rows with remarks of unknown effect: 0, matching anyway: 0
    ");
}

#[test]
fn left_out_class_days_are_counted_by_reason() {
    let dataset = TempDir::new().unwrap();
    let handicapped = LINE.replace("no handicaps", "handicapping enabled");
    let with_handicap = FINISHER.replace(",Arcus,,", ",Arcus,1.000,");
    let leeton = "leeton-multiclass-nationals-2026/club/2026-01-08";
    let wgc_2021 = "wgc2021-club-std-15m-montlucon-gueret-2021/club/2021-06-01";
    let dmj_edpa = "dmj-edpa-2023/standard/2023-05-27";
    write_day(&dataset, DAY, "cancelled", LINE, FINISHER);
    write_day(&dataset, dmj_edpa, "practice", LINE, FINISHER);
    write_day(&dataset, leeton, "official", LINE, FINISHER);
    write_day(&dataset, NEXT_DAY, "official", &handicapped, FINISHER);
    let older_line = "Maximum Points: 1000\n; Day factor = 1.000, Completion factor = 1.000";
    write_day(&dataset, wgc_2021, "official", older_line, &with_handicap);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    Checked class days: 0, failing: 0
    Rows with remarks of unknown effect: 0, matching anyway: 0
    Left out class days (Australian national rules): 1
    Left out class days (SeeYou's pre-9.01 handicap reference): 1
    Left out class days (cancelled): 1
    Left out class days (handicapped without a Handicap column): 1
    Left out class days (task points past the finish): 1
    ");
}

#[test]
fn rows_with_remarks_of_unknown_effect_are_allowed_failures() {
    let dataset = TempDir::new().unwrap();
    let remarked = FINISHER.replace(",1000,0,,", ",999,0,,Airspace");
    write_day(&dataset, DAY, "official", LINE, &remarked);
    let matching = FINISHER.replace(",1000,0,,", ",1000,0,,Airspace");
    write_day(&dataset, NEXT_DAY, "official", LINE, &matching);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    Allowed failures:
    points, remark of unknown effect (1):
      some-competition/club/2026-06-01 A: published 999, Keyhole 1000
    Checked class days: 2, failing: 0
    Rows with remarks of unknown effect: 2, matching anyway: 1
    ");
}

#[test]
fn day_parameters_are_never_allowed_failures() {
    let dataset = TempDir::new().unwrap();
    let remarked = FINISHER.replace(",1000,0,,", ",1000,0,,Airspace");
    let line = LINE.replace("n2: 1", "n2: 0");
    write_day(&dataset, DAY, "official", &line, &remarked);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    n2 (1):
      some-competition/club/2026-06-01: published 0, Keyhole 1
    Checked class days: 1, failing: 1
    Rows with remarks of unknown effect: 1, matching anyway: 1
    ");
}

#[test]
fn report_groups_mismatches_by_field_and_cause_with_day_parameters_first() {
    let dataset = TempDir::new().unwrap();
    let days = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"]
        .map(|date| format!("some-competition/club/{date}"));
    let line = LINE.replace("300,00km", "299,99km");
    write_day(&dataset, &days[0], "official", &line, FINISHER);
    let finisher = FINISHER.replace(",1000,0,,", ",999,0,,");
    write_day(&dataset, &days[1], "official", LINE, &finisher);
    let penalized = FINISHER.replace(",1000,0,,", ",999,0,10,Zielhöhe (10 penalty points)");
    write_day(&dataset, &days[2], "official", LINE, &penalized);
    let remarked = FINISHER.replace(",1000,0,,", ",999,0,,Airspace");
    write_day(&dataset, &days[3], "official", LINE, &remarked);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    Do (1):
      some-competition/club/2026-06-01: published 299.99, Keyhole 300.00
    points, finished (1):
      some-competition/club/2026-06-02 A: published 999, Keyhole 1000
    points, penalty (1):
      some-competition/club/2026-06-03 A: published 999, Keyhole 990
    Allowed failures:
    points, remark of unknown effect (1):
      some-competition/club/2026-06-04 A: published 999, Keyhole 1000
    Checked class days: 4, failing: 3
    Rows with remarks of unknown effect: 1, matching anyway: 0
    ");
}

const MISMATCHING: &str = "1,A,Crew A,de,,,Arcus,,12:00:00,15:00:00,3:00:00,100,300,999,0,,";

/// The baseline file inside a dataset directory.
fn baseline(dataset: &TempDir) -> String {
    fs::read_to_string(dataset.path().join("keyhole-oracle-baseline.toml")).unwrap()
}

/// Writes a class day with a mismatching day parameter and row and a class day
/// with an allowed failure, and accepts them.
fn accepted_dataset() -> TempDir {
    let dataset = TempDir::new().unwrap();
    let line = LINE.replace("n2: 1", "n2: 0");
    write_day(&dataset, DAY, "official", &line, MISMATCHING);
    let remarked = FINISHER.replace(",1000,0,,", ",999,0,,Airspace");
    write_day(&dataset, NEXT_DAY, "official", LINE, &remarked);
    let report = check_dataset(dataset.path()).unwrap();
    report.write_baseline(dataset.path()).unwrap();
    dataset
}

#[test]
fn accept_mode_writes_the_mismatches_without_allowed_failures_as_the_baseline() {
    let dataset = accepted_dataset();
    assert_snapshot!(baseline(&dataset), @r#"
    [["some-competition/club/2026-06-01"]]
    field = "n2"
    explanation = "published 0, Keyhole 1"

    [["some-competition/club/2026-06-01"]]
    competition_id = "A"
    field = "points"
    explanation = "published 999, Keyhole 1000"
    "#);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(report.passes(), "{report}");
}

#[test]
fn new_mismatch_fails_against_the_baseline() {
    let dataset = accepted_dataset();
    let later_day = "some-competition/club/2026-06-03";
    write_day(&dataset, later_day, "official", LINE, MISMATCHING);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    points, finished (1):
      some-competition/club/2026-06-03 A: published 999, Keyhole 1000
    Allowed failures:
    points, remark of unknown effect (1):
      some-competition/club/2026-06-02 A: published 999, Keyhole 1000
    Checked class days: 3, failing: 1
    Rows with remarks of unknown effect: 1, matching anyway: 0
    ");
}

#[test]
fn baseline_row_that_starts_matching_fails() {
    let dataset = accepted_dataset();
    write_day(&dataset, DAY, "official", LINE, FINISHER);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    Allowed failures:
    points, remark of unknown effect (1):
      some-competition/club/2026-06-02 A: published 999, Keyhole 1000
    Baseline rows that no longer occur (2):
      some-competition/club/2026-06-01 n2: published 0, Keyhole 1
      some-competition/club/2026-06-01 A points: published 999, Keyhole 1000
    Checked class days: 2, failing: 1
    Rows with remarks of unknown effect: 1, matching anyway: 0
    ");
}

#[test]
fn baseline_row_of_a_class_day_no_longer_checked_fails() {
    let dataset = accepted_dataset();
    write_day(&dataset, DAY, "cancelled", LINE, MISMATCHING);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    Allowed failures:
    points, remark of unknown effect (1):
      some-competition/club/2026-06-02 A: published 999, Keyhole 1000
    Baseline rows of class days that weren't checked (2):
      some-competition/club/2026-06-01 n2: published 0, Keyhole 1
      some-competition/club/2026-06-01 A points: published 999, Keyhole 1000
    Checked class days: 1, failing: 0
    Rows with remarks of unknown effect: 1, matching anyway: 0
    Left out class days (cancelled): 1
    ");
}

#[test]
fn baseline_row_with_changed_values_fails() {
    let dataset = accepted_dataset();
    let line = LINE.replace("n2: 1", "n2: 0");
    let changed = MISMATCHING.replace(",999,0,", ",500,0,");
    write_day(&dataset, DAY, "official", &line, &changed);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    points, finished (1):
      some-competition/club/2026-06-01 A: published 500, Keyhole 1000
    Allowed failures:
    points, remark of unknown effect (1):
      some-competition/club/2026-06-02 A: published 999, Keyhole 1000
    Checked class days: 2, failing: 1
    Rows with remarks of unknown effect: 1, matching anyway: 0
    ");
}

#[test]
fn baseline_rows_of_a_class_day_left_out_for_its_handicaps_fail() {
    let dataset = accepted_dataset();
    let handicapped = LINE.replace("no handicaps", "handicapping enabled");
    write_day(&dataset, DAY, "official", &handicapped, MISMATCHING);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    Allowed failures:
    points, remark of unknown effect (1):
      some-competition/club/2026-06-02 A: published 999, Keyhole 1000
    Baseline rows of class days that weren't checked (2):
      some-competition/club/2026-06-01 n2: published 0, Keyhole 1
      some-competition/club/2026-06-01 A points: published 999, Keyhole 1000
    Checked class days: 1, failing: 0
    Rows with remarks of unknown effect: 1, matching anyway: 0
    Left out class days (handicapped without a Handicap column): 1
    ");
}

#[test]
fn accept_mode_refuses_class_day_errors_and_keeps_the_baseline() {
    let dataset = accepted_dataset();
    let accepted = baseline(&dataset);
    let line = "Warning: Number of competition pilots launched is zero";
    write_day(&dataset, DAY, "official", line, MISMATCHING);
    let report = check_dataset(dataset.path()).unwrap();
    let error = report.write_baseline(dataset.path()).unwrap_err();
    assert_snapshot!(error, @"accept mode writes no baseline while class days have errors: 1");
    assert_eq!(baseline(&dataset), accepted);
}

/// A racing task along the equator from a start line at 0° to a finish
/// cylinder at 1° of longitude, 111194.93 m on the FAI Sphere and 111319.49 m
/// on WGS84.
const FAI_SPHERE_RACING_TASK: &str = r#"{
  "task_type": "polygon",
  "result_status": "official",
  "task_distance": 111194.93,
  "task_points": [
    {"type": "start", "latitude": 0, "longitude": 0, "elevation": 100, "oz_type": "next", "oz_radius1": 10000, "oz_radius2": 0, "oz_angle1": 0.785398163397448, "oz_angle2": 0, "oz_angle12": 1.5707963267949, "oz_line": true, "oz_reduce": false},
    {"type": "finish", "latitude": 0, "longitude": 0.0174532925199433, "elevation": 100, "oz_type": "previous", "oz_radius1": 3000, "oz_radius2": 0, "oz_angle1": 3.14159265358979, "oz_angle2": 0, "oz_angle12": 4.71238898038469, "oz_line": false, "oz_reduce": false}
  ]
}"#;

#[test]
fn listed_fai_sphere_classes_measure_their_tasks_on_the_fai_sphere() {
    let dataset = TempDir::new().unwrap();
    for day in [
        "egc2023/20m-multi-seat/2023-08-04",
        "egc2023/open/2023-08-04",
    ] {
        write_day(&dataset, day, "official", LINE, FINISHER);
        let task = dataset.path().join(day).join("task.json");
        fs::write(task, FAI_SPHERE_RACING_TASK).unwrap();
    }
    let report = check_dataset(dataset.path()).unwrap();
    assert_snapshot!(report, @"
    task distance (1):
      egc2023/open/2023-08-04: published 111.1949 km, Keyhole 111.3195 km
    Checked class days: 2, failing: 1
    Rows with remarks of unknown effect: 0, matching anyway: 0
    ");
}
