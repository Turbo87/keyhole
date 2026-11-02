#!/usr/bin/env python3
"""Download SoaringSpot result and task pages to DATA/<comp>/<class>/<task>-<date>-<kind>.html.

<kind> is `daily`, `total` or `task`.
"""
import concurrent.futures as cf
import os
import re
import sys
import time
import urllib.request

BASE = "https://www.soaringspot.com"
OUT = os.environ.get("DATA", "data")


def get(url):
    req = urllib.request.Request(BASE + url, headers={"User-Agent": "keyhole-research"})
    for delay in (5, 15, 30, 60, 120, 240):
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        # SoaringSpot answers rate limiting with status 200 and this page.
        if b"<title>Too Many Requests</title>" not in data:
            return data
        time.sleep(delay)
    raise OSError(f"rate limited: {url}")


def fetch(url):
    m = re.match(r"/en_gb/([^/]+)/(results|tasks)/([^/]+)/(task-\d+|practice-\d+)-on-(\d{4}-\d\d-\d\d)(?:/(daily|total))?$", url)
    if not m:
        return None
    comp, section, cls, task, date, kind = m.groups()
    path = os.path.join(OUT, comp, cls, f"{task}-{date}-{kind or 'task'}.html")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = get(url)
        with open(path + ".tmp", "wb") as f:
            f.write(data)
        os.replace(path + ".tmp", path)
    return path


def main():
    for comp in sys.argv[1:]:
        try:
            page = get(f"/en_gb/{comp}/results").decode()
        except OSError as e:
            print(comp, "failed:", e, file=sys.stderr)
            continue
        urls = set(re.findall(rf'/en_gb/{re.escape(comp)}/results/[^"]+/(?:daily|total)', page))
        days = [u[: -len("/daily")] for u in urls if "/task-" in u and u.endswith("/daily")]
        # The results index does not link the total of every day.
        urls |= {d + "/total" for d in days}
        urls |= {d.replace("/results/", "/tasks/", 1) for d in days}
        with cf.ThreadPoolExecutor(2) as ex:
            n = sum(1 for p in ex.map(fetch, sorted(urls)) if p)
        print(comp, n, flush=True)


if __name__ == "__main__":
    main()
