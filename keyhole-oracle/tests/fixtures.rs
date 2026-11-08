//! Scores every committed fixture under `fixtures/<competition>/<class>/<date>`.

use std::fs;
use std::path::{Path, PathBuf};

use keyhole_oracle::{Fixture, check};

fn fixture_directories() -> Vec<PathBuf> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures");
    let mut directories = vec![root];
    for _ in 0..3 {
        directories = directories
            .iter()
            .flat_map(|directory| fs::read_dir(directory).unwrap())
            .map(|entry| entry.unwrap().path())
            .filter(|path| path.is_dir())
            .collect();
    }
    directories.sort();
    directories
}

#[test]
fn committed_fixtures_match_the_published_results() {
    let directories = fixture_directories();
    assert!(!directories.is_empty(), "no committed fixtures");

    let failures: Vec<_> = directories
        .iter()
        .filter_map(|directory| {
            let name = directory.strip_prefix(env!("CARGO_MANIFEST_DIR")).unwrap();
            match Fixture::load(directory).and_then(|fixture| check(&fixture)) {
                Ok(report) if report.passes() => None,
                Ok(report) => Some(format!("{}:\n{report}", name.display())),
                Err(error) => Some(format!("{}: {error:#}", name.display())),
            }
        })
        .collect();

    assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}

#[test]
fn committed_results_name_nobody() {
    for directory in fixture_directories() {
        let mut reader = csv::Reader::from_path(directory.join("results.csv")).unwrap();
        for row in reader.records() {
            let row = row.unwrap();
            let competition_id = &row[1];
            let placeholders = [
                (2, format!("Crew {competition_id}")),
                (4, format!("Club {competition_id}")),
                (5, format!("Team {competition_id}")),
            ];
            for (column, placeholder) in placeholders {
                let value = &row[column];
                assert!(
                    value.is_empty() || value == placeholder,
                    "{}: `{value}` isn't the placeholder `{placeholder}`",
                    directory.display()
                );
            }
        }
    }
}
