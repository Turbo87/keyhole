//! The built-in handicap lists, shipped as immutable data.
//!
//! Every list edition is a CSV file in the `lists` directory, named after
//! its ID, with a `glider_type` and a `handicap` column, so that other tools
//! can read the lists directly.
//!
//! The `daec-*-2026` lists are the cross-class list and the class sheets of
//! the DAeC Indexliste Wettbewerb 2026 as revised in February 2026. The
//! `igc-*-2024a` lists are Appendices 1 and 2 of the IGC Procedures for
//! Handicapped Classes valid from 15 April 2026.

use std::sync::LazyLock;

macro_rules! source {
    ($id:literal) => {
        ($id, include_str!(concat!("../lists/", $id, ".csv")))
    };
}

const SOURCES: &[(&str, &str)] = &[
    source!("daec-2026"),
    source!("daec-offene-2026"),
    source!("daec-18m-2026"),
    source!("daec-15m-2026"),
    source!("daec-standard-2026"),
    source!("daec-standard-junioren-2026"),
    source!("igc-club-2024a"),
    source!("igc-20m-multi-seat-2024a"),
];

static LISTS: LazyLock<Vec<HandicapList>> = LazyLock::new(|| {
    SOURCES
        .iter()
        .map(|&(id, csv)| HandicapList::parse(id, csv))
        .collect()
});

/// One published edition of handicaps per glider type.
///
/// Only this crate constructs lists, so every list is a built-in one.
#[derive(Debug, PartialEq)]
#[non_exhaustive]
pub struct HandicapList {
    pub id: &'static str,
    /// The handicap of a glider performing exactly as the reference, 1 for
    /// lists on the 1.000 scale and 100 for lists on the 100 scale.
    pub scale: f64,
    pub entries: Vec<HandicapEntry>,
}

#[derive(Debug, PartialEq, serde::Deserialize)]
#[non_exhaustive]
pub struct HandicapEntry {
    pub glider_type: String,
    pub handicap: f64,
}

impl HandicapList {
    /// Every built-in list.
    pub fn all() -> &'static [Self] {
        &LISTS
    }

    /// Looks up a built-in list by its ID.
    pub fn find(id: &str) -> Option<&'static Self> {
        Self::all().iter().find(|list| list.id == id)
    }

    /// Looks up the entry for a glider type, spelled exactly as in the list.
    pub fn lookup(&self, glider_type: &str) -> Option<&HandicapEntry> {
        self.entries
            .iter()
            .find(|entry| entry.glider_type == glider_type)
    }

    fn parse(id: &'static str, csv: &str) -> Self {
        let entries: Vec<HandicapEntry> = csv::Reader::from_reader(csv.as_bytes())
            .deserialize()
            .collect::<Result<_, _>>()
            .unwrap_or_else(|error| panic!("handicap list {id} is malformed: {error}"));

        // Handicaps on the 100 scale range from about 60 to 130 and those on
        // the 1.000 scale from about 0.8 to 1.3, so any value of 10 or more
        // marks the 100 scale.
        let on_100_scale = |entry: &HandicapEntry| entry.handicap >= 10.;
        let scale = if entries.iter().all(on_100_scale) {
            100.
        } else if entries.iter().any(on_100_scale) {
            panic!("handicap list {id} mixes the 1.000 and the 100 scale");
        } else {
            1.
        };

        Self { id, scale, entries }
    }
}
