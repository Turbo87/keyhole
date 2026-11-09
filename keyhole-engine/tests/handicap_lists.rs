use keyhole_engine::handicap_lists::HandicapList;
use keyhole_engine::rule_sets::HandicapScale;

fn list(id: &str) -> &'static HandicapList {
    HandicapList::find(id).unwrap_or_else(|| panic!("no handicap list {id}"))
}

fn handicap(id: &str, glider_type: &str) -> Option<f64> {
    list(id).lookup(glider_type).map(|entry| entry.handicap)
}

#[test]
fn lookup_by_glider_type_returns_the_entry() {
    let entry = list("igc-club-2026").lookup("LS 4,a,b").unwrap();
    assert_eq!((entry.glider_type, entry.handicap), ("LS 4,a,b", 1.030));
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
    assert_eq!(summary("igc-club-2026"), (HandicapScale::One, 35));
    assert_eq!(handicap("igc-club-2026", "ASW 20B,C"), Some(1.080));
    assert_eq!(handicap("igc-club-2026", "Discus a,b,CS"), Some(1.054));
    assert_eq!(
        handicap("igc-club-2026", "Std. Cirrus B (16m)"),
        Some(1.006)
    );
    assert_eq!(
        handicap("igc-club-2026", "Std. Libelle, 201B,202,203"),
        Some(0.988)
    );
}

#[test]
fn igc_20m_multi_seat_class_list_matches_sc3ah_2026_appendix_2() {
    assert_eq!(summary("igc-20m-2026"), (HandicapScale::One, 9));
    assert_eq!(handicap("igc-20m-2026", "ASG 32, Mi, EL"), Some(1.05));
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
