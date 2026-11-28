//! The opt-in full-data check of how each row's default flight reaches the
//! task points: its start and finish line crossings and finish cylinder
//! entries against the published start and finish times, and whether a
//! finisher visits every turnpoint of a racing task.

use std::collections::{BTreeMap, HashMap};
use std::fmt;
use std::fs;
use std::io::{ErrorKind, Read};
use std::path::{Path, PathBuf};

use anyhow::{Context, bail};
use bytes::Bytes;
use flate2::read::GzDecoder;
use jiff::civil::Date;
use jiff::tz::TimeZone;
use jiff::{RoundMode, Timestamp, TimestampRound, Unit};
use keyhole_engine::flight_analysis::{
    IgcFile, PlacedZone, Record, ZoneEvent, choose_default_flight, line_crossings, zone_visits,
};
use keyhole_engine::geodesy::EarthModel;
use keyhole_engine::task::{ObservationZone, Task, TaskKind, TaskPoint};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use crate::full_data::{TASK_POINTS_PAST_THE_FINISH, class_days, earth_model, time_zone};
use crate::published::{PublishedTask, parse_results};

/// How far beyond each end of a line a crossing still counts, in km.
const LINE_TOLERANCE: f64 = 0.5;

/// The baseline inside a dataset directory, which accept mode writes.
const BASELINE: &str = "keyhole-oracle-task-points-baseline.toml";

/// Failing rows that a dataset's task point check accepts, by class day.
pub type TaskPointBaseline = BTreeMap<String, Vec<TaskPointDeviation>>;

/// A failing row that the baseline accepts.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TaskPointDeviation {
    pub competition_id: String,
    pub point: Point,
    /// The published and Keyhole's time, as the report shows them.
    pub explanation: String,
}

/// The task point a row is checked at.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(into = "String", try_from = "String")]
pub enum Point {
    Start,
    /// A turnpoint, counted from 1.
    Turnpoint(usize),
    Finish,
}

impl fmt::Display for Point {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Start => f.write_str("start"),
            Self::Turnpoint(number) => write!(f, "turnpoint {number}"),
            Self::Finish => f.write_str("finish"),
        }
    }
}

impl From<Point> for String {
    fn from(point: Point) -> Self {
        point.to_string()
    }
}

impl TryFrom<String> for Point {
    type Error = String;

    fn try_from(name: String) -> Result<Self, String> {
        let turnpoint = name.strip_prefix("turnpoint ").map(str::parse);
        match (name.as_str(), turnpoint) {
            ("start", _) => Ok(Self::Start),
            ("finish", _) => Ok(Self::Finish),
            (_, Some(Ok(number))) => Ok(Self::Turnpoint(number)),
            _ => Err(format!("unknown task point {name:?}")),
        }
    }
}

/// What is checked at a task point, which decides the outcomes a row can
/// have there and which of them fail.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Check {
    /// The forward crossing of a start line nearest the published start
    /// time, rounded down.
    StartLine,
    /// A visit to a turnpoint's zone at any time of the flight.
    Turnpoint,
    /// The forward crossing of a finish line nearest the published finish
    /// time, rounded up.
    FinishLine,
    /// The entry into a finish cylinder nearest the published finish time,
    /// rounded up. Unlike at a line, a row 1 s off fails.
    FinishCylinder,
}

impl Check {
    pub const ALL: [Self; 4] = [
        Self::StartLine,
        Self::Turnpoint,
        Self::FinishLine,
        Self::FinishCylinder,
    ];

    fn at(point: Point, zone: ObservationZone) -> Self {
        match (point, zone) {
            (Point::Start, _) => Self::StartLine,
            (Point::Turnpoint(_), _) => Self::Turnpoint,
            (Point::Finish, ObservationZone::Line { .. }) => Self::FinishLine,
            (Point::Finish, ObservationZone::TwoArc { .. }) => Self::FinishCylinder,
        }
    }

    fn outcomes(self) -> &'static [Outcome] {
        use Outcome::*;
        match self {
            Self::StartLine | Self::FinishLine => &[
                Matching,
                OneSecondEarly,
                OneSecondLate,
                MoreThanOneSecondOff,
                NoCrossing,
                NoIgcFile,
                UnreadableIgcFile,
            ],
            Self::FinishCylinder => &[
                Matching,
                OneSecondEarly,
                OneSecondLate,
                MoreThanOneSecondOff,
                NoEntry,
                NoIgcFile,
                UnreadableIgcFile,
            ],
            Self::Turnpoint => &[Visited, NoVisit, NoIgcFile, UnreadableIgcFile],
        }
    }

    fn fails(self, outcome: Outcome) -> bool {
        use Outcome::*;
        let passes = matches!(outcome, Matching | Visited | NoIgcFile);
        let line = matches!(self, Self::StartLine | Self::FinishLine);
        let one_second_off = matches!(outcome, OneSecondEarly | OneSecondLate);
        !passes && !(line && one_second_off)
    }

    /// The bearing that a forward crossing of a line with `direction` goes
    /// along: the start line's own and the reverse of the finish line's.
    fn crossing_bearing(self, direction: f64) -> f64 {
        match self {
            Self::FinishLine => direction + 180.,
            _ => direction,
        }
    }

    /// How SeeYou rounds the time: a start down and a finish up.
    fn round_mode(self) -> RoundMode {
        match self {
            Self::StartLine => RoundMode::Floor,
            _ => RoundMode::Ceil,
        }
    }

    /// The outcome of a row without a crossing or entry.
    fn missing(self) -> Outcome {
        match self {
            Self::FinishCylinder => Outcome::NoEntry,
            _ => Outcome::NoCrossing,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::StartLine => "start line",
            Self::Turnpoint => "turnpoints",
            Self::FinishLine => "finish line",
            Self::FinishCylinder => "finish cylinder",
        }
    }
}

/// How a row's published time compares with its crossing or entry, or
/// whether it visits a turnpoint.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Outcome {
    Matching,
    OneSecondEarly,
    OneSecondLate,
    MoreThanOneSecondOff,
    NoCrossing,
    NoEntry,
    Visited,
    NoVisit,
    NoIgcFile,
    UnreadableIgcFile,
}

/// A row that fails the check at a task point.
#[derive(Debug)]
pub struct RowMismatch {
    pub competition_id: String,
    pub point: Point,
    pub outcome: Outcome,
    /// The published start time at the start, otherwise the finish time.
    pub published: Timestamp,
    /// The rounded crossing or entry nearest the published time, if any.
    pub keyhole: Option<Timestamp>,
}

/// The rows of one class day, counted by check and outcome.
#[derive(Debug)]
pub struct DayTaskPoints {
    pub earth_model: EarthModel,
    pub time_zone: TimeZone,
    pub counts: BTreeMap<(Check, Outcome), usize>,
    pub mismatches: Vec<RowMismatch>,
    /// The class day's rows in the baseline.
    pub baseline: Vec<TaskPointDeviation>,
}

impl DayTaskPoints {
    fn deviation(&self, mismatch: &RowMismatch) -> TaskPointDeviation {
        let local = |time: Timestamp| self.time_zone.to_datetime(time).time();
        let published = local(mismatch.published);
        let keyhole = mismatch.keyhole.map(local);
        let outcome = outcome_name(mismatch.outcome);
        let keyhole = keyhole.map_or(outcome.into(), |time| time.to_string());
        TaskPointDeviation {
            competition_id: mismatch.competition_id.clone(),
            point: mismatch.point,
            explanation: format!("published {published}, Keyhole {keyhole}"),
        }
    }

    fn deviations(&self) -> impl Iterator<Item = TaskPointDeviation> {
        self.mismatches
            .iter()
            .map(|mismatch| self.deviation(mismatch))
    }

    /// Whether the baseline accepts every failing row and every baseline row
    /// still fails.
    fn passes(&self) -> bool {
        self.unexplained().next().is_none() && self.stale().next().is_none()
    }

    /// The failing rows that the baseline doesn't accept with these values.
    fn unexplained(&self) -> impl Iterator<Item = TaskPointDeviation> {
        self.deviations()
            .filter(|deviation| !self.baseline.contains(deviation))
    }

    /// The baseline rows that no longer fail with these values.
    fn stale(&self) -> impl Iterator<Item = &TaskPointDeviation> {
        let deviations: Vec<_> = self.deviations().collect();
        let baseline = self.baseline.iter();
        baseline.filter(move |deviation| !deviations.contains(deviation))
    }
}

/// The outcome of checking the task points of every class day of a
/// dataset.
#[derive(Debug, Default)]
pub struct TaskPointReport {
    /// The rows of each checked class day, or the error that stopped its
    /// check, by its `<competition>/<class>/<date>` path.
    pub checked: Vec<(String, anyhow::Result<DayTaskPoints>)>,
    /// The number of class days left out, by reason. A class day with a start
    /// cylinder and a finish line counts here and is still checked.
    pub left_out: BTreeMap<&'static str, usize>,
    /// Baseline rows of class days that weren't checked, by class day.
    pub unchecked_baseline: TaskPointBaseline,
}

impl TaskPointReport {
    pub fn passes(&self) -> bool {
        let checked = self.checked.iter().all(|(_, day)| day_passes(day));
        checked && self.unchecked_baseline.is_empty()
    }

    /// Writes every failing row of the checked class days as the baseline of
    /// the dataset in `directory`.
    pub fn write_baseline(&self, directory: &Path) -> anyhow::Result<()> {
        let errors = self.checked.iter().filter(|(_, day)| day.is_err()).count();
        if errors > 0 {
            bail!("accept mode writes no baseline while class days have errors: {errors}");
        }
        let days = self.checked.iter();
        let days = days.filter_map(|(name, day)| Some((name, day.as_ref().ok()?)));
        let days = days.map(|(name, day)| (name.clone(), day.deviations().collect::<Vec<_>>()));
        let baseline: TaskPointBaseline = days.filter(|(_, rows)| !rows.is_empty()).collect();
        let path = directory.join(BASELINE);
        let baseline = toml::to_string(&baseline).context("serializing the baseline")?;
        fs::write(&path, baseline).with_context(|| format!("writing {}", path.display()))
    }
}

fn day_passes(day: &anyhow::Result<DayTaskPoints>) -> bool {
    day.as_ref().is_ok_and(DayTaskPoints::passes)
}

fn write_baseline_rows<'a>(
    f: &mut fmt::Formatter<'_>,
    heading: &str,
    rows: impl Iterator<Item = (&'a str, &'a TaskPointDeviation)>,
) -> fmt::Result {
    let rows: Vec<_> = rows.collect();
    if !rows.is_empty() {
        writeln!(f, "{heading} ({}):", rows.len())?;
    }
    for (day, deviation) in rows {
        let (id, point) = (&deviation.competition_id, deviation.point);
        writeln!(f, "  {day} {id} {point}: {}", deviation.explanation)?;
    }
    Ok(())
}

impl fmt::Display for TaskPointReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (name, day) in &self.checked {
            let day = match day {
                Ok(day) => day,
                Err(error) => {
                    writeln!(f, "{name}: {error:#}")?;
                    continue;
                }
            };
            let earth_model = match day.earth_model {
                EarthModel::Wgs84 => "WGS84",
                EarthModel::FaiSphere => "FAI Sphere",
            };
            let time_zone = day.time_zone.iana_name().unwrap_or_default();
            writeln!(f, "{name} ({earth_model}, {time_zone}):")?;
            for check in Check::ALL {
                if !day.counts.keys().any(|&(counted, _)| counted == check) {
                    continue;
                }
                let counts = check.outcomes().iter().map(|&outcome| {
                    let count = day.counts.get(&(check, outcome)).copied().unwrap_or(0);
                    format!("{} {count}", outcome_name(outcome))
                });
                let counts: Vec<_> = counts.collect();
                writeln!(f, "  {}: {}", check.name(), counts.join(", "))?;
            }
            for deviation in day.unexplained() {
                let (id, point) = (&deviation.competition_id, deviation.point);
                writeln!(f, "  {id} {point}: {}", deviation.explanation)?;
            }
        }
        let days = self.checked.iter();
        let days = days.filter_map(|(name, day)| Some((name.as_str(), day.as_ref().ok()?)));
        let stale = days.flat_map(|(name, day)| day.stale().map(move |row| (name, row)));
        write_baseline_rows(f, "Baseline rows that no longer occur", stale)?;
        let unchecked = self.unchecked_baseline.iter();
        let unchecked =
            unchecked.flat_map(|(name, rows)| rows.iter().map(move |row| (name.as_str(), row)));
        let heading = "Baseline rows of class days that weren't checked";
        write_baseline_rows(f, heading, unchecked)?;
        let checked = self.checked.len();
        let failing = self.checked.iter().filter(|(_, day)| !day_passes(day));
        let failing = failing.count();
        writeln!(f, "Checked class days: {checked}, failing: {failing}")?;
        for (reason, count) in &self.left_out {
            writeln!(f, "Left out class days ({reason}): {count}")?;
        }
        Ok(())
    }
}

fn outcome_name(outcome: Outcome) -> &'static str {
    match outcome {
        Outcome::Matching => "matching",
        Outcome::OneSecondEarly => "1 s early",
        Outcome::OneSecondLate => "1 s late",
        Outcome::MoreThanOneSecondOff => "more than 1 s off",
        Outcome::NoCrossing => "no crossing",
        Outcome::NoEntry => "no entry",
        Outcome::Visited => "visited",
        Outcome::NoVisit => "no visit",
        Outcome::NoIgcFile => "no IGC file",
        Outcome::UnreadableIgcFile => "unreadable IGC file",
    }
}

/// Checks the task points of every class day under
/// `<competition>/<class>/<date>` in a dataset directory. A class day that
/// can't be checked fails the report instead of stopping the run.
pub fn check_task_points(directory: &Path) -> anyhow::Result<TaskPointReport> {
    let path = directory.display();
    if !directory.is_dir() {
        bail!("the dataset directory {path} doesn't exist");
    }
    let path = directory.join(BASELINE);
    let mut baseline: TaskPointBaseline = match fs::read_to_string(&path) {
        Ok(baseline) => {
            toml::from_str(&baseline).with_context(|| format!("parsing {}", path.display()))?
        }
        Err(error) if error.kind() == ErrorKind::NotFound => TaskPointBaseline::new(),
        Err(error) => Err(error).with_context(|| format!("reading {}", path.display()))?,
    };
    let mut report = TaskPointReport::default();
    let days = class_days(directory)?.into_iter().map(|day| {
        let name = day.strip_prefix(directory)?.display().to_string();
        Ok((day, name))
    });
    let days: Vec<_> = days.collect::<anyhow::Result<_>>()?;
    let days = days.into_par_iter().map(|(day, name)| {
        let mut left_out = BTreeMap::new();
        let task_points = check_day(&day, &name, &mut left_out);
        (name, task_points, left_out)
    });
    for (name, task_points, left_out) in days.collect::<Vec<_>>() {
        for (reason, count) in left_out {
            *report.left_out.entry(reason).or_default() += count;
        }
        match task_points {
            Ok(Some(mut task_points)) => {
                task_points.baseline = baseline.remove(&name).unwrap_or_default();
                report.checked.push((name, Ok(task_points)));
            }
            Ok(None) => {}
            Err(error) => report.checked.push((name, Err(error))),
        }
    }
    report.unchecked_baseline = baseline;
    Ok(report)
}

/// The part of `task.json` that decides whether a class day is checked.
#[derive(Deserialize)]
struct TaskFile {
    result_status: String,
    task_date: Date,
    task_points: Vec<TaskFilePoint>,
}

/// The fields of a task point that the task files of 2012 to 2014 lack.
#[derive(Deserialize)]
struct TaskFilePoint {
    oz_angle12: Option<f64>,
    oz_radius2: Option<f64>,
    oz_angle2: Option<f64>,
    #[serde(default)]
    multiple_start: bool,
}

/// The rows of a class day, or `None` for a class day left out entirely.
fn check_day(
    directory: &Path,
    name: &str,
    left_out: &mut BTreeMap<&'static str, usize>,
) -> anyhow::Result<Option<DayTaskPoints>> {
    let mut leave_out = |reason| *left_out.entry(reason).or_default() += 1;
    let read = |name| {
        let path = directory.join(name);
        fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))
    };
    let task_json = read("task.json")?;
    let file: TaskFile = serde_json::from_str(&task_json).context("parsing task.json")?;
    if file.result_status == "cancelled" {
        leave_out("cancelled");
        return Ok(None);
    }
    let points = file.task_points.iter();
    let complete = |point: &TaskFilePoint| {
        point.oz_angle12.is_some() && point.oz_radius2.is_some() && point.oz_angle2.is_some()
    };
    if !points.clone().all(complete) {
        leave_out("task points without oz_angle12, oz_radius2 and oz_angle2");
        return Ok(None);
    }
    if points.clone().any(|point| point.multiple_start) {
        leave_out("multiple start points");
        return Ok(None);
    }
    if TASK_POINTS_PAST_THE_FINISH.contains(&name) {
        leave_out("task points past the finish");
        return Ok(None);
    }
    let earth_model = earth_model(name).map_or(EarthModel::Wgs84, Into::into);
    let task: PublishedTask = serde_json::from_str(&task_json).context("parsing task.json")?;
    let task = match task {
        PublishedTask::Racing(task) => task.to_task(earth_model)?,
        PublishedTask::AssignedArea(task) => task.to_task(earth_model)?,
        PublishedTask::CourseShape { .. } => {
            leave_out("task named by its course shape");
            return Ok(None);
        }
    };
    let task = task.resolve()?;
    let mut points = Vec::new();
    match task.start.zone {
        ObservationZone::Line { .. } => points.push((Point::Start, &task.start)),
        ObservationZone::TwoArc { .. } => leave_out("start cylinder"),
    }
    if task.kind == TaskKind::Racing {
        let turnpoints = task.turnpoints.iter().enumerate();
        points.extend(turnpoints.map(|(index, point)| (Point::Turnpoint(index + 1), point)));
    }
    points.push((Point::Finish, &task.finish));
    let igc_files = igc_files(directory)?;
    if igc_files.is_empty() {
        leave_out("no IGC files");
        return Ok(None);
    }

    let competition = name.split('/').next().unwrap_or_default();
    let time_zone = time_zone(competition)?;
    let mut day = DayTaskPoints {
        earth_model,
        time_zone,
        counts: BTreeMap::new(),
        mismatches: Vec::new(),
        baseline: Vec::new(),
    };
    for row in parse_results(&read("results.csv")?).context("parsing results.csv")? {
        let mut parsed = None;
        for &(point, task_point) in &points {
            let check = Check::at(point, task_point.zone);
            let time = match point {
                Point::Start => row.start_time,
                Point::Turnpoint(_) | Point::Finish => row.finish_time,
            };
            let Some(time) = time else { continue };
            let local = file.task_date.to_datetime(time);
            let published = day.time_zone.to_timestamp(local)?;
            let Some(path) = igc_files.get(&row.competition_id) else {
                *day.counts.entry((check, Outcome::NoIgcFile)).or_default() += 1;
                continue;
            };
            let igc_file = parsed.get_or_insert_with(|| read_igc_file(path).ok());
            let (outcome, keyhole) = match igc_file {
                Some(igc_file) => {
                    let records = default_flight(igc_file);
                    check_point(records, &task, check, task_point, published)?
                }
                None => (Outcome::UnreadableIgcFile, None),
            };
            *day.counts.entry((check, outcome)).or_default() += 1;
            if check.fails(outcome) {
                let competition_id = row.competition_id.clone();
                let mismatch = RowMismatch {
                    competition_id,
                    point,
                    outcome,
                    published,
                    keyhole,
                };
                day.mismatches.push(mismatch);
            }
        }
    }
    Ok(Some(day))
}

/// The records of the default flight, or none without a flight.
fn default_flight(igc_file: &IgcFile) -> &[Record] {
    let flights = igc_file.flights();
    let Some(flight) = choose_default_flight(&flights) else {
        return &[];
    };
    igc_file.records_between(flight.start.time(), flight.end.time())
}

/// A row's outcome at a task point, with the rounded crossing or entry
/// nearest the published time.
fn check_point(
    records: &[Record],
    task: &Task<f64>,
    check: Check,
    point: &TaskPoint<f64>,
    published: Timestamp,
) -> anyhow::Result<(Outcome, Option<Timestamp>)> {
    let (earth_model, reference_point) = (task.earth_model, point.reference_point);
    let times: Vec<_> = match point.zone {
        ObservationZone::Line { length } => {
            let bearing = check.crossing_bearing(point.direction);
            let reach = length / 2. + LINE_TOLERANCE;
            let crossings = line_crossings(records, earth_model, reference_point, bearing);
            let crossings = crossings
                .into_iter()
                .filter(|crossing| crossing.along <= reach);
            crossings.map(|crossing| crossing.time).collect()
        }
        ObservationZone::TwoArc { shape, .. } => {
            let zone = PlacedZone::new(earth_model, reference_point, point.direction, shape);
            let events = zone_visits(records, &zone, None);
            let mut visits = events.into_iter().filter_map(|event| match event {
                ZoneEvent::Visit(visit) => Some(visit),
                ZoneEvent::NearMiss(_) => None,
            });
            if check == Check::Turnpoint {
                let outcome = match visits.next() {
                    Some(_) => Outcome::Visited,
                    None => Outcome::NoVisit,
                };
                return Ok((outcome, None));
            }
            let entries = visits.filter_map(|visit| visit.entry);
            entries.map(|entry| entry.time).collect()
        }
    };
    let offset = |time: &Timestamp| time.duration_since(published).abs();
    let nearest = times.into_iter().min_by_key(offset);
    let rounding = TimestampRound::new()
        .smallest(Unit::Second)
        .mode(check.round_mode());
    let keyhole = nearest.map(|time| time.round(rounding)).transpose()?;
    let missing = check.missing();
    Ok((outcome(keyhole, published, missing), keyhole))
}

/// How the rounded crossing or entry nearest a published time compares with
/// it, or `missing` without one.
fn outcome(keyhole: Option<Timestamp>, published: Timestamp, missing: Outcome) -> Outcome {
    match keyhole.map(|time| time.duration_since(published).as_secs()) {
        None => missing,
        Some(0) => Outcome::Matching,
        Some(-1) => Outcome::OneSecondEarly,
        Some(1) => Outcome::OneSecondLate,
        Some(_) => Outcome::MoreThanOneSecondOff,
    }
}

/// The IGC files of a class day by competition ID, from soaringspot-downloader's
/// `<prefix>_<competition ID>.igc.gz` file names.
fn igc_files(directory: &Path) -> anyhow::Result<HashMap<String, PathBuf>> {
    let mut files = HashMap::new();
    let entries = fs::read_dir(directory);
    for entry in entries.with_context(|| format!("reading {}", directory.display()))? {
        let path = entry?.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        let Some(stem) = name.strip_suffix(".igc.gz") else {
            continue;
        };
        let Some((_, competition_id)) = stem.split_once('_') else {
            continue;
        };
        files.insert(competition_id.to_string(), path.clone());
    }
    Ok(files)
}

fn read_igc_file(path: &Path) -> anyhow::Result<IgcFile> {
    let mut contents = Vec::new();
    GzDecoder::new(fs::File::open(path)?).read_to_end(&mut contents)?;
    let (igc_file, _) = IgcFile::parse(Bytes::from(contents))?;
    let date = igc_file.date;
    let (igc_file, _) = igc_file.resolve_times(date)?;
    Ok(igc_file)
}
