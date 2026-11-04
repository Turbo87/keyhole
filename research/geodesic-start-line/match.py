import json, sys, math, collections
def load(p):
    return [json.loads(l) for l in open(p)]
def analyse(recs, verbose=False):
    # infer UTC offset per day: mode of pub - floor(flat crossing), rounded to 900s
    byday = collections.defaultdict(list)
    for r in recs: byday[r['day']].append(r)
    out = []
    for day, rs in byday.items():
        c = collections.Counter()
        for r in rs:
            for t, y in r['flat']:
                if abs(y) <= r['half'] + 500:
                    d = r['pub_start'] - math.floor(t)
                    if abs(d - round(d/900)*900) <= 2: c[round(d/900)*900] += 1
        if not c: continue
        off = c.most_common(1)[0][0]
        for r in rs:
            ps = r['pub_start'] - off
            cand = [(abs(math.floor(t) - ps), t, y) for t, y in r['flat'] if abs(y) <= r['half'] + 500]
            if not cand: r['m'] = None; out.append(r); continue
            dt, t, y = min(cand)
            if dt > 2: r['m'] = None; out.append(r); continue
            g = [(abs(gt - t), gt, gy) for gt, gy in r['geo']]
            if not g: r['m'] = None; out.append(r); continue
            _, gt, gy = min(g)
            r['m'] = dict(off=off, flat=math.floor(t) - ps, geo=math.floor(gt) - ps, y=y, gy=gy, t=t, gt=gt)
            out.append(r)
    return out
if __name__ == '__main__':
    out = analyse(load(sys.argv[1]))
    for r in out:
        m = r['m']
        if m: print(r['cn'], r['model'], m['flat'], m['geo'], round(m['y']), round(m['gt']-m['t'],3))
        else: print(r['cn'], 'unmatched')
