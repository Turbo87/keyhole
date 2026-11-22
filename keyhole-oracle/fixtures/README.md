# Oracle fixtures

Each directory `<competition>/<class>/<date>/` holds one SoaringSpot class day as soaringspot-downloader writes it, and `cargo test` scores every one of them with the oracle harness.

- `task.json` is copied unchanged.
- `results.csv` replaces `contestant` with `Crew <CN>`, and a non-empty `club` or `team` with `Club <CN>` or `Team <CN>`. Every remark is reviewed by hand for personal data before committing.
- IGC files have names removed from their H records and appended `LCU::HP` records, except Tobias Bieniek's own flights.
- `fixture.toml` is written by hand.

`task.html` and `results.html` are never committed, since they name people.

## `fixture.toml`

```toml
# The built-in rule set edition that the harness scores the fixture under. It
# stays fixed when a newer edition ships.
rule_set = "FAI Annex A 2025a"
# The edition that the competition was actually scored under, when known. The
# harness never reads it, and Keyhole may not ship it.
original_rule_set = "FAI Annex A 2022"
# When the task info line says "handicapping enabled".
handicapped = true

# The class's Dm and D1 and the local procedures as rule overrides, applied to
# the edition's defaults. Dm and D1 default to the lowest class's 100 and 250.
[rule_overrides]
earth_model = "fai_sphere"    # wgs84 fai_sphere
dm = 120
d1 = 300

# Transcribed from the task info line of results.html, with decimal points.
# The line of a class day failing the day validity rule says "Day not valid"
# and leaves out F, FCR and the maximum points, which are then left out here.
# A class day whose line states no day parameters leaves out this section and
# compares its rows only.
[published_day_parameters]
valid = false    # only when the class day fails the day validity rule
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
handicap = 1.08    # on the class's handicap scale

# Known deviations from the published values. Leave out `competition_id` for a
# day parameter. A recorded deviation that no longer occurs fails the test.
[[deviations]]
competition_id = "AB"
field = "points"    # task_distance bearing validity d1 n n1 n2 do vo f fcr maximum_points rank points penalty distance speed
explanation = "Why Keyhole and SeeYou differ."
```

The harness derives each row's decisions from `results.csv`: `DNF` did not fly, `HC` hors concours, `DNS` landed at 0 km, `penalty_points` the penalty rounded to whole points, `handicap` the handicap in a handicapped class, where every row needs one and the largest handicap puts every handicap on the 1000 scale from 500, on the 100 scale from 10 and on the 1.000 scale below, and every other row flew its published distance, in the time from its start to its finish if it has one. A remark minus its trailing penalty points becomes the penalty's public remark when the row has a penalty, otherwise an official warning when it is in the official warning group, and is only reported when neither applies. Remarks are never compared. Rows are paired by competition ID, so the order of tied rows is never compared. Values are compared at the precision SoaringSpot displays: the day validity verdict and ranks as written, points, `D1` and maximum points as whole numbers, a penalty from the download as published against the whole points Keyhole deducts, distances and speeds, `Do` and `Vo` to 0.01 with a row without a counting result at 0 km as SoaringSpot shows it, and `F` and `FCR` to 0.001.

A `polygon` class day also compares its task. The harness converts `task.json` into a racing task on the effective earth model, without a take-off or landing point, and treats SeeYou's symmetric start and finish as next and previous. The task distance has to match `task_distance` within 1 m, since SeeYou stores it as a 32-bit float. The start bearing has to match `oz_angle12` within 0.001° and every other bearing within 1.5°, since SeeYou measures each course where its leg begins and Keyhole at the reference point (ADR 0003). A bearing that doesn't shape its zone, as for a cylinder, isn't compared. SeeYou's `oz_move` isn't modelled.

## Full-data suite

The opt-in full-data suite scores every class day of a local soaringspot-downloader output the same way, with decisions derived from the download alone. It runs only when `KEYHOLE_ORACLE_DATASET` names the output directory:

```sh
KEYHOLE_ORACLE_DATASET=<directory> cargo test -p keyhole-oracle --test full_data -- --nocapture
```

The report groups mismatches by field and cause, with day parameters first, and lists the mismatches of rows with remarks of unknown effect apart as allowed failures. It counts those rows and how many of them match anyway, and the class days it leaves out: cancelled days, competitions under national rules, handicapped days without a `Handicap` column and handicapped days scored with SeeYou's handicap reference before version 9.01. Neither `task.json` nor the task info line states the earth model, so a list in `src/full_data.rs` names the competitions and classes scored on the FAI Sphere. The repository names competitions only in the slug table of `src/rule_set_family.rs`, in that list and in the last exclusion.

Setting `KEYHOLE_ORACLE_ACCEPT` as well writes every mismatch except the allowed failures to `keyhole-oracle-baseline.toml` inside the dataset directory, as an array of tables per class day, such as `[["<competition>/<class>/<date>"]]`, whose rows have the fields of a fixture file's `[[deviations]]` and record the published and Keyhole values. Later runs fail on a mismatch the baseline lacks or records with other values, and on a baseline row that no longer occurs. Accept mode writes nothing while any class day has an error, so a class day error always fails the suite.
