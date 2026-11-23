use bytes::Bytes;
use insta::assert_snapshot;
use jiff::Unit;
use keyhole_engine::flight_analysis::{IgcFile, LineCrossing, line_crossings};
use keyhole_engine::geodesy::{EarthModel, LngLat};

/// 0°N 0°E, so the line runs along the meridian.
const REFERENCE_POINT: LngLat = LngLat {
    longitude: 0.,
    latitude: 0.,
};

/// A track about 1' north of the equator that crosses the meridian forwards,
/// backwards, forwards onto it and, with an invalid fix, forwards again.
const TRACK: &str = "\
ALXVABC
HFDTE160624
B1000000001000N00000500WA0050000500
B1000010002000N00000500EA0050000500
B1000020001000N00000500WA0050000500
B1000030001000N00000000EA0050000500
B1000040001000N00000500EA0050000500
B1000050001000N00000500WV0050000500
B1000060001000N00000500EA0050000500
";

fn track() -> IgcFile {
    let (igc_file, _) = IgcFile::parse(Bytes::from_static(TRACK.as_bytes())).unwrap();
    let date = igc_file.date;
    let (igc_file, _) = igc_file.resolve_times(date).unwrap();
    igc_file
}

fn render(crossings: &[LineCrossing]) -> String {
    let rows = crossings.iter().map(|crossing| {
        let time = crossing.time.round(Unit::Millisecond).unwrap();
        let time = time.strftime("%H:%M:%S%.3f");
        let before = crossing.fix_before.time.strftime("%H:%M:%S");
        let after = crossing.fix_after.time.strftime("%H:%M:%S");
        let along = crossing.along;
        format!("{time:<12}  {before:<8}  {after:<8}  {along:.3} km")
    });
    let mut lines = vec!["crossing      before    after     along".to_string()];
    lines.extend(rows);
    lines.join("\n")
}

#[test]
fn reports_each_forward_crossing_with_a_fix_on_the_line_in_front() {
    let igc_file = track();
    let records = &igc_file.records;
    let crossings = line_crossings(records, EarthModel::FaiSphere, REFERENCE_POINT, 90.);
    assert_snapshot!(render(&crossings), @"
    crossing      before    after     along
    10:00:00.500  10:00:00  10:00:01  2.780 km
    10:00:03.000  10:00:02  10:00:03  1.853 km
    ");
}

#[test]
fn reports_the_backward_crossings_along_the_reversed_bearing() {
    let igc_file = track();
    let records = &igc_file.records;
    let crossings = line_crossings(records, EarthModel::FaiSphere, REFERENCE_POINT, 270.);
    assert_snapshot!(render(&crossings), @"
    crossing      before    after     along
    10:00:01.500  10:00:01  10:00:02  2.780 km
    ");
}
