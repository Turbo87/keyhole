//! Scratch: compare SeeYou's flat start line with a geodesic start line.
//! Usage: geoline <day dir>... > flights.jsonl

use std::{env, fs, io::Read, path::Path};

use flate2::read::GzDecoder;
use geographiclib_rs::{Geodesic, InverseGeodesic};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct TaskJson {
    task_type: String,
    result_status: String,
    task_points: Vec<TaskPoint>,
}

#[derive(Deserialize, Clone)]
struct TaskPoint {
    #[serde(rename = "type")]
    kind: String,
    latitude: f64,
    longitude: f64,
    #[serde(default)]
    distance: f64,
    oz_radius1: f64,
    #[serde(default)]
    oz_line: bool,
    #[serde(default)]
    multiple_start: bool,
}

impl TaskPoint {
    fn lat(&self) -> f64 {
        self.latitude.to_degrees()
    }
    fn lon(&self) -> f64 {
        self.longitude.to_degrees()
    }
}

#[derive(Deserialize)]
struct Row {
    rank: String,
    cn: String,
    handicap: Option<f64>,
    start_time_local: String,
    finish_time_local: String,
    speed_kmh: Option<f64>,
    distance_km: Option<f64>,
    points: Option<f64>,
}

struct Fix {
    t: i64,
    lat: f64,
    lon: f64,
}

const R: f64 = 6_371_000.;

fn sphere_polar(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> (f64, f64) {
    let (p1, p2, dl) = (lat1.to_radians(), lat2.to_radians(), (lon2 - lon1).to_radians());
    let a = ((p2 - p1) / 2.).sin().powi(2) + p1.cos() * p2.cos() * (dl / 2.).sin().powi(2);
    let s = 2. * R * a.sqrt().min(1.).asin();
    let az = (dl.sin() * p2.cos()).atan2(p1.cos() * p2.sin() - p1.sin() * p2.cos() * dl.cos());
    (s, az.to_degrees())
}

fn parse_hms(s: &str) -> Option<i64> {
    let mut it = s.split(':').filter_map(|p| p.parse::<i64>().ok());
    Some(it.next()? * 3600 + it.next()? * 60 + it.next()?)
}

fn read_fixes(path: &Path) -> Vec<Fix> {
    let mut bytes = Vec::new();
    GzDecoder::new(fs::File::open(path).unwrap())
        .read_to_end(&mut bytes)
        .unwrap();
    let text = String::from_utf8_lossy(&bytes);
    let mut fixes: Vec<Fix> = Vec::new();
    let mut day_offset = 0;
    for line in text.lines() {
        let Ok(b) = igc::records::BRecord::parse(line) else {
            continue;
        };
        if b.fix_valid != igc::records::FixValid::Valid {
            continue;
        }
        let mut t = b.timestamp.seconds_since_midnight() as i64 + day_offset;
        if fixes.last().is_some_and(|last| t < last.t - 12 * 3600) {
            day_offset += 86400;
            t += 86400;
        }
        if fixes.last().is_some_and(|last| t <= last.t) {
            continue;
        }
        fixes.push(Fix { t, lat: b.pos.lat.into(), lon: b.pos.lon.into() });
    }
    fixes
}

fn main() {
    let g = Geodesic::wgs84();
    for dir in env::args().skip(1) {
        let dir = Path::new(&dir);
        let Ok(task) = fs::read_to_string(dir.join("task.json")) else { continue };
        let Ok(task) = serde_json::from_str::<TaskJson>(&task) else {
            eprintln!("{}: bad task.json", dir.display());
            continue;
        };
        if task.result_status == "cancelled" {
            continue;
        }
        let points: Vec<TaskPoint> =
            task.task_points.iter().filter(|p| !p.multiple_start).cloned().collect();
        if points.len() < 2 || points[0].kind != "start" || !points[0].oz_line {
            eprintln!("{}: no start line", dir.display());
            continue;
        }
        // Earth model from the published leg lengths.
        let (mut pub_sum, mut w_sum, mut s_sum) = (0., 0., 0.);
        for w in points[..points.len() - 1].windows(2) {
            pub_sum += w[1].distance;
            w_sum += InverseGeodesic::<f64>::inverse(&g, w[0].lat(), w[0].lon(), w[1].lat(), w[1].lon());
            s_sum += sphere_polar(w[0].lat(), w[0].lon(), w[1].lat(), w[1].lon()).0;
        }
        let sphere = match env::var("MODEL").as_deref() { Ok("sphere") => true, Ok("wgs84") => false, _ => (pub_sum - s_sum).abs() < (pub_sum - w_sum).abs() };
        let model = if sphere { "sphere" } else { "wgs84" };

        let st = &points[0];
        let first = &points[1];
        let half = st.oz_radius1;
        let course_deg = if sphere && env::var("COURSE").is_err() {
            sphere_polar(st.lat(), st.lon(), first.lat(), first.lon()).1
        } else {
            let (_, az, _, _): (f64, f64, f64, f64) =
                g.inverse(st.lat(), st.lon(), first.lat(), first.lon());
            az
        };
        let course = course_deg.to_radians();
        let (a, f) = (6_378_137.0_f64, 1. / 298.257_223_563);
        let e2 = f * (2. - f);
        let phi = st.latitude;
        let wq = 1. - e2 * phi.sin().powi(2);
        let (n, m) = if sphere { (R, R) } else { (a / wq.sqrt(), a * (1. - e2) / wq.powf(1.5)) };
        let ky = m.to_radians();
        let kx = (n * phi.cos()).to_radians();
        let flat = |fx: &Fix| -> (f64, f64) {
            let e = (fx.lon - st.lon()) * kx;
            let nn = (fx.lat - st.lat()) * ky;
            let (s, c) = course.sin_cos();
            (e * s + nn * c, e * c - nn * s)
        };
        let geo = |fx: &Fix| -> (f64, f64) {
            let (s, az) = if sphere {
                sphere_polar(st.lat(), st.lon(), fx.lat, fx.lon)
            } else {
                let (s, az, _, _): (f64, f64, f64, f64) = g.inverse(st.lat(), st.lon(), fx.lat, fx.lon);
                (s, az)
            };
            let rel = (az - course_deg).to_radians();
            (s * rel.cos(), s * rel.sin())
        };

        let Ok(mut rdr) = csv::Reader::from_path(dir.join("results.csv")) else { continue };
        let files: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        for row in rdr.deserialize::<Row>() {
            let Ok(row) = row else { continue };
            let Some(pub_start) = parse_hms(&row.start_time_local) else { continue };
            let suffix = format!("_{}.igc.gz", row.cn);
            let Some(file) = files.iter().find(|f| f.ends_with(&suffix)) else { continue };
            let fixes = read_fixes(&dir.join(file));
            if fixes.len() < 10 {
                continue;
            }
            let fl: Vec<(f64, f64)> = fixes.iter().map(|f| flat(f)).collect();
            let mut flat_x = vec![];
            let mut geo_x = vec![];
            let mut gcache: Vec<Option<(f64, f64)>> = vec![None; fixes.len()];
            let near = |p: (f64, f64)| p.0.abs() < 3000. && p.1.abs() < half + 3000.;
            for i in 1..fixes.len() {
                let (t0, t1) = (fixes[i - 1].t as f64, fixes[i].t as f64);
                let ((x0, y0), (x1, y1)) = (fl[i - 1], fl[i]);
                if x0 < 0. && x1 >= 0. {
                    let fr = -x0 / (x1 - x0);
                    let y = y0 + fr * (y1 - y0);
                    if y.abs() <= half + 1000. {
                        flat_x.push((t0 + fr * (t1 - t0), y));
                    }
                }
                if near(fl[i - 1]) || near(fl[i]) {
                    for k in [i - 1, i] {
                        if gcache[k].is_none() {
                            gcache[k] = Some(geo(&fixes[k]));
                        }
                    }
                    let (x0, y0) = gcache[i - 1].unwrap();
                    let (x1, y1) = gcache[i].unwrap();
                    if x0 < 0. && x1 >= 0. {
                        let fr = -x0 / (x1 - x0);
                        let y = y0 + fr * (y1 - y0);
                        if y.abs() <= half + 1000. {
                            geo_x.push((t0 + fr * (t1 - t0), y));
                        }
                    }
                }
            }
            let mut d: Vec<i64> = fixes.windows(2).map(|w| w[1].t - w[0].t).collect();
            d.sort();
            println!(
                "{}",
                json!({
                    "day": dir.display().to_string(),
                    "status": task.result_status,
                    "task_type": task.task_type,
                    "model": model,
                    "half": half, "pub_sum": pub_sum, "w_sum": w_sum, "s_sum": s_sum,
                    "lat": st.lat(),
                    "rank": row.rank,
                    "cn": row.cn,
                    "handicap": row.handicap,
                    "pub_start": pub_start,
                    "pub_finish": parse_hms(&row.finish_time_local),
                    "speed": row.speed_kmh,
                    "distance": row.distance_km,
                    "points": row.points,
                    "interval": d[d.len() / 2],
                    "flat": flat_x,
                    "geo": geo_x,
                })
            );
        }
    }
}
