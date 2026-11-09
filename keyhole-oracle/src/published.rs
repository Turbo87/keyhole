//! The values SoaringSpot publishes for a class day, as soaringspot-downloader
//! writes them to `task.json` and `results.csv`.

use std::time::Duration;

use anyhow::{Context, anyhow, bail};
use keyhole_engine::day_scoring::Task;
use serde::{Deserialize, Deserializer};

/// The part of `task.json` that day scoring uses.
#[derive(Debug, Deserialize)]
pub(crate) struct PublishedTask {
    task_type: String,
    /// The task distance of a racing task in m.
    task_distance: f64,
    /// The minimum task time of an assigned area task in seconds.
    task_duration: Option<u64>,
}

impl PublishedTask {
    pub(crate) fn task(&self) -> anyhow::Result<Task> {
        match self.task_type.as_str() {
            "assigned_area" => {
                let seconds = self
                    .task_duration
                    .context("the assigned area task has no `task_duration`")?;
                Ok(Task::AssignedArea {
                    minimum_task_time: Duration::from_secs(seconds),
                })
            }
            "polygon" => Ok(Task::Racing {
                distance: self.task_distance / 1000.,
            }),
            task_type => bail!("unsupported task type `{task_type}`"),
        }
    }
}

/// One row of `results.csv`. Columns the harness never reads are skipped.
#[derive(Debug, Deserialize)]
pub(crate) struct PublishedRow {
    /// A position, or `DNF`, `DNS` or `HC` for rows without one.
    pub rank: String,
    #[serde(rename = "cn")]
    pub competition_id: String,
    #[serde(rename = "start_time_local", deserialize_with = "optional_time_of_day")]
    pub start_time: Option<Duration>,
    #[serde(
        rename = "finish_time_local",
        deserialize_with = "optional_time_of_day"
    )]
    pub finish_time: Option<Duration>,
    #[serde(rename = "speed_kmh")]
    pub speed: Option<f64>,
    #[serde(rename = "distance_km")]
    pub distance: Option<f64>,
    pub points: f64,
    pub penalty_points: Option<f64>,
    pub remarks: String,
}

pub(crate) fn parse_results(results_csv: &str) -> anyhow::Result<Vec<PublishedRow>> {
    let mut reader = csv::Reader::from_reader(results_csv.as_bytes());
    let rows = reader.deserialize().collect::<Result<_, _>>()?;
    Ok(rows)
}

/// Deserializes an `H:MM:SS` time of day as the duration since midnight.
pub(crate) fn time_of_day<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Duration, D::Error> {
    let text = String::deserialize(deserializer)?;
    parse_time_of_day(&text).map_err(serde::de::Error::custom)
}

/// Deserializes an empty string as `None` and anything else as a time of day.
pub(crate) fn optional_time_of_day<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Duration>, D::Error> {
    let text = Option::<String>::deserialize(deserializer)?.filter(|text| !text.is_empty());
    text.map(|text| parse_time_of_day(&text).map_err(serde::de::Error::custom))
        .transpose()
}

fn parse_time_of_day(text: &str) -> anyhow::Result<Duration> {
    let invalid = || anyhow!("invalid time of day `{text}`");
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

pub(crate) fn format_time_of_day(time: Duration) -> String {
    let seconds = time.as_secs();
    format!(
        "{:02}:{:02}:{:02}",
        seconds / 3600,
        seconds / 60 % 60,
        seconds % 60
    )
}
