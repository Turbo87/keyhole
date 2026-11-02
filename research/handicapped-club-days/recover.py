#!/usr/bin/env python3
"""Back-solve the handicaps SeeYou applied in a class from published points.

Usage: recover.py tables.jsonl <comp>/<class> [--dq-penalty] [--tol 0.0003] [--digits 3]

For finishers above 2/3 Vo, the points give Vh and so H / Hn = V / Vh. For outlanders they give Dh and
H / Hn = D / Dh. The day parameters come from the Task info line (Vo, Do, Maximum Points, N, n1, n2),
and +-0.5 points give a range of H / Hn for each scored row without remark. The ranges of one CN are
intersected over all task days of the class, and the value with the given number of decimals nearest to
the middle, within the tolerance, becomes the recovered handicap. Every day is then recomputed with it.
Hn is whatever reference SeeYou divided by, so the result is relative to it.
"""
import math
import re
import sys
from collections import defaultdict

from common import load, mismatches, name, rc, recompute


def info_num(info, key):
    m = re.search(rf"{key}: ([\d,.]+\d)", info)
    return m and rc.num(m.group(1))


def ranges(rec):
    """(CN, glider, [lo, hi]) of H / Hn for every scored row without remark."""
    info = rec["info"]
    p = rc.day_params(info)
    day = rc.recompute(rec)
    vo, do = info_num(info, "Vo"), info_num(info, "Do")
    f = min(1.0, 1.25 * p["n1"] / p["N"])
    fcr = min(1.0, 1.2 * p["n2"] / p["n1"] + 0.6)
    pm = float(p["Pm_pub"])
    pvm = 2 / 3 * p["n2"] / p["N"] * pm
    pdm = pm - pvm
    gliders = {row["CN"][0]: row.get("Glider", [""])[0] for row in rec["rows"]}
    out = []
    for r in day["rows"]:
        if r["remarks"] or r["pts"] <= 0 or r["hc"]:
            continue
        rng = []
        for pts in (r["pts"] - 0.5, r["pts"] + 0.5):
            s = pts / (f * fcr)
            if r["v"] > 0:
                if s <= pdm or not vo:
                    break
                rng.append(r["v"] * 3.6 / (2 / 3 * vo + (s - pdm) * (vo / 3) / pvm))
            else:
                rng.append(r["d"] / 1000 / (s / pdm * do))
        if len(rng) == 2:
            out.append((r["cn"], gliders[r["cn"]], sorted(rng)))
    return out


def main():
    path, cls = sys.argv[1], sys.argv[2]
    tol = float(sys.argv[sys.argv.index("--tol") + 1]) if "--tol" in sys.argv else 0.0003
    q = 10 ** (int(sys.argv[sys.argv.index("--digits") + 1]) if "--digits" in sys.argv else 3)
    recs = [r for r in load(path, cls + "/task", "--dq-penalty" in sys.argv) if r["info"] and "Vo:" in r["info"]]
    found = defaultdict(list)
    gliders = defaultdict(set)
    for rec in recs:
        for cn, glider, rng in ranges(rec):
            found[cn].append(rng)
            gliders[cn].add(glider)
    hcaps = {}
    mids = {}
    print("CN, glider, intersection of H/Hn ranges, recovered value, days")
    for cn in sorted(found):
        lo, hi = max(r[0] for r in found[cn]), min(r[1] for r in found[cn])
        mid = mids[cn] = (lo + hi) / 2
        cands = [k / q for k in range(math.ceil((min(lo, hi) - tol) * q), math.floor((max(lo, hi) + tol) * q) + 1)]
        if cands:
            hcaps[cn] = min(cands, key=lambda c: abs(c - mid))
        print(f'{cn:>5} {"/".join(sorted(gliders[cn])):<22} [{lo:.4f}, {hi:.4f}] -> {hcaps.get(cn)} ({len(found[cn])}){"" if lo <= hi else " empty"}')
    print("\nDay, matching rows, CNs without a recovered handicap, mismatching CNs")
    for rec in recs:
        plain, bad = mismatches(recompute(rec, hcaps))
        missing = [row["CN"][0] for row in rec["rows"] if row["CN"][0] not in hcaps]
        print(name(rec), f"{len(plain) - len(bad)}/{len(plain)}", missing, [r["cn"] for r in bad])
    print("\nRecovered values:", " ".join(f"{cn}={h}" for cn, h in sorted(hcaps.items())))
    print("Range midpoints:", " ".join(f"{cn}={m:.5f}" for cn, m in sorted(mids.items())))


if __name__ == "__main__":
    main()
