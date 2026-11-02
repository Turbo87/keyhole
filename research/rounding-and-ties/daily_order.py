#!/usr/bin/env python3
"""Test which order SoaringSpot uses for equal daily points, using parse_pages.py output.

Usage: daily_order.py tables.jsonl
"""
import json
import sys
from collections import Counter, defaultdict

from recompute import recompute


def descending(keys):
    return keys == sorted(keys, reverse=True)


def main():
    stats = Counter()
    for line in open(sys.argv[1], encoding="utf-8"):
        rec = json.loads(line)
        if rec["table"] != "result-daily" or "not valid" in (rec["info"] or ""):
            continue
        day = recompute(rec)
        if not day:
            continue
        sort_key = {r["CN"][0]: float(r["Points"][1] or 0) for r in rec["rows"]}
        groups = defaultdict(list)
        for r in day["rows"]:
            if r["rank"].endswith(".") and r["pts"]:
                groups[r["pts"]].append(r)
        for g in groups.values():
            if len(g) < 2:
                continue
            by_raw = descending([r["raw"] for r in g])
            by_key = descending([sort_key[r["cn"]] for r in g])
            stats["tie groups"] += 1
            stats["in descending unrounded score"] += by_raw
            stats["in descending data-value sort key"] += by_key
            stats["in either"] += by_raw or by_key
            if not (by_raw or by_key):
                print(day["day"], [(r["cn"], round(r["raw"], 4), sort_key[r["cn"]], r["remarks"][:1]) for r in g])
    for k, v in stats.items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()
