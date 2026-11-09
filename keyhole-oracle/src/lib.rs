//! The oracle harness: scores published SoaringSpot class days with
//! `keyhole-engine` and compares every value with the published one.

mod comparison;
mod decisions;
mod fixture;
mod published;

pub use comparison::{Field, Mismatch, Report, check};
pub use fixture::{Deviation, Fixture};
