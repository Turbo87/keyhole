#!/usr/bin/env python3
"""Report how SoaringSpot ranks and orders equal points in daily and total tables from parse_pages.py.

Usage: ties.py tables.jsonl [--list]
"""
import json
import re
import sys
from collections import Counter


def points(row, col):
    try:
        return int(row[col][0].replace(",", "").split()[0])
    except (ValueError, IndexError):
        return None


def rank(row):
    m = re.fullmatch(r"(\d+)\.?", row["#"][0])
    return int(m.group(1)) if m else row["#"][0]


def main():
    listing = "--list" in sys.argv
    stats = Counter()
    for line in open(sys.argv[1], encoding="utf-8"):
        rec = json.loads(line)
        daily = rec["table"] == "result-daily"
        if daily and (rec.get("task") or {}).get("result_status") not in ("official", "unofficial"):
            continue
        col = "Points" if daily else "Total"
        kind = "daily" if daily else "total"
        rows = [r for r in rec["rows"] if isinstance(rank(r), int)]
        stats[f"{kind} tables"] += 1
        for pos, r in enumerate(rows, 1):
            # Ranks are competition ranking ("1224") if every row's rank is the
            # position of the first row with the same points.
            first = next(i for i, q in enumerate(rows, 1) if points(q, col) == points(r, col))
            stats[f"{kind} rows"] += 1
            stats[f"{kind} rank == first position with these points"] += rank(r) == first
        groups = {}
        for r in rows:
            groups.setdefault(points(r, col), []).append(r)
        for pts, g in groups.items():
            if len(g) < 2:
                continue
            stats[f"{kind} tie groups"] += 1
            if pts == 0:
                stats[f"{kind} tie groups at 0 points"] += 1
            keys = [float(r[col][1]) for r in g]
            stats[f"{kind} tie groups ordered by descending data-value"] += keys == sorted(keys, reverse=True)
            stats[f"{kind} tie groups with distinct data-values"] += len(set(keys)) == len(keys)
            cns = [r["CN"][0] for r in g]
            stats[f"{kind} tie groups ordered by CN"] += cns == sorted(cns)
            if listing and pts:
                print(kind, rec["comp"], rec["class"], rec["page"], pts, [(r["#"][0], r["CN"][0], r[col][1]) for r in g])
    for k, v in sorted(stats.items()):
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()
