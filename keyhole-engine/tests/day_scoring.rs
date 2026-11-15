use std::time::Duration;

use insta::assert_snapshot;
use keyhole_engine::day_scoring::{
    Achievement, ClassDay, CompetitorResult, DayResult, Rank, ResultStatus, ScoringParameters,
    score_class_day,
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

/// Renders the validity, the day parameters and the rows, with every
/// unrounded value to six decimals.
fn table(result: &DayResult) -> String {
    let day = &result.parameters;
    let (n, n1, n2) = (day.n, day.n1, day.n2);
    let [dm, d1, d0, v0] = [day.dm, day.d1, day.d0, day.v0].map(number);
    let [pm, pvm, pdm, f, fcr] = [day.pm, day.pvm, day.pdm, day.f, day.fcr].map(number);
    let t0 = day.t0.map_or("-".into(), duration);
    let validity = format!("{:?}", result.validity);

    let line = |[rank, cn, distance, speed, raw_score, score]: [&str; 6]| {
        format!("{rank:4}  {cn:2}  {distance:>10}  {speed:>10}  {raw_score:>10}  {score:>5}")
    };

    let mut lines = vec![
        format!("{validity}  N={n} n1={n1} n2={n2}  Dm={dm} D1={d1} D0={d0} V0={v0} T0={t0}"),
        format!("Pm={pm} Pvm={pvm} Pdm={pdm} F={f} FCR={fcr}"),
        String::new(),
        line(["rank", "cn", "distance", "speed", "raw score", "score"]),
    ];
    lines.extend(result.rows.iter().map(|row| {
        let [distance, speed] = [row.distance, row.speed].map(optional);
        let (rank, cn) = (rank(row.rank), &row.competition_id);
        let (raw_score, score) = (number(row.raw_score), row.score.to_string());
        line([&rank, cn, &distance, &speed, &raw_score, &score])
    }));
    lines.join("\n")
}

fn rank(rank: Rank) -> String {
    match rank {
        Rank::Ranked(rank) => rank.to_string(),
        Rank::HorsConcours => "HC".into(),
        Rank::Disqualified => "DSQ".into(),
        Rank::DidNotFly => "DNF".into(),
    }
}

fn optional(value: Option<f64>) -> String {
    value.map_or("-".into(), number)
}

fn number(value: f64) -> String {
    let number = format!("{value:.6}");
    number.trim_end_matches('0').trim_end_matches('.').into()
}

/// Writes a duration as `h:mm:ss` with any fraction of a second.
fn duration(duration: Duration) -> String {
    let seconds = duration.as_secs();
    let (hours, minutes, seconds) = (seconds / 3600, seconds / 60 % 60, seconds % 60);
    let fraction = match duration.subsec_nanos() {
        0 => String::new(),
        nanos => format!(".{nanos:09}").trim_end_matches('0').into(),
    };
    format!("{hours}:{minutes:02}:{seconds:02}{fraction}")
}

#[test]
fn lone_finisher_scores_the_day_maximum() {
    let day = class_day(vec![finisher("A", 300., hours(3.))]);

    let result = score_class_day(&day);

    assert_snapshot!(table(&result), @"
    Valid  N=1 n1=1 n2=1  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=666.666667 Pdm=333.333333 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100        1000   1000
    ");
}

#[test]
fn day_without_finishers_drops_the_time_term_and_scores_distance_only() {
    let day = class_day(vec![landed("A", 200.), landed("B", 100.)]);

    let result = score_class_day(&day);

    assert_snapshot!(table(&result), @"
    Valid  N=2 n1=2 n2=0  Dm=100 D1=250 D0=200 V0=0 T0=-
    Pm=750 Pvm=0 Pdm=750 F=1 FCR=0.6

    rank  cn    distance       speed   raw score  score
    1     A          200           -         450    450
    2     B          100           -         225    225
    ");
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

    assert_snapshot!(table(&result), @"
    Valid  N=4 n1=4 n2=2  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=333.333333 Pdm=666.666667 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100        1000   1000
    2     B          300          80         800    800
    3     C          300          60  666.666667    667
    4     D          150           -  333.333333    333
    ");
}

#[test]
fn best_speed_tie_takes_the_lower_time() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        finisher("B", 250., hours(2.5)),
    ]);

    let result = score_class_day(&day);

    // B's lower time limits Pm to 400 * 2.5 - 200.
    assert_snapshot!(table(&result), @"
    Valid  N=2 n1=2 n2=2  Dm=100 D1=250 D0=300 V0=100 T0=2:30:00
    Pm=800 Pvm=533.333333 Pdm=266.666667 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100         800    800
    1     B          250         100         800    800
    ");
}

#[test]
fn distance_limits_the_maximum_points() {
    let day = class_day(vec![finisher("A", 150., hours(3.))]);

    let result = score_class_day(&day);

    // Pm is 1250 * 150 / 250 - 250.
    assert_snapshot!(table(&result), @"
    Valid  N=1 n1=1 n2=1  Dm=100 D1=250 D0=150 V0=50 T0=3:00:00
    Pm=500 Pvm=333.333333 Pdm=166.666667 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          150          50         500    500
    ");
}

#[test]
fn did_not_fly_results_stay_out_of_the_day_parameters() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        competitor("B", ResultStatus::DidNotFly),
    ]);

    let result = score_class_day(&day);

    assert_snapshot!(table(&result), @"
    Valid  N=1 n1=1 n2=1  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=666.666667 Pdm=333.333333 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100        1000   1000
    DNF   B            -           -           0      0
    ");
}

#[test]
fn day_without_anyone_flying_has_finite_day_parameters() {
    let day = class_day(vec![competitor("A", ResultStatus::DidNotFly)]);

    let result = score_class_day(&day);

    assert_snapshot!(table(&result), @"
    Invalid  N=0 n1=0 n2=0  Dm=100 D1=250 D0=0 V0=0 T0=-
    Pm=-250 Pvm=-0 Pdm=-250 F=0 FCR=0.6

    rank  cn    distance       speed   raw score  score
    DNF   A            -           -           0      0
    ");
}

#[test]
fn landing_without_distance_counts_with_zero_points() {
    let day = class_day(vec![finisher("A", 300., hours(3.)), landed("B", 0.)]);

    let result = score_class_day(&day);

    // B counts toward N, so only half of N reaches Dm and F drops to 0.625.
    assert_snapshot!(table(&result), @"
    Valid  N=2 n1=1 n2=1  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=333.333333 Pdm=666.666667 F=0.625 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100         625    625
    2     B            0           -           0      0
    ");
}

#[test]
fn only_the_day_score_is_rounded_with_halves_away_from_zero() {
    let day = class_day(vec![
        finisher("A", 110.5, hours(3.)),
        landed("B", 100.123_456),
    ]);

    let result = score_class_day(&day);

    // A's raw score of 302.5 rounds up while distances, speeds and day
    // parameters keep their decimals.
    assert_eq!(result.rows[0].raw_score, 302.5);
    assert_snapshot!(table(&result), @"
    Valid  N=2 n1=2 n2=1  Dm=100 D1=250 D0=110.5 V0=36.833333 T0=3:00:00
    Pm=302.5 Pvm=100.833333 Pdm=201.666667 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A        110.5   36.833333       302.5    303
    2     B   100.123456           -  182.729083    183
    ");
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

    assert_snapshot!(table(&result), @"
    Invalid  N=4 n1=1 n2=1  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=166.666667 Pdm=833.333333 F=0.3125 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100           0      0
    1     B           99           -           0      0
    1     C           50           -           0      0
    1     D           20           -           0      0
    ");
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

    assert_snapshot!(table(&result), @"
    Valid  N=4 n1=2 n2=1  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=166.666667 Pdm=833.333333 F=0.625 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100         625    625
    2     B          100           -  173.611111    174
    3     C           50           -   86.805556     87
    4     D           20           -   34.722222     35
    ");
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
    // Without the penalty, A scores 1000 and B 600.
    assert_snapshot!(table(&result), @"
    Valid  N=2 n1=2 n2=2  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=666.666667 Pdm=333.333333 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100         900    900
    2     B          300          80         600    600
    ");
}

#[test]
fn penalty_larger_than_the_score_floors_the_day_score_at_zero() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        penalised(5000, finisher("B", 300., hours(3.75))),
    ]);

    let result = score_class_day(&day);

    assert_snapshot!(table(&result), @"
    Valid  N=2 n1=2 n2=2  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=666.666667 Pdm=333.333333 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100        1000   1000
    2     B          300          80           0      0
    ");
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

    // A's speed and T0 use the 3 hour minimum task time instead of 2.5 hours.
    assert_snapshot!(table(&result), @"
    Valid  N=2 n1=2 n2=2  Dm=100 D1=250 D0=280 V0=90 T0=3:00:00
    Pm=1000 Pvm=666.666667 Pdm=333.333333 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          270          90        1000   1000
    2     B          280          80  777.777778    778
    ");
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

    assert_snapshot!(table(&result), @"
    Valid  N=4 n1=4 n2=3  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=500 Pdm=500 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100        1000   1000
    2     B          300          80         700    700
    2     C          300          80         700    700
    4     D          300          60         500    500
    ");
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

    // X's slightly longer time puts its raw score below Y and Z, while all
    // three round to the same day score and share a rank.
    assert_snapshot!(table(&result), @"
    Valid  N=4 n1=4 n2=4  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=666.666667 Pdm=333.333333 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100        1000   1000
    2     Y          300          80         600    600
    2     Z          300          80         600    600
    2     X          300   79.997867  599.957334    600
    ");
}

#[test]
fn did_not_fly_results_are_unranked_below_the_ranked_rows() {
    let day = class_day(vec![
        competitor("B", ResultStatus::DidNotFly),
        finisher("A", 300., hours(3.)),
    ]);

    let result = score_class_day(&day);

    assert_snapshot!(table(&result), @"
    Valid  N=1 n1=1 n2=1  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=666.666667 Pdm=333.333333 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100        1000   1000
    DNF   B            -           -           0      0
    ");
}

#[test]
fn launched_competitor_without_a_valid_start_shares_the_last_rank_with_zero_points() {
    let day = class_day(vec![
        landed("C", 0.),
        finisher("A", 300., hours(3.)),
        penalised(5000, finisher("B", 300., hours(3.))),
    ]);

    let result = score_class_day(&day);

    // C, credited with 0 km, ties with B, whose penalty zeroes its score.
    assert_snapshot!(table(&result), @"
    Valid  N=3 n1=2 n2=2  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=444.444444 Pdm=555.555556 F=0.833333 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100  833.333333    833
    2     B          300         100           0      0
    2     C            0           -           0      0
    ");
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
    // G is faster than V0, which comes from A, so it scores above 1000.
    assert_snapshot!(table(&result), @"
    Valid  N=2 n1=2 n2=1  Dm=100 D1=250 D0=300 V0=80 T0=3:45:00
    Pm=1000 Pvm=333.333333 Pdm=666.666667 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    HC    G          300         100        1250   1250
    1     A          300          80        1000   1000
    2     B          150           -  333.333333    333
    ");
}

#[test]
fn hors_concours_marker_takes_precedence_over_did_not_fly() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        hors_concours(competitor("G", ResultStatus::DidNotFly)),
    ]);

    let result = score_class_day(&day);

    assert_snapshot!(table(&result), @"
    Valid  N=1 n1=1 n2=1  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=666.666667 Pdm=333.333333 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100        1000   1000
    HC    G            -           -           0      0
    ");
}

#[test]
fn day_without_competitors_who_are_not_hors_concours_is_invalid() {
    let day = class_day(vec![hors_concours(finisher("G", 300., hours(3.)))]);

    let result = score_class_day(&day);

    assert_snapshot!(table(&result), @"
    Invalid  N=0 n1=0 n2=0  Dm=100 D1=250 D0=0 V0=0 T0=-
    Pm=-250 Pvm=-0 Pdm=-250 F=0 FCR=0.6

    rank  cn    distance       speed   raw score  score
    HC    G          300         100           0      0
    ");
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
    // Without the disqualification, A scores 1000 and B 600.
    assert_snapshot!(table(&result), @"
    Valid  N=2 n1=2 n2=2  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=666.666667 Pdm=333.333333 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     B          300          80         600    600
    DSQ   A          300         100           0      0
    ");
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

    assert_snapshot!(table(&result), @"
    Valid  N=3 n1=2 n2=2  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=444.444444 Pdm=555.555556 F=0.833333 FCR=1

    rank  cn    distance       speed   raw score  score
    1     D          300         100  833.333333    833
    2     C            0           -           0      0
    DSQ   B          300         100           0      0
    DNF   A            -           -           0      0
    ");
}

#[test]
fn disqualified_marker_takes_precedence_over_hors_concours_and_did_not_fly() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        disqualified(hors_concours(finisher("B", 300., hours(3.)))),
        disqualified(competitor("C", ResultStatus::DidNotFly)),
    ]);

    let result = score_class_day(&day);

    assert_snapshot!(table(&result), @"
    Valid  N=1 n1=1 n2=1  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=666.666667 Pdm=333.333333 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100        1000   1000
    DSQ   B          300         100           0      0
    DSQ   C            -           -           0      0
    ");
}

#[test]
fn penalty_leaves_a_disqualified_row_at_zero() {
    let day = class_day(vec![
        finisher("A", 300., hours(3.)),
        penalised(50, disqualified(finisher("B", 300., hours(3.)))),
    ]);

    let result = score_class_day(&day);

    assert_snapshot!(table(&result), @"
    Valid  N=2 n1=2 n2=2  Dm=100 D1=250 D0=300 V0=100 T0=3:00:00
    Pm=1000 Pvm=666.666667 Pdm=333.333333 F=1 FCR=1

    rank  cn    distance       speed   raw score  score
    1     A          300         100        1000   1000
    DSQ   B          300         100           0      0
    ");
}
