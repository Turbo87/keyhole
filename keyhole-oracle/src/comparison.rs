//! Scoring a fixture and comparing Keyhole's values with the published ones
//! at the published precision.

use std::collections::HashSet;
use std::fmt;

use anyhow::{Context, bail};
use jiff::tz::TimeZone;
use keyhole_engine::day_scoring::{ClassDay, DayResult, DayValidity, Rank, Row, score_class_day};
use keyhole_engine::geodesy::{EarthModel, normalize_bearing};
use keyhole_engine::rule_sets::RuleSetEdition;
use keyhole_engine::task::ObservationZone;
use serde::{Deserialize, Serialize};

use crate::decisions::{Cause, RemarkDecision, RowDecisions, Source};
use crate::fixture::{Deviation, Fixture, PublishedDayParameters};
use crate::published::{PublishedRacingTask, PublishedRow, PublishedTask, degrees};

/// A compared value: a day parameter or a field of a row. The order of the
/// variants lists day parameters before rows in the full-data report.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Field {
    TaskDistance,
    Bearing,
    Validity,
    D1,
    N,
    N1,
    N2,
    Do,
    Vo,
    F,
    Fcr,
    MaximumPoints,
    Rank,
    Points,
    Penalty,
    Distance,
    Speed,
}

impl fmt::Display for Field {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::TaskDistance => "task distance",
            Self::Bearing => "bearing",
            Self::Validity => "day validity",
            Self::D1 => "D1",
            Self::N => "N",
            Self::N1 => "n1",
            Self::N2 => "n2",
            Self::Do => "Do",
            Self::Vo => "Vo",
            Self::F => "F",
            Self::Fcr => "FCR",
            Self::MaximumPoints => "maximum points",
            Self::Rank => "rank",
            Self::Points => "points",
            Self::Penalty => "penalty",
            Self::Distance => "distance",
            Self::Speed => "speed",
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
    /// The cause of a row's mismatch, or `None` for a day parameter.
    pub cause: Option<Cause>,
    /// The fixture file's explanation of a recorded deviation.
    pub explanation: Option<String>,
}

/// How far Keyhole's task distance may lie from the published one, in km. The
/// published task distance is stored as a 32-bit float, which holds about
/// 0.03 m at 500 km, and on older class days in whole m.
const TASK_DISTANCE_TOLERANCE: f64 = 0.001;

/// How far Keyhole's start bearing may lie from SeeYou's, in degrees.
const START_BEARING_TOLERANCE: f64 = 0.001;

/// How far Keyhole's turnpoint and finish bearings may lie from SeeYou's, in
/// degrees. SeeYou measures each course where its leg begins and Keyhole at
/// the reference point (ADR 0003), which differs most on long legs at high
/// latitudes. The full-data suite measured at most 1.41°.
const BEARING_TOLERANCE: f64 = 1.5;

/// The outcome of checking one fixture.
#[derive(Debug)]
pub struct Report {
    /// The mismatches of the task and of the day parameters.
    pub day_parameter_mismatches: Vec<Mismatch>,
    pub row_mismatches: Vec<Mismatch>,
    /// Recorded deviations that no longer occur.
    pub stale_deviations: Vec<Deviation>,
    /// The decisions applied to each row by competition ID, in row order.
    pub decisions: Vec<(String, String)>,
    /// The competition IDs of rows with a remark of unknown effect.
    pub unknown_effect_rows: Vec<String>,
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
    let Some(edition) = RuleSetEdition::find(&file.rule_set) else {
        bail!("unknown rule set edition {:?}", file.rule_set);
    };
    if let Some(day_parameters) = &file.published_day_parameters
        && day_parameters.valid
        && [
            day_parameters.f,
            day_parameters.fcr,
            day_parameters.maximum_points,
        ]
        .contains(&None)
    {
        bail!("a valid class day needs the published F, FCR and maximum points");
    }
    let mut competition_ids = HashSet::new();
    if let Some(row) = fixture
        .rows
        .iter()
        .find(|row| !competition_ids.insert(&row.competition_id))
    {
        bail!("{} has more than one row", row.competition_id);
    }
    if let Some(competition_id) = file
        .decisions
        .keys()
        .find(|id| !fixture.rows.iter().any(|row| &row.competition_id == *id))
    {
        bail!("the fixture file decides on {competition_id}, which has no row");
    }

    let handicapped = file.handicapped;
    let decisions = fixture
        .rows
        .iter()
        .map(|row| {
            let fixture_decisions = file.decisions.get(&row.competition_id);
            RowDecisions::decide(row, fixture_decisions, handicapped)
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    if handicapped {
        let missing: Vec<_> = fixture
            .rows
            .iter()
            .zip(&decisions)
            .filter(|(_, decisions)| decisions.handicap.is_none())
            .map(|(row, _)| row.competition_id.as_str())
            .collect();
        if !missing.is_empty() {
            bail!("no handicap for {}", missing.join(", "));
        }
    }
    // Handicaps on the 1.000 scale range from about 0.8 to 1.3, those on the
    // 100 scale from about 60 to 130 and those on the 1000 scale from about
    // 800 to 1150, so the largest handicap marks the scale.
    let largest_handicap = decisions
        .iter()
        .filter_map(|decisions| decisions.handicap)
        .fold(0., |largest, (handicap, _)| f64::max(largest, handicap));
    let handicap_scale = if largest_handicap >= 500. {
        1000.
    } else if largest_handicap >= 10. {
        100.
    } else {
        1.
    };
    // Day scoring reads no local time of day, so the time zone has no effect.
    let rules = edition.resolve(TimeZone::UTC, &[(&file.rule_overrides).into()]);
    let day = ClassDay {
        parameters: rules.scoring,
        minimum_task_time: fixture.task.minimum_task_time(),
        competitors: fixture
            .rows
            .iter()
            .zip(&decisions)
            .map(|(row, decisions)| {
                decisions.competitor_result(&row.competition_id, handicap_scale)
            })
            .collect(),
    };
    let result = score_class_day(&day);

    let mut deviations = file.deviations.clone();
    let mut explain = |mut mismatch: Mismatch| {
        let recorded = deviations.iter().position(|deviation| {
            deviation.competition_id == mismatch.competition_id && deviation.field == mismatch.field
        });
        mismatch.explanation = recorded.map(|index| deviations.remove(index).explanation);
        mismatch
    };

    let task_mismatches = match &fixture.task {
        PublishedTask::Racing(task) => task_mismatches(task, rules.analysis.earth_model)?,
        _ => Vec::new(),
    };
    let day_parameters = file.published_day_parameters.iter();
    let day_parameters =
        day_parameters.flat_map(|published| day_parameter_mismatches(published, &result));
    let day_parameter_mismatches = task_mismatches
        .into_iter()
        .chain(day_parameters)
        .map(&mut explain)
        .collect();
    let row_mismatches = fixture
        .rows
        .iter()
        .zip(&decisions)
        .flat_map(|(published, decisions)| {
            let row = result
                .rows
                .iter()
                .find(|row| row.competition_id == published.competition_id)
                .expect("the engine returns a row per competitor");
            row_mismatches(published, decisions, row)
        })
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
        unknown_effect_rows: fixture
            .rows
            .iter()
            .zip(&decisions)
            .filter(|(_, decisions)| {
                matches!(decisions.remark, Some(RemarkDecision::UnknownEffect(_)))
            })
            .map(|(row, _)| row.competition_id.clone())
            .collect(),
    })
}

fn task_mismatches(
    published: &PublishedRacingTask,
    earth_model: EarthModel,
) -> anyhow::Result<Vec<Mismatch>> {
    let task = published.to_task(earth_model)?;
    let resolved = task.resolve().context("resolving the task")?;
    let mismatch = |field, published, keyhole| Mismatch {
        competition_id: None,
        field,
        published,
        keyhole,
        cause: None,
        explanation: None,
    };

    let mut mismatches = Vec::new();
    let published_distance = published.task_distance / 1000.;
    let distance = task.distance();
    if (distance - published_distance).abs() > TASK_DISTANCE_TOLERANCE {
        let km = |distance: f64| format!("{distance:.4} km");
        let (published, keyhole) = (km(published_distance), km(distance));
        mismatches.push(mismatch(Field::TaskDistance, published, keyhole));
    }

    let published_points = published.task_points();
    let points = published_points
        .iter()
        .zip(resolved.task_points())
        .enumerate();
    for (index, (published, resolved)) in points {
        if !shaped_by_bearing(resolved.zone) {
            continue;
        }
        let (published_bearing, bearing) = (degrees(published.oz_angle12), resolved.direction);
        let difference = normalize_bearing(bearing - published_bearing + 180.) - 180.;
        let (point, tolerance) = match index {
            0 => ("start".to_string(), START_BEARING_TOLERANCE),
            index if index == published_points.len() - 1 => {
                ("finish".to_string(), BEARING_TOLERANCE)
            }
            index => (format!("turnpoint {index}"), BEARING_TOLERANCE),
        };
        if difference.abs() > tolerance {
            let describe = |bearing: f64| format!("{point} {bearing:.3}°");
            let (published, keyhole) = (describe(published_bearing), describe(bearing));
            mismatches.push(mismatch(Field::Bearing, published, keyhole));
        }
    }
    Ok(mismatches)
}

/// Whether a zone's bearing changes its shape, which it doesn't for a
/// cylinder or a cylinder with a disc cut out. SeeYou keeps R2 below R1.
fn shaped_by_bearing(zone: ObservationZone) -> bool {
    match zone {
        ObservationZone::Line { .. } => true,
        ObservationZone::TwoArc { a1, r2, a2, .. } => {
            a1 < 180. || (r2 > 0. && 0. < a2 && a2 < 180.)
        }
    }
}

fn day_parameter_mismatches(
    published: &PublishedDayParameters,
    keyhole: &DayResult,
) -> impl Iterator<Item = Mismatch> {
    let validity = |valid: bool| if valid { "valid" } else { "invalid" }.to_string();
    let count = |value: u32| value.to_string();
    let parameters = &keyhole.parameters;
    [
        (
            Field::Validity,
            Some(validity(published.valid)),
            validity(keyhole.validity == DayValidity::Valid),
        ),
        (
            Field::D1,
            Some(decimals(published.d1, 0)),
            decimals(parameters.d1, 0),
        ),
        (Field::N, Some(count(published.n)), count(parameters.n)),
        (Field::N1, Some(count(published.n1)), count(parameters.n1)),
        (Field::N2, Some(count(published.n2)), count(parameters.n2)),
        (
            Field::Do,
            Some(decimals(published.d0, 2)),
            decimals(parameters.d0, 2),
        ),
        (
            Field::Vo,
            Some(decimals(published.v0, 2)),
            decimals(parameters.v0, 2),
        ),
        (
            Field::F,
            published.f.map(|f| decimals(f, 3)),
            decimals(parameters.f, 3),
        ),
        (
            Field::Fcr,
            published.fcr.map(|fcr| decimals(fcr, 3)),
            decimals(parameters.fcr, 3),
        ),
        (
            Field::MaximumPoints,
            published.maximum_points.map(|points| decimals(points, 0)),
            decimals(parameters.pm.round(), 0),
        ),
    ]
    .into_iter()
    // A value the task info line leaves out isn't compared.
    .filter_map(|(field, published, keyhole)| Some((field, published?, keyhole)))
    .filter(|(_, published, keyhole)| published != keyhole)
    .map(|(field, published, keyhole)| Mismatch {
        competition_id: None,
        field,
        published,
        keyhole,
        cause: None,
        explanation: None,
    })
}

fn row_mismatches(
    published: &PublishedRow,
    decisions: &RowDecisions,
    keyhole: &Row,
) -> impl Iterator<Item = Mismatch> {
    let competition_id = &published.competition_id;
    let cause = decisions.cause(&published.rank);
    let hundredths = |value: Option<f64>| value.map(|value| decimals(value, 2));
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
            Field::Rank,
            Some(published.rank.clone()),
            Some(rank(keyhole.rank)),
        ),
        (
            Field::Points,
            Some(decimals(published.points, 0)),
            Some(keyhole.score.to_string()),
        ),
        (Field::Penalty, published_penalty, keyhole_penalty),
        (
            Field::Distance,
            hundredths(published.distance),
            // SoaringSpot shows 0 km for a row without a counting result.
            hundredths(Some(keyhole.distance.unwrap_or_default())),
        ),
        (
            Field::Speed,
            hundredths(published.speed),
            hundredths(keyhole.speed),
        ),
    ]
    .into_iter()
    .filter(|(_, published, keyhole)| published != keyhole)
    .map(move |(field, published, keyhole)| Mismatch {
        competition_id: Some(competition_id.clone()),
        field,
        published: published.unwrap_or_else(|| "nothing".into()),
        keyhole: keyhole.unwrap_or_else(|| "nothing".into()),
        cause: Some(cause),
        explanation: None,
    })
}

/// Writes a rank the way SoaringSpot's rank column does.
fn rank(rank: Rank) -> String {
    match rank {
        Rank::Ranked(rank) => rank.to_string(),
        Rank::HorsConcours => "HC".into(),
        Rank::Disqualified => "DSQ".into(),
        Rank::DidNotFly => "DNF".into(),
        Rank::NoResultYet => "No result yet".into(),
    }
}

fn decimals(value: f64, decimals: usize) -> String {
    format!("{value:.decimals$}")
}
