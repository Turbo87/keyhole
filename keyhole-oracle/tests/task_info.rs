use insta::{assert_compact_debug_snapshot, assert_snapshot};
use keyhole_oracle::TaskInfo;

#[test]
fn valid_day_states_every_day_parameter() {
    let line = "Assigned Area Task, Maximum Points: 819, F = 1.000, Fcr = 0.724, Max speed pts: 493
; Dm = 120km, D1 = 300km, handicapping enabled
; Use PEV disabled,  N: 31, n1: 31, n2: 28, Do: 286.65km, Vo: 104.44km/h
; DAeC-SWO2024 Script V9.06";
    assert_compact_debug_snapshot!(TaskInfo::parse(line).unwrap(), @"TaskInfo { dm: Some(120.0), d1: Some(300.0), handicapped: true, day_parameters: Some(PublishedDayParameters { valid: true, d1: 300.0, n: 31, n1: 31, n2: 28, d0: 286.65, v0: 104.44, f: Some(1.0), fcr: Some(0.724), maximum_points: Some(819.0) }) }");
}

#[test]
fn decimal_commas_are_decimal_points() {
    let line = "Assigned Area Task, Maximum Points: 705, F = 0,750, Fcr = 0,600, Max speed pts: 0
; Dm = 100km, D1 = 250km, no handicaps
; PEVWaitTime: 10min, PEVStartWindow: 5min,  N: 5, n1: 3, n2: 0, Do: 191,01km, Vo: 0,00km/h";
    assert_compact_debug_snapshot!(TaskInfo::parse(line).unwrap(), @"TaskInfo { dm: Some(100.0), d1: Some(250.0), handicapped: false, day_parameters: Some(PublishedDayParameters { valid: true, d1: 250.0, n: 5, n1: 3, n2: 0, d0: 191.01, v0: 0.0, f: Some(0.75), fcr: Some(0.6), maximum_points: Some(705.0) }) }");
}

#[test]
fn invalid_day_leaves_out_f_fcr_and_the_maximum_points() {
    let line = "!! n1/N &lt;= 25% -&gt; Day not valid and has to be canceled !!
; Dm = 140km, D1 = 350km, no handicaps
; Use PEV disabled,  N: 4, n1: 0, n2: 0, Do: 21,02km, Vo: 0,00km/h";
    let day_parameters = TaskInfo::parse(line).unwrap().day_parameters;
    assert_compact_debug_snapshot!(day_parameters, @"Some(PublishedDayParameters { valid: false, d1: 350.0, n: 4, n1: 0, n2: 0, d0: 21.02, v0: 0.0, f: None, fcr: None, maximum_points: None })");
}

#[test]
fn rule_reference_marks_an_invalid_day() {
    let line = "Day not valid - rule 8.2.1b
; Dm = 140km, D1 = 350km, no handicaps
; PEVStarts: OFF,  N: 4, n1: 1, n2: 0, Do: 272.86km, Vo: 0.00km/h";
    assert!(!TaskInfo::parse(line).unwrap().day_parameters.unwrap().valid);
}

#[test]
fn warning_line_states_no_day_parameters() {
    let line = "Warning: Number of competition pilots launched is zero
; PEVStarts: OFF,";
    assert_compact_debug_snapshot!(TaskInfo::parse(line).unwrap(), @"TaskInfo { dm: None, d1: None, handicapped: false, day_parameters: None }");
}

#[test]
fn empty_line_states_nothing() {
    assert_compact_debug_snapshot!(TaskInfo::parse("").unwrap(), @"TaskInfo { dm: None, d1: None, handicapped: false, day_parameters: None }");
}

#[test]
fn line_with_part_of_the_day_parameters_is_an_error() {
    let line = "Racing Task, Maximum Points: 1000, F = 1.000, Fcr = 1.000
; Dm = 120km, D1 = 300km, no handicaps";
    let error = TaskInfo::parse(line).unwrap_err();
    assert_snapshot!(error, @"the task info line states only part of D1, N, n1, n2, Do and Vo");
}
