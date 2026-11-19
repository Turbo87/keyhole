//! The file stage of the flight analysis, which parses a raw IGC file
//! leniently into a flight.

use std::collections::BTreeMap;

use bytes::Bytes;
use igc::records::{ARecord, BRecord, FixValid, HRecord, Record};
use igc::util::ParseError;

use crate::time::UtcTime;

use self::analysis_log::{
    AnalysisLogDetails, AnalysisLogEntry, Evidence, FileFailure, LineFailure, LineProblem,
    RecordType,
};

pub mod analysis_log;

const SECONDS_PER_DAY: i64 = 24 * 60 * 60;

/// What the file stage extracted from one IGC file.
#[derive(Debug)]
pub struct FileAnalysis {
    /// The parsed flight, or `None` if the file lacks its logger identity,
    /// recorded date or a valid fix.
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
    /// Returns `None` if the day does not exist in the Gregorian calendar.
    fn new(year: u16, month: u8, day: u8) -> Option<Self> {
        let is_leap_year =
            year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
        let days_in_month = match month {
            2 if is_leap_year => 29,
            2 => 28,
            4 | 6 | 9 | 11 => 30,
            1..=12 => 31,
            _ => return None,
        };
        let date = Self { year, month, day };
        (1..=days_in_month).contains(&day).then_some(date)
    }

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
    let mut unreadable_lines = BTreeMap::<_, Vec<_>>::new();

    for (index, line) in contents.split(|&byte| byte == b'\n').enumerate() {
        let line = String::from_utf8_lossy(line.strip_suffix(b"\r").unwrap_or(line));
        if line.trim().is_empty() {
            continue;
        }

        let record = Record::parse_line(&line);
        let problem = match &record {
            Ok(Record::Unrecognised(_)) => Some(LineProblem::Malformed),
            Ok(_) => None,
            Err(ParseError::NumberOutOfRange) => Some(LineProblem::OutOfRange),
            Err(_) => Some(LineProblem::Malformed),
        };
        has_igc_records |= problem.is_none();
        if let Some(problem) = problem {
            let record_type = record_type(&line);
            let failure = LineFailure {
                record_type,
                problem,
            };
            unreadable_lines.entry(failure).or_default().push(index + 1);
        }

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
        let log = vec![file_failure(FileFailure::NotIgc)];
        return FileAnalysis { flight: None, log };
    }

    let mut log = Vec::new();
    if logger.is_none() {
        log.push(file_failure(FileFailure::MissingLoggerId));
    }
    if recorded_date.is_none() {
        log.push(file_failure(FileFailure::MissingRecordedDate));
    }
    let first_valid_fix = fixes.iter().position(|fix| fix.valid);
    if first_valid_fix.is_none() {
        log.push(file_failure(FileFailure::NoValidFixes));
    }

    for (reason, lines) in unreadable_lines {
        let details = AnalysisLogDetails::UnreadableLines { reason, lines };
        log.push(file_entry(details));
    }

    let usable = logger.zip(recorded_date).zip(first_valid_fix);
    let flight = usable.map(|((logger, recorded_date), first_valid_fix)| {
        date_fixes(&mut fixes, recorded_date, first_valid_fix);
        Flight {
            logger,
            recorded_date,
            fixes,
        }
    });

    FileAnalysis { flight, log }
}

/// Turns the fixes' times of day into points in time. The recorded date is
/// the date of the first valid fix, so leading fixes more than 12 h later in
/// the day than that fix were recorded on the day before.
fn date_fixes(fixes: &mut [Fix], recorded_date: Date, first_valid_fix: usize) {
    let anchor = fixes[first_valid_fix].time.0;
    for fix in &mut fixes[..first_valid_fix] {
        if fix.time.0 - anchor > SECONDS_PER_DAY / 2 {
            fix.time.0 -= SECONDS_PER_DAY;
        }
    }

    let midnight = recorded_date.midnight().0;
    fixes.iter_mut().for_each(|fix| fix.time.0 += midnight);
}

fn file_failure(reason: FileFailure) -> AnalysisLogEntry {
    file_entry(AnalysisLogDetails::FileFailedToParse { reason })
}

fn file_entry(details: AnalysisLogDetails) -> AnalysisLogEntry {
    let evidence = Evidence::File;
    AnalysisLogEntry { details, evidence }
}

fn record_type(line: &str) -> RecordType {
    match line.as_bytes()[0] {
        b'A' => RecordType::A,
        b'B' => RecordType::B,
        b'C' => RecordType::C,
        b'D' => RecordType::D,
        b'E' => RecordType::E,
        b'F' => RecordType::F,
        b'G' => RecordType::G,
        b'H' => RecordType::H,
        b'I' => RecordType::I,
        b'J' => RecordType::J,
        b'K' => RecordType::K,
        b'L' => RecordType::L,
        _ => RecordType::Unknown,
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
    Date::new(2000 + u16::from(date.year), date.month, date.day)
}

/// Converts a B record into a fix whose time is still the time of day, until
/// `date_fixes()` dates all fixes at once.
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
