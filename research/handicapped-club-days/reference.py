#!/usr/bin/env python3
"""Recompute days with a Handicap column under both handicap references.

Usage: reference.py tables.jsonl [day-prefix]

`norm` divides by the lowest handicap rounded down to a power of ten (Naviter script 9.02 and later).
`hmin` divides by the unrounded lowest handicap (Naviter script before 9.01). Prints matching rows out of
scored rows without remark for each, and the published and recomputed Pm.
"""
import sys

from common import load, mismatches, name, recompute


def main():
    for rec in load(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ""):
        if "Handicap" not in rec["cols"]:
            continue
        out = []
        for hmin in (False, True):
            day = recompute(rec, hmin=hmin)
            plain, bad = mismatches(day)
            out.append(f'{"hmin" if hmin else "norm"}={len(plain) - len(bad)}/{len(plain)} Pm={day["pm"]:.1f}')
        print(name(rec), *out, f'published Pm={day["Pm_pub"]}')


if __name__ == "__main__":
    main()
