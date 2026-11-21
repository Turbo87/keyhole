//! The file stage of the flight analysis, which parses a raw IGC file
//! leniently into a flight.

use std::collections::BTreeMap;
use std::ops::Range;

use bytes::Bytes;
use igc::records::{self, ARecord, BRecord, FixValid, HRecord};
use jiff::civil::{Date, Time};
use jiff::tz::Offset;
use jiff::{SignedDuration, Timestamp};

use self::analysis_log::{
    AnalysisLogDetails, AnalysisLogEntry, Evidence, FileFailure, LineFailure, LineProblem,
    RecordType, RecordingEnd,
};

pub mod analysis_log;
mod flight_detection;

/// What the file stage extracted from one IGC file.
#[derive(Debug)]
pub struct FileAnalysis {
    /// The analysed IGC file, or `None` if the file fails to parse or lacks a
    /// valid fix.
    pub igc_file: Option<AnalysedIgcFile>,
    pub log: Vec<AnalysisLogEntry>,
}

#[derive(Debug)]
pub struct AnalysedIgcFile {
    /// The logger that wrote the file, from its `A` record.
    pub logger: LoggerId,
    /// The UTC date the recording started on, from its `HFDTE` header.
    pub recorded_date: Date,
    /// The records in file order, without the fixes whose time does not
    /// advance past the fixes before them.
    pub records: Vec<Record>,
    /// Which recorded altitude the analysis uses for every fix.
    pub altitude_source: AltitudeSource,
    /// The flights in the recording, in time order.
    pub flights: Vec<Flight>,
}

/// One recording of a logger. The times of its records are times of day
/// until they are resolved to points in time.
#[derive(Debug)]
pub struct IgcFile<T = Timestamp> {
    /// The logger that wrote the file, from its `A` record.
    pub logger: LoggerId,
    /// The UTC date the recording started on, from its `HFDTE` header.
    pub date: Date,
    /// The `B` and `E` records in file order.
    pub records: Vec<Record<T>>,
}

/// Why a file is not an IGC file that the analysis can read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParseError {
    /// No line of the file is an IGC record.
    NotIgc,
    /// The `A` record is missing or unreadable.
    MissingLoggerId,
    /// The `HFDTE` header is missing or does not hold a valid date.
    MissingRecordedDate,
}

/// Lines that could not be read for the same reason, by 1-based line number.
#[derive(Debug)]
pub struct UnreadableLines {
    pub reason: LineFailure,
    pub lines: Vec<usize>,
}

/// One `B` or `E` record.
#[derive(Debug)]
pub struct Record<T = Timestamp> {
    /// The 1-based line number in the file.
    pub line: usize,
    pub time: T,
    pub kind: RecordKind,
}

#[derive(Debug)]
pub enum RecordKind {
    /// A `B` record.
    Fix(Fix),
    /// An `E` record.
    Event(Event),
}

impl<T> Record<T> {
    pub fn fix(&self) -> Option<&Fix> {
        match &self.kind {
            RecordKind::Fix(fix) => Some(fix),
            RecordKind::Event(_) => None,
        }
    }

    fn is_valid_fix(&self) -> bool {
        self.fix().is_some_and(|fix| fix.valid)
    }
}

impl Record<Time> {
    fn dated(self, time: Timestamp) -> Record {
        let Self { line, kind, .. } = self;
        Record { line, time, kind }
    }
}

/// The recorded altitude of a fix, pressure or GNSS.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AltitudeSource {
    Pressure,
    Gnss,
}

/// The part of an IGC file from a take-off to the following landing.
#[derive(Debug)]
pub struct Flight {
    /// The time of the first fix of the take-off roll, or `None` when the
    /// recording starts in the take-off run.
    pub take_off_time: Option<Timestamp>,
    /// The time of the fix from which the roll-out stays slow, or `None` when
    /// the recording ends in flight.
    pub landing_time: Option<Timestamp>,
}

/// A logger's manufacturer and serial, as written in the `A` record.
#[derive(Debug)]
pub struct LoggerId {
    pub manufacturer: String,
    pub serial: String,
}

/// The position and altitudes of one `B` record.
#[derive(Debug)]
pub struct Fix {
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
    /// The values of the extensions that the latest `I` record defines, without
    /// those that the `B` record is too short for.
    pub extensions: Vec<Extension>,
}

impl Fix {
    /// The value of the extension with the given three-letter code, such as
    /// `ENL`.
    pub fn extension(&self, code: &str) -> Option<&str> {
        let extension = self.extensions.iter().find(|e| e.code == code.as_bytes())?;
        std::str::from_utf8(&extension.value).ok()
    }

    /// The altitude from the given source, in m.
    pub fn altitude(&self, source: AltitudeSource) -> i32 {
        match source {
            AltitudeSource::Pressure => self.pressure_altitude,
            AltitudeSource::Gnss => self.gnss_altitude,
        }
    }
}

/// One `E` record, such as a pilot event marker.
#[derive(Debug)]
pub struct Event {
    /// The three-letter code, such as `PEV`.
    pub code: String,
}

/// The raw value of one `B` record extension.
#[derive(Debug)]
pub struct Extension {
    code: [u8; 3],
    value: Bytes,
}

/// Where an extension that an `I` record defines lies in each `B` record.
struct ExtensionDefinition {
    code: [u8; 3],
    bytes: Range<usize>,
}

impl ExtensionDefinition {
    fn new(extension: &records::Extension) -> Option<Self> {
        let code = extension.mnemonic.as_bytes().try_into().ok()?;
        // The `I` record counts bytes from 1, including both ends.
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

impl IgcFile<Time> {
    /// Parses an IGC file, skipping the lines it cannot read and returning
    /// them grouped by reason.
    pub fn parse(contents: Bytes) -> Result<(Self, Vec<UnreadableLines>), ParseError> {
        let contents = match contents.strip_prefix(b"\xEF\xBB\xBF") {
            Some(rest) => contents.slice_ref(rest),
            None => contents,
        };
        let mut logger = None;
        let mut recorded_date = None;
        let mut records = Vec::new();
        let mut extension_definitions = Vec::new();
        let mut has_igc_records = false;
        let mut unreadable_lines = BTreeMap::<_, Vec<_>>::new();

        for (index, line) in contents.split(|&byte| byte == b'\n').enumerate() {
            let raw_line = line.strip_suffix(b"\r").unwrap_or(line);
            let line = String::from_utf8_lossy(raw_line);
            if line.trim().is_empty() {
                continue;
            }

            let line_number = index + 1;
            let record = records::Record::parse_line(&line);
            let problem = match &record {
                Ok(records::Record::Unrecognised(_)) => Some(LineProblem::Malformed),
                Ok(_) => None,
                Err(igc::util::ParseError::NumberOutOfRange) => Some(LineProblem::OutOfRange),
                Err(_) => Some(LineProblem::Malformed),
            };
            has_igc_records |= problem.is_none();
            if let Some(problem) = problem {
                let record_type = record_type(&line);
                let failure = LineFailure {
                    record_type,
                    problem,
                };
                unreadable_lines
                    .entry(failure)
                    .or_default()
                    .push(line_number);
            }

            match record {
                Ok(records::Record::A(record)) if logger.is_none() => {
                    logger = Some(logger_id(&line, &record));
                }
                Ok(records::Record::H(record)) if record.mnemonic == "DTE" => {
                    recorded_date = recorded_date.or_else(|| parse_date(&record));
                }
                Ok(records::Record::E(record)) => {
                    let code = record.mnemonic.into();
                    records.push(Record {
                        line: line_number,
                        time: time_of_day(record.time),
                        kind: RecordKind::Event(Event { code }),
                    });
                }
                Ok(records::Record::I(record)) => {
                    let definitions = record.0.extensions.iter();
                    extension_definitions =
                        definitions.filter_map(ExtensionDefinition::new).collect();
                }
                Ok(records::Record::B(record)) => {
                    let raw_line = contents.slice_ref(raw_line);
                    let definitions = extension_definitions.iter();
                    let extensions = definitions.filter_map(|d| d.decode(&raw_line)).collect();
                    records.push(Record {
                        line: line_number,
                        time: time_of_day(record.timestamp),
                        kind: RecordKind::Fix(fix(&record, extensions)),
                    });
                }
                _ => {}
            }
        }

        if !has_igc_records {
            return Err(ParseError::NotIgc);
        }
        let logger = logger.ok_or(ParseError::MissingLoggerId)?;
        let recorded_date = recorded_date.ok_or(ParseError::MissingRecordedDate)?;
        let unreadable_lines = unreadable_lines.into_iter();
        let warnings = unreadable_lines.map(|(reason, lines)| UnreadableLines { reason, lines });
        let igc_file = IgcFile {
            logger,
            date: recorded_date,
            records,
        };
        Ok((igc_file, warnings.collect()))
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
    let (igc_file, warnings) = match IgcFile::parse(contents) {
        Ok(parsed) => parsed,
        Err(error) => {
            let reason = match error {
                ParseError::NotIgc => FileFailure::NotIgc,
                ParseError::MissingLoggerId => FileFailure::MissingLoggerId,
                ParseError::MissingRecordedDate => FileFailure::MissingRecordedDate,
            };
            let log = vec![file_failure(reason)];
            let igc_file = None;
            return FileAnalysis { igc_file, log };
        }
    };
    let IgcFile {
        logger,
        date: recorded_date,
        records,
    } = igc_file;

    let mut log = Vec::new();
    let first_valid_fix = records.iter().position(Record::is_valid_fix);
    if first_valid_fix.is_none() {
        log.push(file_failure(FileFailure::NoValidFixes));
    }

    for UnreadableLines { reason, lines } in warnings {
        let details = AnalysisLogDetails::UnreadableLines { reason, lines };
        log.push(file_entry(details));
    }

    let igc_file = first_valid_fix.map(|first_valid_fix| {
        let records = date_records(records, recorded_date, first_valid_fix);
        let (records, lines) = drop_out_of_order_fixes(records, first_valid_fix);
        if !lines.is_empty() {
            log.push(file_entry(AnalysisLogDetails::TimestampErrors { lines }));
        }
        log.extend(exceeded_recording_intervals(&records, options));
        // A pressure altitude of zero on some fixes is a real value near sea
        // level, so only zero on every fix means the logger recorded none.
        let mut fixes = records.iter().filter_map(Record::fix);
        let altitude_source = if fixes.all(|fix| fix.pressure_altitude == 0) {
            log.push(file_entry(AnalysisLogDetails::NoPressureAltitude));
            AltitudeSource::Gnss
        } else {
            AltitudeSource::Pressure
        };
        let flights = flight_detection::detect_flights(&records, altitude_source);
        log.extend(flight_entries(&flights, &records));
        AnalysedIgcFile {
            logger,
            recorded_date,
            records,
            altitude_source,
            flights,
        }
    });

    FileAnalysis { igc_file, log }
}

/// Turns the records' times of day into points in time. Each fix lies within
/// 12 h of the latest fix before it, so a step back by more than 12 h crosses
/// midnight, and each event lies within 12 h of the fix before it, or of the
/// first fix if none comes before it. The recorded date is the date of the
/// first valid fix.
fn date_records(
    records: Vec<Record<Time>>,
    recorded_date: Date,
    first_valid_fix: usize,
) -> Vec<Record> {
    let first_fix = records.iter().find(|record| record.fix().is_some());
    let first_fix = first_fix.expect("a file with a valid fix has a fix");
    let mut latest = utc_timestamp(recorded_date, first_fix.time);
    let mut previous = latest;
    let mut records = records
        .into_iter()
        .map(|record| {
            if record.fix().is_none() {
                let time = date_near(record.time, previous);
                return record.dated(time);
            }
            let time = date_near(record.time, latest);
            latest = latest.max(time);
            previous = time;
            record.dated(time)
        })
        .collect::<Vec<_>>();

    let first_valid_time = Offset::UTC.to_datetime(records[first_valid_fix].time);
    let offset = recorded_date.duration_since(first_valid_time.date());
    records.iter_mut().for_each(|record| record.time += offset);
    records
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
    records: &[Record],
    options: FileAnalysisOptions,
) -> Vec<AnalysisLogEntry> {
    let limit = options.maximum_recording_interval;
    let length = |&(start, end): &(Timestamp, Timestamp)| end.duration_since(start);
    let fixes = records.iter().filter(|record| record.fix().is_some());
    let times = fixes.map(|record| record.time).collect::<Vec<_>>();
    let intervals = times.windows(2).map(|pair| (pair[0], pair[1]));
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

/// Keeps the events and the fixes whose time advances past the fixes kept
/// before them, and returns them with the line numbers of the dropped fixes.
/// The first valid fix anchors the recorded date, so it is always kept and
/// leading fixes are kept only if they precede it.
fn drop_out_of_order_fixes(
    records: Vec<Record>,
    first_valid_fix: usize,
) -> (Vec<Record>, Vec<usize>) {
    let anchor = records[first_valid_fix].time;
    let mut latest = None;
    let mut kept = Vec::with_capacity(records.len());
    let mut dropped = Vec::new();
    for (index, record) in records.into_iter().enumerate() {
        if record.fix().is_none() {
            kept.push(record);
            continue;
        }
        let is_leading = index < first_valid_fix;
        let is_in_order = latest.is_none_or(|latest| record.time > latest)
            && (!is_leading || record.time < anchor);
        if is_in_order {
            latest = Some(record.time);
            kept.push(record);
        } else {
            dropped.push(record.line);
        }
    }
    (kept, dropped)
}

/// Reports each take-off and landing, or the end of the recording that a
/// flight lacks one at.
fn flight_entries(flights: &[Flight], records: &[Record]) -> Vec<AnalysisLogEntry> {
    let valid_fixes = records.iter().filter(|record| record.is_valid_fix());
    let mut valid_fixes = valid_fixes.map(|record| record.time);
    let first_fix = valid_fixes.next().expect("an IGC file has a valid fix");
    let last_fix = valid_fixes.next_back().unwrap_or(first_fix);
    let airborne = |end| AnalysisLogDetails::Airborne { end };
    let entries = flights.iter().flat_map(|flight| {
        let take_off = match flight.take_off_time {
            Some(time) => fix_entry(AnalysisLogDetails::TakeOff, time),
            None => fix_entry(airborne(RecordingEnd::Start), first_fix),
        };
        let landing = match flight.landing_time {
            Some(time) => fix_entry(AnalysisLogDetails::Landing, time),
            None => fix_entry(airborne(RecordingEnd::End), last_fix),
        };
        [take_off, landing]
    });
    entries.collect()
}

fn file_failure(reason: FileFailure) -> AnalysisLogEntry {
    file_entry(AnalysisLogDetails::FileFailedToParse { reason })
}

fn file_entry(details: AnalysisLogDetails) -> AnalysisLogEntry {
    let evidence = Evidence::File;
    AnalysisLogEntry { details, evidence }
}

fn fix_entry(details: AnalysisLogDetails, time: Timestamp) -> AnalysisLogEntry {
    let evidence = Evidence::Fix(time);
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

fn fix(record: &BRecord, extensions: Vec<Extension>) -> Fix {
    Fix {
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
