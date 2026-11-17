//! The rule set family a downloaded class day was scored under, inferred from
//! its competition and its task info line.

use std::sync::LazyLock;

use anyhow::bail;
use keyhole_engine::rule_sets::{DAEC_SWO_2026, FAI_ANNEX_A_2025A, RuleSetEdition};
use regex::Regex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuleSetFamily {
    DaecSwo,
    FaiAnnexA,
}

impl RuleSetFamily {
    /// The family's current shipped edition, which every class day of the
    /// family scores under.
    pub fn edition(self) -> &'static RuleSetEdition {
        match self {
            Self::DaecSwo => &DAEC_SWO_2026,
            Self::FaiAnnexA => &FAI_ANNEX_A_2025A,
        }
    }
}

/// How the full-data suite treats a downloaded class day.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Inference {
    Family(RuleSetFamily),
    /// Left out for the given reason, since the competition used neither
    /// family.
    LeftOut(&'static str),
}

/// Infers the family from the competition's entry in the slug table, then the
/// SWO script named in the task info line, then the parameter line that
/// SeeYou's Annex A script writes.
pub fn infer_rule_set_family(competition: &str, task_info_line: &str) -> anyhow::Result<Inference> {
    static SWO_SCRIPT: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\bDAeC-SWO\d{4} Script V").unwrap());
    static PARAMETER_LINE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\bDm = [\d.,]+ ?km, D1 = [\d.,]+ ?km").unwrap());

    if let Some(inference) = listed(competition) {
        Ok(inference)
    } else if SWO_SCRIPT.is_match(task_info_line) {
        Ok(Inference::Family(RuleSetFamily::DaecSwo))
    } else if PARAMETER_LINE.is_match(task_info_line) {
        Ok(Inference::Family(RuleSetFamily::FaiAnnexA))
    } else {
        bail!(
            "cannot infer the rule set family of {competition} from a slug table entry, an SWO \
             script or an Annex A parameter line"
        );
    }
}

/// Competitions whose task info lines don't reveal their family on every day,
/// and competitions under national rules. SWO scripts before 2024 write the
/// Annex A parameter line without naming themselves, and a day without
/// launches states neither.
fn listed(competition: &str) -> Option<Inference> {
    use Inference::{Family, LeftOut};
    use RuleSetFamily::{DaecSwo, FaiAnnexA};

    Some(match competition {
        "dm-2022-zwickau"
        | "dm-clubklasse-burg-feuerstein-burg-feuerstein-2024"
        | "dm-dosi-brb2025"
        | "dm-frauen-landau-ebenberg-2022"
        | "dm-zwickau-2024"
        | "dm2023bayreuth"
        | "dmj-edpa-2023"
        | "dsmf24"
        | "dsmj2025"
        | "euregiocup-2022"
        | "euregiocup-2023"
        | "jenacup-2026-jena-schongleina-2026" => Family(DaecSwo),
        "12th-fai-womens-world-gliding-championship-garray-2023"
        | "21st-fai-european-gliding-championships-pociunai-2022"
        | "38th-fai-world-gliding-championship-uvalde-garner-field-2024"
        | "4th-fai-world-gliding-championship-pociunai-2022"
        | "6th-fai-junior-european-gliding-championship-2023"
        | "7th-fai-junior-european-gliding-championships-prievidza-2025"
        | "wgc2021-club-std-15m-montlucon-gueret-2021" => Family(FaiAnnexA),
        "2020-multiclass-nationals-tocumwal-2019"
        | "2022-national-gliding-championships-narromine-2022"
        | "2023-australian-national-championships-open-18m-sport"
        | "2023-club-and-sports-nationals-kingaroy-2023"
        | "2023-open-18m-15m-and-standard-nationals-benalla-2023"
        | "2024-australian-national-multiclass-champs-lake-keepit-2024"
        | "leeton-multiclass-nationals-2026" => LeftOut("Australian national rules"),
        "2019-south-african-nationals-18m-open-and-sports-welkom-2019"
        | "2020-south-african-nationals-welkom-2020"
        | "2021-sa-nats"
        | "2021-south-adfrican-nationals-18m-and-sports-welkom-2021"
        | "2022-south-african-nationals-15m-club-and-2-seater"
        | "2022-south-african-nationals-18m-and-sports-kroonstad-2022"
        | "sa-gliding-nationals-2015-welkom-airfield-2015"
        | "sanats-2023-welkom"
        | "sanats-2025"
        | "sanats2023potch"
        | "sanats2024potch"
        | "sanats2026"
        | "south-african-national-championships-2013"
        | "south-african-nationals-2012"
        | "south-african-nationals-2014"
        | "south-african-nationals-2015-welkom-airfield-2015" => {
            LeftOut("South African national rules")
        }
        _ => return None,
    })
}
