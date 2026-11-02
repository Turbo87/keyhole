//! PROTOTYPE, throwaway. Answers "How does Keyhole detect engine runs from ENL
//! and MOP data, and does it reproduce SeeYou on the fixtures?"
//!
//! Usage: cargo run --release -- <day dir>... > flights.jsonl
//!
//! A day dir is `<competition>/<class>/<date>` from the SoaringSpot download,
//! with `task.json`, `results.csv` and `<prefix>_<CN>.igc.gz`. Every IGC file
//! gives one JSON line: logger and SeeYou trailer headers, take-off, launch and
//! landing, per-phase ENL/MOP statistics, the first engine runs for a grid of
//! thresholds and minimum durations, and how the task progresses over time so
//! the published result can be compared against a flight end at any fix.

use std::{
    collections::{BTreeMap, HashMap},
    env, fs,
    io::Read,
    path::{Path, PathBuf},
};

use flate2::read::GzDecoder;
use geographiclib_rs::{Geodesic, InverseGeodesic};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

const CHANNELS: [&str; NCH] = ["ENL", "MOP", "RPM", "CUR"];
const NCH: usize = 4;
const GRID_T: [i32; 10] = [100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const GRID_D: [i64; 7] = [0, 5, 10, 20, 30, 60, 120];
const HOLD_D: [i64; 5] = [0, 10, 30, 60, 120];
/// Tolerance when matching a marking distance to the published distance.
const DIST_TOL_M: f64 = 30.;

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

#[derive(Deserialize, Clone, Default)]
struct ResultRow {
    rank: String,
    cn: String,
    glider: String,
    start_time_local: String,
    finish_time_local: String,
    distance_km: String,
    points: String,
    penalty_points: String,
    remarks: String,
}

struct Fix {
    t: i64,
    lat: f64,
    lon: f64,
    alt: f64,
    ch: [i32; NCH],
}

#[derive(Default, Serialize, Clone)]
struct Header {
    manufacturer: String,
    fr_type: String,
    firmware: String,
    glider_type: String,
    extensions: Vec<String>,
    pure_glider: Option<bool>,
    soaring_begin: Option<i64>,
    soaring_end: Option<i64>,
    tz_hours: Option<f64>,
    seeyou_cn: Option<String>,
    seeyou_glider: Option<String>,
}

struct Igc {
    header: Header,
    fixes: Vec<Fix>,
    raw_times: Vec<i64>,
    present: [bool; NCH],
}

#[derive(Serialize, Default, Clone)]
struct PhaseStats {
    n: usize,
    max: i32,
    p50: i32,
    p90: i32,
    p99: i32,
    /// Highest level held for D seconds, keyed by D.
    hold: BTreeMap<i64, i32>,
}

#[derive(Serialize, Clone)]
struct Run {
    /// First fix at or above the threshold.
    t0: i64,
    /// Fix at which the run has lasted the minimum duration.
    tq: i64,
    /// Last fix of the run at or above the threshold.
    t1: i64,
    phase: &'static str,
    alt0: f64,
    /// Altitude change from `t0` to 60 s after `tq`.
    dalt: f64,
    /// Mean turn rate (deg/s) and ground speed (m/s) from `t0` to `tq`.
    turn: f64,
    gs: f64,
    /// Best marking distance up to the fix before `t0`, at `t0`, and the
    /// position-based marking distance at `t0` (racing tasks only).
    d_prev: Option<f64>,
    d_best: Option<f64>,
    d_pos: Option<f64>,
}

#[derive(Serialize, Default)]
struct ChannelReport {
    phases: BTreeMap<&'static str, PhaseStats>,
    modes: BTreeMap<&'static str, PhaseStats>,
    /// Key `T/D`: number of runs in free flight, the first one, and the first
    /// one that ends at or after the start.
    runs: BTreeMap<String, (usize, Option<Run>, Option<Run>)>,
}

#[derive(Serialize, Default)]
struct TaskReport {
    start_t: i64,
    reached_t: Vec<i64>,
    finish_t: Option<i64>,
    /// Racing tasks: best marking distance at the landing.
    d_full: Option<f64>,
    /// First fix where the best marking distance reaches the published
    /// distance less the tolerance, and where it exceeds it plus the tolerance.
    e_lo: Option<i64>,
    e_hi: Option<i64>,
    /// First and last fix where the position-based distance is within the
    /// tolerance of the published distance.
    p_first: Option<i64>,
    p_last: Option<i64>,
    /// Fixes whose best marking distance is within 300 m of the published
    /// distance, with five fixes either side: time, best and position-based
    /// distance, channel values.
    near: Vec<(i64, f64, f64, [i32; NCH])>,
}

#[derive(Serialize, Default)]
struct Report {
    day: String,
    file: String,
    task_type: String,
    status: String,
    row: Option<ResultRowOut>,
    header: Header,
    raw_fixes: usize,
    interval: i64,
    flights: Vec<(i64, i64)>,
    takeoff: Option<i64>,
    landing: Option<i64>,
    launch_end: Option<i64>,
    launch_gain: f64,
    launch_max_vario: f64,
    soaring_begin_t: Option<i64>,
    soaring_end_t: Option<i64>,
    pub_start: Option<i64>,
    pub_finish: Option<i64>,
    pub_distance_m: Option<f64>,
    task: Option<TaskReport>,
    channels: BTreeMap<&'static str, ChannelReport>,
}

#[derive(Serialize, Default, Clone)]
struct ResultRowOut {
    rank: String,
    cn: String,
    glider: String,
    points: String,
    penalty: String,
    remarks: String,
}

fn main() {
    let dirs: Vec<PathBuf> = env::args().skip(1).map(PathBuf::from).collect();
    let out: Vec<String> = dirs.par_iter().flat_map(|d| day(d)).collect();
    for line in out {
        println!("{line}");
    }
}

fn day(dir: &Path) -> Vec<String> {
    let Ok(task) = fs::read_to_string(dir.join("task.json")) else {
        return vec![];
    };
    let Ok(task) = serde_json::from_str::<TaskJson>(&task) else {
        eprintln!("{}: task.json unreadable", dir.display());
        return vec![];
    };
    let mut rows: HashMap<String, ResultRow> = HashMap::new();
    if let Ok(mut r) = csv::Reader::from_path(dir.join("results.csv")) {
        for row in r.deserialize::<ResultRow>().flatten() {
            rows.insert(row.cn.clone(), row);
        }
    }
    let name = dir
        .components()
        .rev()
        .take(3)
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("/");
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .unwrap()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.to_string_lossy().ends_with(".igc.gz"))
        .collect();
    files.sort();
    let igcs: Vec<(PathBuf, Igc)> = files
        .into_par_iter()
        .filter_map(|p| read_igc(&p).map(|i| (p, i)))
        .collect();
    let mut tzs: Vec<i64> = igcs
        .iter()
        .filter_map(|(_, i)| i.header.tz_hours.map(|h| (h * 3600.) as i64))
        .collect();
    tzs.sort();
    let day_tz = tzs.get(tzs.len() / 2).copied();
    let points: Vec<TaskPoint> = task
        .task_points
        .iter()
        .filter(|p| !p.multiple_start && matches!(p.kind.as_str(), "start" | "point" | "finish"))
        .cloned()
        .collect();
    igcs.par_iter()
        .map(|(path, igc)| {
            let fname = path.file_name().unwrap().to_string_lossy().into_owned();
            let cn = fname
                .trim_end_matches(".igc.gz")
                .split_once('_')
                .map_or(String::new(), |(_, c)| c.to_owned());
            let row = rows.get(&cn).cloned();
            let tz = igc
                .header
                .tz_hours
                .map(|h| (h * 3600.) as i64)
                .or(day_tz);
            let r = analyse(&task, &points, igc, row, tz, name.clone(), fname);
            serde_json::to_string(&r).unwrap()
        })
        .collect()
}

fn parse_hms(s: &str) -> Option<i64> {
    let mut it = s.split(':').map(|p| p.parse::<i64>());
    let (h, m, s) = (it.next()?.ok()?, it.next()?.ok()?, it.next()?.ok()?);
    Some(h * 3600 + m * 60 + s)
}

fn read_igc(path: &Path) -> Option<Igc> {
    let mut bytes = Vec::new();
    GzDecoder::new(fs::File::open(path).ok()?)
        .read_to_end(&mut bytes)
        .ok()?;
    let text = String::from_utf8_lossy(&bytes);
    let mut h = Header::default();
    let mut cols: [Option<(usize, usize)>; NCH] = [None; NCH];
    let mut fixes: Vec<Fix> = vec![];
    let mut raw_times = vec![];
    let mut day_offset = 0;
    let mut last_t: Option<i64> = None;
    for line in text.lines() {
        let line = line.trim_end();
        if line.starts_with('B') {

            let Some(f) = parse_b(line, &cols) else {
                raw_times.push(last_t.unwrap_or(0));
                continue;
            };
            let mut t = f.0 + day_offset;
            if last_t.is_some_and(|l| t < l - 12 * 3600) {
                day_offset += 86400;
                t += 86400;
            }
            raw_times.push(t);
            if fixes.last().is_some_and(|l| t <= l.t) {
                continue;
            }
            last_t = Some(t);
            if f.1 == 0. && f.2 == 0. {
                continue;
            }
            fixes.push(Fix {
                t,
                lat: f.1,
                lon: f.2,
                alt: f.3,
                ch: f.4,
            });
        } else if let Some(rest) = line.strip_prefix('A') {
            h.manufacturer = rest.chars().take(3).collect();
        } else if let Some(rest) = line.strip_prefix('I') {
            let n: usize = rest.get(..2).and_then(|n| n.parse().ok()).unwrap_or(0);
            for i in 0..n {
                let Some(def) = rest.get(2 + i * 7..9 + i * 7) else {
                    break;
                };
                let code = &def[4..];
                h.extensions.push(code.to_owned());
                if let Some(k) = CHANNELS.iter().position(|c| *c == code)
                    && let (Ok(s), Ok(e)) = (def[..2].parse(), def[2..4].parse())
                {
                    cols[k] = Some((s, e));
                }
            }
        } else if line.starts_with("HFFTY") {
            h.fr_type = after_colon(line);
        } else if line.starts_with("HFRFW") {
            h.firmware = after_colon(line);
        } else if line.starts_with("HFGTY") {
            h.glider_type = after_colon(line);
        } else if let Some(v) = line.strip_prefix("LSEEYOU PureGlider=") {
            h.pure_glider = Some(v.eq_ignore_ascii_case("true"));
        } else if let Some(v) = line.strip_prefix("LSEEYOU SoaringBegin=") {
            h.soaring_begin = v.parse().ok();
        } else if let Some(v) = line.strip_prefix("LSEEYOU SoaringEnd=") {
            h.soaring_end = v.parse().ok();
        } else if let Some(v) = line.strip_prefix("LCU::HPTZNTIMEZONE:") {
            h.tz_hours = v.trim().parse().ok();
        } else if let Some(v) = line.strip_prefix("LCU::HPCIDCOMPETITIONID:") {
            h.seeyou_cn = Some(v.to_owned());
        } else if let Some(v) = line.strip_prefix("LCU::HPGTYGLIDERTYPE:") {
            h.seeyou_glider = Some(v.to_owned());
        }
    }
    let present = cols.map(|c| c.is_some());
    Some(Igc {
        header: h,
        fixes,
        raw_times,
        present,
    })
}

fn after_colon(line: &str) -> String {
    line.split_once(':')
        .map_or(&line[5..], |(_, v)| v)
        .trim()
        .to_owned()
}

type BFix = (i64, f64, f64, f64, [i32; NCH]);

fn parse_b(line: &str, cols: &[Option<(usize, usize)>; NCH]) -> Option<BFix> {
    let b = line.as_bytes();
    if b.len() < 35 {
        return None;
    }
    let num = |a: usize, z: usize| line.get(a..z)?.parse::<i64>().ok();
    let t = num(1, 3)? * 3600 + num(3, 5)? * 60 + num(5, 7)?;
    let mut lat = num(7, 9)? as f64 + num(9, 14)? as f64 / 60000.;
    if b[14] == b'S' {
        lat = -lat;
    }
    let mut lon = num(15, 18)? as f64 + num(18, 23)? as f64 / 60000.;
    if b[23] == b'W' {
        lon = -lon;
    }
    let baro = num(25, 30).unwrap_or(0) as f64;
    let gps = num(30, 35).unwrap_or(0) as f64;
    let alt = if baro != 0. { baro } else { gps };
    let mut ch = [0; NCH];
    for (k, c) in cols.iter().enumerate() {
        if let Some((s, e)) = c {
            ch[k] = line
                .get(s - 1..*e)
                .and_then(|v| v.trim().parse().ok())
                .unwrap_or(0);
        }
    }
    Some((t, lat, lon, alt, ch))
}

/// Flat-earth distance in metres, good enough for speeds and headings.
fn flat(a: &Fix, b: &Fix) -> (f64, f64) {
    let k = 111_195.;
    let dy = (b.lat - a.lat) * k;
    let dx = (b.lon - a.lon) * k * a.lat.to_radians().cos();
    (dx, dy)
}

/// Index of the latest fix at least `dt` seconds before fix `i`.
fn back(fixes: &[Fix], i: usize, dt: i64) -> usize {
    let mut k = i;
    while k > 0 && fixes[i].t - fixes[k].t < dt {
        k -= 1;
    }
    k
}

fn angle_diff(a: f64, b: f64) -> f64 {
    let d = (a - b).rem_euclid(std::f64::consts::TAU);
    d.min(std::f64::consts::TAU - d)
}

/// Turnpoint or area zone test. `oz_angle12` is the inner bisector, so the
/// sector points the opposite way.
fn in_zone(tp: &TaskPoint, s: f64, az_deg: f64) -> bool {
    let dir = tp.oz_angle12 + std::f64::consts::PI;
    let d = angle_diff(az_deg.to_radians(), dir);
    let inner_excluded = tp.oz_angle2 == 0. && tp.oz_radius2 > 0.;
    let outer = s <= tp.oz_radius1
        && d <= tp.oz_angle1 + 1e-9
        && !(inner_excluded && s < tp.oz_radius2);
    let keyhole = tp.oz_angle2 > 0. && s <= tp.oz_radius2 && d <= tp.oz_angle2 + 1e-9;
    outer || keyhole
}

fn percentile(sorted: &[i32], p: f64) -> i32 {
    if sorted.is_empty() {
        return 0;
    }
    sorted[((sorted.len() - 1) as f64 * p).round() as usize]
}

/// Highest value held at every fix of a window lasting at least `d` seconds.
fn hold(fixes: &[Fix], k: usize, range: std::ops::Range<usize>, d: i64) -> i32 {
    let mut best = 0;
    let mut j = range.start;
    let mut dq: std::collections::VecDeque<usize> = Default::default();
    for i in range.clone() {
        while dq.back().is_some_and(|&b| fixes[b].ch[k] >= fixes[i].ch[k]) {
            dq.pop_back();
        }
        dq.push_back(i);
        // Shrink to the shortest window ending at i that still lasts d.
        while j < i && fixes[i].t - fixes[j + 1].t >= d {
            j += 1;
        }
        while dq.front().is_some_and(|&f| f < j) {
            dq.pop_front();
        }
        if fixes[i].t - fixes[j].t >= d {
            best = best.max(fixes[*dq.front().unwrap()].ch[k]);
        }
    }
    best
}

fn stats(fixes: &[Fix], k: usize, idx: impl Iterator<Item = usize>) -> PhaseStats {
    let mut v: Vec<i32> = idx.map(|i| fixes[i].ch[k]).collect();
    v.sort();
    PhaseStats {
        n: v.len(),
        max: v.last().copied().unwrap_or(0),
        p50: percentile(&v, 0.5),
        p90: percentile(&v, 0.9),
        p99: percentile(&v, 0.99),
        hold: BTreeMap::new(),
    }
}

fn analyse(
    task: &TaskJson,
    points: &[TaskPoint],
    igc: &Igc,
    row: Option<ResultRow>,
    tz: Option<i64>,
    day: String,
    file: String,
) -> Report {
    let fixes = &igc.fixes;
    let mut r = Report {
        day,
        file,
        task_type: task.task_type.clone(),
        status: task.result_status.clone(),
        raw_fixes: igc.raw_times.len(),
        ..Default::default()
    };
    let raw_t = |n: Option<i64>| {
        n.filter(|&n| n >= 0)
            .and_then(|n| igc.raw_times.get(n as usize).copied())
    };
    r.soaring_begin_t = raw_t(igc.header.soaring_begin);
    r.soaring_end_t = raw_t(igc.header.soaring_end);
    if let Some(row) = &row {
        let local = |s: &str| Some(parse_hms(s)? - tz?);
        r.pub_start = local(&row.start_time_local);
        r.pub_finish = local(&row.finish_time_local);
        r.pub_distance_m = row
            .distance_km
            .parse::<f64>()
            .ok()
            .filter(|&d| d > 0.)
            .map(|d| d * 1000.);
        r.row = Some(ResultRowOut {
            rank: row.rank.clone(),
            cn: row.cn.clone(),
            glider: row.glider.clone(),
            points: row.points.clone(),
            penalty: row.penalty_points.clone(),
            remarks: row.remarks.clone(),
        });
    }
    if fixes.len() < 30 {
        r.header = igc.header.clone();
        return r;
    }
    let mut d: Vec<i64> = fixes.windows(2).map(|w| w[1].t - w[0].t).collect();
    d.sort();
    r.interval = d[d.len() / 2];

    // Smoothed ground speed (m/s), vario (m/s) and heading over short windows.
    let n = fixes.len();
    let mut gs = vec![0.; n];
    let mut vario = vec![0.; n];
    let mut turn = vec![0.; n];
    let mut heading = vec![0.; n];
    for i in 0..n {
        let k = back(fixes, i, 10);
        let dt = (fixes[i].t - fixes[k].t).max(1) as f64;
        let (dx, dy) = flat(&fixes[k], &fixes[i]);
        gs[i] = dx.hypot(dy) / dt;
        let k = back(fixes, i, 20);
        vario[i] = (fixes[i].alt - fixes[k].alt) / (fixes[i].t - fixes[k].t).max(1) as f64;
        let k = back(fixes, i, 5);
        let (dx, dy) = flat(&fixes[k], &fixes[i]);
        heading[i] = dx.atan2(dy);
        let dt = (fixes[i].t - fixes[k].t).max(1) as f64;
        turn[i] = angle_diff(heading[i], heading[k]).to_degrees() / dt;
    }

    // Flights: moving above 15 m/s for 10 s, stopped below 5 m/s for 60 s.
    let mut flights = vec![];
    let mut i = 0;
    while i < n {
        let mut since = None;
        let mut to = None;
        while i < n {
            if gs[i] > 15. {
                let s = *since.get_or_insert(i);
                if fixes[i].t - fixes[s].t >= 10 {
                    to = Some(s);
                    break;
                }
            } else {
                since = None;
            }
            i += 1;
        }
        let Some(to) = to else { break };
        let mut slow = None;
        let mut land = n - 1;
        while i < n {
            if gs[i] < 5. {
                let s = *slow.get_or_insert(i);
                if fixes[i].t - fixes[s].t >= 60 {
                    land = s;
                    break;
                }
            } else {
                slow = None;
            }
            i += 1;
        }
        if fixes[land].t - fixes[to].t > 120 {
            flights.push((to, land));
        }
        i = land + 1;
    }
    r.flights = flights
        .iter()
        .map(|&(a, b)| (fixes[a].t, fixes[b].t))
        .collect();
    let in_flight = |t: i64, &(a, b): &(usize, usize)| fixes[a].t <= t && t <= fixes[b].t;
    let chosen = r
        .pub_start
        .and_then(|ps| flights.iter().find(|f| in_flight(ps, f)))
        .or_else(|| {
            flights
                .iter()
                .max_by_key(|&&(a, b)| fixes[b].t - fixes[a].t)
        })
        .copied();
    let Some((to, land)) = chosen else {
        r.header = igc.header.clone();
        return r;
    };
    r.takeoff = Some(fixes[to].t);
    r.landing = Some(fixes[land].t);

    // Launch: until the 20 s climb stops or the glider turns, at most 20 min.
    let mut le = to;
    while le < land && fixes[le].t - fixes[to].t < 1200 {
        if fixes[le].t - fixes[to].t >= 20 && (vario[le] < 0. || turn[le] > 8.) {
            break;
        }
        le += 1;
    }
    r.launch_end = Some(fixes[le].t);
    r.launch_gain = fixes[le].alt - fixes[to].alt;
    r.launch_max_vario = (to..=le)
        .map(|i| {
            let k = back(fixes, i, 10);
            (fixes[i].alt - fixes[k].alt) / (fixes[i].t - fixes[k].t).max(1) as f64
        })
        .fold(0., f64::max);

    // Task flown forward from the published start.
    let start_idx = r
        .pub_start
        .filter(|&ps| fixes[to].t <= ps && ps <= fixes[land].t)
        .and_then(|ps| (to..=land).find(|&i| fixes[i].t >= ps));
    let mut task_end = land;
    let mut dist: Vec<Option<(f64, f64)>> = vec![None; n];
    if let Some(si) = start_idx
        && points.len() >= 2
        && points[0].kind == "start"
    {
        let g = Geodesic::wgs84();
        let racing = task.task_type == "polygon";
        let last = points.len() - 1;
        let legs: Vec<f64> = points
            .windows(2)
            .map(|w| {
                InverseGeodesic::<f64>::inverse(&g, w[0].lat(), w[0].lon(), w[1].lat(), w[1].lon())
            })
            .collect();
        let mut tr = TaskReport {
            start_t: fixes[si].t,
            ..Default::default()
        };
        let mut next = 1;
        let mut done = 0.;
        let mut best: f64 = 0.;
        for j in si..=land {
            let p = &points[next];
            let polar = |p: &TaskPoint| -> (f64, f64) {
                let (s, az, _, _): (f64, f64, f64, f64) =
                    g.inverse(p.lat(), p.lon(), fixes[j].lat, fixes[j].lon);
                (s, az)
            };
            let (mut s, az) = polar(p);
            if next == last {
                if s <= p.oz_radius1 {
                    tr.finish_t = Some(fixes[j].t);
                    task_end = j;
                    if racing {
                        let reduce = if p.oz_reduce { p.oz_radius1 } else { 0. };
                        best = legs.iter().sum::<f64>() - reduce;
                        dist[j] = Some((best, best));
                    }
                    break;
                }
            } else if in_zone(p, s, az) {
                tr.reached_t.push(fixes[j].t);
                done += legs[next - 1];
                next += 1;
                s = polar(&points[next]).0;
            }
            if racing {
                let pos = done + (legs[next - 1] - s).max(0.);
                best = best.max(pos);
                dist[j] = Some((best, pos));
            }
        }
        if racing {
            tr.d_full = Some(best);
            if let Some(pd) = r.pub_distance_m {
                for j in si..=task_end {
                    let Some((b, p)) = dist[j] else { continue };
                    if tr.e_lo.is_none() && b >= pd - DIST_TOL_M {
                        tr.e_lo = Some(fixes[j].t);
                    }
                    if tr.e_hi.is_none() && b > pd + DIST_TOL_M {
                        tr.e_hi = Some(fixes[j].t);
                    }
                    if (p - pd).abs() <= DIST_TOL_M {
                        tr.p_first.get_or_insert(fixes[j].t);
                        tr.p_last = Some(fixes[j].t);
                    }
                }
                let near: Vec<usize> = (si..=task_end)
                    .filter(|&j| dist[j].is_some_and(|(b, _)| (b - pd).abs() <= 300.))
                    .collect();
                if let (Some(&a), Some(&b)) = (near.first(), near.last()) {
                    for j in a.saturating_sub(5).max(si)..=(b + 5).min(task_end) {
                        if let Some((b, p)) = dist[j] {
                            tr.near.push((fixes[j].t, b, p, fixes[j].ch));
                        }
                    }
                }
            }
        }
        r.task = Some(tr);
    }

    let phase_of = |i: usize| -> &'static str {
        if i < to {
            "ground_before"
        } else if i < le {
            "launch"
        } else if i > land {
            "ground_after"
        } else if start_idx.is_some_and(|s| i < s) {
            "pre_start"
        } else if start_idx.is_some() && i <= task_end {
            "task"
        } else if start_idx.is_some() {
            "post_task"
        } else {
            "free_no_start"
        }
    };
    let phases: [(&'static str, std::ops::Range<usize>); 5] = [
        ("ground_before", 0..to),
        ("launch", to..le),
        ("pre_start", le..start_idx.unwrap_or(le)),
        ("task", start_idx.map_or(le..land, |s| s..task_end)),
        ("ground_after", (land + 1).min(n)..n),
    ];

    for k in 0..NCH {
        if !igc.present[k] {
            continue;
        }
        let mut cr = ChannelReport::default();
        for (name, range) in phases.iter().cloned() {
            if range.is_empty() {
                continue;
            }
            let mut s = stats(fixes, k, range.clone());
            for d in HOLD_D {
                s.hold.insert(d, hold(fixes, k, range.clone(), d));
            }
            cr.phases.insert(name, s);
        }
        let free = le..land;
        let mut free_s = stats(fixes, k, free.clone());
        for d in HOLD_D {
            free_s.hold.insert(d, hold(fixes, k, free.clone(), d));
        }
        cr.phases.insert("free", free_s);
        let circling = free.clone().filter(|&i| turn[i] > 6.);
        cr.modes.insert("circling", stats(fixes, k, circling));
        let cruise = free.clone().filter(|&i| turn[i] <= 3. && gs[i] < 50.);
        cr.modes.insert("cruise", stats(fixes, k, cruise));
        let fast = free.clone().filter(|&i| turn[i] <= 3. && gs[i] >= 50.);
        cr.modes.insert("fast", stats(fixes, k, fast));
        let sinking = free.clone().filter(|&i| vario[i] < -3.);
        cr.modes.insert("sinking", stats(fixes, k, sinking));

        for t in GRID_T {
            for d in GRID_D {
                let mut count = 0;
                let mut first = None;
                let mut after = None;
                let mut rs: Option<usize> = None;
                let mut q: Option<usize> = None;
                let mut flush = |rs: usize, q: usize, re: usize| {
                    count += 1;
                    let mk = || {
                        let later = fixes[q].t + 60;
                        let a = (q..=land).find(|&i| fixes[i].t >= later).unwrap_or(land);
                        Run {
                            t0: fixes[rs].t,
                            tq: fixes[q].t,
                            t1: fixes[re].t,
                            phase: phase_of(rs),
                            alt0: fixes[rs].alt,
                            dalt: fixes[a].alt - fixes[rs].alt,
                            turn: (rs..=q).map(|i| turn[i]).sum::<f64>() / (q - rs + 1) as f64,
                            gs: (rs..=q).map(|i| gs[i]).sum::<f64>() / (q - rs + 1) as f64,
                            d_prev: rs.checked_sub(1).and_then(|p| dist[p]).map(|x| x.0),
                            d_best: dist[rs].map(|x| x.0),
                            d_pos: dist[rs].map(|x| x.1),
                        }
                    };
                    if first.is_none() {
                        first = Some(mk());
                    }
                    if after.is_none() && start_idx.is_some_and(|s| re >= s) {
                        after = Some(mk());
                    }
                };
                for i in le..=land {
                    if fixes[i].ch[k] >= t {
                        let s = *rs.get_or_insert(i);
                        if q.is_none() && fixes[i].t - fixes[s].t >= d {
                            q = Some(i);
                        }
                    } else {
                        if let (Some(s), Some(qq)) = (rs, q) {
                            flush(s, qq, i - 1);
                        }
                        rs = None;
                        q = None;
                    }
                }
                if let (Some(s), Some(qq)) = (rs, q) {
                    flush(s, qq, land);
                }
                if count > 0 {
                    cr.runs.insert(format!("{t}/{d}"), (count, first, after));
                }
            }
        }
        r.channels.insert(CHANNELS[k], cr);
    }
    r.header = igc.header.clone();
    r
}
