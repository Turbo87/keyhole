//! The opt-in full-data suite over a local soaringspot-downloader output, and
//! its behaviour on small synthetic downloads.
//!
//! `KEYHOLE_SOARINGSPOT_DOWNLOAD=<directory> cargo test --release --test
//! full_data -- --nocapture` checks every class day of the download against the
//! baseline stored inside it, and `KEYHOLE_ACCEPT_BASELINE=1` writes the
//! current mismatches as that baseline.

use std::env;
use std::fs;
use std::path::Path;

use keyhole_oracle::{Baseline, check_download};
use tempfile::TempDir;

/// Names the directory of a soaringspot-downloader output to check.
const DOWNLOAD_VARIABLE: &str = "KEYHOLE_SOARINGSPOT_DOWNLOAD";
/// Set to write the current mismatches as the download's baseline.
const ACCEPT_VARIABLE: &str = "KEYHOLE_ACCEPT_BASELINE";

#[test]
fn soaringspot_download_matches_its_baseline() {
    let Some(directory) = env::var_os(DOWNLOAD_VARIABLE) else {
        return;
    };
    let baseline = match env::var_os(ACCEPT_VARIABLE) {
        Some(_) => Baseline::Accept,
        None => Baseline::Gate,
    };

    let report = check_download(Path::new(&directory), baseline).unwrap_or_else(|error| {
        panic!("{DOWNLOAD_VARIABLE} names an unusable download: {error:#}")
    });

    println!("{report}");
    assert!(report.passes(), "the download doesn't match its baseline");
}

const HEADER: &str = "rank,cn,contestant,countries,club,team,glider,handicap,start_time_local,finish_time_local,duration,speed_kmh,distance_km,points,points_sort_key,penalty_points,remarks";

const TASK: &str = r#"{"task_type": "assigned_area", "task_distance": 300000.0, "task_duration": 10800, "result_status": "official"}"#;

const TASK_INFO: &str =
    "Assigned Area Task, Maximum Points: 1000, F = 1,000, Fcr = 1,000, Max speed pts: 667
; Dm = 120km, D1 = 300km, no handicaps
; PEVWaitTime: 5min, PEVStartWindow: 8min,  N: 1, n1: 1, n2: 1, Do: 300,00km, Vo: 100,00km/h";

const FINISHER: &str = "1,A,Crew A,de,,,Arcus,,12:00:00,15:00:00,3:00:00,100,300,1000,0,,";

struct ClassDay<'a> {
    path: &'a str,
    task: &'a str,
    task_info: &'a str,
    rows: &'a [&'a str],
}

const DAY: ClassDay = ClassDay {
    path: "some-competition/open/2024-05-11",
    task: TASK,
    task_info: TASK_INFO,
    rows: &[FINISHER],
};

fn write_download(days: &[ClassDay]) -> TempDir {
    let download = TempDir::new().unwrap();
    for day in days {
        let directory = download.path().join(day.path);
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("task.json"), day.task).unwrap();
        let html = format!(
            "<div><span>Task info:</span><span>{}</span></div>",
            day.task_info.replace('<', "&lt;")
        );
        fs::write(directory.join("results.html"), html).unwrap();
        let results: String = [HEADER]
            .iter()
            .chain(day.rows)
            .map(|row| format!("{row}\n"))
            .collect();
        fs::write(directory.join("results.csv"), results).unwrap();
    }
    download
}

fn error(directory: &Path) -> String {
    format!(
        "{:#}",
        check_download(directory, Baseline::Gate).unwrap_err()
    )
}

#[test]
fn missing_download_is_an_error() {
    let parent = TempDir::new().unwrap();
    let directory = parent.path().join("missing");

    assert!(error(&directory).starts_with("reading the download directory"));
}

#[test]
fn download_without_class_days_is_an_error() {
    let directory = TempDir::new().unwrap();

    assert_eq!(
        error(directory.path()),
        format!("{} holds no class days", directory.path().display())
    );
}

#[test]
fn matching_download_passes() {
    let download = write_download(&[DAY]);

    let report = check_download(download.path(), Baseline::Gate).unwrap();

    assert!(report.passes(), "{report}");
}

fn check(download: &TempDir, baseline: Baseline) -> keyhole_oracle::DownloadReport {
    check_download(download.path(), baseline).unwrap()
}

fn wrong_points() -> String {
    FINISHER.replace(",1000,0,", ",999,0,")
}

#[test]
fn mismatch_without_a_baseline_fails() {
    let rows = [wrong_points()];
    let rows: Vec<_> = rows.iter().map(String::as_str).collect();
    let download = write_download(&[ClassDay { rows: &rows, ..DAY }]);

    let report = check(&download, Baseline::Gate);

    assert!(!report.passes());
    assert!(report.to_string().contains(
        "  points, finisher: 1\n    some-competition/open/2024-05-11 A points: published 999, Keyhole 1000\n"
    ));
}

#[test]
fn accepted_mismatch_passes_later_runs() {
    let rows = [wrong_points()];
    let rows: Vec<_> = rows.iter().map(String::as_str).collect();
    let download = write_download(&[ClassDay { rows: &rows, ..DAY }]);

    assert!(check(&download, Baseline::Accept).passes());
    let report = check(&download, Baseline::Gate);

    assert!(report.passes(), "{report}");
    assert_eq!(
        fs::read_to_string(download.path().join("keyhole-oracle-baseline.txt")).unwrap(),
        "some-competition/open/2024-05-11 A points: published 999, Keyhole 1000\n"
    );
}

#[test]
fn new_mismatch_fails_against_the_baseline() {
    let download = write_download(&[DAY]);
    check(&download, Baseline::Accept);
    let rows = [wrong_points()];
    let rows: Vec<_> = rows.iter().map(String::as_str).collect();
    write_download_into(&download, &[ClassDay { rows: &rows, ..DAY }]);

    let report = check(&download, Baseline::Gate);

    assert!(!report.passes());
    assert!(report.to_string().ends_with(
        "Not in the baseline:\n  some-competition/open/2024-05-11 A points: published 999, Keyhole 1000\n"
    ));
}

#[test]
fn baseline_mismatch_that_starts_matching_fails() {
    let rows = [wrong_points()];
    let rows: Vec<_> = rows.iter().map(String::as_str).collect();
    let download = write_download(&[ClassDay { rows: &rows, ..DAY }]);
    check(&download, Baseline::Accept);
    write_download_into(&download, &[DAY]);

    let report = check(&download, Baseline::Gate);

    assert!(!report.passes());
    assert!(report.to_string().ends_with(
        "In the baseline but no longer occurring:\n  some-competition/open/2024-05-11 A points: published 999, Keyhole 1000\n"
    ));
}

#[test]
fn report_lists_day_parameters_before_rows() {
    let rows = [wrong_points()];
    let rows: Vec<_> = rows.iter().map(String::as_str).collect();
    let task_info = TASK_INFO.replace("n2: 1", "n2: 0");
    let download = write_download(&[ClassDay {
        rows: &rows,
        task_info: &task_info,
        ..DAY
    }]);

    let report = check(&download, Baseline::Gate).to_string();

    let groups: Vec<_> = report
        .lines()
        .filter(|line| line.starts_with("  ") && !line.starts_with("    "))
        .take(2)
        .collect();
    assert_eq!(
        groups,
        [
            "  n2, day parameter: 1",
            "  points, after a day parameter mismatch: 1"
        ]
    );
}

#[test]
fn left_out_class_days_are_counted() {
    let cancelled = TASK.replace("official", "cancelled");
    let download = write_download(&[
        ClassDay {
            path: "some-competition/open/2024-05-12",
            task: &cancelled,
            ..DAY
        },
        ClassDay {
            path: "some-competition/club/2024-05-11",
            task_info: &TASK_INFO.replace("no handicaps", "handicapping enabled"),
            ..DAY
        },
        ClassDay {
            path: "wgc2021-club-std-15m-montlucon-gueret-2021/club/2021-08-05",
            task_info: &TASK_INFO.replace("no handicaps", "handicapping enabled"),
            rows: &[&FINISHER.replace(",Arcus,,", ",Arcus,1.062,")],
            ..DAY
        },
        ClassDay {
            path: "leeton-multiclass-nationals-2026/club/2026-01-10",
            task_info: "Maximum Points: 1000, Pvmax: 600, Pdmax: 400",
            ..DAY
        },
        DAY,
    ]);

    let report = check(&download, Baseline::Gate);

    assert!(report.passes(), "{report}");
    assert!(report.to_string().starts_with(
        "Checked 1 class days.
Left out 1 class days: cancelled.
Left out 1 class days: handicapped without a Handicap column.
Left out 1 class days: scored with the handicap reference before SeeYou 9.01.
Left out 1 class days: competition out of scope.
"
    ));
}

#[test]
fn unresolved_class_day_fails_loudly() {
    let download = write_download(&[ClassDay {
        task_info: "Maximum Points: 422\n; Day factor = 0,395, Completion factor = 1,000",
        ..DAY
    }]);

    assert_eq!(
        error(download.path()),
        "the rule set family of these class days can't be resolved:\nsome-competition/open/2024-05-11"
    );
}

#[test]
fn handicaps_on_the_1000_scale_score_on_the_1000_scale() {
    let task_info = TASK_INFO
        .replace("no handicaps", "handicapping enabled")
        .replace(
            "Do: 300,00km, Vo: 100,00km/h",
            "Do: 240,00km, Vo: 80,00km/h",
        )
        .replace("Maximum Points: 1000", "Maximum Points: 750");
    let finisher = FINISHER
        .replace(",Arcus,,", ",Arcus,1250,")
        .replace(",1000,0,", ",750,0,");
    let download = write_download(&[ClassDay {
        task_info: &task_info,
        rows: &[&finisher],
        ..DAY
    }]);

    let report = check(&download, Baseline::Gate);

    assert!(report.passes(), "{report}");
}

fn write_download_into(download: &TempDir, days: &[ClassDay]) {
    let fresh = write_download(days);
    for day in days {
        for file in ["task.json", "results.html", "results.csv"] {
            fs::copy(
                fresh.path().join(day.path).join(file),
                download.path().join(day.path).join(file),
            )
            .unwrap();
        }
    }
}
