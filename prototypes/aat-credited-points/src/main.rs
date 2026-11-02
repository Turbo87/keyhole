//! PROTOTYPE, throwaway. Explores credited point search for AAT finishers:
//! can a convex hull of each area's fixes replace the exhaustive search?
//!
//! Usage: BRUTE=1 cargo run --release -- <day dir>... > flights.jsonl
//!
//! A day dir is soaringspot-downloader output: `task.json`, `results.csv`
//! and `<id>_<CN>.igc.gz` files. For every finisher this prints one JSON line
//! with the hull-pruned optimum on both earth models and, with `BRUTE=1`, the
//! exhaustive optimum.

use std::{collections::HashMap, env, fs, io::Read, path::Path, time::Instant};

use flate2::read::GzDecoder;
use geographiclib_rs::{Geodesic, InverseGeodesic};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct TaskJson {
    task_type: String,
    result_status: String,
    task_points: Vec<TaskPoint>,
}

#[derive(Deserialize, Clone)]
struct TaskPoint {
    latitude: f64,
    longitude: f64,
    oz_radius1: f64,
    #[serde(default)]
    oz_radius2: f64,
    #[serde(default)]
    oz_angle1: f64,
    #[serde(default)]
    oz_angle2: f64,
    #[serde(default)]
    oz_angle12: f64,
    #[serde(default)]
    oz_reduce: bool,
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
struct ResultRow {
    cn: String,
    start_time_local: String,
    finish_time_local: String,
    distance_km: String,
}

#[derive(Clone, Copy)]
struct Fix {
    t: i64,
    lat: f64,
    lon: f64,
}

#[derive(Serialize, Default)]
struct Search {
    distance_m: f64,
    /// Fix indices of the credited points, one per area.
    credited: Vec<usize>,
    candidates: usize,
    micros: u128,
}

#[derive(Serialize)]
struct ModelReport {
    hull: Search,
    brute: Option<Search>,
    /// Fixes per area inside the zone during the task.
    in_zone: Vec<usize>,
    /// Visits per area, and visits that share a fix with an adjacent area.
    visits: Vec<usize>,
    overlapping_visits: usize,
    /// The hull path measured on a flat map scaled at the start latitude, and
    /// with one flat map per leg scaled at the leg's mean latitude.
    flat_start_m: f64,
    flat_leg_m: f64,
}

#[derive(Serialize)]
struct FlightReport {
    day: String,
    cn: String,
    pub_distance_m: f64,
    interval_s: f64,
    wgs84: ModelReport,
    sphere: ModelReport,
}

fn main() {
    let brute = env::var("BRUTE").is_ok();
    for dir in env::args().skip(1) {
        let dir = Path::new(&dir);
        let task: TaskJson =
            serde_json::from_slice(&fs::read(dir.join("task.json")).unwrap()).unwrap();
        if task.task_type != "assigned_area" || task.result_status != "official" {
            continue;
        }
        let mut files: HashMap<String, std::path::PathBuf> = HashMap::new();
        for e in fs::read_dir(dir).unwrap().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if let Some(stem) = name.strip_suffix(".igc.gz") {
                if let Some((_, cn)) = stem.split_once('_') {
                    files.insert(cn.to_owned(), e.path());
                }
            }
        }
        let rows: Vec<ResultRow> = csv::Reader::from_path(dir.join("results.csv"))
            .unwrap()
            .deserialize()
            .filter_map(Result::ok)
            .collect();
        let flights: Vec<(&ResultRow, Vec<Fix>, i64, i64)> = rows
            .iter()
            .filter_map(|r| {
                let start = parse_hms(&r.start_time_local)?;
                let finish = parse_hms(&r.finish_time_local)?;
                let fixes = read_fixes(files.get(&r.cn)?);
                (fixes.len() > 10).then_some((r, fixes, start, finish))
            })
            .collect();
        let Some(offset) = utc_offset(&flights, &task.task_points[0]) else {
            eprintln!("{}: no UTC offset", dir.display());
            continue;
        };
        let day = dir.components().rev().take(3).collect::<Vec<_>>();
        let day = day
            .iter()
            .rev()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        let reports: Vec<FlightReport> = flights
            .par_iter()
            .map(|(row, fixes, start, finish)| {
                let (from, to) = (start - offset, finish - offset);
                let window: Vec<Fix> = fixes
                    .iter()
                    .copied()
                    .filter(|f| f.t >= from && f.t <= to && f.t % sample() == 0)
                    .collect();
                FlightReport {
                    day: day.clone(),
                    cn: row.cn.clone(),
                    pub_distance_m: row.distance_km.parse::<f64>().unwrap_or(f64::NAN) * 1000.,
                    interval_s: median_interval(fixes),
                    wgs84: analyse(&task.task_points, &window, &Geodesic::wgs84(), brute),
                    sphere: analyse(
                        &task.task_points,
                        &window,
                        &Geodesic::new(6_371_000., 0.),
                        brute,
                    ),
                }
            })
            .collect();
        for r in reports {
            println!("{}", serde_json::to_string(&r).unwrap());
        }
    }
}

fn parse_hms(s: &str) -> Option<i64> {
    let mut it = s.split(':').map(|p| p.parse::<i64>().ok());
    Some(it.next()?? * 3600 + it.next()?? * 60 + it.next()??)
}

fn median_interval(fixes: &[Fix]) -> f64 {
    let mut d: Vec<i64> = fixes.windows(2).map(|w| w[1].t - w[0].t).collect();
    d.sort();
    d[d.len() / 2] as f64
}

/// Whole-hour offset that puts the most published starts near the start point.
fn utc_offset(flights: &[(&ResultRow, Vec<Fix>, i64, i64)], start: &TaskPoint) -> Option<i64> {
    let g = Geodesic::wgs84();
    (-12..=14)
        .map(|h| {
            let hits = flights
                .iter()
                .filter(|(_, fixes, s, _)| {
                    let t = s - h * 3600;
                    fixes.iter().find(|f| f.t >= t).is_some_and(|f| {
                        let d: f64 = g.inverse(f.lat, f.lon, start.lat(), start.lon());
                        f.t - t < 30 && d < start.oz_radius1 + 2000.
                    })
                })
                .count();
            (hits, h * 3600)
        })
        .max()
        .filter(|(hits, _)| *hits > 0)
        .map(|(_, o)| o)
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
        fixes.push(Fix {
            t,
            lat: b.pos.lat.into(),
            lon: b.pos.lon.into(),
        });
    }
    fixes
}

fn angle_diff(a: f64, b: f64) -> f64 {
    let d = (a - b).rem_euclid(std::f64::consts::TAU);
    d.min(std::f64::consts::TAU - d)
}

/// SeeYou's two-arc zone. `oz_angle12` is the inner bisector (ticket #11) on
/// fixed sectors too, so the sector points the opposite way.
fn in_zone(tp: &TaskPoint, s: f64, az_deg: f64) -> bool {
    let dir = tp.oz_angle12 + std::f64::consts::PI;
    let d = angle_diff(az_deg.to_radians(), dir);
    let first = s <= tp.oz_radius1 + zone_margin() && d <= tp.oz_angle1 + 1e-9;
    let second = tp.oz_angle2 > 0. && s <= tp.oz_radius2 && d <= tp.oz_angle2 + 1e-9;
    first || second
}

/// Candidate fix indices of one area, split into visits (runs of consecutive fixes).
fn visits(points: &[TaskPoint], area: usize, fixes: &[Fix], g: &Geodesic) -> Vec<Vec<usize>> {
    let tp = &points[area];
    let mut out: Vec<Vec<usize>> = Vec::new();
    let mut last: Option<usize> = None;
    for (i, f) in fixes.iter().enumerate() {
        let (s, az, _, _): (f64, f64, f64, f64) = g.inverse(tp.lat(), tp.lon(), f.lat, f.lon);
        if in_zone(tp, s, az) {
            if last == Some(i.wrapping_sub(1)) {
                out.last_mut().unwrap().push(i);
            } else {
                out.push(vec![i]);
            }
            last = Some(i);
        }
    }
    out
}

/// Vertices of the convex hull in (lon, lat). Hull membership is invariant
/// under the axis scaling of any equirectangular flat map, so the result is
/// the same for every earth model.
fn hull(fixes: &[Fix], visit: &[usize]) -> Vec<usize> {
    if visit.len() <= 3 {
        return visit.to_vec();
    }
    let mut pts = visit.to_vec();
    pts.sort_by(|&a, &b| {
        (fixes[a].lon, fixes[a].lat)
            .partial_cmp(&(fixes[b].lon, fixes[b].lat))
            .unwrap()
    });
    let cross = |o: usize, a: usize, b: usize| {
        (fixes[a].lon - fixes[o].lon) * (fixes[b].lat - fixes[o].lat)
            - (fixes[a].lat - fixes[o].lat) * (fixes[b].lon - fixes[o].lon)
    };
    let mut lower: Vec<usize> = Vec::new();
    for &p in &pts {
        while lower.len() >= 2 && cross(lower[lower.len() - 2], lower[lower.len() - 1], p) <= 0. {
            lower.pop();
        }
        lower.push(p);
    }
    let mut upper: Vec<usize> = Vec::new();
    for &p in pts.iter().rev() {
        while upper.len() >= 2 && cross(upper[upper.len() - 2], upper[upper.len() - 1], p) <= 0. {
            upper.pop();
        }
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    lower.extend(upper);
    lower.sort();
    lower
}

/// Maximum distance from the start point through one fix per area, in time
/// order, to the finish point.
fn search(points: &[TaskPoint], fixes: &[Fix], cands: &[Vec<usize>], g: &Geodesic) -> Search {
    let t0 = Instant::now();
    let (first, last) = (&points[0], &points[points.len() - 1]);
    // (fix index, value, back pointer into previous layer)
    let mut layers: Vec<Vec<(usize, f64, usize)>> = Vec::new();
    for (a, cs) in cands.iter().enumerate() {
        let layer = cs
            .iter()
            .filter_map(|&j| {
                let f = fixes[j];
                if a == 0 {
                    let d: f64 = g.inverse(first.lat(), first.lon(), f.lat, f.lon);
                    return Some((j, d, 0));
                }
                layers[a - 1]
                    .iter()
                    .enumerate()
                    .filter(|(_, (k, _, _))| *k <= j)
                    .map(|(ki, &(k, v, _))| {
                        let d: f64 = g.inverse(fixes[k].lat, fixes[k].lon, f.lat, f.lon);
                        (j, v + d, ki)
                    })
                    .max_by(|x, y| x.1.total_cmp(&y.1))
            })
            .collect::<Vec<_>>();
        if layer.is_empty() {
            return Search::default();
        }
        layers.push(layer);
    }
    let reduce = if last.oz_reduce { last.oz_radius1 } else { 0. };
    let (mut ki, distance_m) = layers
        .last()
        .unwrap()
        .iter()
        .enumerate()
        .map(|(ki, &(k, v, _))| {
            let d: f64 = g.inverse(fixes[k].lat, fixes[k].lon, last.lat(), last.lon());
            (ki, v + d - reduce)
        })
        .max_by(|x, y| x.1.total_cmp(&y.1))
        .unwrap();
    let mut credited = vec![0; layers.len()];
    for a in (0..layers.len()).rev() {
        credited[a] = layers[a][ki].0;
        ki = layers[a][ki].2;
    }
    Search {
        distance_m,
        credited,
        candidates: cands.iter().map(Vec::len).sum(),
        micros: t0.elapsed().as_micros(),
    }
}

fn analyse(points: &[TaskPoint], fixes: &[Fix], g: &Geodesic, brute: bool) -> ModelReport {
    let areas: Vec<Vec<Vec<usize>>> = (1..points.len() - 1)
        .map(|a| {
            // ZONE_EARTH tests zones on another earth model than distances.
            let zg = match env::var("ZONE_EARTH").as_deref() {
                Ok("sphere") => Geodesic::new(6_371_000., 0.),
                Ok("wgs84") => Geodesic::wgs84(),
                _ => *g,
            };
            visits(points, a, fixes, &zg)
        })
        .collect();
    let all: Vec<Vec<usize>> = areas.iter().map(|v| v.concat()).collect();
    let mut overlapping_visits = 0;
    let pruned: Vec<Vec<usize>> = areas
        .iter()
        .enumerate()
        .map(|(a, vs)| {
            let mut out: Vec<usize> = vs
                .iter()
                .flat_map(|v| {
                    // A visit sharing a fix with an adjacent area can straddle the
                    // neighbour's credited time, so its hull is not enough.
                    let shared = [a.checked_sub(1), Some(a + 1)]
                        .into_iter()
                        .flatten()
                        .filter_map(|n| all.get(n))
                        .any(|n| v.iter().any(|i| n.binary_search(i).is_ok()));
                    if shared {
                        overlapping_visits += 1;
                        v.clone()
                    } else {
                        hull(fixes, v)
                    }
                })
                .collect();
            out.sort();
            out
        })
        .collect();
    let hull = search(points, fixes, &pruned, g);
    let path: Vec<(f64, f64)> = std::iter::once((points[0].lat(), points[0].lon()))
        .chain(hull.credited.iter().map(|&i| (fixes[i].lat, fixes[i].lon)))
        .chain(std::iter::once((points[points.len() - 1].lat(), points[points.len() - 1].lon())))
        .collect();
    let last = &points[points.len() - 1];
    let reduce = if last.oz_reduce { last.oz_radius1 } else { 0. };
    let flat = |ref_lat: Option<f64>| {
        path.windows(2)
            .map(|w| flat_distance(g, ref_lat.unwrap_or((w[0].0 + w[1].0) / 2.), w[0], w[1]))
            .sum::<f64>()
            - reduce
    };
    ModelReport {
        flat_start_m: if hull.credited.is_empty() { 0. } else { flat(Some(points[0].lat())) },
        flat_leg_m: if hull.credited.is_empty() { 0. } else { flat(None) },
        hull,
        brute: brute.then(|| search(points, fixes, &all, g)),
        in_zone: all.iter().map(Vec::len).collect(),
        visits: areas.iter().map(Vec::len).collect(),
        overlapping_visits,
    }
}

/// `SAMPLE=k` keeps only fixes on whole multiples of `k` seconds.
fn sample() -> i64 {
    env::var("SAMPLE").map_or(1, |v| v.parse().unwrap())
}

/// Equirectangular distance scaled by the earth model's radii of curvature
/// at `ref_lat` (ticket #17).
fn flat_distance(g: &Geodesic, ref_lat: f64, a: (f64, f64), b: (f64, f64)) -> f64 {
    let e2 = g.f * (2. - g.f);
    let phi = ref_lat.to_radians();
    let w = 1. - e2 * phi.sin().powi(2);
    let (n, m) = (g.a / w.sqrt(), g.a * (1. - e2) / w.powf(1.5));
    let dx = (b.1 - a.1).to_radians() * n * phi.cos();
    let dy = (b.0 - a.0).to_radians() * m;
    dx.hypot(dy)
}

/// `ZONE_MARGIN` widens the first arc by this many metres.
fn zone_margin() -> f64 {
    env::var("ZONE_MARGIN").map_or(0., |v| v.parse().unwrap())
}
