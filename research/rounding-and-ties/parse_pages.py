#!/usr/bin/env python3
"""Parse pages from fetch_pages.py into JSON lines, one per result table, with text and data-value per cell."""
import html
import json
import os
import re
import sys


def clean(s):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def parse(path):
    s = open(path, encoding="utf-8").read()
    info = re.search(r"Task info:</span><span>(.*?)</span>", s, re.S)
    m = re.search(r'<table class="(result-[a-z-]+)[^"]*">(.*?)</table>', s, re.S)
    if not m:
        return None
    kind, table = m.groups()
    cols = [clean(c) for c in re.findall(r"<th[^>]*>(.*?)</th>", table, re.S)]
    rows = []
    body = table.split("<tbody>", 1)[1] if "<tbody>" in table else ""
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", body, re.S):
        tds = re.findall(r"<td([^>]*)>(.*?)</td>", tr, re.S)
        if len(tds) != len(cols):
            continue
        row = {}
        for name, (attrs, inner) in zip(cols, tds):
            dv = re.search(r'data-value="([^"]*)"', attrs)
            row[name] = [clean(inner), dv.group(1) if dv else None]
            if name in ("Points", "Total"):
                row["_remarks"] = [html.unescape(x) for x in re.findall(r'data-content="([^"]*)"', inner)]
        rows.append(row)
    rel = os.path.relpath(path, sys.argv[1]).split(os.sep)
    rec = {"comp": rel[0], "class": rel[1], "page": rel[2][:-5], "table": kind,
           "info": clean(info.group(1)) if info else None, "cols": cols, "rows": rows}
    task_path = path.replace("-daily.html", "-task.html")
    if kind == "result-daily" and os.path.exists(task_path):
        t = open(task_path, encoding="utf-8").read().split("taskNormalize(", 1)
        if len(t) == 2:
            task, _ = json.JSONDecoder().raw_decode(t[1])
            rec["task"] = {k: task.get(k) for k in ("result_status", "task_type", "task_duration")}
    return rec


def main():
    root = sys.argv[1]
    for d, _, files in sorted(os.walk(root)):
        for f in sorted(files):
            if f.endswith(".html"):
                rec = parse(os.path.join(d, f))
                if rec:
                    print(json.dumps(rec, ensure_ascii=False))


if __name__ == "__main__":
    main()
