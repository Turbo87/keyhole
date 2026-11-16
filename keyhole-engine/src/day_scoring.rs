//! Scoring one class day with the 1000-point formula shared by the DAeC SWO
//! and IGC Annex A.
//!
//! Distances are in km and speeds in km/h. Every distance must be finite, `Dm`
//! and `D1` must be above 0, and every finisher's time and every handicap must
//! be above 0. Scoring does not check these and its results are meaningless
//! when they are violated.

use std::time::Duration;

/// A class day's scoring parameters and each competitor's result.
#[derive(Debug, Clone, PartialEq)]
pub struct ClassDay {
    pub parameters: ScoringParameters,
    /// The minimum task time of an assigned area task, or `None` on a racing
    /// task.
    pub minimum_task_time: Option<Duration>,
    pub competitors: Vec<CompetitorResult>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScoringParameters {
    /// The minimum distance `Dm` that a day needs enough competitors to reach.
    pub dm: f64,
    /// The distance `D1` a winner needs for 1000 points.
    pub d1: f64,
}

/// One competitor's input to scoring a class day.
#[derive(Debug, Clone, PartialEq)]
pub struct CompetitorResult {
    pub competition_id: String,
    pub result: ResultStatus,
    /// Whether the competitor is scored against the day parameters without
    /// feeding them or being ranked.
    pub hors_concours: bool,
    /// Whether the competitor is disqualified from the competition, which
    /// makes every day score 0 while the achievement still feeds the day
    /// parameters.
    pub disqualified: bool,
    /// The handicap on the 1.000 scale that distances and speeds divide by,
    /// or `None` in a class without handicaps.
    pub handicap: Option<f64>,
    /// Points deducted from the day score after the formula.
    pub penalty: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ResultStatus {
    /// Not known yet, so scoring assumes a placeholder result, which feeds the
    /// day parameters unless the competitor is hors concours.
    Unknown,
    DidNotFly,
    /// The achievement analysed from a scored file or entered as a manual
    /// result.
    Flown(Achievement),
}

/// What a competitor achieved on the class day's task.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Achievement {
    /// The credited distance, which is the task distance for a racing task
    /// finisher.
    pub distance: f64,
    /// The time from the start to the finish, or `None` without a finish.
    pub time: Option<Duration>,
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
    /// No more than 25% of `N` reached `Dm` with their handicapped distance,
    /// so every day score is 0.
    Invalid,
}

/// The day parameters of the 1000-point formula, all unrounded.
#[derive(Debug, Clone, PartialEq)]
pub struct DayParameters {
    /// The number of competitors who flew.
    pub n: u32,
    /// The number of competitors whose handicapped distance reached `Dm`.
    pub n1: u32,
    /// The number of finishers with a handicapped speed above two thirds of
    /// `V0`.
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
    pub rank: Rank,
    pub competition_id: String,
    /// The distance `D`, or `None` without a counting result.
    pub distance: Option<f64>,
    /// The speed `V`, or `None` without a finish.
    pub speed: Option<f64>,
    /// The day score after the penalty and the floor at 0, before rounding.
    pub raw_score: f64,
    /// The day score, rounded half away from zero.
    pub score: u32,
}

/// A row's rank, or the marker of a row without one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rank {
    /// Shared by rows with equal day scores, skipping the ranks after them.
    Ranked(u32),
    /// Listed among the ranked rows by score without taking a rank.
    HorsConcours,
    /// Shown as "DSQ".
    Disqualified,
    /// Shown as "DNF".
    DidNotFly,
    /// A placeholder result, shown as "No result yet".
    NoResultYet,
}

/// A counting competitor's achievement with its speed, as flown and
/// handicapped.
struct CountingAchievement {
    distance: f64,
    /// The handicapped distance `Dh`.
    handicapped_distance: f64,
    finish: Option<Finish>,
}

struct Finish {
    speed: f64,
    /// The handicapped speed `Vh`.
    handicapped_speed: f64,
    time: Duration,
}

impl CountingAchievement {
    fn new(achievement: &Achievement, handicap: f64, minimum_task_time: Option<Duration>) -> Self {
        let distance = achievement.distance;
        let finish = achievement.time.map(|time| {
            let time = time.max(minimum_task_time.unwrap_or_default());
            let speed = distance / hours(time);
            let handicapped_speed = speed / handicap;
            Finish {
                speed,
                handicapped_speed,
                time,
            }
        });
        Self {
            distance,
            handicapped_distance: distance / handicap,
            finish,
        }
    }
}

fn hours(duration: Duration) -> f64 {
    duration.as_secs_f64() / 3600.
}

/// Scores a class day, returning its day parameters and a row per competitor.
///
/// Rows are ordered by unrounded score, then competition ID, with hors concours
/// rows among the ranked ones, then placeholder rows, then disqualified rows,
/// then did-not-fly rows.
pub fn score_class_day(day: &ClassDay) -> DayResult {
    let achievements: Vec<_> = day
        .competitors
        .iter()
        .map(|competitor| match &competitor.result {
            ResultStatus::Unknown | ResultStatus::DidNotFly => None,
            ResultStatus::Flown(achievement) => Some(CountingAchievement::new(
                achievement,
                competitor.handicap.unwrap_or(1.),
                day.minimum_task_time,
            )),
        })
        .collect();

    let counting: Vec<_> = day
        .competitors
        .iter()
        .zip(&achievements)
        .filter(|(competitor, _)| !competitor.hors_concours)
        .filter_map(|(_, achievement)| achievement.as_ref())
        .collect();
    let placeholder_count = day
        .competitors
        .iter()
        .filter(|competitor| !competitor.hors_concours)
        .filter(|competitor| competitor.result == ResultStatus::Unknown)
        .count() as u32;
    let parameters = day_parameters(&day.parameters, &counting, placeholder_count);

    let validity = if 4 * parameters.n1 > parameters.n {
        DayValidity::Valid
    } else {
        DayValidity::Invalid
    };

    let mut rows: Vec<_> = day
        .competitors
        .iter()
        .zip(&achievements)
        .map(|(competitor, achievement)| {
            let achievement = achievement.as_ref();
            let points = match achievement {
                _ if competitor.disqualified => 0.,
                Some(achievement) if validity == DayValidity::Valid => {
                    points(&parameters, achievement)
                }
                _ => 0.,
            };
            let raw_score = (points - f64::from(competitor.penalty)).max(0.);
            let finish = achievement.and_then(|a| a.finish.as_ref());
            let rank = match competitor.result {
                _ if competitor.disqualified => Rank::Disqualified,
                ResultStatus::Unknown => Rank::NoResultYet,
                _ if competitor.hors_concours => Rank::HorsConcours,
                ResultStatus::DidNotFly => Rank::DidNotFly,
                ResultStatus::Flown(_) => Rank::Ranked(0),
            };
            Row {
                rank,
                competition_id: competitor.competition_id.clone(),
                distance: achievement.map(|a| a.distance),
                speed: finish.map(|finish| finish.speed),
                raw_score,
                score: raw_score.round() as u32,
            }
        })
        .collect();
    rank(&mut rows);

    DayResult {
        parameters,
        validity,
        rows,
    }
}

/// Orders the rows and numbers the ranked ones, which carry a temporary rank.
fn rank(rows: &mut [Row]) {
    rows.sort_by(|a, b| {
        let group = |row: &Row| match row.rank {
            Rank::Ranked(_) | Rank::HorsConcours => 0,
            Rank::NoResultYet => 1,
            Rank::Disqualified => 2,
            Rank::DidNotFly => 3,
        };
        group(a)
            .cmp(&group(b))
            .then(b.raw_score.total_cmp(&a.raw_score))
            .then_with(|| a.competition_id.cmp(&b.competition_id))
    });
    let ranked = rows.iter_mut().filter_map(|row| match &mut row.rank {
        Rank::Ranked(rank) => Some((row.score, rank)),
        _ => None,
    });
    let mut previous = None;
    for (index, (score, rank)) in ranked.enumerate() {
        *rank = match previous {
            Some((previous_score, previous_rank)) if previous_score == score => previous_rank,
            _ => index as u32 + 1,
        };
        previous = Some((score, *rank));
    }
}

/// Computes the day parameters from the counting achievements and the number
/// of placeholder results, which feed `N`, `n1` and `n2` but never `D0`, `V0`
/// or `T0`.
fn day_parameters(
    scoring: &ScoringParameters,
    achievements: &[&CountingAchievement],
    placeholder_count: u32,
) -> DayParameters {
    let ScoringParameters { dm, d1 } = *scoring;

    let finishes = || achievements.iter().filter_map(|a| a.finish.as_ref());
    // A slower finisher on an assigned area task or a non-finisher can fly
    // further than the winner, so `D0` is the best distance of everyone.
    let d0 = achievements
        .iter()
        .map(|a| a.handicapped_distance)
        .max_by(f64::total_cmp)
        .unwrap_or(0.);
    let winner = finishes().max_by(|a, b| {
        let speed = a.handicapped_speed.total_cmp(&b.handicapped_speed);
        speed.then(b.time.cmp(&a.time))
    });
    let v0 = winner.map_or(0., |winner| winner.handicapped_speed);
    let t0 = winner.map(|winner| winner.time);

    // A placeholder is a finisher at `V0`, or a non-finisher at `D0` without
    // finishers.
    let counted_placeholders = |counted: bool| if counted { placeholder_count } else { 0 };
    let n = achievements.len() as u32 + placeholder_count;
    let n1 = achievements
        .iter()
        .filter(|a| a.handicapped_distance >= dm)
        .count() as u32;
    let n1 = n1 + counted_placeholders(winner.is_some() || d0 >= dm);
    let n2 = finishes()
        .filter(|finish| finish.handicapped_speed > 2. / 3. * v0)
        .count() as u32;
    let n2 = n2 + counted_placeholders(winner.is_some());

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

fn points(day: &DayParameters, achievement: &CountingAchievement) -> f64 {
    let speed_threshold = 2. / 3. * day.v0;
    let (pv, pd) = match &achievement.finish {
        Some(finish) if finish.handicapped_speed > speed_threshold => {
            let pv = day.pvm * (finish.handicapped_speed - speed_threshold) / (day.v0 / 3.);
            (pv, day.pdm)
        }
        Some(_) => (0., day.pdm),
        None => (0., day.pdm * achievement.handicapped_distance / day.d0),
    };
    day.f * day.fcr * (pv + pd)
}
