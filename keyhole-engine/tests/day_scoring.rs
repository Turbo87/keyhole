use std::time::Duration;

use keyhole_engine::day_scoring::{
    Achievement, ClassDay, CompetitorResult, DayResult, DayValidity, ResultStatus,
    ScoringParameters, score_class_day,
};

fn hours(hours: f64) -> Duration {
    Duration::from_secs_f64(hours * 3600.)
}

fn class_day(competitors: Vec<CompetitorResult>) -> ClassDay {
    ClassDay {
        parameters: ScoringParameters { dm: 100., d1: 250. },
        competitors,
    }
}

fn competitor(competition_id: &str, result: ResultStatus) -> CompetitorResult {
    CompetitorResult {
        competition_id: competition_id.into(),
        result,
    }
}

fn finisher(competition_id: &str, distance: f64, time: Duration) -> CompetitorResult {
    let achievement = Achievement {
        distance,
        time: Some(time),
    };
    competitor(competition_id, ResultStatus::Flown(achievement))
}

fn landed(competition_id: &str, distance: f64) -> CompetitorResult {
    let achievement = Achievement {
        distance,
        time: None,
    };
    competitor(competition_id, ResultStatus::Flown(achievement))
}

fn day_scores(result: &DayResult) -> Vec<(&str, u32)> {
    let rows = result.rows.iter();
    rows.map(|row| (row.competition_id.as_str(), row.score))
        .collect()
}

#[test]
fn lone_finisher_scores_the_day_maximum() {
    let day = class_day(vec![finisher("A", 300., hours(3.))]);

    let result = score_class_day(&day);

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
    assert_eq!(result.rows[0].score, 1000);
}

#[test]
fn day_without_finishers_drops_the_time_term_and_scores_distance_only() {
    let day = class_day(vec![landed("A", 200.), landed("B", 100.)]);

    let result = score_class_day(&day);

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
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        finisher("B", 300., hours(3.75)),
        finisher("C", 300., hours(5.)),
        landed("D", 150.),
    ]);

    let result = score_class_day(&day);

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
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        finisher("B", 250., hours(2.5)),
    ]);

    let result = score_class_day(&day);

    assert_eq!(result.parameters.v0, 100.);
    assert_eq!(result.parameters.t0, Some(hours(2.5)));
    assert_eq!(result.parameters.pm, 800.);
}

#[test]
fn distance_limits_the_maximum_points() {
    let day = class_day(vec![finisher("A", 150., hours(3.))]);

    let result = score_class_day(&day);

    assert_eq!(result.parameters.pm, 500.);
    assert_eq!(day_scores(&result), [("A", 500)]);
}

#[test]
fn did_not_fly_results_stay_out_of_the_day_parameters() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        competitor("B", ResultStatus::DidNotFly),
    ]);

    let result = score_class_day(&day);

    assert_eq!(result.parameters.n, 1);
    assert_eq!(day_scores(&result), [("A", 1000), ("B", 0)]);
    assert_eq!(
        (result.rows[1].distance, result.rows[1].speed),
        (None, None)
    );
}

#[test]
fn day_without_anyone_flying_has_finite_day_parameters() {
    let day = class_day(vec![competitor("A", ResultStatus::DidNotFly)]);

    let result = score_class_day(&day);

    assert_eq!(result.validity, DayValidity::Invalid);
    assert_eq!(result.parameters.n, 0);
    assert_eq!(result.parameters.pvm, 0.);
    assert_eq!(result.parameters.f, 0.);
    assert_eq!(day_scores(&result), [("A", 0)]);
}

#[test]
fn landing_without_distance_counts_with_zero_points() {
    let day = class_day(vec![finisher("A", 300., hours(3.)), landed("B", 0.)]);

    let result = score_class_day(&day);

    assert_eq!(result.parameters.n, 2);
    assert_eq!(result.parameters.f, 0.625);
    assert_eq!(result.rows[1].distance, Some(0.));
    assert_eq!(day_scores(&result), [("A", 625), ("B", 0)]);
}

#[test]
fn only_the_day_score_is_rounded_with_halves_away_from_zero() {
    let day = class_day(vec![
        finisher("A", 110.5, hours(3.)),
        landed("B", 100.123_456),
    ]);

    let result = score_class_day(&day);

    assert_eq!(result.parameters.pm, 302.5);
    assert_eq!(result.rows[0].speed, Some(110.5 / 3.));
    assert_eq!(result.rows[0].raw_score, 302.5);
    assert_eq!(result.rows[0].score, 303);
    assert_eq!(result.rows[1].distance, Some(100.123_456));
}

#[test]
fn day_where_a_quarter_reached_dm_fails_the_validity_rule() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        landed("B", 99.),
        landed("C", 50.),
        landed("D", 20.),
    ]);

    let result = score_class_day(&day);

    assert_eq!(result.validity, DayValidity::Invalid);
    assert_eq!(
        day_scores(&result),
        [("A", 0), ("B", 0), ("C", 0), ("D", 0)]
    );
    assert!(result.rows.iter().all(|row| row.raw_score == 0.));
}

#[test]
fn day_where_more_than_a_quarter_reached_dm_is_valid() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        landed("B", 100.),
        landed("C", 50.),
        landed("D", 20.),
    ]);

    let result = score_class_day(&day);

    assert_eq!(result.validity, DayValidity::Valid);
    assert_eq!(result.parameters.f, 0.625);
    assert_eq!(result.rows[0].score, 625);
}
