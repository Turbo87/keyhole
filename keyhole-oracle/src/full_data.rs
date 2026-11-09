//! The full-data suite: every class day of a local soaringspot-downloader
//! output, checked against a baseline of mismatches stored with the download.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, bail};
use serde::Deserialize;

use crate::comparison::{Field, check};
use crate::fixture::{Fixture, FixtureClass, FixtureFile, FixtureHandicapScale};
use crate::published::{PublishedRow, PublishedTask, parse_results};
use crate::task_info::{RuleSetFamily, TaskInfo, rule_set_family, task_info_line};

/// The file inside the download that holds the accepted mismatches.
const BASELINE_FILE: &str = "keyhole-oracle-baseline.txt";

/// Whether a run gates on the stored baseline or replaces it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Baseline {
    /// Fails on mismatches missing from the baseline and on baseline entries
    /// that no longer occur.
    Gate,
    /// Writes the current mismatches as the baseline.
    Accept,
}

/// Scores every class day below `directory`, laid out as
/// `<competition>/<class>/<date>/`, and compares the mismatches with the
/// download's baseline.
pub fn check_download(directory: &Path, baseline: Baseline) -> anyhow::Result<DownloadReport> {
    let class_days = class_day_directories(directory)?;
    if class_days.is_empty() {
        bail!("{} holds no class days", directory.display());
    }

    let mut report = DownloadReport::default();
    let mut unresolved = Vec::new();
    for class_day in &class_days {
        let name = class_day
            .strip_prefix(directory)
            .expect("class days lie below the download")
            .to_string_lossy()
            .into_owned();
        match check_class_day(&name, class_day) {
            Ok(ClassDayOutcome::Unresolved) => unresolved.push(name),
            Ok(ClassDayOutcome::LeftOut(reason)) => {
                *report.left_out.entry(reason).or_default() += 1
            }
            Ok(ClassDayOutcome::Checked(checked)) => report.add(checked),
            Err(error) => report.add(CheckedClassDay {
                entries: vec![Entry {
                    line: format!("{name} error: {error:#}"),
                    group: Group::Error(format!("{error:#}")),
                }],
            }),
        }
    }
    if !unresolved.is_empty() {
        bail!(
            "the rule set family of these class days can't be resolved:\n{}",
            unresolved.join("\n")
        );
    }

    let baseline_path = directory.join(BASELINE_FILE);
    let current: BTreeSet<_> = report
        .entries
        .iter()
        .map(|entry| entry.line.clone())
        .collect();
    match baseline {
        Baseline::Accept => {
            let contents: String = current.iter().map(|line| format!("{line}\n")).collect();
            fs::write(&baseline_path, contents)
                .with_context(|| format!("writing {}", baseline_path.display()))?;
        }
        Baseline::Gate => {
            let accepted = match fs::read_to_string(&baseline_path) {
                Ok(contents) => contents.lines().map(String::from).collect(),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    report.baseline_missing = true;
                    BTreeSet::new()
                }
                Err(error) => {
                    return Err(error)
                        .with_context(|| format!("reading {}", baseline_path.display()));
                }
            };
            report.new = current.difference(&accepted).cloned().collect();
            report.resolved = accepted.difference(&current).cloned().collect();
        }
    }
    Ok(report)
}

fn class_day_directories(directory: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut directories = vec![directory.to_path_buf()];
    for _ in 0..3 {
        let mut children = Vec::new();
        for parent in &directories {
            let entries = fs::read_dir(parent)
                .with_context(|| format!("reading the download directory {}", parent.display()))?;
            for entry in entries {
                let path = entry?.path();
                if path.is_dir() {
                    children.push(path);
                }
            }
        }
        directories = children;
    }
    directories.sort();
    Ok(directories)
}

/// Why the suite leaves a class day out.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum LeftOut {
    Cancelled,
    HandicappedWithoutHandicapColumn,
    PreviousHandicapReference,
    OutOfScope,
}

impl fmt::Display for LeftOut {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Cancelled => "cancelled",
            Self::HandicappedWithoutHandicapColumn => "handicapped without a Handicap column",
            Self::PreviousHandicapReference => {
                "scored with the handicap reference before SeeYou 9.01"
            }
            Self::OutOfScope => "competition out of scope",
        })
    }
}

enum ClassDayOutcome {
    LeftOut(LeftOut),
    Unresolved,
    Checked(CheckedClassDay),
}

#[derive(Default)]
struct CheckedClassDay {
    entries: Vec<Entry>,
}

/// Competitions whose handicapped class days SeeYou scored with the handicap
/// reference of its scripts before 9.01.
const PREVIOUS_HANDICAP_REFERENCE: &[&str] = &[
    "wgc2021-club-std-15m-montlucon-gueret-2021",
    "10th-fai-womens-world-gliding-championship-lake-keepit-2020",
];

#[derive(Deserialize)]
struct ClassDayStatus {
    result_status: String,
}

fn check_class_day(name: &str, directory: &Path) -> anyhow::Result<ClassDayOutcome> {
    let read = |file| {
        let path = directory.join(file);
        fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))
    };
    let task_json = read("task.json")?;
    let status: ClassDayStatus = serde_json::from_str(&task_json).context("parsing task.json")?;
    if status.result_status == "cancelled" {
        return Ok(ClassDayOutcome::LeftOut(LeftOut::Cancelled));
    }

    let line = task_info_line(&read("results.html")?).unwrap_or_default();
    let info = TaskInfo::parse(&line);
    let competition = name.split('/').next().unwrap_or_default();
    let edition = match rule_set_family(competition, &info) {
        None => return Ok(ClassDayOutcome::Unresolved),
        Some(RuleSetFamily::OutOfScope) => {
            return Ok(ClassDayOutcome::LeftOut(LeftOut::OutOfScope));
        }
        Some(RuleSetFamily::Edition(edition)) => edition,
    };

    let mut rows = parse_results(&read("results.csv")?).context("parsing results.csv")?;
    let handicap_column = rows.iter().any(|row| row.handicap.is_some());
    let handicapped = info.handicapped.unwrap_or(handicap_column);
    if handicapped && PREVIOUS_HANDICAP_REFERENCE.contains(&competition) {
        return Ok(ClassDayOutcome::LeftOut(LeftOut::PreviousHandicapReference));
    }
    if handicapped && !handicap_column {
        return Ok(ClassDayOutcome::LeftOut(
            LeftOut::HandicappedWithoutHandicapColumn,
        ));
    }
    let (Some(dm), Some(d1)) = (info.dm, info.d1) else {
        bail!("the task info line names no Dm and D1");
    };
    let Some(published_day_parameters) = info.published else {
        bail!("the task info line publishes no day parameters");
    };

    let task = serde_json::from_str::<PublishedTask>(&task_json)
        .context("parsing task.json")?
        .task()?;
    let handicap_scale = handicapped.then(|| handicap_scale(&mut rows));
    let file = FixtureFile {
        edition: edition.id.into(),
        flown_under: "unknown".into(),
        class: FixtureClass {
            dm,
            d1,
            handicapped,
            handicap_scale,
            rule_overrides: Default::default(),
        },
        class_day: Default::default(),
        published_day_parameters,
        decisions: BTreeMap::new(),
        deviations: Vec::new(),
    };
    let fixture = Fixture::new(task, rows, file)?;
    let report = check(&fixture)?;

    let day_parameters_differ = !report.day_parameter_mismatches.is_empty();
    let entries = report
        .day_parameter_mismatches
        .iter()
        .map(|mismatch| Entry {
            line: format!(
                "{name} {}: published {}, Keyhole {}",
                mismatch.field, mismatch.published, mismatch.keyhole
            ),
            group: Group::Mismatch(mismatch.field, Cause::DayParameter),
        })
        .collect();
    let mut checked = CheckedClassDay { entries };
    for mismatch in &report.row_mismatches {
        let competition_id = mismatch
            .competition_id
            .as_deref()
            .expect("row mismatches name their row");
        let row = fixture
            .rows
            .iter()
            .find(|row| row.competition_id == competition_id)
            .expect("row mismatches name a published row");
        let line = format!(
            "{name} {competition_id} {}: published {}, Keyhole {}",
            mismatch.field, mismatch.published, mismatch.keyhole
        );
        let cause = if day_parameters_differ {
            Cause::DayParameterMismatch
        } else {
            Cause::of(row)
        };
        checked.entries.push(Entry {
            line,
            group: Group::Mismatch(mismatch.field, cause),
        });
    }
    Ok(ClassDayOutcome::Checked(checked))
}

/// Reads the scale of a handicapped class from its Handicap column. Values on
/// the 1000 scale, which SeeYou divides by 1000, are converted to the 1.000
/// scale.
fn handicap_scale(rows: &mut [PublishedRow]) -> FixtureHandicapScale {
    let largest = rows
        .iter()
        .filter_map(|row| row.handicap)
        .fold(0., f64::max);
    if largest < 10. {
        FixtureHandicapScale::One
    } else if largest < 500. {
        FixtureHandicapScale::Hundred
    } else {
        for handicap in rows.iter_mut().filter_map(|row| row.handicap.as_mut()) {
            *handicap /= 1000.;
        }
        FixtureHandicapScale::One
    }
}

/// What a row mismatch most likely follows from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Cause {
    DayParameter,
    DayParameterMismatch,
    DidNotFly,
    LaunchedWithoutStart,
    HorsConcours,
    Penalty,
    Finisher,
    NonFinisher,
}

impl Cause {
    fn of(row: &PublishedRow) -> Self {
        match row.rank.as_str() {
            "DNF" => Self::DidNotFly,
            "DNS" => Self::LaunchedWithoutStart,
            "HC" => Self::HorsConcours,
            _ if row.penalty_points.is_some_and(|points| points != 0.) => Self::Penalty,
            _ if row.finish_time.is_some() => Self::Finisher,
            _ => Self::NonFinisher,
        }
    }
}

impl fmt::Display for Cause {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::DayParameter => "day parameter",
            Self::DayParameterMismatch => "after a day parameter mismatch",
            Self::DidNotFly => "DNF row",
            Self::LaunchedWithoutStart => "DNS row",
            Self::HorsConcours => "hors concours row",
            Self::Penalty => "row with a penalty",
            Self::Finisher => "finisher",
            Self::NonFinisher => "non-finisher",
        })
    }
}

/// How the report groups a mismatch or error.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum Group {
    Mismatch(Field, Cause),
    Error(String),
}

impl fmt::Display for Group {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Mismatch(field, cause) => write!(f, "{field}, {cause}"),
            Self::Error(error) => write!(f, "error: {error}"),
        }
    }
}

/// One mismatch or class day error, as a line of the baseline.
#[derive(Debug)]
struct Entry {
    line: String,
    group: Group,
}

/// The outcome of checking a download.
#[derive(Debug, Default)]
pub struct DownloadReport {
    checked: usize,
    left_out: BTreeMap<LeftOut, usize>,
    entries: Vec<Entry>,
    /// Whether the download has no baseline yet.
    baseline_missing: bool,
    /// Mismatches and errors missing from the baseline.
    new: Vec<String>,
    /// Baseline entries that no longer occur.
    resolved: Vec<String>,
}

impl DownloadReport {
    /// Whether the mismatches and errors are exactly the baseline's.
    pub fn passes(&self) -> bool {
        self.new.is_empty() && self.resolved.is_empty()
    }

    fn add(&mut self, checked: CheckedClassDay) {
        self.checked += 1;
        self.entries.extend(checked.entries);
    }
}

/// How many example lines the report shows per group.
const EXAMPLES: usize = 3;

impl fmt::Display for DownloadReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "Checked {} class days.", self.checked)?;
        for (reason, count) in &self.left_out {
            writeln!(f, "Left out {count} class days: {reason}.")?;
        }

        let mut groups: BTreeMap<&Group, Vec<&str>> = BTreeMap::new();
        for entry in &self.entries {
            groups.entry(&entry.group).or_default().push(&entry.line);
        }
        if !groups.is_empty() {
            writeln!(f, "Mismatches and errors by field and cause:")?;
        }
        for (group, lines) in groups {
            writeln!(f, "  {group}: {}", lines.len())?;
            for line in lines.iter().take(EXAMPLES) {
                writeln!(f, "    {line}")?;
            }
        }

        if self.baseline_missing {
            writeln!(
                f,
                "The download has no {BASELINE_FILE} yet. Accept mode writes the {} entries above as its baseline.",
                self.entries.len()
            )?;
        } else if !self.new.is_empty() {
            writeln!(f, "Not in the baseline:")?;
            for line in &self.new {
                writeln!(f, "  {line}")?;
            }
        }
        if !self.resolved.is_empty() {
            writeln!(f, "In the baseline but no longer occurring:")?;
            for line in &self.resolved {
                writeln!(f, "  {line}")?;
            }
        }
        Ok(())
    }
}
