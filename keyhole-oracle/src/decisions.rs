//! The scorer decisions behind each row: derived from the download, then
//! replaced by the fixture file's decisions.

use std::fmt;
use std::time::Duration;

use anyhow::{Context, bail};
use keyhole_engine::day_scoring::{Achievement, CompetitorResult, ResultStatus};
use serde::Deserialize;

use crate::fixture::FixtureDecisions;
use crate::published::{PublishedRow, format_time, optional_time};

/// A row's result as the scorer decides it.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub enum ResultDecision {
    DidNotFly,
    Flown {
        distance: f64,
        /// The time from the start to the finish, or `None` without a finish.
        #[serde(default, deserialize_with = "optional_time")]
        time: Option<Duration>,
    },
}

impl ResultDecision {
    fn status(self) -> ResultStatus {
        match self {
            Self::DidNotFly => ResultStatus::DidNotFly,
            Self::Flown { distance, time } => ResultStatus::Flown(Achievement { distance, time }),
        }
    }
}

impl fmt::Display for ResultDecision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::DidNotFly => write!(f, "did not fly"),
            Self::Flown {
                distance,
                time: Some(time),
            } => write!(f, "finished {distance} km in {}", format_time(time)),
            Self::Flown {
                distance,
                time: None,
            } => write!(f, "landed after {distance} km"),
        }
    }
}

/// Where a decision comes from.
#[derive(Debug, Clone, Copy)]
pub enum Source {
    Download,
    FixtureFile,
}

/// The decisions applied to one row.
#[derive(Debug)]
pub struct RowDecisions {
    pub result: (ResultDecision, Source),
    pub penalty: (u32, Source),
    pub hors_concours: (bool, Source),
}

impl RowDecisions {
    pub fn decide(row: &PublishedRow, fixture: Option<&FixtureDecisions>) -> anyhow::Result<Self> {
        let result = match fixture.and_then(|fixture| fixture.result) {
            Some(result) => (result, Source::FixtureFile),
            None => (result_from_published(row)?, Source::Download),
        };
        let penalty = match fixture.and_then(|fixture| fixture.penalty) {
            Some(penalty) => (penalty, Source::FixtureFile),
            None => (penalty_from_published(row)?, Source::Download),
        };
        let hors_concours = match fixture.and_then(|fixture| fixture.hors_concours) {
            Some(hors_concours) => (hors_concours, Source::FixtureFile),
            None => (row.rank == "HC", Source::Download),
        };
        Ok(Self {
            result,
            penalty,
            hors_concours,
        })
    }

    pub fn competitor_result(&self, competition_id: &str) -> CompetitorResult {
        CompetitorResult {
            competition_id: competition_id.into(),
            result: self.result.0.status(),
            hors_concours: self.hors_concours.0,
            disqualified: false,
            penalty: self.penalty.0,
        }
    }
}

impl fmt::Display for RowDecisions {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (result, result_source) = self.result;
        write!(f, "{result} ({result_source})")?;
        match self.hors_concours {
            (false, Source::Download) => {}
            (true, source) => write!(f, ", hors concours ({source})")?,
            (false, source) => write!(f, ", not hors concours ({source})")?,
        }
        match self.penalty {
            (0, Source::Download) => Ok(()),
            (penalty, source) => write!(f, ", penalty {penalty} ({source})"),
        }
    }
}

impl fmt::Display for Source {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Download => "from the download",
            Self::FixtureFile => "from the fixture file",
        })
    }
}

/// Turns one published row into its result. This is the step flight analysis
/// replaces for rows with an IGC file.
fn result_from_published(row: &PublishedRow) -> anyhow::Result<ResultDecision> {
    let competition_id = &row.competition_id;
    let distance = row.distance.unwrap_or_default();
    Ok(match (row.rank.as_str(), row.finish_time) {
        ("DNF", _) => ResultDecision::DidNotFly,
        ("DNS", _) => ResultDecision::Flown {
            distance: 0.,
            time: None,
        },
        (_, Some(finish_time)) => {
            let start_time = row
                .start_time
                .with_context(|| format!("{competition_id} finished without a start time"))?;
            let time = finish_time
                .checked_sub(start_time)
                .filter(|time| !time.is_zero())
                .with_context(|| format!("{competition_id} finished at or before the start"))?;
            ResultDecision::Flown {
                distance,
                time: Some(time),
            }
        }
        (_, None) => ResultDecision::Flown {
            distance,
            time: None,
        },
    })
}

/// Rounds a fractional published penalty to whole points, which the row's
/// penalty comparison then reports.
fn penalty_from_published(row: &PublishedRow) -> anyhow::Result<u32> {
    let penalty = row.penalty_points.unwrap_or_default();
    if penalty < 0. {
        bail!(
            "{} has a negative penalty of {penalty} points",
            row.competition_id
        );
    }
    Ok(penalty.round() as u32)
}
