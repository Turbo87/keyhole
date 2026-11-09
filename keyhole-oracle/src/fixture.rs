//! Committed fixtures: one published class day plus a hand-written fixture
//! file in TOML.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use anyhow::{Context, bail};
use keyhole_engine::day_scoring::{DayValidity, Task};
use keyhole_engine::rule_sets::{
    self, Class, ClassDayOverrides, HandicapScale, RuleOverride, RuleSetEdition,
};
use serde::Deserialize;

use crate::comparison::Field;
use crate::decisions::ResultDecision;
use crate::published::{PublishedRow, PublishedTask, parse_results};

/// One published class day with what its download lacks.
#[derive(Debug)]
pub struct Fixture {
    pub(crate) task: Task,
    pub(crate) rows: Vec<PublishedRow>,
    pub(crate) file: FixtureFile,
    pub(crate) scoring: rule_sets::ScoringParameters,
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
        let task = serde_json::from_str::<PublishedTask>(task_json)
            .context("parsing task.json")?
            .task()?;
        let rows = parse_results(results_csv).context("parsing results.csv")?;
        let file: FixtureFile = toml::from_str(fixture_file).context("parsing fixture.toml")?;
        let PublishedDayParameters {
            f,
            fcr,
            maximum_points,
            ..
        } = file.published_day_parameters;
        if f.is_some() != maximum_points.is_some() || fcr.is_some() != maximum_points.is_some() {
            bail!("the published day parameters need all or none of F, FCR and maximum points");
        }
        let scoring = file.scoring_parameters()?;
        Ok(Self {
            task,
            rows,
            file,
            scoring,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FixtureFile {
    /// The ID of the rule set edition the fixture scores under.
    pub edition: String,
    /// The rule set edition the competition flew under, or `unknown`.
    #[expect(dead_code, reason = "informational")]
    pub flown_under: String,
    pub class: FixtureClass,
    #[serde(default)]
    pub class_day: FixtureClassDay,
    /// The day parameters transcribed from the task info line of
    /// `results.html`.
    pub published_day_parameters: PublishedDayParameters,
    /// Scorer decisions by competition ID, winning over derived ones.
    #[serde(default)]
    pub decisions: BTreeMap<String, FixtureDecisions>,
    #[serde(default)]
    pub deviations: Vec<Deviation>,
}

impl FixtureFile {
    fn scoring_parameters(&self) -> anyhow::Result<rule_sets::ScoringParameters> {
        let Some(edition) = RuleSetEdition::find(&self.edition) else {
            bail!("the rule set edition {} does not exist", self.edition);
        };
        let FixtureClass {
            dm,
            d1,
            handicapped,
            handicap_scale,
            ref rule_overrides,
        } = self.class;
        let handicap_scale = match (handicapped, handicap_scale) {
            (true, None) => bail!("a handicapped class needs a handicap scale"),
            (_, scale) => scale.map_or(HandicapScale::One, HandicapScale::from),
        };
        let class = Class {
            dm,
            d1,
            handicapped,
            handicap_scale,
            overrides: rule_overrides.rule_overrides(),
        };
        let resolution = edition
            .resolve(&class, &self.class_day.overrides())
            .context("resolving the rule overrides")?;
        Ok(resolution.parameters.scoring)
    }
}

/// The class's own values and its rule overrides, which hold the competition's
/// local procedures.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FixtureClass {
    pub dm: f64,
    pub d1: f64,
    pub handicapped: bool,
    pub handicap_scale: Option<FixtureHandicapScale>,
    #[serde(default)]
    pub rule_overrides: FixtureRuleOverrides,
}

/// The class day's rule overrides, which win over the class's.
#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FixtureClassDay {
    pub dm: Option<f64>,
}

impl FixtureClassDay {
    fn overrides(&self) -> ClassDayOverrides {
        ClassDayOverrides {
            dm: self.dm,
            ..ClassDayOverrides::default()
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub(crate) enum FixtureHandicapScale {
    #[serde(rename = "1.000")]
    One,
    #[serde(rename = "100")]
    Hundred,
}

impl From<FixtureHandicapScale> for HandicapScale {
    fn from(scale: FixtureHandicapScale) -> Self {
        match scale {
            FixtureHandicapScale::One => Self::One,
            FixtureHandicapScale::Hundred => Self::Hundred,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FixtureRuleOverrides {
    pub earth_model: Option<EarthModel>,
    pub pev_start: Option<bool>,
    pub pev_wait_time: Option<u32>,
    pub pev_start_window: Option<u32>,
}

impl FixtureRuleOverrides {
    fn rule_overrides(&self) -> Vec<RuleOverride> {
        [
            self.earth_model
                .map(|model| RuleOverride::EarthModel(model.into())),
            self.pev_start.map(RuleOverride::PevStart),
            self.pev_wait_time.map(RuleOverride::PevWaitTime),
            self.pev_start_window.map(RuleOverride::PevStartWindow),
        ]
        .into_iter()
        .flatten()
        .collect()
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub(crate) enum EarthModel {
    #[serde(rename = "WGS84")]
    Wgs84,
    #[serde(rename = "FAI Sphere")]
    FaiSphere,
}

impl From<EarthModel> for rule_sets::EarthModel {
    fn from(model: EarthModel) -> Self {
        match model {
            EarthModel::Wgs84 => Self::Wgs84,
            EarthModel::FaiSphere => Self::FaiSphere,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PublishedDayParameters {
    pub d1: f64,
    pub n: u32,
    pub n1: u32,
    pub n2: u32,
    #[serde(rename = "do")]
    pub d0: f64,
    #[serde(rename = "vo")]
    pub v0: f64,
    /// `F`, `FCR` and the maximum points, which an invalid day doesn't
    /// publish.
    pub f: Option<f64>,
    pub fcr: Option<f64>,
    pub maximum_points: Option<f64>,
}

impl PublishedDayParameters {
    /// The task info line of an invalid day says so instead of publishing the
    /// maximum points.
    pub fn validity(&self) -> DayValidity {
        match self.maximum_points {
            Some(_) => DayValidity::Valid,
            None => DayValidity::Invalid,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FixtureDecisions {
    pub result: Option<ResultDecision>,
    pub penalty: Option<u32>,
    pub hors_concours: Option<bool>,
    pub handicap: Option<f64>,
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
