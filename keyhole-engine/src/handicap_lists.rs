//! The built-in handicap lists.

use crate::rule_sets::HandicapScale;

mod daec_2026;
mod igc_2026;

/// One published edition of handicaps per glider type, built in and never
/// changed.
#[non_exhaustive]
#[derive(Debug, PartialEq)]
pub struct HandicapList {
    pub id: &'static str,
    pub scale: HandicapScale,
    pub entries: &'static [HandicapEntry],
}

/// A glider type with its handicap on its list's scale.
#[non_exhaustive]
#[derive(Debug, PartialEq)]
pub struct HandicapEntry {
    pub glider_type: &'static str,
    pub handicap: f64,
}

const fn entry(glider_type: &'static str, handicap: f64) -> HandicapEntry {
    HandicapEntry {
        glider_type,
        handicap,
    }
}

impl HandicapList {
    pub const ALL: [&'static Self; 8] = [
        &daec_2026::CROSS_CLASS,
        &daec_2026::OPEN,
        &daec_2026::CLASS_18M,
        &daec_2026::CLASS_15M,
        &daec_2026::STANDARD,
        &daec_2026::STANDARD_JUNIOR,
        &igc_2026::CLUB,
        &igc_2026::MULTI_SEAT_20M,
    ];

    pub fn find(id: &str) -> Option<&'static Self> {
        Self::ALL.into_iter().find(|list| list.id == id)
    }

    /// The entry of a glider type, spelled exactly as the list publishes it.
    pub fn lookup(&self, glider_type: &str) -> Option<&'static HandicapEntry> {
        self.entries
            .iter()
            .find(|entry| entry.glider_type == glider_type)
    }
}
