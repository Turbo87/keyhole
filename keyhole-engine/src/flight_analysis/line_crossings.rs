//! Forward crossings of start and finish lines.

use jiff::Timestamp;

use super::Record;
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
    let valid_fixes = records.iter().filter_map(|record| {
        let fix = record.fix().filter(|fix| fix.valid)?;
        let position = LngLat {
            longitude: fix.longitude,
            latitude: fix.latitude,
        };
        Some((
            record,
            earth_model.line_offset(reference_point, bearing, position),
        ))
    });
    let valid_fixes: Vec<_> = valid_fixes.collect();
    let pairs = valid_fixes.array_windows();
    let crossings = pairs.filter(|[(_, from), (_, to)]| from.across < 0. && to.across >= 0.);
    let crossings = crossings.map(|&[(fix_before, from), (fix_after, to)]| {
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
