//! Tasks and their observation zones.

/// The area or line around a reference point that a flight has to reach or
/// cross, with every distance in km and every angle in degrees.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ObservationZone {
    Line {
        length: f64,
    },
    /// SeeYou's zone of the R1 sector of half angle A1, minus the R2 disc,
    /// plus the R2 sector of half angle A2.
    TwoArc {
        r1: f64,
        a1: f64,
        r2: f64,
        a2: f64,
        /// Whether the zone shortens each task leg it touches by its R1.
        reduce: bool,
    },
}

impl ObservationZone {
    /// A two-arc zone shaped as a cylinder of the given radius.
    pub const fn cylinder(radius: f64, reduce: bool) -> Self {
        Self::TwoArc {
            r1: radius,
            a1: 180.,
            r2: 0.,
            a2: 0.,
            reduce,
        }
    }

    /// The DAeC keyhole: a 10 km sector with a half angle of 45°, joined with a
    /// 0.5 km cylinder.
    pub const fn daec_keyhole() -> Self {
        Self::TwoArc {
            r1: 10.,
            a1: 45.,
            r2: 0.5,
            a2: 180.,
            reduce: false,
        }
    }
}
