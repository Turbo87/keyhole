use std::time::Duration;

use keyhole_engine::day_scoring::{
    Achievement, ClassDay, CompetitorResult, DayResult, DayValidity, ResultStatus, ScoringError,
    ScoringParameters, Standing, Task, score_class_day,
};

fn hours(hours: f64) -> Duration {
    Duration::from_secs_f64(hours * 3600.)
}

fn racing_day(distance: f64, competitors: Vec<CompetitorResult>) -> ClassDay {
    ClassDay {
        parameters: ScoringParameters {
            dm: 100.,
            d1: 250.,
            task: Task::Racing { distance },
        },
        competitors,
    }
}

fn assigned_area_day(minimum_task_time: Duration, competitors: Vec<CompetitorResult>) -> ClassDay {
    let mut day = racing_day(0., competitors);
    day.parameters.task = Task::AssignedArea { minimum_task_time };
    day
}

fn competitor(competition_id: &str, result: ResultStatus) -> CompetitorResult {
    CompetitorResult {
        competition_id: competition_id.into(),
        result,
        hors_concours: false,
        penalty: 0,
    }
}

fn finisher(competition_id: &str, distance: f64, task_time: Duration) -> CompetitorResult {
    let start = time_of_day(10, 0);
    timed_finisher(competition_id, start, start + task_time, distance)
}

fn timed_finisher(
    competition_id: &str,
    start_time: Duration,
    finish_time: Duration,
    distance: f64,
) -> CompetitorResult {
    let achievement = Achievement::Finished {
        start_time,
        finish_time,
        distance,
    };
    competitor(competition_id, ResultStatus::Flown(achievement))
}

fn time_of_day(hour: u64, minute: u64) -> Duration {
    Duration::from_secs(hour * 3600 + minute * 60)
}

fn score(day: &ClassDay) -> DayResult {
    score_class_day(day).unwrap()
}

#[test]
fn lone_finisher_scores_the_day_maximum() {
    let day = racing_day(300., vec![finisher("A", 300., hours(3.))]);

    let result = score(&day);

    let parameters = &result.parameters;
    assert_eq!(parameters.n, 1);
    assert_eq!(parameters.n1, 1);
    assert_eq!(parameters.n2, 1);
    assert_eq!(parameters.d0, 300.);
    assert_eq!(parameters.v0, 100.);
    assert_eq!(parameters.t0, Some(hours(3.)));
    assert_eq!(parameters.pm, 1000.);
    assert_eq!(parameters.f, 1.);
    assert_eq!(parameters.fcr, 1.);
    assert_eq!(result.rows.len(), 1);
    assert_eq!(result.rows[0].competition_id, "A");
    assert_eq!(result.rows[0].day_score, 1000);
}

fn landed(competition_id: &str, distance: f64) -> CompetitorResult {
    competitor(
        competition_id,
        ResultStatus::Flown(Achievement::Landed { distance }),
    )
}

fn day_scores(result: &DayResult) -> Vec<(&str, u32)> {
    let rows = result.rows.iter();
    rows.map(|row| (row.competition_id.as_str(), row.day_score))
        .collect()
}

#[test]
fn day_without_finishers_drops_the_time_term_and_scores_distance_only() {
    let day = racing_day(300., vec![landed("A", 200.), landed("B", 100.)]);

    let result = score(&day);

    let parameters = &result.parameters;
    assert_eq!((parameters.n, parameters.n1, parameters.n2), (2, 2, 0));
    assert_eq!(parameters.v0, 0.);
    assert_eq!(parameters.t0, None);
    assert_eq!(parameters.pm, 750.);
    assert_eq!(parameters.pvm, 0.);
    assert_eq!(parameters.pdm, 750.);
    assert_eq!(parameters.fcr, 0.6);
    assert_eq!(day_scores(&result), [("A", 450), ("B", 225)]);
}

#[test]
fn finishers_score_speed_points_above_two_thirds_of_the_best_speed() {
    let day = racing_day(
        300.,
        vec![
            finisher("A", 300., hours(3.)),
            finisher("B", 300., hours(3.75)),
            finisher("C", 300., hours(5.)),
            landed("D", 150.),
        ],
    );

    let result = score(&day);

    let parameters = &result.parameters;
    assert_eq!((parameters.n, parameters.n1, parameters.n2), (4, 4, 2));
    assert_eq!(parameters.pm, 1000.);
    assert_eq!(parameters.f, 1.);
    assert_eq!(parameters.fcr, 1.);
    assert_eq!(result.rows[1].speed, Some(80.));
    assert_eq!(
        day_scores(&result),
        [("A", 1000), ("B", 800), ("C", 667), ("D", 333)]
    );
}

#[test]
fn best_speed_tie_takes_the_lower_time() {
    let day = assigned_area_day(
        hours(2.),
        vec![
            finisher("A", 300., hours(3.)),
            finisher("B", 250., hours(2.5)),
        ],
    );

    let result = score(&day);

    assert_eq!(result.parameters.v0, 100.);
    assert_eq!(result.parameters.t0, Some(hours(2.5)));
    assert_eq!(result.parameters.pm, 800.);
}

#[test]
fn distance_limits_the_maximum_points() {
    let day = racing_day(150., vec![finisher("A", 150., hours(3.))]);

    let result = score(&day);

    assert_eq!(result.parameters.pm, 500.);
    assert_eq!(day_scores(&result), [("A", 500)]);
}

#[test]
fn did_not_fly_results_stay_out_of_the_day_parameters() {
    let day = racing_day(
        300.,
        vec![
            finisher("A", 300., hours(3.)),
            competitor("B", ResultStatus::DidNotFly),
        ],
    );

    let result = score(&day);

    assert_eq!(result.parameters.n, 1);
    assert_eq!(day_scores(&result), [("A", 1000), ("B", 0)]);
    assert_eq!(
        (result.rows[1].distance, result.rows[1].speed),
        (None, None)
    );
}

#[test]
fn landing_without_distance_counts_with_zero_points() {
    let day = racing_day(300., vec![finisher("A", 300., hours(3.)), landed("B", 0.)]);

    let result = score(&day);

    assert_eq!(result.parameters.n, 2);
    assert_eq!(result.parameters.f, 0.625);
    assert_eq!(result.rows[1].distance, Some(0.));
    assert_eq!(day_scores(&result), [("A", 625), ("B", 0)]);
}

#[test]
fn finish_before_the_start_is_an_error() {
    let day = racing_day(
        300.,
        vec![timed_finisher(
            "A",
            time_of_day(13, 0),
            time_of_day(10, 0),
            0.,
        )],
    );

    let error = score_class_day(&day).unwrap_err();

    let competition_id = "A".into();
    assert_eq!(error, ScoringError::FinishNotAfterStart { competition_id });
    assert_eq!(error.to_string(), "A finished at or before the start");
}

#[test]
fn finish_at_the_start_is_an_error() {
    let start = time_of_day(13, 0);
    let day = racing_day(300., vec![timed_finisher("A", start, start, 0.)]);

    let error = score_class_day(&day).unwrap_err();

    let competition_id = "A".into();
    assert_eq!(error, ScoringError::FinishNotAfterStart { competition_id });
}

#[test]
fn day_where_a_quarter_reached_dm_fails_the_validity_rule() {
    let day = racing_day(
        300.,
        vec![
            finisher("A", 300., hours(3.)),
            landed("B", 99.),
            landed("C", 50.),
            landed("D", 20.),
        ],
    );

    let result = score(&day);

    assert_eq!(result.validity, DayValidity::Invalid);
    assert_eq!(
        day_scores(&result),
        [("A", 0), ("B", 0), ("C", 0), ("D", 0)]
    );
    assert!(result.rows.iter().all(|row| row.score == 0.));
}

#[test]
fn day_where_more_than_a_quarter_reached_dm_is_valid() {
    let day = racing_day(
        300.,
        vec![
            finisher("A", 300., hours(3.)),
            landed("B", 100.),
            landed("C", 50.),
            landed("D", 20.),
        ],
    );

    let result = score(&day);

    assert_eq!(result.validity, DayValidity::Valid);
    assert_eq!(result.parameters.f, 0.625);
    assert_eq!(result.rows[0].day_score, 625);
}

#[test]
fn day_without_anyone_flying_fails_the_validity_rule() {
    let day = racing_day(300., vec![competitor("A", ResultStatus::DidNotFly)]);

    let result = score(&day);

    assert_eq!(result.validity, DayValidity::Invalid);
    assert_eq!(result.parameters.n, 0);
    assert_eq!(result.parameters.f, 0.);
    assert_eq!(day_scores(&result), [("A", 0)]);
}

fn penalised(penalty: u32, competitor: CompetitorResult) -> CompetitorResult {
    CompetitorResult {
        penalty,
        ..competitor
    }
}

#[test]
fn penalty_is_deducted_after_the_formula_without_changing_day_parameters() {
    let competitors = vec![
        finisher("A", 300., hours(3.)),
        finisher("B", 300., hours(3.75)),
    ];
    let unpenalised = score(&racing_day(300., competitors.clone()));
    let mut penalised_competitors = competitors;
    penalised_competitors[0] = penalised(100, penalised_competitors[0].clone());

    let result = score(&racing_day(300., penalised_competitors));

    assert_eq!(result.parameters, unpenalised.parameters);
    assert_eq!(result.rows[0].score, unpenalised.rows[0].score - 100.);
    assert_eq!(result.rows[1], unpenalised.rows[1]);
}

#[test]
fn penalty_larger_than_the_score_floors_the_day_score_at_zero() {
    let day = racing_day(
        300.,
        vec![
            finisher("A", 300., hours(3.)),
            penalised(5000, finisher("B", 300., hours(3.75))),
        ],
    );

    let result = score(&day);

    assert_eq!(result.rows[1].score, 0.);
    assert_eq!(day_scores(&result), [("A", 1000), ("B", 0)]);
}

#[test]
fn only_the_day_score_is_rounded_with_halves_away_from_zero() {
    let day = racing_day(
        110.5,
        vec![finisher("A", 110.5, hours(3.)), landed("B", 100.123_456)],
    );

    let result = score(&day);

    assert_eq!(result.parameters.pm, 302.5);
    assert_eq!(result.rows[0].speed, Some(110.5 / 3.));
    assert_eq!(result.rows[0].score, 302.5);
    assert_eq!(result.rows[0].day_score, 303);
    assert_eq!(result.rows[1].distance, Some(100.123_456));
}

#[test]
fn racing_task_finisher_flies_the_task_distance() {
    let day = racing_day(300., vec![finisher("A", 0., hours(3.))]);

    let result = score(&day);

    assert_eq!(result.rows[0].distance, Some(300.));
    assert_eq!(result.rows[0].speed, Some(100.));
}

#[test]
fn assigned_area_finisher_is_raised_to_the_minimum_task_time() {
    let day = assigned_area_day(
        hours(3.),
        vec![
            timed_finisher("A", time_of_day(10, 0), time_of_day(12, 30), 270.),
            timed_finisher("B", time_of_day(10, 0), time_of_day(13, 30), 280.),
        ],
    );

    let result = score(&day);

    assert_eq!(result.rows[0].distance, Some(270.));
    assert_eq!(result.rows[0].speed, Some(90.));
    assert_eq!(result.rows[1].speed, Some(80.));
    assert_eq!(result.parameters.t0, Some(hours(3.)));
}

fn standings(result: &DayResult) -> Vec<(&str, Standing)> {
    let rows = result.rows.iter();
    rows.map(|row| (row.competition_id.as_str(), row.standing))
        .collect()
}

#[test]
fn equal_day_scores_share_a_rank_and_skip_the_next() {
    let day = racing_day(
        300.,
        vec![
            finisher("D", 300., hours(5.)),
            finisher("B", 300., hours(3.75)),
            finisher("C", 300., hours(3.75)),
            finisher("A", 300., hours(3.)),
        ],
    );

    let result = score(&day);

    assert_eq!(
        standings(&result),
        [
            ("A", Standing::Ranked(1)),
            ("B", Standing::Ranked(2)),
            ("C", Standing::Ranked(2)),
            ("D", Standing::Ranked(4)),
        ]
    );
}

#[test]
fn tied_rows_order_by_unrounded_score_then_competition_id() {
    let day = racing_day(
        300.,
        vec![
            finisher("A", 300., hours(3.)),
            finisher("Z", 300., hours(3.75)),
            finisher("Y", 300., hours(3.75)),
            finisher("X", 300., hours(3.7501)),
        ],
    );

    let result = score(&day);

    assert_eq!(result.rows[3].day_score, result.rows[1].day_score);
    assert_eq!(
        standings(&result),
        [
            ("A", Standing::Ranked(1)),
            ("Y", Standing::Ranked(2)),
            ("Z", Standing::Ranked(2)),
            ("X", Standing::Ranked(2)),
        ]
    );
}

#[test]
fn did_not_fly_results_are_unranked_below_the_ranked_rows() {
    let day = racing_day(
        300.,
        vec![
            competitor("B", ResultStatus::DidNotFly),
            finisher("A", 300., hours(3.)),
        ],
    );

    let result = score(&day);

    assert_eq!(
        standings(&result),
        [("A", Standing::Ranked(1)), ("B", Standing::DidNotFly),]
    );
}

#[test]
fn launched_competitor_without_a_valid_start_shares_the_last_rank_with_zero_points() {
    let day = racing_day(
        300.,
        vec![
            landed("C", 0.),
            finisher("A", 300., hours(3.)),
            penalised(5000, finisher("B", 300., hours(3.))),
        ],
    );

    let result = score(&day);

    assert_eq!(
        standings(&result),
        [
            ("A", Standing::Ranked(1)),
            ("B", Standing::Ranked(2)),
            ("C", Standing::Ranked(2)),
        ]
    );
}

fn hors_concours(competitor: CompetitorResult) -> CompetitorResult {
    CompetitorResult {
        hors_concours: true,
        ..competitor
    }
}

#[test]
fn hors_concours_rows_are_scored_but_unranked_and_never_change_other_points() {
    let competitors = vec![finisher("A", 300., hours(3.75)), landed("B", 150.)];
    let without_guest = score(&racing_day(300., competitors.clone()));
    let mut with_guest_competitors = competitors;
    with_guest_competitors.insert(0, hors_concours(finisher("G", 300., hours(3.))));

    let result = score(&racing_day(300., with_guest_competitors));

    assert_eq!(result.parameters, without_guest.parameters);
    assert_eq!(result.rows[..2], without_guest.rows[..]);
    assert_eq!(result.rows[2].competition_id, "G");
    assert_eq!(result.rows[2].standing, Standing::HorsConcours);
    assert_eq!(result.rows[2].speed, Some(100.));
    assert_eq!(result.rows[2].day_score, 1250);
}
