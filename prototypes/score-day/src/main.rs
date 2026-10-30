//! PROTOTYPE, throwaway. Answers "Can we reproduce one SoaringSpot day's scores?"
//! for `euregiocup-2024/hasen/2024-05-11` only.
//!
//! Usage: cargo run --release -- <soaringspot day dir> [csv|igc]
//!
//! `csv` feeds the published distances and times into the day formula.
//! `igc` (default) derives them from the IGC files first.

use std::{env, fs, io::Read, path::Path};

use flate2::read::GzDecoder;
use geographiclib_rs::{Geodesic, InverseGeodesic};
use serde::Deserialize;

/// Everything the scorer would enter by hand for this day.
struct ScorerInputs {
    utc_offset_s: i64,
    dm_km: f64,
    d1_km: f64,
    /// N is published as 34, but `results.csv` has 35 rows that are not DNS.
    launched_override: Option<usize>,
    not_launched: &'static [&'static str],
    /// Rows without IGC file that the scorer entered as a distance.
    manual_distance_km: &'static [(&'static str, f64)],
    penalties: &'static [(&'static str, i64)],
}

const INPUTS: ScorerInputs = ScorerInputs {
    utc_offset_s: 2 * 3600,
    dm_km: 50.,
    d1_km: 250.,
    launched_override: Some(34),
    not_launched: &["NW2"],
    manual_distance_km: &[("MW", 0.), ("ME", 0.), ("V", 0.)],
    penalties: &[("YB", 5), ("NW", 6), ("EJ", 8)],
};

#[derive(Deserialize)]
struct TaskJson {
    task_distance: f64,
    task_points: Vec<TaskPoint>,
}

#[derive(Deserialize, Clone)]
struct TaskPoint {
    name: String,
    latitude: f64,
    longitude: f64,
    oz_radius1: f64,
    oz_radius2: f64,
    oz_angle1: f64,
    oz_angle12: f64,
    course_in: f64,
    course_out: f64,
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
    rank: String,
    cn: String,
    handicap: Option<f64>,
    start_time_local: String,
    finish_time_local: String,
    duration: String,
    distance_km: Option<f64>,
    points: i64,
}

#[derive(Clone, Debug, Default)]
struct Performance {
    start: Option<i64>,
    finish: Option<i64>,
    distance_km: f64,
    note: String,
}

impl Performance {
    fn duration_s(&self) -> Option<i64> {
        Some(self.finish? - self.start?)
    }
    fn speed_kmh(&self) -> Option<f64> {
        Some(self.distance_km / self.duration_s()? as f64 * 3600.)
    }
}

struct Entry {
    handicap: f64,
    performance: Option<Performance>,
    penalty: i64,
}

#[derive(Debug)]
#[expect(dead_code, reason = "only printed")]
struct DayParameters {
    n: usize,
    n1: usize,
    n2: usize,
    do_km: f64,
    vo_kmh: f64,
    pm: f64,
    f: f64,
    fcr: f64,
    pvm: f64,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let dir = Path::new(&args[1]);
    let mode = args.get(2).map(String::as_str).unwrap_or("igc");

    let task: TaskJson =
        serde_json::from_str(&fs::read_to_string(dir.join("task.json")).unwrap()).unwrap();
    let rows: Vec<ResultRow> = csv::Reader::from_path(dir.join("results.csv"))
        .unwrap()
        .deserialize()
        .map(Result::unwrap)
        .collect();

    let legs = leg_lengths(&task.task_points);
    let finish = task.task_points.last().unwrap();
    let reduce_m = if finish.oz_reduce {
        finish.oz_radius1
    } else {
        0.
    };
    let task_km = (legs.iter().sum::<f64>() - reduce_m) / 1000.;
    println!(
        "task distance: ours {task_km:.5} km, task.json {:.5} km",
        task.task_distance / 1000.
    );
    for tp in &task.task_points[1..task.task_points.len() - 1] {
        println!(
            "  {}: oz_angle12 {:.1}°, outward bisector {:.1}°",
            tp.name,
            tp.oz_angle12.to_degrees(),
            outward_bisector(tp).to_degrees()
        );
    }

    let entries: Vec<Entry> = rows
        .iter()
        .map(|row| {
            let performance = match mode {
                "csv" => performance_from_csv(row),
                _ => performance_from_igc(dir, row, &task.task_points, &legs, task_km),
            };
            Entry {
                handicap: row.handicap.unwrap_or(100.),
                performance,
                penalty: INPUTS
                    .penalties
                    .iter()
                    .find(|(cn, _)| *cn == row.cn)
                    .map_or(0, |(_, p)| *p),
            }
        })
        .collect();

    let (day, points) = score_day(&entries);
    println!("\n{day:#?}");
    println!(
        "published: N 34, n1 25, n2 21, Do 266.00 km, Vo 84.99 km/h, Pm 907, F 0.919, Fcr 1.000, Pvm 374\n"
    );

    println!(
        "{:<5} {:<6} {:>17} {:>17} {:>21} {:>19} {:>9}  note",
        "rank", "cn", "start", "finish", "distance km", "speed km/h", "points"
    );
    let mut mismatches = 0;
    for ((row, entry), ours) in rows.iter().zip(&entries).zip(&points) {
        let theirs = performance_from_csv(row);
        let p = entry.performance.clone().unwrap_or_default();
        let t = theirs.unwrap_or_default();
        let start = cmp(fmt_time(p.start), fmt_time(t.start));
        let finish = cmp(fmt_time(p.finish), fmt_time(t.finish));
        let distance = cmp(
            format!("{:.2}", p.distance_km),
            format!("{:.2}", t.distance_km),
        );
        let speed = cmp(fmt_opt(p.speed_kmh()), fmt_opt(t.speed_kmh()));
        let pts = cmp(ours.to_string(), row.points.to_string());
        if [&start, &finish, &distance, &speed, &pts]
            .iter()
            .any(|c| c.contains('≠'))
        {
            mismatches += 1;
        }
        println!(
            "{:<5} {:<6} {start:>17} {finish:>17} {distance:>21} {speed:>19} {pts:>9}  {}",
            row.rank, row.cn, p.note
        );
    }
    println!("\n{mismatches} of {} rows differ", rows.len());
}

fn cmp(ours: String, theirs: String) -> String {
    if ours == theirs {
        ours
    } else {
        format!("{ours}≠{theirs}")
    }
}

fn fmt_time(t: Option<i64>) -> String {
    t.map_or("-".into(), |t| {
        let t = t + INPUTS.utc_offset_s;
        format!("{:02}:{:02}:{:02}", t / 3600, t / 60 % 60, t % 60)
    })
}

fn fmt_opt(v: Option<f64>) -> String {
    v.map_or("-".into(), |v| format!("{v:.2}"))
}

fn parse_hms(s: &str) -> Option<i64> {
    let mut it = s.split(':').filter_map(|p| p.parse::<i64>().ok());
    Some(it.next()? * 3600 + it.next()? * 60 + it.next()?)
}

fn performance_from_csv(row: &ResultRow) -> Option<Performance> {
    if row.rank == "DNS" {
        return None;
    }
    let start = parse_hms(&row.start_time_local).map(|t| t - INPUTS.utc_offset_s);
    let finish = parse_hms(&row.finish_time_local).map(|t| t - INPUTS.utc_offset_s);
    assert_eq!(
        finish.zip(start).map(|(f, s)| f - s),
        parse_hms(&row.duration)
    );
    Some(Performance {
        start,
        finish,
        distance_km: row.distance_km.unwrap_or(0.),
        note: String::new(),
    })
}

fn round_half_up(x: f64) -> i64 {
    (x + 0.5).floor() as i64
}

fn score_day(entries: &[Entry]) -> (DayParameters, Vec<i64>) {
    let min_handicap = entries
        .iter()
        .map(|e| e.handicap)
        .fold(f64::INFINITY, f64::min);
    let h_base = 10f64.powf(min_handicap.log10().floor());

    struct Handicapped {
        dh: f64,
        vh: Option<f64>,
        t_h: Option<f64>,
    }
    let launched: Vec<Option<Handicapped>> = entries
        .iter()
        .map(|e| {
            let p = e.performance.as_ref()?;
            let h = e.handicap / h_base;
            Some(Handicapped {
                dh: p.distance_km / h,
                vh: p.speed_kmh().map(|v| v / h),
                t_h: p.duration_s().map(|t| t as f64 / 3600.),
            })
        })
        .collect();
    let all = launched.iter().flatten();

    let n_from_rows = all.clone().count();
    let n = INPUTS.launched_override.unwrap_or(n_from_rows);
    if n != n_from_rows {
        println!("N overridden: {n_from_rows} launched rows, using {n}");
    }
    let do_km = all.clone().map(|h| h.dh).fold(0., f64::max);
    let (vo_kmh, to_h) =
        all.clone()
            .filter_map(|h| Some((h.vh?, h.t_h?)))
            .fold(
                (0., 100.),
                |best, cur| if cur.0 > best.0 { cur } else { best },
            );
    let n1 = all.clone().filter(|h| h.dh >= INPUTS.dm_km).count();
    let n2 = all
        .clone()
        .filter(|h| h.vh.is_some_and(|v| v > 2. / 3. * vo_kmh))
        .count();

    let pm = 1000f64
        .min(1250. * do_km / INPUTS.d1_km - 250.)
        .min(400. * to_h - 200.);
    let f = 1f64.min(1.25 * n1 as f64 / n as f64);
    let fcr = 1f64.min(1.2 * n2 as f64 / n1 as f64 + 0.6);
    let pvm = 2. / 3. * (n2 as f64 / n as f64) * pm;
    let pdm = pm - pvm;

    let points = entries
        .iter()
        .zip(&launched)
        .map(|(e, h)| {
            let Some(h) = h else { return 0 };
            let (pv, pd) = match h.vh {
                Some(vh) => ((pvm * (vh - 2. / 3. * vo_kmh) / (vo_kmh / 3.)).max(0.), pdm),
                None => (0., pdm * h.dh / do_km),
            };
            round_half_up(f * fcr * (pv + pd)) - e.penalty
        })
        .collect();

    (
        DayParameters {
            n,
            n1,
            n2,
            do_km,
            vo_kmh,
            pm,
            f,
            fcr,
            pvm,
        },
        points,
    )
}

struct Fix {
    t: i64,
    lat: f64,
    lon: f64,
    gps_alt: i32,
    engine: u16,
}

fn leg_lengths(points: &[TaskPoint]) -> Vec<f64> {
    let g = Geodesic::wgs84();
    points
        .windows(2)
        .map(|w| {
            InverseGeodesic::<f64>::inverse(&g, w[0].lat(), w[0].lon(), w[1].lat(), w[1].lon())
        })
        .collect()
}

/// Direction from the turnpoint that points away from both legs, in radians.
fn outward_bisector(tp: &TaskPoint) -> f64 {
    let back = tp.course_in + std::f64::consts::PI;
    let out = tp.course_out;
    let inner = (back.sin() + out.sin()).atan2(back.cos() + out.cos());
    (inner + std::f64::consts::PI).rem_euclid(std::f64::consts::TAU)
}

fn sphere_polar(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> (f64, f64) {
    let (p1, p2, dl) = (
        lat1.to_radians(),
        lat2.to_radians(),
        (lon2 - lon1).to_radians(),
    );
    let a = ((p2 - p1) / 2.).sin().powi(2) + p1.cos() * p2.cos() * (dl / 2.).sin().powi(2);
    let s = 2. * 6_371_000. * a.sqrt().asin();
    let az = (dl.sin() * p2.cos()).atan2(p1.cos() * p2.sin() - p1.sin() * p2.cos() * dl.cos());
    (s, az.to_degrees())
}

fn engine_threshold() -> u16 {
    env::var("ENGINE_THRESHOLD").map_or(500, |v| v.parse().unwrap())
}

fn time_rule() -> String {
    env::var("TIME_RULE").unwrap_or("fix".into())
}

fn start_time(t0: f64, t1: f64, frac: f64) -> f64 {
    match time_rule().as_str() {
        "fix" => t0,
        "floor" => (t0 + frac * (t1 - t0)).floor(),
        _ => t0 + frac * (t1 - t0),
    }
}

fn finish_time(t0: f64, t1: f64, frac: f64) -> f64 {
    match time_rule().as_str() {
        "fix" => t1,
        "floor" => (t0 + frac * (t1 - t0)).ceil(),
        _ => t0 + frac * (t1 - t0),
    }
}

fn angle_diff_deg(a: f64, b: f64) -> f64 {
    let d = (a - b).rem_euclid(360.);
    d.min(360. - d)
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
                let def = &rest[2 + i * 7..9 + i * 7];
                if matches!(&def[4..], "ENL" | "MOP") {
                    engine_cols.push((def[..2].parse().unwrap(), def[2..4].parse().unwrap()));
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
            engine,
        });
    }
    fixes
}

fn performance_from_igc(
    dir: &Path,
    row: &ResultRow,
    points: &[TaskPoint],
    legs: &[f64],
    task_km: f64,
) -> Option<Performance> {
    if INPUTS.not_launched.contains(&row.cn.as_str()) {
        return None;
    }
    if let Some((_, km)) = INPUTS
        .manual_distance_km
        .iter()
        .find(|(cn, _)| *cn == row.cn)
    {
        return Some(Performance {
            distance_km: *km,
            note: "manual".into(),
            ..Default::default()
        });
    }
    let path = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| {
            p.file_name()
                .unwrap()
                .to_string_lossy()
                .ends_with(&format!("_{}.igc.gz", row.cn))
        });
    let Some(path) = path else {
        return Some(Performance {
            note: "no IGC file".into(),
            ..Default::default()
        });
    };
    let fixes = read_fixes(&path);
    Some(analyse(&fixes, points, legs, task_km))
}

fn analyse(fixes: &[Fix], points: &[TaskPoint], legs: &[f64], task_km: f64) -> Performance {
    let g = Geodesic::wgs84();
    // polar[i][k]: distance (m) and azimuth (deg) from task point k to fix i
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

    let start = &points[0];
    let course = start.course_out.to_degrees()
        + env::var("START_ROT_DEG").map_or(0., |v| v.parse::<f64>().unwrap());
    let sphere = env::var("START_MODEL").is_ok_and(|m| m == "sphere");
    let course = if sphere {
        sphere_polar(start.lat(), start.lon(), points[1].lat(), points[1].lon()).1
    } else {
        course
    };
    let along = |i: usize| -> (f64, f64) {
        let (s, az) = if sphere {
            sphere_polar(start.lat(), start.lon(), fixes[i].lat, fixes[i].lon)
        } else {
            polar[i][0]
        };
        let rel = (az - course).to_radians();
        (s * rel.cos(), s * rel.sin())
    };
    let crossings: Vec<(usize, f64)> = (1..fixes.len())
        .filter_map(|i| {
            let (x0, y0) = along(i - 1);
            let (x1, y1) = along(i);
            if !(x0 < 0. && x1 >= 0.) {
                return None;
            }
            let frac = -x0 / (x1 - x0);
            if env::var("DEBUG").is_ok() && (y0 + frac * (y1 - y0)).abs() <= start.oz_radius1 {
                eprintln!(
                    "crossing {} -> {}: x {x0:.1} -> {x1:.1}, y {y0:.0}, frac {frac:.2}",
                    fmt_time(Some(fixes[i - 1].t)),
                    fmt_time(Some(fixes[i].t))
                );
            }
            ((y0 + frac * (y1 - y0)).abs() <= start.oz_radius1).then(|| {
                (
                    i,
                    start_time(fixes[i - 1].t as f64, fixes[i].t as f64, frac),
                )
            })
        })
        .collect();
    if crossings.is_empty() {
        return Performance {
            note: "no start".into(),
            ..Default::default()
        };
    }

    let end = flight_end(fixes, &g, crossings[0].0);
    let mut note = end.1.clone();
    let end = end.0;

    let in_zone = |i: usize, k: usize| -> bool {
        let tp = &points[k];
        let (s, az) = polar[i][k];
        s <= tp.oz_radius2
            || (s <= tp.oz_radius1
                && angle_diff_deg(az, outward_bisector(tp).to_degrees())
                    <= tp.oz_angle1.to_degrees())
    };
    let last = points.len() - 1;
    let finish_radius = points[last].oz_radius1;

    let mut best: Option<(Performance, f64)> = None;
    for &(i, t_start) in &crossings {
        if i >= end {
            break;
        }
        let mut next = 1;
        let mut done_m = 0.;
        let mut best_m: f64 = 0.;
        let mut result = None;
        for j in i..end {
            if next == last {
                let d = polar[j][last].0;
                if d <= finish_radius {
                    let d0 = polar[j - 1][last].0;
                    let frac = ((d0 - finish_radius) / (d0 - d)).clamp(0., 1.);
                    let t = finish_time(fixes[j - 1].t as f64, fixes[j].t as f64, frac);
                    result = Some(Performance {
                        start: Some(t_start.round() as i64),
                        finish: Some(t.round() as i64),
                        distance_km: task_km,
                        note: format!("finish alt {} m", fixes[j].gps_alt),
                    });
                    break;
                }
            } else if in_zone(j, next) {
                done_m += legs[next - 1];
                next += 1;
                continue;
            }
            best_m = best_m.max(done_m + (legs[next - 1] - polar[j][next].0).max(0.));
        }
        let candidate = result.unwrap_or_else(|| Performance {
            start: Some(t_start.round() as i64),
            finish: None,
            distance_km: best_m / 1000.,
            note: format!("reached tp {}", next - 1),
        });
        // Finishers rank by time and outlanders by distance. Later starts win ties.
        let key = match candidate.duration_s() {
            Some(d) => 1e9 - d as f64,
            None => candidate.distance_km,
        };
        if best.as_ref().is_none_or(|(_, k)| key >= *k) {
            best = Some((candidate, key));
        }
    }
    let (mut p, _) = best.unwrap();
    note.push_str(&format!(" {} starts; {}", crossings.len(), p.note));
    p.note = note;
    p
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
                return (since, format!("landed {}", fmt_time(Some(fixes[since].t))));
            }
        } else {
            slow_since = None;
        }
        if b.engine >= engine_threshold() {
            let since = *engine_since.get_or_insert(i);
            if b.t - fixes[since].t >= 30 {
                // SeeYou still credits the first fix above the threshold.
                return (
                    since + 1,
                    format!("ENGINE {}", fmt_time(Some(fixes[since].t))),
                );
            }
        } else {
            engine_since = None;
        }
    }
    (fixes.len(), "no landing".into())
}
