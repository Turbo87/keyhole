//! Keyhole's scoring engine: pure functions from competition inputs to results,
//! with no I/O, clock, network or randomness.

pub mod day_scoring;
pub mod overall_results;
pub mod rule_sets;
pub mod rules_hash;

/// The version of the engine's algorithms, published with every result.
///
/// It is independent of the crate's semantic version and changes whenever the
/// engine scores the same inputs differently.
pub const ENGINE_VERSION: u32 = 1;
