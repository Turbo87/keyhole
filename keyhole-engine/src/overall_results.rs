//! Adding up a class's day scores into its overall results.

use crate::day_scoring::Row;

/// A competitor of the class.
#[derive(Debug, Clone, PartialEq)]
pub struct Competitor {
    pub competition_id: String,
}

/// A class day's day scores, or the reason the class day doesn't count.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ClassDayScores<'a> {
    Counting(&'a [Row]),
    /// A practice day, which is scored but doesn't count.
    Practice(&'a [Row]),
    Cancelled,
}

/// One competitor's overall result.
#[derive(Debug, Clone, PartialEq)]
pub struct OverallRow {
    pub standing: OverallStanding,
    pub competition_id: String,
    /// The sum of the unrounded day scores, which orders tied rows.
    pub unrounded_total: f64,
    /// The sum of the rounded day scores.
    pub total: u32,
}

/// A row's rank, or the marker of a row without one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverallStanding {
    /// Shared by rows with equal totals, skipping the ranks after them.
    Ranked(u32),
}

/// Adds up the day scores of the counting class days into one row per
/// competitor.
///
/// Rows are ordered by rank, then unrounded total, then competition ID.
pub fn overall_results(competitors: &[Competitor], days: &[ClassDayScores<'_>]) -> Vec<OverallRow> {
    let mut rows: Vec<_> = competitors
        .iter()
        .map(|competitor| {
            let day_rows = days.iter().filter_map(|day| match day {
                ClassDayScores::Counting(rows) => rows
                    .iter()
                    .find(|row| row.competition_id == competitor.competition_id),
                ClassDayScores::Practice(_) | ClassDayScores::Cancelled => None,
            });
            let (unrounded_total, total) = day_rows.fold((0., 0), |(unrounded, total), row| {
                (unrounded + row.score, total + row.day_score)
            });
            OverallRow {
                standing: OverallStanding::Ranked(0),
                competition_id: competitor.competition_id.clone(),
                unrounded_total,
                total,
            }
        })
        .collect();
    rank(&mut rows);
    rows
}

/// Orders the rows and numbers them.
fn rank(rows: &mut [OverallRow]) {
    rows.sort_by(|a, b| {
        b.total
            .cmp(&a.total)
            .then(b.unrounded_total.total_cmp(&a.unrounded_total))
            .then_with(|| a.competition_id.cmp(&b.competition_id))
    });
    let mut previous = None;
    for (index, row) in rows.iter_mut().enumerate() {
        let OverallStanding::Ranked(rank) = &mut row.standing;
        *rank = match previous {
            Some((total, previous_rank)) if total == row.total => previous_rank,
            _ => index as u32 + 1,
        };
        previous = Some((row.total, *rank));
    }
}
