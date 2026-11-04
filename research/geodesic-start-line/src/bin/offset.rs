use geographiclib_rs::{DirectGeodesic, Geodesic};
fn main() {
    let g = Geodesic::wgs84();
    let (a, f) = (6_378_137.0_f64, 1. / 298.257_223_563);
    let e2 = f * (2. - f);
    println!("lat course | offset m (geodesic perpendicular vs flat WGS84 line) at y = 3, 5, 7.5, 10 km | max over courses");
    for lat in [30.0_f64, 45., 50., 55.] {
        let phi = lat.to_radians();
        let w = 1. - e2 * phi.sin().powi(2);
        let (n, m) = (a / w.sqrt(), a * (1. - e2) / w.powf(1.5));
        let mut maxes = [0f64; 4];
        for course in (0..180).map(|c| c as f64) {
            let mut row = vec![];
            for (k, y) in [3000., 5000., 7500., 10000.].into_iter().enumerate() {
                let mut worst = 0f64;
                for side in [90., -90.] {
                    let (lat2, lon2): (f64, f64) = g.direct(lat, 0., course + side, y);
                    let e = lon2.to_radians() * n * phi.cos();
                    let nn = (lat2 - lat).to_radians() * m;
                    let c = course.to_radians();
                    let along = e * c.sin() + nn * c.cos();
                    worst = worst.max(along.abs());
                }
                maxes[k] = maxes[k].max(worst);
                row.push(worst);
            }
            if course as i64 % 45 == 0 {
                println!("{lat:>4} {course:>5} | {:.2} {:.2} {:.2} {:.2}", row[0], row[1], row[2], row[3]);
            }
        }
        println!("{lat:>4}   max | {:.2} {:.2} {:.2} {:.2}", maxes[0], maxes[1], maxes[2], maxes[3]);
    }
}
