use keyhole_engine::day_scoring::ScoringParameters;
use keyhole_engine::rule_sets::{
    Altitude, AnalysisParameters, DAEC_SWO_2026, EarthModel, FAI_ANNEX_A_2025A, RuleOverrides,
    RuleSetEdition, UtcTime,
};

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
        start_opening_time: Some(UtcTime(1_659_348_000)),
        start_closing_time: Some(UtcTime(1_659_355_200)),
        maximum_start_altitude: Some(1500.),
        maximum_start_ground_speed: Some(170.),
        pev_start: Some(true),
        pev_wait_time: Some(5),
        pev_start_window: Some(8),
        ..Default::default()
    };

    let analysis = FAI_ANNEX_A_2025A.resolve(&[start]).analysis;

    let expected = AnalysisParameters {
        earth_model: EarthModel::Wgs84,
        start_opening_time: Some(UtcTime(1_659_348_000)),
        start_closing_time: Some(UtcTime(1_659_355_200)),
        maximum_start_altitude: Some(1500.),
        maximum_start_ground_speed: Some(170.),
        pev_start: true,
        pev_wait_time: 5,
        pev_start_window: 8,
        ..FAI_ANNEX_A_2025A.defaults.analysis.clone()
    };
    assert_eq!(analysis, expected);
}

#[test]
fn finish_altitude_and_scoring_end_overrides_apply() {
    let overrides = RuleOverrides {
        subtract_finish_ring_radius: Some(false),
        delivery_period: Some(30),
        tow_altitude: Some(600.),
        maximum_altitude: Some(Altitude::FlightLevel(95)),
        scoring_end_time: Some(UtcTime(1_659_376_800)),
        ..Default::default()
    };

    let analysis = DAEC_SWO_2026.resolve(&[overrides]).analysis;

    let expected = AnalysisParameters {
        subtract_finish_ring_radius: false,
        delivery_period: Some(30),
        tow_altitude: Some(600.),
        maximum_altitude: Some(Altitude::FlightLevel(95)),
        scoring_end_time: Some(UtcTime(1_659_376_800)),
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
