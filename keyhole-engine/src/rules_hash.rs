//! The rules hash, which identifies the edition and effective parameters a
//! result was scored under.

use std::fmt;
use std::time::Duration;

use sha2::{Digest, Sha256};

use crate::rule_sets::{
    AnalysisParameters, DefaultZones, EarthModel, EffectiveParameters, HandicapScale,
    MaximumAltitude, ObservationZone, Orientation, RuleSetEdition, ScoringParameters,
    StartProcedure,
};

/// A SHA-256 hash over a canonical serialization of an edition ID and a class
/// day's effective parameters, displayed as lowercase hex.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RulesHash([u8; 32]);

impl fmt::Display for RulesHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.iter().try_for_each(|byte| write!(f, "{byte:02x}"))
    }
}

impl RuleSetEdition {
    /// Hashes this edition's ID with effective parameters it resolved.
    pub fn rules_hash(&self, parameters: &EffectiveParameters) -> RulesHash {
        let mut hasher = Sha256::new();
        self.id.write(&mut hasher);
        parameters.write(&mut hasher);
        RulesHash(hasher.finalize().into())
    }
}

/// A serialization that depends only on a value, never on the platform, and
/// in which no two unequal values of a type share their bytes.
trait Canonical {
    fn write(&self, hasher: &mut Sha256);
}

impl Canonical for str {
    fn write(&self, hasher: &mut Sha256) {
        (self.len() as u64).write(hasher);
        hasher.update(self.as_bytes());
    }
}

impl Canonical for bool {
    fn write(&self, hasher: &mut Sha256) {
        u8::from(*self).write(hasher);
    }
}

impl Canonical for u8 {
    fn write(&self, hasher: &mut Sha256) {
        hasher.update([*self]);
    }
}

impl Canonical for u32 {
    fn write(&self, hasher: &mut Sha256) {
        hasher.update(self.to_be_bytes());
    }
}

impl Canonical for u64 {
    fn write(&self, hasher: &mut Sha256) {
        hasher.update(self.to_be_bytes());
    }
}

impl Canonical for f64 {
    fn write(&self, hasher: &mut Sha256) {
        // -0.0 equals 0.0, so both must hash alike.
        let value = if *self == 0. { 0. } else { *self };
        hasher.update(value.to_bits().to_be_bytes());
    }
}

impl Canonical for Duration {
    fn write(&self, hasher: &mut Sha256) {
        self.as_secs().write(hasher);
        self.subsec_nanos().write(hasher);
    }
}

impl<T: Canonical> Canonical for Option<T> {
    fn write(&self, hasher: &mut Sha256) {
        match self {
            None => 0u8.write(hasher),
            Some(value) => {
                1u8.write(hasher);
                value.write(hasher);
            }
        }
    }
}

impl Canonical for EffectiveParameters {
    fn write(&self, hasher: &mut Sha256) {
        let Self {
            analysis,
            scoring,
            default_zones,
        } = self;
        analysis.write(hasher);
        scoring.write(hasher);
        default_zones.write(hasher);
    }
}

impl Canonical for AnalysisParameters {
    fn write(&self, hasher: &mut Sha256) {
        let Self {
            earth_model,
            finish_ring_subtracted,
            delivery_period,
            start,
            tow_altitude,
            maximum_altitude,
            scoring_end_time,
        } = self;
        earth_model.write(hasher);
        finish_ring_subtracted.write(hasher);
        delivery_period.write(hasher);
        start.write(hasher);
        tow_altitude.write(hasher);
        maximum_altitude.write(hasher);
        scoring_end_time.write(hasher);
    }
}

impl Canonical for EarthModel {
    fn write(&self, hasher: &mut Sha256) {
        match self {
            Self::Wgs84 => 0u8,
            Self::FaiSphere => 1,
        }
        .write(hasher);
    }
}

impl Canonical for StartProcedure {
    fn write(&self, hasher: &mut Sha256) {
        let Self {
            opening_time,
            closing_time,
            maximum_altitude,
            maximum_ground_speed,
            pev_start,
            pev_wait_time,
            pev_start_window,
        } = self;
        opening_time.write(hasher);
        closing_time.write(hasher);
        maximum_altitude.write(hasher);
        maximum_ground_speed.write(hasher);
        pev_start.write(hasher);
        pev_wait_time.write(hasher);
        pev_start_window.write(hasher);
    }
}

impl Canonical for MaximumAltitude {
    fn write(&self, hasher: &mut Sha256) {
        match self {
            Self::Msl(altitude) => {
                0u8.write(hasher);
                altitude.write(hasher);
            }
            Self::FlightLevel(level) => {
                1u8.write(hasher);
                level.write(hasher);
            }
        }
    }
}

impl Canonical for ScoringParameters {
    fn write(&self, hasher: &mut Sha256) {
        let Self {
            dm,
            d1,
            handicap_scale,
        } = self;
        dm.write(hasher);
        d1.write(hasher);
        handicap_scale.write(hasher);
    }
}

impl Canonical for HandicapScale {
    fn write(&self, hasher: &mut Sha256) {
        match self {
            Self::One => 0u8,
            Self::Hundred => 1,
        }
        .write(hasher);
    }
}

impl Canonical for DefaultZones {
    fn write(&self, hasher: &mut Sha256) {
        let Self {
            start_line_length,
            turnpoint,
            assigned_area,
            finish,
        } = self;
        start_line_length.write(hasher);
        turnpoint.write(hasher);
        assigned_area.write(hasher);
        finish.write(hasher);
    }
}

impl Canonical for ObservationZone {
    fn write(&self, hasher: &mut Sha256) {
        let Self {
            r1,
            a1,
            r2,
            a2,
            orientation,
        } = self;
        r1.write(hasher);
        a1.write(hasher);
        r2.write(hasher);
        a2.write(hasher);
        orientation.write(hasher);
    }
}

impl Canonical for Orientation {
    fn write(&self, hasher: &mut Sha256) {
        match self {
            Self::Symmetric => 0u8.write(hasher),
            Self::Fixed(bearing) => {
                1u8.write(hasher);
                bearing.write(hasher);
            }
            Self::Previous => 2u8.write(hasher),
            Self::Next => 3u8.write(hasher),
        }
    }
}
