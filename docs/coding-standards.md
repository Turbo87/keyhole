# Coding Standards

Judgement calls that review checks. CI already enforces formatting, lints and the docs build.

## Engine inputs

An engine stage takes the narrow inputs it reads, such as an options struct, rather than a whole `RuleSetEdition`. The caller maps edition data onto those inputs, so each stage depends only on the values it checks.

## Required data

Data that the rules or the IGC specification require is a non-optional field. When an input lacks it, the step returns an error, so later steps never handle its absence.

## Doc comments

A doc comment says what a value holds, where it comes from or which unit it uses. Properties that follow from that description stay unstated.

## Domain terms

Names, doc comments and commit messages use the terms from `GLOSSARY.md` and replace the words in each entry's _Avoid_ list.

## Research notes

A research note cites its data by public reference: WeGlide flights by their flight page, and SoaringSpot files by competition, class, day and file name, linked to the competition page. Local tools, lists and folders are described in words.
