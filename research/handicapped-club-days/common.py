"""Shared loading and recomputation on top of `recompute.py` from the rounding and ties research.

`recompute.py` is expected in `../rounding-and-ties/`, as on the `research/rounding-and-ties` branch.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rounding-and-ties"))
import recompute as rc  # noqa: E402

DQ = re.compile(r"Disqualified \(([\d,]+) penalty points\)")


def load(path, prefix, dq_penalty=False):
    """Daily tables whose `<comp>/<class>/<page>` starts with prefix and that recompute.py can score.

    With dq_penalty, a row whose only remark is a disqualification with N penalty points and 0 points
    is treated as an unremarked row with N points, because SeeYou sets that penalty to the row's score.
    """
    recs = []
    for line in open(path, encoding="utf-8"):
        rec = json.loads(line)
        if rec["table"] != "result-daily" or not f'{rec["comp"]}/{rec["class"]}/{rec["page"]}'.startswith(prefix):
            continue
        if dq_penalty:
            for row in rec["rows"]:
                rem = row.get("_remarks") or []
                m = len(rem) == 1 and DQ.fullmatch(rem[0])
                if m and row["Points"][0].split()[0] == "0":
                    row["Points"] = [m.group(1).replace(",", ""), None]
                    row["_remarks"] = []
        if rc.recompute(rec):
            recs.append(rec)
    return recs


def name(rec):
    return f'{rec["comp"]}/{rec["class"]}/{rec["page"][:-6]}'


def recompute(rec, hcaps=None, hmin=False):
    """recompute.py's day result with handicaps from hcaps (CN to value) over the published column.

    With hmin, the reference is the unrounded lowest handicap of the day's non-HC rows, as in the Naviter
    script before version 9.01, instead of that value rounded down to a power of ten.
    """
    hcaps = hcaps or {}
    rows = [{**r, "Handicap": [str(hcaps.get(r["CN"][0], (r.get("Handicap") or ["1"])[0])), None]} for r in rec["rows"]]
    cols = rec["cols"] if "Handicap" in rec["cols"] else rec["cols"] + ["Handicap"]
    norm = rc.h_norm
    if hmin:
        lowest = min(rc.num(r["Handicap"][0]) for r in rows if r["#"][0] != "HC")
        rc.h_norm = lambda _h: lowest
    try:
        return rc.recompute({**rec, "cols": cols, "rows": rows})
    finally:
        rc.h_norm = norm


def mismatches(day):
    """Scored rows without remark whose half-up rounded recomputation differs from the published points."""
    plain = [r for r in day["rows"] if not r["remarks"] and not (r["pts"] == 0 and r["raw"] < 0.5)]
    return plain, [r for r in plain if rc.half_up(r["raw"]) != r["pts"]]
