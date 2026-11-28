//! When a track enters and leaves a two-arc observation zone, and how close
//! it comes when it misses.
//!
//! All geometry happens on a flat map centred on the zone's reference point.
//! Each fix is placed on it by its exact geodesic distance and azimuth from
//! the reference point, which is called an azimuthal equidistant projection.
//! On this map, the zone's arcs are exact circles and its edges are exact
//! straight lines from the centre, so the rest of the work is plain flat
//! geometry. The line between two fixes is drawn as a straight line on the
//! map. Within 20 km of the reference point, it differs from the geodesic
//! between the fixes by only a millimetre or two.

use std::mem;

use jiff::Timestamp;

use super::Record;
use super::flat_estimate::FlatEstimate;
use crate::flat::{Point, Segment};
use crate::geodesy::{EarthModel, LngLat, normalize_bearing};
use crate::task::TwoArcZone;

/// A two-arc zone at its reference point, turned to point into the task.
#[derive(Debug, Clone)]
pub struct PlacedZone {
    earth_model: EarthModel,
    reference_point: LngLat,
    /// The bearing that the zone's sectors are centred on, in degrees. It
    /// points away from the task, opposite the resolved bearing.
    axis: f64,
    /// The zone as one or two annular sectors, whose union is the zone.
    sectors: Vec<AnnularSector>,
}

/// Something that happened between a track and a zone.
#[derive(Debug)]
pub enum ZoneEvent<'a> {
    Visit(ZoneVisit<'a>),
    NearMiss(NearMiss<'a>),
}

/// A stretch of the track inside the zone, from where it enters to where it
/// leaves.
#[derive(Debug)]
pub struct ZoneVisit<'a> {
    /// Where the track enters, or `None` when it starts inside.
    pub entry: Option<ZoneCrossing<'a>>,
    /// Where the track leaves, or `None` when it ends inside.
    pub exit: Option<ZoneCrossing<'a>>,
}

/// The point where the line between two consecutive valid fixes meets the
/// zone's boundary.
#[derive(Debug)]
pub struct ZoneCrossing<'a> {
    /// The unrounded instant, interpolated linearly in time along the line
    /// between the fixes.
    pub time: Timestamp,
    pub fix_before: &'a Record,
    /// The fix after an entry is the first fix that counts for the zone,
    /// even when it lies outside because only the line reaches the zone.
    pub fix_after: &'a Record,
}

/// A stretch of the track that comes within the tolerance of the zone
/// without reaching it.
#[derive(Debug)]
pub struct NearMiss<'a> {
    /// The first fix of the first line within the tolerance.
    pub first_fix: &'a Record,
    /// The last fix of the last line within the tolerance.
    pub last_fix: &'a Record,
    /// The fix of the stretch that is closest to the zone.
    pub nearest_fix: &'a Record,
    /// The distance from `nearest_fix` to the zone, in km.
    pub nearest_fix_distance: f64,
    /// The two fixes of the line that comes closest to the zone.
    pub nearest_line: [&'a Record; 2],
    /// The distance from that line to the zone, in km.
    pub nearest_line_distance: f64,
}

/// The visits of a track to `zone`, and its near misses when a `tolerance`
/// in km is given, in time order. Only valid fixes count, and the track runs
/// straight between consecutive ones.
pub fn zone_visits<'a>(
    records: &'a [Record],
    zone: &PlacedZone,
    tolerance: Option<f64>,
) -> Vec<ZoneEvent<'a>> {
    let fixes = track_fixes(records, zone, tolerance.unwrap_or(0.));
    let mut track = TrackState {
        tolerance,
        ..TrackState::default()
    };
    if let Some(TrackFix { map: Some(map), .. }) = fixes.first()
        && zone.contains_map_position(map)
    {
        track.position = Position::InsideSinceStart;
    }
    for [from, to] in fixes.array_windows() {
        track.add_line(zone, from, to);
    }
    track.finish()
}

/// A valid fix with its place on the zone's map, or `None` when the fix and
/// both lines next to it are clearly too far from the zone to matter.
struct TrackFix<'a> {
    record: &'a Record,
    map: Option<MapPosition>,
}

/// Finds the valid fixes and places those on the map that can matter. A
/// quick flat estimate first rules out the lines that are clearly further
/// than `tolerance` from the zone, so that the slower geodesic calculation
/// only runs for fixes near it.
fn track_fixes<'a>(records: &'a [Record], zone: &PlacedZone, tolerance: f64) -> Vec<TrackFix<'a>> {
    let estimate = FlatEstimate::new(zone.earth_model, zone.reference_point);
    let reach = zone.outer_radius() + tolerance;
    let valid_fixes = records.iter().filter_map(|record| {
        let fix = record.fix().filter(|fix| fix.valid)?;
        let position = fix.position();
        Some((record, position, estimate.project(position)))
    });
    let valid_fixes: Vec<_> = valid_fixes.collect();

    // A fix needs its exact place when it is the only fix, or when a line
    // next to it may come within reach.
    let mut needed = vec![valid_fixes.len() == 1; valid_fixes.len()];
    for (index, [(_, _, from), (_, _, to)]) in valid_fixes.array_windows().enumerate() {
        let closest = Segment::new(from.point, to.point).distance_to_point(Point::ORIGIN);
        if closest - from.margin.max(to.margin) <= reach {
            needed[index] = true;
            needed[index + 1] = true;
        }
    }

    let fixes = valid_fixes.into_iter().zip(needed);
    let fixes = fixes.map(|((record, position, _), needed)| TrackFix {
        record,
        map: needed.then(|| zone.map_position(position)),
    });
    fixes.collect()
}

/// What `zone_visits()` has found so far while walking along the track.
#[derive(Default)]
struct TrackState<'a> {
    tolerance: Option<f64>,
    events: Vec<ZoneEvent<'a>>,
    position: Position<'a>,
    /// The near miss the track is in, or `None` when it is not within the
    /// tolerance.
    near_miss: Option<NearMiss<'a>>,
    /// Whether the current run of lines within the tolerance reaches the
    /// zone, which makes it no near miss.
    reached: bool,
}

impl<'a> TrackState<'a> {
    fn add_line(&mut self, zone: &PlacedZone, from: &TrackFix<'a>, to: &TrackFix<'a>) {
        let (Some(from_map), Some(to_map)) = (&from.map, &to.map) else {
            self.end_run();
            return;
        };

        let intervals = zone.line_intervals(from_map, to_map);
        if intervals.is_empty() {
            self.add_line_outside(zone, from, to, from_map, to_map);
            return;
        }

        self.near_miss = None;
        self.reached = true;
        let gap = to.record.time.duration_since(from.record.time);
        let crossing = |t: f64| ZoneCrossing {
            time: from.record.time + gap.mul_f64(t),
            fix_before: from.record,
            fix_after: to.record,
        };
        for [start, end] in intervals {
            let continues_visit = start == 0. && !matches!(self.position, Position::Outside);
            if !continues_visit {
                self.position = Position::Entered(crossing(start));
            }
            if end < 1. {
                let entry = mem::take(&mut self.position).entry();
                let exit = Some(crossing(end));
                let visit = ZoneVisit { entry, exit };
                self.events.push(ZoneEvent::Visit(visit));
            }
        }
    }

    /// Adds a line that does not reach the zone to the current run, which
    /// starts a near miss unless the run reaches the zone, or ends the run
    /// when the line is beyond the tolerance.
    fn add_line_outside(
        &mut self,
        zone: &PlacedZone,
        from: &TrackFix<'a>,
        to: &TrackFix<'a>,
        from_map: &MapPosition,
        to_map: &MapPosition,
    ) {
        let Some(tolerance) = self.tolerance else {
            return;
        };
        let line = Segment::new(from_map.point, to_map.point);
        let distance = zone.line_distance_from_outside(line);
        if distance > tolerance {
            self.end_run();
            return;
        }
        if self.reached {
            return;
        }

        let near_miss = self.near_miss.get_or_insert_with(|| NearMiss {
            first_fix: from.record,
            last_fix: from.record,
            nearest_fix: from.record,
            nearest_fix_distance: zone.map_distance(from_map),
            nearest_line: [from.record, to.record],
            nearest_line_distance: distance,
        });
        near_miss.last_fix = to.record;
        let to_distance = zone.map_distance(to_map);
        if to_distance < near_miss.nearest_fix_distance {
            near_miss.nearest_fix = to.record;
            near_miss.nearest_fix_distance = to_distance;
        }
        if distance < near_miss.nearest_line_distance {
            near_miss.nearest_line = [from.record, to.record];
            near_miss.nearest_line_distance = distance;
        }
    }

    fn end_run(&mut self) {
        self.reached = false;
        if let Some(near_miss) = self.near_miss.take() {
            self.events.push(ZoneEvent::NearMiss(near_miss));
        }
    }

    fn finish(mut self) -> Vec<ZoneEvent<'a>> {
        self.end_run();
        let position = mem::take(&mut self.position);
        if !matches!(position, Position::Outside) {
            let visit = ZoneVisit {
                entry: position.entry(),
                exit: None,
            };
            self.events.push(ZoneEvent::Visit(visit));
        }
        self.events
    }
}

/// Where the track is relative to the zone while `zone_visits()` walks
/// along it.
#[derive(Default)]
enum Position<'a> {
    #[default]
    Outside,
    /// Inside, after entering at this crossing.
    Entered(ZoneCrossing<'a>),
    /// Inside since the first fix, so without an entry.
    InsideSinceStart,
}

impl<'a> Position<'a> {
    fn entry(self) -> Option<ZoneCrossing<'a>> {
        match self {
            Self::Entered(entry) => Some(entry),
            Self::Outside | Self::InsideSinceStart => None,
        }
    }
}

impl PlacedZone {
    /// Places `shape` at `reference_point`, with `bearing` as its resolved
    /// bearing in degrees, which points into the task.
    pub fn new(
        earth_model: EarthModel,
        reference_point: LngLat,
        bearing: f64,
        shape: TwoArcZone,
    ) -> Self {
        let TwoArcZone { r1, a1, r2, a2 } = shape;
        let mut sectors = Vec::new();
        // The R1 sector without the R2 disc. Its edges and the R2 circle
        // belong to it, so it touches the R2 sector below. Like that sector,
        // it needs an angle and a width to hold a real area.
        if a1 > 0. && r1 > r2 {
            sectors.push(AnnularSector {
                inner_radius: r2,
                outer_radius: r1,
                half_angle: a1,
            });
        }
        // A half angle of zero would leave a lone line from the reference
        // point, which a track could cross without entering a real area.
        if r2 > 0. && a2 > 0. {
            sectors.push(AnnularSector {
                inner_radius: 0.,
                outer_radius: r2,
                half_angle: a2,
            });
        }
        Self {
            earth_model,
            reference_point,
            axis: normalize_bearing(bearing + 180.),
            sectors,
        }
    }

    /// Whether `position` lies inside the zone or on its boundary.
    pub fn contains(&self, position: LngLat) -> bool {
        self.contains_map_position(&self.map_position(position))
    }

    /// The distance from `position` to the nearest point of the zone, in
    /// km, which is zero inside.
    pub fn distance(&self, position: LngLat) -> f64 {
        self.map_distance(&self.map_position(position))
    }

    /// The distance from the straight line between two positions to the
    /// nearest point of the zone, in km, which is zero when the line reaches
    /// the zone.
    pub fn line_distance(&self, from: LngLat, to: LngLat) -> f64 {
        let from = self.map_position(from);
        let to = self.map_position(to);
        if self.line_intervals(&from, &to).is_empty() {
            self.line_distance_from_outside(Segment::new(from.point, to.point))
        } else {
            0.
        }
    }

    fn map_position(&self, position: LngLat) -> MapPosition {
        let (distance, azimuth) = self
            .earth_model
            .distance_and_azimuth(self.reference_point, position);
        // The angle from the axis, in [-180°, 180°), positive to the right.
        let angle = normalize_bearing(azimuth - self.axis + 180.) - 180.;
        let (sin, cos) = angle.to_radians().sin_cos();
        MapPosition {
            point: Point::new(distance * sin, distance * cos),
            distance,
            // Taken straight from the azimuth rather than from the rounded
            // point, so that a fix exactly on an edge counts as inside.
            angle: angle.abs(),
        }
    }

    fn contains_map_position(&self, position: &MapPosition) -> bool {
        let mut sectors = self.sectors.iter();
        sectors.any(|sector| sector.contains_polar(position.distance, position.angle))
    }

    fn map_distance(&self, position: &MapPosition) -> f64 {
        if self.contains_map_position(position) {
            return 0.;
        }
        let sectors = self.sectors.iter();
        let distances = sectors.map(|s| s.boundary_distance(position.point));
        distances.fold(f64::INFINITY, f64::min)
    }

    /// The parts of the line between two positions that lie in the zone, as
    /// ranges of the fraction of the way from `from` to `to`, in order. A
    /// range can be a single point where the line only touches the zone.
    fn line_intervals(&self, from: &MapPosition, to: &MapPosition) -> Vec<[f64; 2]> {
        let line = Segment::new(from.point, to.point);
        // The line can only enter or leave the zone where it crosses one of
        // the boundary circles or one of the lines that the edges lie on.
        // Between two such crossings, it is either inside or outside all the
        // way, so testing the midpoint is enough.
        let mut fractions = vec![0., 1.];
        for sector in &self.sectors {
            for radius in [sector.inner_radius, sector.outer_radius] {
                fractions.extend(line.circle_crossings(radius).into_iter().flatten());
            }
            for edge in sector.edge_directions() {
                fractions.extend(line.line_through_centre_crossing(edge));
            }
        }
        fractions.retain(|t| (0. ..=1.).contains(t));
        fractions.sort_by(f64::total_cmp);
        fractions.dedup();

        let inside_at = |t: f64| {
            let point = line.point_at(t);
            self.sectors.iter().any(|sector| sector.contains(point))
        };
        let mut intervals: Vec<[f64; 2]> = Vec::new();
        let mut add = |start: f64, end: f64| match intervals.last_mut() {
            Some(last) if last[1] >= start => last[1] = last[1].max(end),
            _ => intervals.push([start, end]),
        };
        let last = fractions.len() - 1;
        for (index, &t) in fractions.iter().enumerate() {
            // The fixes themselves use their exact place, so that the line
            // before and the line after a fix agree on whether it is inside.
            let inside = match index {
                0 => self.contains_map_position(from),
                _ if index == last => self.contains_map_position(to),
                _ => inside_at(t),
            };
            if inside {
                add(t, t);
            }
            if let Some(&next) = fractions.get(index + 1)
                && inside_at(f64::midpoint(t, next))
            {
                // The boundary belongs to the zone, so the part runs from
                // crossing to crossing.
                add(t, next);
            }
        }
        intervals
    }

    /// The distance from a line that does not reach the zone to the zone.
    fn line_distance_from_outside(&self, line: Segment) -> f64 {
        let distances = self.sectors.iter().map(|s| s.line_boundary_distance(line));
        distances.fold(f64::INFINITY, f64::min)
    }

    /// The furthest any point of the zone lies from the reference point.
    fn outer_radius(&self) -> f64 {
        let radii = self.sectors.iter().map(|sector| sector.outer_radius);
        radii.fold(0., f64::max)
    }
}

/// A fix's place on the zone's map, with its exact polar coordinates.
struct MapPosition {
    /// In km from the reference point, with the zone's axis along positive
    /// `y` and positive `x` to its right.
    point: Point,
    /// The distance from the reference point, in km.
    distance: f64,
    /// The angle from the zone's axis to the fix, in degrees in [0°, 180°].
    angle: f64,
}

/// The part of a ring between two radii in km that lies within `half_angle`
/// degrees either side of the zone's axis, with its boundary. It is a full
/// ring when the half angle is 180°, and a sector of a disc when the inner
/// radius is zero.
#[derive(Debug, Clone, Copy)]
struct AnnularSector {
    inner_radius: f64,
    outer_radius: f64,
    half_angle: f64,
}

impl AnnularSector {
    fn contains(self, point: Point) -> bool {
        self.contains_polar(point.length(), angle_from_axis(point))
    }

    fn contains_polar(self, distance: f64, angle: f64) -> bool {
        let within_radii = self.inner_radius <= distance && distance <= self.outer_radius;
        // The reference point has no real angle, and it is the tip of every
        // sector that reaches it.
        within_radii && (distance == 0. || self.within_angle(angle))
    }

    fn within_angle(self, angle: f64) -> bool {
        self.half_angle >= 180. || angle <= self.half_angle
    }

    /// The unit directions of the two straight edges, left and right of the
    /// axis, or none for a full ring.
    fn edge_directions(self) -> impl Iterator<Item = Point> {
        let (sin, cos) = self.half_angle.to_radians().sin_cos();
        let directions = [Point::new(-sin, cos), Point::new(sin, cos)];
        let directions = (self.half_angle < 180.).then_some(directions);
        directions.into_iter().flatten()
    }

    /// The arcs of the boundary, as their radii. The inner arc is left out
    /// when it has shrunk to the reference point.
    fn arc_radii(self) -> impl Iterator<Item = f64> {
        let inner = Some(self.inner_radius).filter(|&radius| radius > 0.);
        inner.into_iter().chain([self.outer_radius])
    }

    /// The straight edges of the boundary, as their two ends, or none for a
    /// full ring.
    fn edges(self) -> impl Iterator<Item = Segment> {
        let edge =
            move |d: Point| Segment::new(d.scale(self.inner_radius), d.scale(self.outer_radius));
        self.edge_directions().map(edge)
    }

    /// The ends of the arc of the given radius, or none for a full ring.
    fn arc_ends(self, radius: f64) -> impl Iterator<Item = Point> {
        self.edge_directions().map(move |d| d.scale(radius))
    }

    /// The distance from a point outside to the boundary.
    fn boundary_distance(self, point: Point) -> f64 {
        let radii = self.arc_radii();
        let arcs = radii.map(|radius| self.arc_distance(point, radius));
        let edges = self.edges().map(|edge| edge.distance_to_point(point));
        arcs.chain(edges).fold(f64::INFINITY, f64::min)
    }

    /// The distance from a point to the arc of the given radius.
    fn arc_distance(self, point: Point, radius: f64) -> f64 {
        if self.within_angle(angle_from_axis(point)) {
            return (point.length() - radius).abs();
        }
        // Outside the arc's angle, the nearest point of the arc is one of
        // its ends.
        let ends = self.arc_ends(radius).map(|end| point.distance(end));
        ends.fold(f64::INFINITY, f64::min)
    }

    /// The distance from a line that does not reach the sector to its
    /// boundary.
    fn line_boundary_distance(self, line: Segment) -> f64 {
        let radii = self.arc_radii();
        let arcs = radii.map(|radius| self.line_arc_distance(line, radius));
        let edges = self.edges().map(|edge| line.distance_to_segment(edge));
        arcs.chain(edges).fold(f64::INFINITY, f64::min)
    }

    /// The distance from a line to the arc of the given radius.
    ///
    /// Along the line, the distance to the arc only has its smallest value
    /// at one of a few places: an end of the line, the point closest to the
    /// reference point, a point on the circle, or where the line passes an
    /// edge direction and the nearest point of the arc switches between the
    /// arc's middle and its ends. Near an end of the arc, the nearest point
    /// of the line to that end is a candidate too.
    fn line_arc_distance(self, line: Segment, radius: f64) -> f64 {
        let mut fractions = vec![0., 1., line.closest_fraction(Point::ORIGIN)];
        fractions.extend(line.circle_crossings(radius).into_iter().flatten());
        for edge in self.edge_directions() {
            fractions.extend(line.line_through_centre_crossing(edge));
        }
        let fractions = fractions.into_iter().filter(|t| (0. ..=1.).contains(t));
        let along_line = fractions.map(|t| self.arc_distance(line.point_at(t), radius));
        let ends = self.arc_ends(radius).map(|end| line.distance_to_point(end));
        along_line.chain(ends).fold(f64::INFINITY, f64::min)
    }
}

/// The angle on the zone's map from the zone's axis to `point`, in degrees
/// in [0°, 180°].
fn angle_from_axis(point: Point) -> f64 {
    point.x.abs().atan2(point.y).to_degrees()
}
