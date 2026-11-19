//! Committed fixtures: one published class day plus a hand-written fixture
//! file in TOML.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use anyhow::Context;
use jiff::SignedDuration;
use keyhole_engine::rule_sets;
use serde::{Deserialize, Serialize};

use crate::comparison::Field;
use crate::decisions::ResultDecision;
use crate::published::{PublishedRow, PublishedTask, parse_results};

/// One published class day with what its download lacks.
#[derive(Debug)]
pub struct Fixture {
    pub minimum_task_time: Option<SignedDuration>,
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
        let file = toml::from_str(fixture_file).context("parsing fixture.toml")?;
        Self::with_file(task_json, results_csv, file)
    }

    /// Combines a downloaded class day with a fixture file built in code.
    pub fn with_file(
        task_json: &str,
        results_csv: &str,
        file: FixtureFile,
    ) -> anyhow::Result<Self> {
        let minimum_task_time = serde_json::from_str::<PublishedTask>(task_json)
            .context("parsing task.json")?
            .minimum_task_time();
        let rows = parse_results(results_csv).context("parsing results.csv")?;
        Ok(Self {
            minimum_task_time,
            rows,
            file,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixtureFile {
    /// The ID of the built-in rule set edition that the harness scores the
    /// fixture under. It stays fixed when a newer edition ships, so a fixture
    /// never changes its rules without an edit.
    pub rule_set: String,
    /// The ID of the rule set edition that the competition was actually scored
    /// under, when known. Keyhole may not ship that edition, so the harness
    /// never reads it. It explains why the published results can differ from
    /// scoring under `rule_set`.
    pub original_rule_set: Option<String>,
    /// Whether the task info line says "handicapping enabled".
    #[serde(default)]
    pub handicapped: bool,
    /// The class's `Dm` and `D1` and the local procedures, applied to the
    /// edition's defaults.
    #[serde(default)]
    pub rule_overrides: RuleOverrides,
    /// The day parameters transcribed from the task info line of
    /// `results.html`, or `None` when the line states none.
    pub published_day_parameters: Option<PublishedDayParameters>,
    /// Scorer decisions by competition ID, winning over derived ones.
    #[serde(default)]
    pub decisions: BTreeMap<String, FixtureDecisions>,
    #[serde(default)]
    pub deviations: Vec<Deviation>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuleOverrides {
    pub earth_model: Option<EarthModel>,
    pub dm: Option<f64>,
    pub d1: Option<f64>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EarthModel {
    Wgs84,
    FaiSphere,
}

impl From<&RuleOverrides> for rule_sets::RuleOverrides {
    fn from(overrides: &RuleOverrides) -> Self {
        Self {
            earth_model: overrides.earth_model.map(Into::into),
            dm: overrides.dm,
            d1: overrides.d1,
            ..Default::default()
        }
    }
}

impl From<EarthModel> for rule_sets::EarthModel {
    fn from(earth_model: EarthModel) -> Self {
        match earth_model {
            EarthModel::Wgs84 => Self::Wgs84,
            EarthModel::FaiSphere => Self::FaiSphere,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublishedDayParameters {
    /// Whether the class day passes the day validity rule, which the task
    /// info line only states when it fails.
    #[serde(default = "default_valid")]
    pub valid: bool,
    pub d1: f64,
    pub n: u32,
    pub n1: u32,
    pub n2: u32,
    #[serde(rename = "do")]
    pub d0: f64,
    #[serde(rename = "vo")]
    pub v0: f64,
    // The task info line of an invalid class day leaves out `F`, `FCR` and the
    // maximum points.
    pub f: Option<f64>,
    pub fcr: Option<f64>,
    pub maximum_points: Option<f64>,
}

fn default_valid() -> bool {
    true
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixtureDecisions {
    pub result: Option<ResultDecision>,
    pub penalty: Option<u32>,
    pub hors_concours: Option<bool>,
    /// The handicap on the class's scale.
    pub handicap: Option<f64>,
}

/// A mismatch with SoaringSpot that the fixture explains.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Deviation {
    /// The row's competition ID, or `None` for a day parameter.
    pub competition_id: Option<String>,
    pub field: Field,
    pub explanation: String,
}
