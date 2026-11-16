use std::collections::HashSet;

use keyhole_handicaps::HandicapList;

#[test]
fn a_glider_type_is_looked_up_in_a_list() {
    let list = HandicapList::find("igc-club-2024a").unwrap();
    let handicap = list.lookup("LS 4,a,b").map(|entry| entry.handicap);
    assert_eq!(handicap, Some(1.030));
    assert_eq!(list.lookup("LS 4"), None);
}

#[test]
fn every_list_file_is_a_built_in_list_with_unique_glider_types() {
    let lists_dir = concat!(env!("CARGO_MANIFEST_DIR"), "/lists");
    let mut file_ids = std::fs::read_dir(lists_dir)
        .unwrap()
        .map(|file| file.unwrap().path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "csv"))
        .map(|path| path.file_stem().unwrap().to_str().unwrap().to_owned())
        .collect::<Vec<_>>();
    file_ids.sort();

    let mut list_ids: Vec<_> = HandicapList::all().iter().map(|list| list.id).collect();
    list_ids.sort();
    assert_eq!(list_ids, file_ids);

    for list in HandicapList::all() {
        assert_eq!(HandicapList::find(list.id), Some(list));
        let glider_types = list
            .entries
            .iter()
            .map(|entry| &entry.glider_type)
            .collect::<HashSet<_>>();
        let repeats = list.entries.len() - glider_types.len();
        assert_eq!(repeats, 0, "{} repeats a glider type", list.id);
    }
}

#[test]
fn a_list_takes_its_scale_from_its_handicaps() {
    for (id, scale) in [("igc-club-2024a", 1.), ("igc-20m-multi-seat-2024a", 1.)] {
        assert_eq!(HandicapList::find(id).map(|list| list.scale), Some(scale));
    }
}

#[test]
fn every_list_has_as_many_entries_as_its_published_document() {
    for (id, count) in [("igc-club-2024a", 35), ("igc-20m-multi-seat-2024a", 9)] {
        let entry_count = HandicapList::find(id).map(|list| list.entries.len());
        assert_eq!(entry_count, Some(count), "{id}");
    }
}

#[test]
fn spot_values_match_the_published_documents() {
    for (id, glider_type, handicap) in [
        ("igc-club-2024a", "ASW 20B,C", 1.080),
        ("igc-club-2024a", "SZD-48-3M, 3M1 \"Brawo\"", 1.012),
        ("igc-club-2024a", "Std. Libelle, 201B,202,203", 0.988),
        ("igc-20m-multi-seat-2024a", "Arcus T, M, E", 1.05),
        ("igc-20m-multi-seat-2024a", "LAK 12R 20m, LS11", 1.01),
        ("igc-20m-multi-seat-2024a", "Duo Discus (MTOM 700kg)", 1.),
    ] {
        let list = HandicapList::find(id).unwrap();
        let listed = list.lookup(glider_type).map(|entry| entry.handicap);
        assert_eq!(listed, Some(handicap), "{id}: {glider_type}");
    }
}
