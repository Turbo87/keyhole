# Oracle fixtures

Each directory `<competition>/<class>/<date>/` holds one SoaringSpot class day as soaringspot-downloader writes it, and `cargo test` scores every one of them with the oracle harness.

- `task.json` is copied unchanged.
- `results.csv` replaces `contestant` with `Crew <CN>`, and a non-empty `club` or `team` with `Club <CN>` or `Team <CN>`. Every remark is reviewed by hand for personal data before committing.
- `fixture.toml` is written by hand.

`task.html`, `results.html` and IGC files are never committed, since they name people.

## `fixture.toml`

```toml
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
# result = { flown = { distance = 421.39, time = "3:30:13" } }    # finished
# result = { flown = { distance = 120.5 } }                         # landed
penalty = 50
hors_concours = true

# Known deviations from the published values. Leave out `competition_id` for a
# day parameter. A recorded deviation that no longer occurs fails the test.
[[deviations]]
competition_id = "AB"
field = "points"    # d1 n n1 n2 do vo f fcr maximum_points rank points penalty distance speed
explanation = "Why Keyhole and SeeYou differ."
```

The harness derives each row's decisions from `results.csv`: `DNF` did not fly, `HC` hors concours, `DNS` landed at 0 km, `penalty_points` the penalty rounded to whole points, and every other row flew its published distance, in the time from its start to its finish if it has one. Rows are paired by competition ID, so the order of tied rows is never compared. Values are compared at the precision SoaringSpot displays: ranks as written, points, `D1` and maximum points as whole numbers, a penalty from the download as published against the whole points Keyhole deducts, distances and speeds, `Do` and `Vo` to 0.01, and `F` and `FCR` to 0.001.
