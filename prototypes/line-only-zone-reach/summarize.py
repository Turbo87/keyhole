"""Summarise the prototype's flights.jsonl into the README tables.

Usage: python3 summarize.py flights.jsonl [practice]

Only official days count unless `practice` is given.
"""

import collections
import json
import sys


def interval_bucket(s):
    if s <= 1:
        return "1 s"
    if s <= 3:
        return "2-3 s"
    if s <= 5:
        return "4-5 s"
    return "6+ s"


def era(day):
    date = day.split("/")[-1]
    return "to 2024-05-10" if date < "2024-05-11" else "from 2024-05-11"


def depth_of(z, method):
    d = z[f"depth_{method}_m"]
    return float("-inf") if d is None else d


flights = [json.loads(line) for line in open(sys.argv[1])]
if "practice" in sys.argv[2:]:
    flights = [f for f in flights if f["status"] != "official"]
else:
    flights = [f for f in flights if f.get("status", "official") == "official"]
zones = [(f, z) for f in flights for z in f["zones"]]
reached = [(f, z) for f, z in zones if z["reached"] in ("fix", "line")]
line = [(f, z) for f, z in zones if z["reached"] == "line"]

print(f"flights {len(flights)}, zone achievements {len(reached)}, line-only {len(line)}\n")


def table(key, title):
    total = collections.Counter(key(f, z) for f, z in reached)
    only = collections.Counter(key(f, z) for f, z in line)
    extra = collections.Counter(key(f, z) for f, z in reached if z.get("line_segments", 0) > 0)
    print(f"| {title} | Achievements | Line-only | Rate | With a line-only segment |")
    print("|---|---|---|---|---|")
    for k in sorted(total):
        print(f"| {k} | {total[k]} | {only[k]} | {only[k] / total[k]:.3%} | {extra[k]} |")
    print()


table(lambda f, z: z["shape"], "Shape")
table(lambda f, z: f["rule_set"], "Rule set")
table(lambda f, z: interval_bucket(f["interval_s"]), "Fix interval")
table(lambda f, z: (z["shape"], interval_bucket(f["interval_s"])), "Shape, interval")
table(lambda f, z: (f["rule_set"], z["shape"]), "Rule set, shape")

print("Depth of line-only reaches (geodesic):")
depth = collections.Counter()
for f, z in line:
    d = z["depth_geodesic_m"]
    depth["< 0.1 m" if d < 0.1 else "< 1 m" if d < 1 else "< 10 m" if d < 10 else "< 50 m" if d < 50 else ">= 50 m"] += 1
print(dict(depth), "\n")

print("Segment geometry, zones without a fix inside:")
no_fix = [(f, z) for f, z in zones if z["reached"] != "fix"]
for m in ("geodesic", "azimuthal", "latlon"):
    print(m, sum(depth_of(z, m) >= 0 for f, z in no_fix))
disagree = [
    (f["day"], f["cn"], z["index"], z["depth_geodesic_m"], z["depth_azimuthal_m"], z["depth_latlon_m"])
    for f, z in no_fix
    if len({depth_of(z, m) >= 0 for m in ("geodesic", "azimuthal", "latlon")}) > 1
]
print("disagreements", disagree, "\n")

print("Racing, published result against the two rules:")
racing = [f for f in flights if f["aat"] is None and f["task_type"] != "assigned_area"]
for f in racing:
    if f["achieved_line"] == f["achieved_fix"]:
        continue
    lo = [z for z in f["zones"] if z["reached"] == "line"]
    tag = f"{f['day']} {f['cn']} {f['rule_set']} {f['interval_s']}s " + ", ".join(
        f"tp{z['index']} {z['shape']} depth {z['depth_geodesic_m']:.1f} m fix {z['best_fix_depth_m']:.0f} m seg {z['segment_s']} s"
        for z in lo
    )
    if f["finisher"]:
        verdict = "finisher" if f["achieved_line"] == f["intermediate"] else "finisher, line walk incomplete"
        print(f"  CREDITED ({verdict}) {tag}")
    else:
        dl = f["pub_distance_m"] - f["racing_line_m"]
        dx = f["pub_distance_m"] - f["racing_fix_m"]
        print(f"  outlander pub-line {dl:.0f} m pub-fix {dx:.0f} m {tag} | {f['remarks']}")

print("\nAAT, finisher status of flights with a line-only area:")
aat = [f for f in flights if f["task_type"] == "assigned_area"]
for f in aat:
    if f["achieved_line"] == f["achieved_fix"]:
        continue
    lo = [z for z in f["zones"] if z["reached"] == "line"]
    print(
        f"  {'finisher' if f['finisher'] else 'outlander'} {f['day']} {f['cn']} {f['rule_set']} {f['earth']} {f['interval_s']}s "
        + ", ".join(f"area{z['index']} {z['shape']} depth {z['depth_geodesic_m']:.1f} m fix {z['best_fix_depth_m']:.0f} m" for z in lo)
        + f" | {f['remarks']}"
    )

print("\nAAT finishers with a line-only area, variant minus published (m):")
names = ["deepest_point_m", "entry_exit_m", "inside_part_m", "whole_segment_m", "nearest_fix_m", "both_fixes_m"]
for f in aat:
    v = f["aat"]
    if not v or v["fixes_only_m"] is not None:
        continue
    print(
        f"  {f['day']} {f['cn']} {f['earth']} {era(f['day'])} {f['interval_s']}s "
        + " ".join(f"{n[:-2]} {v[n] - f['pub_distance_m']:+.1f}" for n in names)
    )

print("\nAAT finishers without a line-only area, optimum minus published, by era:")
res = collections.defaultdict(list)
for f in aat:
    v = f["aat"]
    if v and v["fixes_only_m"] is not None:
        res[(era(f["day"]), f["earth"])].append(v["fixes_only_m"] - f["pub_distance_m"])
for k, r in sorted(res.items()):
    r.sort()
    within = sum(abs(x) <= 1 for x in r)
    print(f"  {k}: {len(r)} finishers, {within} within 1 m, median {r[len(r) // 2]:+.1f} m")

print("\nNear misses, first zone not reached by fix or segment, nearest approach within 500 m:")
for f, z in zones:
    if z["reached"] != "missed":
        continue
    gap = -max(z["best_fix_depth_m"], depth_of(z, "geodesic"))
    if gap <= 500:
        status = "finisher" if f["finisher"] else "outlander"
        extra = ""
        if f["racing_line_m"] is not None:
            extra = f" pub-line {f['pub_distance_m'] - f['racing_line_m']:.0f} m"
        print(
            f"  {status} {f['day']} {f['cn']} {f['rule_set']} {f['task_type']} zone{z['index']} {z['shape']} gap {gap:.0f} m"
            f" fix gap {-z['best_fix_depth_m']:.0f} m{extra} | {f['remarks']}"
        )
