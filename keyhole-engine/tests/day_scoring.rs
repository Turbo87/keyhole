use std::time::Duration;

use keyhole_engine::day_scoring::{
    Achievement, ClassDay, CompetitorResult, DayResult, DayValidity, Rank, ResultStatus,
    ScoringParameters, score_class_day,
};

fn hours(hours: f64) -> Duration {
    Duration::from_secs_f64(hours * 3600.)
}

fn class_day(competitors: Vec<CompetitorResult>) -> ClassDay {
    ClassDay {
        parameters: ScoringParameters {
            dm: 100.,
            d1: 250.,
            minimum_task_time: None,
        },
        competitors,
    }
}

fn assigned_area_day(minimum_task_time: Duration, competitors: Vec<CompetitorResult>) -> ClassDay {
    let mut day = class_day(competitors);
    day.parameters.minimum_task_time = Some(minimum_task_time);
    day
}

fn competitor(competition_id: &str, result: ResultStatus) -> CompetitorResult {
    CompetitorResult {
        competition_id: competition_id.into(),
        result,
        hors_concours: false,
        disqualified: false,
        penalty: 0,
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

fn penalised(penalty: u32, competitor: CompetitorResult) -> CompetitorResult {
    CompetitorResult {
        penalty,
        ..competitor
    }
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

#[test]
fn penalty_is_deducted_after_the_formula_without_changing_day_parameters() {
    let competitors = vec![
        finisher("A", 300., hours(3.)),
        finisher("B", 300., hours(3.75)),
    ];
    let unpenalised = score_class_day(&class_day(competitors.clone()));
    let mut penalised_competitors = competitors;
    penalised_competitors[0].penalty = 100;

    let result = score_class_day(&class_day(penalised_competitors));

    assert_eq!(result.parameters, unpenalised.parameters);
    assert_eq!(
        result.rows[0].raw_score,
        unpenalised.rows[0].raw_score - 100.
    );
    assert_eq!(result.rows[1], unpenalised.rows[1]);
}

#[test]
fn penalty_larger_than_the_score_floors_the_day_score_at_zero() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        penalised(5000, finisher("B", 300., hours(3.75))),
    ]);

    let result = score_class_day(&day);

    assert_eq!(result.rows[1].raw_score, 0.);
    assert_eq!(day_scores(&result), [("A", 1000), ("B", 0)]);
}

#[test]
fn assigned_area_finisher_is_raised_to_the_minimum_task_time() {
    let day = assigned_area_day(
        hours(3.),
        vec![
            finisher("A", 270., hours(2.5)),
            finisher("B", 280., hours(3.5)),
        ],
    );

    let result = score_class_day(&day);

    assert_eq!(result.rows[0].distance, Some(270.));
    assert_eq!(result.rows[0].speed, Some(90.));
    assert_eq!(result.rows[1].speed, Some(80.));
    assert_eq!(result.parameters.t0, Some(hours(3.)));
}

fn ranks(result: &DayResult) -> Vec<(&str, Rank)> {
    let rows = result.rows.iter();
    rows.map(|row| (row.competition_id.as_str(), row.rank))
        .collect()
}

#[test]
fn equal_day_scores_share_a_rank_and_skip_the_next() {
    let day = class_day(vec![
        finisher("D", 300., hours(5.)),
        finisher("B", 300., hours(3.75)),
        finisher("C", 300., hours(3.75)),
        finisher("A", 300., hours(3.)),
    ]);

    let result = score_class_day(&day);

    assert_eq!(
        ranks(&result),
        [
            ("A", Rank::Ranked(1)),
            ("B", Rank::Ranked(2)),
            ("C", Rank::Ranked(2)),
            ("D", Rank::Ranked(4)),
        ]
    );
}

#[test]
fn tied_rows_order_by_unrounded_score_then_competition_id() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        finisher("Z", 300., hours(3.75)),
        finisher("Y", 300., hours(3.75)),
        finisher("X", 300., hours(3.7501)),
    ]);

    let result = score_class_day(&day);

    assert_eq!(result.rows[3].score, result.rows[1].score);
    assert_eq!(
        ranks(&result),
        [
            ("A", Rank::Ranked(1)),
            ("Y", Rank::Ranked(2)),
            ("Z", Rank::Ranked(2)),
            ("X", Rank::Ranked(2)),
        ]
    );
}

#[test]
fn did_not_fly_results_are_unranked_below_the_ranked_rows() {
    let day = class_day(vec![
        competitor("B", ResultStatus::DidNotFly),
        finisher("A", 300., hours(3.)),
    ]);

    let result = score_class_day(&day);

    assert_eq!(
        ranks(&result),
        [("A", Rank::Ranked(1)), ("B", Rank::DidNotFly),]
    );
}

#[test]
fn launched_competitor_without_a_valid_start_shares_the_last_rank_with_zero_points() {
    let day = class_day(vec![
        landed("C", 0.),
        finisher("A", 300., hours(3.)),
        penalised(5000, finisher("B", 300., hours(3.))),
    ]);

    let result = score_class_day(&day);

    assert_eq!(
        ranks(&result),
        [
            ("A", Rank::Ranked(1)),
            ("B", Rank::Ranked(2)),
            ("C", Rank::Ranked(2)),
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
fn hors_concours_rows_are_listed_by_score_without_a_rank_and_never_change_other_points() {
    let competitors = vec![finisher("A", 300., hours(3.75)), landed("B", 150.)];
    let without_guest = score_class_day(&class_day(competitors.clone()));
    let mut with_guest_competitors = competitors;
    with_guest_competitors.push(hors_concours(finisher("G", 300., hours(3.))));

    let result = score_class_day(&class_day(with_guest_competitors));

    assert_eq!(result.parameters, without_guest.parameters);
    assert_eq!(result.rows[1..], without_guest.rows[..]);
    assert_eq!(
        ranks(&result),
        [
            ("G", Rank::HorsConcours),
            ("A", Rank::Ranked(1)),
            ("B", Rank::Ranked(2)),
        ]
    );
    assert_eq!(result.rows[0].speed, Some(100.));
    assert_eq!(result.rows[0].score, 1250);
}

#[test]
fn hors_concours_marker_takes_precedence_over_did_not_fly() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        hors_concours(competitor("G", ResultStatus::DidNotFly)),
    ]);

    let result = score_class_day(&day);

    assert_eq!(
        ranks(&result),
        [("A", Rank::Ranked(1)), ("G", Rank::HorsConcours)]
    );
}

#[test]
fn day_without_competitors_who_are_not_hors_concours_is_invalid() {
    let day = class_day(vec![hors_concours(finisher("G", 300., hours(3.)))]);

    let result = score_class_day(&day);

    assert_eq!(result.parameters.n, 0);
    assert_eq!(result.validity, DayValidity::Invalid);
    assert_eq!(day_scores(&result), [("G", 0)]);
}

#[test]
fn disqualified_row_scores_zero_unranked_and_still_feeds_the_day_parameters() {
    let competitors = vec![
        finisher("A", 300., hours(3.)),
        finisher("B", 300., hours(3.75)),
    ];
    let undisqualified = score_class_day(&class_day(competitors.clone()));
    let mut disqualified_competitors = competitors;
    disqualified_competitors[0].disqualified = true;

    let result = score_class_day(&class_day(disqualified_competitors));

    assert_eq!(result.parameters, undisqualified.parameters);
    assert_eq!(
        ranks(&result),
        [("B", Rank::Ranked(1)), ("A", Rank::Disqualified),]
    );
    assert_eq!(result.rows[0].raw_score, undisqualified.rows[1].raw_score);
    assert_eq!((result.rows[1].raw_score, result.rows[1].score), (0., 0));
    assert_eq!(result.rows[1].speed, Some(100.));
}

fn disqualified(competitor: CompetitorResult) -> CompetitorResult {
    CompetitorResult {
        disqualified: true,
        ..competitor
    }
}

#[test]
fn disqualified_rows_are_listed_below_ranked_rows_and_above_did_not_fly_rows() {
    let day = class_day(vec![
        competitor("A", ResultStatus::DidNotFly),
        disqualified(finisher("B", 300., hours(3.))),
        landed("C", 0.),
        finisher("D", 300., hours(3.)),
    ]);

    let result = score_class_day(&day);

    assert_eq!(
        ranks(&result),
        [
            ("D", Rank::Ranked(1)),
            ("C", Rank::Ranked(2)),
            ("B", Rank::Disqualified),
            ("A", Rank::DidNotFly),
        ]
    );
}

#[test]
fn disqualified_marker_takes_precedence_over_hors_concours_and_did_not_fly() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        disqualified(hors_concours(finisher("B", 300., hours(3.)))),
        disqualified(competitor("C", ResultStatus::DidNotFly)),
    ]);

    let result = score_class_day(&day);

    assert_eq!(
        ranks(&result),
        [
            ("A", Rank::Ranked(1)),
            ("B", Rank::Disqualified),
            ("C", Rank::Disqualified),
        ]
    );
}

#[test]
fn penalty_leaves_a_disqualified_row_at_zero() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        penalised(50, disqualified(finisher("B", 300., hours(3.)))),
    ]);

    let result = score_class_day(&day);

    assert_eq!(day_scores(&result), [("A", 1000), ("B", 0)]);
}
