use insta::{assert_compact_debug_snapshot, assert_snapshot};
use keyhole_oracle::infer_rule_set_family;

const SWO_LINE: &str =
    "Racing Task, Maximum Points: 887, F = 1,000, Fcr = 1,000, Max speed pts: 457
; Dm = 140km, D1 = 350km, handicapping enabled
; Use PEV disabled,  N: 22, n1: 22, n2: 17, Do: 324,11km, Vo: 117,88km/h
; DAeC-SWO2026 Script V9.09";

const ANNEX_A_LINE: &str =
    "Assigned Area Task, Maximum Points: 787, F = 0,382, Fcr = 1,000, Max speed pts: 146
; Dm = 140km, D1 = 350km, no handicaps
; PEVWaitTime: 10min, PEVStartWindow: 5min,  N: 36, n1: 11, n2: 10, Do: 290,41km, Vo: 88,50km/h
; cs6EAkmgeL7sylA9d53fmHIbA7RsW5GPCHXiL49l8+k";

const WARNING_LINE: &str = "Warning: Number of competition pilots launched is zero
; PEVStarts: OFF,
; yl+Fx8DWpuW79pJIpJ/w7UFNizPeE85eDJeIo/8KU2I";

#[test]
fn swo_script_names_the_swo() {
    let family = infer_rule_set_family("some-competition", SWO_LINE).unwrap();
    assert_compact_debug_snapshot!(family, @"Family(DaecSwo)");
}

#[test]
fn parameter_line_without_an_swo_script_is_annex_a() {
    let family = infer_rule_set_family("some-competition", ANNEX_A_LINE).unwrap();
    assert_compact_debug_snapshot!(family, @"Family(FaiAnnexA)");
}

#[test]
fn slug_table_wins_over_the_parameter_line() {
    let family = infer_rule_set_family("dm2023bayreuth", ANNEX_A_LINE).unwrap();
    assert_compact_debug_snapshot!(family, @"Family(DaecSwo)");
}

#[test]
fn slug_table_resolves_a_line_without_any_signal() {
    let family = infer_rule_set_family("jenacup-2026-jena-schongleina-2026", WARNING_LINE).unwrap();
    assert_compact_debug_snapshot!(family, @"Family(DaecSwo)");
}

#[test]
fn slug_table_leaves_out_competitions_under_national_rules() {
    let family = infer_rule_set_family("leeton-multiclass-nationals-2026", ANNEX_A_LINE).unwrap();
    assert_compact_debug_snapshot!(family, @r#"LeftOut("Australian national rules")"#);
}

#[test]
fn slug_table_leaves_out_dutch_national_competitions() {
    let family =
        infer_rule_set_family("nationale-junioren-wedstrijd-2026-venlo-2026", WARNING_LINE);
    assert_compact_debug_snapshot!(family.unwrap(), @r#"LeftOut("Dutch national rules")"#);
}

#[test]
fn slug_table_leaves_out_new_zealand_national_competitions() {
    let family = infer_rule_set_family(
        "nz-multiclass-national-championships-jan-2026-matamata-2026",
        ANNEX_A_LINE,
    );
    assert_compact_debug_snapshot!(family.unwrap(), @r#"LeftOut("New Zealand national rules")"#);
}

#[test]
fn line_without_any_signal_is_an_error() {
    let error = infer_rule_set_family("some-competition", WARNING_LINE).unwrap_err();
    assert_snapshot!(error, @"cannot infer the rule set family of some-competition from a slug table entry, an SWO script or an Annex A parameter line");
}
