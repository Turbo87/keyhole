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

/// Where a position lies relative to a line through a reference point,
/// perpendicular to a bearing, in km. `s` is the geodesic distance from the
/// reference point and `Δaz` the azimuth at the reference point minus the
/// bearing.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LineOffset {
    /// `s·cos(Δaz)`, negative behind the line and otherwise in front of it.
    pub across: f64,
    /// `s·sin(Δaz)`, positive to the right of the bearing.
    pub along: f64,
}

/// The radii of curvature of an earth model at a latitude, in km.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RadiiOfCurvature {
    /// Along the meridian.
    pub meridional: f64,
    /// Along the east-west direction, perpendicular to the meridian.
    pub normal: f64,
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

    /// Where `position` lies relative to the line through `reference_point`
    /// perpendicular to `bearing`, in degrees.
    pub fn line_offset(
        self,
        reference_point: LngLat,
        bearing: f64,
        position: LngLat,
    ) -> LineOffset {
        let (from, to) = (reference_point, position);
        let geodesic = self.geodesic();
        let (metres, azimuth, _, _): (f64, f64, f64, f64) =
            geodesic.inverse(from.latitude, from.longitude, to.latitude, to.longitude);
        // Reduced to [-180°, 180°), ±90° has a cosine just above zero, so a
        // position on the line lies in front of it.
        let delta = normalize_bearing(azimuth - bearing + 180.) - 180.;
        let (sin, cos) = delta.to_radians().sin_cos();
        let km = metres / 1000.;
        LineOffset {
            across: km * cos,
            along: km * sin,
        }
    }

    /// The radii of curvature at `latitude`.
    pub fn radii_of_curvature(self, latitude: f64) -> RadiiOfCurvature {
        let Geodesic { a, f, .. } = *self.geodesic();
        let e2 = f * (2. - f);
        let w = (1. - e2 * latitude.to_radians().sin().powi(2)).sqrt();
        let normal = a / w / 1000.;
        let meridional = normal * (1. - e2) / (w * w);
        RadiiOfCurvature { meridional, normal }
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
