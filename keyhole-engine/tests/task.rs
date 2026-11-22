use keyhole_engine::geodesy::{EarthModel, FAI_SPHERE_RADIUS, LngLat};
use keyhole_engine::task::{ObservationZone, Orientation, Task, TaskKind, TaskPoint};

/// The length of one degree of longitude along the equator of the FAI Sphere,
/// in km.
const EQUATOR_DEGREE: f64 = FAI_SPHERE_RADIUS * std::f64::consts::PI / 180.;

fn assert_km(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < 1e-5,
        "expected {expected} km, got {actual} km"
    );
}

fn point(longitude: f64, latitude: f64, zone: ObservationZone) -> TaskPoint<Orientation> {
    TaskPoint {
        reference_point: LngLat {
            longitude,
            latitude,
        },
        direction: Orientation::Symmetric,
        zone,
    }
}

/// A point from a SeeYou `task.json`, which gives positions in radians.
fn seeyou_point(longitude: f64, latitude: f64, zone: ObservationZone) -> TaskPoint<Orientation> {
    point(longitude.to_degrees(), latitude.to_degrees(), zone)
}

fn racing_task(points: Vec<TaskPoint<Orientation>>, earth_model: EarthModel) -> Task<Orientation> {
    let mut points = points.into_iter();
    let start = points.next().unwrap();
    let finish = points.next_back().unwrap();
    Task {
        kind: TaskKind::Racing,
        start,
        turnpoints: points.collect(),
        finish,
        earth_model,
    }
}

/// The task of `euregiocup-2024/hasen/2024-05-11`.
fn hasen_task(earth_model: EarthModel) -> Task<Orientation> {
    let start_line = ObservationZone::Line { length: 20. };
    let keyhole = ObservationZone::daec_keyhole();
    let finish_cylinder = ObservationZone::cylinder(5., true);
    let points = vec![
        seeyou_point(0.110653874576441, 0.885836916750175, start_line),
        seeyou_point(0.118939534312075, 0.880411851658559, keyhole),
        seeyou_point(0.137132846434864, 0.882313678766815, keyhole),
        seeyou_point(0.119302271908281, 0.876074126690936, keyhole),
        seeyou_point(0.107935815154668, 0.887007741790054, finish_cylinder),
    ];
    racing_task(points, earth_model)
}

/// A racing task along the equator from 0° over 1° to 2° of longitude.
fn equator_task(start: f64, turnpoint: f64, finish: f64) -> Task<Orientation> {
    let points = vec![
        point(0., 0., ObservationZone::cylinder(start, start > 0.)),
        point(1., 0., ObservationZone::cylinder(turnpoint, turnpoint > 0.)),
        point(2., 0., ObservationZone::cylinder(finish, finish > 0.)),
    ];
    racing_task(points, EarthModel::FaiSphere)
}

#[test]
fn the_hasen_task_distance_on_wgs84_reduces_the_finish() {
    let mut task = hasen_task(EarthModel::Wgs84);
    assert_km(task.distance(), 284.61789);

    task.finish.zone = ObservationZone::cylinder(5., false);
    assert_km(task.distance(), 284.61789 + 5.);
}

#[test]
fn the_hasen_task_distance_on_the_fai_sphere_reduces_the_finish() {
    let task = hasen_task(EarthModel::FaiSphere);
    assert_km(task.distance(), 283.99960);
}

#[test]
fn an_unreduced_task_sums_its_legs() {
    let task = equator_task(0., 0., 0.);
    assert_km(task.distance(), 2. * EQUATOR_DEGREE);
}

#[test]
fn a_reduced_start_shortens_the_outgoing_leg() {
    let task = equator_task(10., 0., 0.);
    assert_km(task.distance(), 2. * EQUATOR_DEGREE - 10.);
}

#[test]
fn a_reduced_turnpoint_shortens_both_legs() {
    let task = equator_task(0., 10., 0.);
    assert_km(task.distance(), 2. * EQUATOR_DEGREE - 20.);
}

#[test]
fn a_reduced_finish_shortens_the_incoming_leg() {
    let task = equator_task(0., 0., 3.);
    assert_km(task.distance(), 2. * EQUATOR_DEGREE - 3.);
}

#[test]
fn a_leg_shorter_than_its_reductions_counts_as_zero() {
    let task = equator_task(60., 60., 0.);
    assert_km(task.distance(), EQUATOR_DEGREE - 60.);
}
