//! The file stage of the flight analysis, which parses a raw IGC file
//! leniently into a flight.

use std::collections::BTreeMap;
use std::ops::Range;

use bytes::Bytes;
use igc::records::{self, ARecord, BRecord, FixValid, HRecord, Record};
use igc::util::ParseError;
use jiff::civil::{Date, Time};
use jiff::tz::Offset;
use jiff::{SignedDuration, Timestamp};

use self::analysis_log::{
    AnalysisLogDetails, AnalysisLogEntry, Evidence, FileFailure, LineFailure, LineProblem,
    RecordType,
};

pub mod analysis_log;

/// What the file stage extracted from one IGC file.
#[derive(Debug)]
pub struct FileAnalysis {
    /// The parsed IGC file, or `None` if the file lacks its logger identity,
    /// recorded date or a valid fix.
    pub igc_file: Option<IgcFile>,
    pub log: Vec<AnalysisLogEntry>,
}

#[derive(Debug)]
pub struct IgcFile {
    /// The logger that wrote the file, from its A record.
    pub logger: LoggerId,
    /// The UTC date the recording started on, from its `HFDTE` header.
    pub recorded_date: Date,
    /// The B records in file order, without those whose time does not advance
    /// past the fixes before them.
    pub fixes: Vec<Fix>,
    /// The pilot event markers, in file order.
    pub pevs: Vec<Timestamp>,
}

/// A logger's manufacturer and serial, as written in the A record.
#[derive(Debug)]
pub struct LoggerId {
    pub manufacturer: String,
    pub serial: String,
}

/// One B record. Its time is a time of day until the file stage dates the
/// fixes.
#[derive(Debug)]
pub struct Fix<T = Timestamp> {
    pub time: T,
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
    /// The values of the extensions that the latest I record defines, without
    /// those that the B record is too short for.
    pub extensions: Vec<Extension>,
}

impl Fix<Time> {
    fn dated(self, time: Timestamp) -> Fix {
        Fix {
            time,
            latitude: self.latitude,
            longitude: self.longitude,
            valid: self.valid,
            pressure_altitude: self.pressure_altitude,
            gnss_altitude: self.gnss_altitude,
            extensions: self.extensions,
        }
    }
}

impl Fix {
    /// The value of the extension with the given three-letter code, such as
    /// `ENL`.
    pub fn extension(&self, code: &str) -> Option<&str> {
        let extension = self.extensions.iter().find(|e| e.code == code.as_bytes())?;
        std::str::from_utf8(&extension.value).ok()
    }
}

/// The raw value of one B record extension.
#[derive(Debug)]
pub struct Extension {
    code: [u8; 3],
    value: Bytes,
}

/// Where an extension that an I record defines lies in each B record.
struct ExtensionDefinition {
    code: [u8; 3],
    bytes: Range<usize>,
}

impl ExtensionDefinition {
    fn new(extension: &records::Extension) -> Option<Self> {
        let code = extension.mnemonic.as_bytes().try_into().ok()?;
        // The I record counts bytes from 1, including both ends.
        let start = usize::from(extension.start_byte).checked_sub(1)?;
        let bytes = start..usize::from(extension.end_byte);
        Some(Self { code, bytes })
    }

    fn decode(&self, line: &Bytes) -> Option<Extension> {
        let value = line.slice_ref(line.get(self.bytes.clone())?);
        let code = self.code;
        Some(Extension { code, value })
    }
}

/// The limits that the file stage checks the recording against.
#[derive(Debug, Clone, Copy)]
pub struct FileAnalysisOptions {
    /// The longest interval between two fixes that does not warrant a warning.
    pub maximum_recording_interval: SignedDuration,
}

/// Parses an IGC file, skipping what it cannot read, and checks the
/// recording against the given limits.
pub fn analyze_file(contents: Bytes, options: FileAnalysisOptions) -> FileAnalysis {
    let contents = match contents.strip_prefix(b"\xEF\xBB\xBF") {
        Some(rest) => contents.slice_ref(rest),
        None => contents,
    };
    let mut logger = None;
    let mut recorded_date = None;
    let mut fixes = Vec::new();
    let mut fix_lines = Vec::new();
    let mut extension_definitions = Vec::new();
    let mut pevs = Vec::new();
    let mut has_igc_records = false;
    let mut unreadable_lines = BTreeMap::<_, Vec<_>>::new();

    for (index, line) in contents.split(|&byte| byte == b'\n').enumerate() {
        let raw_line = line.strip_suffix(b"\r").unwrap_or(line);
        let line = String::from_utf8_lossy(raw_line);
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
            Ok(Record::E(record)) if record.mnemonic == "PEV" => {
                pevs.push((time_of_day(record.time), fixes.len().saturating_sub(1)));
            }
            Ok(Record::I(record)) => {
                let definitions = record.0.extensions.iter();
                extension_definitions = definitions.filter_map(ExtensionDefinition::new).collect();
            }
            Ok(Record::B(record)) => {
                let raw_line = contents.slice_ref(raw_line);
                let definitions = extension_definitions.iter();
                let extensions = definitions.filter_map(|d| d.decode(&raw_line)).collect();
                fixes.push(fix(&record, extensions));
                fix_lines.push(index + 1);
            }
            _ => {}
        }
    }

    if !has_igc_records {
        let log = vec![file_failure(FileFailure::NotIgc)];
        let igc_file = None;
        return FileAnalysis { igc_file, log };
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
    let igc_file = usable.map(|((logger, recorded_date), first_valid_fix)| {
        let fixes = date_fixes(fixes, recorded_date, first_valid_fix);
        let pevs = pevs
            .iter()
            .map(|&(time, fix)| date_near(time, fixes[fix].time))
            .collect();
        let (fixes, lines) = drop_out_of_order_fixes(fixes, &fix_lines, first_valid_fix);
        if !lines.is_empty() {
            log.push(file_entry(AnalysisLogDetails::TimestampErrors { lines }));
        }
        log.extend(exceeded_recording_intervals(&fixes, options));
        IgcFile {
            logger,
            recorded_date,
            fixes,
            pevs,
        }
    });

    FileAnalysis { igc_file, log }
}

/// Turns the fixes' times of day into points in time. Each fix lies within
/// 12 h of the latest fix before it, so a step back by more than 12 h crosses
/// midnight. The recorded date is the date of the first valid fix.
fn date_fixes(fixes: Vec<Fix<Time>>, recorded_date: Date, first_valid_fix: usize) -> Vec<Fix> {
    let mut latest = utc_timestamp(recorded_date, fixes[0].time);
    let mut fixes = fixes
        .into_iter()
        .map(|fix| {
            let time = date_near(fix.time, latest);
            latest = latest.max(time);
            fix.dated(time)
        })
        .collect::<Vec<_>>();

    let anchor = Offset::UTC.to_datetime(fixes[first_valid_fix].time).date();
    let offset = recorded_date.duration_since(anchor);
    fixes.iter_mut().for_each(|fix| fix.time += offset);
    fixes
}

/// Dates a time of day within 12 h of the given time.
fn date_near(time_of_day: Time, reference: Timestamp) -> Timestamp {
    const DAY: SignedDuration = SignedDuration::from_hours(24);
    const HALF_DAY: SignedDuration = SignedDuration::from_hours(12);
    let reference_time = Offset::UTC.to_datetime(reference).time();
    let offset = match time_of_day.duration_since(reference_time) {
        offset if offset >= HALF_DAY => offset - DAY,
        offset if offset < -HALF_DAY => offset + DAY,
        offset => offset,
    };
    reference + offset
}

/// The point in time of a time of day on a UTC date.
fn utc_timestamp(date: Date, time: Time) -> Timestamp {
    let datetime = date.to_datetime(time);
    let timestamp = Offset::UTC.to_timestamp(datetime);
    timestamp.expect("IGC dates lie within the supported range")
}

/// Warns about each stretch of consecutive intervals between fixes that
/// exceed the limit.
fn exceeded_recording_intervals(
    fixes: &[Fix],
    options: FileAnalysisOptions,
) -> Vec<AnalysisLogEntry> {
    let limit = options.maximum_recording_interval;
    let length = |&(start, end): &(Timestamp, Timestamp)| end.duration_since(start);
    let intervals = fixes.windows(2).map(|pair| (pair[0].time, pair[1].time));
    let intervals = intervals.collect::<Vec<_>>();
    let exceeds = |interval: &(Timestamp, Timestamp)| length(interval) > limit;

    let stretches = intervals.chunk_by(|a, b| exceeds(a) == exceeds(b));
    let stretches = stretches.filter(|stretch| exceeds(&stretch[0]));
    let entries = stretches.map(|stretch| {
        let intervals = stretch.iter().map(length);
        let longest_interval = intervals.max().unwrap_or_default();
        let details = AnalysisLogDetails::RecordingIntervalExceeded { longest_interval };
        let evidence = Evidence::Interval(stretch[0].0, stretch[stretch.len() - 1].1);
        AnalysisLogEntry { details, evidence }
    });
    entries.collect()
}

/// Keeps the fixes whose time advances past the fixes kept before them and
/// returns them with the line numbers of the dropped ones. The first valid fix
/// anchors the recorded date, so it is always kept and leading fixes are kept
/// only if they precede it.
fn drop_out_of_order_fixes(
    fixes: Vec<Fix>,
    lines: &[usize],
    first_valid_fix: usize,
) -> (Vec<Fix>, Vec<usize>) {
    let anchor = fixes[first_valid_fix].time;
    let mut latest = None;
    let mut kept = Vec::with_capacity(fixes.len());
    let mut dropped = Vec::new();
    for (index, (fix, &line)) in fixes.into_iter().zip(lines).enumerate() {
        let is_leading = index < first_valid_fix;
        let is_in_order =
            latest.is_none_or(|latest| fix.time > latest) && (!is_leading || fix.time < anchor);
        if is_in_order {
            latest = Some(fix.time);
            kept.push(fix);
        } else {
            dropped.push(line);
        }
    }
    (kept, dropped)
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
    let year = 2000 + i16::from(date.year);
    let month = i8::try_from(date.month).ok()?;
    let day = i8::try_from(date.day).ok()?;
    Date::new(year, month, day).ok()
}

/// Converts a B record into a fix that `date_fixes()` dates later.
fn fix(record: &BRecord, extensions: Vec<Extension>) -> Fix<Time> {
    Fix {
        time: time_of_day(record.timestamp),
        latitude: record.pos.lat.0.into(),
        longitude: record.pos.lon.0.into(),
        valid: record.fix_valid == FixValid::Valid,
        pressure_altitude: record.pressure_alt.into(),
        gnss_altitude: record.gps_alt.into(),
        extensions,
    }
}

/// Reads an IGC time, wrapping values such as `240000` that the IGC parser
/// accepts past the end of the day.
fn time_of_day(time: igc::util::Time) -> Time {
    let seconds = SignedDuration::from_secs(time.seconds_since_midnight().into());
    Time::midnight().wrapping_add(seconds)
}
