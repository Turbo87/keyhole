//! Committed fixtures: one published class day plus a hand-written fixture
//! file in TOML.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;

use crate::comparison::Field;
use crate::decisions::ResultDecision;
use crate::published::{PublishedRow, PublishedTask, parse_results};

/// One published class day with what its download lacks.
#[derive(Debug)]
pub struct Fixture {
    pub minimum_task_time: Option<Duration>,
    pub rows: Vec<PublishedRow>,
    pub file: FixtureFile,
}

impl Fixture {
    /// Loads `task.json`, `results.csv` and `fixture.toml` from a fixture
    /// directory.
    pub fn load(directory: &Path) -> anyhow::Result<Self> {
        let read = |name| {
            let path = directory.join(name);
            fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))
        };
        Self::parse(
            &read("task.json")?,
            &read("results.csv")?,
            &read("fixture.toml")?,
        )
        .with_context(|| format!("loading fixture {}", directory.display()))
    }

    pub fn parse(task_json: &str, results_csv: &str, fixture_file: &str) -> anyhow::Result<Self> {
        let minimum_task_time = serde_json::from_str::<PublishedTask>(task_json)
            .context("parsing task.json")?
            .minimum_task_time();
        let rows = parse_results(results_csv).context("parsing results.csv")?;
        let file = toml::from_str(fixture_file).context("parsing fixture.toml")?;
        Ok(Self {
            minimum_task_time,
            rows,
            file,
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct FixtureFile {
    pub scoring_parameters: ScoringParameters,
    /// The day parameters transcribed from the task info line of
    /// `results.html`.
    pub published_day_parameters: PublishedDayParameters,
    /// Scorer decisions by competition ID, winning over derived ones.
    #[serde(default)]
    pub decisions: BTreeMap<String, FixtureDecisions>,
    #[serde(default)]
    pub deviations: Vec<Deviation>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScoringParameters {
    pub dm: f64,
    pub d1: f64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublishedDayParameters {
    pub d1: f64,
    pub n: u32,
    pub n1: u32,
    pub n2: u32,
    #[serde(rename = "do")]
    pub d0: f64,
    #[serde(rename = "vo")]
    pub v0: f64,
    pub f: f64,
    pub fcr: f64,
    pub maximum_points: f64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixtureDecisions {
    pub result: Option<ResultDecision>,
    pub penalty: Option<u32>,
    pub hors_concours: Option<bool>,
}

/// A mismatch with SoaringSpot that the fixture explains.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Deviation {
    /// The row's competition ID, or `None` for a day parameter.
    pub competition_id: Option<String>,
    pub field: Field,
    pub explanation: String,
}
