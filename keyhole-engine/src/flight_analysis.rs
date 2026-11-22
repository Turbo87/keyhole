//! The steps of the flight analysis of one IGC file, which the platform
//! calls in order: parsing it leniently, resolving the times of its records
//! and analysing the dated records.

use std::cmp::{Ordering, Reverse};
use std::collections::BTreeMap;
use std::ops::Range;

use bytes::Bytes;
use igc::records::{self, ARecord, BRecord, FixValid, HRecord};
use jiff::civil::{Date, DateTime, Time};
use jiff::tz::Offset;
use jiff::{SignedDuration, Timestamp};

mod flight_detection;

/// One recording of a logger. The times of its records are times of day
/// until they are resolved to points in time.
#[derive(Debug)]
pub struct IgcFile<T = Timestamp> {
    /// The logger that wrote the file, from its `A` record.
    pub logger: LoggerId,
    /// The UTC date of the recording, from the `HFDTE` header until
    /// `resolve_times()` dates the records on another date.
    pub date: Date,
    /// The `B` and `E` records in file order, until `resolve_times()` orders
    /// them by time and line number.
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

/// A problem with the times of an IGC file's records.
#[derive(Debug)]
pub enum TimeWarning {
    /// Fixes that were dropped because their time is out of order with the
    /// fixes around them, by 1-based line number.
    OutOfOrderFixes { lines: Vec<usize> },
    /// No fix is valid, so the records are dated from the first fix, or from
    /// the first record of a file without fixes.
    NoValidFix,
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
    /// The record at `dt`, a UTC date and time with the record's time of day.
    fn at(self, dt: DateTime) -> Result<Record, jiff::Error> {
        let ts = Offset::UTC.to_timestamp(dt)?;
        let Self { line, kind, .. } = self;
        Ok(Record {
            line,
            time: ts,
            kind,
        })
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
    /// The first fix of the take-off roll, or the first valid fix when the
    /// recording starts in the take-off run.
    pub start: FlightBound,
    /// The fix from which the roll-out stays slow, or the last valid fix when
    /// the recording ends in flight.
    pub end: FlightBound,
}

/// Where a flight starts or stops.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlightBound {
    /// The time of a detected take-off or landing.
    Detected(Timestamp),
    /// The time of the first or last valid fix, which the glider reaches in
    /// flight.
    Airborne(Timestamp),
}

impl FlightBound {
    /// The time of the take-off, landing or valid fix.
    pub fn time(self) -> Timestamp {
        match self {
            Self::Detected(time) | Self::Airborne(time) => time,
        }
    }
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
    /// Parses an IGC file, skipping the lines of unknown record types. It also
    /// skips the lines it cannot read and returns them grouped by reason.
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
                Ok(records::Record::Unrecognised(_)) => continue,
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

    /// Turns the records' UTC times of day into points in time, drops the
    /// fixes whose time is out of order and orders the records by time and
    /// line number. The first valid fix, or the first fix or record of a file
    /// without one, lies on the given UTC date, which becomes the date of the
    /// IGC file. It fails if that date puts a record outside the supported
    /// range of points in time.
    pub fn resolve_times(self, date: Date) -> Result<(IgcFile, Vec<TimeWarning>), jiff::Error> {
        let Self {
            logger,
            mut records,
            ..
        } = self;
        let mut warnings = Vec::new();
        let first_valid_fix = records.iter().position(Record::is_valid_fix);
        if first_valid_fix.is_none() {
            warnings.push(TimeWarning::NoValidFix);
        }
        let first_fix = || records.iter().position(|record| record.fix().is_some());
        let anchor_index = first_valid_fix.or_else(first_fix).unwrap_or(0);

        let mut following = records.split_off(anchor_index).into_iter();
        let leading = records;
        let Some(anchor) = following.next() else {
            let records = Vec::new();
            let igc_file = IgcFile {
                logger,
                date,
                records,
            };
            return Ok((igc_file, warnings));
        };

        let anchor_dt = date.to_datetime(anchor.time);
        let leading = leading.into_iter().rev();
        let (mut leading, mut lines) = date_outward(leading, anchor_dt, Ordering::Less)?;
        leading.reverse();
        lines.reverse();
        let (following, dropped) = date_outward(following, anchor_dt, Ordering::Greater)?;
        lines.extend(dropped);
        if !lines.is_empty() {
            warnings.push(TimeWarning::OutOfOrderFixes { lines });
        }
        let anchor = anchor.at(anchor_dt)?;
        let records = leading.into_iter().chain([anchor]).chain(following);
        let mut records: Vec<_> = records.collect();
        records.sort_unstable_by_key(|record| (record.time, record.line));
        let igc_file = IgcFile {
            logger,
            date,
            records,
        };
        Ok((igc_file, warnings))
    }
}

impl IgcFile {
    /// Which recorded altitude the flights are detected with, GNSS when every
    /// fix records a pressure altitude of zero. Zero on only some fixes is a
    /// real pressure altitude near sea level.
    pub fn altitude_source(&self) -> AltitudeSource {
        let mut fixes = self.records.iter().filter_map(Record::fix);
        if fixes.all(|fix| fix.pressure_altitude == 0) {
            AltitudeSource::Gnss
        } else {
            AltitudeSource::Pressure
        }
    }

    /// The flights in the recording, in time order.
    pub fn flights(&self) -> Vec<Flight> {
        flight_detection::detect_flights(&self.records, self.altitude_source())
    }

    /// The records from `start` to `end`, including both ends.
    pub fn records_between(&self, start: Timestamp, end: Timestamp) -> &[Record] {
        let start = self.records.partition_point(|record| record.time < start);
        let end = self.records.partition_point(|record| record.time <= end);
        self.records.get(start..end).unwrap_or_default()
    }
}

/// The stretch between two consecutive valid fixes.
#[derive(Debug)]
pub struct FixGap {
    /// The time of the valid fix before the gap.
    pub start: Timestamp,
    /// The time of the valid fix after the gap.
    pub end: Timestamp,
}

/// The interval that the logger records fixes at, as the most common
/// interval between consecutive fixes, valid or not, and the shorter of
/// equally common ones. `None` with fewer than two fixes.
pub fn recording_interval(records: &[Record]) -> Option<SignedDuration> {
    let fixes = records.iter().filter(|record| record.fix().is_some());
    let times = fixes.map(|record| record.time).collect::<Vec<_>>();
    let mut counts = BTreeMap::<_, usize>::new();
    for pair in times.windows(2) {
        *counts.entry(pair[1].duration_since(pair[0])).or_default() += 1;
    }
    let most_common = counts
        .into_iter()
        .min_by_key(|&(interval, count)| (Reverse(count), interval));
    most_common.map(|(interval, _)| interval)
}

/// The gaps between consecutive valid fixes that last at least `minimum`,
/// in time order.
pub fn fix_gaps(records: &[Record], minimum: SignedDuration) -> Vec<FixGap> {
    let valid_fixes = records.iter().filter(|record| record.is_valid_fix());
    let times = valid_fixes.map(|record| record.time).collect::<Vec<_>>();
    let gaps = times.windows(2).map(|pair| FixGap {
        start: pair[0],
        end: pair[1],
    });
    let gaps = gaps.filter(|gap| gap.end.duration_since(gap.start) >= minimum);
    gaps.collect()
}

/// The flight that is scored unless a scorer sets its take-off or landing:
/// the longest of the given flights, and the first of equally long ones in
/// the given order.
pub fn choose_default_flight(flights: &[Flight]) -> Option<&Flight> {
    let duration = |flight: &Flight| flight.end.time().duration_since(flight.start.time());
    flights
        .iter()
        .min_by_key(|flight| Reverse(duration(flight)))
}

/// Dates the records walking away from the anchor, backwards for
/// `Ordering::Less` and forwards for `Ordering::Greater`. Each record lies the
/// shorter way around the clock from the anchor or the last fix kept since,
/// and a fix that does not lie in the walk's `direction` from it is dropped.
fn date_outward(
    records: impl IntoIterator<Item = Record<Time>>,
    anchor_dt: DateTime,
    direction: Ordering,
) -> Result<(Vec<Record>, Vec<usize>), jiff::Error> {
    let mut fix_dt = anchor_dt;
    let mut kept = Vec::new();
    let mut dropped = Vec::new();
    for record in records {
        let dt = fix_dt.checked_add(clock_step(fix_dt.time(), record.time))?;
        match record.kind {
            RecordKind::Fix(_) if dt.cmp(&fix_dt) != direction => dropped.push(record.line),
            RecordKind::Fix(_) => {
                fix_dt = dt;
                kept.push(record.at(dt)?);
            }
            RecordKind::Event(_) => kept.push(record.at(dt)?),
        }
    }
    Ok((kept, dropped))
}

/// The time from one time of day to another the shorter way around the
/// clock, so from 23:59:59 to 00:00:01 is 2 s and back is -2 s.
fn clock_step(from: Time, to: Time) -> SignedDuration {
    const DAY: SignedDuration = SignedDuration::from_hours(24);
    const HALF_DAY: SignedDuration = SignedDuration::from_hours(12);
    let step = to.duration_since(from);
    if step >= HALF_DAY {
        step - DAY
    } else if step < -HALF_DAY {
        step + DAY
    } else {
        step
    }
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
