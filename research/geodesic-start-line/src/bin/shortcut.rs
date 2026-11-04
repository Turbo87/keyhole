use geographiclib_rs::{DirectGeodesic, Geodesic, InverseGeodesic};

fn main() {
    for (name, g) in [("WGS84", Geodesic::wgs84()), ("Sphere", Geodesic::new(6_371_000.0, 0.0))] {
        for &lat in &[30.0, 45.0, 50.0, 55.0] {
            for &y in &[2_500.0, 5_000.0, 10_000.0, 20_000.0] {
                let (mut max_across, mut max_along) = (0.0f64, 0.0f64);
                for c in 0..72 {
                    let course = c as f64 * 5.0;
                    for &x in &[-1000.0, -500.0, -200.0, -50.0, 0.0, 50.0, 200.0, 500.0, 1000.0] {
                        // foot point on the geodesic start line, y metres from the start point
                        let (flat, flon, faz): (f64, f64, f64) = g.direct(lat, 10.0, course + 90.0, y);
                        // step x metres perpendicular to the line at the foot (towards the course)
                        let (plat, plon): (f64, f64) = g.direct(flat, flon, faz - 90.0, x);
                        let (s, az1, _az2, _a12): (f64, f64, f64, f64) = g.inverse(lat, 10.0, plat, plon);
                        let d = (az1 - course).to_radians();
                        max_across = max_across.max((s * d.cos() - x).abs());
                        max_along = max_along.max((s * d.sin().abs() - y).abs());
                    }
                }
                println!("{name:6} lat {lat:4} half-width {:5.1} km: across err {max_across:.4} m, along err {max_along:.4} m", y / 1000.0);
            }
        }
    }
}
