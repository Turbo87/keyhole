//! Helpers shared by the tests that build tasks from SoaringSpot class
//! days and read IGC fixtures.

use bytes::Bytes;
use keyhole_engine::flight_analysis::IgcFile;
use keyhole_engine::geodesy::{EarthModel, LngLat};
use keyhole_engine::task::{ObservationZone, Orientation, Task, TaskKind, TaskPoint};

pub fn parse(contents: &'static [u8]) -> IgcFile {
    let (igc_file, _) = IgcFile::parse(Bytes::from_static(contents)).unwrap();
    let date = igc_file.date;
    let (igc_file, _) = igc_file.resolve_times(date).unwrap();
    igc_file
}

/// A longitude and latitude in radians, as SeeYou's `task.json` gives them,
/// with the point's observation zone.
pub type SeeYouPoint = (f64, f64, ObservationZone);

fn seeyou_point(
    &(longitude, latitude, zone): &SeeYouPoint,
    direction: Orientation,
) -> TaskPoint<Orientation> {
    let (longitude, latitude) = (longitude.to_degrees(), latitude.to_degrees());
    TaskPoint {
        reference_point: LngLat {
            longitude,
            latitude,
        },
        direction,
        zone,
    }
}

/// A resolved task with the start oriented to the next point and the finish
/// to the previous one.
pub fn seeyou_task(kind: TaskKind, points: &[SeeYouPoint], earth_model: EarthModel) -> Task<f64> {
    let [start, turnpoints @ .., finish] = points else {
        panic!("a task needs a start and a finish");
    };
    let turnpoints = turnpoints
        .iter()
        .map(|point| seeyou_point(point, Orientation::Symmetric));
    let task = Task {
        kind,
        start: seeyou_point(start, Orientation::Next),
        turnpoints: turnpoints.collect(),
        finish: seeyou_point(finish, Orientation::Previous),
        earth_model,
    };
    task.resolve().unwrap()
}

pub fn cylinder(radius: f64) -> ObservationZone {
    ObservationZone::cylinder(radius, false)
}

pub fn reducing_cylinder(radius: f64) -> ObservationZone {
    ObservationZone::cylinder(radius, true)
}

pub fn line(half_width: f64) -> ObservationZone {
    ObservationZone::Line {
        length: 2. * half_width,
    }
}

/// The task of `dmj-edpa-2023/club/2023-06-04`.
pub fn edpa_task() -> Task<f64> {
    let keyhole = ObservationZone::daec_keyhole();
    let points = [
        (0.181688770651817, 0.850969314575195, line(10.)),
        (0.19304795563221, 0.854595541954041, keyhole),
        (0.207001000642776, 0.853790938854218, keyhole),
        (0.183482676744461, 0.856433093547821, keyhole),
        (0.187283426523209, 0.852826058864594, keyhole),
        (0.179153099656105, 0.851332902908325, cylinder(5.)),
    ];
    seeyou_task(TaskKind::Racing, &points, EarthModel::Wgs84)
}

/// The task of `2020-multiclass-nationals-tocumwal-2019/standard/2019-12-16`.
pub fn tocumwal_task() -> Task<f64> {
    let keyhole = ObservationZone::daec_keyhole();
    let points = [
        (2.5412817122668, -0.62502189464915, line(5.)),
        (2.55429430539325, -0.62387288622492, keyhole),
        (2.54332781992655, -0.617361644562147, keyhole),
        (2.52860393146852, -0.618001598621212, keyhole),
        (2.52982566194491, -0.62060504808877, keyhole),
        (2.54198478906714, -0.622146755594698, keyhole),
        (2.5412817122668, -0.62502189464915, reducing_cylinder(3.)),
    ];
    seeyou_task(TaskKind::Racing, &points, EarthModel::Wgs84)
}
