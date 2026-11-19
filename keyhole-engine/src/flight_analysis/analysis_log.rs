//! The analysis log, which holds the messages that the flight analysis
//! produces for one IGC file, so that scorers can review them.

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
}

impl AnalysisLogKind {
    pub fn level(self) -> Level {
        match self {
            Self::FileFailedToParse => Level::Error,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    Error,
}

#[derive(Debug)]
pub enum AnalysisLogDetails {
    /// The file has no usable flight.
    FileFailedToParse { reason: FileFailure },
}

impl AnalysisLogDetails {
    pub fn kind(&self) -> AnalysisLogKind {
        match self {
            Self::FileFailedToParse { .. } => AnalysisLogKind::FileFailedToParse,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileFailure {
    /// No line of the file is an IGC record.
    NotIgc,
    /// The A record is missing or unreadable.
    MissingLoggerId,
    /// The `HFDTE` header is missing or does not hold a valid date.
    MissingRecordedDate,
}

/// The part of the recording an entry refers to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Evidence {
    File,
}
