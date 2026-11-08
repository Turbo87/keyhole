//! The built-in rule set editions.

use std::ops::RangeInclusive;
use std::time::Duration;

/// One dated version of a rule set, built in and never changed.
#[non_exhaustive]
#[derive(Debug, PartialEq)]
pub struct RuleSetEdition {
    pub id: &'static str,
    pub class_templates: &'static [ClassTemplate],
    /// The analysis parameters that apply without rule overrides.
    pub defaults: AnalysisParameters,
    pub default_zones: DefaultZones,
    pub allowed: AllowedValues,
    pub constants: EditionConstants,
}

/// The parameters flight analysis depends on.
///
/// Distances are in km, altitudes in m MSL and times of day are durations since
/// local midnight. An empty value is not checked.
#[derive(Debug, Clone, PartialEq)]
pub struct AnalysisParameters {
    pub earth_model: EarthModel,
    /// Whether the finish ring radius is subtracted from the task distance.
    pub finish_ring_subtracted: bool,
    /// How long after landing a competitor can deliver their flight.
    pub delivery_period: Option<Duration>,
    pub start: StartProcedure,
    pub tow_altitude: Option<f64>,
    pub maximum_altitude: Option<MaximumAltitude>,
    pub scoring_end_time: Option<Duration>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EarthModel {
    Wgs84,
    /// A sphere with a radius of 6371 km.
    FaiSphere,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StartProcedure {
    pub opening_time: Option<Duration>,
    pub closing_time: Option<Duration>,
    pub maximum_altitude: Option<f64>,
    /// The maximum start ground speed in km/h.
    pub maximum_ground_speed: Option<f64>,
    pub pev_start: bool,
    /// The PEV wait time in whole minutes.
    pub pev_wait_time: u32,
    /// The PEV start window in whole minutes.
    pub pev_start_window: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MaximumAltitude {
    /// An altitude in m MSL.
    Msl(f64),
    FlightLevel(u32),
}

/// The observation zones that prefill task entry, per task point role.
#[derive(Debug, Clone, PartialEq)]
pub struct DefaultZones {
    /// The start line length in km, or `None` to leave it to task entry.
    pub start_line_length: Option<f64>,
    pub turnpoint: ObservationZone,
    pub assigned_area: ObservationZone,
    pub finish: ObservationZone,
}

/// An observation zone of up to two arcs around a task point.
///
/// Each arc has a radius in km and a half-angle in degrees from the zone's
/// orientation, so a cylinder is `r1` with `a1` of 180 and an empty second arc.
#[derive(Debug, Clone, PartialEq)]
pub struct ObservationZone {
    pub r1: f64,
    pub a1: f64,
    pub r2: f64,
    pub a2: f64,
    pub orientation: Orientation,
}

/// The direction an observation zone faces.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Orientation {
    /// Bisecting the angle between the legs to and from the task point.
    Symmetric,
    /// A true bearing in degrees.
    Fixed(f64),
    /// Towards the previous task point.
    Previous,
    /// Towards the next task point.
    Next,
}

/// The values an edition allows, where it restricts them.
#[derive(Debug, PartialEq)]
pub struct AllowedValues {
    pub earth_models: &'static [EarthModel],
    /// The allowed PEV wait times in whole minutes.
    pub pev_wait_time: RangeInclusive<u32>,
    /// The allowed PEV start windows in whole minutes.
    pub pev_start_window: RangeInclusive<u32>,
}

/// Rule values that no rule override can change.
#[non_exhaustive]
#[derive(Debug, PartialEq)]
pub struct EditionConstants {
    /// Whether ties for the podium places are broken by counting daily places.
    pub podium_countback: bool,
    /// How long competitors can complain after an unofficial publish.
    pub complaint_period: Duration,
    /// The complaint period after an unofficial publish on the final
    /// competition day.
    pub final_day_complaint_period: Duration,
    pub pev: PevRules,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PevRules {
    /// The number of PEVs that can open a PEV start window.
    pub limit: u32,
    /// PEVs within this time of a PEV count as that one PEV.
    pub clustering: Duration,
    pub scope: PevScope,
    pub missing_pev_penalty: MissingPevPenalty,
    /// The penalty points per second that a start lies outside the PEV start
    /// window.
    pub outside_window_penalty_per_second: u32,
    /// The highest PEV penalty in points.
    pub maximum_penalty: u32,
}

/// What the PEV limit is counted over.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PevScope {
    PerDay,
    PerLaunch,
}

/// The penalty for a start without a PEV on a PEV start day.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MissingPevPenalty {
    /// Charged like a start outside the PEV start window.
    AsOutsideWindow,
    /// A fixed number of points.
    Fixed(u32),
}

const fn pev_rules(scope: PevScope, missing_pev_penalty: MissingPevPenalty) -> PevRules {
    PevRules {
        limit: 3,
        clustering: Duration::from_secs(30),
        scope,
        missing_pev_penalty,
        outside_window_penalty_per_second: 1,
        maximum_penalty: 60,
    }
}

const fn analysis_defaults(
    delivery_period: Option<Duration>,
    pev_wait_time: u32,
    pev_start_window: u32,
) -> AnalysisParameters {
    AnalysisParameters {
        earth_model: EarthModel::Wgs84,
        finish_ring_subtracted: true,
        delivery_period,
        start: StartProcedure {
            opening_time: None,
            closing_time: None,
            maximum_altitude: None,
            maximum_ground_speed: None,
            pev_start: false,
            pev_wait_time,
            pev_start_window,
        },
        tow_altitude: None,
        maximum_altitude: None,
        scoring_end_time: None,
    }
}

const fn cylinder(radius: f64) -> ObservationZone {
    ObservationZone {
        r1: radius,
        a1: 180.,
        r2: 0.,
        a2: 0.,
        orientation: Orientation::Symmetric,
    }
}

const fn hours(hours: u64) -> Duration {
    Duration::from_secs(hours * 3600)
}

/// One of an edition's classes, whose values a new class copies.
#[non_exhaustive]
#[derive(Debug, PartialEq)]
pub struct ClassTemplate {
    pub name: &'static str,
    /// The minimum distance `Dm` in km.
    pub dm: f64,
    /// The distance `D1` a winner needs for 1000 points, in km.
    pub d1: f64,
    pub handicapped: bool,
    /// The ID of the handicap list that fills in competitors' handicaps.
    pub handicap_list: Option<&'static str>,
}

/// A class's own scoring values and rule overrides.
#[derive(Debug, Clone, PartialEq)]
pub struct Class {
    /// The minimum distance `Dm` in km.
    pub dm: f64,
    /// The distance `D1` a winner needs for 1000 points, in km.
    pub d1: f64,
    pub handicapped: bool,
    /// The scale of the class's handicaps, ignored while unhandicapped.
    pub handicap_scale: HandicapScale,
    pub overrides: Vec<RuleOverride>,
}

/// The scale a class's handicaps are written on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HandicapScale {
    /// Handicaps around 1.000.
    One,
    /// Handicaps around 100, as on the DAeC cross-class list.
    Hundred,
}

/// A class day's rule overrides, which win over its class's.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ClassDayOverrides {
    pub dm: Option<f64>,
    pub d1: Option<f64>,
    pub rules: Vec<RuleOverride>,
}

/// One rule override parameter set to a value, where later overrides win.
///
/// Units follow [`AnalysisParameters`] and [`DefaultZones`], and `None`
/// empties a parameter.
#[derive(Debug, Clone, PartialEq)]
pub enum RuleOverride {
    EarthModel(EarthModel),
    FinishRingSubtracted(bool),
    DeliveryPeriod(Option<Duration>),
    StartLineLength(Option<f64>),
    TurnpointZone(ObservationZone),
    AssignedAreaZone(ObservationZone),
    FinishZone(ObservationZone),
    StartOpeningTime(Option<Duration>),
    StartClosingTime(Option<Duration>),
    MaximumStartAltitude(Option<f64>),
    MaximumStartGroundSpeed(Option<f64>),
    PevStart(bool),
    PevWaitTime(u32),
    PevStartWindow(u32),
    TowAltitude(Option<f64>),
    MaximumAltitude(Option<MaximumAltitude>),
    ScoringEndTime(Option<Duration>),
}

/// A class day's parameters after resolving its rule overrides.
#[derive(Debug, Clone, PartialEq)]
pub struct EffectiveParameters {
    pub analysis: AnalysisParameters,
    pub scoring: ScoringParameters,
    pub default_zones: DefaultZones,
}

/// The parameters day scoring depends on, in km.
#[derive(Debug, Clone, PartialEq)]
pub struct ScoringParameters {
    pub dm: f64,
    pub d1: f64,
    /// The scale handicaps are divided on, or `None` for an unhandicapped
    /// class.
    pub handicap_scale: Option<HandicapScale>,
}

/// A class day's effective parameters with their departures from the edition.
#[derive(Debug, Clone, PartialEq)]
pub struct Resolution {
    pub parameters: EffectiveParameters,
    pub departures: Vec<Departure>,
}

/// A valid value that the edition or a class template doesn't foresee, which a
/// scorer confirms instead of being refused.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Departure {
    /// An earth model the edition doesn't allow.
    EarthModel(EarthModel),
    /// A PEV wait time outside the edition's range, in minutes.
    PevWaitTime(u32),
    /// A PEV start window outside the edition's range, in minutes.
    PevStartWindow(u32),
    /// A class's Dm below its template's, in km.
    DmBelowTemplate(f64),
    /// A class's D1 below its template's, in km.
    D1BelowTemplate(f64),
    /// An unhandicapped class from a handicapped template.
    Unhandicapped,
}

/// A rule value outside what any edition could apply.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum InvalidValue {
    #[error("{}", .0.requirement())]
    OutOfRange(Parameter),
    #[error("the start must not close before it opens")]
    StartClosesBeforeOpening,
}

/// A class's scoring value or a rule override parameter.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Parameter {
    Dm,
    D1,
    StartLineLength,
    TurnpointZone,
    AssignedAreaZone,
    FinishZone,
    StartOpeningTime,
    StartClosingTime,
    MaximumStartAltitude,
    MaximumStartGroundSpeed,
    PevStartWindow,
    TowAltitude,
    MaximumAltitude,
    ScoringEndTime,
}

impl Parameter {
    /// What a valid value of the parameter must be.
    fn requirement(self) -> &'static str {
        match self {
            Self::Dm => "Dm must be a distance of at least 0 km",
            Self::D1 => "D1 must be a distance above 0 km",
            Self::StartLineLength => "the start line length must be above 0 km",
            Self::TurnpointZone => "the turnpoint zone must be a valid observation zone",
            Self::AssignedAreaZone => "the assigned area zone must be a valid observation zone",
            Self::FinishZone => "the finish zone must be a valid observation zone",
            Self::StartOpeningTime => "the start opening time must be a time of day",
            Self::StartClosingTime => "the start closing time must be a time of day",
            Self::MaximumStartAltitude => "the maximum start altitude must be finite",
            Self::MaximumStartGroundSpeed => "the maximum start ground speed must be above 0 km/h",
            Self::PevStartWindow => "the PEV start window must be at least 1 minute",
            Self::TowAltitude => "the tow altitude must be finite",
            Self::MaximumAltitude => {
                "the maximum altitude must be finite or a flight level above 0"
            }
            Self::ScoringEndTime => "the scoring end time must be a time of day",
        }
    }
}

impl RuleSetEdition {
    /// Resolves a class day's effective parameters, where class day overrides
    /// win over class overrides, which win over the edition's defaults.
    pub fn resolve(
        &self,
        class: &Class,
        class_day: &ClassDayOverrides,
    ) -> Result<Resolution, InvalidValue> {
        let dm = class_day.dm.unwrap_or(class.dm);
        let d1 = class_day.d1.unwrap_or(class.d1);
        for value in [Some(class.dm), class_day.dm] {
            check(
                value.is_none_or(|dm| dm >= 0. && dm.is_finite()),
                Parameter::Dm,
            )?;
        }
        for value in [Some(class.d1), class_day.d1] {
            check(value.is_none_or(is_positive), Parameter::D1)?;
        }

        let mut parameters = EffectiveParameters {
            analysis: self.defaults.clone(),
            scoring: ScoringParameters {
                dm,
                d1,
                handicap_scale: class.handicapped.then_some(class.handicap_scale),
            },
            default_zones: self.default_zones.clone(),
        };
        for rule_override in class.overrides.iter().chain(&class_day.rules) {
            rule_override.check()?;
            parameters.apply(rule_override.clone());
        }

        let start = &parameters.analysis.start;
        if let (Some(opening), Some(closing)) = (start.opening_time, start.closing_time)
            && closing < opening
        {
            return Err(InvalidValue::StartClosesBeforeOpening);
        }
        Ok(Resolution {
            departures: self.departures(&parameters.analysis),
            parameters,
        })
    }

    fn departures(&self, analysis: &AnalysisParameters) -> Vec<Departure> {
        let AnalysisParameters {
            earth_model, start, ..
        } = analysis;
        let mut departures = Vec::new();
        if !self.allowed.earth_models.contains(earth_model) {
            departures.push(Departure::EarthModel(*earth_model));
        }
        if !self.allowed.pev_wait_time.contains(&start.pev_wait_time) {
            departures.push(Departure::PevWaitTime(start.pev_wait_time));
        }
        if !self
            .allowed
            .pev_start_window
            .contains(&start.pev_start_window)
        {
            departures.push(Departure::PevStartWindow(start.pev_start_window));
        }
        departures
    }
}

impl ClassTemplate {
    /// Lists where a class's own values depart from this template's.
    pub fn departures(&self, class: &Class) -> Vec<Departure> {
        let mut departures = Vec::new();
        if class.dm < self.dm {
            departures.push(Departure::DmBelowTemplate(class.dm));
        }
        if class.d1 < self.d1 {
            departures.push(Departure::D1BelowTemplate(class.d1));
        }
        if self.handicapped && !class.handicapped {
            departures.push(Departure::Unhandicapped);
        }
        departures
    }
}

fn check(valid: bool, parameter: Parameter) -> Result<(), InvalidValue> {
    if valid {
        Ok(())
    } else {
        Err(InvalidValue::OutOfRange(parameter))
    }
}

fn is_positive(value: f64) -> bool {
    value > 0. && value.is_finite()
}

fn is_time_of_day(time: Duration) -> bool {
    time < hours(24)
}

impl RuleOverride {
    fn check(&self) -> Result<(), InvalidValue> {
        match self {
            Self::EarthModel(_)
            | Self::FinishRingSubtracted(_)
            | Self::DeliveryPeriod(_)
            | Self::PevStart(_)
            | Self::PevWaitTime(_) => Ok(()),
            Self::StartLineLength(length) => {
                check(length.is_none_or(is_positive), Parameter::StartLineLength)
            }
            Self::TurnpointZone(zone) => check(zone.is_valid(), Parameter::TurnpointZone),
            Self::AssignedAreaZone(zone) => check(zone.is_valid(), Parameter::AssignedAreaZone),
            Self::FinishZone(zone) => check(zone.is_valid(), Parameter::FinishZone),
            Self::StartOpeningTime(time) => {
                check(time.is_none_or(is_time_of_day), Parameter::StartOpeningTime)
            }
            Self::StartClosingTime(time) => {
                check(time.is_none_or(is_time_of_day), Parameter::StartClosingTime)
            }
            Self::MaximumStartAltitude(altitude) => check(
                altitude.is_none_or(f64::is_finite),
                Parameter::MaximumStartAltitude,
            ),
            Self::MaximumStartGroundSpeed(speed) => check(
                speed.is_none_or(is_positive),
                Parameter::MaximumStartGroundSpeed,
            ),
            Self::PevStartWindow(minutes) => check(*minutes > 0, Parameter::PevStartWindow),
            Self::TowAltitude(altitude) => {
                check(altitude.is_none_or(f64::is_finite), Parameter::TowAltitude)
            }
            Self::MaximumAltitude(altitude) => check(
                altitude.is_none_or(|altitude| match altitude {
                    MaximumAltitude::Msl(altitude) => altitude.is_finite(),
                    MaximumAltitude::FlightLevel(level) => level > 0,
                }),
                Parameter::MaximumAltitude,
            ),
            Self::ScoringEndTime(time) => {
                check(time.is_none_or(is_time_of_day), Parameter::ScoringEndTime)
            }
        }
    }
}

impl ObservationZone {
    fn is_valid(&self) -> bool {
        let is_angle = |angle: f64| (0. ..=180.).contains(&angle);
        let orientation_is_valid = match self.orientation {
            Orientation::Fixed(bearing) => (0. ..360.).contains(&bearing),
            Orientation::Symmetric | Orientation::Previous | Orientation::Next => true,
        };
        is_positive(self.r1)
            && self.r2 >= 0.
            && self.r2.is_finite()
            && is_angle(self.a1)
            && is_angle(self.a2)
            && orientation_is_valid
    }
}

impl EffectiveParameters {
    fn apply(&mut self, rule_override: RuleOverride) {
        let analysis = &mut self.analysis;
        let start = &mut analysis.start;
        let zones = &mut self.default_zones;
        match rule_override {
            RuleOverride::EarthModel(value) => analysis.earth_model = value,
            RuleOverride::FinishRingSubtracted(value) => analysis.finish_ring_subtracted = value,
            RuleOverride::DeliveryPeriod(value) => analysis.delivery_period = value,
            RuleOverride::StartLineLength(value) => zones.start_line_length = value,
            RuleOverride::TurnpointZone(value) => zones.turnpoint = value,
            RuleOverride::AssignedAreaZone(value) => zones.assigned_area = value,
            RuleOverride::FinishZone(value) => zones.finish = value,
            RuleOverride::StartOpeningTime(value) => start.opening_time = value,
            RuleOverride::StartClosingTime(value) => start.closing_time = value,
            RuleOverride::MaximumStartAltitude(value) => start.maximum_altitude = value,
            RuleOverride::MaximumStartGroundSpeed(value) => start.maximum_ground_speed = value,
            RuleOverride::PevStart(value) => start.pev_start = value,
            RuleOverride::PevWaitTime(value) => start.pev_wait_time = value,
            RuleOverride::PevStartWindow(value) => start.pev_start_window = value,
            RuleOverride::TowAltitude(value) => analysis.tow_altitude = value,
            RuleOverride::MaximumAltitude(value) => analysis.maximum_altitude = value,
            RuleOverride::ScoringEndTime(value) => analysis.scoring_end_time = value,
        }
    }
}

const fn template(
    name: &'static str,
    dm: f64,
    d1: f64,
    handicapped: bool,
    handicap_list: Option<&'static str>,
) -> ClassTemplate {
    ClassTemplate {
        name,
        dm,
        d1,
        handicapped,
        handicap_list,
    }
}

pub static DAEC_SWO_2026: RuleSetEdition = RuleSetEdition {
    id: "DAeC SWO 2026",
    class_templates: &[
        template("Club", 100., 250., true, Some("igc-club-2026")),
        template("Standard", 120., 300., false, Some("daec-standard-2026")),
        template("15 m", 120., 300., false, Some("daec-15m-2026")),
        template("18 m", 140., 350., false, Some("daec-18m-2026")),
        template("Open", 140., 350., false, Some("daec-open-2026")),
        template("Two-seater", 120., 300., true, Some("igc-20m-2026")),
    ],
    defaults: analysis_defaults(Some(Duration::from_secs(45 * 60)), 10, 7),
    default_zones: DefaultZones {
        start_line_length: Some(20.),
        // A keyhole: a 90° sector of 10 km around a 500 m cylinder.
        turnpoint: ObservationZone {
            r1: 10.,
            a1: 45.,
            r2: 0.5,
            a2: 180.,
            orientation: Orientation::Symmetric,
        },
        assigned_area: cylinder(20.),
        finish: cylinder(5.),
    },
    allowed: AllowedValues {
        earth_models: &[EarthModel::Wgs84],
        pev_wait_time: 10..=10,
        pev_start_window: 7..=7,
    },
    constants: EditionConstants {
        podium_countback: false,
        complaint_period: hours(14),
        final_day_complaint_period: hours(14),
        pev: pev_rules(PevScope::PerDay, MissingPevPenalty::AsOutsideWindow),
    },
};

pub static FAI_ANNEX_A_2025A: RuleSetEdition = RuleSetEdition {
    id: "FAI Annex A 2025a",
    class_templates: &[
        template("Club", 100., 250., true, Some("igc-club-2026")),
        template("Standard", 120., 300., false, None),
        template("13.5 m", 100., 250., false, None),
        template("15 m", 120., 300., false, None),
        template("18 m", 140., 350., false, None),
        template("Open", 140., 350., false, None),
        template("20 m multi-seat", 120., 300., false, Some("igc-20m-2026")),
    ],
    defaults: analysis_defaults(None, 10, 10),
    default_zones: DefaultZones {
        start_line_length: None,
        turnpoint: cylinder(0.5),
        assigned_area: cylinder(20.),
        finish: cylinder(3.),
    },
    allowed: AllowedValues {
        earth_models: &[EarthModel::Wgs84, EarthModel::FaiSphere],
        pev_wait_time: 5..=10,
        pev_start_window: 5..=10,
    },
    constants: EditionConstants {
        podium_countback: true,
        complaint_period: hours(14),
        final_day_complaint_period: hours(2),
        pev: pev_rules(PevScope::PerLaunch, MissingPevPenalty::Fixed(60)),
    },
};

impl RuleSetEdition {
    pub const ALL: [&'static Self; 2] = [&DAEC_SWO_2026, &FAI_ANNEX_A_2025A];

    pub fn find(id: &str) -> Option<&'static Self> {
        Self::ALL.into_iter().find(|edition| edition.id == id)
    }
}
