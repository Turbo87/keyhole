mod support;

use insta::assert_snapshot;
use jiff::{RoundMode, SignedDuration, Timestamp, TimestampRound, Unit};
use keyhole_engine::flight_analysis::{IgcFile, LineCrossing, line_crossings};
use keyhole_engine::geodesy::{EarthModel, LngLat};
use keyhole_engine::task::{ObservationZone, Task, TaskKind};
use support::{cylinder, edpa_task, line, parse, reducing_cylinder, seeyou_task, tocumwal_task};

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
    let igc_file = parse(TRACK.as_bytes());
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
    let igc_file = parse(TRACK.as_bytes());
    let records = &igc_file.records;
    let crossings = line_crossings(records, EarthModel::FaiSphere, REFERENCE_POINT, 270.);
    assert_snapshot!(render(&crossings), @"
    crossing      before    after     along
    10:00:01.500  10:00:01  10:00:02  2.780 km
    ");
}

/// A track that crosses the line through 70°N 0°E northwards, about 100 km
/// east of the reference point. The line curves about 2 km south of the
/// 70°N parallel there, so a flat estimate puts both fixes behind it.
const FAR_NORTH_TRACK: &str = "\
ALXVABC
HFDTE160624
B1000006958675N00237669EA0050000500
B1000016958999N00237669EA0050000500
";

#[test]
fn reports_a_crossing_far_along_the_line_at_a_high_latitude() {
    let igc_file = parse(FAR_NORTH_TRACK.as_bytes());
    let records = &igc_file.records;
    let reference_point = LngLat {
        longitude: 0.,
        latitude: 70.,
    };
    let crossings = line_crossings(records, EarthModel::FaiSphere, reference_point, 0.);
    assert_snapshot!(render(&crossings), @"
    crossing      before    after     along
    10:00:00.500  10:00:00  10:00:01  100.000 km
    ");
}

fn assigned_area(minimum_task_time: i64) -> TaskKind {
    let minimum_task_time = SignedDuration::from_secs(minimum_task_time);
    TaskKind::AssignedArea { minimum_task_time }
}

fn start_line_crossings<'a>(igc_file: &'a IgcFile, task: &Task<f64>) -> Vec<LineCrossing<'a>> {
    let start = &task.start;
    let (point, bearing) = (start.reference_point, start.direction);
    line_crossings(&igc_file.records, task.earth_model, point, bearing)
}

fn finish_line_crossings<'a>(igc_file: &'a IgcFile, task: &Task<f64>) -> Vec<LineCrossing<'a>> {
    let finish = &task.finish;
    let (point, bearing) = (finish.reference_point, finish.direction + 180.);
    line_crossings(&igc_file.records, task.earth_model, point, bearing)
}

/// Asserts that a crossing rounded to the second with `mode` is `expected`,
/// as SeeYou rounds a start down and a finish up.
fn assert_crossed_at(crossings: &[LineCrossing], mode: RoundMode, expected: &str) {
    let expected: Timestamp = expected.parse().unwrap();
    let rounding = TimestampRound::new().smallest(Unit::Second).mode(mode);
    let round = |crossing: &LineCrossing| crossing.time.round(rounding).unwrap();
    let times: Vec<_> = crossings.iter().map(round).collect();
    assert!(times.contains(&expected), "{expected} is none of {times:?}");
}

/// The task of `13th-fai-womens-world-gliding-championship-zbraslavice-2025/club/2025-07-25`.
fn zbraslavice_task() -> Task<f64> {
    let points = [
        (0.263583405182896, 0.869304867187076, line(5.)),
        (0.267457163457698, 0.860641343668384, cylinder(25.)),
        (0.277609161940131, 0.864282100488045, cylinder(15.)),
        (0.256611978374014, 0.862090839612166, cylinder(25.)),
        (0.265319135124005, 0.869421222470542, reducing_cylinder(5.)),
    ];
    seeyou_task(assigned_area(7200), &points, EarthModel::FaiSphere)
}

/// The task of `jenacup-2026-jena-schongleina-2026/18-meter/2026-07-26`.
fn jena_task() -> Task<f64> {
    let points = [
        (0.207325916515154, 0.888225981607946, line(10.)),
        (0.201740572020564, 0.892241402440368, cylinder(15.)),
        (0.218161211399744, 0.892285035671668, cylinder(20.)),
        (0.214845085820955, 0.882108893467915, cylinder(15.)),
        (0.205352530907566, 0.890151952437522, cylinder(3.)),
        (0.204436233050269, 0.888629443553365, reducing_cylinder(5.)),
    ];
    seeyou_task(assigned_area(6300), &points, EarthModel::Wgs84)
}

/// The task of `dm-zwickau-2026/standard/2026-05-27`.
fn zwickau_task() -> Task<f64> {
    let keyhole = ObservationZone::daec_keyhole();
    let points = [
        (0.215955406113432, 0.885172818969791, line(10.)),
        (0.19200076212981, 0.874977187256057, keyhole),
        (0.210864862461782, 0.872737348049331, keyhole),
        (0.21745348038806, 0.884940108402858, reducing_cylinder(5.)),
    ];
    seeyou_task(TaskKind::Racing, &points, EarthModel::Wgs84)
}

/// The task of `amstelglide-2024-soesterberg-ab-2024/club/2024-06-09`.
fn soesterberg_task() -> Task<f64> {
    let points = [
        (0.0920856073498726, 0.909796476364136, line(5.)),
        (0.131530046463013, 0.902820110321045, cylinder(30.)),
        (0.112515561282635, 0.90899658203125, cylinder(15.)),
        (0.11501719802618, 0.903178811073303, cylinder(20.)),
        (0.100385524332523, 0.911876380443573, cylinder(10.)),
        (0.0932491570711136, 0.909146964550018, cylinder(0.5)),
        (0.0920856073498726, 0.909796476364136, line(0.5)),
    ];
    seeyou_task(assigned_area(14400), &points, EarthModel::Wgs84)
}

#[test]
fn start_line_crossing_near_the_middle_with_a_1_s_logger() {
    let igc_file = parse(include_bytes!("fixtures/start-line-1s-logger.igc"));
    let crossings = start_line_crossings(&igc_file, &zbraslavice_task());
    assert_snapshot!(render(&crossings), @"
    crossing      before    after     along
    11:03:13.346  11:03:13  11:03:14  0.047 km
    ");
    assert_crossed_at(&crossings, RoundMode::Floor, "2025-07-25T11:03:13Z");
}

#[test]
fn start_line_crossing_with_a_2_s_logger() {
    let igc_file = parse(include_bytes!("fixtures/start-line-2s-logger.igc"));
    let crossings = start_line_crossings(&igc_file, &edpa_task());
    assert_snapshot!(render(&crossings), @"
    crossing      before    after     along
    11:13:29.208  11:13:28  11:13:30  4.291 km
    ");
    assert_crossed_at(&crossings, RoundMode::Floor, "2023-06-04T11:13:29Z");
}

#[test]
fn start_line_crossing_with_a_4_s_logger() {
    let igc_file = parse(include_bytes!("fixtures/start-line-4s-logger.igc"));
    let crossings = start_line_crossings(&igc_file, &tocumwal_task());
    assert_snapshot!(render(&crossings), @"
    crossing      before    after     along
    03:13:39.057  03:13:38  03:13:42  0.124 km
    ");
    assert_crossed_at(&crossings, RoundMode::Floor, "2019-12-16T03:13:39Z");
}

#[test]
fn start_line_crossing_more_than_7_5_km_out() {
    let igc_file = parse(include_bytes!("fixtures/start-line-far-out.igc"));
    let crossings = start_line_crossings(&igc_file, &jena_task());
    assert_snapshot!(render(&crossings), @"
    crossing      before    after     along
    11:16:20.624  11:16:20  11:16:21  9.754 km
    11:17:20.222  11:17:20  11:17:21  9.929 km
    ");
    assert_crossed_at(&crossings, RoundMode::Floor, "2026-07-26T11:17:20Z");
}

/// SeeYou publishes this start 1 s before the crossing, at 13:08:30 UTC.
#[test]
fn start_line_crossing_1_s_after_the_published_start() {
    let igc_file = parse(include_bytes!("fixtures/start-line-1s-late.igc"));
    let crossings = start_line_crossings(&igc_file, &zwickau_task());
    assert_snapshot!(render(&crossings), @"
    crossing      before    after     along
    13:08:31.196  13:08:31  13:08:32  9.962 km
    ");
    assert_crossed_at(&crossings, RoundMode::Floor, "2026-05-27T13:08:31Z");
}

#[test]
fn finish_line_crossing() {
    let igc_file = parse(include_bytes!("fixtures/finish-line.igc"));
    let crossings = finish_line_crossings(&igc_file, &soesterberg_task());
    assert_snapshot!(render(&crossings), @"
    crossing      before    after     along
    15:34:53.431  15:34:53  15:34:54  0.025 km
    ");
    assert_crossed_at(&crossings, RoundMode::Ceil, "2024-06-09T15:34:54Z");
}
