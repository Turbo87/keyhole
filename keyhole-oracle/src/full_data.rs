//! The opt-in full-data suite: the oracle harness over every class day of a
//! local soaringspot-downloader output.

use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use anyhow::{Context, bail};
use regex::Regex;
use serde::Deserialize;

use crate::comparison::{Field, Mismatch, Report, check};
use crate::decisions::Cause;
use crate::fixture::{Deviation, EarthModel, Fixture, FixtureFile, RuleOverrides};
use crate::rule_set_family::{Inference, infer_rule_set_family};
use crate::task_info::TaskInfo;

/// Competitions scored with SeeYou scripts before 9.01, which divide by the
/// unrounded lowest handicap. Keyhole has no compatibility mode for that.
const PREVIOUS_HANDICAP_REFERENCE: [&str; 2] = [
    "10th-fai-womens-world-gliding-championship-lake-keepit-2020",
    "wgc2021-club-std-15m-montlucon-gueret-2021",
];

/// Class days whose `task.json` lists task points after the finish, such as
/// the PEV start points of dmj-edpa-2023.
const TASK_POINTS_PAST_THE_FINISH: [&str; 1] = ["dmj-edpa-2023/standard/2023-05-27"];

/// Competitions and classes scored on the FAI Sphere, which neither the task
/// info line nor `task.json` states. Only the 20 m multi-seat class of
/// egc2023 used it.
const FAI_SPHERE: [&str; 11] = [
    "11th-fai-womens-world-gliding-championship-2022",
    "13th-fai-womens-world-gliding-championship-zbraslavice-2025",
    "22nd-fai-european-gliding-championships-tabor-2024",
    "37th-fai-world-gliding-championships-2022-szeged-2022",
    "37th-fai-world-gliding-championships-narromine-2023",
    "38th-fai-world-gliding-championship-uvalde-garner-field-2024",
    "39th-fai-world-gliding-championships-tabor-2025",
    "6th-fai-junior-european-gliding-championship-2023",
    "7th-fai-junior-european-gliding-championships-prievidza-2025",
    "egc2023/20m-multi-seat",
    "junior-world-gliding-championships-2022-tabor-2022",
];

/// The baseline inside a dataset directory, which accept mode writes.
const BASELINE: &str = "keyhole-oracle-baseline.toml";

/// Mismatches that a dataset's checks accept, by class day.
pub type Baseline = BTreeMap<String, Vec<Deviation>>;

/// The outcome of checking every class day of a dataset.
#[derive(Debug, Default)]
pub struct DatasetReport {
    /// The report of each checked class day, or the error that stopped its
    /// check, by its `<competition>/<class>/<date>` path.
    pub checked: Vec<(String, anyhow::Result<Report>)>,
    /// The number of class days left out, by reason.
    pub left_out: BTreeMap<&'static str, usize>,
    /// Baseline rows of class days that weren't checked, by class day.
    pub unchecked_baseline: Baseline,
}

impl DatasetReport {
    pub fn passes(&self) -> bool {
        let checked = self.checked.iter().all(|(_, report)| passes(report));
        checked && self.unchecked_baseline.is_empty()
    }

    /// Writes every mismatch of the checked class days except the allowed
    /// failures as the baseline of the dataset in `directory`.
    pub fn write_baseline(&self, directory: &Path) -> anyhow::Result<()> {
        let errors = self.checked.iter().filter(|(_, report)| report.is_err());
        let errors = errors.count();
        if errors > 0 {
            bail!("accept mode writes no baseline while class days have errors: {errors}");
        }
        let mut baseline = Baseline::new();
        for (day, report) in &self.checked {
            let Ok(report) = report else { continue };
            let mismatches = report.day_parameter_mismatches.iter();
            let deviations: Vec<_> = mismatches
                .chain(&report.row_mismatches)
                .filter(|mismatch| !allowed(mismatch))
                .map(|mismatch| Deviation {
                    competition_id: mismatch.competition_id.clone(),
                    field: mismatch.field,
                    explanation: values(mismatch),
                })
                .collect();
            if !deviations.is_empty() {
                baseline.insert(day.clone(), deviations);
            }
        }
        let path = directory.join(BASELINE);
        let baseline = toml::to_string(&baseline).context("serializing the baseline")?;
        fs::write(&path, baseline).with_context(|| format!("writing {}", path.display()))
    }

    /// Whether each row with a remark of unknown effect matches anyway.
    fn unknown_effect_rows(&self) -> impl Iterator<Item = bool> {
        let reports = self.checked.iter();
        let reports = reports.filter_map(|(_, report)| report.as_ref().ok());
        reports.flat_map(|report| {
            let rows = report.unknown_effect_rows.iter();
            rows.map(move |competition_id| !has_row_mismatch(report, competition_id))
        })
    }
}

fn has_row_mismatch(report: &Report, competition_id: &String) -> bool {
    let mut ids = report
        .row_mismatches
        .iter()
        .map(|mismatch| &mismatch.competition_id);
    ids.any(|id| id.as_ref() == Some(competition_id))
}

fn passes(report: &anyhow::Result<Report>) -> bool {
    report.as_ref().is_ok_and(day_passes)
}

/// Whether every mismatch of a class day is a recorded deviation or an allowed
/// failure, and every recorded deviation still occurs.
fn day_passes(report: &Report) -> bool {
    report.stale_deviations.is_empty() && failures(report).next().is_none()
}

/// The mismatches that are neither recorded deviations nor allowed failures.
fn failures(report: &Report) -> impl Iterator<Item = &Mismatch> {
    unexplained(report).filter(|mismatch| !allowed(mismatch))
}

/// The mismatches without a baseline row, or whose values differ from the
/// values their baseline row records.
fn unexplained(report: &Report) -> impl Iterator<Item = &Mismatch> {
    let mismatches = report.day_parameter_mismatches.iter();
    let mismatches = mismatches.chain(&report.row_mismatches);
    mismatches.filter(|mismatch| mismatch.explanation.as_ref() != Some(&values(mismatch)))
}

/// The values of a mismatch, which its baseline row records as explanation.
fn values(mismatch: &Mismatch) -> String {
    let (published, keyhole) = (&mismatch.published, &mismatch.keyhole);
    format!("published {published}, Keyhole {keyhole}")
}

/// Whether a mismatch is an allowed failure, which only a row with a remark
/// of unknown effect can have.
fn allowed(mismatch: &Mismatch) -> bool {
    mismatch.cause == Some(Cause::RemarkOfUnknownEffect)
}

/// Mismatches with the class day each occurs on, by field and cause.
type Groups<'a> = BTreeMap<(Field, Option<Cause>), Vec<(&'a str, &'a Mismatch)>>;

fn write_groups(f: &mut fmt::Formatter<'_>, groups: &Groups) -> fmt::Result {
    for ((field, cause), mismatches) in groups {
        match cause {
            Some(cause) => write!(f, "{field}, {cause}")?,
            None => write!(f, "{field}")?,
        }
        writeln!(f, " ({}):", mismatches.len())?;
        for (day, mismatch) in mismatches {
            let row = row_suffix(&mismatch.competition_id);
            let (published, keyhole) = (&mismatch.published, &mismatch.keyhole);
            writeln!(f, "  {day}{row}: published {published}, Keyhole {keyhole}")?;
        }
    }
    Ok(())
}

fn write_baseline_rows<'a>(
    f: &mut fmt::Formatter<'_>,
    heading: &str,
    rows: impl Iterator<Item = (&'a String, &'a Deviation)>,
) -> fmt::Result {
    let rows: Vec<_> = rows.collect();
    if !rows.is_empty() {
        writeln!(f, "{heading} ({}):", rows.len())?;
    }
    for (day, deviation) in rows {
        let row = row_suffix(&deviation.competition_id);
        let (field, explanation) = (deviation.field, &deviation.explanation);
        writeln!(f, "  {day}{row} {field}: {explanation}")?;
    }
    Ok(())
}

/// The baseline rows of one class day, each with its class day.
fn day_rows<'a>(
    (day, deviations): (&'a String, &'a Vec<Deviation>),
) -> impl Iterator<Item = (&'a String, &'a Deviation)> {
    deviations.iter().map(move |deviation| (day, deviation))
}

/// The competition ID after a class day, or nothing for a day parameter.
fn row_suffix(competition_id: &Option<String>) -> String {
    competition_id
        .as_ref()
        .map_or(String::new(), |id| format!(" {id}"))
}

impl fmt::Display for DatasetReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (mut failing, mut allowed_failures) = (Groups::new(), Groups::new());
        for (day, report) in &self.checked {
            let Ok(report) = report else { continue };
            for mismatch in unexplained(report) {
                let groups = if allowed(mismatch) {
                    &mut allowed_failures
                } else {
                    &mut failing
                };
                let group = groups.entry((mismatch.field, mismatch.cause));
                group.or_default().push((day, mismatch));
            }
        }
        write_groups(f, &failing)?;
        if !allowed_failures.is_empty() {
            writeln!(f, "Allowed failures:")?;
            write_groups(f, &allowed_failures)?;
        }
        let stale = self
            .checked
            .iter()
            .filter_map(|(day, report)| Some((day, &report.as_ref().ok()?.stale_deviations)));
        let heading = "Baseline rows that no longer occur";
        write_baseline_rows(f, heading, stale.flat_map(day_rows))?;
        let heading = "Baseline rows of class days that weren't checked";
        write_baseline_rows(
            f,
            heading,
            self.unchecked_baseline.iter().flat_map(day_rows),
        )?;
        for (day, report) in &self.checked {
            if let Err(error) = report {
                writeln!(f, "{day}: {error:#}")?;
            }
        }
        let checked = self.checked.len();
        let failing = self
            .checked
            .iter()
            .filter(|(_, report)| !passes(report))
            .count();
        writeln!(f, "Checked class days: {checked}, failing: {failing}")?;
        let remarked = self.unknown_effect_rows().count();
        let matching = self
            .unknown_effect_rows()
            .filter(|matches| *matches)
            .count();
        writeln!(
            f,
            "Rows with remarks of unknown effect: {remarked}, matching anyway: {matching}"
        )?;
        for (reason, count) in &self.left_out {
            writeln!(f, "Left out class days ({reason}): {count}")?;
        }
        Ok(())
    }
}

/// Checks every class day under `<competition>/<class>/<date>` in a dataset
/// directory. A class day that can't be checked fails the report instead of
/// stopping the run.
pub fn check_dataset(directory: &Path) -> anyhow::Result<DatasetReport> {
    let path = directory.display();
    if !directory.is_dir() {
        bail!("the dataset directory {path} doesn't exist");
    }
    let days = class_days(directory)?;
    if days.is_empty() {
        bail!("the dataset directory {path} holds no class days");
    }

    let path = directory.join(BASELINE);
    let mut baseline = match fs::read_to_string(&path) {
        Ok(baseline) => {
            toml::from_str(&baseline).with_context(|| format!("parsing {}", path.display()))?
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Baseline::new(),
        Err(error) => Err(error).with_context(|| format!("reading {}", path.display()))?,
    };

    let mut report = DatasetReport::default();
    for day in days {
        let name = day.strip_prefix(directory)?;
        let competition = name.iter().next().unwrap().to_string_lossy();
        let name = name.display().to_string();
        match check_class_day(&day, &competition, &mut baseline, &name) {
            Ok(ClassDay::Scored(day_report)) => report.checked.push((name, Ok(day_report))),
            Ok(ClassDay::LeftOut(reason)) => *report.left_out.entry(reason).or_default() += 1,
            Err(error) => report.checked.push((name, Err(error))),
        }
    }
    report.unchecked_baseline = baseline;
    Ok(report)
}

fn class_days(directory: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut directories = vec![directory.to_path_buf()];
    for _ in 0..3 {
        let mut subdirectories = Vec::new();
        for directory in &directories {
            let entries = fs::read_dir(directory)
                .with_context(|| format!("reading {}", directory.display()))?;
            for entry in entries {
                let path = entry?.path();
                if path.is_dir() {
                    subdirectories.push(path);
                }
            }
        }
        directories = subdirectories;
    }
    directories.sort();
    Ok(directories)
}

enum ClassDay {
    Scored(Report),
    LeftOut(&'static str),
}

/// The part of `task.json` that decides whether a class day is scored.
#[derive(Deserialize)]
struct DayStatus {
    result_status: String,
}

fn check_class_day(
    directory: &Path,
    competition: &str,
    baseline: &mut Baseline,
    name: &str,
) -> anyhow::Result<ClassDay> {
    let read = |name| {
        let path = directory.join(name);
        fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))
    };
    let task_json = read("task.json")?;
    let status: DayStatus = serde_json::from_str(&task_json).context("parsing task.json")?;
    if status.result_status == "cancelled" {
        return Ok(ClassDay::LeftOut("cancelled"));
    }
    if TASK_POINTS_PAST_THE_FINISH.contains(&name) {
        return Ok(ClassDay::LeftOut("task points past the finish"));
    }
    let page = read("results.html")?;
    let line = task_info_line(&page);
    let family = match infer_rule_set_family(competition, line)? {
        Inference::Family(family) => family,
        Inference::LeftOut(reason) => return Ok(ClassDay::LeftOut(reason)),
    };
    let info = TaskInfo::parse(line)?;
    let file = FixtureFile {
        rule_set: family.edition().id.into(),
        original_rule_set: None,
        handicapped: info.handicapped,
        rule_overrides: RuleOverrides {
            earth_model: earth_model(name),
            dm: info.dm,
            d1: info.d1,
        },
        published_day_parameters: info.day_parameters,
        decisions: BTreeMap::new(),
        deviations: Vec::new(),
    };
    let mut fixture = Fixture::with_file(&task_json, &read("results.csv")?, file)?;
    let has_handicaps = fixture.rows.iter().any(|row| row.handicap.is_some());
    if fixture.file.handicapped && !has_handicaps {
        return Ok(ClassDay::LeftOut("handicapped without a Handicap column"));
    }
    // Older task info lines don't state the handicapping flag, so the column
    // decides.
    if has_handicaps && PREVIOUS_HANDICAP_REFERENCE.contains(&competition) {
        return Ok(ClassDay::LeftOut("SeeYou's pre-9.01 handicap reference"));
    }
    fixture.file.deviations = baseline.remove(name).unwrap_or_default();
    Ok(ClassDay::Scored(check(&fixture)?))
}

/// The earth model of a `<competition>/<class>/<date>` class day, or `None`
/// for the edition's default.
fn earth_model(day: &str) -> Option<EarthModel> {
    let (class, _) = day.rsplit_once('/')?;
    let (competition, _) = class.split_once('/')?;
    let listed = FAI_SPHERE.contains(&competition) || FAI_SPHERE.contains(&class);
    listed.then_some(EarthModel::FaiSphere)
}

/// The task info line of `results.html`, or an empty line without one.
fn task_info_line(page: &str) -> &str {
    static TASK_INFO: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?s)Task info:</span><span>(.*?)</span>").unwrap());
    TASK_INFO
        .captures(page)
        .map_or("", |captures| captures.get(1).unwrap().as_str())
}
