import json, sys, csv, collections, os
S = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ['SOARINGSPOT_DIR']
changed = json.load(open(S + '/changed.json'))
def hms(s):
    try: h, m, x = map(int, s.split(':')); return h*3600+m*60+x
    except: return None
cache = {}
def day(d):
    if d in cache: return cache[d]
    k = d
    d = os.path.join(ROOT, d)
    t = json.load(open(d + '/task.json'))
    rows = list(csv.DictReader(open(d + '/results.csv')))
    fin = []
    for r in rows:
        dur = hms(r['duration']); v = r['speed_kmh']; p = r['points']
        if r['finish_time_local'] and dur and v and p:
            h = float(r['handicap']) if r['handicap'] else 1.0
            fin.append((float(v)/h, float(p), dur, r['cn']))
    cache[k] = (t, rows, fin)
    return cache[k]
stats = collections.Counter(); dps = []; vo_cases = []; rank_risk = []
for r in changed:
    t, rows, fin = day(r['day'])
    stats['changed'] += 1
    d = r['m']['geo'] - r['m']['flat']   # +1: geodesic start 1 s later
    me = [f for f in fin if f[3] == r['cn']]
    if not me: stats['outlander_or_no_time'] += 1; continue
    vh, p, dur, _ = me[0]
    tmin = t.get('task_duration') or 0
    if t['task_type'] == 'assigned_area' and dur <= tmin + 1:
        stats['aat_under_tmin'] += 1; continue
    stats['finisher_affected'] += 1
    xs = [f for f in fin if not (t['task_type']=='assigned_area' and f[2] <= tmin)]
    if len(xs) < 3: stats['no_slope'] += 1; continue
    mx = sum(f[0] for f in xs)/len(xs); my = sum(f[1] for f in xs)/len(xs)
    vx = sum((f[0]-mx)**2 for f in xs)
    slope = sum((f[0]-mx)*(f[1]-my) for f in xs)/vx if vx else 0
    dv = vh * dur/(dur - d) - vh
    dp = slope * dv
    dps.append(abs(dp))
    if vh >= max(f[0] for f in fin) - 1e-9: vo_cases.append((r['day'], r['cn'], d, round(dp,3)))
    pts = sorted({f[1] for f in fin})
    near = [q for q in (float(x['points']) for x in rows if x['points']) if q != p and abs(q-p) <= 1 and (q-p)*dp > 0] + \
           [q for q in (float(x['points']) for x in rows if x['points'] and x['cn'] != r['cn']) if q == p]
    if near: rank_risk.append(abs(dp))
print(dict(stats))
dps.sort()
print('finisher |dP| est: n=%d median %.3f p90 %.3f max %.3f; expected integer point changes %.1f; >=0.5: %d' % (len(dps), dps[len(dps)//2], dps[int(.9*len(dps))], dps[-1], sum(min(1,x) for x in dps), sum(x>=.5 for x in dps)))
print('flights with a neighbour tied or within 1 pt in the moving direction:', len(rank_risk), 'expected rank swaps %.1f' % sum(min(1,x) for x in rank_risk))
print('changed start of day-fastest finisher (moves Vo for whole class-day):', len(vo_cases))
for v in vo_cases: print('  ', v[0].replace(ROOT+'/',''), v[1:])
