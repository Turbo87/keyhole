//! The task info line SeeYou prints on a SoaringSpot results page, and the
//! rule set family the full-data suite infers from it.

use std::sync::LazyLock;

use keyhole_engine::rule_sets::{DAEC_SWO_2026, FAI_ANNEX_A_2025A, RuleSetEdition};
use regex::Regex;

use crate::fixture::PublishedDayParameters;

/// Extracts the task info line from `results.html`, with its segments
/// separated by line breaks.
pub(crate) fn task_info_line(results_html: &str) -> Option<String> {
    static TASK_INFO: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?s)Task info:</span><span>(.*?)</span>").unwrap());
    let line = TASK_INFO.captures(results_html)?.get(1)?.as_str();
    Some(
        line.replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&amp;", "&"),
    )
}

/// What a task info line states about the class day.
#[derive(Debug)]
pub(crate) struct TaskInfo {
    pub dm: Option<f64>,
    pub d1: Option<f64>,
    /// Whether the line says `handicapping enabled` or `no handicaps`.
    pub handicapped: Option<bool>,
    /// The day parameters, or `None` when the line publishes none.
    pub published: Option<PublishedDayParameters>,
    /// Whether the line names the DAeC scoring script.
    swo_script: bool,
    /// Whether the line has the parameter segments both scoring scripts print.
    parameter_line: bool,
}

impl TaskInfo {
    /// Parses a task info line, whose decimal separator is a comma or a point.
    pub(crate) fn parse(line: &str) -> Self {
        static POINTS: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new(r"Maximum Points: (\d+), F = (\d+(?:[.,]\d+)?), Fcr = (\d+(?:[.,]\d+)?)")
                .unwrap()
        });
        static DISTANCES: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new(
                r"Dm = (\d+(?:[.,]\d+)?) ?km, D1 = (\d+(?:[.,]\d+)?) ?km(?:, (handicapping enabled|no handicaps))?",
            )
            .unwrap()
        });
        static COUNTS: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new(r"\bN: (\d+), n1: (\d+), n2: (\d+), Do: (\d+(?:[.,]\d+)?) ?km, Vo: (\d+(?:[.,]\d+)?) ?km/h")
                .unwrap()
        });
        static SWO_SCRIPT: LazyLock<Regex> =
            LazyLock::new(|| Regex::new(r"DAeC-SWO\d{4} Script V[\d.]+").unwrap());

        let number = |text: &str| text.replace(',', ".").parse::<f64>().ok();
        let count = |text: &str| text.parse::<u32>().ok();
        let points = POINTS.captures(line);
        let distances = DISTANCES.captures(line);
        let counts = COUNTS.captures(line);
        let d1 = group(&distances, 2).and_then(number);
        let published = || {
            Some(PublishedDayParameters {
                d1: d1?,
                n: count(group(&counts, 1)?)?,
                n1: count(group(&counts, 2)?)?,
                n2: count(group(&counts, 3)?)?,
                d0: number(group(&counts, 4)?)?,
                v0: number(group(&counts, 5)?)?,
                f: group(&points, 2).and_then(number),
                fcr: group(&points, 3).and_then(number),
                maximum_points: group(&points, 1).and_then(number),
            })
        };
        Self {
            dm: group(&distances, 1).and_then(number),
            d1,
            handicapped: group(&distances, 3).map(|flag| flag == "handicapping enabled"),
            published: published(),
            swo_script: SWO_SCRIPT.is_match(line),
            parameter_line: distances.is_some() && counts.is_some(),
        }
    }
}

fn group<'line>(captures: &Option<regex::Captures<'line>>, index: usize) -> Option<&'line str> {
    Some(captures.as_ref()?.get(index)?.as_str())
}

/// The rule set family a competition's class days score under.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum RuleSetFamily {
    /// The current edition of the family.
    Edition(&'static RuleSetEdition),
    /// A competition whose task info lines name no parameters Keyhole can
    /// use, which the full-data suite skips.
    OutOfScope,
}

/// Competitions whose rule set family the task info line doesn't show. The DAeC
/// script only names itself from 2024, and before that it prints the same
/// parameter line as Annex A scoring. Australian and older South African
/// competitions print lines Keyhole can't read.
const SLUG_TABLE: &[(&str, RuleSetFamily)] = {
    use RuleSetFamily::{Edition, OutOfScope};
    const SWO: RuleSetFamily = Edition(&DAEC_SWO_2026);
    const ANNEX_A: RuleSetFamily = Edition(&FAI_ANNEX_A_2025A);
    &[
        ("dm-2022-zwickau", SWO),
        ("dm-frauen-landau-ebenberg-2022", SWO),
        ("euregiocup-2022", SWO),
        ("euregiocup-2023", SWO),
        ("dm2023bayreuth", SWO),
        ("dmj-edpa-2023", SWO),
        ("dm-clubklasse-burg-feuerstein-burg-feuerstein-2024", SWO),
        ("dm-zwickau-2024", SWO),
        ("dsmf24", SWO),
        ("dm-dosi-brb2025", SWO),
        ("dsmj2025", SWO),
        ("jenacup-2026-jena-schongleina-2026", SWO),
        ("wgc2021-club-std-15m-montlucon-gueret-2021", ANNEX_A),
        (
            "21st-fai-european-gliding-championships-pociunai-2022",
            ANNEX_A,
        ),
        ("4th-fai-world-gliding-championship-pociunai-2022", ANNEX_A),
        ("6th-fai-junior-european-gliding-championship-2023", ANNEX_A),
        (
            "12th-fai-womens-world-gliding-championship-garray-2023",
            ANNEX_A,
        ),
        (
            "38th-fai-world-gliding-championship-uvalde-garner-field-2024",
            ANNEX_A,
        ),
        (
            "7th-fai-junior-european-gliding-championships-prievidza-2025",
            ANNEX_A,
        ),
        ("south-african-nationals-2012", OutOfScope),
        ("south-african-national-championships-2013", OutOfScope),
        ("south-african-nationals-2014", OutOfScope),
        ("sa-gliding-nationals-2015-welkom-airfield-2015", OutOfScope),
        (
            "south-african-nationals-2015-welkom-airfield-2015",
            OutOfScope,
        ),
        (
            "2019-south-african-nationals-18m-open-and-sports-welkom-2019",
            OutOfScope,
        ),
        ("2020-south-african-nationals-welkom-2020", OutOfScope),
        ("2021-sa-nats", OutOfScope),
        (
            "2021-south-adfrican-nationals-18m-and-sports-welkom-2021",
            OutOfScope,
        ),
        ("2020-multiclass-nationals-tocumwal-2019", OutOfScope),
        (
            "2022-national-gliding-championships-narromine-2022",
            OutOfScope,
        ),
        (
            "2023-australian-national-championships-open-18m-sport",
            OutOfScope,
        ),
        ("2023-club-and-sports-nationals-kingaroy-2023", OutOfScope),
        (
            "2023-open-18m-15m-and-standard-nationals-benalla-2023",
            OutOfScope,
        ),
        (
            "2024-australian-national-multiclass-champs-lake-keepit-2024",
            OutOfScope,
        ),
        ("leeton-multiclass-nationals-2026", OutOfScope),
    ]
};

/// Infers the rule set family of a class day of the competition `slug` from
/// the scoring script its task info line names, then from the slug table, then
/// from the Annex A parameter line. `None` means the class day can't be
/// resolved.
pub(crate) fn rule_set_family(slug: &str, info: &TaskInfo) -> Option<RuleSetFamily> {
    if info.swo_script {
        return Some(RuleSetFamily::Edition(&DAEC_SWO_2026));
    }
    if let Some((_, family)) = SLUG_TABLE.iter().find(|(entry, _)| *entry == slug) {
        return Some(*family);
    }
    info.parameter_line
        .then_some(RuleSetFamily::Edition(&FAI_ANNEX_A_2025A))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SWO_LINE: &str =
        "Racing Task, Maximum Points: 907, F = 0,919, Fcr = 1,000, Max speed pts: 374
; Dm = 50km, D1 = 250km, handicapping enabled
; Use PEV disabled,  N: 34, n1: 25, n2: 21, Do: 266,00km, Vo: 84,99km/h
; DAeC-SWO2024 Script V9.06";

    const ANNEX_A_LINE: &str = "Racing Task, Maximum Points: 1000, F = 1.000, Fcr = 1.000, Max speed pts: 455
; Dm = 100km, D1 = 250km, no handicaps
; PEVWaitTime: 10min, PEVStartWindow: 5min, PreStart Alt = 1800m,  N: 41, n1: 39, n2: 28, Do: 421.94km, Vo: 94.78km/h
; cZ3qgWaTRcKI+39dv2h07lBOs2lnjOR4D1qpno+K51U";

    #[test]
    fn reads_the_line_from_a_results_page() {
        let html = "<p><span>Task info:</span><span>Day not valid\n; N: 3 &lt;= 25%</span></p>";

        assert_eq!(
            task_info_line(html).as_deref(),
            Some("Day not valid\n; N: 3 <= 25%")
        );
    }

    #[test]
    fn parses_decimal_commas() {
        let info = TaskInfo::parse(SWO_LINE);

        assert_eq!(info.dm, Some(50.));
        assert_eq!(info.d1, Some(250.));
        assert_eq!(info.handicapped, Some(true));
        let published = info.published.unwrap();
        assert_eq!(published.maximum_points, Some(907.));
        assert_eq!(published.f, Some(0.919));
        assert_eq!(published.fcr, Some(1.));
        assert_eq!(published.d1, 250.);
        assert_eq!((published.n, published.n1, published.n2), (34, 25, 21));
        assert_eq!(published.d0, 266.);
        assert_eq!(published.v0, 84.99);
    }

    #[test]
    fn parses_decimal_points() {
        let info = TaskInfo::parse(ANNEX_A_LINE);

        assert_eq!(info.handicapped, Some(false));
        let published = info.published.unwrap();
        assert_eq!(published.f, Some(1.));
        assert_eq!(published.d0, 421.94);
        assert_eq!(published.v0, 94.78);
    }

    #[test]
    fn invalid_day_publishes_no_maximum_points() {
        let info = TaskInfo::parse(
            "Day not valid - rule 8.2.1b
; Dm = 100km, D1 = 250km, handicapping enabled
; PEVWaitTime: 8min, PEVStartWindow: 5min,  N: 42, n1: 3, n2: 0, Do: 112.29km, Vo: 0.00km/h",
        );

        let published = info.published.unwrap();
        assert_eq!(published.maximum_points, None);
        assert_eq!(published.f, None);
        assert_eq!(published.n1, 3);
    }

    #[test]
    fn warning_publishes_nothing() {
        let info = TaskInfo::parse(
            "Warning: Number of competition pilots launched is zero\n; PEVStarts: OFF,",
        );

        assert_eq!((info.dm, info.d1, info.handicapped), (None, None, None));
        assert!(info.published.is_none());
    }

    fn family(slug: &str, line: &str) -> Option<RuleSetFamily> {
        rule_set_family(slug, &TaskInfo::parse(line))
    }

    #[test]
    fn scoring_script_names_the_swo() {
        assert_eq!(
            family("some-competition", SWO_LINE),
            Some(RuleSetFamily::Edition(&DAEC_SWO_2026))
        );
    }

    #[test]
    fn annex_a_parameter_line_without_a_script_is_annex_a() {
        assert_eq!(
            family("some-competition", ANNEX_A_LINE),
            Some(RuleSetFamily::Edition(&FAI_ANNEX_A_2025A))
        );
    }

    #[test]
    fn slug_table_wins_over_the_annex_a_parameter_line() {
        assert_eq!(
            family("dm2023bayreuth", ANNEX_A_LINE),
            Some(RuleSetFamily::Edition(&DAEC_SWO_2026))
        );
    }

    #[test]
    fn slug_table_resolves_a_line_without_parameters() {
        assert_eq!(
            family(
                "jenacup-2026-jena-schongleina-2026",
                "Error: Lowest handicap is zero!"
            ),
            Some(RuleSetFamily::Edition(&DAEC_SWO_2026))
        );
    }

    #[test]
    fn slug_table_lists_competitions_out_of_scope() {
        assert_eq!(
            family(
                "leeton-multiclass-nationals-2026",
                "Maximum Points: 1000, Pvmax: 600, Pdmax: 400"
            ),
            Some(RuleSetFamily::OutOfScope)
        );
    }

    #[test]
    fn unknown_competition_without_parameters_is_unresolved() {
        assert_eq!(family("some-competition", ""), None);
        assert_eq!(
            family(
                "some-competition",
                "Maximum Points: 422\n; Day factor = 0,395, Completion factor = 1,000"
            ),
            None
        );
    }
}
