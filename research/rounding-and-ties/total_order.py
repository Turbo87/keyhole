#!/usr/bin/env python3
"""Test which order SoaringSpot uses for equal totals, using parse_pages.py output.

Usage: total_order.py tables.jsonl
"""
import json
import re
import sys
from collections import Counter, defaultdict


def points(row, col):
    try:
        return int(row[col][0].replace(",", "").split()[0])
    except (ValueError, IndexError):
        return None


def is_sorted(keys):
    return keys == sorted(keys)


def day_ranks(dailies, key, cn):
    ranks = []
    for k, rec in dailies.items():
        if k[:2] == key[:2] and k[2] <= key[2] and (rec.get("task") or {}).get("result_status") != "cancelled":
            for r in rec["rows"]:
                m = re.fullmatch(r"(\d+)\.", r["#"][0])
                if r["CN"][0] == cn and m:
                    ranks.append(int(m.group(1)))
    return ranks


def main():
    totals, dailies = {}, {}
    for line in open(sys.argv[1], encoding="utf-8"):
        rec = json.loads(line)
        m = re.match(r"task-(\d+)-", rec["page"])
        if not m:
            continue
        key = (rec["comp"], rec["class"], int(m.group(1)))
        (totals if rec["table"] == "result-total-daily" else dailies)[key] = rec
    stats = Counter()
    examples = []
    for key, total in sorted(totals.items()):
        daily = dailies.get(key)
        if not daily:
            continue
        day_pos = {r["CN"][0]: i for i, r in enumerate(daily["rows"])}
        earlier = [k for k in totals if k[:2] == key[:2] and k[2] < key[2]]
        before = totals[max(earlier)]["rows"] if earlier else []
        before_pos = {r["CN"][0]: i for i, r in enumerate(before)}
        groups = defaultdict(list)
        for r in total["rows"]:
            if re.fullmatch(r"\d+", r["#"][0]):
                groups[points(r, "Total")].append(r)
        for pts, g in groups.items():
            if len(g) < 2 or not pts:
                continue
            cns = [r["CN"][0] for r in g]
            stats["tie groups"] += 1
            by_day = is_sorted([day_pos.get(c, 999) for c in cns])
            stats["in order of the day's results table"] += by_day
            stats["in order of the previous total"] += bool(before) and is_sorted([before_pos.get(c, 999) for c in cns])
            stats["in CN order"] += is_sorted(cns)
            stats["in contestant name order"] += is_sorted([r["Contestant"][0] for r in g])
            # Annex A 10.2.2 countback: most first places, then most second places, and so on.
            placings = [sorted(day_ranks(dailies, key, c)) for c in cns]
            stats["in countback order (Annex A 10.2.2)"] += is_sorted(placings)
            stats["countback undecided"] += len(set(map(tuple, placings))) < len(placings)
            if not by_day and len(examples) < 10:
                examples.append((key, pts, cns, [day_pos.get(c) for c in cns]))
    for k, v in stats.items():
        print(f"{k}: {v}")
    for e in examples:
        print(*e)


if __name__ == "__main__":
    main()
