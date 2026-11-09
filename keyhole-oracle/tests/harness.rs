use keyhole_oracle::{Fixture, Report, check};

const HEADER: &str = "rank,cn,contestant,countries,club,team,glider,handicap,start_time_local,finish_time_local,duration,speed_kmh,distance_km,points,points_sort_key,penalty_points,remarks";

const TASK: &str = r#"{"task_type": "assigned_area", "task_duration": 10800}"#;

const FIXTURE_FILE: &str = r#"
edition = "FAI Annex A 2025a"
flown_under = "unknown"
earth_model = "WGS84"

[scoring_parameters]
dm = 120
d1 = 300

[published_day_parameters]
d1 = 300
n = 1
n1 = 1
n2 = 1
do = 300.00
vo = 100.00
f = 1.000
fcr = 1.000
maximum_points = 1000
"#;

const FINISHER: &str = "1,A,Crew A,de,,,Arcus,,12:00:00,15:00:00,3:00:00,100,300,1000,0,,";

fn results(rows: &[&str]) -> String {
    [HEADER]
        .iter()
        .chain(rows)
        .map(|row| format!("{row}\n"))
        .collect()
}

fn check_day(rows: &[&str], fixture_file: &str) -> Report {
    let fixture = Fixture::parse(TASK, &results(rows), fixture_file).unwrap();
    check(&fixture).unwrap()
}

#[test]
fn matching_day_passes() {
    let report = check_day(&[FINISHER], FIXTURE_FILE);

    assert!(report.passes(), "{report}");
}

#[test]
fn wrong_published_day_parameter_fails() {
    let fixture_file = FIXTURE_FILE.replace("do = 300.00", "do = 299.99");

    let report = check_day(&[FINISHER], &fixture_file);

    assert!(!report.passes());
    assert_eq!(
        report.to_string().lines().next(),
        Some("Do: published 299.99, Keyhole 300.00")
    );
}

#[test]
fn wrong_published_row_value_fails() {
    let finisher = FINISHER.replace(",100,300,1000,", ",100.01,300,999,");

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(!report.passes());
    let lines: Vec<_> = report
        .to_string()
        .lines()
        .take(2)
        .map(String::from)
        .collect();
    assert_eq!(
        lines,
        [
            "A points: published 999, Keyhole 1000",
            "A speed: published 100.01, Keyhole 100.00",
        ]
    );
}

#[test]
fn values_are_compared_at_the_published_precision() {
    let finisher = FINISHER.replace(",100,300,", ",100.004,300.004,");

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(report.passes(), "{report}");
}

const POINTS_DEVIATION: &str = r#"
[[deviations]]
competition_id = "A"
field = "points"
explanation = "SeeYou scored a different value."
"#;

#[test]
fn recorded_deviation_explains_a_mismatch() {
    let finisher = FINISHER.replace(",1000,0,", ",999,0,");

    let report = check_day(&[&finisher], &format!("{FIXTURE_FILE}{POINTS_DEVIATION}"));

    assert!(report.passes(), "{report}");
    assert_eq!(
        report.to_string().lines().next(),
        Some(
            "A points: published 999, Keyhole 1000 (recorded deviation: SeeYou scored a different value.)"
        )
    );
}

#[test]
fn stale_recorded_deviation_fails() {
    let report = check_day(&[FINISHER], &format!("{FIXTURE_FILE}{POINTS_DEVIATION}"));

    assert!(!report.passes());
    assert_eq!(
        report.to_string().lines().next(),
        Some("A points: recorded deviation no longer occurs: SeeYou scored a different value.")
    );
}

#[test]
fn report_lists_day_parameter_mismatches_before_row_mismatches() {
    let finisher = FINISHER.replace(",1000,0,", ",999,0,");
    let fixture_file = FIXTURE_FILE.replace("n2 = 1", "n2 = 0");

    let report = check_day(&[&finisher], &fixture_file);

    let lines: Vec<_> = report
        .to_string()
        .lines()
        .take(2)
        .map(String::from)
        .collect();
    assert_eq!(
        lines,
        [
            "n2: published 0, Keyhole 1",
            "A points: published 999, Keyhole 1000",
        ]
    );
}

#[test]
fn report_names_the_decisions_applied_to_each_row() {
    let report = check_day(&[FINISHER], FIXTURE_FILE);

    assert!(report.to_string().ends_with(
        "Decisions:\n  A: manual result finished from 12:00:00 to 15:00:00, 300 km (from the download)\n"
    ));
}

#[test]
fn remarks_are_never_compared() {
    let finisher = format!("{FINISHER}Loggerintervall");

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(report.passes(), "{report}");
}

fn decisions(report: &Report) -> Vec<(&str, &str)> {
    let decisions = report.decisions.iter();
    decisions
        .map(|(id, decisions)| (id.as_str(), decisions.as_str()))
        .collect()
}

#[test]
fn dnf_rows_did_not_fly_and_dns_rows_count_without_achievements() {
    let fixture_file = format!(
        r#"{FIXTURE_FILE}
[[deviations]]
competition_id = "B"
field = "rank"
explanation = "SoaringSpot leaves DNS rows unranked."
"#
    )
    .replace("n = 1", "n = 2")
    .replace("f = 1.000", "f = 0.625");
    let rows = [
        FINISHER.replace(",1000,", ",625,").replace("\n", ""),
        "DNS,B,Crew B,de,,,Arcus,,,,,,0,0,0,,".into(),
        "DNF,C,Crew C,de,,,Arcus,,,,,,0,0,0,,".into(),
    ];
    let rows: Vec<_> = rows.iter().map(String::as_str).collect();

    let report = check_day(&rows, &fixture_file);

    assert!(report.passes(), "{report}");
    assert_eq!(
        decisions(&report)[1..],
        [
            (
                "B",
                "manual result landed without starting, 0 km (from the download)"
            ),
            ("C", "did not fly (from the download)"),
        ]
    );
}

#[test]
fn penalty_points_become_the_penalty() {
    let finisher = FINISHER.replace(",1000,0,,", ",988,0,12,Start (12 penalty points)");

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(report.passes(), "{report}");
    assert_eq!(
        decisions(&report),
        [(
            "A",
            "manual result finished from 12:00:00 to 15:00:00, 300 km (from the download), penalty 12 (from the download)"
        )]
    );
}

#[test]
fn fractional_penalty_points_are_rounded_and_compared() {
    let finisher = FINISHER.replace(",1000,0,,", ",995,0,5.164,");

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(!report.passes());
    assert_eq!(
        report.to_string().lines().next(),
        Some("A penalty: published 5.164, Keyhole 5")
    );
    assert_eq!(report.row_mismatches.len(), 1);
    assert_eq!(
        decisions(&report),
        [(
            "A",
            "manual result finished from 12:00:00 to 15:00:00, 300 km (from the download), penalty 5 (from the download)"
        )]
    );
}

#[test]
fn recorded_deviation_explains_a_fractional_penalty() {
    let finisher = FINISHER.replace(",1000,0,,", ",995,0,5.164,");
    let fixture_file = format!(
        "{FIXTURE_FILE}\n[[deviations]]\ncompetition_id = \"A\"\nfield = \"penalty\"\nexplanation = \"Whole points only.\"\n"
    );

    let report = check_day(&[&finisher], &fixture_file);

    assert!(report.passes(), "{report}");
}

#[test]
fn negative_penalty_points_are_an_error() {
    let finisher = FINISHER.replace(",1000,0,,", ",1000,0,-5,");
    let fixture = Fixture::parse(TASK, &results(&[&finisher]), FIXTURE_FILE).unwrap();

    let error = check(&fixture).unwrap_err();

    assert_eq!(error.to_string(), "A has a negative penalty of -5 points");
}

#[test]
fn fixture_file_decisions_win_over_derived_ones() {
    let finisher = FINISHER.replace(",1000,0,,", ",0,0,,");
    let fixture_file = format!(
        r#"{FIXTURE_FILE}
[decisions.A]
result = {{ landed = {{ start_time = "12:00:00", distance = 300.0 }} }}
penalty = 1000
"#
    )
    .replace("n2 = 1", "n2 = 0")
    .replace("vo = 100.00", "vo = 0.00")
    .replace("fcr = 1.000", "fcr = 0.600");
    let report = check_day(&[&finisher], &fixture_file);

    assert_eq!(
        decisions(&report),
        [(
            "A",
            "manual result landed after starting at 12:00:00, 300 km (from the fixture file), penalty 1000 (from the fixture file)"
        )]
    );
    let mismatches: Vec<_> = report
        .row_mismatches
        .iter()
        .map(|m| m.field.to_string())
        .collect();
    assert_eq!(mismatches, ["speed", "finish time"]);
}

#[test]
fn fixture_file_decision_without_a_row_is_an_error() {
    let fixture_file = format!("{FIXTURE_FILE}\n[decisions.B]\npenalty = 5\n");
    let fixture = Fixture::parse(TASK, &results(&[FINISHER]), &fixture_file).unwrap();

    let error = check(&fixture).unwrap_err();

    assert_eq!(
        error.to_string(),
        "the fixture file decides on B, which has no row"
    );
}

#[test]
fn assigned_area_task_without_a_minimum_task_time_is_an_error() {
    let task = r#"{"task_type": "assigned_area"}"#;

    let error = Fixture::parse(task, &results(&[FINISHER]), FIXTURE_FILE).unwrap_err();

    assert_eq!(
        error.to_string(),
        "the assigned area task has no `task_duration`"
    );
}

#[test]
fn wrong_published_rank_fails() {
    let finisher = FINISHER.replacen("1,", "2,", 1);

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(!report.passes());
    assert_eq!(
        report.to_string().lines().next(),
        Some("A rank: published 2, Keyhole 1")
    );
}

#[test]
fn rows_are_paired_by_competition_id_and_tied_rows_compare_ranks_only() {
    let fixture_file = FIXTURE_FILE.replace("n = 1\nn1 = 1\nn2 = 1", "n = 2\nn1 = 2\nn2 = 2");
    let rows = [
        "1,B,Crew B,de,,,Arcus,,12:10:00,15:10:00,3:00:00,99.9967,299.99,1000,0,,",
        "1,A,Crew A,de,,,Arcus,,12:00:00,15:00:00,3:00:00,100,300,1000,0,,",
    ];

    let report = check_day(&rows, &fixture_file);

    assert!(report.passes(), "{report}");
}

#[test]
fn duplicate_competition_id_is_an_error() {
    let fixture = Fixture::parse(TASK, &results(&[FINISHER, FINISHER]), FIXTURE_FILE).unwrap();

    let error = check(&fixture).unwrap_err();

    assert_eq!(error.to_string(), "A has more than one row");
}

const GUEST: &str = "HC,G,Crew G,de,,,Arcus,,12:00:00,15:00:00,3:00:00,100,300,1000,0,,";

#[test]
fn hc_rows_are_hors_concours() {
    let report = check_day(&[FINISHER, GUEST], FIXTURE_FILE);

    assert!(report.passes(), "{report}");
    assert_eq!(
        decisions(&report)[1],
        (
            "G",
            "manual result finished from 12:00:00 to 15:00:00, 300 km (from the download), hors concours (from the download)"
        )
    );
}

#[test]
fn fixture_file_decides_on_hors_concours() {
    let fixture_file = format!("{FIXTURE_FILE}\n[decisions.G]\nhors_concours = false\n")
        .replace("n = 1\nn1 = 1\nn2 = 1", "n = 2\nn1 = 2\nn2 = 2");

    let report = check_day(&[FINISHER, GUEST], &fixture_file);

    assert_eq!(
        report.to_string().lines().next(),
        Some("G rank: published HC, Keyhole 1")
    );
    assert_eq!(
        decisions(&report)[1].1,
        "manual result finished from 12:00:00 to 15:00:00, 300 km (from the download), not hors concours (from the fixture file)"
    );
}
