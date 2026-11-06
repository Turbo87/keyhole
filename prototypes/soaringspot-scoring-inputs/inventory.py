"""Inventories the scoring inputs of a soaringspot-downloader output.

Usage: python3 -I inventory.py <soaringspot-downloader output> > report.txt

Prints aggregate counts only. Examples name a day and a competition ID.
"""

import collections
import csv
import html
import json
import os
import re
import sys
from pathlib import Path

STATUSES = ["official", "unofficial", "preliminary", "practice", "cancelled"]

CSV_FIELDS = [
    "rank", "cn", "contestant", "countries", "club", "team", "glider", "handicap",
    "start_time_local", "finish_time_local", "duration", "speed_kmh", "distance_km",
    "points", "points_sort_key", "penalty_points", "remarks",
]

# Remark groups, first match wins, matched case-insensitively against the
# remark without its "(N penalty points)" suffix. Each group names the Keyhole
# input that would reproduce it.
REMARK_GROUPS = [
    ("status notation", r"^(dnf|dns|dnl)$|did not (fly|launch)|withdrawn|nicht abgeflogen|kein abflug"),
    ("crew list", r"^P1 .* P2 "),
    ("disqualification", r"disqual|\bdsq\b"),
    ("official warning", r"warn|verwarn|first offen|1st offen|^w ?-"),
    ("flight end", r"engine|virtu"),
    ("start time", r"^start \d|\d ?min penalty|went early|pev.*from pri"),
    ("scored file", r"secondary|sekundär|resubmission|file from primary"),
    ("logger check", r"logger ?interval|fix ?rate|gps pr|logger gps|validierung|logger failure|loggerausfall"),
    ("finish height", r"zielh|zielkreis|zu tief|finish(ing)? (alt|below)|finish altitude"),
    ("landing note", r"^(ps, )?l/o$|landed out"),
    ("airspace or competition area", r"airspace|luftraum|entering|\btma\b|\bcta\b|dropzone|competition area|wettbewerbsraum"),
    ("start", r"start|abflug|\bpev\b|marker|prestart|pre-start|motorabstell|self-?lau"),
    ("turnpoint", r"turn ?point|\btp ?\d|wende|missed|rounded|not claimed|\bwp\b|point \d"),
    ("rule reference only", r"^(sc3a|swo) [\d.]+[a-z]?$"),
    ("administrative", r"admin|weight|gewicht|mtow|dangerous|hazardous|landing|taxi|late|abgabe"),
]


# The Keyhole input each reason needs, and whether the download carries it:
# "carried" means the fields state the input exactly, "partly" means they
# state some of it, and "not carried" means the download lacks it.
REASON_INPUTS = {
    "DNF without IGC file": ("result status did not fly", "carried"),
    "DNF with IGC file": ("did not fly with a deleted IGC file", "carried"),
    "DNS with IGC file": ("scored file without a start, or a manual result without achievements", "carried"),
    "DNS without IGC file": ("manual result without achievements", "carried"),
    "penalty": ("penalty", "carried"),
    "remark without points: official warning": ("official warning", "carried"),
    "remark without points: crew list": ("none, no scoring effect", "carried"),
    "remark without points: landing note": ("none, no scoring effect", "carried"),
    "remark without points: logger check": ("none, no scoring effect", "carried"),
    "scored without any flight": ("manual result", "partly"),
    "ranked with nothing scored and no flight": ("manual result", "partly"),
    "day without any published flight": ("manual result", "partly"),
    "remark without points: start time": ("start override", "partly"),
    "remark without points: scored file": ("scored file from another logger", "partly"),
    "remark without points: finish height": ("minimum finish height from the task notes", "partly"),
    "remark without points: disqualification": ("day or competition disqualification", "partly"),
    "no IGC file downloaded, SoaringSpot links a flight": ("IGC file", "not carried"),
    "remark without points: flight end": ("flight end override after an engine run", "partly"),
    "remark without points: airspace or competition area": ("unknown effect", "not carried"),
    "remark without points: start": ("unknown effect", "not carried"),
    "remark without points: turnpoint": ("unknown effect", "not carried"),
    "remark without points: rule reference only": ("unknown effect", "not carried"),
    "remark without points: administrative": ("unknown effect", "not carried"),
    "remark without points: other": ("unknown effect", "not carried"),
}
TIERS = ["reproducible by analysis", "carried", "partly", "not carried"]


def task_info(page):
    match = re.search(r"Task info:</span><span>(.*?)</span>", page, re.S)
    return html.unescape(match.group(1)) if match else ""


def heading(page):
    match = re.search(r'<h2 class="pull-left">\s*(.*?)\s*</h2>', page, re.S)
    return re.sub(r"\s+", " ", match.group(1)) if match else ""


def html_rows(page):
    """Per table row: CN and whether the CN links to a flight on SoaringSpot."""
    start = page.find('<table class="result-daily')
    if start < 0:
        return []
    table = page[start:page.find("</table>", start)]
    rows = []
    for row in re.findall(r"<tr>(.*?)</tr>", table[table.find("<tbody>"):], re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        cn = re.sub(r"<[^>]*>|\s+", "", re.sub(r'data-content="[^"]*"', "", cells[2]))
        rows.append({
            "cn": html.unescape(cn),
            "flight_link": "download-contest-flight" in cells[2],
        })
    return rows


def info_params(info):
    """Which known parameters the Task info line states."""
    found = {}
    patterns = {
        "maximum points": r"Maximum Points:",
        "F and Fcr": r"\bF = .*Fcr = ",
        "Dm and D1": r"Dm = [\d.,]+ ?km, D1 = ",
        "N, n1, n2": r"\bN: \d+, n1: \d+, n2: \d+",
        "Do and Vo": r"Do: [\d.,]+ ?km, Vo: ",
        "handicapping flag": r"handicapping enabled|no handicaps",
        "PEV settings": r"PEV|Pilot Event",
        "pre-start altitude": r"PreStart",
        "DAeC script version": r"DAeC-SWO\d+ Script V[\d.]+",
        "Annex A hash": r"[A-Za-z0-9+/]{43}\b",
        "day not valid": r"[Dd]ay not valid",
        "Australian parameters (Nd, Nv)": r"\bNd=\d+",
        "day handicaps per CN": r"Day Handicaps|; [A-Za-z0-9]{1,4}=\d{4,5};",
        "older FAI line (Day factor)": r"Day factor = ",
    }
    for name, pattern in patterns.items():
        found[name] = bool(re.search(pattern, info))
    return found


def remark_group(remark, penalty):
    text = remark
    if penalty:
        text = re.sub(r"\(?[\d,.]+ penalty points\)?\s*$", "", remark).strip()
        if not text:
            return "points only, no text"
    for name, pattern in REMARK_GROUPS:
        if re.search(pattern, text, re.I):
            return name
    return "other"


def number(value):
    try:
        return float(value)
    except ValueError:
        return None


def igc_files(day):
    files = collections.defaultdict(list)
    for path in day.glob("*.igc*"):
        cn = path.name.split("_", 1)[1].split(".igc")[0]
        files[cn].append(path.name)
    return files


def reproduction_reason(row, has_igc, flight_link, day_has_flights):
    """Why a row's published result cannot come from analysing its IGC file
    alone, or None if nothing beyond the file is needed."""
    label = row["rank"]
    if not has_igc and not day_has_flights and label != "DNF":
        return "day without any published flight"
    scored = bool(row["start_time_local"]) or (number(row["distance_km"]) or 0) > 0
    if label == "DNS":
        return "DNS with IGC file" if has_igc else "DNS without IGC file"
    if label == "DNF":
        return "DNF with IGC file" if has_igc else "DNF without IGC file"
    if not has_igc and flight_link:
        return "no IGC file downloaded, SoaringSpot links a flight"
    if not has_igc and scored:
        return "scored without any flight"
    if not has_igc:
        return "ranked with nothing scored and no flight"
    if row["penalty_points"]:
        return "penalty"
    if row["remarks"]:
        return "remark without points: " + remark_group(row["remarks"], "")
    return None


def main(root):
    root = Path(root)
    only = os.environ.get("ONLY", "")
    days = sorted(
        p.parent for p in root.glob("*/*/*/task.json")
        if str(p.parent.relative_to(root)).startswith(only)
    )

    out = []
    print_ = out.append

    day_status = collections.Counter()
    comps_by_status = collections.defaultdict(set)
    rows_by_status = collections.Counter()
    field_rows = collections.defaultdict(collections.Counter)  # status -> field -> nonempty rows
    field_comps = collections.defaultdict(lambda: collections.defaultdict(set))
    columns_days = collections.defaultdict(collections.Counter)  # status -> column -> days
    labels = collections.defaultdict(collections.Counter)
    label_fields = collections.defaultdict(collections.Counter)  # official label -> nonempty fields
    label_igc = collections.defaultdict(collections.Counter)
    info_days = collections.defaultdict(collections.Counter)
    info_comps = collections.defaultdict(lambda: collections.defaultdict(set))
    info_missing = collections.Counter()
    headings = collections.Counter()
    penalty_formats = collections.Counter()
    penalty_values = collections.Counter()
    penalty_zero_points = 0
    penalty_with_override = 0
    remark_groups = collections.defaultdict(collections.Counter)  # with/without points
    remark_examples = collections.defaultdict(list)
    reasons = collections.defaultdict(collections.Counter)  # status -> reason -> rows
    reason_days = collections.defaultdict(lambda: collections.defaultdict(set))
    reason_examples = collections.defaultdict(list)
    reason_comps = collections.defaultdict(collections.Counter)
    link_vs_igc = collections.Counter()
    n_checks = collections.Counter()
    n_mismatch_examples = []
    multi_files = 0
    fixture_days = collections.Counter()
    hc_with_points = collections.Counter()
    zero_point_dnf_fields = collections.Counter()
    finish_without_duration = 0
    outlander_duration = collections.Counter()
    handicap_scales = collections.Counter()
    sort_key_types = collections.Counter()
    task_duration_div = collections.Counter()
    notes_days = collections.Counter()
    notes_comps = collections.defaultdict(set)
    manual_rows = collections.Counter()
    tier_rows = collections.Counter()
    tier_days = collections.Counter()

    for day in days:
        comp, cls, date = day.relative_to(root).parts
        task = json.loads((day / "task.json").read_text())
        status = task.get("result_status", "missing")
        day_status[status] += 1
        comps_by_status[status].add(comp)
        page = (day / "results.html").read_text()
        title = heading(page)
        if " on practice task " in title:
            title = "Results for <class> on practice task <n> (<date>)"
        elif title.startswith("Results for ") and title.endswith("Task cancelled"):
            title = "Results for <class> on <date>, Task cancelled"
        else:
            title = title.split(" results for ")[0] + " results for <class> on task <n> (<date>)"
        headings[(status, title)] += 1
        info = task_info(page)
        if not info.strip():
            info_missing[status] += 1
        for name, present in info_params(info).items():
            if present:
                info_days[status][name] += 1
                info_comps[status][name].add(comp)
        task_duration_div[(status, 'class="result-info task-duration"' in page)] += 1
        task_page = (day / "task.html").read_text()
        notes = re.search(r"<h3>Task notes</h3>\s*<p>(.*?)</p>", task_page, re.S)
        if notes and re.sub(r"<[^>]*>|\s+", "", notes.group(1)):
            notes_days[status] += 1
            notes_comps[status].add(comp)

        header_match = re.search(r"<thead>(.*?)</thead>", page, re.S)
        columns = re.findall(r"<th[^>]*>([^<]*)</th>", header_match.group(1)) if header_match else []
        for column in columns:
            columns_days[status][column.strip()] += 1

        csv_path = day / "results.csv"
        rows = list(csv.DictReader(csv_path.open())) if csv_path.exists() else []
        hrows = html_rows(page)
        files = igc_files(day)
        multi_files += sum(1 for names in files.values() if len(names) > 1)
        lower = {cn.lower(): cn for cn in files}
        day_has_flights = bool(files) or any(r["flight_link"] for r in hrows)

        day_reasons = []
        for index, row in enumerate(rows):
            rows_by_status[status] += 1
            for field in CSV_FIELDS:
                if row[field]:
                    field_rows[status][field] += 1
                    field_comps[status][field].add(comp)
            label = row["rank"] if not row["rank"].isdigit() else "ranked"
            labels[status][label] += 1
            has_igc = row["cn"] in files or row["cn"].lower() in lower
            hrow = hrows[index] if index < len(hrows) else None
            if status == "official":
                for field in CSV_FIELDS:
                    if row[field]:
                        label_fields[label][field] += 1
                label_igc[label][has_igc] += 1
                if hrow:
                    link_vs_igc[(hrow["flight_link"], has_igc)] += 1
                if label == "HC" and (number(row["points"]) or 0) > 0:
                    hc_with_points["HC with points"] += 1
                if label == "DNF":
                    zero_point_dnf_fields[(bool(row["start_time_local"]), (number(row["distance_km"]) or 0) > 0, number(row["points"]) == 0)] += 1
                if row["finish_time_local"] and not row["duration"]:
                    finish_without_duration += 1
                if not row["finish_time_local"] and row["start_time_local"] and label != "DNS":
                    outlander_duration[bool(row["duration"]), bool(row["speed_kmh"])] += 1
                if row["handicap"]:
                    value = number(row["handicap"])
                    handicap_scales["~1" if value is not None and value < 5 else "~100" if value is not None and value < 500 else "~1000" if value is not None else "non-numeric"] += 1
                sort_key_types[number(row["points_sort_key"]) is not None] += 1

            if row["penalty_points"]:
                remark = row["remarks"]
                if status == "official" and re.search(r"virtu|engine start|started engine|\d ?min(ute)?s? penalty", remark, re.I):
                    penalty_with_override += 1
                if re.fullmatch(r"[\d,.]+ penalty points", remark):
                    penalty_formats[(status, "N penalty points (no text)")] += 1
                elif re.search(r"\([\d,.]+ penalty points\)$", remark):
                    penalty_formats[(status, "text (N penalty points)")] += 1
                else:
                    penalty_formats[(status, "other")] += 1
                value = number(row["penalty_points"])
                if status == "official":
                    penalty_values["integer" if value == int(value) else "fractional"] += 1
                    penalty_values["negative" if value < 0 else "zero" if value == 0 else "positive"] += 1
                    if number(row["points"]) == 0:
                        penalty_zero_points += 1
            if row["remarks"]:
                group = remark_group(row["remarks"], row["penalty_points"])
                kind = "with points" if row["penalty_points"] else "without points"
                remark_groups[(status, kind)][group] += 1
                if status == "official" and len(remark_examples[(kind, group)]) < 400:
                    remark_examples[(kind, group)].append(row["remarks"])

            if status == "official" and day_has_flights and not has_igc and not (hrow and hrow["flight_link"]) and row["rank"] not in ("DNF", "DNS"):
                manual_rows[(
                    "finish" if row["finish_time_local"] else "start, no finish" if row["start_time_local"] else "no start",
                    "distance > 0" if (number(row["distance_km"]) or 0) > 0 else "distance 0",
                    remark_group(row["remarks"], row["penalty_points"]) if row["remarks"] else "no remark",
                )] += 1
            reason = reproduction_reason(row, has_igc, bool(hrow and hrow["flight_link"]), day_has_flights)
            if hrow and hrow["cn"] != row["cn"]:
                raise ValueError(f"{day}: row {index} CN mismatch")
            if reason:
                reasons[status][reason] += 1
                reason_days[status][reason].add(f"{comp}/{cls}/{date}")
                if status == "official":
                    reason_comps[reason][comp] += 1
                if status == "official" and len(reason_examples[reason]) < 3:
                    reason_examples[reason].append(f"`{comp}/{cls}/{date}` CN {row['cn']}")
                day_reasons.append(reason)
            if status == "official":
                tier_rows[REASON_INPUTS[reason][1] if reason else TIERS[0]] += 1

        if status == "official":
            fixture_days["days"] += 1
            if not files:
                fixture_days["days without any IGC file"] += 1
            tiers = [REASON_INPUTS[r][1] for r in day_reasons] or [TIERS[0]]
            tier_days[max(tiers, key=TIERS.index)] += 1

        # N counts the competitors with a competition launch, so whether it
        # includes DNF and DNS rows tells which of them launched.
        match = re.search(r"\bN: (\d+)", info)
        if match and status == "official" and rows:
            n = int(match.group(1))
            count = collections.Counter(r["rank"] if not r["rank"].isdigit() else "ranked" for r in rows)
            extra = n - count["ranked"]
            dnf, dns = count["DNF"], count["DNS"]
            counted = [
                (a, b) for a in range(dnf + 1) for b in range(dns + 1) if a + b == extra
            ]
            if not dnf and not dns:
                n_checks["no DNF or DNS row: " + ("N = ranked" if extra == 0 else f"N = ranked {extra:+d}")] += 1
            elif len(counted) == 1:
                a, b = counted[0]
                if dnf:
                    n_checks["DNF rows counted in N" if a == dnf else "DNF rows not counted in N" if a == 0 else "some DNF rows counted in N"] += 1
                if dns:
                    n_checks["DNS rows counted in N" if b == dns else "DNS rows not counted in N" if b == 0 else "some DNS rows counted in N"] += 1
            else:
                n_checks["ambiguous or impossible"] += 1
                if len(n_mismatch_examples) < 8:
                    n_mismatch_examples.append(f"`{comp}/{cls}/{date}` N {n}, ranked {count['ranked']}, DNF {dnf}, DNS {dns}, HC {count['HC']}")
            if extra and not dnf and not dns and len(n_mismatch_examples) < 8:
                n_mismatch_examples.append(f"`{comp}/{cls}/{date}` N {n}, ranked {count['ranked']}, DNF {dnf}, DNS {dns}, HC {count['HC']}")

    def pct(part, whole):
        return f"{100 * part / whole:.1f} %" if whole else "n/a"

    print_("## Days\n")
    print_("| result_status | days | competitions | rows |")
    print_("|---|---|---|---|")
    for status in STATUSES:
        print_(f"| {status} | {day_status[status]} | {len(comps_by_status[status])} | {rows_by_status[status]} |")
    print_(f"\nCompetitions: {len({d.relative_to(root).parts[0] for d in days})}, class days: {len(days)}\n")

    print_("## Page heading word by result_status\n")
    for (status, word), count in sorted(headings.items()):
        print_(f"- {status}: {word!r} {count}")

    print_("\n## Results table columns (days with column)\n")
    print_("| column | " + " | ".join(STATUSES) + " |")
    print_("|---|" + "---|" * len(STATUSES))
    all_columns = sorted({c for s in columns_days.values() for c in s})
    for column in all_columns:
        print_(f"| {column} | " + " | ".join(f"{columns_days[s][column]}/{day_status[s]}" for s in STATUSES) + " |")

    official = "official"
    total_comps = len(comps_by_status[official])
    total_rows = rows_by_status[official]
    print_("\n## results.csv field presence on official days\n")
    print_("| field | rows non-empty | competitions with any |")
    print_("|---|---|---|")
    for field in CSV_FIELDS:
        rows_ = field_rows[official][field]
        print_(f"| `{field}` | {rows_} ({pct(rows_, total_rows)}) | {len(field_comps[official][field])}/{total_comps} |")

    print_("\n## results.csv field presence on practice days\n")
    print_("| field | rows non-empty |")
    print_("|---|---|")
    for field in CSV_FIELDS:
        print_(f"| `{field}` | {field_rows['practice'][field]} ({pct(field_rows['practice'][field], rows_by_status['practice'])}) |")

    print_("\n## Rank labels by result_status\n")
    for status in STATUSES:
        print_(f"- {status}: " + ", ".join(f"{k} {v}" for k, v in sorted(labels[status].items())))

    print_("\n## Fields filled per rank label on official days\n")
    print_("| label | rows | with IGC | " + " | ".join(f"`{f}`" for f in CSV_FIELDS[7:]) + " |")
    print_("|---|---|---|" + "---|" * len(CSV_FIELDS[7:]))
    for label in sorted(label_fields):
        total = sum(label_igc[label].values())
        print_(f"| {label} | {total} | {label_igc[label][True]} | " + " | ".join(str(label_fields[label][f]) for f in CSV_FIELDS[7:]) + " |")

    print_("\nDNF rows on official days by (start, distance > 0, zero points): " + str(dict(zero_point_dnf_fields)))
    print_(f"HC rows with points > 0 on official days: {hc_with_points['HC with points']}")
    print_(f"Finish without duration (official): {finish_without_duration}")
    print_(f"Non-finishers with a start, by (duration, speed) (official): {dict(outlander_duration)}")
    print_(f"Handicap scales (official rows): {dict(handicap_scales)}")
    print_(f"Numeric points_sort_key (official rows): {dict(sort_key_types)}")
    print_(f"task-duration line on page by (status, present): {dict(sorted(task_duration_div.items()))}")

    print_("\n## N in the Task info line against row labels (official days)\n")
    for name, count in n_checks.most_common():
        print_(f"- {name}: {count}")
    for example in n_mismatch_examples:
        print_(f"  - {example}")

    print_("\n## Flight link on SoaringSpot against downloaded IGC file (official rows)\n")
    for (link, igc), count in sorted(link_vs_igc.items()):
        print_(f"- link {link}, IGC file {igc}: {count}")
    print_(f"\nCNs with more than one IGC file on a day: {multi_files}")

    print_("\n## Task info line parameters (days stating them)\n")
    print_("| parameter | official days | official competitions | practice days |")
    print_("|---|---|---|---|")
    names = list(info_params("").keys())
    for name in names:
        print_(f"| {name} | {info_days[official][name]}/{day_status[official]} | {len(info_comps[official][name])}/{total_comps} | {info_days['practice'][name]}/{day_status['practice']} |")
    print_(f"\nDays with an empty Task info line: {dict(info_missing)}")
    print_("\nDays with task notes in `task.html`: " + ", ".join(f"{s} {notes_days[s]}/{day_status[s]} ({len(notes_comps[s])} competitions)" for s in STATUSES))

    print_("\n## Penalty formats\n")
    for (status, fmt), count in sorted(penalty_formats.items()):
        print_(f"- {status}: {fmt} {count}")
    print_(f"\nOfficial penalty values: {dict(penalty_values)}")
    print_(f"Official penalty rows with 0 points: {penalty_zero_points}")

    print_("\n## Remark groups (official days, all rows)\n")
    groups = sorted({g for k in remark_groups for g in remark_groups[k]})
    print_("| group | with penalty points | without penalty points |")
    print_("|---|---|---|")
    for group in groups:
        print_(f"| {group} | {remark_groups[(official, 'with points')][group]} | {remark_groups[(official, 'without points')][group]} |")
    for status in STATUSES[1:]:
        print_(f"\n{status}: with points {sum(remark_groups[(status, 'with points')].values())}, without {sum(remark_groups[(status, 'without points')].values())}")

    print_("\n## Rows needing more than their IGC file\n")
    print_("| reason | Keyhole input | download carries it | " + " | ".join(STATUSES) + " | official days |")
    print_("|---|---|---|" + "---|" * len(STATUSES) + "---|")
    all_reasons = sorted({r for s in reasons.values() for r in s}, key=lambda r: (TIERS.index(REASON_INPUTS[r][1]), r))
    for reason in all_reasons:
        needed, carried = REASON_INPUTS[reason]
        print_(f"| {reason} | {needed} | {carried} | " + " | ".join(str(reasons[s][reason]) for s in STATUSES) + f" | {len(reason_days[official][reason])} |")
    print_("| total | | | " + " | ".join(str(sum(reasons[s].values())) for s in STATUSES) + " | |")
    print_("| all rows | | | " + " | ".join(str(rows_by_status[s]) for s in STATUSES) + " | |")
    print_(f"\nOfficial penalty rows whose text also names a flight end or time penalty: {penalty_with_override}")
    print_(f"\nOfficial fixture days: {dict(fixture_days)}")
    print_("\n| official rows and days by what they need | rows | days (worst row) |")
    print_("|---|---|---|")
    for tier in TIERS:
        print_(f"| {tier} | {tier_rows[tier]} | {tier_days[tier]} |")
    print_("\nRows without any flight on official days, by (achievement, distance, remark group):\n")
    for key, count in sorted(manual_rows.items(), key=lambda item: -item[1]):
        print_(f"- {key}: {count}")
    print_("")
    for reason, examples in sorted(reason_examples.items()):
        print_(f"- {reason}: " + ", ".join(examples))
        top = reason_comps[reason].most_common(4)
        print_(f"  - {len(reason_comps[reason])} competitions, most in " + ", ".join(f"`{c}` {n}" for c, n in top))

    if "--remarks" in sys.argv:
        print_("\n## Remark texts (official)\n")
        for (kind, group), texts in sorted(remark_examples.items()):
            print_(f"### {kind} / {group}")
            for text, count in collections.Counter(texts).most_common(40):
                print_(f"- {count} {text}")

    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1])
