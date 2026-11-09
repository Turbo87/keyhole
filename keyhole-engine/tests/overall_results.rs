use keyhole_engine::day_scoring::{DayValidity, Row, Standing};
use keyhole_engine::overall_results::{
    ClassDayScores, Competitor, OverallResultsError, OverallRow, OverallStanding, overall_results,
};
use keyhole_engine::rule_sets::{DAEC_SWO_2026, FAI_ANNEX_A_2025A};

fn competitor(competition_id: &str) -> Competitor {
    Competitor {
        competition_id: competition_id.into(),
        hors_concours: false,
        competition_disqualified: false,
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

fn counting(rows: &[Row]) -> ClassDayScores<'_> {
    ClassDayScores::Counting {
        rows,
        validity: DayValidity::Valid,
    }
}

fn invalid(rows: &[Row]) -> ClassDayScores<'_> {
    ClassDayScores::Counting {
        rows,
        validity: DayValidity::Invalid,
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
    let days = [counting(&day_1), counting(&day_2)];

    let rows = overall_results(&DAEC_SWO_2026, &competitors, &days).unwrap();

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

    let rows = overall_results(&DAEC_SWO_2026, &competitors, &[counting(&day)]).unwrap();

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
        counting(&day),
    ];

    let rows = overall_results(&DAEC_SWO_2026, &competitors, &days).unwrap();

    assert_eq!(
        totals(&rows),
        [
            ("A", OverallStanding::Ranked(1), 500),
            ("B", OverallStanding::Ranked(2), 400),
        ]
    );
}

fn unranked(competition_id: &str, standing: Standing, score: f64) -> Row {
    Row {
        standing,
        ..row(competition_id, 0, score)
    }
}

#[test]
fn invalid_days_and_did_not_fly_results_count_as_zero() {
    let competitors = ["A", "B"].map(competitor);
    let day_1 = [row("A", 1, 0.), row("B", 1, 0.)];
    let day_2 = [row("B", 1, 300.), unranked("A", Standing::DidNotFly, 0.)];
    let day_3 = [row("A", 1, 400.), row("B", 2, 200.)];
    let days = [invalid(&day_1), counting(&day_2), counting(&day_3)];

    let rows = overall_results(&DAEC_SWO_2026, &competitors, &days).unwrap();

    assert_eq!(
        totals(&rows),
        [
            ("B", OverallStanding::Ranked(1), 500),
            ("A", OverallStanding::Ranked(2), 400),
        ]
    );
}

#[test]
fn hors_concours_and_competition_disqualified_competitors_are_unranked_below() {
    let competitors = [
        competitor("A"),
        competitor("B"),
        Competitor {
            hors_concours: true,
            ..competitor("C")
        },
        Competitor {
            competition_disqualified: true,
            ..competitor("D")
        },
    ];
    let day = [
        unranked("C", Standing::HorsConcours, 900.),
        row("A", 1, 800.),
        row("B", 2, 600.),
        unranked("D", Standing::CompetitionDisqualified, 0.),
    ];

    let rows = overall_results(&DAEC_SWO_2026, &competitors, &[counting(&day)]).unwrap();

    assert_eq!(
        totals(&rows),
        [
            ("A", OverallStanding::Ranked(1), 800),
            ("B", OverallStanding::Ranked(2), 600),
            ("C", OverallStanding::HorsConcours, 900),
            ("D", OverallStanding::CompetitionDisqualified, 0),
        ]
    );
}

#[test]
fn podium_tie_is_broken_by_daily_first_places_under_annex_a_and_shared_under_the_swo() {
    let competitors = ["A", "B"].map(competitor);
    let day_1 = [row("A", 1, 600.), row("B", 2, 400.4)];
    let day_2 = [row("B", 1, 600.), row("A", 2, 400.)];
    let day_3 = [row("A", 1, 500.), row("B", 2, 500.4)];
    let days = [counting(&day_1), counting(&day_2), counting(&day_3)];

    let annex_a = overall_results(&FAI_ANNEX_A_2025A, &competitors, &days).unwrap();
    let swo = overall_results(&DAEC_SWO_2026, &competitors, &days).unwrap();

    assert_eq!(
        totals(&annex_a),
        [
            ("A", OverallStanding::Ranked(1), 1500),
            ("B", OverallStanding::Ranked(2), 1500),
        ]
    );
    assert_eq!(
        totals(&swo),
        [
            ("B", OverallStanding::Ranked(1), 1500),
            ("A", OverallStanding::Ranked(1), 1500),
        ]
    );
}

#[test]
fn podium_countback_moves_on_to_lower_daily_places_when_first_places_are_equal() {
    let competitors = ["A", "B", "X", "Y"].map(competitor);
    let day_1 = [
        row("X", 1, 1000.),
        row("A", 2, 700.),
        row("B", 3, 600.),
        row("Y", 4, 100.),
    ];
    let day_2 = [
        row("X", 1, 1000.),
        row("B", 2, 700.),
        row("Y", 3, 650.),
        row("A", 4, 600.),
    ];
    let days = [counting(&day_1), counting(&day_2)];

    let rows = overall_results(&FAI_ANNEX_A_2025A, &competitors, &days).unwrap();

    assert_eq!(
        totals(&rows),
        [
            ("X", OverallStanding::Ranked(1), 2000),
            ("B", OverallStanding::Ranked(2), 1300),
            ("A", OverallStanding::Ranked(3), 1300),
            ("Y", OverallStanding::Ranked(4), 750),
        ]
    );
}

#[test]
fn podium_tie_with_equal_daily_places_stays_shared_under_annex_a() {
    let competitors = ["A", "B"].map(competitor);
    let day_1 = [row("A", 1, 600.), row("B", 2, 400.)];
    let day_2 = [row("B", 1, 600.), row("A", 2, 400.)];
    let days = [counting(&day_1), counting(&day_2)];

    let rows = overall_results(&FAI_ANNEX_A_2025A, &competitors, &days).unwrap();

    assert_eq!(
        totals(&rows),
        [
            ("A", OverallStanding::Ranked(1), 1000),
            ("B", OverallStanding::Ranked(1), 1000),
        ]
    );
}

#[test]
fn tie_below_the_podium_stays_shared_under_annex_a() {
    let competitors = ["E", "F", "G", "W", "X", "Y"].map(competitor);
    let day_1 = [
        row("X", 1, 1000.),
        row("Y", 2, 900.),
        row("W", 3, 800.),
        row("E", 4, 300.),
        row("F", 5, 200.),
        row("G", 6, 100.),
    ];
    let day_2 = [
        row("X", 1, 1000.),
        row("Y", 2, 900.),
        row("W", 3, 800.),
        row("F", 4, 400.),
        row("G", 5, 350.),
        row("E", 6, 300.),
    ];
    let days = [counting(&day_1), counting(&day_2)];

    let rows = overall_results(&FAI_ANNEX_A_2025A, &competitors, &days).unwrap();

    assert_eq!(
        totals(&rows),
        [
            ("X", OverallStanding::Ranked(1), 2000),
            ("Y", OverallStanding::Ranked(2), 1800),
            ("W", OverallStanding::Ranked(3), 1600),
            ("E", OverallStanding::Ranked(4), 600),
            ("F", OverallStanding::Ranked(4), 600),
            ("G", OverallStanding::Ranked(6), 450),
        ]
    );
}

#[test]
fn podium_countback_leaves_out_places_on_invalid_days() {
    let competitors = ["A", "B"].map(competitor);
    let day_1 = [row("A", 1, 500.), row("B", 2, 400.)];
    let day_2 = [row("B", 1, 500.), row("A", 2, 400.)];
    let invalid_day = [row("A", 1, 0.), unranked("B", Standing::DidNotFly, 0.)];
    let days = [counting(&day_1), counting(&day_2), invalid(&invalid_day)];

    let rows = overall_results(&FAI_ANNEX_A_2025A, &competitors, &days).unwrap();

    assert_eq!(
        totals(&rows),
        [
            ("A", OverallStanding::Ranked(1), 900),
            ("B", OverallStanding::Ranked(1), 900),
        ]
    );
}

#[test]
fn row_ranked_zero_is_an_error() {
    let competitors = ["A"].map(competitor);
    let day = [row("A", 0, 500.)];

    let error = overall_results(&FAI_ANNEX_A_2025A, &competitors, &[counting(&day)]).unwrap_err();

    let competition_id = "A".into();
    assert_eq!(error, OverallResultsError::RankedZero { competition_id });
    assert_eq!(error.to_string(), "A is ranked 0 on a class day");
}
