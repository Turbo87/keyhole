#!/usr/bin/env python3
"""PROTOTYPE: summarise flights.jsonl from the start selection spike.

Usage: python3 summarise.py flights.jsonl [--list CATEGORY]
"""
import collections, json, sys


def key(o, racing):
    if o is None:
        return None
    if o["finish"] is not None:
        return (2, -o["scored_time"], 0)
    if racing:
        return (1, round(o["distance_m"] / 10), 0)  # 10 m buckets: SoaringSpot shows 0.01 km
    return (1, o["reached"], 0)


def classify(r):
    cs = r["crossings"]
    if r["pub_start"] is None or r["rank"] in ("DNS",):
        return "no published start", None
    if not cs:
        return "no crossing found", None
    if r["matched"] is None:
        return "published start matches no crossing", None
    racing = r["task_type"] == "polygon"
    m = r["matched"]
    valid = [i for i, c in enumerate(cs) if c["outcome"] is not None]
    if m not in valid:
        return "picked a crossing with the engine running", None
    if len(valid) == 1:
        return "single crossing", None
    keys = {i: key(cs[i]["outcome"], racing) for i in valid}
    best = max(keys.values())
    best_set = [i for i in valid if keys[i] == best]
    latest = valid[-1]
    if keys[m] != best:
        return "picked a worse start", (keys[m], best)
    if len(best_set) == 1:
        return ("best start is the last crossing" if m == latest else "best start is an earlier crossing"), None
    # tie between several crossings
    if m == best_set[-1]:
        return "tie, picked the latest of the tied", None
    if m == best_set[0]:
        return "tie, picked the earliest of the tied", None
    return "tie, picked a middle one", None


def main():
    rows = [json.loads(l) for l in open(sys.argv[1])]
    want = sys.argv[sys.argv.index("--list") + 1] if "--list" in sys.argv else None
    cats = collections.Counter()
    by_type = collections.Counter()
    multi = 0
    for r in rows:
        c, extra = classify(r)
        cats[c] += 1
        by_type[(r["task_type"], c)] += 1
        if want and want in c:
            print(r["day"], r["cn"], r["rank"], "pub", r["pub_start"], "matched", r["matched"], r["matched_dt"], r["end_reason"], extra)
            for i, x in enumerate(r["crossings"]):
                o = x["outcome"] or {}
                print(f"   {i} t={x['t']} gps={x['gps_alt']:.0f} baro={x['baro_alt']:.0f} gs={x['gs_kmh']:.0f} y={x['y']:.0f}"
                      f" tol={x['tolerance']} eng_before={x['engine_before']} eng_on={x['engine_running']} end={x['end_reason']}@{x['end_t']}"
                      f" fin={o.get('finish')} T={o.get('scored_time')} d={o.get('distance_m') and round(o['distance_m'])} reached={o.get('reached')}")
    print(f"{len(rows)} flights")
    for c, n in cats.most_common():
        print(f"{n:6}  {c}")
    print()
    for (t, c), n in sorted(by_type.items()):
        print(f"{n:6}  {t:14} {c}")


main()
