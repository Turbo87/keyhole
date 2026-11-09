//! Scoring one class day with the 1000-point formula shared by the DAeC SWO
//! and IGC Annex A.
//!
//! Distances are in km, speeds in km/h and times of day are durations since
//! local midnight. Every distance must be finite and `D1` must be above 0.
//! Scoring does not check these and its results are meaningless when they are
//! violated.

use std::time::Duration;

/// A class day's scoring parameters and each competitor's result.
#[derive(Debug, Clone, PartialEq)]
pub struct ClassDay {
    pub parameters: ScoringParameters,
    pub competitors: Vec<CompetitorResult>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScoringParameters {
    /// The minimum distance `Dm` that a day needs enough competitors to reach.
    pub dm: f64,
    /// The distance `D1` a winner needs for 1000 points.
    pub d1: f64,
    pub task: Task,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Task {
    Racing { distance: f64 },
    AssignedArea { minimum_task_time: Duration },
}

/// One competitor's input to scoring a class day.
#[derive(Debug, Clone, PartialEq)]
pub struct CompetitorResult {
    pub competition_id: String,
    pub result: ResultStatus,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ResultStatus {
    DidNotFly,
    /// The achievement analysed from a scored file or entered as a manual
    /// result.
    Flown(Achievement),
}

/// What a competitor achieved on the class day's task.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Achievement {
    Finished {
        start_time: Duration,
        finish_time: Duration,
        distance: f64,
    },
    Landed {
        distance: f64,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct DayResult {
    pub parameters: DayParameters,
    pub validity: DayValidity,
    pub rows: Vec<Row>,
}

/// Whether a class day passes the day validity rule.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DayValidity {
    Valid,
    /// No more than 25% of `N` reached `Dm`, so every day score is 0.
    Invalid,
}

/// The day parameters of the 1000-point formula, all unrounded.
#[derive(Debug, Clone, PartialEq)]
pub struct DayParameters {
    /// The number of competitors who flew.
    pub n: u32,
    /// The number of competitors who reached `Dm`.
    pub n1: u32,
    /// The number of finishers faster than two thirds of `V0`.
    pub n2: u32,
    /// The minimum distance `Dm`.
    pub dm: f64,
    /// The distance `D1` a winner needs for 1000 points.
    pub d1: f64,
    /// The best handicapped distance.
    pub d0: f64,
    /// The best handicapped speed, or 0 without finishers.
    pub v0: f64,
    /// The time the finisher with `V0` is scored over, the lower one on a tie.
    pub t0: Option<Duration>,
    /// The maximum available points.
    pub pm: f64,
    /// The maximum available speed points.
    pub pvm: f64,
    /// The maximum available distance points.
    pub pdm: f64,
    /// The day factor.
    pub f: f64,
    /// The completion ratio factor.
    pub fcr: f64,
}

/// One competitor's day score.
#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    pub competition_id: String,
    /// The distance `D`, or `None` without a counting result.
    pub distance: Option<f64>,
    /// The speed `V`, or `None` without a finish.
    pub speed: Option<f64>,
    /// The day score before rounding.
    pub score: f64,
    pub day_score: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ScoringError {
    /// A finish time isn't after its start time.
    #[error("{competition_id} finished at or before the start")]
    FinishNotAfterStart { competition_id: String },
}

/// A counting competitor's handicapped achievement.
struct HandicappedAchievement {
    dh: f64,
    finish: Option<Finish>,
}

struct Finish {
    vh: f64,
    time: Duration,
}

impl HandicappedAchievement {
    /// Returns `None` for a finish at or before the start.
    fn new(achievement: &Achievement) -> Option<Self> {
        let (start_time, finish_time, distance) = match *achievement {
            Achievement::Landed { distance } => {
                return Some(Self {
                    dh: distance,
                    finish: None,
                });
            }
            Achievement::Finished {
                start_time,
                finish_time,
                distance,
            } => (start_time, finish_time, distance),
        };
        let time = finish_time
            .checked_sub(start_time)
            .filter(|time| !time.is_zero())?;
        Some(Self {
            dh: distance,
            finish: Some(Finish {
                vh: distance / hours(time),
                time,
            }),
        })
    }
}

fn hours(duration: Duration) -> f64 {
    duration.as_secs_f64() / 3600.
}

/// Scores a class day, returning its day parameters and a row per competitor in
/// competitor order.
pub fn score_class_day(day: &ClassDay) -> Result<DayResult, ScoringError> {
    let achievements: Vec<_> = day
        .competitors
        .iter()
        .map(|competitor| {
            let ResultStatus::Flown(achievement) = &competitor.result else {
                return Ok(None);
            };
            HandicappedAchievement::new(achievement)
                .map(Some)
                .ok_or_else(|| ScoringError::FinishNotAfterStart {
                    competition_id: competitor.competition_id.clone(),
                })
        })
        .collect::<Result<_, _>>()?;

    let counting: Vec<_> = achievements.iter().flatten().collect();
    let parameters = day_parameters(&day.parameters, &counting);

    let validity = if 4 * parameters.n1 > parameters.n {
        DayValidity::Valid
    } else {
        DayValidity::Invalid
    };

    let rows = day
        .competitors
        .iter()
        .zip(&achievements)
        .map(|(competitor, achievement)| {
            let achievement = achievement.as_ref();
            let score = match achievement {
                Some(achievement) if validity == DayValidity::Valid => {
                    points(&parameters, achievement)
                }
                _ => 0.,
            };
            let finish = achievement.and_then(|a| a.finish.as_ref());
            Row {
                competition_id: competitor.competition_id.clone(),
                distance: achievement.map(|a| a.dh),
                speed: finish.map(|finish| finish.vh),
                score,
                day_score: score.round() as u32,
            }
        })
        .collect();

    Ok(DayResult {
        parameters,
        validity,
        rows,
    })
}

fn day_parameters(
    scoring: &ScoringParameters,
    achievements: &[&HandicappedAchievement],
) -> DayParameters {
    let ScoringParameters { dm, d1, .. } = *scoring;

    let finishes = || achievements.iter().filter_map(|a| a.finish.as_ref());
    // A slower finisher on an assigned area task or a non-finisher can fly
    // further than the winner, so `D0` is the best distance of everyone.
    let d0 = achievements
        .iter()
        .map(|a| a.dh)
        .max_by(f64::total_cmp)
        .unwrap_or(0.);
    let winner = achievements
        .iter()
        .filter_map(|a| Some((a.finish.as_ref()?, a.dh)))
        .max_by(|(a, a_dh), (b, b_dh)| a.vh.total_cmp(&b.vh).then(b_dh.total_cmp(a_dh)))
        .map(|(finish, _)| finish);
    let v0 = winner.map_or(0., |winner| winner.vh);
    let t0 = winner.map(|winner| winner.time);

    let n = achievements.len() as u32;
    let n1 = achievements.iter().filter(|a| a.dh >= dm).count() as u32;
    let n2 = finishes().filter(|finish| finish.vh > 2. / 3. * v0).count() as u32;

    let pm = 1000_f64.min(1250. * d0 / d1 - 250.);
    let pm = t0.map_or(pm, |t0| pm.min(400. * hours(t0) - 200.));
    let pvm = 2. / 3. * ratio(n2, n) * pm;
    let pdm = pm - pvm;
    let f = 1_f64.min(1.25 * ratio(n1, n));
    let fcr = 1_f64.min(1.2 * ratio(n2, n1) + 0.6);

    DayParameters {
        n,
        n1,
        n2,
        dm,
        d1,
        d0,
        v0,
        t0,
        pm,
        pvm,
        pdm,
        f,
        fcr,
    }
}

/// Divides two competitor counts, taking 0 for an empty divisor so that a day
/// without counting competitors yields finite day parameters.
fn ratio(numerator: u32, denominator: u32) -> f64 {
    if denominator == 0 {
        0.
    } else {
        f64::from(numerator) / f64::from(denominator)
    }
}

fn points(day: &DayParameters, achievement: &HandicappedAchievement) -> f64 {
    let speed_threshold = 2. / 3. * day.v0;
    let (pv, pd) = match &achievement.finish {
        Some(finish) if finish.vh > speed_threshold => {
            let pv = day.pvm * (finish.vh - speed_threshold) / (day.v0 / 3.);
            (pv, day.pdm)
        }
        Some(_) => (0., day.pdm),
        None => (0., day.pdm * achievement.dh / day.d0),
    };
    day.f * day.fcr * (pv + pd)
}
