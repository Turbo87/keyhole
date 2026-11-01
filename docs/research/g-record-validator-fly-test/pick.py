import gzip, pathlib, random, sys, collections
src = pathlib.Path(sys.argv[1]); dst = pathlib.Path(sys.argv[2])
want = {"LXV","NAV","LXN","FLA","CNI","TRI","NKL","GCS"}
by = collections.defaultdict(list)
for p in sorted(src.rglob("*.igc.gz")) + sorted(src.rglob("*.IGC.gz")):
    try:
        with gzip.open(p, "rb") as f: first = f.readline()
    except Exception: continue
    m = first[1:4].decode("ascii", "replace").upper()
    if m in want: by[m].append(p)
rng = random.Random(44)
for m in sorted(want):
    files = by[m]; n = 12 if m == "LXV" else 8
    for i, p in enumerate(rng.sample(files, min(n, len(files)))):
        data = gzip.open(p, "rb").read()
        (dst / f"{m}-{i:02d}.igc").write_bytes(data)
        if i < 2:
            lines = data.split(b"\n")
            for j, l in enumerate(lines):
                if l.startswith(b"B") and len(l) > 10:
                    c = l[8:9]; lines[j] = l[:8] + (b"1" if c != b"1" else b"2") + l[9:]; break
            (dst / f"{m}-{i:02d}-tampered.igc").write_bytes(b"\n".join(lines))
    print(m, len(files), min(n, len(files)))
