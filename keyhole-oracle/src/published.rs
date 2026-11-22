//! The values SoaringSpot publishes for a class day, as soaringspot-downloader
//! writes them to `task.json` and `results.csv`.

use anyhow::bail;
use jiff::SignedDuration;
use jiff::civil::Time;
use jiff::fmt::friendly::SpanPrinter;
use keyhole_engine::geodesy::{EarthModel, LngLat, normalize_bearing};
use keyhole_engine::task::{ObservationZone, Orientation, Task, TaskKind, TaskPoint};
use serde::Deserialize;

/// The part of `task.json` that day scoring uses.
#[derive(Debug, Deserialize)]
#[serde(tag = "task_type", rename_all = "snake_case")]
pub enum PublishedTask {
    AssignedArea {
        /// The minimum task time in seconds.
        task_duration: u32,
    },
    #[serde(rename = "polygon")]
    Racing(PublishedRacingTask),
    /// A task SoaringSpot names by the shape of its course, which is a racing
    /// task unless its task duration sets a minimum task time.
    #[serde(
        rename = "broken_leg",
        alias = "fai_triangle",
        alias = "unknown_triangle"
    )]
    CourseShape {
        #[serde(default)]
        task_duration: u32,
    },
}

impl PublishedTask {
    pub fn minimum_task_time(&self) -> Option<SignedDuration> {
        let task_duration = match *self {
            Self::AssignedArea { task_duration } => task_duration,
            Self::Racing(_) | Self::CourseShape { task_duration: 0 } => return None,
            Self::CourseShape { task_duration } => task_duration,
        };
        Some(SignedDuration::from_secs(task_duration.into()))
    }
}

/// The task of a `polygon` class day, which is the only kind of racing task that
/// the harness converts.
#[derive(Debug, Deserialize)]
pub struct PublishedRacingTask {
    /// In m, stored as a 32-bit float. It is the sum of the `distance` of
    /// every task point after the start.
    pub task_distance: f64,
    /// The start, turnpoints and finish, between a take-off and a landing on
    /// some class days.
    pub task_points: Vec<PublishedTaskPoint>,
}

#[derive(Debug, Deserialize)]
pub struct PublishedTaskPoint {
    #[serde(rename = "type")]
    pub role: PointRole,
    /// In radians.
    pub latitude: f64,
    /// In radians.
    pub longitude: f64,
    pub oz_type: PublishedOrientation,
    /// In m, half the length of a line.
    pub oz_radius1: f64,
    /// In m.
    pub oz_radius2: f64,
    /// In radians.
    pub oz_angle1: f64,
    /// In radians.
    pub oz_angle2: f64,
    /// The resolved bearing in radians.
    pub oz_angle12: f64,
    pub oz_line: bool,
    pub oz_reduce: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PointRole {
    Takeoff,
    Start,
    Point,
    Finish,
    Landing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PublishedOrientation {
    Symmetric,
    Fixed,
    Next,
    Previous,
    /// The type of a take-off or landing.
    Unknown,
}

impl PublishedRacingTask {
    /// The start, turnpoints and finish, without a take-off or landing.
    pub fn task_points(&self) -> Vec<&PublishedTaskPoint> {
        let points = self.task_points.iter();
        let ends = [PointRole::Takeoff, PointRole::Landing];
        points.filter(|point| !ends.contains(&point.role)).collect()
    }

    pub fn to_task(&self, earth_model: EarthModel) -> anyhow::Result<Task<Orientation>> {
        let task_points = self.task_points();
        let [start, turnpoints @ .., finish] = task_points.as_slice() else {
            bail!("the racing task has fewer than two task points");
        };
        let roles_in_order = start.role == PointRole::Start
            && finish.role == PointRole::Finish
            && turnpoints
                .iter()
                .all(|point| point.role == PointRole::Point);
        if !roles_in_order {
            bail!("the racing task doesn't run from a start over turnpoints to a finish");
        }
        let turnpoints = turnpoints.iter().map(|point| point.to_task_point());
        Ok(Task {
            kind: TaskKind::Racing,
            start: start.to_task_point()?,
            turnpoints: turnpoints.collect::<Result<_, _>>()?,
            finish: finish.to_task_point()?,
            earth_model,
        })
    }
}

impl PublishedTaskPoint {
    fn to_task_point(&self) -> anyhow::Result<TaskPoint<Orientation>> {
        // SeeYou resolves a symmetric start like next and a symmetric finish
        // like previous, which Keyhole rejects.
        let direction = match (self.role, self.oz_type) {
            (PointRole::Start, PublishedOrientation::Symmetric)
            | (_, PublishedOrientation::Next) => Orientation::Next,
            (PointRole::Finish, PublishedOrientation::Symmetric)
            | (_, PublishedOrientation::Previous) => Orientation::Previous,
            (_, PublishedOrientation::Symmetric) => Orientation::Symmetric,
            (_, PublishedOrientation::Fixed) => {
                Orientation::Fixed(normalize_bearing(degrees(self.oz_angle12)))
            }
            (_, PublishedOrientation::Unknown) => {
                bail!("a {:?} task point has an unknown orientation", self.role)
            }
        };
        let zone = if self.oz_line {
            let length = 2. * self.oz_radius1 / 1000.;
            ObservationZone::Line { length }
        } else {
            ObservationZone::TwoArc {
                r1: self.oz_radius1 / 1000.,
                a1: degrees(self.oz_angle1),
                r2: self.oz_radius2 / 1000.,
                a2: degrees(self.oz_angle2),
                reduce: self.oz_reduce,
            }
        };
        Ok(TaskPoint {
            reference_point: LngLat {
                longitude: self.longitude.to_degrees(),
                latitude: self.latitude.to_degrees(),
            },
            direction,
            zone,
        })
    }
}

/// Converts an angle from `task.json` to degrees. SeeYou writes radians with 15
/// significant digits, so 180° reads as 179.9999999999997° until rounded to a
/// millionth of a degree.
pub fn degrees(radians: f64) -> f64 {
    (radians.to_degrees() * 1e6).round() / 1e6
}

/// One row of `results.csv`. Columns the harness never reads are skipped.
#[derive(Debug, Deserialize)]
pub struct PublishedRow {
    /// A position, or `DNF`, `DNS` or `HC` for rows without one.
    pub rank: String,
    #[serde(rename = "cn")]
    pub competition_id: String,
    /// The handicap on the class's scale.
    pub handicap: Option<f64>,
    #[serde(rename = "start_time_local")]
    pub start_time: Option<Time>,
    #[serde(rename = "finish_time_local")]
    pub finish_time: Option<Time>,
    #[serde(rename = "speed_kmh")]
    pub speed: Option<f64>,
    #[serde(rename = "distance_km")]
    pub distance: Option<f64>,
    pub points: f64,
    pub penalty_points: Option<f64>,
    pub remarks: String,
}

pub fn parse_results(results_csv: &str) -> anyhow::Result<Vec<PublishedRow>> {
    let mut reader = csv::Reader::from_reader(results_csv.as_bytes());
    let rows = reader.deserialize().collect::<Result<_, _>>()?;
    Ok(rows)
}

pub fn format_duration(duration: SignedDuration) -> String {
    const PRINTER: SpanPrinter = SpanPrinter::new().hours_minutes_seconds(true);
    PRINTER.duration_to_string(&duration)
}
