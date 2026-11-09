//! The scorer decisions behind each row: derived from the download, then
//! replaced by the fixture file's decisions.

use std::fmt;
use std::time::Duration;

use anyhow::{Context, bail};
use keyhole_engine::day_scoring::{Achievement, CompetitorResult, ResultStatus};
use serde::Deserialize;

use crate::fixture::FixtureDecisions;
use crate::published::{PublishedRow, format_time_of_day, optional_time_of_day, time_of_day};

/// A row's result as the scorer decides it.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum ResultDecision {
    DidNotFly,
    Finished {
        #[serde(deserialize_with = "time_of_day")]
        start_time: Duration,
        #[serde(deserialize_with = "time_of_day")]
        finish_time: Duration,
        distance: f64,
    },
    Landed {
        #[serde(default, deserialize_with = "optional_time_of_day")]
        start_time: Option<Duration>,
        distance: f64,
    },
}

impl ResultDecision {
    pub(crate) fn start_time(&self) -> Option<Duration> {
        match *self {
            Self::DidNotFly => None,
            Self::Finished { start_time, .. } => Some(start_time),
            Self::Landed { start_time, .. } => start_time,
        }
    }

    pub(crate) fn finish_time(&self) -> Option<Duration> {
        match *self {
            Self::Finished { finish_time, .. } => Some(finish_time),
            Self::DidNotFly | Self::Landed { .. } => None,
        }
    }

    fn status(&self) -> ResultStatus {
        match *self {
            Self::DidNotFly => ResultStatus::DidNotFly,
            Self::Finished {
                start_time,
                finish_time,
                distance,
            } => ResultStatus::Flown(Achievement::Finished {
                start_time,
                finish_time,
                distance,
            }),
            Self::Landed { distance, .. } => ResultStatus::Flown(Achievement::Landed { distance }),
        }
    }
}

impl fmt::Display for ResultDecision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::DidNotFly => write!(f, "did not fly"),
            Self::Finished {
                start_time,
                finish_time,
                distance,
            } => write!(
                f,
                "manual result finished from {} to {}, {distance} km",
                format_time_of_day(start_time),
                format_time_of_day(finish_time)
            ),
            Self::Landed {
                start_time,
                distance,
            } => match start_time {
                Some(start_time) => write!(
                    f,
                    "manual result landed after starting at {}, {distance} km",
                    format_time_of_day(start_time)
                ),
                None => write!(f, "manual result landed without starting, {distance} km"),
            },
        }
    }
}

/// Where a decision comes from.
#[derive(Debug, Clone, Copy)]
pub(crate) enum Source {
    Download,
    FixtureFile,
}

/// The decisions applied to one row.
#[derive(Debug)]
pub(crate) struct RowDecisions {
    pub result: (ResultDecision, Source),
    pub penalty: (u32, Source),
    pub hors_concours: (bool, Source),
}

impl RowDecisions {
    pub(crate) fn decide(
        row: &PublishedRow,
        fixture: Option<&FixtureDecisions>,
    ) -> anyhow::Result<Self> {
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

    pub(crate) fn competitor_result(&self, competition_id: &str) -> CompetitorResult {
        CompetitorResult {
            competition_id: competition_id.into(),
            result: self.result.0.status(),
            hors_concours: self.hors_concours.0,
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
    let distance = row.distance.unwrap_or_default();
    Ok(match (row.rank.as_str(), row.finish_time) {
        ("DNF", _) => ResultDecision::DidNotFly,
        ("DNS", _) => ResultDecision::Landed {
            start_time: None,
            distance: 0.,
        },
        (_, Some(finish_time)) => ResultDecision::Finished {
            start_time: row
                .start_time
                .with_context(|| format!("{} finished without a start time", row.competition_id))?,
            finish_time,
            distance,
        },
        (_, None) => ResultDecision::Landed {
            start_time: row.start_time,
            distance,
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
