use std::time::Duration;

use keyhole_engine::rule_sets::{
    AnalysisParameters, Class, ClassDayOverrides, ClassTemplate, DAEC_SWO_2026, DefaultZones,
    Departure, EarthModel, EffectiveParameters, FAI_ANNEX_A_2025A, HandicapScale, InvalidValue,
    MaximumAltitude, MissingPevPenalty, ObservationZone, Orientation, Parameter, PevRules,
    PevScope, Resolution, RuleOverride, RuleSetEdition, ScoringParameters, StartProcedure,
};

#[test]
fn editions_are_found_by_id() {
    for id in ["DAeC SWO 2026", "FAI Annex A 2025a"] {
        assert_eq!(RuleSetEdition::find(id).map(|edition| edition.id), Some(id));
    }
    assert!(RuleSetEdition::find("DAeC SWO 2024").is_none());
}

fn templates(edition: &RuleSetEdition) -> Vec<(&str, f64, f64, bool, Option<&str>)> {
    edition
        .class_templates
        .iter()
        .map(|t| (t.name, t.dm, t.d1, t.handicapped, t.handicap_list))
        .collect()
}

#[test]
fn swo_class_templates() {
    assert_eq!(
        templates(&DAEC_SWO_2026),
        [
            ("Club", 100., 250., true, Some("igc-club-2026")),
            ("Standard", 120., 300., false, Some("daec-standard-2026")),
            ("15 m", 120., 300., false, Some("daec-15m-2026")),
            ("18 m", 140., 350., false, Some("daec-18m-2026")),
            ("Open", 140., 350., false, Some("daec-open-2026")),
            ("Two-seater", 120., 300., true, Some("igc-20m-2026")),
        ]
    );
}

#[test]
fn annex_a_class_templates() {
    assert_eq!(
        templates(&FAI_ANNEX_A_2025A),
        [
            ("Club", 100., 250., true, Some("igc-club-2026")),
            ("Standard", 120., 300., false, None),
            ("13.5 m", 100., 250., false, None),
            ("15 m", 120., 300., false, None),
            ("18 m", 140., 350., false, None),
            ("Open", 140., 350., false, None),
            ("20 m multi-seat", 120., 300., false, Some("igc-20m-2026")),
        ]
    );
}

#[test]
fn swo_constants() {
    let constants = &DAEC_SWO_2026.constants;
    assert!(!constants.podium_countback);
    assert_eq!(constants.complaint_period, hours(14));
    assert_eq!(constants.final_day_complaint_period, hours(14));
    assert_eq!(
        constants.pev,
        PevRules {
            limit: 3,
            clustering: Duration::from_secs(30),
            scope: PevScope::PerDay,
            missing_pev_penalty: MissingPevPenalty::AsOutsideWindow,
            outside_window_penalty_per_second: 1,
            maximum_penalty: 60,
        }
    );
}

#[test]
fn annex_a_constants() {
    let constants = &FAI_ANNEX_A_2025A.constants;
    assert!(constants.podium_countback);
    assert_eq!(constants.complaint_period, hours(14));
    assert_eq!(constants.final_day_complaint_period, hours(2));
    assert_eq!(
        constants.pev,
        PevRules {
            limit: 3,
            clustering: Duration::from_secs(30),
            scope: PevScope::PerLaunch,
            missing_pev_penalty: MissingPevPenalty::Fixed(60),
            outside_window_penalty_per_second: 1,
            maximum_penalty: 60,
        }
    );
}

fn hours(hours: u64) -> Duration {
    Duration::from_secs(hours * 3600)
}

fn cylinder(radius: f64) -> ObservationZone {
    ObservationZone {
        r1: radius,
        a1: 180.,
        r2: 0.,
        a2: 0.,
        orientation: Orientation::Symmetric,
    }
}

#[test]
fn swo_defaults() {
    let edition = &DAEC_SWO_2026;
    assert_eq!(
        edition.defaults,
        AnalysisParameters {
            earth_model: EarthModel::Wgs84,
            finish_ring_subtracted: true,
            delivery_period: Some(Duration::from_secs(45 * 60)),
            start: StartProcedure {
                opening_time: None,
                closing_time: None,
                maximum_altitude: None,
                maximum_ground_speed: None,
                pev_start: false,
                pev_wait_time: 10,
                pev_start_window: 7,
            },
            tow_altitude: None,
            maximum_altitude: None,
            scoring_end_time: None,
        }
    );
    assert_eq!(
        edition.default_zones,
        DefaultZones {
            start_line_length: Some(20.),
            turnpoint: ObservationZone {
                r1: 10.,
                a1: 45.,
                r2: 0.5,
                a2: 180.,
                orientation: Orientation::Symmetric,
            },
            assigned_area: cylinder(20.),
            finish: cylinder(5.),
        }
    );
    assert_eq!(edition.allowed.earth_models, [EarthModel::Wgs84]);
    assert_eq!(edition.allowed.pev_wait_time, 10..=10);
    assert_eq!(edition.allowed.pev_start_window, 7..=7);
}

#[test]
fn annex_a_defaults() {
    let edition = &FAI_ANNEX_A_2025A;
    assert_eq!(
        edition.defaults,
        AnalysisParameters {
            earth_model: EarthModel::Wgs84,
            finish_ring_subtracted: true,
            delivery_period: None,
            start: StartProcedure {
                opening_time: None,
                closing_time: None,
                maximum_altitude: None,
                maximum_ground_speed: None,
                pev_start: false,
                pev_wait_time: 10,
                pev_start_window: 10,
            },
            tow_altitude: None,
            maximum_altitude: None,
            scoring_end_time: None,
        }
    );
    assert_eq!(
        edition.default_zones,
        DefaultZones {
            start_line_length: None,
            turnpoint: cylinder(0.5),
            assigned_area: cylinder(20.),
            finish: cylinder(3.),
        }
    );
    assert_eq!(
        edition.allowed.earth_models,
        [EarthModel::Wgs84, EarthModel::FaiSphere]
    );
    assert_eq!(edition.allowed.pev_wait_time, 5..=10);
    assert_eq!(edition.allowed.pev_start_window, 5..=10);
}

fn club_class(overrides: Vec<RuleOverride>) -> Class {
    Class {
        dm: 100.,
        d1: 250.,
        handicapped: true,
        handicap_scale: HandicapScale::One,
        overrides,
    }
}

fn resolve(class: &Class, class_day: &ClassDayOverrides) -> EffectiveParameters {
    FAI_ANNEX_A_2025A
        .resolve(class, class_day)
        .unwrap()
        .parameters
}

fn resolve_class_day(class_day: ClassDayOverrides) -> Result<Resolution, InvalidValue> {
    FAI_ANNEX_A_2025A.resolve(&club_class(vec![]), &class_day)
}

fn resolve_rules(rules: Vec<RuleOverride>) -> Result<Resolution, InvalidValue> {
    resolve_class_day(ClassDayOverrides {
        rules,
        ..ClassDayOverrides::default()
    })
}

#[test]
fn without_overrides_the_edition_defaults_apply() {
    let parameters = resolve(&club_class(vec![]), &ClassDayOverrides::default());

    assert_eq!(parameters.analysis, FAI_ANNEX_A_2025A.defaults);
    assert_eq!(parameters.default_zones, FAI_ANNEX_A_2025A.default_zones);
    assert_eq!(
        parameters.scoring,
        ScoringParameters {
            dm: 100.,
            d1: 250.,
            handicap_scale: Some(HandicapScale::One),
        }
    );
}

#[test]
fn unhandicapped_class_scores_without_a_handicap_scale() {
    let class = Class {
        handicapped: false,
        handicap_scale: HandicapScale::Hundred,
        ..club_class(vec![])
    };

    let parameters = resolve(&class, &ClassDayOverrides::default());

    assert_eq!(parameters.scoring.handicap_scale, None);
}

/// One class value and one class day value per rule override parameter, both
/// different from the Annex A default.
fn override_pairs() -> Vec<(RuleOverride, RuleOverride)> {
    let time = |h| Some(hours(h));
    let zone = |radius| ObservationZone {
        r1: radius,
        a1: 90.,
        r2: 0.,
        a2: 0.,
        orientation: Orientation::Next,
    };
    vec![
        (
            RuleOverride::EarthModel(EarthModel::FaiSphere),
            RuleOverride::EarthModel(EarthModel::Wgs84),
        ),
        (
            RuleOverride::FinishRingSubtracted(false),
            RuleOverride::FinishRingSubtracted(true),
        ),
        (
            RuleOverride::DeliveryPeriod(time(1)),
            RuleOverride::DeliveryPeriod(time(2)),
        ),
        (
            RuleOverride::StartLineLength(Some(10.)),
            RuleOverride::StartLineLength(Some(5.)),
        ),
        (
            RuleOverride::TurnpointZone(zone(1.)),
            RuleOverride::TurnpointZone(zone(2.)),
        ),
        (
            RuleOverride::AssignedAreaZone(zone(1.)),
            RuleOverride::AssignedAreaZone(zone(2.)),
        ),
        (
            RuleOverride::FinishZone(zone(1.)),
            RuleOverride::FinishZone(zone(2.)),
        ),
        (
            RuleOverride::StartOpeningTime(time(12)),
            RuleOverride::StartOpeningTime(time(13)),
        ),
        (
            RuleOverride::StartClosingTime(time(15)),
            RuleOverride::StartClosingTime(time(16)),
        ),
        (
            RuleOverride::MaximumStartAltitude(Some(1500.)),
            RuleOverride::MaximumStartAltitude(Some(1200.)),
        ),
        (
            RuleOverride::MaximumStartGroundSpeed(Some(150.)),
            RuleOverride::MaximumStartGroundSpeed(Some(170.)),
        ),
        (RuleOverride::PevStart(true), RuleOverride::PevStart(false)),
        (RuleOverride::PevWaitTime(5), RuleOverride::PevWaitTime(6)),
        (
            RuleOverride::PevStartWindow(5),
            RuleOverride::PevStartWindow(6),
        ),
        (
            RuleOverride::TowAltitude(Some(800.)),
            RuleOverride::TowAltitude(Some(600.)),
        ),
        (
            RuleOverride::MaximumAltitude(Some(MaximumAltitude::FlightLevel(95))),
            RuleOverride::MaximumAltitude(Some(MaximumAltitude::Msl(2500.))),
        ),
        (
            RuleOverride::ScoringEndTime(time(19)),
            RuleOverride::ScoringEndTime(time(20)),
        ),
    ]
}

#[test]
fn class_override_wins_over_the_edition_default() {
    let defaults = resolve(&club_class(vec![]), &ClassDayOverrides::default());
    for (class_value, _) in override_pairs() {
        let class = club_class(vec![class_value.clone()]);

        let parameters = resolve(&class, &ClassDayOverrides::default());

        assert_ne!(parameters, defaults, "{class_value:?}");
    }
}

#[test]
fn class_day_override_wins_over_the_class_override() {
    for (class_value, class_day_value) in override_pairs() {
        let class_day = ClassDayOverrides {
            rules: vec![class_day_value.clone()],
            ..ClassDayOverrides::default()
        };

        let both = resolve(&club_class(vec![class_value.clone()]), &class_day);
        let class_day_only = resolve(&club_class(vec![]), &class_day);
        let class_only = resolve(
            &club_class(vec![class_value]),
            &ClassDayOverrides::default(),
        );

        assert_eq!(both, class_day_only, "{class_day_value:?}");
        assert_ne!(both, class_only, "{class_day_value:?}");
    }
}

#[test]
fn class_day_overrides_dm_and_d1() {
    let class_day = ClassDayOverrides {
        dm: Some(50.),
        d1: Some(200.),
        ..ClassDayOverrides::default()
    };

    let parameters = resolve(&club_class(vec![]), &class_day);

    assert_eq!(parameters.scoring.dm, 50.);
    assert_eq!(parameters.scoring.d1, 200.);
}

#[test]
fn scoring_only_change_leaves_the_analysis_parameters_equal() {
    let class = club_class(vec![]);
    let class_day = ClassDayOverrides {
        dm: Some(50.),
        ..ClassDayOverrides::default()
    };

    let changed = resolve(&class, &class_day);
    let unchanged = resolve(&class, &ClassDayOverrides::default());

    assert_ne!(changed.scoring, unchanged.scoring);
    assert_eq!(changed.analysis, unchanged.analysis);
}

#[test]
fn invalid_class_values_are_errors() {
    for (class, parameter) in [
        (
            Class {
                dm: -1.,
                ..club_class(vec![])
            },
            Parameter::Dm,
        ),
        (
            Class {
                dm: f64::NAN,
                ..club_class(vec![])
            },
            Parameter::Dm,
        ),
        (
            Class {
                d1: 0.,
                ..club_class(vec![])
            },
            Parameter::D1,
        ),
    ] {
        let result = FAI_ANNEX_A_2025A.resolve(&class, &ClassDayOverrides::default());

        assert_eq!(result, Err(InvalidValue::OutOfRange(parameter)));
    }
}

#[test]
fn invalid_class_day_dm_and_d1_are_errors() {
    for (class_day, parameter) in [
        (
            ClassDayOverrides {
                dm: Some(-50.),
                ..ClassDayOverrides::default()
            },
            Parameter::Dm,
        ),
        (
            ClassDayOverrides {
                d1: Some(f64::INFINITY),
                ..ClassDayOverrides::default()
            },
            Parameter::D1,
        ),
    ] {
        assert_eq!(
            resolve_class_day(class_day),
            Err(InvalidValue::OutOfRange(parameter))
        );
    }
}

#[test]
fn invalid_rule_overrides_are_errors() {
    let zone = |r1, a1, r2, a2, orientation| ObservationZone {
        r1,
        a1,
        r2,
        a2,
        orientation,
    };
    let symmetric = Orientation::Symmetric;
    let day = Some(Duration::from_secs(24 * 3600));
    for (rule_override, parameter) in [
        (
            RuleOverride::StartLineLength(Some(0.)),
            Parameter::StartLineLength,
        ),
        (
            RuleOverride::TurnpointZone(zone(0., 180., 0., 0., symmetric)),
            Parameter::TurnpointZone,
        ),
        (
            RuleOverride::TurnpointZone(zone(1., 181., 0., 0., symmetric)),
            Parameter::TurnpointZone,
        ),
        (
            RuleOverride::AssignedAreaZone(zone(1., 180., -1., 0., symmetric)),
            Parameter::AssignedAreaZone,
        ),
        (
            RuleOverride::AssignedAreaZone(zone(1., 180., 0.5, -1., symmetric)),
            Parameter::AssignedAreaZone,
        ),
        (
            RuleOverride::FinishZone(zone(3., 180., 0., 0., Orientation::Fixed(360.))),
            Parameter::FinishZone,
        ),
        (
            RuleOverride::StartOpeningTime(day),
            Parameter::StartOpeningTime,
        ),
        (
            RuleOverride::StartClosingTime(day),
            Parameter::StartClosingTime,
        ),
        (
            RuleOverride::MaximumStartAltitude(Some(f64::NAN)),
            Parameter::MaximumStartAltitude,
        ),
        (
            RuleOverride::MaximumStartGroundSpeed(Some(0.)),
            Parameter::MaximumStartGroundSpeed,
        ),
        (RuleOverride::PevStartWindow(0), Parameter::PevStartWindow),
        (
            RuleOverride::TowAltitude(Some(f64::INFINITY)),
            Parameter::TowAltitude,
        ),
        (
            RuleOverride::MaximumAltitude(Some(MaximumAltitude::Msl(f64::NAN))),
            Parameter::MaximumAltitude,
        ),
        (
            RuleOverride::MaximumAltitude(Some(MaximumAltitude::FlightLevel(0))),
            Parameter::MaximumAltitude,
        ),
        (RuleOverride::ScoringEndTime(day), Parameter::ScoringEndTime),
    ] {
        assert_eq!(
            resolve_rules(vec![rule_override.clone()]),
            Err(InvalidValue::OutOfRange(parameter)),
            "{rule_override:?}"
        );
    }
}

#[test]
fn start_closing_before_opening_is_an_error() {
    let result = resolve_rules(vec![
        RuleOverride::StartOpeningTime(Some(hours(13))),
        RuleOverride::StartClosingTime(Some(hours(12))),
    ]);

    assert_eq!(result, Err(InvalidValue::StartClosesBeforeOpening));
}

#[test]
fn invalid_class_override_is_an_error_even_when_the_class_day_replaces_it() {
    let class = club_class(vec![RuleOverride::TowAltitude(Some(f64::NAN))]);
    let class_day = ClassDayOverrides {
        rules: vec![RuleOverride::TowAltitude(None)],
        ..ClassDayOverrides::default()
    };

    let result = FAI_ANNEX_A_2025A.resolve(&class, &class_day);

    assert_eq!(
        result,
        Err(InvalidValue::OutOfRange(Parameter::TowAltitude))
    );
}

#[test]
fn invalid_value_describes_the_valid_range() {
    assert_eq!(
        InvalidValue::OutOfRange(Parameter::Dm).to_string(),
        "Dm must be a distance of at least 0 km"
    );
    assert_eq!(
        InvalidValue::StartClosesBeforeOpening.to_string(),
        "the start must not close before it opens"
    );
}

fn departures(edition: &RuleSetEdition, rules: Vec<RuleOverride>) -> Vec<Departure> {
    let class_day = ClassDayOverrides {
        rules,
        ..ClassDayOverrides::default()
    };
    edition
        .resolve(&club_class(vec![]), &class_day)
        .unwrap()
        .departures
}

#[test]
fn edition_defaults_depart_from_nothing() {
    for edition in RuleSetEdition::ALL {
        assert_eq!(departures(edition, vec![]), []);
    }
}

#[test]
fn earth_model_the_edition_does_not_allow_is_a_departure() {
    let sphere = || vec![RuleOverride::EarthModel(EarthModel::FaiSphere)];

    assert_eq!(
        departures(&DAEC_SWO_2026, sphere()),
        [Departure::EarthModel(EarthModel::FaiSphere)]
    );
    assert_eq!(departures(&FAI_ANNEX_A_2025A, sphere()), []);
}

#[test]
fn pev_times_outside_the_edition_range_are_departures() {
    let rules = || {
        vec![
            RuleOverride::PevWaitTime(4),
            RuleOverride::PevStartWindow(8),
        ]
    };

    assert_eq!(
        departures(&DAEC_SWO_2026, rules()),
        [Departure::PevWaitTime(4), Departure::PevStartWindow(8)]
    );
    assert_eq!(
        departures(&FAI_ANNEX_A_2025A, rules()),
        [Departure::PevWaitTime(4)]
    );
}

#[test]
fn departing_value_replaced_by_the_class_day_is_no_departure() {
    let class = club_class(vec![RuleOverride::PevStartWindow(11)]);
    let class_day = ClassDayOverrides {
        rules: vec![RuleOverride::PevStartWindow(10)],
        ..ClassDayOverrides::default()
    };

    let resolution = FAI_ANNEX_A_2025A.resolve(&class, &class_day).unwrap();

    assert_eq!(resolution.departures, []);
}

fn template(edition: &RuleSetEdition, name: &str) -> &'static ClassTemplate {
    RuleSetEdition::find(edition.id)
        .unwrap()
        .class_templates
        .iter()
        .find(|template| template.name == name)
        .unwrap()
}

#[test]
fn class_with_the_template_values_departs_from_nothing() {
    let club = template(&DAEC_SWO_2026, "Club");

    assert_eq!(club.departures(&club_class(vec![])), []);
}

#[test]
fn lower_dm_and_d1_than_the_template_are_departures() {
    let class = Class {
        dm: 50.,
        d1: 200.,
        ..club_class(vec![])
    };

    assert_eq!(
        template(&DAEC_SWO_2026, "Club").departures(&class),
        [
            Departure::DmBelowTemplate(50.),
            Departure::D1BelowTemplate(200.)
        ]
    );
}

#[test]
fn higher_dm_and_d1_than_the_template_depart_from_nothing() {
    let class = Class {
        dm: 120.,
        d1: 300.,
        ..club_class(vec![])
    };

    assert_eq!(template(&DAEC_SWO_2026, "Club").departures(&class), []);
}

#[test]
fn unhandicapped_class_departs_from_a_handicapped_template() {
    let class = Class {
        handicapped: false,
        ..club_class(vec![])
    };

    for (edition, name) in [
        (&DAEC_SWO_2026, "Club"),
        (&DAEC_SWO_2026, "Two-seater"),
        (&FAI_ANNEX_A_2025A, "Club"),
    ] {
        assert_eq!(
            template(edition, name).departures(&Class {
                dm: 120.,
                d1: 300.,
                ..class.clone()
            }),
            [Departure::Unhandicapped],
            "{name}"
        );
    }
}
