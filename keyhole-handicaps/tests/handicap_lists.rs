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
    for (id, scale) in [
        ("daec-2026", 100.),
        ("daec-18m-2026", 1.),
        ("igc-20m-multi-seat-2024a", 1.),
    ] {
        assert_eq!(HandicapList::find(id).map(|list| list.scale), Some(scale));
    }
}

#[test]
fn every_list_has_as_many_entries_as_its_published_document() {
    for (id, count) in [
        ("daec-2026", 661),
        ("daec-offene-2026", 111),
        ("daec-18m-2026", 120),
        ("daec-15m-2026", 115),
        ("daec-standard-2026", 49),
        ("daec-standard-junioren-2026", 104),
        ("igc-club-2024a", 35),
        ("igc-20m-multi-seat-2024a", 9),
    ] {
        let entry_count = HandicapList::find(id).map(|list| list.entries.len());
        assert_eq!(entry_count, Some(count), "{id}");
    }
}

#[test]
fn spot_values_match_the_published_documents() {
    for (id, glider_type, handicap) in [
        ("daec-2026", "EB 29R", 126.),
        ("daec-2026", "ASW 20 B/C WL", 109.),
        ("daec-2026", "L-13 Blaník", 81.),
        ("daec-2026", "Schweizer SGS 1-26", 71.),
        ("daec-offene-2026", "EB 29R", 1.),
        ("daec-offene-2026", "Nimbus 4D (750 kg)", 0.937),
        ("daec-offene-2026", "Ventus 2cxT 18m", 0.929),
        ("daec-18m-2026", "JS3 18m", 1.),
        ("daec-18m-2026", "ASG 29 18m", 0.992),
        ("daec-15m-2026", "SZD-56-2 Diana 2", 1.),
        ("daec-15m-2026", "Ventus 2ax", 0.991),
        ("daec-15m-2026", "SZD-55-1 Nexus", 0.930),
        ("daec-standard-2026", "Discus 2a", 1.),
        ("daec-standard-2026", "Pegase", 0.936),
        ("daec-standard-2026", "DG 300 FG", 0.927),
        ("daec-standard-junioren-2026", "Ventus a 15m WL", 1.),
        ("daec-standard-junioren-2026", "ASW 20 B/C WL", 0.991),
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
