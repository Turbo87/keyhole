#!/usr/bin/env python3
"""Recompute DAeC day scores with distances rounded to 0.1 km at different steps and compare them with
published points.

Usage: variants.py tables.jsonl [--list VARIANT]

Reads the output of `parse_pages.py` from the `research/rounding-and-ties` branch. The recomputation is
the one of `recompute.py` from that branch, with optional rounding of the credited distance D, the
handicapped distance Dh, the day's largest handicapped distance D0, and the distance used for speeds.
"""
import json
import math
import re
import sys
from collections import Counter


def half_up(x):
    return math.floor(x + 0.5)


def to_100m_half_up(m):
    return half_up(m / 100) * 100


def to_100m_trunc(m):
    return math.floor(m / 100) * 100


def unrounded(m):
    return m


ROUNDINGS = {"half_up": to_100m_half_up, "trunc": to_100m_trunc}

# Each variant names the rounded values: "D" credited distance before the handicap, "Dh" handicapped
# distance, "D0" the day's largest handicapped distance, "V" the distance that speeds are derived from.
STEPS = [(), ("D",), ("Dh",), ("D0",), ("V",), ("D", "V"), ("Dh", "V")]
VARIANTS = {"unrounded": ((), unrounded)}
VARIANTS |= {f'{"+".join(steps)} {name}': (steps, fn) for steps in STEPS[1:] for name, fn in ROUNDINGS.items()}


def num(s):
    return float(s.replace(",", "."))


def day_params(info):
    def grab(pat):
        m = re.search(pat, info)
        return m and m.group(1)

    n = {k: grab(rf"\b{k}: (\d+)") for k in ("N", "n1", "n2")}
    d1 = grab(r"D1 = (\d+)km")
    dm = grab(r"Dm = (\d+)km")
    if None in n.values() or d1 is None:
        return None
    return {**{k: int(v) for k, v in n.items()}, "D1": float(d1) * 1000, "Dm": dm and float(dm) * 1000,
            "Do_pub": grab(r"Do: ([\d,]+)km")}


def day_name(rec):
    return f'{rec["comp"]}/{rec["class"]}/{rec["page"][:-6]}'


def h_norm(hmin):
    for lo, hi, v in ((500, math.inf, 1000), (50, 500, 100), (5, 50, 10), (0.5, 5, 1)):
        if lo <= hmin < hi:
            return v
    return hmin


def rows_of(rec):
    rows = []
    for r in rec["rows"]:
        rank = r["#"][0]
        try:
            pts = int(r["Points"][0].replace(",", "").split()[0])
        except (ValueError, IndexError):
            continue
        h = num(r["Handicap"][0]) if "Handicap" in r and r["Handicap"][0] else 1.0
        rows.append({"remarks": r.get("_remarks") or [], "cn": r["CN"][0], "hc": rank == "HC", "pts": pts, "h": h,
                     "t": float(r["Time"][1] or 0), "v": float(r["Speed"][1] or 0), "d": float(r["Distance"][1] or 0)})
    return rows


def recompute(rec, steps=(), rnd=unrounded):
    """Unrounded scores per row with the values named in steps rounded by rnd, or None if the day is not scored."""
    p = day_params(rec["info"] or "")
    task = rec.get("task") or {}
    if not p or task.get("result_status") not in ("official", "unofficial") or p["N"] == 0 or p["n1"] == 0:
        return None
    aat = task.get("task_type") == "assigned_area"
    td = (task.get("task_duration") or 0) if aat else 0
    rows = rows_of(rec)
    comp = [r for r in rows if not r["hc"]]
    if not comp:
        return None
    hn = h_norm(min(r["h"] for r in comp))
    for r in rows:
        d = rnd(r["d"]) if "D" in steps else r["d"]
        r["dh"] = rnd(d * hn / r["h"]) if "Dh" in steps else d * hn / r["h"]
        # Scaling the published speed keeps rows whose speed is not distance / marking time.
        v = r["v"] * rnd(r["d"]) / r["d"] if "V" in steps and r["v"] > 0 else r["v"]
        r["vh"] = v * hn / r["h"]
    d0 = max(r["dh"] for r in comp)
    if "D0" in steps:
        d0 = rnd(d0)
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
    n1 = sum(1 for r in comp if p["Dm"] is not None and r["dh"] >= p["Dm"])
    n2 = sum(1 for r in comp if r["v"] > 0 and r["vh"] > 2 / 3 * v0)
    return {"day": day_name(rec), "p": p, "rows": rows, "d0": d0, "n1": n1, "n2": n2,
            "aat": aat, "td": td}


def scored(day):
    return [r for r in day["rows"] if not r["remarks"] and not (r["pts"] == 0 and r["raw"] < 0.5)]


def published_values(recs):
    """Checks of the published distance, speed and Do values themselves."""
    c = Counter()
    for rec in recs:
        day = recompute(rec)
        if not day:
            continue
        c["days"] += 1
        for r in day["rows"]:
            if r["d"] <= 0:
                continue
            c["distances"] += 1
            c["times in whole seconds"] += r["t"] == int(r["t"])
            # Single precision resolves 0.03 m at 500 km, so 0.05 m separates exact multiples from chance.
            on_10m = abs(r["d"] - round(r["d"], -1)) < 0.05
            on_100m = abs(r["d"] - round(r["d"], -2)) < 0.05
            c["distances on an exact 100 m multiple"] += on_100m
            c["distances on an exact 10 m multiple"] += on_10m
            if r["v"] > 0:
                c["finisher speeds"] += 1
                derived = math.isclose(r["v"], r["d"] / max(r["t"], day["td"]), rel_tol=1e-6)
                c["finisher speeds equal to distance / marking time"] += derived
                c["other finisher speeds with distance on 10 m and speed on 0.01 km/h"] += (
                    not derived and on_10m and abs(r["v"] * 360 - round(r["v"] * 360)) < 1e-4)
        do = day["p"]["Do_pub"]
        if do is not None:
            do_m = num(do) * 1000
            c["days with Do in Info line"] += 1
            c["Do within 0.01 km of unrounded D0"] += abs(do_m - day["d0"]) < 10
            c["Do on a 0.1 km multiple"] += abs(do_m - round(do_m, -2)) < 0.5
            c["unrounded D0 on an exact 100 m multiple"] += abs(day["d0"] - round(day["d0"], -2)) < 0.05
        if day["p"]["Dm"] is not None:
            c["days with Dm"] += 1
            c["n1 equals count of unrounded Dh >= Dm"] += day["n1"] == day["p"]["n1"]
        c["n2 equals count of unrounded Vh > 2/3 V0"] += day["n2"] == day["p"]["n2"]
    return c


def main():
    recs = [rec for rec in map(json.loads, open(sys.argv[1], encoding="utf-8"))
            if rec["table"] == "result-daily" and rec["comp"].startswith(("dm", "dsm", "euregiocup"))]
    listing = sys.argv[sys.argv.index("--list") + 1] if "--list" in sys.argv else None

    base = {}
    excluded = []
    for rec in recs:
        day = recompute(rec)
        if day:
            base[day["day"]] = {r["cn"]: half_up(r["raw"]) for r in day["rows"]}
            if any(half_up(r["raw"]) != r["pts"] for r in scored(day)):
                excluded.append(day["day"])
    # Days that fail without rounding fail for other reasons, see the handicapped club days research.
    print("Days excluded because the unrounded recomputation already fails:", *excluded, sep="\n  ")
    recs = [rec for rec in recs if day_name(rec) not in excluded]

    print("\nPublished values on the remaining days:")
    for k, v in published_values(recs).items():
        print(f"  {k}: {v}")

    print("\nVariant | rows | match | changed vs unrounded | changed and match | days where n1 or n2 differs from Info line")
    for name, (steps, fn) in VARIANTS.items():
        s = Counter()
        bad_days = set()
        listed = []
        for rec in recs:
            day = recompute(rec, steps, fn)
            if not day:
                continue
            b = base[day["day"]]
            s["n1 days"] += day["p"]["Dm"] is not None and day["n1"] != day["p"]["n1"]
            s["n2 days"] += day["n2"] != day["p"]["n2"]
            for r in scored(day):
                pred = half_up(r["raw"])
                s["rows"] += 1
                s["match"] += pred == r["pts"]
                if pred != b[r["cn"]]:
                    s["changed"] += 1
                    s["changed match"] += pred == r["pts"]
                    if name == listing:
                        listed.append((day["day"], r["cn"], b[r["cn"]], pred, r["pts"]))
                if pred != r["pts"]:
                    bad_days.add(day["day"])
        print(f'{name} | {s["rows"]} | {s["match"]} | {s["changed"]} | {s["changed match"]} | {s["n1 days"]} and {s["n2 days"]} '
              f'| {len(bad_days)} days with a mismatch')
        for row in listed:
            print("  ", *row)


if __name__ == "__main__":
    main()
