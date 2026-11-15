//! The built-in rule set editions and the resolution of a class day's
//! effective parameters from its edition and rule overrides.

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
    /// The effective parameters without any rule overrides. `Dm` and `D1`
    /// default to the lowest class's values, since the edition has no
    /// default of its own for them.
    pub defaults: Rules,
}

pub static DAEC_SWO_2026: RuleSetEdition = RuleSetEdition {
    id: "DAeC SWO 2026",
    earth_models: &[EarthModel::Wgs84],
    defaults: Rules {
        analysis: AnalysisParameters {
            earth_model: EarthModel::Wgs84,
        },
        scoring: ScoringParameters { dm: 100., d1: 250. },
    },
};

pub static FAI_ANNEX_A_2025A: RuleSetEdition = RuleSetEdition {
    id: "FAI Annex A 2025a",
    earth_models: &[EarthModel::Wgs84, EarthModel::FaiSphere],
    defaults: Rules {
        analysis: AnalysisParameters {
            earth_model: EarthModel::Wgs84,
        },
        scoring: ScoringParameters { dm: 100., d1: 250. },
    },
};

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
}

/// The effective parameters a class day is analysed and scored with, split so
/// that a scoring-only change never changes the analysis parameters.
#[derive(Debug, Clone, PartialEq)]
pub struct Rules {
    pub analysis: AnalysisParameters,
    pub scoring: ScoringParameters,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AnalysisParameters {
    pub earth_model: EarthModel,
}

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
            } = overrides;
            analysis.earth_model = earth_model.unwrap_or(analysis.earth_model);
            scoring.dm = dm.unwrap_or(scoring.dm);
            scoring.d1 = d1.unwrap_or(scoring.d1);
        }

        rules
    }
}
