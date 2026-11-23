use approx::assert_abs_diff_eq;
use keyhole_engine::geodesy::{EarthModel, RadiiOfCurvature};

#[test]
fn wgs84_radii_at_the_equator_and_pole() {
    let equator = EarthModel::Wgs84.radii_of_curvature(0.);
    assert_abs_diff_eq!(equator.meridional, 6335.439327, epsilon = 1e-6);
    assert_abs_diff_eq!(equator.normal, 6378.137, epsilon = 1e-6);
    let pole = EarthModel::Wgs84.radii_of_curvature(90.);
    assert_abs_diff_eq!(pole.meridional, 6399.593626, epsilon = 1e-6);
    assert_abs_diff_eq!(pole.normal, 6399.593626, epsilon = 1e-6);
}

#[test]
fn fai_sphere_radii_are_its_radius() {
    let radii = EarthModel::FaiSphere.radii_of_curvature(47.);
    let expected = RadiiOfCurvature {
        meridional: 6371.,
        normal: 6371.,
    };
    assert_eq!(radii, expected);
}
