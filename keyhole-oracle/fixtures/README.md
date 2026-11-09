# Oracle fixtures

Each directory `<competition>/<class>/<date>/` holds one SoaringSpot class day as soaringspot-downloader writes it, and `cargo test` scores every one of them with the oracle harness.

- `task.json` is copied unchanged.
- `results.csv` replaces `contestant` with `Crew <CN>`, and a non-empty `club` or `team` with `Club <CN>` or `Team <CN>`. Every remark is reviewed by hand for personal data before committing.
- `fixture.toml` is written by hand.

`task.html`, `results.html` and IGC files are never committed, since they name people.

## `fixture.toml`

```toml
edition = "FAI Annex A 2025a"    # the rule set edition the fixture scores under
flown_under = "unknown"          # the edition the competition flew under, informational
earth_model = "FAI Sphere"       # or "WGS84"

[scoring_parameters]
dm = 120
d1 = 300

# Transcribed from the task info line of results.html, with decimal points.
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

# Known deviations from the published values. Leave out `competition_id` for a
# day parameter. A recorded deviation that no longer occurs fails the test.
[[deviations]]
competition_id = "AB"
field = "points"    # d1 n n1 n2 do vo f fcr maximum_points points penalty distance speed start_time finish_time
explanation = "Why Keyhole and SeeYou differ."
```

The harness derives each row's decisions from `results.csv`: `DNF` did not fly, `DNS` a manual result landed without starting at 0 km, `penalty_points` the penalty rounded to whole points, and every other row a manual result from its start and finish times and distance. Values are compared at the precision SoaringSpot displays: points, `D1` and maximum points as whole numbers, a penalty from the download as published against the whole points Keyhole deducts, distances, speeds, `Do` and `Vo` to 0.01, `F` and `FCR` to 0.001, and times to the second.
