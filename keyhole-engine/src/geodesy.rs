//! Positions and geodesic measurements on an earth model.

use std::sync::LazyLock;

use geographiclib_rs::{Geodesic, InverseGeodesic};

/// The radius of the FAI Sphere, in km.
pub const FAI_SPHERE_RADIUS: f64 = 6371.;

/// The shape of the Earth that distances and observation zones are calculated
/// on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EarthModel {
    Wgs84,
    /// A sphere with a radius of `FAI_SPHERE_RADIUS`.
    FaiSphere,
}

/// A position in degrees, positive to the east and north.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LngLat {
    pub longitude: f64,
    pub latitude: f64,
}

impl EarthModel {
    /// The geodesic distance between two positions, in km.
    pub fn distance(self, from: LngLat, to: LngLat) -> f64 {
        let geodesic = self.geodesic();
        let metres: f64 =
            geodesic.inverse(from.latitude, from.longitude, to.latitude, to.longitude);
        metres / 1000.
    }

    /// The azimuth at `from` of the geodesic to `to`, in degrees clockwise
    /// from north in [0°, 360°).
    pub fn azimuth(self, from: LngLat, to: LngLat) -> f64 {
        let geodesic = self.geodesic();
        let (azimuth, _, _): (f64, f64, f64) =
            geodesic.inverse(from.latitude, from.longitude, to.latitude, to.longitude);
        normalize_bearing(azimuth)
    }

    fn geodesic(self) -> &'static Geodesic {
        static WGS84: LazyLock<Geodesic> = LazyLock::new(Geodesic::wgs84);
        static FAI_SPHERE: LazyLock<Geodesic> =
            LazyLock::new(|| Geodesic::new(FAI_SPHERE_RADIUS * 1000., 0.));
        match self {
            Self::Wgs84 => &WGS84,
            Self::FaiSphere => &FAI_SPHERE,
        }
    }
}

/// Wraps an angle in degrees into [0°, 360°).
pub fn normalize_bearing(degrees: f64) -> f64 {
    let bearing = degrees.rem_euclid(360.);
    // `rem_euclid()` rounds a tiny negative angle up to 360°.
    if bearing == 360. { 0. } else { bearing }
}
