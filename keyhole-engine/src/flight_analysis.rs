//! The file stage of the flight analysis, which parses a raw IGC file
//! leniently into a flight.

use bytes::Bytes;
use igc::records::{ARecord, BRecord, FixValid, HRecord, Record};

use crate::time::UtcTime;

use self::analysis_log::{AnalysisLogDetails, AnalysisLogEntry, Evidence, FileFailure};

pub mod analysis_log;

const SECONDS_PER_DAY: i64 = 24 * 60 * 60;

/// What the file stage extracted from one IGC file.
#[derive(Debug)]
pub struct FileAnalysis {
    /// The parsed flight, or `None` if the file lacks its logger identity or
    /// recorded date.
    pub flight: Option<Flight>,
    pub log: Vec<AnalysisLogEntry>,
}

#[derive(Debug)]
pub struct Flight {
    /// The logger that wrote the file, from its A record.
    pub logger: LoggerId,
    /// The UTC date the recording started on, from its `HFDTE` header.
    pub recorded_date: Date,
    pub fixes: Vec<Fix>,
}

/// A logger's manufacturer and serial, as written in the A record.
#[derive(Debug)]
pub struct LoggerId {
    pub manufacturer: String,
    pub serial: String,
}

/// A calendar day in UTC.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Date {
    pub year: u16,
    pub month: u8,
    pub day: u8,
}

impl Date {
    /// The start of this day.
    pub fn midnight(self) -> UtcTime {
        // Howard Hinnant's `days_from_civil()`, with years starting in March so
        // that the leap day comes last.
        let year = i64::from(self.year) - i64::from(self.month <= 2);
        let month = i64::from(self.month);
        let year_of_era = year.rem_euclid(400);
        let day_of_year = (153 * ((month + 9) % 12) + 2) / 5 + i64::from(self.day) - 1;
        let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
        let days = year.div_euclid(400) * 146_097 + day_of_era - 719_468;
        UtcTime(days * SECONDS_PER_DAY)
    }
}

/// One B record.
#[derive(Debug)]
pub struct Fix {
    pub time: UtcTime,
    /// In degrees, positive to the north.
    pub latitude: f64,
    /// In degrees, positive to the east.
    pub longitude: f64,
    /// Whether the recorder marked the fix as a valid 3D fix.
    pub valid: bool,
    /// In m, as recorded.
    pub pressure_altitude: i32,
    /// In m, as recorded.
    pub gnss_altitude: i32,
}

/// Parses an IGC file, skipping what it cannot read.
pub fn analyze_file(contents: Bytes) -> FileAnalysis {
    let mut logger = None;
    let mut recorded_date = None;
    let mut fixes = Vec::new();
    let mut has_igc_records = false;

    for line in contents.split(|&byte| byte == b'\n') {
        let line = String::from_utf8_lossy(line.strip_suffix(b"\r").unwrap_or(line));
        let record = Record::parse_line(&line);
        has_igc_records |= !matches!(record, Ok(Record::Unrecognised(_)) | Err(_));
        match record {
            Ok(Record::A(record)) if logger.is_none() => {
                logger = Some(logger_id(&line, &record));
            }
            Ok(Record::H(record)) if record.mnemonic == "DTE" => {
                recorded_date = recorded_date.or_else(|| parse_date(&record));
            }
            Ok(Record::B(record)) => fixes.push(fix(&record)),
            _ => {}
        }
    }

    if !has_igc_records {
        return FileAnalysis {
            flight: None,
            log: vec![AnalysisLogEntry {
                details: AnalysisLogDetails::FileFailedToParse {
                    reason: FileFailure::NotIgc,
                },
                evidence: Evidence::File,
            }],
        };
    }

    let flight = logger.zip(recorded_date).map(|(logger, recorded_date)| {
        let midnight = recorded_date.midnight().0;
        fixes.iter_mut().for_each(|fix| fix.time.0 += midnight);
        Flight {
            logger,
            recorded_date,
            fixes,
        }
    });

    FileAnalysis {
        flight,
        log: Vec::new(),
    }
}

fn logger_id(line: &str, record: &ARecord) -> LoggerId {
    let extension = record.id_extension.map_or(0, str::len);
    let serial_start = line.len() - extension - record.unique_id.len();
    LoggerId {
        manufacturer: line[1..serial_start].into(),
        serial: record.unique_id.into(),
    }
}

/// Reads `DDMMYY` from the start of the header data, which covers both the
/// `HFDTEDDMMYY` and the `HFDTEDATE:DDMMYY,NN` forms.
fn parse_date(record: &HRecord) -> Option<Date> {
    let date = igc::util::Date::parse(record.data.get(..6)?).ok()?;
    Some(Date {
        year: 2000 + u16::from(date.year),
        month: date.month,
        day: date.day,
    })
}

/// Converts a B record into a fix whose time is still the time of day, since
/// the recorded date may only follow later in the file.
fn fix(record: &BRecord) -> Fix {
    Fix {
        time: UtcTime(record.timestamp.seconds_since_midnight().into()),
        latitude: record.pos.lat.0.into(),
        longitude: record.pos.lon.0.into(),
        valid: record.fix_valid == FixValid::Valid,
        pressure_altitude: record.pressure_alt.into(),
        gnss_altitude: record.gps_alt.into(),
    }
}
