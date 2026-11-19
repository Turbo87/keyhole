//! The scorer decisions behind each row: derived from the download, then
//! replaced by the fixture file's decisions.

use std::fmt;
use std::sync::LazyLock;

use anyhow::{Context, bail};
use jiff::SignedDuration;
use keyhole_engine::day_scoring::{Achievement, CompetitorResult, ResultStatus};
use regex::Regex;
use serde::Deserialize;

use crate::fixture::FixtureDecisions;
use crate::published::{PublishedRow, format_duration};

/// A row's result as the scorer decides it.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub enum ResultDecision {
    DidNotFly,
    Flown {
        distance: f64,
        /// The time from the start to the finish, or `None` without a finish.
        #[serde(default)]
        time: Option<SignedDuration>,
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
            } => write!(f, "finished {distance} km in {}", format_duration(time)),
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
    /// The handicap on the class's scale, or `None` in a class without
    /// handicaps or when it is missing.
    pub handicap: Option<(f64, Source)>,
    pub remark: Option<RemarkDecision>,
}

/// What a published remark becomes. Remark text is never compared.
#[derive(Debug)]
pub enum RemarkDecision {
    /// The public remark of the row's penalty.
    PublicRemark(String),
    OfficialWarning(String),
    /// A remark whose effect on scoring is known but not applied, or which has
    /// none, and which only the report shows.
    NotApplied(String),
    /// A remark whose effect on scoring is unknown, such as an airspace or
    /// turnpoint remark without a penalty, which only the report shows.
    UnknownEffect(String),
}

/// What sets a row apart, which groups its mismatches in the full-data report.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Cause {
    Finished,
    LandedOut,
    DidNotFly,
    /// SoaringSpot's `DNS`, a launch without a valid start.
    NoValidStart,
    HorsConcours,
    Penalty,
    OfficialWarning,
    RemarkNotApplied,
    RemarkOfUnknownEffect,
}

impl fmt::Display for Cause {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Finished => "finished",
            Self::LandedOut => "landed out",
            Self::DidNotFly => "did not fly",
            Self::NoValidStart => "no valid start",
            Self::HorsConcours => "hors concours",
            Self::Penalty => "penalty",
            Self::OfficialWarning => "official warning",
            Self::RemarkNotApplied => "remark not applied",
            Self::RemarkOfUnknownEffect => "remark of unknown effect",
        })
    }
}

impl RowDecisions {
    pub fn decide(
        row: &PublishedRow,
        fixture: Option<&FixtureDecisions>,
        handicapped: bool,
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
        let handicap = match fixture.and_then(|fixture| fixture.handicap) {
            Some(handicap) => Some((handicap, Source::FixtureFile)),
            None => row.handicap.map(|handicap| (handicap, Source::Download)),
        };
        Ok(Self {
            result,
            penalty,
            hors_concours,
            handicap: handicap.filter(|_| handicapped),
            remark: remark_from_published(row),
        })
    }

    /// The row's cause, which a remark of unknown effect sets before the
    /// result status, hors concours, a penalty and other remarks.
    pub fn cause(&self, published_rank: &str) -> Cause {
        match (&self.remark, self.result.0) {
            (Some(RemarkDecision::UnknownEffect(_)), _) => Cause::RemarkOfUnknownEffect,
            (_, ResultDecision::DidNotFly) => Cause::DidNotFly,
            _ if published_rank == "DNS" => Cause::NoValidStart,
            _ if self.hors_concours.0 => Cause::HorsConcours,
            _ if self.penalty.0 > 0 => Cause::Penalty,
            (Some(RemarkDecision::OfficialWarning(_)), _) => Cause::OfficialWarning,
            (Some(RemarkDecision::NotApplied(_)), _) => Cause::RemarkNotApplied,
            (_, ResultDecision::Flown { time: Some(_), .. }) => Cause::Finished,
            (_, ResultDecision::Flown { time: None, .. }) => Cause::LandedOut,
        }
    }

    /// Builds the row's scoring input, converting its handicap from the
    /// class's handicap scale, 1, 100 or 1000, to the 1.000 scale.
    pub fn competitor_result(&self, competition_id: &str, handicap_scale: f64) -> CompetitorResult {
        CompetitorResult {
            competition_id: competition_id.into(),
            result: self.result.0.status(),
            hors_concours: self.hors_concours.0,
            disqualified: false,
            handicap: self.handicap.map(|(handicap, _)| handicap / handicap_scale),
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
            (0, Source::Download) => {}
            (penalty, source) => write!(f, ", penalty {penalty} ({source})")?,
        }
        if let Some((handicap, source)) = self.handicap {
            write!(f, ", handicap {handicap} ({source})")?;
        }
        match &self.remark {
            None => Ok(()),
            Some(RemarkDecision::PublicRemark(remark)) => {
                write!(f, ", public remark \"{remark}\" ({})", Source::Download)
            }
            Some(RemarkDecision::OfficialWarning(remark)) => {
                write!(f, ", official warning \"{remark}\" ({})", Source::Download)
            }
            Some(RemarkDecision::NotApplied(remark)) => {
                write!(f, ", remark \"{remark}\" (not applied)")
            }
            Some(RemarkDecision::UnknownEffect(remark)) => {
                write!(f, ", remark \"{remark}\" (unknown effect)")
            }
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
            let time = finish_time.duration_since(start_time);
            if !time.is_positive() {
                bail!("{competition_id} finished at or before the start");
            }
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

/// Turns a published remark minus its trailing penalty points into a public
/// remark, an official warning, a remark that isn't applied or a remark of
/// unknown effect.
fn remark_from_published(row: &PublishedRow) -> Option<RemarkDecision> {
    static PENALTY_POINTS: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\s*\(?[\d,.]+ penalty points\)?\s*$").unwrap());
    // Remarks in these groups state a result status, a crew or a
    // disqualification, even when they also mention a warning.
    static EARLIER_GROUPS: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(
            r"(?i)^(dnf|dns|dnl)$|did not (fly|launch)|withdrawn|nicht abgeflogen|kein abflug|^P1 .* P2|disqual|\bdsq\b",
        )
        .unwrap()
    });
    static OFFICIAL_WARNING: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?i)warn|first offen|1st offen|^w ?-").unwrap());
    // Remarks in these groups name a flight end, a start time, a scored file,
    // a logger check, a finish height or an outlanding.
    static KNOWN_EFFECT: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(
            r"(?i)engine|virtu|^start \d|\d ?min penalty|went early|pev.*from pri|secondary|sekundär|resubmission|file from primary|logger ?interval|fix ?rate|gps pr|logger gps|validierung|logger failure|loggerausfall|zielh|zielkreis|zu tief|finish(ing)? (alt|below)|^(ps, )?l/o$|landed out",
        )
        .unwrap()
    });

    let remark = PENALTY_POINTS.replace(&row.remarks, "").into_owned();
    if remark.is_empty() {
        None
    } else if row.penalty_points.is_some_and(|points| points > 0.) {
        Some(RemarkDecision::PublicRemark(remark))
    } else if OFFICIAL_WARNING.is_match(&remark) && !EARLIER_GROUPS.is_match(&remark) {
        Some(RemarkDecision::OfficialWarning(remark))
    } else if EARLIER_GROUPS.is_match(&remark) || KNOWN_EFFECT.is_match(&remark) {
        Some(RemarkDecision::NotApplied(remark))
    } else {
        Some(RemarkDecision::UnknownEffect(remark))
    }
}
