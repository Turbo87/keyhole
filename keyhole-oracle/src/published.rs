//! The values SoaringSpot publishes for a class day, as soaringspot-downloader
//! writes them to `task.json` and `results.csv`.

use jiff::SignedDuration;
use jiff::civil::Time;
use jiff::fmt::friendly::SpanPrinter;
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
    Racing,
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
            Self::Racing | Self::CourseShape { task_duration: 0 } => return None,
            Self::CourseShape { task_duration } => task_duration,
        };
        Some(SignedDuration::from_secs(task_duration.into()))
    }
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
