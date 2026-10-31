#!/usr/bin/env python3
"""PROTOTYPE fetcher: one SoaringSpot competition (or class) -> data/<comp>/<class>/<date>/{task.json,rows.json,*.igc.gz}"""
import gzip, html, json, os, re, sys, urllib.request, concurrent.futures as cf

BASE = "https://www.soaringspot.com"
OUT = os.environ.get("DATA", "data")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "keyhole-prototype"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def cells(tr):
    return re.findall(r"<td([^>]*)>(.*?)</td>", tr, re.S)


def parse_rows(page):
    body = page.split("<tbody", 1)[1].split("</tbody>", 1)[0] if "<tbody" in page else ""
    head = page.split("<thead", 1)[1].split("</thead>", 1)[0] if "<thead" in page else ""
    cols = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<th[^>]*>(.*?)</th>", head, re.S)]
    rows = []
    for tr in re.findall(r"<tr>(.*?)</tr>", body, re.S):
        cs = cells(tr)
        if len(cs) != len(cols):
            continue
        row = {}
        for name, (attrs, inner) in zip(cols, cs):
            dv = re.search(r'data-value="([^"]*)"', attrs)
            text = html.unescape(re.sub(r"<[^>]+>", " ", inner)).split()
            row[name or "_"] = {"text": " ".join(text), "value": dv.group(1) if dv else None}
            m = re.search(r'data-content="([^"]*download-contest-flight[^"]*)"', inner)
            if m:
                dc = html.unescape(m.group(1))
                a = re.search(r'href="(https://archive\.soaringspot\.com/[^"]+\.igc)"', dc) or re.search(
                    r'href="([^"]*download-contest-flight[^"]*dl=1[^"]*)"', dc)
                if a:
                    row["_igc"] = a.group(1) if a.group(1).startswith("http") else BASE + a.group(1)
                row["_cn"] = " ".join(text)
            pen = re.findall(r'class="[^"]*penalty-points[^"]*"[^>]*data-content="([^"]*)"', inner) + re.findall(
                r'data-content="([^"]*)"[^>]*class="[^"]*penalty-points', inner)
            if pen:
                row["_penalty"] = html.unescape(pen[0])
            rem = re.findall(r'data-content="([^"]*)"', inner)
            if name.lower().startswith("points") and rem:
                row["_remark"] = [html.unescape(x) for x in rem]
        if "_cn" not in row:
            cn = row.get("CN") or row.get("Cn")
            row["_cn"] = cn["text"] if cn else None
        rows.append(row)
    info = re.search(r"Task info:?(.*?)</", page, re.S)
    return cols, rows, (html.unescape(re.sub(r"\s+", " ", info.group(1))).strip() if info else None)


def fetch_day(url):
    m = re.match(r".*/en_gb/([^/]+)/results/([^/]+)/task-(-?\d+)-on-(\d{4}-\d\d-\d\d)/daily", url)
    if not m:
        print("skip", url, file=sys.stderr)
        return url
    comp, cls, n, date = m.groups()
    d = os.path.join(OUT, comp, cls, date)
    os.makedirs(d, exist_ok=True)
    if not os.path.exists(os.path.join(d, "rows.json")):
        page = get(BASE + url if url.startswith("/") else url).decode()
        cols, rows, info = parse_rows(page)
        tpage = get(f"{BASE}/en_gb/{comp}/tasks/{cls}/task-{n}-on-{date}").decode()
        if "taskNormalize(" in tpage:
            t = tpage.split("taskNormalize(", 1)[1]
            # JSON object up to the matching brace
            depth, end = 0, 0
            for i, ch in enumerate(t):
                depth += ch == "{"
                depth -= ch == "}"
                if depth == 0 and ch == "}":
                    end = i + 1
                    break
            open(os.path.join(d, "task.json"), "w").write(t[:end])
        notes = re.search(r'class="task-notes[^"]*"[^>]*>(.*?)</div>', tpage, re.S)
        json.dump({"url": url, "cols": cols, "rows": rows, "info": info,
                   "notes": html.unescape(re.sub(r"<[^>]+>", "\n", notes.group(1))).strip() if notes else None},
                  open(os.path.join(d, "rows.json"), "w"), indent=1)
    rows = json.load(open(os.path.join(d, "rows.json")))["rows"]
    for r in rows:
        if r.get("_igc") and r.get("_cn"):
            fn = os.path.join(d, re.sub(r"[^A-Za-z0-9^_-]", "_", r["_cn"]) + ".igc.gz")
            if not os.path.exists(fn):
                try:
                    data = get(r["_igc"])
                    with gzip.open(fn, "wb") as f:
                        f.write(data)
                except Exception as e:
                    print("fail", fn, e, file=sys.stderr)
    return d


def day_urls(comp, cls=None, practice=False):
    page = get(f"{BASE}/en_gb/{comp}/results").decode()
    urls = sorted(set(re.findall(rf'/en_gb/{re.escape(comp)}/results/[^"]+/daily', page)))
    if cls:
        urls = [u for u in urls if f"/results/{cls}/" in u]
    if not practice:
        urls = [u for u in urls if "/task--" not in u]
    return urls


if __name__ == "__main__":
    comp = sys.argv[1]
    cls = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "-" else None
    only = sys.argv[3] if len(sys.argv) > 3 else None
    urls = day_urls(comp, cls)
    if only:
        urls = [u for u in urls if only in u]
    with cf.ThreadPoolExecutor(4) as ex:
        for d in ex.map(fetch_day, urls):
            print(d, len([f for f in os.listdir(d) if f.endswith(".igc.gz")]) if os.path.isdir(d) else "", flush=True)
