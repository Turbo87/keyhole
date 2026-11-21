//! The analysis log, which holds the messages that the flight analysis
//! produces for one IGC file, so that scorers can review them.

use jiff::{SignedDuration, Timestamp};

/// One message of the flight analysis, with the evidence it refers to.
#[derive(Debug)]
pub struct AnalysisLogEntry {
    pub details: AnalysisLogDetails,
    pub evidence: Evidence,
}

/// What an entry is about, independent of its details.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnalysisLogKind {
    FileFailedToParse,
    UnreadableLines,
    TimestampErrors,
    RecordingIntervalExceeded,
    NoPressureAltitude,
    TakeOff,
    Landing,
    Airborne,
}

impl AnalysisLogKind {
    pub fn level(self) -> Level {
        match self {
            Self::FileFailedToParse | Self::UnreadableLines => Level::Error,
            Self::TimestampErrors
            | Self::RecordingIntervalExceeded
            | Self::NoPressureAltitude
            | Self::Airborne => Level::Warning,
            Self::TakeOff | Self::Landing => Level::Info,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    Error,
    Warning,
    Info,
}

#[derive(Debug)]
pub enum AnalysisLogDetails {
    /// The file has no usable flight.
    FileFailedToParse { reason: FileFailure },
    /// Lines that could not be read for the same reason, by 1-based line
    /// number.
    UnreadableLines {
        reason: LineFailure,
        lines: Vec<usize>,
    },
    /// Fixes that were dropped because their timestamp did not advance, by
    /// 1-based line number.
    TimestampErrors { lines: Vec<usize> },
    /// Consecutive fixes lie further apart than the edition allows.
    RecordingIntervalExceeded { longest_interval: SignedDuration },
    /// No fix has a pressure altitude, so the analysis uses GNSS altitude,
    /// which neither rule set provides for.
    NoPressureAltitude,
    /// A flight starts its take-off run at the fix.
    TakeOff,
    /// A flight's roll-out stays slow from the fix on.
    Landing,
    /// A flight lacks its take-off or landing because the recording starts or
    /// ends with it in progress.
    Airborne { end: RecordingEnd },
}

impl AnalysisLogDetails {
    pub fn kind(&self) -> AnalysisLogKind {
        match self {
            Self::FileFailedToParse { .. } => AnalysisLogKind::FileFailedToParse,
            Self::UnreadableLines { .. } => AnalysisLogKind::UnreadableLines,
            Self::TimestampErrors { .. } => AnalysisLogKind::TimestampErrors,
            Self::RecordingIntervalExceeded { .. } => AnalysisLogKind::RecordingIntervalExceeded,
            Self::NoPressureAltitude => AnalysisLogKind::NoPressureAltitude,
            Self::TakeOff => AnalysisLogKind::TakeOff,
            Self::Landing => AnalysisLogKind::Landing,
            Self::Airborne { .. } => AnalysisLogKind::Airborne,
        }
    }
}

/// One end of the recording.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordingEnd {
    Start,
    End,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileFailure {
    /// No line of the file is an IGC record.
    NotIgc,
    /// The A record is missing or unreadable.
    MissingLoggerId,
    /// The `HFDTE` header is missing or does not hold a valid date.
    MissingRecordedDate,
    /// No B record is marked as a valid fix.
    NoValidFixes,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct LineFailure {
    pub record_type: RecordType,
    pub problem: LineProblem,
}

/// The IGC record type that a line starts with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RecordType {
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K,
    L,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LineProblem {
    /// The line does not match the layout of its record type.
    Malformed,
    /// A number in the line is outside its valid range.
    OutOfRange,
}

/// The part of the recording an entry refers to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Evidence {
    File,
    /// The span from the first time to the second.
    Interval(Timestamp, Timestamp),
    /// The fix at the time.
    Fix(Timestamp),
}
