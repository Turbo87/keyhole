use keyhole_engine::handicap_lists::HandicapList;
use keyhole_engine::rule_sets::{HandicapScale, RuleSetEdition};

fn list(id: &str) -> &'static HandicapList {
    HandicapList::find(id).unwrap_or_else(|| panic!("no handicap list {id}"))
}

fn handicap(id: &str, glider_type: &str) -> Option<f64> {
    list(id).lookup(glider_type).map(|entry| entry.handicap)
}

#[test]
fn lookup_by_glider_type_returns_the_entry() {
    let entry = list("igc-club-2026").lookup("LS 4a").unwrap();
    assert_eq!((entry.glider_type, entry.handicap), ("LS 4a", 1.030));
}

#[test]
fn lookup_of_an_unlisted_glider_type_returns_nothing() {
    assert_eq!(handicap("igc-club-2026", "ASG 29"), None);
}

#[test]
fn every_list_is_found_by_its_id() {
    for list in HandicapList::ALL {
        assert_eq!(HandicapList::find(list.id), Some(list));
    }
    assert_eq!(HandicapList::find("igc-club-2024a"), None);
}

#[test]
fn glider_types_are_unique_within_a_list() {
    for list in HandicapList::ALL {
        for entry in list.entries {
            assert_eq!(list.lookup(entry.glider_type), Some(entry), "{}", list.id);
        }
    }
}

fn summary(id: &str) -> (HandicapScale, usize) {
    let list = list(id);
    (list.scale, list.entries.len())
}

#[test]
fn igc_club_class_list_matches_sc3ah_2026_appendix_1() {
    assert_eq!(summary("igc-club-2026"), (HandicapScale::One, 73));
    assert_eq!(handicap("igc-club-2026", "ASW 20B"), Some(1.080));
    assert_eq!(handicap("igc-club-2026", "ASW 20C"), Some(1.080));
    assert_eq!(handicap("igc-club-2026", "Discus CS"), Some(1.054));
    assert_eq!(
        handicap("igc-club-2026", "Std. Cirrus B (16m)"),
        Some(1.006)
    );
    assert_eq!(handicap("igc-club-2026", "Std. Libelle 203"), Some(0.988));
}

#[test]
fn igc_20m_multi_seat_class_list_matches_sc3ah_2026_appendix_2() {
    assert_eq!(summary("igc-20m-2026"), (HandicapScale::One, 14));
    assert_eq!(handicap("igc-20m-2026", "ASG 32 Mi"), Some(1.05));
    assert_eq!(handicap("igc-20m-2026", "LS11"), Some(1.01));
    assert_eq!(
        handicap("igc-20m-2026", "Arcus (pure glider without MoP)"),
        Some(1.04)
    );
    assert_eq!(
        handicap(
            "igc-20m-2026",
            "Duo Discus (all versions with certified MTOM 700kg)"
        ),
        Some(1.00)
    );
}

#[test]
fn every_list_a_class_template_references_exists() {
    for edition in RuleSetEdition::ALL {
        for template in edition.class_templates {
            if let Some(id) = template.handicap_list {
                assert!(HandicapList::find(id).is_some(), "{}: {id}", edition.id);
            }
        }
    }
}

#[test]
fn daec_cross_class_list_matches_the_indexliste_wettbewerb_2026() {
    assert_eq!(summary("daec-2026"), (HandicapScale::Hundred, 650));
    assert_eq!(handicap("daec-2026", "EB 29R"), Some(126.));
    assert_eq!(handicap("daec-2026", "LS 4"), Some(104.));
    assert_eq!(handicap("daec-2026", "Specht"), Some(63.));
    assert_eq!(handicap("daec-2026", "L-13 Blaník"), Some(81.));
}

fn assert_class_sheet(id: &str, count: usize, spot_values: [(&str, f64); 2]) {
    assert_eq!(summary(id), (HandicapScale::One, count), "{id}");
    for (glider_type, value) in spot_values {
        assert_eq!(
            handicap(id, glider_type),
            Some(value),
            "{id}: {glider_type}"
        );
    }
}

#[test]
fn daec_class_sheets_match_the_indexliste_wettbewerb_2026() {
    assert_class_sheet(
        "daec-open-2026",
        106,
        [("EB 29R", 1.000), ("Ventus 2cxT 18m", 0.929)],
    );
    assert_class_sheet(
        "daec-18m-2026",
        115,
        [("AS 33 18m", 1.000), ("LS 10 18m", 0.975)],
    );
    assert_class_sheet(
        "daec-15m-2026",
        113,
        [("SZD-56-2 Diana 2", 1.000), ("ASW 20 B/C WL", 0.956)],
    );
    assert_class_sheet(
        "daec-standard-2026",
        47,
        [("Discus 2a", 1.000), ("LS 4", 0.945)],
    );
    assert_class_sheet(
        "daec-standard-junior-2026",
        102,
        [("LS 6 WL", 1.000), ("PIK-20 D", 0.945)],
    );
}
