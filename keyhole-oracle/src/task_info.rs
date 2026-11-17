//! The task info line of `results.html`, which states a class day's `Dm`, `D1`,
//! handicapping flag and day parameters. Its numbers use a decimal comma or a
//! decimal point.

use std::collections::HashMap;
use std::error::Error;
use std::str::FromStr;
use std::sync::LazyLock;

use anyhow::{Context, bail};
use regex::Regex;

use crate::fixture::PublishedDayParameters;

/// What a class day's task info line states.
#[derive(Debug)]
pub struct TaskInfo {
    pub dm: Option<f64>,
    pub d1: Option<f64>,
    /// Whether the line says "handicapping enabled".
    pub handicapped: bool,
    /// The day parameters, or `None` when the line states none, such as on a
    /// day without launches.
    pub day_parameters: Option<PublishedDayParameters>,
}

impl TaskInfo {
    pub fn parse(line: &str) -> anyhow::Result<Self> {
        static VALUE: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new(r"\b(Maximum Points|Fcr|F|Dm|D1|N|n1|n2|Do|Vo)(?::| =) (\d+(?:[.,]\d+)?)")
                .unwrap()
        });

        let mut values = HashMap::new();
        for (_, [label, value]) in VALUE.captures_iter(line).map(|captures| captures.extract()) {
            values.entry(label).or_insert(value.replace(',', "."));
        }

        let optional = |label| values.get(label).map(|value| parse(value)).transpose();
        let required = ["D1", "N", "n1", "n2", "Do", "Vo"].map(|label| values.get(label));
        let day_parameters = match required {
            [None, None, None, None, None, None] => None,
            [Some(d1), Some(n), Some(n1), Some(n2), Some(d0), Some(v0)] => {
                Some(PublishedDayParameters {
                    valid: !line.contains("Day not valid"),
                    d1: parse(d1)?,
                    n: parse(n)?,
                    n1: parse(n1)?,
                    n2: parse(n2)?,
                    d0: parse(d0)?,
                    v0: parse(v0)?,
                    f: optional("F")?,
                    fcr: optional("Fcr")?,
                    maximum_points: optional("Maximum Points")?,
                })
            }
            _ => bail!("the task info line states only part of D1, N, n1, n2, Do and Vo"),
        };

        Ok(Self {
            dm: optional("Dm")?,
            d1: optional("D1")?,
            handicapped: line.contains("handicapping enabled"),
            day_parameters,
        })
    }
}

fn parse<T: FromStr<Err: Error + Send + Sync + 'static>>(value: &str) -> anyhow::Result<T> {
    let context = || format!("invalid number `{value}` in the task info line");
    value.parse().with_context(context)
}
