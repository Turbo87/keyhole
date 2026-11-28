//! A quick, approximate way to place positions on a flat map around a
//! reference point.
//!
//! Exact distances on the Earth need a geodesic calculation, which is slow.
//! Near the reference point, the Earth is almost flat, so a flat map gives
//! nearly the same answer much faster. Each projected position comes with a
//! margin that says how wrong the flat map can be, so callers can use it to
//! skip fixes that are clearly too far away and only run the exact
//! calculation for the rest.

use crate::flat::Point;
use crate::geodesy::{EarthModel, FAI_SPHERE_RADIUS, LngLat, normalize_bearing};

/// A flat map that touches the Earth at a reference point, with `x` to the
/// east and `y` to the north, in km.
pub struct FlatEstimate {
    reference_point: LngLat,
    /// The km per degree of longitude at the reference point.
    km_per_degree_longitude: f64,
    /// The km per degree of latitude at the reference point.
    km_per_degree_latitude: f64,
    /// How fast the error of the flat map grows: the error is at most this
    /// factor times the squared distance from the reference point.
    curvature: f64,
}

/// A position on the flat map.
#[derive(Debug, Clone, Copy)]
pub struct FlatPosition {
    pub point: Point,
    /// The most that this flat position can be off from the exact one, in
    /// km. The exact one is the point at the position's geodesic distance
    /// and azimuth from the reference point.
    pub margin: f64,
}

impl FlatEstimate {
    pub fn new(earth_model: EarthModel, reference_point: LngLat) -> Self {
        let latitude = reference_point.latitude.to_radians();
        let radii = earth_model.radii_of_curvature(reference_point.latitude);
        // Measured on both earth models up to 84° latitude, the error stays
        // below `(1 + tan|φ|)/R·d²`, where φ is the latitude, R the Earth's
        // radius and d the distance. Doubling it leaves a safety margin.
        let curvature = 2. * (1. + latitude.tan().abs()) / FAI_SPHERE_RADIUS;
        Self {
            reference_point,
            km_per_degree_longitude: (radii.normal * latitude.cos()).to_radians(),
            km_per_degree_latitude: radii.meridional.to_radians(),
            curvature,
        }
    }

    /// Places `position` on the flat map.
    pub fn project(&self, position: LngLat) -> FlatPosition {
        let longitude =
            normalize_bearing(position.longitude - self.reference_point.longitude + 180.) - 180.;
        let latitude = position.latitude - self.reference_point.latitude;
        let point = Point::new(
            longitude * self.km_per_degree_longitude,
            latitude * self.km_per_degree_latitude,
        );
        // The extra 1 m covers floating-point rounding, which dominates close
        // to the reference point.
        let margin = self.curvature * point.dot(point) + 0.001;
        FlatPosition { point, margin }
    }
}
