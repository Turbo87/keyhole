//! PROTOTYPE, throwaway. Answers "How often does only the line between two
//! fixes reach an observation zone, and does SeeYou credit it?".
//!
//! Usage: cargo run --release -- <soaringspot-downloader output> > flights.jsonl
//!
//! Every flight with a published start on an official day becomes one JSON
//! line with each turnpoint or area it reaches in order, how it reached it,
//! and the distances that SeeYou's published result can be compared with.

use std::{
    collections::HashMap,
    env, fs,
    io::Read,
    path::{Path, PathBuf},
};

use flate2::read::GzDecoder;
use geographiclib_rs::{DirectGeodesic, Geodesic, InverseGeodesic};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

const PI: f64 = std::f64::consts::PI;
/// SeeYou's sphere radius, from the AAT distance research.
const SPHERE_RADIUS: f64 = 6_370_775.;
/// Spacing of the samples along a segment between two fixes.
const SAMPLE_M: f64 = 1.;

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
    fn pos(&self) -> (f64, f64) {
        (self.lat(), self.lon())
    }
    fn has_second_arc(&self) -> bool {
        self.oz_radius2 > 0. && self.oz_angle2 > 0.
    }
    fn max_radius(&self) -> f64 {
        if self.has_second_arc() {
            self.oz_radius1.max(self.oz_radius2)
        } else {
            self.oz_radius1
        }
    }
}

#[derive(Deserialize)]
struct ResultRow {
    cn: String,
    start_time_local: String,
    finish_time_local: String,
    distance_km: String,
    #[serde(default)]
    remarks: String,
}

#[derive(Clone, Copy)]
struct Fix {
    t: i64,
    lat: f64,
    lon: f64,
    engine: u16,
}

/// How a segment between two fixes is drawn.
#[derive(Clone, Copy)]
enum Segment {
    /// The geodesic between the fixes.
    Geodesic,
    /// A straight line on an azimuthal equidistant map centred on the zone.
    Azimuthal,
    /// A straight line in (lat, lon).
    LatLon,
}

#[derive(Serialize)]
struct FlightReport {
    day: String,
    cn: String,
    task_type: String,
    status: String,
    rule_set: String,
    earth: String,
    interval_s: i64,
    finisher: bool,
    pub_distance_m: f64,
    remarks: String,
    zones: Vec<ZoneReport>,
    /// Intermediate points achieved in order with segments and with fixes only.
    achieved_line: usize,
    achieved_fix: usize,
    intermediate: usize,
    /// Racing outlanding distance under both rules.
    racing_line_m: Option<f64>,
    racing_fix_m: Option<f64>,
    aat: Option<AatVariants>,
}

#[derive(Serialize)]
struct ZoneReport {
    index: usize,
    shape: String,
    /// `fix`, `line` or `missed`.
    reached: String,
    /// Deepest point of any segment inside the zone, by segment geometry.
    /// Negative values are the closest approach from outside.
    depth_geodesic_m: f64,
    depth_azimuthal_m: f64,
    depth_latlon_m: f64,
    /// Depth of the fix closest to the zone, negative outside.
    best_fix_depth_m: f64,
    /// Segments with both fixes outside that reach the zone (geodesic), also
    /// when a fix lies inside elsewhere.
    line_segments: usize,
    /// Length of the segment that reaches deepest.
    segment_m: f64,
    segment_s: i64,
}

#[derive(Serialize, Default)]
struct AatVariants {
    /// Optimum distance with each candidate rule for the areas reached only
    /// by a segment. All other areas use their logged fixes.
    deepest_point_m: f64,
    entry_exit_m: f64,
    inside_part_m: f64,
    whole_segment_m: f64,
    nearest_fix_m: f64,
    both_fixes_m: f64,
    /// Optimum over the logged fixes when no area is line-only.
    fixes_only_m: f64,
}

fn main() {
    let root = PathBuf::from(
        env::args()
            .nth(1)
            .expect("usage: <soaringspot-downloader output>"),
    );
    let mut days: Vec<PathBuf> = Vec::new();
    for comp in sorted_dirs(&root) {
        for class in sorted_dirs(&comp) {
            days.extend(sorted_dirs(&class));
        }
    }
    // `ONLY=<competition>/<class>/<date>` prefix limits the run.
    if let Ok(only) = env::var("ONLY") {
        days.retain(|d| {
            d.strip_prefix(&root)
                .unwrap()
                .to_string_lossy()
                .starts_with(&only)
        });
    }
    let reports: Vec<Vec<FlightReport>> = days.par_iter().map(|d| score_day(&root, d)).collect();
    for r in reports.iter().flatten() {
        println!("{}", serde_json::to_string(r).unwrap());
    }
}

fn sorted_dirs(dir: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    v.sort();
    v
}

/// SWO from the DAeC script name or a German competition, Annex A for FAI
/// championships, and the national rules of Australia and South Africa
/// otherwise.
fn rule_set(competition: &str, task_info: &str) -> &'static str {
    let german = ["dm", "euregiocup", "dsmf", "jenacup"];
    let fai = ["fai", "wgc", "egc", "jwgc", "jegc", "junior-world"];
    if task_info.contains("DAeC-SWO") || german.iter().any(|p| competition.starts_with(p)) {
        "SWO"
    } else if fai.iter().any(|p| competition.contains(p)) {
        "Annex A"
    } else {
        "national"
    }
}

fn task_info(dir: &Path) -> String {
    let html = fs::read_to_string(dir.join("results.html")).unwrap_or_default();
    html.split_once("Task info:</span>")
        .map(|(_, rest)| rest.split("</span>").next().unwrap_or("").to_owned())
        .unwrap_or_default()
}

/// The earth model whose legs match the `distance` fields of `task.json`.
fn earth_model(points: &[TaskPoint]) -> (&'static str, Geodesic) {
    let wgs84 = Geodesic::wgs84();
    let sphere = Geodesic::new(SPHERE_RADIUS, 0.);
    let error = |g: &Geodesic| -> f64 {
        points
            .windows(2)
            .map(|w| {
                let d: f64 = g.inverse(w[0].lat(), w[0].lon(), w[1].lat(), w[1].lon());
                (d - w[1].distance).abs()
            })
            .sum()
    };
    if error(&sphere) < error(&wgs84) {
        ("sphere", sphere)
    } else {
        ("wgs84", wgs84)
    }
}

fn score_day(root: &Path, dir: &Path) -> Vec<FlightReport> {
    let Ok(bytes) = fs::read(dir.join("task.json")) else {
        return vec![];
    };
    let Ok(task) = serde_json::from_slice::<TaskJson>(&bytes) else {
        return vec![];
    };
    // `PRACTICE=1` also scores practice and unofficial days.
    if task.result_status != "official" && env::var("PRACTICE").is_err() {
        return vec![];
    }
    let (Some(s), Some(f)) = (
        task.task_points.iter().position(|p| p.kind == "start"),
        task.task_points.iter().position(|p| p.kind == "finish"),
    ) else {
        return vec![];
    };
    let points = task.task_points[s..=f].to_vec();
    let aat = task.task_type == "assigned_area";
    let rel = dir
        .strip_prefix(root)
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let competition = rel.split('/').next().unwrap().to_owned();
    let rules = rule_set(&competition, &task_info(dir));
    let (earth, g) = earth_model(&points);

    let mut files: HashMap<String, PathBuf> = HashMap::new();
    for e in fs::read_dir(dir).unwrap().flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if let Some((_, cn)) = name.strip_suffix(".igc.gz").and_then(|s| s.split_once('_')) {
            files.insert(cn.to_owned(), e.path());
        }
    }
    let Ok(mut reader) = csv::Reader::from_path(dir.join("results.csv")) else {
        return vec![];
    };
    let rows: Vec<ResultRow> = reader.deserialize().filter_map(Result::ok).collect();
    let flights: Vec<(&ResultRow, Vec<Fix>, i64, Option<i64>)> = rows
        .iter()
        .filter_map(|r| {
            let start = parse_hms(&r.start_time_local)?;
            let fixes = thin(read_fixes(files.get(&r.cn)?));
            (fixes.len() > 10).then(|| (r, fixes, start, parse_hms(&r.finish_time_local)))
        })
        .collect();
    let Some(offset) = utc_offset(&flights, &points[0]) else {
        eprintln!("{rel}: no UTC offset");
        return vec![];
    };
    flights
        .iter()
        .filter_map(|(row, fixes, start, finish)| {
            let mut report = analyse(
                &points,
                aat,
                &g,
                fixes,
                start - offset,
                finish.map(|f| f - offset),
            )?;
            report.day = rel.clone();
            report.cn = row.cn.clone();
            report.task_type = task.task_type.clone();
            report.status = task.result_status.clone();
            report.rule_set = rules.into();
            report.earth = earth.into();
            report.pub_distance_m = row.distance_km.parse::<f64>().unwrap_or(0.) * 1000.;
            report.remarks = row.remarks.clone();
            Some(report)
        })
        .collect()
}

fn parse_hms(s: &str) -> Option<i64> {
    let mut it = s.split(':').map(|p| p.parse::<i64>().ok());
    Some(it.next()?? * 3600 + it.next()?? * 60 + it.next()??)
}

/// Whole-hour offset that puts the most published starts near the start point.
fn utc_offset(
    flights: &[(&ResultRow, Vec<Fix>, i64, Option<i64>)],
    start: &TaskPoint,
) -> Option<i64> {
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
    let Ok(file) = fs::File::open(path) else {
        return vec![];
    };
    if GzDecoder::new(file).read_to_end(&mut bytes).is_err() {
        return vec![];
    }
    let text = String::from_utf8_lossy(&bytes);
    let mut fixes: Vec<Fix> = Vec::new();
    let mut day_offset = 0;
    let mut engine_cols: Vec<(usize, usize)> = Vec::new();
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix('I') {
            for i in 0..rest.get(..2).and_then(|n| n.parse().ok()).unwrap_or(0) {
                let Some(def) = rest.get(2 + i * 7..9 + i * 7) else {
                    break;
                };
                if matches!(&def[4..], "ENL" | "MOP") {
                    if let (Ok(s), Ok(e)) = (def[..2].parse(), def[2..4].parse()) {
                        engine_cols.push((s, e));
                    }
                }
            }
        }
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
            engine: engine_cols
                .iter()
                .filter_map(|&(s, e): &(usize, usize)| line.get(s - 1..e)?.parse::<u16>().ok())
                .max()
                .unwrap_or(0),
        });
    }
    fixes
}

/// `THIN=k` keeps a fix only if it is at least `k` seconds after the last kept
/// fix, which simulates a slower logger.
fn thin(fixes: Vec<Fix>) -> Vec<Fix> {
    let Ok(k) = env::var("THIN").map(|v| v.parse::<i64>().unwrap()) else {
        return fixes;
    };
    let mut out: Vec<Fix> = Vec::new();
    for f in fixes {
        if out.last().is_none_or(|l| f.t - l.t >= k) {
            out.push(f);
        }
    }
    out
}

fn median_interval(fixes: &[Fix]) -> i64 {
    let mut d: Vec<i64> = fixes.windows(2).map(|w| w[1].t - w[0].t).collect();
    d.sort();
    d[d.len() / 2]
}

/// Index of the first fix after landing or engine start, searched from `from`.
fn flight_end(fixes: &[Fix], g: &Geodesic, from: usize) -> usize {
    let mut slow_since = None;
    let mut engine_since = None;
    for i in from.max(1)..fixes.len() {
        let (a, b) = (&fixes[i - 1], &fixes[i]);
        let dt = (b.t - a.t).max(1) as f64;
        let s: f64 = g.inverse(a.lat, a.lon, b.lat, b.lon);
        if s / dt < 5. {
            let since = *slow_since.get_or_insert(i);
            if b.t - fixes[since].t >= 30 {
                return since;
            }
        } else {
            slow_since = None;
        }
        if b.engine >= 500 {
            let since = *engine_since.get_or_insert(i);
            if b.t - fixes[since].t >= 30 {
                return since + 1;
            }
        } else {
            engine_since = None;
        }
    }
    fixes.len()
}

fn angle_diff(a: f64, b: f64) -> f64 {
    let d = (a - b).rem_euclid(std::f64::consts::TAU);
    d.min(std::f64::consts::TAU - d)
}

/// Signed depth in metres of the point at distance `s` and azimuth `az_deg`
/// from the centre of a two-arc zone, negative outside. `oz_angle12` is the
/// inner bisector, so the zone points the opposite way. The angular part is
/// the distance to the nearer radial edge, which is exact inside and close
/// enough outside for near misses.
fn depth(tp: &TaskPoint, s: f64, az_deg: f64) -> f64 {
    let d = angle_diff(az_deg.to_radians(), tp.oz_angle12 + PI);
    let arc = |r: f64, half: f64| {
        let radial = r - s;
        if half >= PI - 1e-9 {
            return radial;
        }
        let m = half - d;
        let angular = if m >= PI / 2. {
            s
        } else if m <= -PI / 2. {
            -s
        } else {
            s * m.sin()
        };
        radial.min(angular)
    };
    let first = arc(tp.oz_radius1, tp.oz_angle1);
    if tp.has_second_arc() {
        first.max(arc(tp.oz_radius2, tp.oz_angle2))
    } else {
        first
    }
}

fn shape(tp: &TaskPoint, aat: bool) -> &'static str {
    let full = |a: f64| a >= PI - 1e-6;
    let cylinder = full(tp.oz_angle1) && (!tp.has_second_arc() || tp.oz_radius2 <= tp.oz_radius1);
    match (aat, cylinder) {
        (true, true) => "aat cylinder",
        (true, false) => "aat sector",
        (false, true) => "cylinder",
        (false, false) if !tp.has_second_arc() => "sector",
        (false, false)
            if (tp.oz_angle1 - PI / 4.).abs() < 1e-3
                && tp.oz_radius2 == 500.
                && full(tp.oz_angle2) =>
        {
            "keyhole"
        }
        _ => "other two-arc",
    }
}

/// Polar coordinates of `p` from the zone centre, in metres and degrees.
fn polar(g: &Geodesic, tp: &TaskPoint, p: (f64, f64)) -> (f64, f64) {
    let (s, az, _, _): (f64, f64, f64, f64) = g.inverse(tp.lat(), tp.lon(), p.0, p.1);
    (s, az)
}

/// Depth of every fix in a zone. Fixes far from the zone get a flat-map
/// estimate, which stays well beyond any near miss.
fn fix_depths(g: &Geodesic, tp: &TaskPoint, fixes: &[Fix]) -> Vec<f64> {
    let kx = (tp.lat().to_radians().cos() * 111_320.).max(1.);
    fixes
        .iter()
        .map(|f| {
            let flat = ((f.lon - tp.lon()) * kx).hypot((f.lat - tp.lat()) * 110_574.);
            if flat > tp.max_radius() * 1.02 + 3000. {
                tp.max_radius() - flat
            } else {
                let (s, az) = polar(g, tp, (f.lat, f.lon));
                depth(tp, s, az)
            }
        })
        .collect()
}

/// Points along the segment between two fixes, every `SAMPLE_M` metres.
fn samples(g: &Geodesic, tp: &TaskPoint, a: &Fix, b: &Fix, how: Segment) -> Vec<(f64, f64)> {
    let (len, azi, _, _): (f64, f64, f64, f64) = g.inverse(a.lat, a.lon, b.lat, b.lon);
    let n = (len / SAMPLE_M).ceil().max(1.) as usize;
    let ts = (0..=n).map(move |i| i as f64 / n as f64);
    match how {
        Segment::Geodesic => ts.map(|t| g.direct(a.lat, a.lon, azi, t * len)).collect(),
        Segment::LatLon => ts
            .map(|t| (a.lat + t * (b.lat - a.lat), a.lon + t * (b.lon - a.lon)))
            .collect(),
        Segment::Azimuthal => {
            let xy = |f: &Fix| {
                let (s, az) = polar(g, tp, (f.lat, f.lon));
                (s * az.to_radians().sin(), s * az.to_radians().cos())
            };
            let (pa, pb) = (xy(a), xy(b));
            ts.map(|t| {
                let (x, y) = (pa.0 + t * (pb.0 - pa.0), pa.1 + t * (pb.1 - pa.1));
                g.direct(tp.lat(), tp.lon(), x.atan2(y).to_degrees(), x.hypot(y))
            })
            .collect()
        }
    }
}

/// Deepest sample of the segment ending at fix `j`, and the samples inside.
fn segment_depth(
    g: &Geodesic,
    tp: &TaskPoint,
    fixes: &[Fix],
    j: usize,
    how: Segment,
) -> (f64, Vec<(f64, f64)>) {
    let pts = samples(g, tp, &fixes[j - 1], &fixes[j], how);
    let depths: Vec<f64> = pts
        .iter()
        .map(|&p| {
            let (s, az) = polar(g, tp, p);
            depth(tp, s, az)
        })
        .collect();
    let max = depths.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let inside = pts
        .into_iter()
        .zip(depths)
        .filter(|(_, d)| *d >= 0.)
        .map(|(p, _)| p)
        .collect();
    (max, inside)
}

/// Whether the segment ending at fix `j` can come within 500 m of the zone.
fn segment_candidate(g: &Geodesic, fixes: &[Fix], depths: &[f64], j: usize) -> bool {
    let (a, b) = (&fixes[j - 1], &fixes[j]);
    let reach = depths[j - 1].max(depths[j]);
    if reach < -50_000. {
        return false;
    }
    let len: f64 = g.inverse(a.lat, a.lon, b.lat, b.lon);
    reach + len / 2. > -500.
}

fn analyse(
    points: &[TaskPoint],
    aat: bool,
    g: &Geodesic,
    fixes: &[Fix],
    start: i64,
    finish: Option<i64>,
) -> Option<FlightReport> {
    let from = fixes.partition_point(|f| f.t < start);
    if from + 2 >= fixes.len() {
        return None;
    }
    // Inclusive index of the last fix of the task window.
    let end = match finish {
        Some(t) => fixes.partition_point(|f| f.t < t).min(fixes.len() - 1),
        None => flight_end(fixes, g, from).clamp(from + 1, fixes.len()) - 1,
    };
    let last = points.len() - 1;
    let inter = 1..last;
    let depths: Vec<Vec<f64>> = points.iter().map(|tp| fix_depths(g, tp, fixes)).collect();
    let reached_by_segment = |k: usize, j: usize| {
        j > from
            && depths[k][j - 1] < 0.
            && depths[k][j] < 0.
            && segment_candidate(g, fixes, &depths[k], j)
            && { segment_depth(g, &points[k], fixes, j, Segment::Geodesic).0 >= 0. }
    };

    // In-order achievement with segments, and with fixes only.
    let walk = |segments: bool| {
        let mut ach: Vec<usize> = Vec::new();
        let mut p = from;
        for k in inter.clone() {
            let Some(j) =
                (p..=end).find(|&j| depths[k][j] >= 0. || (segments && reached_by_segment(k, j)))
            else {
                break;
            };
            ach.push(j);
            p = j;
        }
        ach
    };
    let ach_line = walk(true);
    let ach_fix = walk(false);

    let mut zones = Vec::new();
    for k in inter.clone().take(ach_line.len() + 1) {
        let w = if k == 1 { from } else { ach_line[k - 2] };
        let tp = &points[k];
        let best_fix = (w..=end)
            .map(|j| depths[k][j])
            .fold(f64::NEG_INFINITY, f64::max);
        let cands: Vec<usize> = (w + 1..=end)
            .filter(|&j| segment_candidate(g, fixes, &depths[k], j))
            .collect();
        let line_segments = cands
            .iter()
            .filter(|&&j| depths[k][j - 1] < 0. && depths[k][j] < 0.)
            .filter(|&&j| segment_depth(g, tp, fixes, j, Segment::Geodesic).0 >= 0.)
            .count();
        if best_fix >= 0. {
            zones.push(ZoneReport {
                index: k,
                shape: shape(tp, aat).into(),
                reached: "fix".into(),
                depth_geodesic_m: f64::NAN,
                depth_azimuthal_m: f64::NAN,
                depth_latlon_m: f64::NAN,
                best_fix_depth_m: best_fix,
                line_segments,
                segment_m: 0.,
                segment_s: 0,
            });
            continue;
        }
        let deepest = |how: Segment| {
            cands
                .iter()
                .map(|&j| (segment_depth(g, tp, fixes, j, how).0, j))
                .max_by(|a, b| a.0.total_cmp(&b.0))
        };
        let geo = deepest(Segment::Geodesic);
        let (seg_m, seg_s) = geo.map_or((0., 0), |(_, j)| {
            let s: f64 = g.inverse(
                fixes[j - 1].lat,
                fixes[j - 1].lon,
                fixes[j].lat,
                fixes[j].lon,
            );
            (s, fixes[j].t - fixes[j - 1].t)
        });
        let geo_depth = geo.map_or(f64::NEG_INFINITY, |d| d.0);
        zones.push(ZoneReport {
            index: k,
            shape: shape(tp, aat).into(),
            reached: if geo_depth >= 0. { "line" } else { "missed" }.into(),
            depth_geodesic_m: geo_depth,
            depth_azimuthal_m: deepest(Segment::Azimuthal).map_or(f64::NEG_INFINITY, |d| d.0),
            depth_latlon_m: deepest(Segment::LatLon).map_or(f64::NEG_INFINITY, |d| d.0),
            best_fix_depth_m: best_fix,
            line_segments,
            segment_m: seg_m,
            segment_s: seg_s,
        });
    }

    let dist = |a: (f64, f64), b: (f64, f64)| -> f64 { g.inverse(a.0, a.1, b.0, b.1) };
    let legs: Vec<f64> = points
        .windows(2)
        .map(|w| dist(w[0].pos(), w[1].pos()))
        .collect();
    let racing_distance = |ach: &[usize]| {
        let n = ach.len();
        if finish.is_some() {
            return None;
        }
        let done: f64 = legs[..n].iter().sum();
        let p = ach.last().copied().unwrap_or(from);
        let next = points[n + 1].pos();
        let best = (p..=end)
            .map(|j| legs[n] - dist((fixes[j].lat, fixes[j].lon), next))
            .fold(0., f64::max);
        Some(done + best)
    };

    let line_only: Vec<usize> = zones
        .iter()
        .filter(|z| z.reached == "line")
        .map(|z| z.index)
        .collect();
    let aat_variants = (aat && finish.is_some() && ach_line.len() == inter.len())
        .then(|| aat_variants(points, g, fixes, from, end, &depths, &line_only));

    Some(FlightReport {
        day: String::new(),
        cn: String::new(),
        task_type: String::new(),
        status: String::new(),
        rule_set: String::new(),
        earth: String::new(),
        interval_s: median_interval(fixes),
        finisher: finish.is_some(),
        pub_distance_m: 0.,
        remarks: String::new(),
        zones,
        achieved_line: ach_line.len(),
        achieved_fix: ach_fix.len(),
        intermediate: inter.len(),
        racing_line_m: if aat {
            None
        } else {
            racing_distance(&ach_line)
        },
        racing_fix_m: if aat { None } else { racing_distance(&ach_fix) },
        aat: aat_variants,
    })
}

/// A credited point candidate with its position in the time order.
#[derive(Clone, Copy)]
struct Candidate {
    order: f64,
    pos: (f64, f64),
}

/// Maximum distance from the start point through one candidate per area, in
/// time order, to the finish point less the finish radius with `oz_reduce`.
fn optimum(points: &[TaskPoint], g: &Geodesic, cands: &[Vec<Candidate>]) -> f64 {
    let dist = |a: (f64, f64), b: (f64, f64)| -> f64 { g.inverse(a.0, a.1, b.0, b.1) };
    let mut layer: Vec<(Candidate, f64)> = vec![(
        Candidate {
            order: f64::NEG_INFINITY,
            pos: points[0].pos(),
        },
        0.,
    )];
    for cs in cands {
        layer = cs
            .iter()
            .filter_map(|c| {
                layer
                    .iter()
                    .filter(|(p, _)| p.order <= c.order)
                    .map(|(p, v)| v + dist(p.pos, c.pos))
                    .max_by(f64::total_cmp)
                    .map(|v| (*c, v))
            })
            .collect();
    }
    let finish = &points[points.len() - 1];
    let reduce = if finish.oz_reduce {
        finish.oz_radius1
    } else {
        0.
    };
    layer
        .iter()
        .map(|(c, v)| v + dist(c.pos, finish.pos()) - reduce)
        .fold(f64::NAN, f64::max)
}

fn aat_variants(
    points: &[TaskPoint],
    g: &Geodesic,
    fixes: &[Fix],
    from: usize,
    end: usize,
    depths: &[Vec<f64>],
    line_only: &[usize],
) -> AatVariants {
    let fix_cand = |j: usize| Candidate {
        order: j as f64,
        pos: (fixes[j].lat, fixes[j].lon),
    };
    let base: Vec<Vec<Candidate>> = (1..points.len() - 1)
        .map(|k| {
            let inside: Vec<usize> = (from..=end).filter(|&j| depths[k][j] >= 0.).collect();
            // One hull per visit keeps the time order between areas intact.
            inside
                .chunk_by(|a, b| b - a == 1)
                .flat_map(|visit| hull(fixes, visit))
                .map(fix_cand)
                .collect()
        })
        .collect();
    if line_only.is_empty() {
        return AatVariants {
            fixes_only_m: optimum(points, g, &base),
            ..Default::default()
        };
    }
    // Segments ending at fix j that reach a line-only area, with their samples.
    let reaching: HashMap<usize, Vec<(usize, Vec<(f64, f64)>, f64)>> = line_only
        .iter()
        .map(|&k| {
            let segs = (from + 1..=end)
                .filter(|&j| segment_candidate(g, fixes, &depths[k], j))
                .filter_map(|j| {
                    let (d, inside) = segment_depth(g, &points[k], fixes, j, Segment::Geodesic);
                    (d >= 0.).then_some((j, inside, d))
                })
                .collect();
            (k, segs)
        })
        .collect();
    let variant = |pick: &dyn Fn(usize, usize, &[(f64, f64)]) -> Vec<(f64, f64)>| {
        let mut cands = base.clone();
        for &k in line_only {
            cands[k - 1] = reaching[&k]
                .iter()
                .flat_map(|(j, inside, _)| {
                    pick(k, *j, inside).into_iter().map(|pos| Candidate {
                        order: *j as f64 - 0.5,
                        pos,
                    })
                })
                .collect();
        }
        optimum(points, g, &cands)
    };
    let deepest = |k: usize, _: usize, inside: &[(f64, f64)]| {
        let tp = &points[k];
        let depth_at = |p: &(f64, f64)| {
            let (s, az) = polar(g, tp, *p);
            depth(tp, s, az)
        };
        inside
            .iter()
            .copied()
            .max_by(|a, b| depth_at(a).total_cmp(&depth_at(b)))
            .into_iter()
            .collect()
    };
    AatVariants {
        deepest_point_m: variant(&deepest),
        entry_exit_m: variant(&|_, _, inside| vec![inside[0], inside[inside.len() - 1]]),
        inside_part_m: variant(&|_, _, inside| inside.to_vec()),
        whole_segment_m: variant(&|k, j, _| {
            samples(g, &points[k], &fixes[j - 1], &fixes[j], Segment::Geodesic)
        }),
        nearest_fix_m: variant(&|k, j, _| {
            let near = if depths[k][j - 1] >= depths[k][j] {
                j - 1
            } else {
                j
            };
            vec![(fixes[near].lat, fixes[near].lon)]
        }),
        both_fixes_m: variant(&|_, j, _| {
            vec![
                (fixes[j - 1].lat, fixes[j - 1].lon),
                (fixes[j].lat, fixes[j].lon),
            ]
        }),
        fixes_only_m: f64::NAN,
    }
}

/// Convex hull vertices in (lon, lat) of a set of fix indices, in index order.
fn hull(fixes: &[Fix], set: &[usize]) -> Vec<usize> {
    if set.len() <= 3 {
        return set.to_vec();
    }
    let mut pts = set.to_vec();
    pts.sort_by(|&a, &b| {
        (fixes[a].lon, fixes[a].lat)
            .partial_cmp(&(fixes[b].lon, fixes[b].lat))
            .unwrap()
    });
    let cross = |o: usize, a: usize, b: usize| {
        (fixes[a].lon - fixes[o].lon) * (fixes[b].lat - fixes[o].lat)
            - (fixes[a].lat - fixes[o].lat) * (fixes[b].lon - fixes[o].lon)
    };
    let half = |it: &mut dyn Iterator<Item = usize>| {
        let mut h: Vec<usize> = Vec::new();
        for p in it {
            while h.len() >= 2 && cross(h[h.len() - 2], h[h.len() - 1], p) <= 0. {
                h.pop();
            }
            h.push(p);
        }
        h.pop();
        h
    };
    let mut out = half(&mut pts.iter().copied());
    out.extend(half(&mut pts.iter().rev().copied()));
    out.sort();
    out
}
