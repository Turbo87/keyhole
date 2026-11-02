#!/usr/bin/env python3
"""Find the lowest handicap that turns recovered H / Hmin ratios into a three-decimal list.

Usage: hmin_search.py tables.jsonl <comp>/<class> [--dq-penalty] CN=ratio ...

Under the unrounded Hmin reference, only ratios between handicaps matter, so recover.py yields H / Hmin.
For each candidate Hmin from 0.950 to 1.059, H = round(ratio * Hmin, 3) and every task day is recomputed
with the unrounded lowest handicap as reference. Prints the best candidates and the list for the best one.
"""
import sys

from common import load, mismatches, recompute


def main():
    path, cls = sys.argv[1], sys.argv[2]
    ratios = {k: float(v) for k, v in (a.split("=") for a in sys.argv[3:] if "=" in a)}
    recs = load(path, cls + "/task", "--dq-penalty" in sys.argv)
    results = []
    for k in range(950, 1060):
        hcaps = {cn: round(r * k / 1000, 3) for cn, r in ratios.items()}
        counts = [mismatches(recompute(rec, hcaps, hmin=True)) for rec in recs]
        total = sum(len(plain) for plain, _ in counts)
        results.append((total - sum(len(bad) for _, bad in counts), total, k / 1000))
    results.sort(reverse=True)
    for ok, total, hm in results[:5]:
        print(f"Hmin {hm}: {ok}/{total}")
    best = results[0][2]
    print(" ".join(f"{cn}={round(r * best, 3)}" for cn, r in sorted(ratios.items())))


if __name__ == "__main__":
    main()
