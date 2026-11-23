//! Forward crossings of start and finish lines.

use std::ops::RangeInclusive;

use jiff::Timestamp;

use super::Record;
use crate::geodesy::{EarthModel, FAI_SPHERE_RADIUS, LngLat, normalize_bearing};

/// A crossing of a start or finish line from behind to in front by the line
/// between two consecutive valid fixes.
#[derive(Debug)]
pub struct LineCrossing<'a> {
    /// The unrounded instant, interpolated linearly in the distance across
    /// the line.
    pub time: Timestamp,
    /// The valid fix behind the line.
    pub fix_before: &'a Record,
    /// The next valid fix, in front of or on the line.
    pub fix_after: &'a Record,
    /// The distance from the reference point along the line at the crossing,
    /// in km, whatever the line's length.
    pub along: f64,
}

/// The forward crossings of the line through `reference_point` perpendicular
/// to `bearing`, in time order. A forward crossing flies over the line in the
/// direction of `bearing`, in degrees.
pub fn line_crossings<'a>(
    records: &'a [Record],
    earth_model: EarthModel,
    reference_point: LngLat,
    bearing: f64,
) -> Vec<LineCrossing<'a>> {
    let line = FlatLine::new(earth_model, reference_point, bearing);
    let valid_fixes = records.iter().filter_map(|record| {
        let fix = record.fix().filter(|fix| fix.valid)?;
        let position = LngLat {
            longitude: fix.longitude,
            latitude: fix.latitude,
        };
        Some((record, position, line.across(position)))
    });
    let valid_fixes: Vec<_> = valid_fixes.collect();
    let pairs = valid_fixes.array_windows();
    let candidates =
        pairs.filter(|[(_, _, from), (_, _, to)]| *from.start() < 0. && *to.end() >= 0.);
    let offsets = candidates.map(|&[(fix_before, from, _), (fix_after, to, _)]| {
        let from = earth_model.line_offset(reference_point, bearing, from);
        let to = earth_model.line_offset(reference_point, bearing, to);
        (fix_before, from, fix_after, to)
    });
    let crossings = offsets.filter(|(_, from, _, to)| from.across < 0. && to.across >= 0.);
    let crossings = crossings.map(|(fix_before, from, fix_after, to)| {
        let fraction = from.across / (from.across - to.across);
        let gap = fix_after.time.duration_since(fix_before.time);
        let along = from.along + (to.along - from.along) * fraction;
        LineCrossing {
            time: fix_before.time + gap.mul_f64(fraction),
            fix_before,
            fix_after,
            along: along.abs(),
        }
    });
    crossings.collect()
}

/// The line on the plane tangent to the Earth at the reference point, which
/// bounds the across coordinate of a position without solving a geodesic.
struct FlatLine {
    reference_point: LngLat,
    /// The km per degree of longitude at the reference point.
    km_per_degree_longitude: f64,
    /// The km per degree of latitude at the reference point.
    km_per_degree_latitude: f64,
    sin_bearing: f64,
    cos_bearing: f64,
    /// The factor of the squared distance that bounds the flat estimate's
    /// error.
    curvature: f64,
}

impl FlatLine {
    fn new(earth_model: EarthModel, reference_point: LngLat, bearing: f64) -> Self {
        let latitude = reference_point.latitude.to_radians();
        let radii = earth_model.radii_of_curvature(reference_point.latitude);
        let (sin_bearing, cos_bearing) = bearing.to_radians().sin_cos();
        // On both earth models, the error measured up to 84° latitude stays
        // below `(1 + tan|φ|)/R·d²`, and the factor 2 adds headroom.
        let curvature = 2. * (1. + latitude.tan().abs()) / FAI_SPHERE_RADIUS;
        Self {
            reference_point,
            km_per_degree_longitude: (radii.normal * latitude.cos()).to_radians(),
            km_per_degree_latitude: radii.meridional.to_radians(),
            sin_bearing,
            cos_bearing,
            curvature,
        }
    }

    /// The range that the across coordinate of `position` lies in, in km.
    fn across(&self, position: LngLat) -> RangeInclusive<f64> {
        let longitude =
            normalize_bearing(position.longitude - self.reference_point.longitude + 180.) - 180.;
        let latitude = position.latitude - self.reference_point.latitude;
        let x = longitude * self.km_per_degree_longitude;
        let y = latitude * self.km_per_degree_latitude;
        let across = x * self.sin_bearing + y * self.cos_bearing;
        // The 1 m covers rounding close to the reference point.
        let margin = self.curvature * (x * x + y * y) + 0.001;
        across - margin..=across + margin
    }
}
