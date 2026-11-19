use insta::assert_snapshot;
use jiff::{SignedDuration, Timestamp};
use keyhole_engine::day_scoring::ScoringParameters;
use keyhole_engine::flight_analysis::analysis_log::AnalysisLogKind;
use keyhole_engine::rule_sets::{
    Altitude, AnalysisParameters, DAEC_SWO_2026, EarthModel, FAI_ANNEX_A_2025A, RuleOverrides,
    RuleSetEdition,
};
use keyhole_handicaps::HandicapList;

fn utc(second: i64) -> Timestamp {
    Timestamp::from_second(second).unwrap()
}

fn minutes(minutes: i64) -> SignedDuration {
    SignedDuration::from_mins(minutes)
}

fn standard_class() -> RuleOverrides {
    RuleOverrides {
        dm: Some(120.),
        d1: Some(300.),
        ..Default::default()
    }
}

#[test]
fn both_editions_are_found_by_their_ids() {
    for id in ["DAeC SWO 2026", "FAI Annex A 2025a"] {
        assert_eq!(RuleSetEdition::find(id).map(|edition| edition.id), Some(id));
    }
    assert_eq!(RuleSetEdition::find("DAeC SWO 2025"), None);
}

#[test]
fn analysis_log_kinds_cite_the_clauses_of_the_edition() {
    let kind = AnalysisLogKind::FileFailedToParse;
    assert_eq!(DAEC_SWO_2026.clause(kind), Some("5.9.8"));
    assert_eq!(FAI_ANNEX_A_2025A.clause(kind), None);

    let kind = AnalysisLogKind::RecordingIntervalExceeded;
    assert_eq!(DAEC_SWO_2026.clause(kind), Some("5.9.3"));
    assert_eq!(FAI_ANNEX_A_2025A.clause(kind), Some("5.3c"));
}

#[test]
fn without_overrides_the_edition_defaults_apply() {
    for edition in [&DAEC_SWO_2026, &FAI_ANNEX_A_2025A] {
        assert_eq!(edition.resolve(&[]), edition.defaults);
    }
}

#[test]
fn later_layers_win_over_earlier_layers_and_edition_defaults() {
    let class = RuleOverrides {
        earth_model: Some(EarthModel::FaiSphere),
        ..standard_class()
    };
    let resolve = |layers: &[_]| FAI_ANNEX_A_2025A.resolve(layers);

    let from_class = resolve(&[class.clone(), RuleOverrides::default()]);
    assert_eq!(from_class.analysis.earth_model, EarthModel::FaiSphere);
    assert_eq!(from_class.scoring, ScoringParameters { dm: 120., d1: 300. });

    let class_day = RuleOverrides {
        earth_model: Some(EarthModel::Wgs84),
        dm: Some(50.),
        d1: Some(250.),
        ..Default::default()
    };
    let from_class_day = resolve(&[class, class_day]);
    assert_eq!(from_class_day.analysis.earth_model, EarthModel::Wgs84);
    assert_eq!(
        from_class_day.scoring,
        ScoringParameters { dm: 50., d1: 250. }
    );
}

#[test]
fn start_procedure_overrides_apply() {
    let start = RuleOverrides {
        start_opening_time: Some(utc(1_659_348_000)),
        start_closing_time: Some(utc(1_659_355_200)),
        maximum_start_altitude: Some(1500.),
        maximum_start_ground_speed: Some(170.),
        pev_start: Some(true),
        pev_wait_time: Some(minutes(5)),
        pev_start_window: Some(minutes(8)),
        ..Default::default()
    };

    let analysis = FAI_ANNEX_A_2025A.resolve(&[start]).analysis;

    let expected = AnalysisParameters {
        earth_model: EarthModel::Wgs84,
        start_opening_time: Some(utc(1_659_348_000)),
        start_closing_time: Some(utc(1_659_355_200)),
        maximum_start_altitude: Some(1500.),
        maximum_start_ground_speed: Some(170.),
        pev_start: true,
        pev_wait_time: minutes(5),
        pev_start_window: minutes(8),
        ..FAI_ANNEX_A_2025A.defaults.analysis.clone()
    };
    assert_eq!(analysis, expected);
}

#[test]
fn finish_altitude_and_scoring_end_overrides_apply() {
    let overrides = RuleOverrides {
        subtract_finish_ring_radius: Some(false),
        delivery_period: Some(minutes(30)),
        tow_altitude: Some(600.),
        maximum_altitude: Some(Altitude::FlightLevel(95)),
        scoring_end_time: Some(utc(1_659_376_800)),
        ..Default::default()
    };

    let analysis = DAEC_SWO_2026.resolve(&[overrides]).analysis;

    let expected = AnalysisParameters {
        subtract_finish_ring_radius: false,
        delivery_period: Some(minutes(30)),
        tow_altitude: Some(600.),
        maximum_altitude: Some(Altitude::FlightLevel(95)),
        scoring_end_time: Some(utc(1_659_376_800)),
        ..DAEC_SWO_2026.defaults.analysis.clone()
    };
    assert_eq!(analysis, expected);
}

#[test]
fn scoring_only_overrides_leave_the_analysis_parameters_equal() {
    let resolve = |layers: &[_]| DAEC_SWO_2026.resolve(layers);
    let lower_dm = RuleOverrides {
        dm: Some(50.),
        ..Default::default()
    };

    let defaults = resolve(&[standard_class()]);
    let with_lower_dm = resolve(&[standard_class(), lower_dm]);

    assert_eq!(defaults.analysis, with_lower_dm.analysis);
    assert_ne!(defaults.scoring, with_lower_dm.scoring);
}

#[test]
fn earth_models_the_edition_does_not_allow_still_apply() {
    let fai_sphere = RuleOverrides {
        earth_model: Some(EarthModel::FaiSphere),
        ..Default::default()
    };

    let parameters = DAEC_SWO_2026.resolve(&[fai_sphere]);

    assert!(!DAEC_SWO_2026.earth_models.contains(&EarthModel::FaiSphere));
    assert_eq!(parameters.analysis.earth_model, EarthModel::FaiSphere);
}

#[test]
fn dm_and_d1_default_to_the_lowest_class_template() {
    for edition in [&DAEC_SWO_2026, &FAI_ANNEX_A_2025A] {
        let lowest = edition
            .class_templates
            .iter()
            .min_by(|a, b| a.dm.total_cmp(&b.dm));
        let lowest = lowest.map(|template| (template.dm, template.d1));

        let scoring = &edition.defaults.scoring;
        assert_eq!(lowest, Some((scoring.dm, scoring.d1)), "{}", edition.id);
    }
}

#[test]
fn every_class_template_handicap_list_exists() {
    for edition in [&DAEC_SWO_2026, &FAI_ANNEX_A_2025A] {
        for template in edition.class_templates {
            if let Some(id) = template.handicap_list {
                assert!(HandicapList::find(id).is_some(), "{}: {id}", edition.id);
            }
        }
    }
}

#[test]
fn canonical_rules_list_the_edition_and_every_parameter() {
    let overrides = RuleOverrides {
        earth_model: Some(EarthModel::FaiSphere),
        dm: Some(50.),
        d1: Some(212.5),
        start_opening_time: Some(utc(1_659_348_000)),
        start_closing_time: Some(utc(1_659_355_200)),
        maximum_start_altitude: Some(1500.),
        maximum_start_ground_speed: Some(170.),
        pev_start: Some(true),
        pev_wait_time: Some(minutes(5)),
        pev_start_window: Some(minutes(8)),
        subtract_finish_ring_radius: Some(false),
        delivery_period: Some(minutes(30)),
        tow_altitude: Some(600.),
        maximum_altitude: Some(Altitude::Msl(2999.9)),
        scoring_end_time: Some(utc(1_659_376_800)),
    };
    let rules = DAEC_SWO_2026.resolve(&[overrides]);

    assert_snapshot!(DAEC_SWO_2026.canonical_rules(&rules), @"
    edition=DAeC SWO 2026
    earth_model=fai_sphere
    start_opening_time=1659348000
    start_closing_time=1659355200
    maximum_start_altitude=1500
    maximum_start_ground_speed=170
    pev_start=true
    pev_wait_time=5
    pev_start_window=8
    subtract_finish_ring_radius=false
    delivery_period=30
    tow_altitude=600
    maximum_altitude=2999.9 m
    scoring_end_time=1659376800
    dm=50
    d1=212.5
    ");
}

#[test]
fn the_rules_hash_of_both_editions_defaults_does_not_change() {
    let hash = |edition: &RuleSetEdition| edition.rules_hash(&edition.resolve(&[])).to_string();

    assert_snapshot!(hash(&DAEC_SWO_2026), @"eecc5f8e26d6cf10333e0e2aa27a631f531ad64dd2ab10a0ae485121e7b31ff5");
    assert_snapshot!(hash(&FAI_ANNEX_A_2025A), @"b9278d8d3a93dd7d64c63e8b44aa9e36b8b9ca9d60af04a12cc5da23fa454290");
}

#[test]
fn changing_an_analysis_or_scoring_parameter_changes_the_rules_hash() {
    let hash = |overrides| FAI_ANNEX_A_2025A.rules_hash(&FAI_ANNEX_A_2025A.resolve(&[overrides]));
    let defaults = hash(RuleOverrides::default());

    let fai_sphere = RuleOverrides {
        earth_model: Some(EarthModel::FaiSphere),
        ..Default::default()
    };
    assert_ne!(hash(fai_sphere), defaults);

    let lower_dm = RuleOverrides {
        dm: Some(50.),
        ..Default::default()
    };
    assert_ne!(hash(lower_dm), defaults);
}

#[test]
fn layerings_with_the_same_effective_parameters_have_the_same_rules_hash() {
    let hash = |layers: &[_]| DAEC_SWO_2026.rules_hash(&DAEC_SWO_2026.resolve(layers));
    let lower_dm = RuleOverrides {
        dm: Some(50.),
        ..Default::default()
    };
    let class_with_lower_dm = RuleOverrides {
        dm: Some(50.),
        ..standard_class()
    };

    assert_eq!(
        hash(&[standard_class(), lower_dm]),
        hash(&[class_with_lower_dm, RuleOverrides::default()]),
    );
}

#[test]
fn the_same_parameters_under_another_edition_have_another_rules_hash() {
    let rules = DAEC_SWO_2026.resolve(&[]);

    assert_ne!(
        DAEC_SWO_2026.rules_hash(&rules),
        FAI_ANNEX_A_2025A.rules_hash(&rules),
    );
}
