//! Points in time, shared by the stages of the engine.

/// A point in time, in seconds since the Unix epoch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct UtcTime(pub i64);
