//! The built-in rule set editions and the resolution of a class day's
//! effective parameters from its edition and rule overrides.

use std::fmt::{self, Display};
use std::ops::RangeInclusive;

use sha2::{Digest, Sha256};

use crate::day_scoring::ScoringParameters;

/// One dated version of a rule set, shipped as immutable data.
///
/// Only the engine constructs editions, so every edition is a built-in one.
#[derive(Debug, PartialEq)]
#[non_exhaustive]
pub struct RuleSetEdition {
    pub id: &'static str,
    /// The earth models the edition allows. Resolution applies any other
    /// earth model too, since a competition may depart from its edition.
    pub earth_models: &'static [EarthModel],
    pub class_templates: &'static [ClassTemplate],
    pub pev: PevRules,
    pub default_zones: DefaultZones,
    pub task_design_limits: TaskDesignLimits,
    /// The number of leading overall places in which ties are broken by
    /// counting daily first places, then second places and so on, with 0 for
    /// no countback.
    pub countback_places: u8,
    /// The time after a publication within which it can be challenged, in
    /// whole hours, which the suggested complaint deadline is based on.
    pub complaint_period: u32,
    /// The effective parameters without any rule overrides. `Dm` and `D1`
    /// default to the lowest class's values, since the edition has no
    /// default of its own for them.
    pub defaults: Rules,
}

pub static DAEC_SWO_2026: RuleSetEdition = RuleSetEdition {
    id: "DAeC SWO 2026",
    earth_models: &[EarthModel::Wgs84],
    class_templates: &[
        ClassTemplate::new("15m", 120., 300., false, Some(DAEC_15M)),
        ClassTemplate::new("18m", 140., 350., false, Some(DAEC_18M)),
        ClassTemplate::new("Club", 100., 250., true, Some(IGC_CLUB)),
        ClassTemplate::new("Doppelsitzer", 120., 300., true, Some(IGC_20M)),
        ClassTemplate::new("Offene", 140., 350., false, Some(DAEC_OFFENE)),
        ClassTemplate::new("Standard", 120., 300., false, Some(DAEC_STANDARD)),
    ],
    pev: PevRules {
        wait_times: 10..=10,
        start_windows: 7..=7,
        limit: 3,
        limit_scope: PevLimitScope::Day,
        clustering_time: 30,
        penalty_per_second: 1,
        maximum_penalty: 60,
    },
    default_zones: DefaultZones {
        start: Some(ObservationZone::Line { length: 20. }),
        turnpoint: Some(ObservationZone::Keyhole {
            sector_radius: 10.,
            sector_angle: 90.,
            cylinder_radius: 0.5,
        }),
        assigned_area: Some(ObservationZone::Cylinder { radius: 20. }),
        finish: Some(ObservationZone::Cylinder { radius: 5. }),
    },
    task_design_limits: TaskDesignLimits {
        minimum_turnpoints: 2,
        minimum_assigned_area_separation: 1.,
    },
    countback_places: 0,
    complaint_period: 14,
    defaults: Rules {
        analysis: AnalysisParameters {
            earth_model: EarthModel::Wgs84,
            start_opening_time: None,
            start_closing_time: None,
            maximum_start_altitude: None,
            maximum_start_ground_speed: None,
            pev_start: false,
            pev_wait_time: 10,
            pev_start_window: 7,
            subtract_finish_ring_radius: true,
            delivery_period: Some(45),
            tow_altitude: None,
            maximum_altitude: None,
            scoring_end_time: None,
        },
        scoring: ScoringParameters { dm: 100., d1: 250. },
    },
};

pub static FAI_ANNEX_A_2025A: RuleSetEdition = RuleSetEdition {
    id: "FAI Annex A 2025a",
    earth_models: &[EarthModel::Wgs84, EarthModel::FaiSphere],
    class_templates: &[
        ClassTemplate::new("13.5 m", 100., 250., false, None),
        ClassTemplate::new("15 m", 120., 300., false, None),
        ClassTemplate::new("18 m", 140., 350., false, None),
        ClassTemplate::new("20 m multi-seat", 120., 300., false, Some(IGC_20M)),
        ClassTemplate::new("Club", 100., 250., true, Some(IGC_CLUB)),
        ClassTemplate::new("Open", 140., 350., false, None),
        ClassTemplate::new("Standard", 120., 300., false, None),
    ],
    pev: PevRules {
        wait_times: 5..=10,
        start_windows: 5..=10,
        limit: 3,
        limit_scope: PevLimitScope::Launch,
        clustering_time: 30,
        penalty_per_second: 1,
        maximum_penalty: 60,
    },
    default_zones: DefaultZones {
        start: None,
        turnpoint: Some(ObservationZone::Cylinder { radius: 0.5 }),
        assigned_area: Some(ObservationZone::Cylinder { radius: 20. }),
        finish: Some(ObservationZone::Cylinder { radius: 3. }),
    },
    task_design_limits: TaskDesignLimits {
        minimum_turnpoints: 2,
        minimum_assigned_area_separation: 1.,
    },
    countback_places: 3,
    complaint_period: 14,
    defaults: Rules {
        analysis: AnalysisParameters {
            earth_model: EarthModel::Wgs84,
            start_opening_time: None,
            start_closing_time: None,
            maximum_start_altitude: None,
            maximum_start_ground_speed: None,
            pev_start: false,
            pev_wait_time: 10,
            pev_start_window: 10,
            subtract_finish_ring_radius: true,
            delivery_period: None,
            tow_altitude: None,
            maximum_altitude: None,
            scoring_end_time: None,
        },
        scoring: ScoringParameters { dm: 100., d1: 250. },
    },
};

const DAEC_OFFENE: &str = "daec-offene-2026";
const DAEC_18M: &str = "daec-18m-2026";
const DAEC_15M: &str = "daec-15m-2026";
const DAEC_STANDARD: &str = "daec-standard-2026";
const IGC_CLUB: &str = "igc-club-2024a";
const IGC_20M: &str = "igc-20m-multi-seat-2024a";

/// One of an edition's classes, such as Club or Standard, that fills in a
/// class's values and handicap list when the class is set up.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ClassTemplate {
    pub name: &'static str,
    pub dm: f64,
    pub d1: f64,
    /// Whether the class is scored with handicaps unless a competition
    /// changes it.
    pub handicapped: bool,
    /// The ID of the handicap list the edition names for the class, which a
    /// class without handicaps can still switch to.
    pub handicap_list: Option<&'static str>,
}

impl ClassTemplate {
    const fn new(
        name: &'static str,
        dm: f64,
        d1: f64,
        handicapped: bool,
        handicap_list: Option<&'static str>,
    ) -> Self {
        Self {
            name,
            dm,
            d1,
            handicapped,
            handicap_list,
        }
    }
}

/// The PEV times an edition allows, how PEVs are counted and how a start
/// outside the PEV start window is penalised.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PevRules {
    /// The PEV wait times the edition allows, in whole minutes.
    pub wait_times: RangeInclusive<u32>,
    /// The PEV start windows the edition allows, in whole minutes.
    pub start_windows: RangeInclusive<u32>,
    /// The number of PEVs that count, after which further PEVs are ignored.
    pub limit: u32,
    pub limit_scope: PevLimitScope,
    /// The time within which several PEVs count as one at the time of the
    /// first, in seconds.
    pub clustering_time: u32,
    /// The penalty points per second that a start lies outside the PEV start
    /// window.
    pub penalty_per_second: u32,
    /// The most penalty points for a start outside the PEV start window or
    /// without a PEV.
    pub maximum_penalty: u32,
}

/// What the PEV limit counts PEVs over.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PevLimitScope {
    Day,
    Launch,
}

/// The shape of the Earth that distances and observation zones are calculated
/// on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EarthModel {
    Wgs84,
    /// A sphere with a radius of 6371 km.
    FaiSphere,
}

/// One layer of changes to an edition's parameters, such as a class's or a
/// class day's, each empty to keep the value of the layers before it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RuleOverrides {
    pub earth_model: Option<EarthModel>,
    pub dm: Option<f64>,
    pub d1: Option<f64>,
    pub start_opening_time: Option<UtcTime>,
    pub start_closing_time: Option<UtcTime>,
    pub maximum_start_altitude: Option<f64>,
    pub maximum_start_ground_speed: Option<f64>,
    pub pev_start: Option<bool>,
    pub pev_wait_time: Option<u32>,
    pub pev_start_window: Option<u32>,
    pub subtract_finish_ring_radius: Option<bool>,
    pub delivery_period: Option<u32>,
    pub tow_altitude: Option<f64>,
    pub maximum_altitude: Option<Altitude>,
    pub scoring_end_time: Option<UtcTime>,
}

/// The effective parameters a class day is analysed and scored with, split so
/// that a scoring-only change never changes the analysis parameters.
#[derive(Debug, Clone, PartialEq)]
pub struct Rules {
    pub analysis: AnalysisParameters,
    pub scoring: ScoringParameters,
}

/// The observation zone that task entry prefills for each task point role,
/// each empty for no default.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DefaultZones {
    pub start: Option<ObservationZone>,
    pub turnpoint: Option<ObservationZone>,
    pub assigned_area: Option<ObservationZone>,
    pub finish: Option<ObservationZone>,
}

/// The limits a task has to keep, which publishing asks to confirm when a task
/// departs from them.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TaskDesignLimits {
    /// The fewest turnpoints or assigned areas a task has.
    pub minimum_turnpoints: u32,
    /// The shortest distance between consecutive assigned areas, in km.
    pub minimum_assigned_area_separation: f64,
}

/// The area or line around a reference point that a flight has to reach or
/// cross, with every distance in km.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ObservationZone {
    Line {
        length: f64,
    },
    Cylinder {
        radius: f64,
    },
    /// A sector facing away from the course, with its full opening angle in
    /// degrees, joined with a cylinder.
    Keyhole {
        sector_radius: f64,
        sector_angle: f64,
        cylinder_radius: f64,
    },
}

/// The parameters that flight analysis takes, where an empty limit isn't
/// checked.
#[derive(Debug, Clone, PartialEq)]
pub struct AnalysisParameters {
    pub earth_model: EarthModel,
    pub start_opening_time: Option<UtcTime>,
    pub start_closing_time: Option<UtcTime>,
    /// In m MSL.
    pub maximum_start_altitude: Option<f64>,
    /// In km/h.
    pub maximum_start_ground_speed: Option<f64>,
    /// Whether a start is timed from a PEV.
    pub pev_start: bool,
    /// In whole minutes.
    pub pev_wait_time: u32,
    /// In whole minutes.
    pub pev_start_window: u32,
    /// Whether the finish ring radius is subtracted from the task distance.
    pub subtract_finish_ring_radius: bool,
    /// The time after landing within which a flight must be delivered, in
    /// whole minutes.
    pub delivery_period: Option<u32>,
    /// In m MSL.
    pub tow_altitude: Option<f64>,
    pub maximum_altitude: Option<Altitude>,
    pub scoring_end_time: Option<UtcTime>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Altitude {
    /// In m MSL.
    Msl(f64),
    FlightLevel(u16),
}

/// A point in time, in seconds since the Unix epoch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct UtcTime(pub i64);

impl RuleSetEdition {
    /// Looks up a built-in edition by its ID.
    pub fn find(id: &str) -> Option<&'static Self> {
        [&DAEC_SWO_2026, &FAI_ANNEX_A_2025A]
            .into_iter()
            .find(|edition| edition.id == id)
    }

    /// Resolves a class day's effective parameters by applying the override
    /// layers in order to the edition's defaults, so that a later layer wins
    /// over an earlier one.
    pub fn resolve(&self, layers: &[RuleOverrides]) -> Rules {
        let mut rules = self.defaults.clone();
        let Rules { analysis, scoring } = &mut rules;
        for overrides in layers {
            let &RuleOverrides {
                earth_model,
                dm,
                d1,
                start_opening_time,
                start_closing_time,
                maximum_start_altitude,
                maximum_start_ground_speed,
                pev_start,
                pev_wait_time,
                pev_start_window,
                subtract_finish_ring_radius,
                delivery_period,
                tow_altitude,
                maximum_altitude,
                scoring_end_time,
            } = overrides;
            analysis.earth_model = earth_model.unwrap_or(analysis.earth_model);
            scoring.dm = dm.unwrap_or(scoring.dm);
            scoring.d1 = d1.unwrap_or(scoring.d1);
            analysis.start_opening_time = start_opening_time.or(analysis.start_opening_time);
            analysis.start_closing_time = start_closing_time.or(analysis.start_closing_time);
            analysis.maximum_start_altitude =
                maximum_start_altitude.or(analysis.maximum_start_altitude);
            analysis.maximum_start_ground_speed =
                maximum_start_ground_speed.or(analysis.maximum_start_ground_speed);
            analysis.pev_start = pev_start.unwrap_or(analysis.pev_start);
            analysis.pev_wait_time = pev_wait_time.unwrap_or(analysis.pev_wait_time);
            analysis.pev_start_window = pev_start_window.unwrap_or(analysis.pev_start_window);
            analysis.subtract_finish_ring_radius =
                subtract_finish_ring_radius.unwrap_or(analysis.subtract_finish_ring_radius);
            analysis.delivery_period = delivery_period.or(analysis.delivery_period);
            analysis.tow_altitude = tow_altitude.or(analysis.tow_altitude);
            analysis.maximum_altitude = maximum_altitude.or(analysis.maximum_altitude);
            analysis.scoring_end_time = scoring_end_time.or(analysis.scoring_end_time);
        }

        rules
    }

    /// Lists the edition ID and every effective parameter as one `key=value`
    /// line each, in a fixed order, which is what the rules hash is taken over,
    /// so that any change to this text changes every rules hash.
    pub fn canonical_rules(&self, rules: &Rules) -> String {
        let Rules { analysis, scoring } = rules;
        let AnalysisParameters {
            earth_model,
            start_opening_time,
            start_closing_time,
            maximum_start_altitude,
            maximum_start_ground_speed,
            pev_start,
            pev_wait_time,
            pev_start_window,
            subtract_finish_ring_radius,
            delivery_period,
            tow_altitude,
            maximum_altitude,
            scoring_end_time,
        } = analysis;
        let ScoringParameters { dm, d1 } = scoring;

        let earth_model = match earth_model {
            EarthModel::Wgs84 => "wgs84",
            EarthModel::FaiSphere => "fai_sphere",
        };
        let time = |time: &Option<UtcTime>| or_none(time.map(|UtcTime(seconds)| seconds));
        let maximum_altitude = maximum_altitude.map(|altitude| match altitude {
            Altitude::Msl(altitude) => format!("{altitude} m"),
            Altitude::FlightLevel(level) => format!("FL{level}"),
        });

        [
            ("edition", self.id.to_string()),
            ("earth_model", earth_model.to_string()),
            ("start_opening_time", time(start_opening_time)),
            ("start_closing_time", time(start_closing_time)),
            ("maximum_start_altitude", or_none(*maximum_start_altitude)),
            (
                "maximum_start_ground_speed",
                or_none(*maximum_start_ground_speed),
            ),
            ("pev_start", pev_start.to_string()),
            ("pev_wait_time", pev_wait_time.to_string()),
            ("pev_start_window", pev_start_window.to_string()),
            (
                "subtract_finish_ring_radius",
                subtract_finish_ring_radius.to_string(),
            ),
            ("delivery_period", or_none(*delivery_period)),
            ("tow_altitude", or_none(*tow_altitude)),
            ("maximum_altitude", or_none(maximum_altitude)),
            ("scoring_end_time", time(scoring_end_time)),
            ("dm", dm.to_string()),
            ("d1", d1.to_string()),
        ]
        .map(|(key, value)| format!("{key}={value}\n"))
        .concat()
    }

    /// Hashes the edition ID and a class day's effective parameters, so that
    /// two publishes with equal hashes were scored under the same rules.
    pub fn rules_hash(&self, rules: &Rules) -> RulesHash {
        RulesHash(Sha256::digest(self.canonical_rules(rules)).into())
    }
}

fn or_none(value: Option<impl Display>) -> String {
    value.map_or_else(|| "none".to_string(), |value| value.to_string())
}

/// A SHA-256 hash over a class day's canonical rules, shown as lowercase hex.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RulesHash([u8; 32]);

impl Display for RulesHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.iter().try_for_each(|byte| write!(f, "{byte:02x}"))
    }
}
