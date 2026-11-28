//! Forward crossings of start and finish lines.

use std::ops::RangeInclusive;

use jiff::Timestamp;

use super::Record;
use super::flat_estimate::FlatEstimate;
use crate::flat::Point;
use crate::geodesy::{EarthModel, LngLat};

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

/// The start or finish line drawn on a flat map around its reference point.
/// It quickly tells which side of the line a position is on, or that it is
/// too close to the line to tell without the exact geodesic calculation.
struct FlatLine {
    estimate: FlatEstimate,
    /// The unit direction of the bearing, across the line.
    bearing: Point,
}

impl FlatLine {
    fn new(earth_model: EarthModel, reference_point: LngLat, bearing: f64) -> Self {
        let (sin, cos) = bearing.to_radians().sin_cos();
        Self {
            estimate: FlatEstimate::new(earth_model, reference_point),
            bearing: Point::new(sin, cos),
        }
    }

    /// The range that the exact `LineOffset::across` of `position` lies in,
    /// in km: negative behind the line, otherwise in front of it.
    fn across(&self, position: LngLat) -> RangeInclusive<f64> {
        let position = self.estimate.project(position);
        let across = position.point.dot(self.bearing);
        across - position.margin..=across + position.margin
    }
}
