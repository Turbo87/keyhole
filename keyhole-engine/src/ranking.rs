/// Numbers ordered rows from 1 by their position, except that a row takes the
/// previous row's rank when `shares_rank` accepts the previous row's key and
/// rank and its own key. The ranks after a shared rank are skipped.
pub fn share_ranks<'a, K>(
    ranked: impl Iterator<Item = (K, &'a mut u32)>,
    shares_rank: impl Fn(&K, u32, &K) -> bool,
) {
    let mut previous: Option<(K, u32)> = None;
    for (index, (key, rank)) in ranked.enumerate() {
        *rank = match &previous {
            Some((previous_key, previous_rank))
                if shares_rank(previous_key, *previous_rank, &key) =>
            {
                *previous_rank
            }
            _ => index as u32 + 1,
        };
        previous = Some((key, *rank));
    }
}
