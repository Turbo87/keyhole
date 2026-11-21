//! Take-off and landing detection.
//!
//! A glider on the ground barely moves and keeps its altitude. Fixes where it
//! does so for a while are still, and runs of still fixes form still periods.
//! A glider hovering in wave can look the same for a short time. So a still
//! period well above the lowest ground seen so far is a ground period only
//! when the glider rests in it, staying within a few metres of one spot for a
//! while. Every other still period is a ground period.
//!
//! Between the ground periods, the glider moves. A moving stretch is a flight
//! when it contains a take-off run, a stretch of fast fixes, and climbs well
//! above the ground periods around it, which a car tow or a taxi does not.
//! The take-off is the first fix of the take-off roll, where the glider
//! starts to move faster than the still speed on its way into the take-off
//! run. The landing is the last fix that the glider reaches at still speed or
//! faster before the ground period after the flight.

use std::ops::RangeInclusive;

use jiff::{SignedDuration, Timestamp};

use super::{AltitudeSource, Fix, Flight, Record};

/// How long after a fix the glider has to stand still for the fix to count
/// as still.
const STILL_WINDOW: SignedDuration = SignedDuration::from_secs(30);
/// In km/h, the fix-to-fix ground speed that no fix of a still window reaches
/// and that the glider stays below from its landing on. A crew pushing the
/// glider stays below it.
const STILL_SPEED: f64 = 15.0;
/// The longest time between two still fixes of the same still period, so
/// that a few moving fixes, such as a short push or a position jump, do not
/// split it.
const STILL_GAP: SignedDuration = SignedDuration::from_secs(5);
/// The shortest still period. A shorter run of still fixes, such as a slow
/// moment in flight, belongs to the moving stretch around it. The recording
/// cuts off the runs at its ends, so a run at the start of the file counts at
/// any length and a run at the end of the file counts from 3 fixes.
const STILL_PERIOD: SignedDuration = SignedDuration::from_secs(5);
/// In km/h, the fix-to-fix ground speed of a take-off run.
const TAKE_OFF_SPEED: f64 = 50.0;
/// The shortest take-off run.
const TAKE_OFF_RUN: SignedDuration = SignedDuration::from_secs(10);
/// In m, how far a flight climbs above the higher of the ground periods
/// around it, which a car tow or a taxi does not. A still period this far
/// above the lowest ground seen so far needs a rest to be a ground period.
const CLIMB: i32 = 50;
/// In m, how far the glider moves over the ground while it rests.
const REST_RADIUS: f64 = 5.0;
/// The shortest rest. A glider hovering in wave drifts out of the rest radius
/// sooner, while a glider on the ground rests for longer.
const REST_TIME: SignedDuration = SignedDuration::from_secs(20);

/// Finds the flights in a recording. A flight whose take-off run is already
/// under way at the first fix has no take-off, and one that reaches the last
/// fix has no landing.
pub fn detect_flights(records: &[Record], altitude_source: AltitudeSource) -> Vec<Flight> {
    let fixes = records.iter().filter_map(|record| {
        let fix = record.fix().filter(|fix| fix.valid)?;
        let time = record.time;
        Some(TimedFix { time, fix })
    });
    let fixes = fixes.collect();
    let recording = Recording {
        fixes,
        altitude_source,
    };
    recording.flights()
}

struct Recording<'a> {
    fixes: Vec<TimedFix<'a>>,
    altitude_source: AltitudeSource,
}

/// A fix with the time of its record.
#[derive(Clone, Copy)]
struct TimedFix<'a> {
    time: Timestamp,
    fix: &'a Fix,
}

/// The fixes between two ground periods, or between one and an end of the
/// file.
struct Segment {
    fixes: RangeInclusive<usize>,
    /// The first fix of the take-off run of a flight, or `None` for ground
    /// movement.
    take_off: Option<usize>,
}

impl Recording<'_> {
    fn flights(&self) -> Vec<Flight> {
        let segments = self.segments().into_iter();
        let flights = segments.filter(|segment| segment.take_off.is_some());
        flights.map(|segment| self.flight(&segment)).collect()
    }

    fn flight(&self, segment: &Segment) -> Flight {
        let (start, end) = (*segment.fixes.start(), *segment.fixes.end());
        // A take-off run that is already under way at the first fix started
        // before the recording did.
        let take_off = segment.take_off.filter(|&run| run > 1).map(|mut take_off| {
            // The take-off roll leads into the run at still speed or faster.
            while take_off > 1 && self.speed(take_off - 1) >= STILL_SPEED {
                take_off -= 1;
            }
            take_off
        });
        let landing = (end + 1 < self.fixes.len()).then(|| {
            let mut landing = end + 1;
            while landing > start + 1 && self.speed(landing) < STILL_SPEED {
                landing -= 1;
            }
            landing
        });
        Flight {
            take_off_time: take_off.map(|index| self.fixes[index].time),
            landing_time: landing.map(|index| self.fixes[index].time),
        }
    }

    /// The moving segments, each with its take-off when it is a flight.
    fn segments(&self) -> Vec<Segment> {
        let mut segments = Vec::new();
        let mut start = 0;
        let mut ground_before = None;
        for period in self.ground_periods() {
            let ground = self.median_altitude(period.clone());
            if *period.start() > start {
                let fixes = start..=*period.start() - 1;
                let higher_ground = ground_before.map_or(ground, |before: i32| before.max(ground));
                segments.push(self.segment(fixes, Some(higher_ground)));
            }
            start = *period.end() + 1;
            ground_before = Some(ground);
        }
        if start < self.fixes.len() {
            segments.push(self.segment(start..=self.fixes.len() - 1, ground_before));
        }
        segments
    }

    /// Tells a flight from ground movement by its take-off run and by its climb
    /// above the higher median altitude of the ground periods around it.
    fn segment(&self, fixes: RangeInclusive<usize>, ground: Option<i32>) -> Segment {
        let highest = fixes.clone().map(|index| self.altitude(index)).max();
        let climbs = ground.is_none_or(|ground| highest >= Some(ground + CLIMB));
        let take_off = self.take_off_run(fixes.clone()).filter(|_| climbs);
        Segment { fixes, take_off }
    }

    /// The first fix of the take-off run, the first stretch of fixes that the
    /// glider reaches faster than the take-off speed and that lasts long
    /// enough. The run lasts from the fix before its first fix, where the fast
    /// movement begins.
    fn take_off_run(&self, fixes: RangeInclusive<usize>) -> Option<usize> {
        let mut run_start = None;
        fixes.filter(|&index| index > 0).find_map(|index| {
            if self.speed(index) <= TAKE_OFF_SPEED {
                run_start = None;
                return None;
            }
            let start = *run_start.get_or_insert(index);
            let run = self.duration(start - 1..=index);
            (run >= TAKE_OFF_RUN).then_some(start)
        })
    }

    /// The still periods in which the glider stands on the ground. The first
    /// fix stands in for the ground when no ground period comes before a
    /// still period. A still period at either end of the file needs no rest,
    /// because the recording may cut the rest short.
    fn ground_periods(&self) -> Vec<RangeInclusive<usize>> {
        let last = self.fixes.len() - 1;
        let mut lowest_ground = self.altitude(0);
        let mut ground_periods = Vec::new();
        for period in self.still_periods() {
            let altitude = self.median_altitude(period.clone());
            let is_raised = altitude > lowest_ground + CLIMB;
            let is_at_start_or_end = *period.start() == 0 || *period.end() == last;
            if is_raised && !is_at_start_or_end && !self.has_rest(period.clone()) {
                continue;
            }
            lowest_ground = lowest_ground.min(altitude);
            ground_periods.push(period);
        }
        ground_periods
    }

    /// Whether the glider stays within the rest radius of one fix for the rest
    /// time, from the start of the period to the end of the still window of
    /// its last fix.
    fn has_rest(&self, period: RangeInclusive<usize>) -> bool {
        let (start, end) = (*period.start(), self.still_window_end(*period.end()));
        (start..=end).any(|from| {
            // The rest from a fix lasts until the glider first moves farther
            // than the rest radius away from it.
            let rest_end = (from..=end)
                .take_while(|&to| distance(self.fixes[from].fix, self.fixes[to].fix) <= REST_RADIUS)
                .last()
                .unwrap_or(from);
            self.duration(from..=rest_end) >= REST_TIME
        })
    }

    /// The runs of still fixes, joined across short stretches of moving
    /// fixes, that are long enough to count.
    fn still_periods(&self) -> Vec<RangeInclusive<usize>> {
        let last = self.fixes.len() - 1;
        let still = (0..=last).filter(|&index| self.is_still(index));
        let still = still.collect::<Vec<_>>();
        let runs = still.chunk_by(|&a, &b| b == a + 1 || self.duration(a..=b) <= STILL_GAP);
        let runs = runs.map(|run| run[0]..=run[run.len() - 1]);
        let periods = runs.filter(|run| {
            let (start, end) = (*run.start(), *run.end());
            start == 0
                || self.duration(run.clone()) >= STILL_PERIOD
                || (end == last && end - start >= 2)
        });
        periods.collect()
    }

    /// Whether the glider stands still from a fix on: the window after it is
    /// slow at every fix and keeps its altitude.
    fn is_still(&self, index: usize) -> bool {
        let last = self.fixes.len() - 1;
        let window_end = self.still_window_end(index);
        // A fix before a recording gap is judged with its neighbours instead.
        let window = if window_end > index {
            index..=window_end
        } else {
            index.saturating_sub(1)..=(index + 1).min(last)
        };
        let (start, end) = (*window.start(), *window.end());
        if start == end {
            return false;
        }

        let is_slow = (start + 1..=end).all(|index| self.speed(index) < STILL_SPEED);
        is_slow && self.altitude_range(window) <= self.still_altitude_range()
    }

    /// The last fix of the still window that starts at a fix.
    fn still_window_end(&self, index: usize) -> usize {
        let end = self.fixes[index].time + STILL_WINDOW;
        self.fixes.partition_point(|fix| fix.time <= end) - 1
    }

    /// In m, the widest altitude range of a still window.
    fn still_altitude_range(&self) -> i32 {
        match self.altitude_source {
            AltitudeSource::Pressure => 6,
            AltitudeSource::Gnss => 20,
        }
    }

    /// The altitude range of the fixes without their single highest and
    /// lowest value, so that a spike such as a dropout to zero does not break
    /// a ground period.
    fn altitude_range(&self, fixes: RangeInclusive<usize>) -> i32 {
        let altitudes = self.sorted_altitudes(fixes);
        let trim = usize::from(altitudes.len() >= 5);
        altitudes[altitudes.len() - 1 - trim] - altitudes[trim]
    }

    fn median_altitude(&self, fixes: RangeInclusive<usize>) -> i32 {
        let altitudes = self.sorted_altitudes(fixes);
        altitudes[altitudes.len() / 2]
    }

    fn sorted_altitudes(&self, fixes: RangeInclusive<usize>) -> Vec<i32> {
        let mut altitudes = fixes.map(|index| self.altitude(index)).collect::<Vec<_>>();
        altitudes.sort_unstable();
        altitudes
    }

    fn altitude(&self, index: usize) -> i32 {
        self.fixes[index].fix.altitude(self.altitude_source)
    }

    /// The ground speed from the fix before, in km/h.
    fn speed(&self, index: usize) -> f64 {
        speed(self.fixes[index - 1], self.fixes[index])
    }

    fn duration(&self, fixes: RangeInclusive<usize>) -> SignedDuration {
        let time = |index: usize| self.fixes[index].time;
        time(*fixes.end()).duration_since(time(*fixes.start()))
    }
}

/// The ground speed between two fixes, in km/h.
fn speed(from: TimedFix, to: TimedFix) -> f64 {
    let seconds = to.time.duration_since(from.time).as_secs_f64();
    distance(from.fix, to.fix) / seconds * 3.6
}

/// The great circle distance between two fixes, in m.
fn distance(from: &Fix, to: &Fix) -> f64 {
    const EARTH_RADIUS: f64 = 6_371_000.0;
    let (latitude_from, latitude_to) = (from.latitude.to_radians(), to.latitude.to_radians());
    let latitude = (latitude_to - latitude_from) / 2.0;
    let longitude = (to.longitude - from.longitude).to_radians() / 2.0;
    let haversine =
        latitude.sin().powi(2) + latitude_from.cos() * latitude_to.cos() * longitude.sin().powi(2);
    2.0 * EARTH_RADIUS * haversine.sqrt().asin()
}
