//! Adding up a class's counting class days into overall results.

use std::collections::BTreeMap;

use crate::day_scoring::{DayResult, Rank};
use crate::ranking::share_ranks;

/// One competitor's overall result.
#[derive(Debug, Clone, PartialEq)]
pub struct OverallRow {
    pub rank: OverallRank,
    pub competition_id: String,
    /// The sum of the unrounded day scores, which orders equal totals.
    pub raw_total: f64,
    /// The sum of the rounded day scores.
    pub total: u32,
}

/// An overall row's rank, or the marker of a row without one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverallRank {
    /// Shared by rows with equal totals, skipping the ranks after them.
    Ranked(u32),
    /// Listed among the ranked rows by total without taking a rank.
    HorsConcours,
    /// Shown as "DSQ".
    Disqualified,
}

/// Adds up the day scores of a class's counting class days, which the caller
/// passes without practice days and cancelled days.
///
/// A competitor's total covers the rows they have, so a class day without one
/// counts as 0. A competitor marked hors concours or disqualified on any class
/// day keeps that marker. Rows are ordered by total, then unrounded total,
/// then competition ID, with hors concours rows among the ranked ones, then
/// disqualified rows.
pub fn overall_results(counting_days: &[DayResult]) -> Vec<OverallRow> {
    let mut overall_rows = BTreeMap::<&str, OverallRow>::new();
    for row in counting_days.iter().flat_map(|day| &day.rows) {
        let overall = overall_rows
            .entry(&row.competition_id)
            .or_insert_with(|| OverallRow {
                rank: OverallRank::Ranked(0),
                competition_id: row.competition_id.clone(),
                raw_total: 0.,
                total: 0,
            });
        overall.raw_total += row.raw_score;
        overall.total += row.score;
        overall.rank = match (overall.rank, row.rank) {
            (OverallRank::Disqualified, _) | (_, Rank::Disqualified) => OverallRank::Disqualified,
            (_, Rank::HorsConcours) => OverallRank::HorsConcours,
            (rank, _) => rank,
        };
    }

    let mut rows: Vec<_> = overall_rows.into_values().collect();
    rows.sort_by(|a, b| {
        let disqualified = |row: &OverallRow| row.rank == OverallRank::Disqualified;
        disqualified(a)
            .cmp(&disqualified(b))
            .then(b.total.cmp(&a.total))
            .then(b.raw_total.total_cmp(&a.raw_total))
            .then_with(|| a.competition_id.cmp(&b.competition_id))
    });
    share_ranks(rows.iter_mut().filter_map(|row| match &mut row.rank {
        OverallRank::Ranked(rank) => Some((row.total, rank)),
        _ => None,
    }));
    rows
}
