use insta::assert_snapshot;
use keyhole_engine::day_scoring::{DayParameters, DayResult, DayValidity, Rank, Row};
use keyhole_engine::overall_results::{OverallRank, OverallRow, overall_results};

fn day(rows: Vec<Row>) -> DayResult {
    let parameters = DayParameters {
        n: 0,
        n1: 0,
        n2: 0,
        dm: 100.,
        d1: 250.,
        d0: 0.,
        v0: 0.,
        t0: None,
        pm: 0.,
        pvm: 0.,
        pdm: 0.,
        f: 0.,
        fcr: 0.,
    };
    DayResult {
        parameters,
        validity: DayValidity::Valid,
        rows,
    }
}

fn invalid_day(rows: Vec<Row>) -> DayResult {
    DayResult {
        validity: DayValidity::Invalid,
        ..day(rows)
    }
}

fn row(rank: Rank, competition_id: &str, raw_score: f64) -> Row {
    Row {
        rank,
        competition_id: competition_id.into(),
        distance: None,
        speed: None,
        raw_score,
        score: raw_score.round() as u32,
    }
}

fn ranked(place: u32, competition_id: &str, raw_score: f64) -> Row {
    row(Rank::Ranked(place), competition_id, raw_score)
}

/// Renders the rows with every unrounded total to six decimals.
fn table(rows: &[OverallRow]) -> String {
    let line = |[rank, cn, raw_total, total]: [&str; 4]| {
        format!("{rank:4}  {cn:2}  {raw_total:>10}  {total:>5}")
    };
    let mut lines = vec![line(["rank", "cn", "raw total", "total"])];
    lines.extend(rows.iter().map(|row| {
        let rank = match row.rank {
            OverallRank::Ranked(rank) => rank.to_string(),
            OverallRank::HorsConcours => "HC".into(),
            OverallRank::Disqualified => "DSQ".into(),
        };
        let (raw_total, total) = (number(row.raw_total), row.total.to_string());
        line([&rank, &row.competition_id, &raw_total, &total])
    }));
    lines.join("\n")
}

fn number(value: f64) -> String {
    let number = format!("{value:.6}");
    number.trim_end_matches('0').trim_end_matches('.').into()
}

#[test]
fn total_is_the_sum_of_rounded_day_scores() {
    let days = [
        day(vec![ranked(1, "B", 600.6), ranked(2, "A", 400.4)]),
        day(vec![ranked(1, "A", 400.4), ranked(2, "B", 199.6)]),
    ];

    let rows = overall_results(&days, 0);

    // A's unrounded total is higher, but B's rounded day scores add up to more.
    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     B        800.2    801
    2     A        800.8    800
    ");
}

#[test]
fn did_not_fly_rows_invalid_days_and_absent_days_count_as_zero() {
    let days = [
        day(vec![
            ranked(1, "A", 800.),
            ranked(2, "C", 500.),
            row(Rank::DidNotFly, "B", 0.),
        ]),
        invalid_day(vec![ranked(1, "A", 0.), ranked(1, "B", 0.)]),
        day(vec![ranked(1, "B", 300.), ranked(2, "A", 200.)]),
    ];

    let rows = overall_results(&days, 0);

    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     A         1000   1000
    2     C          500    500
    3     B          300    300
    ");
}

#[test]
fn equal_totals_share_a_rank_and_skip_the_next() {
    let days = [day(vec![
        ranked(1, "A", 500.),
        ranked(1, "B", 500.),
        ranked(3, "C", 400.),
    ])];

    let rows = overall_results(&days, 0);

    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     A          500    500
    1     B          500    500
    3     C          400    400
    ");
}

#[test]
fn equal_totals_order_by_unrounded_total_then_competition_id() {
    let days = [day(vec![
        ranked(1, "B", 1000.4),
        ranked(1, "D", 1000.4),
        ranked(1, "A", 999.6),
    ])];

    let rows = overall_results(&days, 0);

    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     B       1000.4   1000
    1     D       1000.4   1000
    1     A        999.6   1000
    ");
}

#[test]
fn hors_concours_rows_are_listed_among_ranked_rows_without_a_rank() {
    let days = [
        day(vec![
            ranked(1, "A", 900.),
            row(Rank::HorsConcours, "H", 700.),
            ranked(2, "B", 300.),
        ]),
        day(vec![
            ranked(1, "A", 500.),
            ranked(2, "B", 200.),
            row(Rank::NoResultYet, "H", 0.),
        ]),
    ];

    let rows = overall_results(&days, 0);

    // A placeholder row hides the hors concours marker on the second day.
    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     A         1400   1400
    HC    H          700    700
    2     B          500    500
    ");
}

#[test]
fn disqualified_rows_are_listed_unranked_below_every_other_row() {
    let days = [
        day(vec![ranked(1, "B", 300.), ranked(2, "D", 200.)]),
        day(vec![
            ranked(1, "B", 100.),
            row(Rank::HorsConcours, "H", 50.),
            row(Rank::Disqualified, "D", 0.),
        ]),
    ];

    let rows = overall_results(&days, 0);

    // D's first day was published before the competition disqualification.
    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     B          400    400
    HC    H           50     50
    DSQ   D          200    200
    ");
}

/// Three class days on which B places 1, 1, 2 and A places 2, 2, 1 with equal
/// totals.
fn days_with_a_tie_for_first() -> [DayResult; 3] {
    [
        day(vec![ranked(1, "B", 500.), ranked(2, "A", 400.)]),
        day(vec![ranked(1, "B", 300.), ranked(2, "A", 200.)]),
        day(vec![ranked(1, "A", 600.), ranked(2, "B", 400.)]),
    ]
}

#[test]
fn countback_breaks_a_tie_by_daily_first_places() {
    let rows = overall_results(&days_with_a_tie_for_first(), 3);

    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     B         1200   1200
    2     A         1200   1200
    ");
}

#[test]
fn tie_stays_shared_without_countback_places() {
    let rows = overall_results(&days_with_a_tie_for_first(), 0);

    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     A         1200   1200
    1     B         1200   1200
    ");
}

#[test]
fn countback_compares_second_places_after_equal_first_places() {
    let days = [
        day(vec![
            ranked(1, "A", 600.),
            ranked(2, "B", 300.),
            ranked(3, "C", 150.),
        ]),
        day(vec![
            ranked(1, "B", 400.),
            ranked(2, "C", 250.),
            ranked(3, "A", 200.),
        ]),
        day(vec![
            ranked(1, "C", 500.),
            ranked(2, "B", 200.),
            ranked(3, "A", 100.),
        ]),
    ];

    let rows = overall_results(&days, 3);

    // A, B and C each have one first place, B has two second places and C one.
    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     B          900    900
    2     C          900    900
    3     A          900    900
    ");
}

#[test]
fn tie_with_equal_daily_places_stays_shared() {
    let days = [
        day(vec![ranked(1, "B", 500.), ranked(2, "A", 400.)]),
        day(vec![ranked(1, "A", 500.), ranked(2, "B", 400.)]),
    ];

    let rows = overall_results(&days, 3);

    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     A          900    900
    1     B          900    900
    ");
}

/// Three class days on which A places 1, 1, 3, B places 2, 2, 2 and C places
/// 3, 3, 1 with equal totals.
fn days_with_a_three_way_tie_for_first() -> [DayResult; 3] {
    [
        day(vec![
            ranked(1, "A", 400.),
            ranked(2, "B", 300.),
            ranked(3, "C", 200.),
        ]),
        day(vec![
            ranked(1, "A", 300.),
            ranked(2, "B", 200.),
            ranked(3, "C", 100.),
        ]),
        day(vec![
            ranked(1, "C", 600.),
            ranked(2, "B", 400.),
            ranked(3, "A", 200.),
        ]),
    ]
}

#[test]
fn countback_orders_every_tied_row_within_the_countback_places() {
    let rows = overall_results(&days_with_a_three_way_tie_for_first(), 3);

    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     A          900    900
    2     C          900    900
    3     B          900    900
    ");
}

#[test]
fn tie_that_reaches_past_the_countback_places_stays_shared_below_them() {
    let rows = overall_results(&days_with_a_three_way_tie_for_first(), 1);

    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     A          900    900
    2     C          900    900
    2     B          900    900
    ");
}

#[test]
fn tie_below_the_countback_places_stays_shared() {
    let days = [
        day(vec![
            ranked(1, "L", 1000.),
            ranked(2, "B", 500.),
            ranked(3, "A", 400.),
        ]),
        day(vec![
            ranked(1, "L", 1000.),
            ranked(2, "B", 300.),
            ranked(3, "A", 200.),
        ]),
        day(vec![
            ranked(1, "L", 1000.),
            ranked(2, "A", 600.),
            ranked(3, "B", 400.),
        ]),
    ];

    let rows = overall_results(&days, 1);

    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     L         3000   3000
    2     A         1200   1200
    2     B         1200   1200
    ");
}

#[test]
fn countback_skips_places_on_invalid_days() {
    let days = [
        day(vec![ranked(1, "B", 500.), ranked(2, "A", 400.)]),
        day(vec![ranked(1, "A", 500.), ranked(2, "B", 400.)]),
        invalid_day(vec![ranked(1, "B", 0.), row(Rank::DidNotFly, "A", 0.)]),
    ];

    let rows = overall_results(&days, 3);

    assert_snapshot!(table(&rows), @"
    rank  cn   raw total  total
    1     A          900    900
    1     B          900    900
    ");
}
