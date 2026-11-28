//! The oracle harness: scores published SoaringSpot class days with
//! `keyhole-engine` and compares every value with the published one.

mod comparison;
mod decisions;
mod fixture;
mod full_data;
mod published;
mod rule_set_family;
mod task_info;
mod task_points;

pub use comparison::{Field, Mismatch, Report, check};
pub use fixture::{Deviation, Fixture, PublishedDayParameters};
pub use full_data::{Baseline, DatasetReport, check_dataset, time_zone};
pub use rule_set_family::{Inference, RuleSetFamily, infer_rule_set_family};
pub use task_info::TaskInfo;
pub use task_points::{
    Check, DayTaskPoints, Outcome, Point, RowMismatch, TaskPointBaseline, TaskPointDeviation,
    TaskPointReport, check_task_points,
};
