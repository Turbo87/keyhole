//! Tasks and their observation zones.

use std::iter;

use jiff::SignedDuration;

use crate::geodesy::{EarthModel, LngLat};

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
/// copied from the turnpoint file.
#[derive(Debug, Clone, PartialEq)]
pub struct TaskPoint<D> {
    pub reference_point: LngLat,
    pub direction: D,
    pub zone: ObservationZone,
}

/// Which way a task point's observation zone points.
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

    /// How much the zone shortens each task leg it touches, in km.
    fn reduction(&self) -> f64 {
        match *self {
            Self::TwoArc { r1, reduce, .. } if reduce => r1,
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

    fn task_points(&self) -> impl Iterator<Item = &TaskPoint<D>> {
        iter::once(&self.start)
            .chain(&self.turnpoints)
            .chain(iter::once(&self.finish))
    }
}
