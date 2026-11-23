use insta::assert_snapshot;
use keyhole_oracle::{Fixture, Report, check};

const HEADER: &str = "rank,cn,contestant,countries,club,team,glider,handicap,start_time_local,finish_time_local,duration,speed_kmh,distance_km,points,points_sort_key,penalty_points,remarks";

/// An assigned area task along the equator from a start line at 0° to a
/// 20 km area at 1° of longitude and back to a finish cylinder at 0°.
const TASK: &str = r#"{
  "task_type": "assigned_area",
  "task_duration": 10800,
  "task_points": [
    {"type": "start", "latitude": 0, "longitude": 0, "oz_type": "next", "oz_radius1": 10000, "oz_radius2": 0, "oz_angle1": 0.785398163397448, "oz_angle2": 0, "oz_angle12": 1.5707963267949, "oz_line": true, "oz_reduce": false},
    {"type": "point", "latitude": 0, "longitude": 0.0174532925199433, "oz_type": "symmetric", "oz_radius1": 20000, "oz_radius2": 0, "oz_angle1": 3.14159265358979, "oz_angle2": 0, "oz_angle12": 4.71238898038469, "oz_line": false, "oz_reduce": false},
    {"type": "finish", "latitude": 0, "longitude": 0, "oz_type": "previous", "oz_radius1": 3000, "oz_radius2": 0, "oz_angle1": 3.14159265358979, "oz_angle2": 0, "oz_angle12": 1.5707963267949, "oz_line": false, "oz_reduce": false}
  ]
}"#;

/// A racing task along the equator from a start line at 0° to a finish
/// cylinder at 1° of longitude, 111319.49 m on WGS84.
const RACING_TASK: &str = r#"{
  "task_type": "polygon",
  "task_distance": 111319.49,
  "task_points": [
    {"type": "takeoff", "latitude": 0, "longitude": 0, "elevation": 100, "distance": 0, "oz_type": "unknown", "oz_radius1": 0, "oz_radius2": 0, "oz_angle1": 0, "oz_angle2": 0, "oz_angle12": 0, "oz_line": false, "oz_reduce": false},
    {"type": "start", "latitude": 0, "longitude": 0, "elevation": 100, "distance": 111319.49, "oz_type": "next", "oz_radius1": 10000, "oz_radius2": 0, "oz_angle1": 0.785398163397448, "oz_angle2": 0, "oz_angle12": 1.5707963267949, "oz_line": true, "oz_reduce": false},
    {"type": "finish", "latitude": 0, "longitude": 0.0174532925199433, "elevation": 100, "distance": 111319.49, "oz_type": "previous", "oz_radius1": 3000, "oz_radius2": 0, "oz_angle1": 3.14159265358979, "oz_angle2": 0, "oz_angle12": 4.71238898038469, "oz_line": false, "oz_reduce": false},
    {"type": "landing", "latitude": 0, "longitude": 0, "elevation": 100, "distance": 0, "oz_type": "unknown", "oz_radius1": 0, "oz_radius2": 0, "oz_angle1": 0, "oz_angle2": 0, "oz_angle12": 0, "oz_line": false, "oz_reduce": false}
  ]
}"#;

const FIXTURE_FILE: &str = r#"
rule_set = "FAI Annex A 2025a"

[rule_overrides]
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
    check_task(TASK, rows, fixture_file)
}

fn check_task(task: &str, rows: &[&str], fixture_file: &str) -> Report {
    let fixture = Fixture::parse(task, &results(rows), fixture_file).unwrap();
    check(&fixture).unwrap()
}

/// A racing task day whose finisher flew the 111.32 km of `RACING_TASK`.
fn check_racing_task(task: &str) -> Report {
    let finisher = "1,A,Crew A,de,,,Arcus,,12:00:00,13:00:00,1:00:00,111.32,111.32,200,0,,";
    check_task(task, &[finisher], "rule_set = \"FAI Annex A 2025a\"")
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
    assert_snapshot!(report, @"
    Do: published 299.99, Keyhole 300.00
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
}

#[test]
fn wrong_published_day_validity_fails() {
    let fixture_file = FIXTURE_FILE.replace(
        "maximum_points = 1000",
        "maximum_points = 1000\nvalid = false",
    );

    let report = check_day(&[FINISHER], &fixture_file);

    assert!(!report.passes());
    assert_snapshot!(report, @"
    day validity: published invalid, Keyhole valid
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
}

#[test]
fn invalid_day_passes_without_the_values_its_task_info_line_omits() {
    let landed = "1,A,Crew A,de,,,Arcus,,12:00:00,,,,100,0,0,,";
    let fixture_file = r#"
rule_set = "FAI Annex A 2025a"

[rule_overrides]
dm = 120
d1 = 300

[published_day_parameters]
valid = false
d1 = 300
n = 1
n1 = 0
n2 = 0
do = 100.00
vo = 0.00
"#;

    let report = check_day(&[landed], fixture_file);

    assert!(report.passes(), "{report}");
}

#[test]
fn day_without_published_day_parameters_compares_rows_only() {
    let finisher = FINISHER.replace(",1000,0,", ",999,0,");
    let fixture_file = r#"
rule_set = "FAI Annex A 2025a"
"#;

    let report = check_day(&[&finisher], fixture_file);

    assert_snapshot!(report, @"
    A points: published 999, Keyhole 1000
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
}

#[test]
fn values_without_rule_overrides_keep_the_edition_defaults() {
    let fixture_file = FIXTURE_FILE.replace("dm = 120\nd1 = 300\n", "dm = 120\n");

    let report = check_day(&[FINISHER], &fixture_file);

    assert!(!report.passes());
    assert_snapshot!(report, @"
    D1: published 300, Keyhole 250
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
}

#[test]
fn valid_day_without_a_published_maximum_points_is_an_error() {
    let fixture_file = FIXTURE_FILE.replace("maximum_points = 1000\n", "");
    let fixture = Fixture::parse(TASK, &results(&[FINISHER]), &fixture_file).unwrap();

    let error = check(&fixture).unwrap_err();

    assert_eq!(
        error.to_string(),
        "a valid class day needs the published F, FCR and maximum points"
    );
}

#[test]
fn unknown_edition_is_an_error() {
    let fixture_file = FIXTURE_FILE.replace("FAI Annex A 2025a", "DAeC SWO 2025");
    let fixture = Fixture::parse(TASK, &results(&[FINISHER]), &fixture_file).unwrap();

    let error = check(&fixture).unwrap_err();

    assert_eq!(
        error.to_string(),
        r#"unknown rule set edition "DAeC SWO 2025""#
    );
}

#[test]
fn unknown_fixture_file_keys_are_an_error() {
    let fixture_file = format!("scoring_parameters = {{}}\n{FIXTURE_FILE}");

    let error = Fixture::parse(TASK, &results(&[FINISHER]), &fixture_file).unwrap_err();

    assert_snapshot!(format!("{:#}", error), @"
    parsing fixture.toml: TOML parse error at line 1, column 1
      |
    1 | scoring_parameters = {}
      | ^^^^^^^^^^^^^^^^^^
    unknown field `scoring_parameters`, expected one of `rule_set`, `original_rule_set`, `handicapped`, `rule_overrides`, `published_day_parameters`, `decisions`, `deviations`
    ");
}

#[test]
fn wrong_published_row_value_fails() {
    let finisher = FINISHER.replace(",100,300,1000,", ",100.01,300,999,");

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(!report.passes());
    assert_snapshot!(report, @"
    A points: published 999, Keyhole 1000
    A speed: published 100.01, Keyhole 100.00
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
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
    assert_snapshot!(report, @"
    A points: published 999, Keyhole 1000 (recorded deviation: SeeYou scored a different value.)
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
}

#[test]
fn stale_recorded_deviation_fails() {
    let report = check_day(&[FINISHER], &format!("{FIXTURE_FILE}{POINTS_DEVIATION}"));

    assert!(!report.passes());
    assert_snapshot!(report, @"
    A points: recorded deviation no longer occurs: SeeYou scored a different value.
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
}

#[test]
fn report_lists_day_parameter_mismatches_before_row_mismatches() {
    let finisher = FINISHER.replace(",1000,0,", ",999,0,");
    let fixture_file = FIXTURE_FILE.replace("n2 = 1", "n2 = 0");

    let report = check_day(&[&finisher], &fixture_file);

    assert_snapshot!(report, @"
    n2: published 0, Keyhole 1
    A points: published 999, Keyhole 1000
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
}

#[test]
fn report_names_the_decisions_applied_to_each_row() {
    let report = check_day(&[FINISHER], FIXTURE_FILE);

    assert_snapshot!(report, @"
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
}

#[test]
fn remarks_are_never_compared() {
    let finisher = format!("{FINISHER}Loggerintervall");

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(report.passes(), "{report}");
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
    let finisher = FINISHER.replace(",1000,", ",625,");
    let rows = [
        &*finisher,
        "DNS,B,Crew B,de,,,Arcus,,,,,,0,0,0,,",
        "DNF,C,Crew C,de,,,Arcus,,,,,,0,0,0,,",
    ];

    let report = check_day(&rows, &fixture_file);

    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    B rank: published DNS, Keyhole 2 (recorded deviation: SoaringSpot leaves DNS rows unranked.)
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
      B: landed after 0 km (from the download)
      C: did not fly (from the download)
    ");
}

#[test]
fn penalty_points_become_the_penalty() {
    let finisher = FINISHER.replace(",1000,0,,", ",988,0,12,Start (12 penalty points)");

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @r#"
    Decisions:
      A: finished 300 km in 03:00:00 (from the download), penalty 12 (from the download), public remark "Start" (from the download)
    "#);
}

#[test]
fn fractional_penalty_points_are_rounded_and_compared() {
    let finisher = FINISHER.replace(",1000,0,,", ",995,0,5.164,");

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(!report.passes());
    assert_snapshot!(report, @"
    A penalty: published 5.164, Keyhole 5
    Decisions:
      A: finished 300 km in 03:00:00 (from the download), penalty 5 (from the download)
    ");
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
result = {{ flown = {{ distance = 300.0 }} }}
penalty = 1000
"#
    )
    .replace("n2 = 1", "n2 = 0")
    .replace("vo = 100.00", "vo = 0.00")
    .replace("fcr = 1.000", "fcr = 0.600");
    let report = check_day(&[&finisher], &fixture_file);

    assert_snapshot!(report, @"
    A speed: published 100.00, Keyhole nothing
    Decisions:
      A: landed after 300 km (from the fixture file), penalty 1000 (from the fixture file)
    ");
}

#[test]
fn fixture_file_decision_supplies_a_missing_finish() {
    let finisher = FINISHER.replace("12:00:00,15:00:00,", "12:00:00,,");
    let fixture_file = format!(
        r#"{FIXTURE_FILE}
[decisions.A]
result = {{ flown = {{ distance = 300.0, time = "3:00:00" }} }}
"#
    );

    let report = check_day(&[&finisher], &fixture_file);

    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    Decisions:
      A: finished 300 km in 03:00:00 (from the fixture file)
    ");
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
fn finish_at_the_start_time_is_an_error() {
    let finisher = FINISHER.replace("12:00:00,15:00:00", "15:00:00,15:00:00");
    let fixture = Fixture::parse(TASK, &results(&[&finisher]), FIXTURE_FILE).unwrap();

    let error = check(&fixture).unwrap_err();

    assert_eq!(error.to_string(), "A finished at or before the start");
}

#[test]
fn unreadable_start_time_is_an_error() {
    let finisher = FINISHER.replace("12:00:00,", "noon,");

    let error = Fixture::parse(TASK, &results(&[&finisher]), FIXTURE_FILE).unwrap_err();

    assert_snapshot!(format!("{error:#}"), @"parsing results.csv: CSV deserialize error: record 1 (line: 2, byte: 167): failed to parse two digit integer as hour: invalid digit, expected 0-9 but got n");
}

#[test]
fn racing_task_finisher_is_not_raised_to_a_minimum_task_time() {
    let task = RACING_TASK;
    let finisher = FINISHER.replace(
        "15:00:00,3:00:00,100,300,1000,",
        "14:30:00,2:30:00,120,300,800,",
    );
    let fixture_file = FIXTURE_FILE
        .replace("vo = 100.00", "vo = 120.00")
        .replace("maximum_points = 1000", "maximum_points = 800");
    let fixture = Fixture::parse(task, &results(&[&finisher]), &fixture_file).unwrap();

    let report = check(&fixture).unwrap();

    assert!(report.passes(), "{report}");
}

#[test]
fn course_shape_task_without_a_task_duration_is_a_racing_task() {
    let finisher = FINISHER.replace(
        "15:00:00,3:00:00,100,300,1000,",
        "14:30:00,2:30:00,120,300,800,",
    );
    let fixture_file = FIXTURE_FILE
        .replace("vo = 100.00", "vo = 120.00")
        .replace("maximum_points = 1000", "maximum_points = 800");
    for task_type in ["broken_leg", "fai_triangle", "unknown_triangle"] {
        let task = format!(r#"{{"task_type": "{task_type}", "task_duration": 0}}"#);
        let fixture = Fixture::parse(&task, &results(&[&finisher]), &fixture_file).unwrap();
        let report = check(&fixture).unwrap();
        assert!(report.passes(), "{task_type}: {report}");
    }
}

#[test]
fn course_shape_task_duration_is_a_minimum_task_time() {
    let task = r#"{"task_type": "broken_leg", "task_duration": 10800}"#;
    let finisher = FINISHER.replace("15:00:00,3:00:00,", "14:30:00,2:30:00,");
    let fixture = Fixture::parse(task, &results(&[&finisher]), FIXTURE_FILE).unwrap();
    let report = check(&fixture).unwrap();
    assert!(report.passes(), "{report}");
}

#[test]
fn unknown_task_type_is_an_error() {
    let task = r#"{"task_type": "unknown"}"#;
    let error = Fixture::parse(task, &results(&[FINISHER]), FIXTURE_FILE).unwrap_err();
    assert_snapshot!(format!("{error:#}"), @"parsing task.json: unknown variant `unknown`, expected one of `assigned_area`, `polygon`, `broken_leg`, `fai_triangle`, `unknown_triangle` at line 1 column 23");
}

#[test]
fn assigned_area_task_without_a_minimum_task_time_is_an_error() {
    let task = r#"{"task_type": "assigned_area"}"#;

    let error = Fixture::parse(task, &results(&[FINISHER]), FIXTURE_FILE).unwrap_err();

    assert_eq!(
        format!("{error:#}"),
        "parsing task.json: missing field `task_duration`"
    );
}

#[test]
fn assigned_area_start_bearing_more_than_a_thousandth_of_a_degree_off_fails() {
    // 90.002°
    let task = TASK.replacen("1.5707963267949", "1.5708312333799", 1);

    let report = check_task(&task, &[FINISHER], FIXTURE_FILE);

    assert_snapshot!(report, @"
    bearing: published start 90.002°, Keyhole start 90.000°
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
}

#[test]
fn assigned_area_task_with_a_misplaced_finish_is_an_error() {
    let task = TASK.replacen(r#""type": "point""#, r#""type": "finish""#, 1);
    let fixture = Fixture::parse(&task, &results(&[FINISHER]), FIXTURE_FILE).unwrap();

    let error = check(&fixture).unwrap_err();

    assert_snapshot!(format!("{error:#}"), @"task point 1 of the assigned area task is a finish instead of an assigned area");
}

#[test]
fn wrong_published_rank_fails() {
    let finisher = FINISHER.replacen("1,", "2,", 1);

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(!report.passes());
    assert_snapshot!(report, @"
    A rank: published 2, Keyhole 1
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
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
    assert_snapshot!(report, @"
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
      G: finished 300 km in 03:00:00 (from the download), hors concours (from the download)
    ");
}

#[test]
fn fixture_file_decides_on_hors_concours() {
    let fixture_file = format!("{FIXTURE_FILE}\n[decisions.G]\nhors_concours = false\n")
        .replace("n = 1\nn1 = 1\nn2 = 1", "n = 2\nn1 = 2\nn2 = 2");

    let report = check_day(&[FINISHER, GUEST], &fixture_file);

    assert_snapshot!(report, @"
    G rank: published HC, Keyhole 1
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
      G: finished 300 km in 03:00:00 (from the download), not hors concours (from the fixture file)
    ");
}

fn remark_decision(points: &str, penalty_points: &str, remark: &str) -> String {
    let finisher = FINISHER.replace(
        ",1000,0,,",
        &format!(",{points},0,{penalty_points},\"{remark}\""),
    );
    let report = check_day(&[&finisher], FIXTURE_FILE);
    assert!(report.passes(), "{report}");
    let (_, decisions) = &report.decisions[0];
    let (_, remark) = decisions.split_once("(from the download), ").unwrap();
    remark.into()
}

#[test]
fn bare_penalty_points_leave_no_public_remark() {
    assert_eq!(
        remark_decision("988", "12", "12 penalty points"),
        "penalty 12 (from the download)"
    );
}

#[test]
fn penalty_points_with_a_thousands_separator_are_stripped_from_the_public_remark() {
    assert_eq!(
        remark_decision("0", "1000", "Gefährliches Verhalten (1,000 penalty points)"),
        "penalty 1000 (from the download), public remark \"Gefährliches Verhalten\" (from the download)"
    );
}

#[test]
fn official_warning_group_remarks_become_official_warnings() {
    for remark in [
        "Verwarnung: Überfliegen abgestellter Flugzeuge",
        "First offence, warning",
        "1st offence",
        "W - Start",
    ] {
        assert_eq!(
            remark_decision("1000", "", remark),
            format!("official warning \"{remark}\" (from the download)")
        );
    }
}

#[test]
fn warning_remarks_with_a_penalty_become_the_public_remark() {
    assert_eq!(
        remark_decision("975", "25", "2nd warning (25 penalty points)"),
        "penalty 25 (from the download), public remark \"2nd warning\" (from the download)"
    );
}

#[test]
fn earlier_remark_groups_take_precedence_over_official_warnings() {
    for remark in ["Disqualified after a warning", "Withdrawn after warning"] {
        assert_eq!(
            remark_decision("1000", "", remark),
            format!("remark \"{remark}\" (not applied)")
        );
    }
}

#[test]
fn remarks_of_known_effect_are_reported_but_not_applied() {
    for remark in [
        "Loggerintervall",
        "Virtuelle Außenlandung",
        "Secondary FR used",
        "Start 13:05",
        "Zielhöhe unterschritten",
        "L/O",
    ] {
        assert_eq!(
            remark_decision("1000", "", remark),
            format!("remark \"{remark}\" (not applied)")
        );
    }
}

#[test]
fn other_remarks_are_reported_as_of_unknown_effect() {
    for remark in [
        "Airspace infringement",
        "Turnpoint 3 not rounded OK",
        "SC3A 1.4.5.3",
        "Start altitude",
    ] {
        assert_eq!(
            remark_decision("1000", "", remark),
            format!("remark \"{remark}\" (unknown effect)")
        );
    }
}

/// Marks the class as handicapped with the day parameters of [`FINISHER`]
/// flying with a handicap of 1.25, whose 300 km divide to 240 km.
fn handicapped_fixture_file() -> String {
    format!("handicapped = true\n{FIXTURE_FILE}")
        .replace("do = 300.00", "do = 240.00")
        .replace("vo = 100.00", "vo = 80.00")
        .replace("maximum_points = 1000", "maximum_points = 750")
}

fn finisher_with_handicap(handicap: &str) -> String {
    FINISHER
        .replace(",Arcus,,", &format!(",Arcus,{handicap},"))
        .replace(",1000,0,", ",750,0,")
}

#[test]
fn handicap_column_divides_by_handicaps_on_the_100_scale() {
    let report = check_day(
        &[&finisher_with_handicap("125")],
        &handicapped_fixture_file(),
    );

    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    Decisions:
      A: finished 300 km in 03:00:00 (from the download), handicap 125 (from the download)
    ");
}

#[test]
fn handicap_column_divides_by_handicaps_on_the_1_000_scale() {
    let report = check_day(
        &[&finisher_with_handicap("1.25")],
        &handicapped_fixture_file(),
    );

    assert!(report.passes(), "{report}");
}

#[test]
fn handicap_column_divides_by_handicaps_on_the_1000_scale() {
    let report = check_day(
        &[&finisher_with_handicap("1250")],
        &handicapped_fixture_file(),
    );

    assert!(report.passes(), "{report}");
}

#[test]
fn class_without_handicaps_ignores_the_handicap_column() {
    let finisher = FINISHER.replace(",Arcus,,", ",Arcus,125,");

    let report = check_day(&[&finisher], FIXTURE_FILE);

    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    Decisions:
      A: finished 300 km in 03:00:00 (from the download)
    ");
}

#[test]
fn fixture_file_decides_on_the_handicap() {
    let fixture_file = format!(
        "{}\n[decisions.A]\nhandicap = 125\n",
        handicapped_fixture_file()
    );

    let report = check_day(&[&finisher_with_handicap("100")], &fixture_file);

    assert!(report.passes(), "{report}");
    assert_snapshot!(report, @"
    Decisions:
      A: finished 300 km in 03:00:00 (from the download), handicap 125 (from the fixture file)
    ");
}

#[test]
fn missing_handicaps_in_a_handicapped_class_are_an_error() {
    let other = finisher_with_handicap("125").replace(",A,Crew A,", ",B,Crew B,");
    let fixture = Fixture::parse(
        TASK,
        &results(&[FINISHER, &other, GUEST]),
        &handicapped_fixture_file(),
    )
    .unwrap();

    let error = check(&fixture).unwrap_err();

    assert_eq!(error.to_string(), "no handicap for A, G");
}

#[test]
fn racing_task_matching_its_published_distance_and_bearings_passes() {
    let report = check_racing_task(RACING_TASK);
    assert!(report.passes(), "{report}");
}

#[test]
fn racing_task_distance_more_than_1_m_off_fails() {
    let task = RACING_TASK.replace(
        r#""task_distance": 111319.49"#,
        r#""task_distance": 111321"#,
    );
    let report = check_racing_task(&task);
    assert_snapshot!(report, @"
    task distance: published 111.3210 km, Keyhole 111.3195 km
    Decisions:
      A: finished 111.32 km in 01:00:00 (from the download)
    ");
}

#[test]
fn racing_task_distance_within_1_m_passes() {
    let task = RACING_TASK.replace(
        r#""task_distance": 111319.49"#,
        r#""task_distance": 111320.4"#,
    );
    let report = check_racing_task(&task);
    assert!(report.passes(), "{report}");
}

#[test]
fn start_bearing_more_than_a_thousandth_of_a_degree_off_fails() {
    // 90.002°
    let task = RACING_TASK.replace("1.5707963267949", "1.5708312333799");
    let report = check_racing_task(&task);
    assert_snapshot!(report, @"
    bearing: published start 90.002°, Keyhole start 90.000°
    Decisions:
      A: finished 111.32 km in 01:00:00 (from the download)
    ");
}

#[test]
fn finish_bearing_beyond_the_bearing_tolerance_fails() {
    // A 45° sector instead of a cylinder, pointing at 272°.
    let sector =
        r#""oz_angle1": 0.785398163397448, "oz_angle2": 0, "oz_angle12": 4.74729556542455"#;
    let cylinder =
        r#""oz_angle1": 3.14159265358979, "oz_angle2": 0, "oz_angle12": 4.71238898038469"#;
    let task = RACING_TASK.replace(cylinder, sector);
    let report = check_racing_task(&task);
    assert_snapshot!(report, @"
    bearing: published finish 272.000°, Keyhole finish 270.000°
    Decisions:
      A: finished 111.32 km in 01:00:00 (from the download)
    ");
}

#[test]
fn bearing_of_a_cylinder_is_not_compared() {
    // 90°, the opposite of where the finish cylinder points.
    let task = RACING_TASK.replace("4.71238898038469", "1.5707963267949");
    let report = check_racing_task(&task);
    assert!(report.passes(), "{report}");
}

#[test]
fn bearing_of_a_cylinder_with_a_sector_cut_out_is_compared() {
    // An R2 of 1 km whose sector of 45° stays in the zone, pointing at 272°.
    let notched = r#""oz_radius2": 1000, "oz_angle1": 3.14159265358979, "oz_angle2": 0.785398163397448, "oz_angle12": 4.74729556542455"#;
    let cylinder = r#""oz_radius2": 0, "oz_angle1": 3.14159265358979, "oz_angle2": 0, "oz_angle12": 4.71238898038469"#;
    let task = RACING_TASK.replace(cylinder, notched);
    let report = check_racing_task(&task);
    assert_snapshot!(report, @"
    bearing: published finish 272.000°, Keyhole finish 270.000°
    Decisions:
      A: finished 111.32 km in 01:00:00 (from the download)
    ");
}

#[test]
fn fixed_bearing_just_below_360_degrees_resolves_to_0_degrees() {
    let next = r#""oz_type": "next", "oz_radius1": 10000, "oz_radius2": 0, "oz_angle1": 0.785398163397448, "oz_angle2": 0, "oz_angle12": 1.5707963267949"#;
    let fixed = r#""oz_type": "fixed", "oz_radius1": 10000, "oz_radius2": 0, "oz_angle1": 0.785398163397448, "oz_angle2": 0, "oz_angle12": 6.28318530717958"#;
    let task = RACING_TASK.replace(next, fixed);
    let report = check_racing_task(&task);
    assert!(report.passes(), "{report}");
}

#[test]
fn symmetric_finish_resolves_like_previous() {
    let task = RACING_TASK.replace(r#""oz_type": "previous""#, r#""oz_type": "symmetric""#);
    let report = check_racing_task(&task);
    assert!(report.passes(), "{report}");
}

#[test]
fn racing_task_without_a_finish_is_an_error() {
    let task = RACING_TASK.replace(r#""type": "finish""#, r#""type": "point""#);
    let fixture = Fixture::parse(&task, &results(&[FINISHER]), FIXTURE_FILE).unwrap();
    let error = check(&fixture).unwrap_err();
    assert_snapshot!(format!("{error:#}"), @"the racing task doesn't run from a start over turnpoints to a finish");
}
