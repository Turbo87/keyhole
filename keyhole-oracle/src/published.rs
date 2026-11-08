//! The values SoaringSpot publishes for a class day, as soaringspot-downloader
//! writes them to `task.json` and `results.csv`.

use std::time::Duration;

use anyhow::anyhow;
use serde::{Deserialize, Deserializer};

/// The part of `task.json` that day scoring uses.
#[derive(Debug, Deserialize)]
#[serde(tag = "task_type", rename_all = "snake_case")]
pub enum PublishedTask {
    AssignedArea {
        /// The minimum task time in seconds.
        task_duration: u64,
    },
    #[serde(rename = "polygon")]
    Racing,
}

impl PublishedTask {
    pub fn minimum_task_time(&self) -> Option<Duration> {
        match *self {
            Self::AssignedArea { task_duration } => Some(Duration::from_secs(task_duration)),
            Self::Racing => None,
        }
    }
}

/// One row of `results.csv`. Columns the harness never reads are skipped.
#[derive(Debug, Deserialize)]
pub struct PublishedRow {
    /// A position, or `DNF`, `DNS` or `HC` for rows without one.
    pub rank: String,
    #[serde(rename = "cn")]
    pub competition_id: String,
    #[serde(rename = "start_time_local", deserialize_with = "optional_time")]
    pub start_time: Option<Duration>,
    #[serde(rename = "finish_time_local", deserialize_with = "optional_time")]
    pub finish_time: Option<Duration>,
    #[serde(rename = "speed_kmh")]
    pub speed: Option<f64>,
    #[serde(rename = "distance_km")]
    pub distance: Option<f64>,
    pub points: f64,
    pub penalty_points: Option<f64>,
}

pub fn parse_results(results_csv: &str) -> anyhow::Result<Vec<PublishedRow>> {
    let mut reader = csv::Reader::from_reader(results_csv.as_bytes());
    let rows = reader.deserialize().collect::<Result<_, _>>()?;
    Ok(rows)
}

/// Deserializes an optional `H:MM:SS` time of day or duration.
pub fn optional_time<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Duration>, D::Error> {
    let text = Option::<String>::deserialize(deserializer)?;
    text.map(|text| parse_time(&text).map_err(serde::de::Error::custom))
        .transpose()
}

fn parse_time(text: &str) -> anyhow::Result<Duration> {
    let invalid = || anyhow!("invalid time `{text}`");
    let parts: Vec<u64> = text
        .split(':')
        .map(str::parse)
        .collect::<Result<_, _>>()
        .map_err(|_| invalid())?;
    let [hours, minutes, seconds] = parts[..] else {
        return Err(invalid());
    };
    Ok(Duration::from_secs(hours * 3600 + minutes * 60 + seconds))
}

pub fn format_time(time: Duration) -> String {
    let seconds = time.as_secs();
    format!(
        "{}:{:02}:{:02}",
        seconds / 3600,
        seconds / 60 % 60,
        seconds % 60
    )
}
