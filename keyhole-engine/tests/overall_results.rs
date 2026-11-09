use keyhole_engine::day_scoring::{Row, Standing};
use keyhole_engine::overall_results::{
    ClassDayScores, Competitor, OverallRow, OverallStanding, overall_results,
};

fn competitor(competition_id: &str) -> Competitor {
    Competitor {
        competition_id: competition_id.into(),
    }
}

fn row(competition_id: &str, rank: u32, score: f64) -> Row {
    Row {
        standing: Standing::Ranked(rank),
        competition_id: competition_id.into(),
        distance: None,
        speed: None,
        score,
        day_score: score.round() as u32,
    }
}

fn totals(rows: &[OverallRow]) -> Vec<(&str, OverallStanding, u32)> {
    let rows = rows.iter();
    rows.map(|row| (row.competition_id.as_str(), row.standing, row.total))
        .collect()
}

#[test]
fn totals_sum_rounded_day_scores_and_equal_totals_share_a_rank() {
    let competitors = ["A", "B", "C", "D"].map(competitor);
    let day_1 = [
        row("A", 1, 600.4),
        row("B", 2, 500.),
        row("C", 3, 400.4),
        row("D", 4, 300.),
    ];
    let day_2 = [
        row("D", 1, 700.),
        row("C", 2, 500.4),
        row("A", 3, 400.4),
        row("B", 4, 300.),
    ];
    let days = [
        ClassDayScores::Counting(&day_1),
        ClassDayScores::Counting(&day_2),
    ];

    let rows = overall_results(&competitors, &days);

    assert_eq!(
        totals(&rows),
        [
            ("A", OverallStanding::Ranked(1), 1000),
            ("D", OverallStanding::Ranked(1), 1000),
            ("C", OverallStanding::Ranked(3), 900),
            ("B", OverallStanding::Ranked(4), 800),
        ]
    );
}

#[test]
fn rows_with_equal_unrounded_totals_order_by_competition_id() {
    let competitors = ["B", "A"].map(competitor);
    let day = [row("B", 1, 500.), row("A", 1, 500.)];

    let rows = overall_results(&competitors, &[ClassDayScores::Counting(&day)]);

    assert_eq!(
        totals(&rows),
        [
            ("A", OverallStanding::Ranked(1), 500),
            ("B", OverallStanding::Ranked(1), 500),
        ]
    );
}

#[test]
fn practice_days_and_cancelled_days_are_left_out() {
    let competitors = ["A", "B"].map(competitor);
    let practice_day = [row("B", 1, 1000.), row("A", 2, 100.)];
    let day = [row("A", 1, 500.), row("B", 2, 400.)];
    let days = [
        ClassDayScores::Practice(&practice_day),
        ClassDayScores::Cancelled,
        ClassDayScores::Counting(&day),
    ];

    let rows = overall_results(&competitors, &days);

    assert_eq!(
        totals(&rows),
        [
            ("A", OverallStanding::Ranked(1), 500),
            ("B", OverallStanding::Ranked(2), 400),
        ]
    );
}

fn unranked(competition_id: &str, standing: Standing) -> Row {
    Row {
        standing,
        ..row(competition_id, 0, 0.)
    }
}

#[test]
fn invalid_days_and_did_not_fly_results_count_as_zero() {
    let competitors = ["A", "B"].map(competitor);
    let day_1 = [row("A", 1, 0.), row("B", 1, 0.)];
    let day_2 = [row("B", 1, 300.), unranked("A", Standing::DidNotFly)];
    let day_3 = [row("A", 1, 400.), row("B", 2, 200.)];
    let days = [
        ClassDayScores::Counting(&day_1),
        ClassDayScores::Counting(&day_2),
        ClassDayScores::Counting(&day_3),
    ];

    let rows = overall_results(&competitors, &days);

    assert_eq!(
        totals(&rows),
        [
            ("B", OverallStanding::Ranked(1), 500),
            ("A", OverallStanding::Ranked(2), 400),
        ]
    );
}
