#!/usr/bin/env python3
"""Recompute days with handicap overrides and list the rows that don't match.

Usage: check.py tables.jsonl <day-prefix> [--hmin] [--dq-penalty] [--unique] [CN=H ...]

CN=H replaces the published handicap of one competitor, or adds it when the day has no Handicap column.
--hmin uses the unrounded lowest handicap as reference. --dq-penalty scores disqualified rows with their
penalty. --unique also tests, for every CN=H, whether H - 0.001 or H + 0.001 reproduces all rows as well.
"""
import sys

from common import load, mismatches, name, recompute


def bad_rows(recs, hcaps, hmin):
    return sum(len(mismatches(recompute(rec, hcaps, hmin))[1]) for rec in recs)


def main():
    path, prefix = sys.argv[1], sys.argv[2]
    hmin = "--hmin" in sys.argv
    hcaps = {k: float(v) for k, v in (a.split("=") for a in sys.argv[3:] if "=" in a)}
    recs = load(path, prefix, "--dq-penalty" in sys.argv)
    for rec in recs:
        day = recompute(rec, hcaps, hmin)
        plain, bad = mismatches(day)
        detail = [(r["cn"], round(r["raw"], 2), r["pts"]) for r in bad]
        print(name(rec), f"{len(plain) - len(bad)}/{len(plain)}", f'Pm={day["pm"]:.2f} published={day["Pm_pub"]}', detail)
    if "--unique" in sys.argv:
        for cn, h in sorted(hcaps.items()):
            alts = [round(h + d, 3) for d in (-0.001, 0.001) if bad_rows(recs, {**hcaps, cn: round(h + d, 3)}, hmin) == 0]
            print(f"{cn:>5} {h} {'unique' if not alts else f'also matches with {alts}'}")


if __name__ == "__main__":
    main()
