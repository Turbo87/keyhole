use insta::assert_snapshot;
use jiff::SignedDuration;
use jiff::civil::{Time, time};
use jiff::tz::TimeZone;
use keyhole_engine::day_scoring::ScoringParameters;
use keyhole_engine::rule_sets::{
    Altitude, AnalysisParameters, DAEC_SWO_2026, EarthModel, FAI_ANNEX_A_2025A, RuleOverrides,
    RuleSetEdition,
};
use keyhole_handicaps::HandicapList;

fn berlin() -> TimeZone {
    TimeZone::get("Europe/Berlin").unwrap()
}

fn time_of_day(hour: i8) -> Time {
    time(hour, 0, 0, 0)
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
fn without_overrides_the_edition_defaults_apply() {
    for edition in [&DAEC_SWO_2026, &FAI_ANNEX_A_2025A] {
        let mut expected = edition.defaults.clone();
        expected.analysis.time_zone = berlin();
        assert_eq!(edition.resolve(berlin(), &[]), expected);
    }
}

#[test]
fn later_layers_win_over_earlier_layers_and_edition_defaults() {
    let class = RuleOverrides {
        earth_model: Some(EarthModel::FaiSphere),
        ..standard_class()
    };
    let resolve = |layers: &[_]| FAI_ANNEX_A_2025A.resolve(berlin(), layers);

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
        start_opening_time: Some(time_of_day(10)),
        start_closing_time: Some(time_of_day(12)),
        maximum_start_altitude: Some(1500.),
        maximum_start_ground_speed: Some(170.),
        pev_start: Some(true),
        pev_wait_time: Some(minutes(5)),
        pev_start_window: Some(minutes(8)),
        ..Default::default()
    };

    let analysis = FAI_ANNEX_A_2025A.resolve(berlin(), &[start]).analysis;

    let expected = AnalysisParameters {
        earth_model: EarthModel::Wgs84,
        start_opening_time: Some(time_of_day(10)),
        start_closing_time: Some(time_of_day(12)),
        maximum_start_altitude: Some(1500.),
        maximum_start_ground_speed: Some(170.),
        pev_start: true,
        pev_wait_time: minutes(5),
        pev_start_window: minutes(8),
        time_zone: berlin(),
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
        scoring_end_time: Some(time_of_day(18)),
        ..Default::default()
    };

    let analysis = DAEC_SWO_2026.resolve(berlin(), &[overrides]).analysis;

    let expected = AnalysisParameters {
        subtract_finish_ring_radius: false,
        delivery_period: Some(minutes(30)),
        tow_altitude: Some(600.),
        maximum_altitude: Some(Altitude::FlightLevel(95)),
        scoring_end_time: Some(time_of_day(18)),
        time_zone: berlin(),
        ..DAEC_SWO_2026.defaults.analysis.clone()
    };
    assert_eq!(analysis, expected);
}

#[test]
fn scoring_only_overrides_leave_the_analysis_parameters_equal() {
    let resolve = |layers: &[_]| DAEC_SWO_2026.resolve(berlin(), layers);
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

    let parameters = DAEC_SWO_2026.resolve(berlin(), &[fai_sphere]);

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
        start_opening_time: Some(time_of_day(10)),
        start_closing_time: Some(time_of_day(12)),
        maximum_start_altitude: Some(1500.),
        maximum_start_ground_speed: Some(170.),
        pev_start: Some(true),
        pev_wait_time: Some(minutes(5)),
        pev_start_window: Some(minutes(8)),
        subtract_finish_ring_radius: Some(false),
        delivery_period: Some(minutes(30)),
        tow_altitude: Some(600.),
        maximum_altitude: Some(Altitude::Msl(2999.9)),
        scoring_end_time: Some(time_of_day(18)),
    };
    let rules = DAEC_SWO_2026.resolve(berlin(), &[overrides]);

    assert_snapshot!(DAEC_SWO_2026.canonical_rules(&rules), @"
    edition=DAeC SWO 2026
    earth_model=fai_sphere
    time_zone=Europe/Berlin
    start_opening_time=10:00:00
    start_closing_time=12:00:00
    maximum_start_altitude=1500
    maximum_start_ground_speed=170
    pev_start=true
    pev_wait_time=PT5M
    pev_start_window=PT8M
    subtract_finish_ring_radius=false
    delivery_period=PT30M
    tow_altitude=600
    maximum_altitude=2999.9 m
    scoring_end_time=18:00:00
    dm=50
    d1=212.5
    ");
}

#[test]
fn the_rules_hash_of_both_editions_defaults_does_not_change() {
    let hash = |edition: &RuleSetEdition| {
        let rules = edition.resolve(berlin(), &[]);
        edition.rules_hash(&rules).to_string()
    };

    assert_snapshot!(hash(&DAEC_SWO_2026), @"31f4fd18c528ae8e5cd4ac7ce8d945f6322016e27f3c7ff5f17025f2afa5ab22");
    assert_snapshot!(hash(&FAI_ANNEX_A_2025A), @"d70cf11bca531791eb664e31328a3d063b084b2924e09c7c6f4a3d7216b809d9");
}

#[test]
fn changing_an_analysis_or_scoring_parameter_changes_the_rules_hash() {
    let hash = |overrides| {
        let rules = FAI_ANNEX_A_2025A.resolve(berlin(), &[overrides]);
        FAI_ANNEX_A_2025A.rules_hash(&rules)
    };
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
fn changing_the_time_zone_changes_the_rules_hash() {
    let hash = |time_zone| FAI_ANNEX_A_2025A.rules_hash(&FAI_ANNEX_A_2025A.resolve(time_zone, &[]));

    assert_ne!(hash(TimeZone::UTC), hash(berlin()));
}

#[test]
#[should_panic(expected = "the competition time zone must be an IANA time zone")]
fn a_time_zone_without_an_iana_name_is_rejected() {
    let fixed_offset = TimeZone::fixed(jiff::tz::offset(2));

    DAEC_SWO_2026.resolve(fixed_offset, &[]);
}

#[test]
fn layerings_with_the_same_effective_parameters_have_the_same_rules_hash() {
    let hash = |layers: &[_]| DAEC_SWO_2026.rules_hash(&DAEC_SWO_2026.resolve(berlin(), layers));
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
    let rules = DAEC_SWO_2026.resolve(berlin(), &[]);

    assert_ne!(
        DAEC_SWO_2026.rules_hash(&rules),
        FAI_ANNEX_A_2025A.rules_hash(&rules),
    );
}
