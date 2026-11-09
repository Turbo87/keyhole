//! The handicap appendices of the IGC Procedures for Handicapped Classes
//! (SC3AH), edition valid from 15 April 2026:
//! <https://www.fai.org/sites/default/files/document/file/SC3AH_2026.pdf>
//!
//! Glider types are spelled as published, and a type cell spanning several
//! lines is joined with spaces. Rows naming several types on separate lines
//! become one entry per type.

use super::{HandicapList, entry};
use crate::rule_sets::HandicapScale;

/// Appendix 1, the IGC Club Class List of 1 October 2024.
pub static CLUB: HandicapList = HandicapList {
    id: "igc-club-2026",
    scale: HandicapScale::One,
    entries: &[
        entry("ASW 20B,C", 1.080),
        entry("ASW 20,F, L", 1.074),
        entry("LS 3, a,", 1.062),
        entry("ASW 24, B", 1.060),
        entry("Mosquito, B", 1.056),
        entry("DG 200 (15m)", 1.056),
        entry("Mini Nimbus", 1.056),
        entry("Speed Astir II, IIb", 1.056),
        entry("Glasflügel 304,B,HPH 304 CZ (15m)", 1.056),
        entry("Discus a,b,CS", 1.054),
        entry("Genesis 2", 1.048),
        entry("SZD 55-1", 1.042),
        entry("PIK 20 A,", 1.038),
        entry("LS 7", 1.036),
        entry("HPH 304 C", 1.033),
        entry("PIK 20 B", 1.032),
        entry("H301 Libelle", 1.032),
        entry("LS 4,a,b", 1.030),
        entry("PIK 20 D", 1.026),
        entry("CB-15 CRYSTAL", 1.024),
        entry("SZD59 ACRO(15m)", 1.024),
        entry("DG 300,DG 303", 1.018),
        entry("Pegase 101,A,B,C,D,P,AP", 1.018),
        entry("Jantar Std. 2, 2M, Std.3", 1.012),
        entry("SZD-48-3M, 3M1 \"Brawo\"", 1.012),
        entry("Std. Cirrus B (16m)", 1.006),
        entry("Hornet, C", 1.006),
        entry("LS 1f, LS 1f(45)", 1.006),
        entry("ASW 19,B", 1.000),
        entry("DG 100, G, Elan, G Elan", 1.000),
        entry("Jantar Std.", 1.000),
        entry("Std. Cirrus B(15m),CS11-75L,", 1.000),
        entry("ASW 15, B", 0.988),
        entry("LS 1 0,a,b,c,d", 0.988),
        entry("Std. Libelle, 201B,202,203", 0.988),
    ],
};

/// Appendix 2, the IGC 20m Multi-Seat Class List of 1 April 2024.
pub static MULTI_SEAT_20M: HandicapList = HandicapList {
    id: "igc-20m-2026",
    scale: HandicapScale::One,
    entries: &[
        entry("Arcus T, M, E", 1.05),
        entry("ASG 32, Mi, EL", 1.05),
        entry("HPH304TS Twin Shark (all versions)", 1.05),
        entry("Arcus (pure glider without MoP)", 1.04),
        entry("Duo Discus (all versions with certified MTOM 750kg)", 1.01),
        entry("LAK 12R 20m, LS11", 1.01),
        entry("DG1000/1001 (all versions with certified MTOM 790kg)", 1.01),
        entry("DG1000/1001 (all versions with certified MTOM 750kg)", 1.00),
        entry("Duo Discus (all versions with certified MTOM 700kg)", 1.00),
    ],
};
