//! PROTOTYPE, throwaway. Answers "How does Keyhole select the best start among
//! candidate line starts, and does it reproduce SeeYou on the fixtures?"
//!
//! Usage: cargo run --release -- <day dir>... > flights.jsonl
//!
//! A day dir holds `task.json`, `rows.json` (written by `fetch.py`) and one
//! `<CN>.igc.gz` per published flight. For every flight this prints one JSON
//! line with every start line crossing, what the task would give from each
//! crossing, and which crossing matches the published start time.

use std::{env, fs, io::Read, path::Path};

use flate2::read::GzDecoder;
use geographiclib_rs::{Geodesic, InverseGeodesic};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Deserialize)]
struct TaskJson {
    task_type: String,
    result_status: String,
    task_duration: f64,
    no_start: String,
    task_points: Vec<TaskPoint>,
}

#[derive(Deserialize, Clone)]
struct TaskPoint {
    #[serde(rename = "type")]
    kind: String,
    latitude: f64,
    longitude: f64,
    oz_radius1: f64,
    oz_radius2: f64,
    oz_angle1: f64,
    oz_angle2: f64,
    oz_angle12: f64,
    #[serde(default)]
    oz_line: bool,
    oz_reduce: bool,
    #[serde(default)]
    oz_max_altitude: f64,
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

struct Fix {
    t: i64,
    lat: f64,
    lon: f64,
    gps_alt: i32,
    baro_alt: i32,
    engine: u16,
}

#[derive(Serialize, Clone)]
struct Outcome {
    /// Finish time (rounded up), if the task was completed from this start.
    finish: Option<i64>,
    /// Elapsed time used for speed, `max(T, Tmin)` on AATs.
    scored_time: Option<i64>,
    /// Racing tasks only: marking distance in metres.
    distance_m: Option<f64>,
    /// Turnpoints or areas reached after this start.
    reached: usize,
    /// Time each turnpoint or area was first reached after this start.
    reached_at: Vec<i64>,
}

#[derive(Serialize)]
struct Crossing {
    /// Interpolated crossing, rounded down.
    t: i64,
    t_exact: f64,
    gps_alt: f64,
    baro_alt: f64,
    /// Straight-line ground speed between the fixes nearest 8 s either side.
    gs_kmh: f64,
    /// Distance from the line centre along the line, metres.
    y: f64,
    /// Crossed beyond the line end but within the 500 m tolerance.
    tolerance: bool,
    /// Engine run (≥ 30 s) between the previous crossing (or take-off) and this one.
    engine_before: bool,
    /// An engine run (≥ 30 s) is in progress at the crossing.
    engine_running: bool,
    /// How the flight ends when started from this crossing.
    end_reason: String,
    end_t: i64,
    outcome: Option<Outcome>,
}

#[derive(Serialize)]
struct FlightReport {
    day: String,
    task_type: String,
    status: String,
    cn: String,
    rank: String,
    pub_start: Option<i64>,
    pub_finish: Option<i64>,
    pub_distance_m: Option<f64>,
    pub_time: Option<i64>,
    pub_points: Option<f64>,
    remark: Vec<String>,
    gate_open: Option<i64>,
    max_start_alt: f64,
    interval_s: f64,
    end_reason: String,
    crossings: Vec<Crossing>,
    /// Index into `crossings` whose `t` equals the published start, else the nearest within 2 s.
    matched: Option<usize>,
    matched_dt: Option<i64>,
}

fn utc_offset() -> i64 {
    env::var("UTC_OFFSET").map_or(7200, |v| v.parse().unwrap())
}

fn main() {
    for dir in env::args().skip(1) {
        let dir = Path::new(&dir);
        let Ok(task) = fs::read_to_string(dir.join("task.json")) else {
            continue;
        };
        let task: TaskJson = serde_json::from_str(&task).unwrap();
        if !matches!(
            task.result_status.as_str(),
            "official" | "unofficial" | "preliminary"
        ) || !matches!(task.task_type.as_str(), "polygon" | "assigned_area")
        {
            continue;
        }
        let points: Vec<TaskPoint> = task
            .task_points
            .iter()
            .filter(|p| !p.multiple_start)
            .cloned()
            .collect();
        if points[0].kind != "start" || !points[0].oz_line {
            eprintln!("{}: no start line, skipped", dir.display());
            continue;
        }
        let rows: Value =
            serde_json::from_str(&fs::read_to_string(dir.join("rows.json")).unwrap()).unwrap();
        let day = dir
            .components()
            .rev()
            .take(3)
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("/");
        let gate_open = task
            .no_start
            .split('T')
            .nth(1)
            .and_then(parse_hms)
            .filter(|&t| t != 0)
            .map(|t| t - utc_offset());

        for row in rows["rows"].as_array().unwrap() {
            let Some(cn) = row["_cn"].as_str() else {
                continue;
            };
            let file = dir.join(format!(
                "{}.igc.gz",
                cn.chars()
                    .map(|c| if c.is_ascii_alphanumeric() || "^_-".contains(c) {
                        c
                    } else {
                        '_'
                    })
                    .collect::<String>()
            ));
            if !file.exists() {
                continue;
            }
            let fixes = read_fixes(&file);
            if fixes.len() < 10 {
                continue;
            }
            let cell = |name: &str| row[name]["value"].as_str().map(str::to_owned);
            let pub_start = cell("Start").and_then(|v| parse_compact(&v));
            let pub_finish = cell("Finish").and_then(|v| parse_compact(&v));
            let pub_time = cell("Time").and_then(|v| v.parse().ok());
            let report = analyse(
                &task,
                &points,
                &fixes,
                gate_open,
                FlightReport {
                    day: day.clone(),
                    task_type: task.task_type.clone(),
                    status: task.result_status.clone(),
                    cn: cn.into(),
                    rank: row["#"]["text"].as_str().unwrap_or("").into(),
                    pub_start,
                    pub_finish: pub_finish.filter(|_| pub_time.is_some()),
                    pub_distance_m: cell("Distance").and_then(|v| v.parse().ok()),
                    pub_time,
                    pub_points: row["Points"]["text"]
                        .as_str()
                        .and_then(|v| v.split_whitespace().next()?.parse().ok()),
                    remark: row["_remark"]
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .filter_map(|v| v.as_str().map(str::to_owned))
                                .collect()
                        })
                        .unwrap_or_default(),
                    gate_open,
                    max_start_alt: points[0].oz_max_altitude,
                    interval_s: median_interval(&fixes),
                    end_reason: String::new(),
                    crossings: vec![],
                    matched: None,
                    matched_dt: None,
                },
            );
            println!("{}", serde_json::to_string(&report).unwrap());
        }
    }
}

fn parse_hms(s: &str) -> Option<i64> {
    let mut it = s.split(':').filter_map(|p| p.parse::<i64>().ok());
    Some(it.next()? * 3600 + it.next()? * 60 + it.next()?)
}

/// `YYYYMMDDhhmmss` in local time, of which only the time of day is usable.
fn parse_compact(v: &str) -> Option<i64> {
    let hms = v.get(8..14)?;
    let t = hms[0..2].parse::<i64>().ok()? * 3600
        + hms[2..4].parse::<i64>().ok()? * 60
        + hms[4..6].parse::<i64>().ok()?;
    Some(t - utc_offset())
}

fn median_interval(fixes: &[Fix]) -> f64 {
    let mut d: Vec<i64> = fixes.windows(2).map(|w| w[1].t - w[0].t).collect();
    d.sort();
    d[d.len() / 2] as f64
}

fn engine_threshold() -> u16 {
    env::var("ENGINE_THRESHOLD").map_or(500, |v| v.parse().unwrap())
}

fn read_fixes(path: &Path) -> Vec<Fix> {
    let mut bytes = Vec::new();
    GzDecoder::new(fs::File::open(path).unwrap())
        .read_to_end(&mut bytes)
        .unwrap();
    let text = String::from_utf8_lossy(&bytes);

    let mut engine_cols: Vec<(usize, usize)> = Vec::new();
    let mut fixes: Vec<Fix> = Vec::new();
    let mut day_offset = 0;
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
        let engine = engine_cols
            .iter()
            .filter_map(|&(s, e)| line.get(s - 1..e)?.parse::<u16>().ok())
            .max()
            .unwrap_or(0);
        fixes.push(Fix {
            t,
            lat: b.pos.lat.into(),
            lon: b.pos.lon.into(),
            gps_alt: b.gps_alt as i32,
            baro_alt: b.pressure_alt as i32,
            engine,
        });
    }
    fixes
}

/// Flat map centred on the start point, scaled by the WGS84 radii of curvature
/// at its latitude (ticket #17). `EARTH=sphere` uses the 6371 km FAI sphere.
struct StartLine {
    lat0: f64,
    lon0: f64,
    ky: f64,
    kx: f64,
    course: f64,
    half: f64,
}

impl StartLine {
    fn new(start: &TaskPoint, first: &TaskPoint, g: &Geodesic) -> Self {
        let (a, f) = (6_378_137.0_f64, 1. / 298.257_223_563);
        let e2 = f * (2. - f);
        let phi = start.latitude;
        let w = 1. - e2 * phi.sin().powi(2);
        let (n, m) = if env::var("EARTH").is_ok_and(|e| e == "sphere") {
            (6_371_000., 6_371_000.)
        } else {
            (a / w.sqrt(), a * (1. - e2) / w.powf(1.5))
        };
        let (_, az, _, _): (f64, f64, f64, f64) =
            g.inverse(start.lat(), start.lon(), first.lat(), first.lon());
        StartLine {
            lat0: start.lat(),
            lon0: start.lon(),
            ky: m.to_radians() * 1.,
            kx: (n * phi.cos()).to_radians(),
            course: az.to_radians(),
            half: start.oz_radius1,
        }
    }
    /// (along course, across course) in metres.
    fn project(&self, f: &Fix) -> (f64, f64) {
        let e = (f.lon - self.lon0) * self.kx;
        let n = (f.lat - self.lat0) * self.ky;
        let (s, c) = self.course.sin_cos();
        (e * s + n * c, e * c - n * s)
    }
}

fn angle_diff(a: f64, b: f64) -> f64 {
    let d = (a - b).rem_euclid(std::f64::consts::TAU);
    d.min(std::f64::consts::TAU - d)
}

/// Turnpoint or area zone test. `oz_angle12` is the inner bisector (ticket #11),
/// so the sector points the opposite way.
fn in_zone(tp: &TaskPoint, s: f64, az_deg: f64) -> bool {
    let dir = tp.oz_angle12 + std::f64::consts::PI;
    let d = angle_diff(az_deg.to_radians(), dir);
    let inner_excluded = tp.oz_angle2 == 0. && tp.oz_radius2 > 0.;
    let outer = s <= tp.oz_radius1 && d <= tp.oz_angle1 + 1e-9 && !(inner_excluded && s < tp.oz_radius2);
    let keyhole = tp.oz_angle2 > 0. && s <= tp.oz_radius2 && d <= tp.oz_angle2 + 1e-9;
    outer || keyhole
}

fn interp(a: f64, b: f64, frac: f64) -> f64 {
    a + frac * (b - a)
}

fn analyse(
    task: &TaskJson,
    points: &[TaskPoint],
    fixes: &[Fix],
    gate_open: Option<i64>,
    mut report: FlightReport,
) -> FlightReport {
    let g = Geodesic::wgs84();
    let polar: Vec<Vec<(f64, f64)>> = fixes
        .iter()
        .map(|f| {
            points
                .iter()
                .map(|p| {
                    let (s, az, _, _): (f64, f64, f64, f64) =
                        g.inverse(p.lat(), p.lon(), f.lat, f.lon);
                    (s, az)
                })
                .collect()
        })
        .collect();
    let legs: Vec<f64> = points
        .windows(2)
        .map(|w| InverseGeodesic::<f64>::inverse(&g, w[0].lat(), w[0].lon(), w[1].lat(), w[1].lon()))
        .collect();
    let last = points.len() - 1;
    let finish_r = points[last].oz_radius1;
    let reduce = if points[last].oz_reduce { finish_r } else { 0. };
    let racing = task.task_type == "polygon";

    let line = StartLine::new(&points[0], &points[1], &g);
    let engine_runs = engine_runs(fixes);
    let mut raw: Vec<(usize, f64, f64, bool)> = vec![];
    for i in 1..fixes.len() {
        let (x0, y0) = line.project(&fixes[i - 1]);
        let (x1, y1) = line.project(&fixes[i]);
        if !(x0 < 0. && x1 >= 0.) {
            continue;
        }
        let frac = -x0 / (x1 - x0);
        let y = interp(y0, y1, frac);
        if y.abs() > line.half + 500. {
            continue;
        }
        raw.push((i, frac, y, y.abs() > line.half));
    }
    let raw: Vec<_> = raw
        .into_iter()
        .filter(|&(i, frac, _, _)| {
            gate_open.is_none_or(|g| interp(fixes[i - 1].t as f64, fixes[i].t as f64, frac) >= g as f64)
        })
        .collect();

    report.end_reason = match raw.first() {
        Some(&(i, ..)) => flight_end(fixes, &g, i).1,
        None => "no start".into(),
    };

    let mut prev_i = 0;
    for &(i, frac, y, tolerance) in &raw {
        let t_exact = interp(fixes[i - 1].t as f64, fixes[i].t as f64, frac);
        let t = t_exact.floor() as i64;
        let engine_before = engine_runs
            .iter()
            .any(|&(a, _)| a >= prev_i && a < i);
        prev_i = i;
        let engine_running = engine_runs.iter().any(|&(a, b)| a <= i && i <= b);
        let (end, end_reason) = flight_end(fixes, &g, i);
        let near = |dt: i64| {
            (0..fixes.len())
                .min_by_key(|&k| (fixes[k].t - (t + dt)).abs())
                .unwrap()
        };
        let (a, b) = (near(-8), near(8));
        let gs_kmh = {
            let s: f64 = g.inverse(fixes[a].lat, fixes[a].lon, fixes[b].lat, fixes[b].lon);
            s / ((fixes[b].t - fixes[a].t).max(1) as f64) * 3.6
        };
        let outcome = (!engine_running).then(|| {
            let mut next = 1;
            let mut done_m = 0.;
            let mut best_m: f64 = 0.;
            let mut reached_at = vec![];
            for j in i..end {
                if next == last {
                    let d = polar[j][last].0;
                    if d <= finish_r {
                        let d0 = polar[j - 1][last].0;
                        let fr = ((d0 - finish_r) / (d0 - d)).clamp(0., 1.);
                        let ft = interp(fixes[j - 1].t as f64, fixes[j].t as f64, fr).ceil() as i64;
                        let elapsed = ft - t;
                        return Outcome {
                            finish: Some(ft),
                            scored_time: Some(elapsed.max(task.task_duration as i64)),
                            distance_m: racing.then(|| legs.iter().sum::<f64>() - reduce),
                            reached: next,
                            reached_at,
                        };
                    }
                } else {
                    let (s, az) = polar[j][next];
                    if in_zone(&points[next], s, az) {
                        reached_at.push(fixes[j].t);
                        done_m += legs[next - 1];
                        next += 1;
                        continue;
                    }
                }
                best_m = best_m.max(done_m + (legs[next - 1] - polar[j][next].0).max(0.));
            }
            Outcome {
                finish: None,
                scored_time: None,
                distance_m: racing.then_some(best_m),
                reached: next - 1,
                reached_at,
            }
        });
        report.crossings.push(Crossing {
            t,
            t_exact,
            gps_alt: interp(fixes[i - 1].gps_alt as f64, fixes[i].gps_alt as f64, frac),
            baro_alt: interp(fixes[i - 1].baro_alt as f64, fixes[i].baro_alt as f64, frac),
            gs_kmh,
            y,
            tolerance,
            engine_before,
            engine_running,
            end_reason,
            end_t: fixes[end.min(fixes.len() - 1)].t,
            outcome,
        });
    }
    if let Some(ps) = report.pub_start {
        let best = report
            .crossings
            .iter()
            .enumerate()
            .map(|(k, c)| (k, c.t - ps))
            .min_by_key(|&(_, dt)| dt.abs());
        if let Some((k, dt)) = best.filter(|&(_, dt)| dt.abs() <= 2) {
            report.matched = Some(k);
            report.matched_dt = Some(dt);
        }
    }
    report
}

/// Start indices of engine runs of at least 30 s above the threshold.
fn engine_runs(fixes: &[Fix]) -> Vec<(usize, usize)> {
    let mut runs = vec![];
    let mut since: Option<usize> = None;
    for (i, f) in fixes.iter().enumerate() {
        if f.engine >= engine_threshold() {
            let s = *since.get_or_insert(i);
            if f.t - fixes[s].t >= 30 {
                match runs.last_mut() {
                    Some((a, b)) if *a == s => *b = i,
                    _ => runs.push((s, i)),
                }
            }
        } else {
            since = None;
        }
    }
    runs
}

/// Index of the first fix after landing or engine start, searched from `from`.
fn flight_end(fixes: &[Fix], g: &Geodesic, from: usize) -> (usize, String) {
    let mut slow_since = None;
    let mut engine_since = None;
    for i in from.max(1)..fixes.len() {
        let (a, b) = (&fixes[i - 1], &fixes[i]);
        let dt = (b.t - a.t).max(1) as f64;
        let s: f64 = g.inverse(a.lat, a.lon, b.lat, b.lon);
        if s / dt < 5. {
            let since = *slow_since.get_or_insert(i);
            if b.t - fixes[since].t >= 30 {
                return (since, "landed".into());
            }
        } else {
            slow_since = None;
        }
        if b.engine >= engine_threshold() {
            let since = *engine_since.get_or_insert(i);
            if b.t - fixes[since].t >= 30 {
                return (since + 1, "engine".into());
            }
        } else {
            engine_since = None;
        }
    }
    (fixes.len(), "end of log".into())
}
