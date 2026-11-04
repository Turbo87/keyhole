//! Scratch benchmark: flat vs geodesic start line.
//! Usage: bench <day dir>...   (MODEL=sphere|wgs84, default wgs84)
//! Prints one JSON line per flight and a summary on stderr.

use std::{env, fs, hint::black_box, io::Read, path::Path, time::Instant};

use flate2::read::GzDecoder;
use geographiclib_rs::{DirectGeodesic, Geodesic, InverseGeodesic};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct TaskJson {
    result_status: String,
    task_points: Vec<TaskPoint>,
}
#[derive(Deserialize, Clone)]
struct TaskPoint {
    #[serde(rename = "type")]
    kind: String,
    latitude: f64,
    longitude: f64,
    oz_radius1: f64,
    #[serde(default)]
    oz_line: bool,
    #[serde(default)]
    multiple_start: bool,
}

#[derive(Clone, Copy)]
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

/// Point at distance `d` along initial azimuth `az` on the sphere.
fn sphere_direct(lat: f64, lon: f64, az: f64, d: f64) -> (f64, f64) {
    let (p1, l1, th, dl) = (lat.to_radians(), lon.to_radians(), az.to_radians(), d / R);
    let p2 = (p1.sin() * dl.cos() + p1.cos() * dl.sin() * th.cos()).asin();
    let l2 = l1 + (th.sin() * dl.sin() * p1.cos()).atan2(dl.cos() - p1.sin() * p2.sin());
    (p2.to_degrees(), l2.to_degrees())
}

fn read_fixes(path: &Path) -> Vec<Fix> {
    let mut bytes = Vec::new();
    GzDecoder::new(fs::File::open(path).unwrap()).read_to_end(&mut bytes).unwrap();
    let text = String::from_utf8_lossy(&bytes);
    let mut fixes: Vec<Fix> = Vec::new();
    let mut day_offset = 0;
    for line in text.lines() {
        let Ok(b) = igc::records::BRecord::parse(line) else { continue };
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

struct Line {
    sphere: bool,
    lat0: f64,
    lon0: f64,
    course_deg: f64,
    sin_c: f64,
    cos_c: f64,
    kx: f64,
    ky: f64,
    half: f64,
    g: Geodesic,
}

impl Line {
    fn new(st: &TaskPoint, first: &TaskPoint, sphere: bool) -> Self {
        let g = Geodesic::wgs84();
        let (lat0, lon0) = (st.latitude.to_degrees(), st.longitude.to_degrees());
        let (lat1, lon1) = (first.latitude.to_degrees(), first.longitude.to_degrees());
        let course_deg = if sphere {
            sphere_polar(lat0, lon0, lat1, lon1).1
        } else {
            let (_, az, _, _): (f64, f64, f64, f64) = g.inverse(lat0, lon0, lat1, lon1);
            az
        };
        let (a, f) = (6_378_137.0_f64, 1. / 298.257_223_563);
        let e2 = f * (2. - f);
        let phi = st.latitude;
        let w = 1. - e2 * phi.sin().powi(2);
        let (n, m) = if sphere { (R, R) } else { (a / w.sqrt(), a * (1. - e2) / w.powf(1.5)) };
        let (sin_c, cos_c) = course_deg.to_radians().sin_cos();
        Line {
            sphere,
            lat0,
            lon0,
            course_deg,
            sin_c,
            cos_c,
            kx: (n * phi.cos()).to_radians(),
            ky: m.to_radians(),
            half: st.oz_radius1,
            g,
        }
    }
    #[inline]
    fn flat(&self, f: &Fix) -> (f64, f64) {
        let e = (f.lon - self.lon0) * self.kx;
        let n = (f.lat - self.lat0) * self.ky;
        (e * self.sin_c + n * self.cos_c, e * self.cos_c - n * self.sin_c)
    }
    #[inline]
    fn geo_at(&self, lat: f64, lon: f64) -> (f64, f64) {
        let (s, az) = if self.sphere {
            sphere_polar(self.lat0, self.lon0, lat, lon)
        } else {
            let (s, az, _, _): (f64, f64, f64, f64) = self.g.inverse(self.lat0, self.lon0, lat, lon);
            (s, az)
        };
        let rel = (az - self.course_deg).to_radians();
        (s * rel.cos(), s * rel.sin())
    }
    #[inline]
    fn geo(&self, f: &Fix) -> (f64, f64) {
        self.geo_at(f.lat, f.lon)
    }
    /// Exact intersection of the fix-to-fix geodesic with the perpendicular geodesic.
    /// Returns (segment fraction by length, iterations).
    fn exact_frac(&self, a: &Fix, b: &Fix, x0: f64, x1: f64) -> (f64, u32) {
        let (s01, az01) = if self.sphere {
            sphere_polar(a.lat, a.lon, b.lat, b.lon)
        } else {
            let (s, az, _, _): (f64, f64, f64, f64) = self.g.inverse(a.lat, a.lon, b.lat, b.lon);
            (s, az)
        };
        let point = |u: f64| -> f64 {
            let (lat, lon) = if self.sphere {
                sphere_direct(a.lat, a.lon, az01, u * s01)
            } else {
                let (lat, lon): (f64, f64) = self.g.direct(a.lat, a.lon, az01, u * s01);
                (lat, lon)
            };
            self.geo_at(lat, lon).0
        };
        // Secant/regula falsi (Illinois) on x(u), bracket [0, 1].
        let (mut lo, mut hi, mut flo, mut fhi) = (0., 1., x0, x1);
        let mut u = -x0 / (x1 - x0);
        let mut it = 0;
        let mut side = 0;
        while it < 30 {
            it += 1;
            let fu = point(u);
            if fu.abs() < 1e-9 {
                break;
            }
            if fu < 0. {
                lo = u;
                flo = fu;
                if side == -1 {
                    fhi /= 2.;
                }
                side = -1;
            } else {
                hi = u;
                fhi = fu;
                if side == 1 {
                    flo /= 2.;
                }
                side = 1;
            }
            u = lo - flo * (hi - lo) / (fhi - flo);
        }
        (u, it)
    }
}

struct Crossing {
    i: usize,
    frac: f64,
    x0: f64,
    x1: f64,
}

fn crossings(fixes: &[Fix], xy: &[(f64, f64)], half: f64) -> Vec<Crossing> {
    let mut out = vec![];
    for i in 1..fixes.len() {
        let ((x0, y0), (x1, y1)) = (xy[i - 1], xy[i]);
        if x0 < 0. && x1 >= 0. {
            let frac = -x0 / (x1 - x0);
            if (y0 + frac * (y1 - y0)).abs() <= half + 500. {
                out.push(Crossing { i, frac, x0, x1 });
            }
        }
    }
    out
}

fn ns(t: Instant) -> f64 {
    t.elapsed().as_nanos() as f64
}

fn main() {
    let sphere = env::var("MODEL").is_ok_and(|m| m == "sphere");
    let band: f64 = env::var("BAND").map_or(200., |v| v.parse().unwrap());
    let reps: usize = env::var("REPS").map_or(3, |v| v.parse().unwrap());
    for dir in env::args().skip(1) {
        let dir = Path::new(&dir);
        let Ok(task) = fs::read_to_string(dir.join("task.json")) else { continue };
        let Ok(task) = serde_json::from_str::<TaskJson>(&task) else { continue };
        if task.result_status == "cancelled" {
            continue;
        }
        let pts: Vec<TaskPoint> = task.task_points.iter().filter(|p| !p.multiple_start).cloned().collect();
        if pts.len() < 2 || pts[0].kind != "start" || !pts[0].oz_line {
            continue;
        }
        let line = Line::new(&pts[0], &pts[1], sphere);
        let mut files: Vec<_> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.to_string_lossy().ends_with(".igc.gz"))
            .collect();
        files.sort();
        for file in files {
            let t = Instant::now();
            let fixes = read_fixes(&file);
            let parse_ns = ns(t);
            if fixes.len() < 10 {
                continue;
            }
            let n = fixes.len();
            let mut best = [f64::INFINITY; 6];
            let mut flat_c = vec![];
            let mut geo_c = vec![];
            let mut pre_c = vec![];
            let mut pre_evals = 0;
            for _ in 0..reps {
                // flat: side test (projection) for every fix + crossing detection
                let t = Instant::now();
                let xy: Vec<(f64, f64)> = fixes.iter().map(|f| line.flat(f)).collect();
                let c = crossings(&fixes, black_box(&xy), line.half);
                best[0] = best[0].min(ns(t));
                flat_c = c;
                // geodesic: every fix
                let t = Instant::now();
                let gxy: Vec<(f64, f64)> = fixes.iter().map(|f| line.geo(f)).collect();
                let c = crossings(&fixes, black_box(&gxy), line.half);
                best[1] = best[1].min(ns(t));
                geo_c = c;
                // geodesic with flat prefilter: geodesic only where the segment changes
                // flat side or an endpoint lies within `band` of the flat line.
                let t = Instant::now();
                let mut out = vec![];
                let mut evals = 0;
                let mut prev = line.flat(&fixes[0]);
                let mut prev_g: Option<(f64, f64)> = None;
                for i in 1..n {
                    let cur = line.flat(&fixes[i]);
                    let cand = ((prev.0 < 0.) != (cur.0 < 0.) || prev.0.abs() < band || cur.0.abs() < band)
                        && prev.1.abs().min(cur.1.abs()) < line.half + 500. + band + 1000.;
                    if cand {
                        let g0 = prev_g.unwrap_or_else(|| {
                            evals += 1;
                            line.geo(&fixes[i - 1])
                        });
                        evals += 1;
                        let g1 = line.geo(&fixes[i]);
                        if g0.0 < 0. && g1.0 >= 0. {
                            let frac = -g0.0 / (g1.0 - g0.0);
                            if (g0.1 + frac * (g1.1 - g0.1)).abs() <= line.half + 500. {
                                out.push(Crossing { i, frac, x0: g0.0, x1: g1.0 });
                            }
                        }
                        prev_g = Some(g1);
                    } else {
                        prev_g = None;
                    }
                    prev = cur;
                }
                best[2] = best[2].min(ns(t));
                pre_c = out;
                pre_evals = evals;
                // per-fix micro: flat projection only / geodesic inverse only
                let t = Instant::now();
                let mut acc = 0.;
                for f in &fixes {
                    acc += line.flat(black_box(f)).0;
                }
                black_box(acc);
                best[3] = best[3].min(ns(t));
                let t = Instant::now();
                let mut acc = 0.;
                for f in &fixes {
                    acc += line.geo(black_box(f)).0;
                }
                black_box(acc);
                best[4] = best[4].min(ns(t));
            }
            // exact intersection on every geodesic crossing
            let t = Instant::now();
            let mut iters = 0;
            let mut exact = vec![];
            for c in &geo_c {
                let (u, it) = line.exact_frac(&fixes[c.i - 1], &fixes[c.i], c.x0, c.x1);
                iters += it;
                exact.push(u);
            }
            best[5] = ns(t);
            let identical = pre_c.len() == geo_c.len()
                && pre_c.iter().zip(&geo_c).all(|(a, b)| a.i == b.i && a.frac == b.frac);
            let times = |cs: &[Crossing]| -> Vec<f64> {
                cs.iter()
                    .map(|c| {
                        let (t0, t1) = (fixes[c.i - 1].t as f64, fixes[c.i].t as f64);
                        t0 + c.frac * (t1 - t0)
                    })
                    .collect()
            };
            let lin_t = times(&geo_c);
            let exact_t: Vec<f64> = geo_c
                .iter()
                .zip(&exact)
                .map(|(c, u)| {
                    let (t0, t1) = (fixes[c.i - 1].t as f64, fixes[c.i].t as f64);
                    t0 + u * (t1 - t0)
                })
                .collect();
            let floor_diff = lin_t.iter().zip(&exact_t).filter(|(a, b)| a.floor() != b.floor()).count();
            let max_dt = lin_t.iter().zip(&exact_t).map(|(a, b)| (a - b).abs()).fold(0., f64::max);
            println!(
                "{}",
                json!({
                    "file": file.display().to_string(), "n": n, "parse_ns": parse_ns,
                    "flat_ns": best[0], "geo_ns": best[1], "pre_ns": best[2],
                    "flat_proj_ns": best[3], "geo_proj_ns": best[4], "exact_ns": best[5],
                    "n_flat": flat_c.len(), "n_geo": geo_c.len(), "pre_evals": pre_evals,
                    "identical": identical, "exact_iters": iters,
                    "floor_diff": floor_diff, "max_exact_dt": max_dt,
                })
            );
        }
    }
}
