//! The opt-in full-data check of start and finish line crossings: each row's
//! published start and finish time against the forward crossing of its
//! default flight that lies nearest that time.

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
use keyhole_engine::flight_analysis::{IgcFile, choose_default_flight, line_crossings};
use keyhole_engine::geodesy::EarthModel;
use keyhole_engine::task::{ObservationZone, Task, TaskPoint};
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
    pub line: Line,
    /// The published and Keyhole's time, as the report shows them.
    pub explanation: String,
}

/// A start or finish line.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Line {
    Start,
    Finish,
}

/// How a row's published time compares with its crossing, rounded down at a
/// start and up at a finish.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Outcome {
    Matching,
    OneSecondEarly,
    OneSecondLate,
    MoreThanOneSecondOff,
    NoCrossing,
    NoIgcFile,
    UnreadableIgcFile,
}

impl Outcome {
    pub const ALL: [Self; 7] = [
        Self::Matching,
        Self::OneSecondEarly,
        Self::OneSecondLate,
        Self::MoreThanOneSecondOff,
        Self::NoCrossing,
        Self::NoIgcFile,
        Self::UnreadableIgcFile,
    ];

    fn fails(self) -> bool {
        matches!(
            self,
            Self::MoreThanOneSecondOff | Self::NoCrossing | Self::UnreadableIgcFile
        )
    }
}

/// A row whose crossing fails its published time.
#[derive(Debug)]
pub struct RowMismatch {
    pub competition_id: String,
    pub line: Line,
    pub outcome: Outcome,
    pub published: Timestamp,
    /// The rounded crossing nearest the published time, if any.
    pub keyhole: Option<Timestamp>,
}

/// The rows of one class day, counted by line and outcome.
#[derive(Debug)]
pub struct DayTaskPoints {
    pub earth_model: EarthModel,
    pub time_zone: TimeZone,
    pub counts: BTreeMap<(Line, Outcome), usize>,
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
            line: mismatch.line,
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

/// The outcome of checking the line crossings of every class day of a
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
        let (id, line) = (&deviation.competition_id, line_name(deviation.line));
        writeln!(f, "  {day} {id} {line}: {}", deviation.explanation)?;
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
            for line in [Line::Start, Line::Finish] {
                if !day.counts.keys().any(|&(counted, _)| counted == line) {
                    continue;
                }
                let counts = Outcome::ALL.map(|outcome| {
                    let count = day.counts.get(&(line, outcome)).copied().unwrap_or(0);
                    format!("{} {count}", outcome_name(outcome))
                });
                writeln!(f, "  {}: {}", line_name(line), counts.join(", "))?;
            }
            for deviation in day.unexplained() {
                let (id, line) = (&deviation.competition_id, line_name(deviation.line));
                writeln!(f, "  {id} {line}: {}", deviation.explanation)?;
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

fn line_name(line: Line) -> &'static str {
    match line {
        Line::Start => "start",
        Line::Finish => "finish",
    }
}

fn outcome_name(outcome: Outcome) -> &'static str {
    match outcome {
        Outcome::Matching => "matching",
        Outcome::OneSecondEarly => "1 s early",
        Outcome::OneSecondLate => "1 s late",
        Outcome::MoreThanOneSecondOff => "more than 1 s off",
        Outcome::NoCrossing => "no crossing",
        Outcome::NoIgcFile => "no IGC file",
        Outcome::UnreadableIgcFile => "unreadable IGC file",
    }
}

/// Checks the line crossings of every class day under
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
        let crossings = check_day(&day, &name, &mut left_out);
        (name, crossings, left_out)
    });
    for (name, crossings, left_out) in days.collect::<Vec<_>>() {
        for (reason, count) in left_out {
            *report.left_out.entry(reason).or_default() += count;
        }
        match crossings {
            Ok(Some(mut crossings)) => {
                crossings.baseline = baseline.remove(&name).unwrap_or_default();
                report.checked.push((name, Ok(crossings)));
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
    let start = half_width(&task.start).map(|half_width| (Line::Start, half_width));
    let finish = half_width(&task.finish).map(|half_width| (Line::Finish, half_width));
    if start.is_none() {
        leave_out("start cylinder");
    }
    let lines: Vec<_> = start.into_iter().chain(finish).collect();
    if lines.is_empty() {
        return Ok(None);
    }
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
        for &(line, half_width) in &lines {
            let time = match line {
                Line::Start => row.start_time,
                Line::Finish => row.finish_time,
            };
            let Some(time) = time else { continue };
            let local = file.task_date.to_datetime(time);
            let published = day.time_zone.to_timestamp(local)?;
            let Some(path) = igc_files.get(&row.competition_id) else {
                *day.counts.entry((line, Outcome::NoIgcFile)).or_default() += 1;
                continue;
            };
            let igc_file = parsed.get_or_insert_with(|| read_igc_file(path).ok());
            let (outcome, keyhole) = match igc_file {
                Some(igc_file) => {
                    let keyhole = crossing_time(igc_file, &task, line, half_width, published)?;
                    (outcome(keyhole, published), keyhole)
                }
                None => (Outcome::UnreadableIgcFile, None),
            };
            *day.counts.entry((line, outcome)).or_default() += 1;
            if outcome.fails() {
                let competition_id = row.competition_id.clone();
                let mismatch = RowMismatch {
                    competition_id,
                    line,
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

/// How the rounded crossing nearest a published time compares with it.
fn outcome(keyhole: Option<Timestamp>, published: Timestamp) -> Outcome {
    match keyhole.map(|time| time.duration_since(published).as_secs()) {
        None => Outcome::NoCrossing,
        Some(0) => Outcome::Matching,
        Some(-1) => Outcome::OneSecondEarly,
        Some(1) => Outcome::OneSecondLate,
        Some(_) => Outcome::MoreThanOneSecondOff,
    }
}

/// Half the length of a line, or `None` for any other zone.
fn half_width(point: &TaskPoint<f64>) -> Option<f64> {
    match point.zone {
        ObservationZone::Line { length } => Some(length / 2.),
        ObservationZone::TwoArc { .. } => None,
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

/// The forward crossing of the default flight nearest `published` within half
/// the line plus the tolerance, rounded down at a start and up at a finish.
fn crossing_time(
    igc_file: &IgcFile,
    task: &Task<f64>,
    line: Line,
    half_width: f64,
    published: Timestamp,
) -> anyhow::Result<Option<Timestamp>> {
    let flights = igc_file.flights();
    let Some(flight) = choose_default_flight(&flights) else {
        return Ok(None);
    };
    let records = igc_file.records_between(flight.start.time(), flight.end.time());
    let (point, bearing, mode) = match line {
        Line::Start => (&task.start, task.start.direction, RoundMode::Floor),
        Line::Finish => (&task.finish, task.finish.direction + 180., RoundMode::Ceil),
    };
    let crossings = line_crossings(records, task.earth_model, point.reference_point, bearing);
    let crossings = crossings.into_iter();
    let crossings = crossings.filter(|crossing| crossing.along <= half_width + LINE_TOLERANCE);
    let nearest = crossings.min_by_key(|crossing| crossing.time.duration_since(published).abs());
    let rounding = TimestampRound::new().smallest(Unit::Second).mode(mode);
    let time = nearest.map(|crossing| crossing.time.round(rounding));
    Ok(time.transpose()?)
}
