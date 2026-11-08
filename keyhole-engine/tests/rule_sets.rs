use std::time::Duration;

use keyhole_engine::rule_sets::{
    AnalysisParameters, DAEC_SWO_2026, DefaultZones, EarthModel, FAI_ANNEX_A_2025A,
    MissingPevPenalty, ObservationZone, Orientation, PevRules, PevScope, RuleSetEdition,
    StartProcedure,
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
