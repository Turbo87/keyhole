use bytes::Bytes;
use jiff::SignedDuration;
use keyhole_engine::flight_analysis::{FileAnalysis, FileAnalysisOptions, analyze_file};
use proptest::prelude::*;

const OPTIONS: FileAnalysisOptions = FileAnalysisOptions {
    maximum_recording_interval: SignedDuration::from_secs(1),
};

const HEADER: &str = "ALXVABC\nHFDTE160624\n";

fn analyze(contents: impl Into<Bytes>) -> FileAnalysis {
    analyze_file(contents.into(), OPTIONS)
}

fn b_record(time_of_day: u32) -> String {
    let time_of_day = time_of_day % 86_400;
    let (hours, minutes, seconds) = (time_of_day / 3600, time_of_day / 60 % 60, time_of_day % 60);
    format!("B{hours:02}{minutes:02}{seconds:02}5122265N00651234EA0010000110\n")
}

/// Times of day of a recording with gaps of a few seconds. Half of the
/// recordings start shortly before midnight, so that they cross it.
fn recording() -> impl Strategy<Value = Vec<u32>> {
    let start = prop_oneof![0..86_400u32, 86_200..86_400u32];
    (start, prop::collection::vec(1..5u32, 1..50)).prop_map(|(start, steps)| {
        let times = steps.iter().scan(start, |time, step| {
            *time += step;
            Some(*time)
        });
        std::iter::once(start).chain(times).collect()
    })
}

fn line() -> impl Strategy<Value = Vec<u8>> {
    prop_oneof![
        (0..86_400u32).prop_map(|time| b_record(time).into_bytes()),
        "[A-L][ -~]{0,40}\n".prop_map(String::into_bytes),
        prop::collection::vec(any::<u8>(), 0..60),
    ]
}

proptest! {
    #[test]
    fn fix_times_strictly_increase_in_any_file(lines in prop::collection::vec(line(), 0..60)) {
        let contents = [HEADER.as_bytes().to_vec(), lines.concat()].concat();
        let analysis = analyze(contents);
        if let Some(igc_file) = analysis.igc_file {
            let times = igc_file.fixes.iter().map(|fix| fix.time).collect::<Vec<_>>();
            prop_assert!(times.windows(2).all(|pair| pair[0] < pair[1]), "{times:?}");
        }
    }

    #[test]
    fn a_stale_fix_leaves_the_other_fix_times_unchanged(
        times in recording(),
        insert_at in any::<prop::sample::Index>(),
        stale_from in any::<prop::sample::Index>(),
    ) {
        let insert_at = 1 + insert_at.index(times.len() - 1);
        let stale_time = times[stale_from.index(insert_at)];

        let records = times.iter().map(|&time| b_record(time)).collect::<Vec<_>>();
        let mut stale_records = records.clone();
        stale_records.insert(insert_at, b_record(stale_time));

        let fix_times = |records: Vec<String>| {
            let igc_file = analyze(HEADER.to_owned() + &records.concat()).igc_file.unwrap();
            igc_file.fixes.iter().map(|fix| fix.time).collect::<Vec<_>>()
        };
        prop_assert_eq!(fix_times(stale_records), fix_times(records));
    }
}
