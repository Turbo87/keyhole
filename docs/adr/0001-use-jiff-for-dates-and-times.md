# Use jiff for dates and times

Keyhole uses the `jiff` crate for every date, time and duration, and its types appear directly in the engine's API without newtypes around them. A point in time is a `Timestamp`, a calendar date such as the recorded date or the flight date is a `civil::Date`, and elapsed time is a `SignedDuration`. The standard library's `Duration` is not used, because time differences in scoring are naturally signed and one duration type avoids conversions where durations meet points in time.

`jiff` is built with the bundled time zone database only, without the `tz-system` feature and without reading the operating system's zoneinfo. Two machines scoring the same competition must turn the same local times into the same points in time, and an older system database after a change in a country's daylight saving rules would break that while the rules hash stays equal. Updating the zone rules therefore means updating `jiff-tzdb` in `Cargo.lock`. The engine never looks at the host's own time zone.

The start opening time, the start closing time and the scoring end time are local times of day as `civil::Time`, not points in time. Rule overrides apply to a whole class as well as to a single class day, and a time of day applies to every class day it is resolved for. Analysis turns them into points in time with the class day's date and the competition time zone.

The competition time zone is therefore part of the effective parameters and of the rules hash. Changing it moves every start opening time and scoring end time, so two publishes under different time zones were not scored under the same rules. It is an IANA time zone and never a fixed offset, because a competition can span a change of daylight saving time, and `resolve()` rejects any other time zone.
