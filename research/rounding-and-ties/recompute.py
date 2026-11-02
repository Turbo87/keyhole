#!/usr/bin/env python3
"""Recompute unrounded day scores from parse_pages.py output and compare them with published points.

Usage: recompute.py tables.jsonl [--near WIDTH]

Prints match rates of rounding variants per rule set, then every row whose unrounded score lies within
WIDTH of a .5 boundary.
"""
import json
import math
import re
import sys
from collections import Counter, defaultdict


def num(s):
    return float(s.replace(",", "."))


def day_params(info):
    def grab(pat):
        m = re.search(pat, info)
        return m and m.group(1)

    n = {k: grab(rf"\b{k}: (\d+)") for k in ("N", "n1", "n2")}
    d1 = grab(r"D1 = (\d+)km")
    if None in n.values() or d1 is None:
        return None
    return {**{k: int(v) for k, v in n.items()}, "D1": float(d1) * 1000,
            "Pm_pub": grab(r"Maximum Points: (\d+)"), "Pvm_pub": grab(r"Max speed pts: (\d+)")}


def h_norm(hmin):
    for lo, hi, v in ((500, math.inf, 1000), (50, 500, 100), (5, 50, 10), (0.5, 5, 1)):
        if lo <= hmin < hi:
            return v
    return hmin


def half_up(x):
    return math.floor(x + 0.5)


def half_even(x):
    return round(x)


def rule_set(comp):
    return "DAeC" if comp.startswith(("dm", "dsm", "euregiocup")) else "FAI"


def recompute(rec):
    p = day_params(rec["info"] or "")
    task = rec.get("task") or {}
    if not p or task.get("result_status") not in ("official", "unofficial") or p["N"] == 0 or p["n1"] == 0:
        return None
    aat = task.get("task_type") == "assigned_area"
    td = task.get("task_duration") or 0
    rows = []
    for r in rec["rows"]:
        rank = r["#"][0]
        try:
            pts = int(r["Points"][0].replace(",", "").split()[0])
        except (ValueError, IndexError):
            continue
        h = num(r["Handicap"][0]) if "Handicap" in r and r["Handicap"][0] else 1.0
        rows.append({"remarks": r.get("_remarks") or [], "cn": r["CN"][0], "rank": rank, "hc": rank == "HC", "pts": pts, "h": h,
                     "t": float(r["Time"][1] or 0), "v": float(r["Speed"][1] or 0), "d": float(r["Distance"][1] or 0)})
    comp = [r for r in rows if not r["hc"]]
    if not comp:
        return None
    hn = h_norm(min(r["h"] for r in comp))
    for r in rows:
        r["dh"] = r["d"] * hn / r["h"]
        r["vh"] = r["v"] * hn / r["h"]
    d0 = max(r["dh"] for r in comp)
    v0, t0 = 0.0, 0.0
    for r in comp:
        if r["vh"] > v0 or (r["vh"] == v0 and r["vh"] > 0 and r["t"] < t0):
            v0, t0 = r["vh"], r["t"]
    if v0 and aat:
        t0 = max(t0, td)
    if d0 == 0:
        return None
    pm = min(1000.0, 1250 * d0 / p["D1"] - 250, 400 * t0 / 3600 - 200 if v0 else 1000.0)
    f = min(1.0, 1.25 * p["n1"] / p["N"])
    fcr = min(1.0, 1.2 * p["n2"] / p["n1"] + 0.6)
    pvm = 2 / 3 * p["n2"] / p["N"] * pm
    pdm = pm - pvm
    for r in rows:
        if r["v"] > 0:
            pv = pvm * (r["vh"] - 2 / 3 * v0) / (v0 / 3) if r["vh"] >= 2 / 3 * v0 else 0.0
            pd = pdm
        else:
            pv, pd = 0.0, pdm * r["dh"] / d0
        r["raw"] = f * fcr * (pv + pd)
    return {"rule": rule_set(rec["comp"]), "day": f'{rec["comp"]}/{rec["class"]}/{rec["page"][:-6]}',
            "pm": pm, "Pm_pub": p["Pm_pub"], "rows": rows}


def main():
    near = float(sys.argv[sys.argv.index("--near") + 1]) if "--near" in sys.argv else 0.01
    stats = defaultdict(Counter)
    close = []
    off_by_one = []
    for line in open(sys.argv[1], encoding="utf-8"):
        rec = json.loads(line)
        if rec["table"] != "result-daily":
            continue
        day = recompute(rec)
        if not day:
            continue
        s = stats[day["rule"]]
        s["days"] += 1
        if day["Pm_pub"] is not None:
            s["Pm display matches half_up(Pm)"] += half_up(day["pm"]) == int(day["Pm_pub"])
        for r in day["rows"]:
            if r["pts"] == 0 and r["raw"] < 0.5:
                continue
            tag = "remark" if r["remarks"] else "plain"
            s[f"{tag} rows"] += 1
            s[f"{tag} half_up"] += half_up(r["raw"]) == r["pts"]
            s[f"{tag} half_even"] += half_even(r["raw"]) == r["pts"]
            s[f"{tag} trunc"] += math.floor(r["raw"]) == r["pts"]
            if tag == "plain" and abs(half_up(r["raw"]) - r["pts"]) == 1:
                off_by_one.append((day["day"], r["cn"], r["raw"], r["pts"]))
            frac = r["raw"] - math.floor(r["raw"])
            if abs(frac - 0.5) < near:
                close.append((day["rule"], day["day"], r["cn"], r["raw"], r["pts"]))
    for rule, s in sorted(stats.items()):
        print(rule, dict(s))
    print("\nRows without remarks that differ from half_up by exactly 1 (day, CN, unrounded, published):")
    for day, cn, raw, pts in off_by_one:
        print(day, cn, f"{raw:.5f}", pts)
    print(f"\nRows within {near} of a .5 boundary (rule, day, CN, unrounded, published, half_up, half_even):")
    for rule, day, cn, raw, pts in sorted(close, key=lambda c: abs(c[3] - math.floor(c[3]) - 0.5)):
        print(rule, day, cn, f"{raw:.5f}", pts, half_up(raw), half_even(raw))


if __name__ == "__main__":
    main()
