# Oracle fixtures

Each directory `<competition>/<class>/<date>/` holds one SoaringSpot class day as soaringspot-downloader writes it, and `cargo test` scores every one of them with the oracle harness.

- `task.json` is copied unchanged.
- `results.csv` replaces `contestant` with `Crew <CN>`, and a non-empty `club` or `team` with `Club <CN>` or `Team <CN>`. Every remark is reviewed by hand for personal data before committing.
- `fixture.toml` is written by hand.

`task.html`, `results.html` and IGC files are never committed, since they name people.

## `fixture.toml`

```toml
edition = "FAI Annex A 2025a"    # the ID of the rule set edition the fixture scores under
flown_under = "unknown"          # the edition the competition flew under, informational

# The class's own values. `handicapped` transcribes the task info line's
# handicapping flag, and a handicapped class needs the scale of its Handicap
# column.
[class]
dm = 120
d1 = 300
handicapped = false
# handicap_scale = "1.000"       # or "100"

# The competition's local procedures as rule overrides of the class. Every
# field is optional and defaults to the edition's value.
[class.rule_overrides]
earth_model = "FAI Sphere"       # or "WGS84"
pev_start = true
pev_wait_time = 5                # minutes
pev_start_window = 8             # minutes

# The class day's rule overrides, which win over the class's. Optional.
[class_day]
dm = 50

# Transcribed from the task info line of results.html, with decimal points.
# An invalid day publishes no F, FCR or maximum points, so leaving out all
# three publishes the day as not valid. Without a task info line, leave out the
# section and only rows are compared.
[published_day_parameters]
d1 = 300
n = 19
n1 = 19
n2 = 19
do = 439.38
vo = 120.27
f = 1.000
fcr = 1.000
maximum_points = 1000

# Scorer decisions the download lacks, by competition ID. They win over the
# decisions derived from results.csv.
[decisions.AB]
result = "did_not_fly"
# result = { finished = { start_time = "13:31:11", finish_time = "17:01:24", distance = 421.39 } }
# result = { landed = { start_time = "13:31:11", distance = 120.5 } }
penalty = 50
hors_concours = true
handicap = 1.062

# Known deviations from the published values. Leave out `competition_id` for a
# day parameter. A recorded deviation that no longer occurs fails the test.
[[deviations]]
competition_id = "AB"
field = "points"    # d1 n n1 n2 do vo f fcr maximum_points validity rank points penalty distance speed start_time finish_time
explanation = "Why Keyhole and SeeYou differ."
```

The harness derives each row's decisions from `results.csv`: `DNF` did not fly, `HC` hors concours, the `Handicap` column the result's handicap override, `DNS` a manual result landed without starting at 0 km, `penalty_points` the penalty rounded to whole points, and every other row a manual result from its start and finish times and distance. A remark minus its trailing penalty points becomes an official warning when it is in the official warning group, otherwise the penalty's public remark, and is only reported when neither applies. Remarks are never compared. Rows are paired by competition ID, so the order of tied rows is never compared. Values are compared at the precision SoaringSpot displays: ranks as written, points, `D1` and maximum points as whole numbers, a penalty from the download as published against the whole points Keyhole deducts, distances, speeds, `Do` and `Vo` to 0.01, `F` and `FCR` to 0.001, and times to the second. Like SoaringSpot, rows show distances and speeds before the handicap divides them, and a row without a counting result at 0 km.
