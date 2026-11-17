//! The opt-in full-data suite over a local soaringspot-downloader output, and
//! its behaviour on small synthetic datasets.

use std::env;
use std::fs;
use std::path::Path;

use insta::assert_snapshot;
use keyhole_oracle::check_dataset;
use tempfile::TempDir;

/// Scores every class day of the dataset that `KEYHOLE_ORACLE_DATASET` names
/// and prints the report, and does nothing without it.
#[test]
fn downloaded_class_days_match_the_published_results() {
    let Some(dataset) = env::var_os("KEYHOLE_ORACLE_DATASET") else {
        return;
    };
    let report = check_dataset(Path::new(&dataset)).unwrap_or_else(|error| panic!("{error:#}"));
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

/// Writes a class day under `<competition>/<class>/<date>` as
/// soaringspot-downloader does.
fn write_day(dataset: &TempDir, day: &str, status: &str, line: &str, row: &str) {
    let directory = dataset.path().join(day);
    fs::create_dir_all(&directory).unwrap();
    let task = format!(
        r#"{{"task_type": "assigned_area", "task_duration": 10800, "result_status": "{status}"}}"#
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
    assert_snapshot!(report, @"Checked class days: 2, failing: 0");
}

#[test]
fn mismatching_class_day_fails() {
    let dataset = TempDir::new().unwrap();
    let finisher = FINISHER.replace(",1000,0,", ",999,0,");
    write_day(&dataset, DAY, "official", LINE, &finisher);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(!report.passes());
    assert_snapshot!(report, @"
    some-competition/club/2026-06-01:
    A points: published 999, Keyhole 1000
    Decisions:
      A: finished 300 km in 3:00:00 (from the download)
    Checked class days: 1, failing: 1
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
    ");
}

#[test]
fn left_out_class_days_are_counted_by_reason() {
    let dataset = TempDir::new().unwrap();
    let handicapped = LINE.replace("no handicaps", "handicapping enabled");
    let with_handicap = FINISHER.replace(",Arcus,,", ",Arcus,1.000,");
    let leeton = "leeton-multiclass-nationals-2026/club/2026-01-08";
    let wgc_2021 = "wgc2021-club-std-15m-montlucon-gueret-2021/club/2021-06-01";
    write_day(&dataset, DAY, "cancelled", LINE, FINISHER);
    write_day(&dataset, leeton, "official", LINE, FINISHER);
    write_day(&dataset, NEXT_DAY, "official", &handicapped, FINISHER);
    let older_line = "Maximum Points: 1000\n; Day factor = 1.000, Completion factor = 1.000";
    write_day(&dataset, wgc_2021, "official", older_line, &with_handicap);
    let report = check_dataset(dataset.path()).unwrap();
    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    Checked class days: 0, failing: 0
    Left out class days (Australian national rules): 1
    Left out class days (SeeYou's pre-9.01 handicap reference): 1
    Left out class days (cancelled): 1
    Left out class days (handicapped without a Handicap column): 1
    ");
}
