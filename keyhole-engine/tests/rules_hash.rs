use std::collections::HashSet;
use std::time::Duration;

use keyhole_engine::rule_sets::{
    Class, ClassDayOverrides, DAEC_SWO_2026, EarthModel, FAI_ANNEX_A_2025A, HandicapScale,
    MaximumAltitude, ObservationZone, Orientation, RuleOverride, RuleSetEdition,
};

fn club_class() -> Class {
    Class {
        dm: 100.,
        d1: 250.,
        handicapped: true,
        handicap_scale: HandicapScale::One,
        overrides: vec![],
    }
}

fn default_hash(edition: &RuleSetEdition) -> String {
    let resolution = edition
        .resolve(&club_class(), &ClassDayOverrides::default())
        .unwrap();
    edition.rules_hash(&resolution.parameters).to_string()
}

#[test]
fn edition_defaults_have_pinned_hashes() {
    assert_eq!(
        default_hash(&DAEC_SWO_2026),
        "4082e8dff81ce850c8f167df25ce796247b3981abfb4965ff7b49c69dcc67c5e"
    );
    assert_eq!(
        default_hash(&FAI_ANNEX_A_2025A),
        "c7be29d6a47b50c88b8b89f8416c0424699d95d5224ae579443adec8f55de65b"
    );
}

fn hours(hours: u64) -> Duration {
    Duration::from_secs(hours * 3600)
}

fn hash(class: &Class, class_day: &ClassDayOverrides) -> String {
    let resolution = FAI_ANNEX_A_2025A.resolve(class, class_day).unwrap();
    FAI_ANNEX_A_2025A
        .rules_hash(&resolution.parameters)
        .to_string()
}

fn class_day(rules: Vec<RuleOverride>) -> ClassDayOverrides {
    ClassDayOverrides {
        rules,
        ..ClassDayOverrides::default()
    }
}

/// Class days that each change a single parameter of the Annex A defaults.
fn single_changes() -> Vec<(Class, ClassDayOverrides)> {
    let zone = |r1, a1, r2, a2, orientation| ObservationZone {
        r1,
        a1,
        r2,
        a2,
        orientation,
    };
    let zones = [
        zone(0.6, 180., 0., 0., Orientation::Symmetric),
        zone(0.5, 90., 0., 0., Orientation::Symmetric),
        zone(0.5, 180., 1., 0., Orientation::Symmetric),
        zone(0.5, 180., 0., 90., Orientation::Symmetric),
        zone(0.5, 180., 0., 0., Orientation::Fixed(0.)),
        zone(0.5, 180., 0., 0., Orientation::Previous),
        zone(0.5, 180., 0., 0., Orientation::Next),
    ];
    let mut rules = vec![
        RuleOverride::EarthModel(EarthModel::FaiSphere),
        RuleOverride::FinishRingSubtracted(false),
        RuleOverride::DeliveryPeriod(Some(Duration::ZERO)),
        RuleOverride::DeliveryPeriod(Some(Duration::from_nanos(1))),
        RuleOverride::StartLineLength(Some(10.)),
        RuleOverride::AssignedAreaZone(zone(20., 90., 0., 0., Orientation::Symmetric)),
        RuleOverride::FinishZone(zone(5., 180., 0., 0., Orientation::Symmetric)),
        RuleOverride::StartOpeningTime(Some(hours(12))),
        RuleOverride::StartClosingTime(Some(hours(12))),
        RuleOverride::MaximumStartAltitude(Some(0.)),
        RuleOverride::MaximumStartGroundSpeed(Some(150.)),
        RuleOverride::PevStart(true),
        RuleOverride::PevWaitTime(5),
        RuleOverride::PevStartWindow(5),
        RuleOverride::TowAltitude(Some(0.)),
        RuleOverride::MaximumAltitude(Some(MaximumAltitude::Msl(95.))),
        RuleOverride::MaximumAltitude(Some(MaximumAltitude::FlightLevel(95))),
        RuleOverride::ScoringEndTime(Some(hours(12))),
    ];
    rules.extend(zones.into_iter().map(RuleOverride::TurnpointZone));

    let mut changes: Vec<_> = rules
        .into_iter()
        .map(|rule| (club_class(), class_day(vec![rule])))
        .collect();
    changes.extend([
        (
            club_class(),
            ClassDayOverrides {
                dm: Some(50.),
                ..ClassDayOverrides::default()
            },
        ),
        (
            club_class(),
            ClassDayOverrides {
                d1: Some(300.),
                ..ClassDayOverrides::default()
            },
        ),
        (
            Class {
                handicapped: false,
                ..club_class()
            },
            ClassDayOverrides::default(),
        ),
        (
            Class {
                handicap_scale: HandicapScale::Hundred,
                ..club_class()
            },
            ClassDayOverrides::default(),
        ),
    ]);
    changes
}

#[test]
fn every_single_parameter_change_changes_the_hash() {
    let defaults = (club_class(), ClassDayOverrides::default());
    let mut hashes = HashSet::new();
    for (class, class_day) in [defaults].into_iter().chain(single_changes()) {
        let hash = hash(&class, &class_day);
        assert!(hashes.insert(hash), "{class:?} {class_day:?} hashes alike");
    }
}

#[test]
fn edition_id_changes_the_hash() {
    let parameters = FAI_ANNEX_A_2025A
        .resolve(&club_class(), &ClassDayOverrides::default())
        .unwrap()
        .parameters;

    assert_ne!(
        DAEC_SWO_2026.rules_hash(&parameters),
        FAI_ANNEX_A_2025A.rules_hash(&parameters)
    );
}

#[test]
fn layerings_with_equal_effective_parameters_hash_alike() {
    let sphere = RuleOverride::EarthModel(EarthModel::FaiSphere);
    let on_class = Class {
        overrides: vec![sphere.clone()],
        ..club_class()
    };
    let replaced_on_class_day = Class {
        dm: 80.,
        overrides: vec![RuleOverride::PevWaitTime(5), sphere.clone()],
        ..club_class()
    };
    let replacing_class_day = ClassDayOverrides {
        dm: Some(100.),
        rules: vec![RuleOverride::PevWaitTime(10)],
        ..ClassDayOverrides::default()
    };

    let expected = hash(&on_class, &ClassDayOverrides::default());
    assert_eq!(hash(&club_class(), &class_day(vec![sphere])), expected);
    assert_eq!(hash(&replaced_on_class_day, &replacing_class_day), expected);
}

#[test]
fn negative_zero_hashes_like_zero() {
    let zero = class_day(vec![RuleOverride::TowAltitude(Some(0.))]);
    let negative_zero = class_day(vec![RuleOverride::TowAltitude(Some(-0.))]);

    assert_eq!(
        hash(&club_class(), &zero),
        hash(&club_class(), &negative_zero)
    );
}
