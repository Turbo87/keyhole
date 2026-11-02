"""PROTOTYPE, throwaway. Summarises flights.jsonl from the engine-runs spike.

Usage: DATA=/path/to/soaringspot python3 summarise.py flights.jsonl [section...]

Sections: survey, variants, gates, endfix, pure, prestart, noise, launch, fes,
soaring. Without arguments all sections run. `endfix` rereads IGC files from
DATA.
"""

import collections
import gzip
import json
import os
import statistics
import sys

C = collections.Counter
TOL = 30
IDX = {"ENL": 0, "MOP": 1, "RPM": 2, "CUR": 3}

F = [json.loads(line) for line in open(sys.argv[1])]
SECTIONS = sys.argv[2:] or [
    "survey", "variants", "gates", "endfix", "pure", "prestart", "noise", "launch", "fes", "soaring",
]


def rules(day):
    c = day.split("/")[0]
    if c.startswith(("euregiocup", "dm", "dsm", "jenacup")):
        return "DAeC"
    if any(x in c for x in ("fai", "egc", "wgc", "jegc", "junior")):
        return "AnnexA"
    return "national"


def cat(r):
    """What the published result says about the flight end, given the track."""
    t, row = r.get("task"), r.get("row")
    if not row or not t:
        return None
    pub_fin, trk_fin = r["pub_finish"] is not None, t.get("finish_t") is not None
    if pub_fin:
        return "finisher" if trk_fin else "pubfin_notrack"
    if trk_fin:
        return "cut_finish"
    pd = r["pub_distance_m"]
    if r["task_type"] == "polygon" and pd and t.get("d_full") is not None:
        df = t["d_full"]
        if abs(df - pd) <= TOL:
            return "out_nocut"
        return "out_cut" if pd < df - TOL else "out_mismatch"
    return "out_unknown"


def run(r, ch, T, D, which=2):
    """which=1: first run in free flight, which=2: first run ending after the start."""
    x = r["channels"].get(ch, {}).get("runs", {}).get(f"{T}/{D}")
    return x and x[which]


def first_after(r, chs, T, D):
    best = None
    for ch in chs:
        x = run(r, ch, T, D)
        if x and (best is None or x["t0"] < best["t0"]):
            best = x
    return best


# Per-day earth model scale from finishers, ignoring days whose finish ring
# reduction differs (those show up as offsets of a few km).
_k = collections.defaultdict(list)
for r in F:
    if cat(r) == "finisher" and r["task_type"] == "polygon" and r["pub_distance_m"] and r["task"].get("d_full"):
        _k[r["day"]].append(r["pub_distance_m"] / r["task"]["d_full"])
KDAY = {d: (m if abs(m - 1) < 2e-4 else 1.0) for d, v in _k.items() for m in [statistics.median(v)]}


def seeyou_range(r, tol=3):
    """First and last fix whose best marking distance equals the published distance."""
    t, pd, k = r["task"], r["pub_distance_m"], KDAY.get(r["day"], 1.0)
    m = [x[0] for x in (t.get("near") or []) if abs(k * x[1] - pd) <= tol]
    return (m[0], m[-1]) if m else None


def judge(r, chs, T, D, climb=None):
    """Compares the first engine run after the start with the published result."""
    k = cat(r)
    if k not in ("finisher", "out_nocut", "out_cut", "cut_finish"):
        return None
    t = r["task"]
    end = t.get("finish_t") or r["landing"]
    x = first_after(r, chs, T, D)
    if x and x["t0"] >= end:
        x = None
    if x and x["t0"] < t["start_t"]:
        return "running_at_start"
    if x and climb is not None and x["dalt"] <= climb:
        x = None
    if k == "finisher":
        return "FP" if x else "TN"
    if k == "cut_finish":
        return "TP" if x else "FN?"
    if k == "out_nocut":
        if not x:
            return "TN"
        same = x["d_best"] is not None and abs(KDAY.get(r["day"], 1) * x["d_best"] - r["pub_distance_m"]) <= TOL
        return "TN" if same else "FP"
    if not x:
        return "FN?"
    R = seeyou_range(r)
    if not R:
        return "TP?"
    if R[0] - 5 <= x["t0"] <= R[1] + 5:
        return "TP"
    return "TP_late" if x["t0"] > R[1] + 5 else "FP_early"


def show(title):
    print(f"\n## {title}\n")


def q(values, p):
    s = sorted(values)
    return s[int(p * (len(s) - 1))] if s else None


if "survey" in SECTIONS:
    show("Survey: engine channels by logger manufacturer and PureGlider flag")
    c = C()
    for r in F:
        h = r["header"]
        chs = "+".join(k for k in ("ENL", "MOP", "RPM", "CUR") if k in r["channels"]) or "none"
        c[(h["manufacturer"].upper()[:3], chs, h["pure_glider"])] += 1
    for k, v in c.most_common(30):
        print(v, *k)
    print("categories:", dict(C((rules(r["day"]), cat(r)) for r in F)))

if "variants" in SECTIONS:
    show("Detector variants against the published results (first run after the start)")
    for rs in ("DAeC", "AnnexA", "national"):
        for chs in (("ENL",), ("MOP",), ("ENL", "MOP")):
            for T, D in ((300, 30), (400, 30), (500, 0), (500, 10), (500, 30), (500, 60), (700, 30)):
                c = C(judge(r, chs, T, D) for r in F if rules(r["day"]) == rs and any(ch in r["channels"] for ch in chs))
                c.pop(None, None)
                print(rs, "+".join(chs), T, D, dict(sorted(c.items())))

if "gates" in SECTIONS:
    show("ENL or MOP >= 500 for 30 s, with and without an altitude gain gate")
    for rs in ("DAeC", "AnnexA", "national"):
        for climb in (None, 0):
            c = C(judge(r, ("ENL", "MOP"), 500, 30, climb) for r in F if rules(r["day"]) == rs)
            c.pop(None, None)
            print(rs, "gain>0" if climb == 0 else "any   ", dict(sorted(c.items())))
    rows = collections.defaultdict(list)
    for r in F:
        j = judge(r, ("ENL", "MOP"), 500, 30)
        if j in ("TP", "FP"):
            x = first_after(r, ("ENL", "MOP"), 500, 30)
            rows[j].append((x["turn"], x["dalt"] / max(1, x["tq"] + 60 - x["t0"]), x["dalt"]))
    for j, v in rows.items():
        print(j, len(v), "climb rate m/s quartiles", [round(q([a[1] for a in v], p), 2) for p in (0.1, 0.25, 0.5, 0.75, 0.9)],
              "turn deg/s median", round(q([a[0] for a in v], 0.5), 2))

if "pure" in SECTIONS:
    show("Engine cuts by PureGlider flag (ENL or MOP >= 500 for 30 s with altitude gain)")
    c = C()
    for r in F:
        j = judge(r, ("ENL", "MOP"), 500, 30, 0)
        if j in ("TP", "FP", "TP?", "TP_late", "FP_early"):
            c[(r["header"]["pure_glider"], j)] += 1
    for k, v in sorted(c.items(), key=str):
        print(v, k)

if "prestart" in SECTIONS:
    show("Climbing engine runs (>= 500 for 30 s) between release and the start")
    c = C()
    for r in F:
        if not r.get("task"):
            continue
        for ch in ("ENL", "MOP"):
            x = run(r, ch, 500, 30, 1)
            if x and x["phase"] == "pre_start" and x["dalt"] > 50:
                at = "ends before start" if x["t1"] < r["task"]["start_t"] else "running at start"
                c[(rules(r["day"]), cat(r), at)] += 1
                break
    for k, v in sorted(c.items(), key=str):
        print(v, k)

if "noise" in SECTIONS:
    show("ENL noise of flights flagged PureGlider=True, by manufacturer (free flight)")
    g = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in F:
        if r["header"]["pure_glider"] is not True or "ENL" not in r["channels"]:
            continue
        ch = r["channels"]["ENL"]
        d = g[r["header"]["manufacturer"].upper()]
        for mode in ("cruise", "circling", "fast"):
            st = ch["modes"].get(mode)
            if st and st["n"] > 30:
                d[mode].append(st["p99"])
        if fr := ch["phases"].get("free"):
            d["hold30"].append(fr["hold"]["30"])
            d["cruise50"].append(ch["modes"]["cruise"]["p50"])
    print("mfr flights | cruise p50 | p99 cruise circling fast | hold30 p90 p99 | hold30>=500 | hold30>=300")
    for m, d in sorted(g.items(), key=lambda x: -len(x[1]["hold30"])):
        n = len(d["hold30"])
        if n >= 15:
            print(m, n, "|", q(d["cruise50"], 0.5), "|", q(d["cruise"], 0.5), q(d["circling"], 0.5), q(d["fast"], 0.5),
                  "|", q(d["hold30"], 0.9), q(d["hold30"], 0.99), "|", sum(h >= 500 for h in d["hold30"]), sum(h >= 300 for h in d["hold30"]))

if "launch" in SECTIONS:
    show("ENL during the launch (hold30 on tows and self-launches, hold10 on winch launches)")
    L = collections.defaultdict(list)
    for r in F:
        st = r["channels"].get("ENL", {}).get("phases", {}).get("launch")
        if not st or r["launch_end"] is None:
            continue
        winch = r["launch_max_vario"] >= 8 and r["launch_end"] - r["takeoff"] <= 150
        L[(r["header"]["pure_glider"], "winch" if winch else "tow/self")].append(st["hold"]["10" if winch else "30"])
    for k, v in sorted(L.items(), key=str):
        print(k, len(v), "median", q(v, 0.5), "p90", q(v, 0.9), ">=500", round(sum(x >= 500 for x in v) / len(v), 3))

if "fes" in SECTIONS:
    show("Current (CUR >= 100 for 30 s) against ENL and MOP runs within 60 s")
    c = C()
    for r in F:
        if "CUR" not in r["channels"]:
            continue
        x = run(r, "CUR", 100, 30, 1)
        if not x:
            c["no current run"] += 1
            continue
        hit = [ch for ch in ("ENL", "MOP") if (y := run(r, ch, 500, 30, 1)) and abs(y["t0"] - x["t0"]) <= 60]
        c["+".join(hit) or "neither"] += 1
    print(dict(c))

if "soaring" in SECTIONS:
    show("LSEEYOU SoaringBegin/SoaringEnd as B record indices")
    c = C()
    d = []
    for r in F:
        h = r["header"]
        if h["soaring_end"] in (None, -1):
            c["absent" if h["soaring_end"] is None else "-1"] += 1
            continue
        c["set"] += 1
        if r["soaring_begin_t"] and r["launch_end"]:
            d.append(("begin-launch_end", r["soaring_begin_t"] - r["launch_end"]))
        if r["soaring_end_t"] and r["landing"]:
            d.append(("landing-end", r["landing"] - r["soaring_end_t"]))
    print(dict(c))
    for k in ("begin-launch_end", "landing-end"):
        v = [x for kk, x in d if kk == k]
        print(k, "median", q(v, 0.5), "p10", q(v, 0.1), "p90", q(v, 0.9))

if "endfix" in SECTIONS:
    show("Which fix SeeYou credits: detector start against SeeYou's end fix (racing outlanders)")
    DATA = os.environ["DATA"]

    def series(day, fname):
        cols, out, last, off = {}, [], -1, 0
        for line in gzip.open(os.path.join(DATA, day, fname), "rt", errors="replace"):
            if line.startswith("I"):
                try:
                    for i in range(int(line[1:3])):
                        dd = line[3 + i * 7:10 + i * 7]
                        cols[dd[4:]] = (int(dd[:2]), int(dd[2:4]))
                except ValueError:
                    pass
            elif line.startswith("B") and len(line) >= 35 and line[1:7].isdigit():
                t = int(line[1:3]) * 3600 + int(line[3:5]) * 60 + int(line[5:7]) + off
                if last >= 0 and t < last - 43200:
                    off += 86400
                    t += 86400
                if t <= last or line[7:24].startswith("0000000N00000000"):
                    continue
                last = t
                v = []
                for c in ("ENL", "MOP"):
                    if c in cols:
                        s, e = cols[c]
                        v.append(int(line[s - 1:e]) if line[s - 1:e].isdigit() else 0)
                out.append((t, v))
        return out

    def segs(v):
        out, rs = [], None
        for i, x in enumerate(v):
            if x:
                rs = i if rs is None else rs
            elif rs is not None:
                out.append((rs, i - 1))
                rs = None
        if rs is not None:
            out.append((rs, len(v) - 1))
        return out

    def predict(t, vs, L, D, M, gap):
        best = None
        for v in vs:
            merged = []
            for a, b in segs([x >= L for x in v]):
                if merged and t[a] - t[merged[-1][1]] <= gap:
                    merged[-1] = (merged[-1][0], b)
                else:
                    merged.append((a, b))
            for a, b in merged:
                if t[b] - t[a] >= D and sum(v[a:b + 1]) / (b - a + 1) >= M:
                    best = t[a] if best is None else min(best, t[a])
                    break
        return best

    pos = []
    for r in F:
        if cat(r) != "out_cut" or not (R := seeyou_range(r)):
            continue
        chs = [c for c in ("ENL", "MOP") if c in r["channels"]]
        near = [x for x in r["task"]["near"] if abs(x[0] - R[0]) <= 5]
        if not chs or max(x[3][IDX[c]] for x in near for c in chs) < 300:
            continue
        s = [x for x in series(r["day"], r["file"]) if r["task"]["start_t"] <= x[0] <= r["landing"]]
        t = [x[0] for x in s]
        vs = [[x[1][k] for x in s] for k in range(len(s[0][1]))] if s else []
        pos.append((rules(r["day"]), R, t, vs))
    variants = {
        ">= 500 for 30 s": (500, 30, 0, 0),
        ">= 500 for 10 s": (500, 10, 0, 0),
        ">= 400, gaps <= 10 s, 30 s, mean >= 450": (400, 30, 450, 10),
        ">= 300, gaps <= 5 s, 30 s, mean >= 400": (300, 30, 400, 5),
    }
    for name, args in variants.items():
        for rs in ("DAeC", "AnnexA", "national"):
            c = C()
            for prs, R, t, vs in pos:
                if prs != rs:
                    continue
                e = predict(t, vs, *args)
                if e is None:
                    c["none"] += 1
                    continue
                d = 0 if R[0] <= e <= R[1] else min(abs(e - R[0]), abs(e - R[1]))
                c["exact" if d == 0 else "<=5 s" if d <= 5 else "<=60 s" if d <= 60 else ">60 s"] += 1
            print(f"{name:42s} {rs:8s}", dict(c))
