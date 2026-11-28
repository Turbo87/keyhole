//! Tasks and their observation zones.

use std::iter;

use jiff::SignedDuration;

use crate::geodesy::{EarthModel, LngLat, normalize_bearing};

/// A task with its start, turnpoints and finish, where `D` is each point's
/// direction: an `Orientation` as entered, or a bearing in degrees once
/// resolved.
#[derive(Debug, Clone, PartialEq)]
pub struct Task<D> {
    pub kind: TaskKind,
    pub start: TaskPoint<D>,
    pub turnpoints: Vec<TaskPoint<D>>,
    pub finish: TaskPoint<D>,
    pub earth_model: EarthModel,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TaskKind {
    Racing,
    AssignedArea { minimum_task_time: SignedDuration },
}

/// The start, a turnpoint or the finish of a task, with the reference point
/// copied from the waypoint file.
#[derive(Debug, Clone, PartialEq)]
pub struct TaskPoint<D> {
    pub reference_point: LngLat,
    pub direction: D,
    pub zone: ObservationZone,
}

/// Which way a task point's observation zone points, which resolving a task
/// turns into a bearing at the reference point that points into the task.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Orientation {
    Symmetric,
    Previous,
    Next,
    /// A bearing in degrees.
    Fixed(f64),
}

/// The area or line around a reference point that a flight has to reach or
/// cross, with every distance in km and every angle in degrees.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ObservationZone {
    Line {
        length: f64,
    },
    TwoArc {
        shape: TwoArcZone,
        /// Whether the zone shortens each task leg it touches by its R1.
        reduce: bool,
    },
}

/// SeeYou's zone of the R1 sector of half angle A1, minus the R2 disc, plus
/// the R2 sector of half angle A2, with every distance in km and every angle
/// in degrees.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TwoArcZone {
    pub r1: f64,
    pub a1: f64,
    pub r2: f64,
    pub a2: f64,
}

impl TwoArcZone {
    /// A cylinder of the given radius.
    pub const fn cylinder(radius: f64) -> Self {
        Self {
            r1: radius,
            a1: 180.,
            r2: 0.,
            a2: 0.,
        }
    }

    /// The DAeC keyhole: a 10 km sector with a half angle of 45°, joined with a
    /// 0.5 km cylinder.
    pub const fn daec_keyhole() -> Self {
        Self {
            r1: 10.,
            a1: 45.,
            r2: 0.5,
            a2: 180.,
        }
    }
}

impl ObservationZone {
    /// A two-arc zone shaped as a cylinder of the given radius.
    pub const fn cylinder(radius: f64, reduce: bool) -> Self {
        let shape = TwoArcZone::cylinder(radius);
        Self::TwoArc { shape, reduce }
    }

    /// The DAeC keyhole: a 10 km sector with a half angle of 45°, joined with a
    /// 0.5 km cylinder.
    pub const fn daec_keyhole() -> Self {
        let shape = TwoArcZone::daec_keyhole();
        Self::TwoArc {
            shape,
            reduce: false,
        }
    }

    /// How much the zone shortens each task leg it touches, in km.
    fn reduction(&self) -> f64 {
        match *self {
            Self::TwoArc { shape, reduce } if reduce => shape.r1,
            _ => 0.,
        }
    }
}

impl<D> Task<D> {
    /// The task distance in km: the sum of the geodesic legs between the
    /// reference points, each shortened by the reductions of its zones and
    /// counted as zero when they exceed it.
    pub fn distance(&self) -> f64 {
        if matches!(self.kind, TaskKind::AssignedArea { .. }) {
            todo!("the distance of an assigned area task");
        }

        let earth_model = self.earth_model;
        let legs = self.task_points().zip(self.task_points().skip(1));
        legs.map(|(from, to)| {
            let length = earth_model.distance(from.reference_point, to.reference_point);
            (length - from.zone.reduction() - to.zone.reduction()).max(0.)
        })
        .sum()
    }

    /// The start, turnpoints and finish in order.
    pub fn task_points(&self) -> impl Iterator<Item = &TaskPoint<D>> {
        iter::once(&self.start)
            .chain(&self.turnpoints)
            .chain(iter::once(&self.finish))
    }
}

/// Why a task cannot be resolved.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum TaskError {
    /// The orientation of the task point at this index, counted from the
    /// start at 0, is symmetric or previous at the start, symmetric or next at
    /// the finish or a fixed bearing outside [0°, 360°).
    #[error("the orientation of the task point at index {point_index} cannot be resolved")]
    Orientation { point_index: usize },
}

impl Task<Orientation> {
    /// Replaces every orientation with a bearing in degrees, so that the line
    /// and zone geometry never needs the neighbouring task points.
    ///
    /// Every course is the geodesic azimuth at the reference point. A start
    /// points toward the next point and a finish toward the previous point. A
    /// symmetric turnpoint points along the inner bisector of its courses to
    /// the previous and next point, or the incoming course plus 90° when they
    /// are exactly opposite.
    pub fn resolve(&self) -> Result<Task<f64>, TaskError> {
        let earth_model = self.earth_model;
        let previous = iter::once(None).chain(self.task_points().map(Some));
        let next = self.task_points().skip(1).map(Some).chain(iter::once(None));
        let neighbours = self.task_points().zip(previous.zip(next)).enumerate();
        let resolved = neighbours.map(|(point_index, (point, (previous, next)))| {
            let from = point.reference_point;
            let course = |to: &TaskPoint<_>| earth_model.azimuth(from, to.reference_point);
            let bearing = bearing(point.direction, previous.map(course), next.map(course));
            Ok(TaskPoint {
                reference_point: point.reference_point,
                direction: bearing.ok_or(TaskError::Orientation { point_index })?,
                zone: point.zone,
            })
        });

        let mut resolved = resolved.collect::<Result<Vec<_>, _>>()?.into_iter();
        let start = resolved.next().expect("a task has a start");
        let finish = resolved.next_back().expect("a task has a finish");
        Ok(Task {
            kind: self.kind.clone(),
            start,
            turnpoints: resolved.collect(),
            finish,
            earth_model,
        })
    }
}

/// The bearing of an orientation given the courses to the previous and next
/// point, which the start and finish lack on one side.
fn bearing(
    orientation: Orientation,
    to_previous: Option<f64>,
    to_next: Option<f64>,
) -> Option<f64> {
    use Orientation::*;
    match (orientation, to_previous, to_next) {
        (Fixed(bearing), _, _) => (0.0..360.).contains(&bearing).then_some(bearing),
        (Previous, Some(course), _) | (Next, _, Some(course)) => Some(course),
        (Symmetric, Some(to_previous), Some(to_next)) => Some(bisector(to_previous, to_next)),
        _ => None,
    }
}

/// The bearing of a symmetric turnpoint, as `Task::resolve()` describes it.
fn bisector(to_previous: f64, to_next: f64) -> f64 {
    let turn = normalize_bearing(to_next - to_previous);
    let offset = match turn {
        180. => 270.,
        ..180. => turn / 2.,
        _ => (turn - 360.) / 2.,
    };
    normalize_bearing(to_previous + offset)
}
