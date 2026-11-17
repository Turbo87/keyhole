/// Numbers ordered scores from 1, giving equal scores the same rank and
/// skipping the ranks after them.
pub fn share_ranks<'a>(ranked: impl Iterator<Item = (u32, &'a mut u32)>) {
    let mut previous = None;
    for (index, (score, rank)) in ranked.enumerate() {
        *rank = match previous {
            Some((previous_score, previous_rank)) if previous_score == score => previous_rank,
            _ => index as u32 + 1,
        };
        previous = Some((score, *rank));
    }
}
