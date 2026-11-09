//! The oracle harness: scores published SoaringSpot class days with
//! `keyhole-engine` and compares every value with the published one.

mod comparison;
mod decisions;
mod fixture;
mod full_data;
mod published;
mod task_info;

pub use comparison::{Field, Mismatch, Report, check};
pub use fixture::{Deviation, Fixture};
pub use full_data::{Baseline, DownloadReport, check_download};
