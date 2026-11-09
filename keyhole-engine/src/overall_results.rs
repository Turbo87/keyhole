//! Adding up a class's day scores into its overall results.

use crate::day_scoring::{Row, Standing};
use crate::rule_sets::RuleSetEdition;

/// A competitor of the class.
#[derive(Debug, Clone, PartialEq)]
pub struct Competitor {
    pub competition_id: String,
    /// Whether the competitor's total is shown without a rank.
    pub hors_concours: bool,
    /// Whether the competitor is disqualified from the competition, which
    /// leaves the total unranked.
    pub competition_disqualified: bool,
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
    HorsConcours,
    /// Shown as "DSQ".
    CompetitionDisqualified,
}

/// Adds up the day scores of the counting class days into one row per
/// competitor.
///
/// Rows are ordered by rank, then unrounded total, then competition ID, with
/// unranked rows below the ranked ones. Where the edition has the podium
/// countback, a tie that includes a podium place is ordered and ranked by
/// daily places first.
pub fn overall_results(
    edition: &RuleSetEdition,
    competitors: &[Competitor],
    days: &[ClassDayScores<'_>],
) -> Vec<OverallRow> {
    let mut totals: Vec<_> = competitors
        .iter()
        .map(|competitor| {
            let mut total = Total::new(competitor);
            for day in days {
                if let ClassDayScores::Counting(rows) = day
                    && let Some(row) = rows
                        .iter()
                        .find(|row| row.competition_id == competitor.competition_id)
                {
                    total.add(row);
                }
            }
            total
        })
        .collect();
    rank(&mut totals, edition.constants.podium_countback);
    totals.into_iter().map(|total| total.row).collect()
}

/// The last place that a podium countback decides.
const PODIUM: usize = 3;

/// An overall row while it is being added up and ranked.
struct Total {
    row: OverallRow,
    /// How often the competitor ranked first, second and so on, without
    /// trailing zeros, so that comparing two of them compares by countback.
    place_counts: Vec<u32>,
}

impl Total {
    fn new(competitor: &Competitor) -> Self {
        let standing = if competitor.competition_disqualified {
            OverallStanding::CompetitionDisqualified
        } else if competitor.hors_concours {
            OverallStanding::HorsConcours
        } else {
            OverallStanding::Ranked(0)
        };
        Self {
            row: OverallRow {
                standing,
                competition_id: competitor.competition_id.clone(),
                unrounded_total: 0.,
                total: 0,
            },
            place_counts: Vec::new(),
        }
    }

    fn add(&mut self, row: &Row) {
        self.row.unrounded_total += row.score;
        self.row.total += row.day_score;
        if let Standing::Ranked(place) = row.standing {
            let index = place as usize - 1;
            if self.place_counts.len() <= index {
                self.place_counts.resize(index + 1, 0);
            }
            self.place_counts[index] += 1;
        }
    }

    fn is_ranked(&self) -> bool {
        matches!(self.row.standing, OverallStanding::Ranked(_))
    }
}

/// Orders the totals and numbers the ranked ones, which carry a placeholder
/// rank.
fn rank(totals: &mut [Total], podium_countback: bool) {
    totals.sort_by(|a, b| {
        b.is_ranked()
            .cmp(&a.is_ranked())
            .then(b.row.total.cmp(&a.row.total))
            .then(b.row.unrounded_total.total_cmp(&a.row.unrounded_total))
            .then_with(|| a.row.competition_id.cmp(&b.row.competition_id))
    });
    let ranked = totals.iter().take_while(|total| total.is_ranked()).count();
    let mut first = 1;
    for tie in totals[..ranked].chunk_by_mut(|a, b| a.row.total == b.row.total) {
        if podium_countback && first <= PODIUM {
            tie.sort_by(|a, b| b.place_counts.cmp(&a.place_counts));
            share_ranks(tie, first, |a, b| a.place_counts == b.place_counts);
        } else {
            share_ranks(tie, first, |_, _| true);
        }
        first += tie.len();
    }
}

/// Numbers the totals from `first`, where tied neighbours share a rank and
/// skip the ranks after them.
fn share_ranks(totals: &mut [Total], first: usize, tied: impl FnMut(&Total, &Total) -> bool) {
    let mut rank = first;
    for tie in totals.chunk_by_mut(tied) {
        for total in tie.iter_mut() {
            total.row.standing = OverallStanding::Ranked(rank as u32);
        }
        rank += tie.len();
    }
}
