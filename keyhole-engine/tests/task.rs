use std::error::Error;

use approx::assert_abs_diff_eq;
use insta::assert_snapshot;
use keyhole_engine::geodesy::{EarthModel, FAI_SPHERE_RADIUS, LngLat};
use keyhole_engine::task::{ObservationZone, Orientation, Task, TaskError, TaskKind, TaskPoint};

/// The length of one degree of longitude along the equator of the FAI Sphere,
/// in km.
const EQUATOR_DEGREE: f64 = FAI_SPHERE_RADIUS * std::f64::consts::PI / 180.;

fn assert_km(actual: f64, expected: f64) {
    assert_abs_diff_eq!(actual, expected, epsilon = 1e-5);
}

fn assert_bearings(task: &Task<Orientation>, expected: &[f64]) {
    let resolved = task.resolve().unwrap();
    let mut bearings = vec![resolved.start.direction];
    bearings.extend(resolved.turnpoints.iter().map(|point| point.direction));
    bearings.push(resolved.finish.direction);
    assert_abs_diff_eq!(bearings.as_slice(), expected, epsilon = 1e-6);
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

/// A racing task through positions given as longitude and latitude, each
/// with its orientation.
fn oriented_task(earth_model: EarthModel, points: &[(f64, f64, Orientation)]) -> Task<Orientation> {
    let zone = ObservationZone::cylinder(0.5, false);
    let points = points
        .iter()
        .map(|&(longitude, latitude, direction)| TaskPoint {
            direction,
            ..point(longitude, latitude, zone)
        });
    racing_task(points.collect(), earth_model)
}

/// The initial course on a sphere between two positions given as longitude
/// and latitude, in degrees.
fn sphere_azimuth((from, to): ((f64, f64), (f64, f64))) -> f64 {
    let [from_latitude, to_latitude] = [from.1, to.1].map(f64::to_radians);
    let longitude = (to.0 - from.0).to_radians();
    let y = longitude.sin() * to_latitude.cos();
    let x = from_latitude.cos() * to_latitude.sin()
        - from_latitude.sin() * to_latitude.cos() * longitude.cos();
    y.atan2(x).to_degrees().rem_euclid(360.)
}

const BOTH_EARTH_MODELS: [EarthModel; 2] = [EarthModel::Wgs84, EarthModel::FaiSphere];

#[test]
fn orientations_along_meridians_and_the_equator_resolve_on_both_earth_models() {
    use Orientation::*;
    for earth_model in BOTH_EARTH_MODELS {
        let points = [(0., 1., Next), (0., 0., Symmetric), (1., 0., Previous)];
        assert_bearings(&oriented_task(earth_model, &points), &[180., 45., 270.]);

        let points = [(0., 1., Next), (0., 0., Next), (1., 0., Previous)];
        assert_bearings(&oriented_task(earth_model, &points), &[180., 90., 270.]);

        let points = [(0., 1., Next), (0., 0., Previous), (1., 0., Previous)];
        assert_bearings(&oriented_task(earth_model, &points), &[180., 0., 270.]);
    }
}

#[test]
fn courses_are_measured_at_the_reference_point_on_both_earth_models() {
    use Orientation::*;
    let (start, turnpoint, finish) = ((10., 60.), (20., 62.), (12., 65.));
    let courses = [
        (start, turnpoint),
        (turnpoint, start),
        (turnpoint, finish),
        (finish, turnpoint),
    ];
    // The WGS84 azimuths come from an independent implementation of
    // Vincenty's inverse formula.
    let wgs84 = [63.290076088, 252.042826702, 313.540140054, 126.375896455];
    let sphere = courses.map(sphere_azimuth);

    for (earth_model, azimuths) in [(EarthModel::Wgs84, wgs84), (EarthModel::FaiSphere, sphere)] {
        let [start_course, to_start, to_finish, finish_course] = azimuths;
        let symmetric = (to_start + to_finish) / 2.;
        for (direction, bearing) in [
            (Symmetric, symmetric),
            (Previous, to_start),
            (Next, to_finish),
        ] {
            let points = [
                (start.0, start.1, Next),
                (turnpoint.0, turnpoint.1, direction),
                (finish.0, finish.1, Previous),
            ];
            let task = oriented_task(earth_model, &points);
            assert_bearings(&task, &[start_course, bearing, finish_course]);
        }
    }
}

#[test]
fn a_symmetric_turnpoint_where_the_task_runs_straight_through_points_right_of_it() {
    use Orientation::*;
    for earth_model in BOTH_EARTH_MODELS {
        let points = [(0., 0., Next), (1., 0., Symmetric), (2., 0., Previous)];
        assert_bearings(&oriented_task(earth_model, &points), &[90., 180., 270.]);
    }
}

#[test]
fn a_symmetric_turnpoint_where_the_task_turns_back_points_back_along_it() {
    use Orientation::*;
    for earth_model in BOTH_EARTH_MODELS {
        let points = [(0., 0., Next), (1., 0., Symmetric), (0., 0., Previous)];
        assert_bearings(&oriented_task(earth_model, &points), &[90., 270., 90.]);
    }
}

#[test]
fn a_fixed_bearing_stays_unchanged() {
    use Orientation::*;
    let points = [
        (0., 1., Fixed(0.)),
        (0., 0., Fixed(123.4)),
        (1., 0., Fixed(359.5)),
    ];
    let task = oriented_task(EarthModel::Wgs84, &points);
    assert_bearings(&task, &[0., 123.4, 359.5]);
}

#[test]
fn orientations_that_cannot_be_resolved_name_their_point() {
    use Orientation::*;
    let resolve = |points: &[(f64, f64, Orientation)]| {
        let task = oriented_task(EarthModel::Wgs84, points);
        task.resolve().unwrap_err()
    };
    let error = |point_index| TaskError::Orientation { point_index };

    for start in [Symmetric, Previous] {
        let points = [(0., 1., start), (0., 0., Symmetric), (1., 0., Previous)];
        assert_eq!(resolve(&points), error(0));
    }

    for finish in [Symmetric, Next] {
        let points = [(0., 1., Next), (0., 0., Symmetric), (1., 0., finish)];
        assert_eq!(resolve(&points), error(2));
    }

    for bearing in [360., -0.5, f64::NAN] {
        let points = [(0., 1., Next), (0., 0., Fixed(bearing)), (1., 0., Previous)];
        assert_eq!(resolve(&points), error(1));
    }
}

#[test]
fn an_orientation_error_describes_its_point() {
    let error = Box::<dyn Error>::from(TaskError::Orientation { point_index: 2 });
    assert_snapshot!(error, @"the orientation of the task point at index 2 cannot be resolved");
}
