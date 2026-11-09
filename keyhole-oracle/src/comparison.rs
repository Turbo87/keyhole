//! Scoring a fixture and comparing Keyhole's values with the published ones
//! at the published precision.

use std::fmt;

use anyhow::bail;
use keyhole_engine::day_scoring::{
    ClassDay, DayParameters, Row, ScoringParameters, score_class_day,
};
use serde::Deserialize;

use crate::decisions::{RowDecisions, Source};
use crate::fixture::{Deviation, Fixture, PublishedDayParameters};
use crate::published::{PublishedRow, format_time_of_day};

/// A compared value: a day parameter or a field of a row.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Field {
    D1,
    N,
    N1,
    N2,
    Do,
    Vo,
    F,
    Fcr,
    MaximumPoints,
    Points,
    Penalty,
    Distance,
    Speed,
    StartTime,
    FinishTime,
}

impl fmt::Display for Field {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::D1 => "D1",
            Self::N => "N",
            Self::N1 => "n1",
            Self::N2 => "n2",
            Self::Do => "Do",
            Self::Vo => "Vo",
            Self::F => "F",
            Self::Fcr => "FCR",
            Self::MaximumPoints => "maximum points",
            Self::Points => "points",
            Self::Penalty => "penalty",
            Self::Distance => "distance",
            Self::Speed => "speed",
            Self::StartTime => "start time",
            Self::FinishTime => "finish time",
        })
    }
}

/// A value Keyhole computes differently from SoaringSpot.
#[derive(Debug, Clone, PartialEq)]
pub struct Mismatch {
    /// The row's competition ID, or `None` for a day parameter.
    pub competition_id: Option<String>,
    pub field: Field,
    pub published: String,
    pub keyhole: String,
    /// The fixture file's explanation of a recorded deviation.
    pub explanation: Option<String>,
}

/// The outcome of checking one fixture.
#[derive(Debug)]
pub struct Report {
    pub day_parameter_mismatches: Vec<Mismatch>,
    pub row_mismatches: Vec<Mismatch>,
    /// Recorded deviations that no longer occur.
    pub stale_deviations: Vec<Deviation>,
    /// The decisions applied to each row by competition ID, in row order.
    pub decisions: Vec<(String, String)>,
}

impl Report {
    /// Whether every mismatch is a recorded deviation and every recorded
    /// deviation still occurs.
    pub fn passes(&self) -> bool {
        self.mismatches()
            .all(|mismatch| mismatch.explanation.is_some())
            && self.stale_deviations.is_empty()
    }

    fn mismatches(&self) -> impl Iterator<Item = &Mismatch> {
        self.day_parameter_mismatches
            .iter()
            .chain(&self.row_mismatches)
    }
}

impl fmt::Display for Report {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for mismatch in self.mismatches() {
            if let Some(competition_id) = &mismatch.competition_id {
                write!(f, "{competition_id} ")?;
            }
            write!(
                f,
                "{}: published {}, Keyhole {}",
                mismatch.field, mismatch.published, mismatch.keyhole
            )?;
            match &mismatch.explanation {
                Some(explanation) => writeln!(f, " (recorded deviation: {explanation})")?,
                None => writeln!(f)?,
            }
        }
        for deviation in &self.stale_deviations {
            if let Some(competition_id) = &deviation.competition_id {
                write!(f, "{competition_id} ")?;
            }
            writeln!(
                f,
                "{}: recorded deviation no longer occurs: {}",
                deviation.field, deviation.explanation
            )?;
        }
        writeln!(f, "Decisions:")?;
        for (competition_id, decisions) in &self.decisions {
            writeln!(f, "  {competition_id}: {decisions}")?;
        }
        Ok(())
    }
}

/// Scores a fixture's class day and compares the outcome with the published
/// values.
pub fn check(fixture: &Fixture) -> anyhow::Result<Report> {
    let file = &fixture.file;
    if let Some(competition_id) = file
        .decisions
        .keys()
        .find(|id| !fixture.rows.iter().any(|row| &row.competition_id == *id))
    {
        bail!("the fixture file decides on {competition_id}, which has no row");
    }

    let decisions = fixture
        .rows
        .iter()
        .map(|row| RowDecisions::decide(row, file.decisions.get(&row.competition_id)))
        .collect::<anyhow::Result<Vec<_>>>()?;
    let day = ClassDay {
        parameters: ScoringParameters {
            dm: file.scoring_parameters.dm,
            d1: file.scoring_parameters.d1,
            task: fixture.task.clone(),
        },
        competitors: fixture
            .rows
            .iter()
            .zip(&decisions)
            .map(|(row, decisions)| decisions.competitor_result(&row.competition_id))
            .collect(),
    };
    let result = score_class_day(&day)?;

    let mut deviations = file.deviations.clone();
    let mut explain = |mut mismatch: Mismatch| {
        let recorded = deviations.iter().position(|deviation| {
            deviation.competition_id == mismatch.competition_id && deviation.field == mismatch.field
        });
        mismatch.explanation = recorded.map(|index| deviations.remove(index).explanation);
        mismatch
    };

    let day_parameter_mismatches =
        day_parameter_mismatches(&file.published_day_parameters, &result.parameters)
            .map(&mut explain)
            .collect();
    let row_mismatches = fixture
        .rows
        .iter()
        .zip(&decisions)
        .zip(&result.rows)
        .flat_map(|((published, decisions), row)| row_mismatches(published, decisions, row))
        .map(&mut explain)
        .collect();

    Ok(Report {
        day_parameter_mismatches,
        row_mismatches,
        stale_deviations: deviations,
        decisions: fixture
            .rows
            .iter()
            .zip(&decisions)
            .map(|(row, decisions)| (row.competition_id.clone(), decisions.to_string()))
            .collect(),
    })
}

fn day_parameter_mismatches(
    published: &PublishedDayParameters,
    keyhole: &DayParameters,
) -> impl Iterator<Item = Mismatch> {
    let count = |value: u32| value.to_string();
    [
        (
            Field::D1,
            decimals(published.d1, 0),
            decimals(keyhole.d1, 0),
        ),
        (Field::N, count(published.n), count(keyhole.n)),
        (Field::N1, count(published.n1), count(keyhole.n1)),
        (Field::N2, count(published.n2), count(keyhole.n2)),
        (
            Field::Do,
            decimals(published.d0, 2),
            decimals(keyhole.d0, 2),
        ),
        (
            Field::Vo,
            decimals(published.v0, 2),
            decimals(keyhole.v0, 2),
        ),
        (Field::F, decimals(published.f, 3), decimals(keyhole.f, 3)),
        (
            Field::Fcr,
            decimals(published.fcr, 3),
            decimals(keyhole.fcr, 3),
        ),
        (
            Field::MaximumPoints,
            decimals(published.maximum_points, 0),
            decimals(keyhole.pm.round(), 0),
        ),
    ]
    .into_iter()
    .filter(|(_, published, keyhole)| published != keyhole)
    .map(|(field, published, keyhole)| Mismatch {
        competition_id: None,
        field,
        published,
        keyhole,
        explanation: None,
    })
}

fn row_mismatches(
    published: &PublishedRow,
    decisions: &RowDecisions,
    keyhole: &Row,
) -> impl Iterator<Item = Mismatch> {
    let competition_id = &published.competition_id;
    let result = decisions.result.0;
    let hundredths = |value: Option<f64>| value.map(|value| decimals(value, 2));
    let time = |time: Option<_>| time.map(format_time_of_day);
    let (published_penalty, keyhole_penalty) = match decisions.penalty {
        // A penalty from the fixture file fills in what the download lacks.
        (_, Source::FixtureFile) => (None, None),
        (penalty, Source::Download) => (
            Some(published.penalty_points.unwrap_or_default().to_string()),
            Some(penalty.to_string()),
        ),
    };
    [
        (
            Field::Points,
            Some(decimals(published.points, 0)),
            Some(keyhole.day_score.to_string()),
        ),
        (Field::Penalty, published_penalty, keyhole_penalty),
        (
            Field::Distance,
            hundredths(published.distance),
            hundredths(keyhole.distance),
        ),
        (
            Field::Speed,
            hundredths(published.speed),
            hundredths(keyhole.speed),
        ),
        (
            Field::StartTime,
            time(published.start_time),
            time(result.start_time()),
        ),
        (
            Field::FinishTime,
            time(published.finish_time),
            time(result.finish_time()),
        ),
    ]
    .into_iter()
    .filter(|(_, published, keyhole)| published != keyhole)
    .map(|(field, published, keyhole)| Mismatch {
        competition_id: Some(competition_id.clone()),
        field,
        published: published.unwrap_or_else(|| "nothing".into()),
        keyhole: keyhole.unwrap_or_else(|| "nothing".into()),
        explanation: None,
    })
}

fn decimals(value: f64, decimals: usize) -> String {
    format!("{value:.decimals$}")
}
