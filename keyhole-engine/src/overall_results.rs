//! Adding up a class's counting class days into overall results.

use std::collections::BTreeMap;

use crate::day_scoring::{DayResult, DayValidity, Rank};
use crate::ranking::share_ranks;

/// One competitor's overall result.
#[derive(Debug, Clone, PartialEq)]
pub struct OverallRow {
    pub rank: OverallRank,
    pub competition_id: String,
    /// The sum of the unrounded day scores, which orders equal totals after
    /// any countback.
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
///
/// Ties at the first `countback_places` ranks are broken by counting the
/// daily first places on valid class days, then second places and so on.
/// Rows that the countback moves beyond those ranks keep sharing a rank.
pub fn overall_results(counting_days: &[DayResult], countback_places: u8) -> Vec<OverallRow> {
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
    let countback_places = u32::from(countback_places);
    let ranked_totals: Vec<_> = rows
        .iter()
        .filter(|row| matches!(row.rank, OverallRank::Ranked(_)))
        .map(|row| row.total)
        .collect();
    // A ranked total is within the countback places when fewer ranked rows
    // than that have a higher total.
    let within_countback = |total: u32| {
        let higher = ranked_totals.iter().filter(|&&other| other > total).count();
        ranked_totals.contains(&total) && (higher as u32) < countback_places
    };
    let place_counts = daily_place_counts(counting_days);
    let countback_key = |row: &OverallRow| {
        let counts = place_counts.get(row.competition_id.as_str());
        within_countback(row.total).then_some(counts.map_or(&[][..], Vec::as_slice))
    };

    rows.sort_by(|a, b| {
        let disqualified = |row: &OverallRow| row.rank == OverallRank::Disqualified;
        disqualified(a)
            .cmp(&disqualified(b))
            .then(b.total.cmp(&a.total))
            .then_with(|| countback_key(b).cmp(&countback_key(a)))
            .then(b.raw_total.total_cmp(&a.raw_total))
            .then_with(|| a.competition_id.cmp(&b.competition_id))
    });
    share_ranks(
        rows.iter_mut().filter_map(|row| {
            let key = (row.total, countback_key(row));
            match &mut row.rank {
                OverallRank::Ranked(rank) => Some((key, rank)),
                _ => None,
            }
        }),
        // A tie that reaches beyond the countback places stays shared there.
        |(previous_total, previous_counts), previous_rank, (total, counts)| {
            previous_total == total
                && (previous_counts == counts || previous_rank > countback_places)
        },
    );
    rows
}

/// Counts each competitor's daily places on valid class days, with the
/// number of first places first. Every competitor's counts have the same
/// length, so that they compare place by place.
fn daily_place_counts(counting_days: &[DayResult]) -> BTreeMap<&str, Vec<u32>> {
    let places: Vec<_> = counting_days
        .iter()
        .filter(|day| day.validity == DayValidity::Valid)
        .flat_map(|day| &day.rows)
        .filter_map(|row| match row.rank {
            Rank::Ranked(place) => Some((row.competition_id.as_str(), place as usize)),
            _ => None,
        })
        .collect();
    let place_count = places.iter().map(|&(_, place)| place).max().unwrap_or(0);
    let mut counts = BTreeMap::<&str, Vec<u32>>::new();
    for (competition_id, place) in places {
        counts
            .entry(competition_id)
            .or_insert_with(|| vec![0; place_count])[place - 1] += 1;
    }
    counts
}
