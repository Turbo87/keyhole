import json, sys, glob, collections, statistics, os
sys.path.insert(0, os.path.dirname(__file__))
from match import analyse
S = os.path.dirname(os.path.abspath(__file__))
def load(d):
    recs = []
    for f in sorted(glob.glob(d + '/*.jsonl')): recs += [json.loads(l) for l in open(f)]
    out = analyse(recs)
    by = collections.defaultdict(list)
    for r in out: by[r['day']].append(r)
    return by
auto = load(S + '/out'); sph = load(S + '/out_sphere'); wgs = load(S + '/out_wgs84')
def score(rs): return sum(1 for r in rs if r['m'] and r['m']['flat'] == 0)
chosen = {}
disagree = []
for day in auto:
    a = auto[day][0]['model']
    s, w = score(sph.get(day, [])), score(wgs.get(day, []))
    best = 'sphere' if s > w else 'wgs84' if w > s else a
    if best != a: disagree.append((day, a, s, w))
    chosen[day] = (best, sph[day] if best == 'sphere' else wgs[day])
print('days', len(chosen), 'leg-length model disagrees with best fit on', len(disagree))
for d in disagree[:40]: print('  ', d)
OFFICIAL = len(sys.argv) > 1 and sys.argv[1] == 'official'
tot = collections.defaultdict(collections.Counter); diffs = collections.defaultdict(collections.Counter)
exact = collections.defaultdict(list); days = collections.defaultdict(set); chdays = collections.defaultdict(set)
changed = []
for day, (mdl, rs) in chosen.items():
    if OFFICIAL and rs[0]['status'] != 'official': continue
    days[mdl].add(day)
    for r in rs:
        t = tot[mdl]; t['flights'] += 1
        m = r['m']
        if not m: t['unmatched'] += 1; continue
        t['matched'] += 1; t['flat_ok'] += m['flat'] == 0; t['geo_ok'] += m['geo'] == 0
        t['changed'] += m['geo'] != m['flat']
        t['flat_ok_geo_bad'] += m['flat'] == 0 and m['geo'] != 0
        t['flat_bad_geo_ok'] += m['flat'] != 0 and m['geo'] == 0
        t['both_bad'] += m['flat'] != 0 and m['geo'] != 0
        diffs[mdl][m['geo'] - m['flat']] += 1
        exact[mdl].append(abs(m['gt'] - m['t']))
        if m['geo'] != m['flat']:
            chdays[mdl].add(day); r['model'] = mdl; changed.append(r)
for mdl in ['sphere', 'wgs84']:
    t = tot[mdl]
    print(mdl, 'days', len(days[mdl]), 'days with a changed start', len(chdays[mdl]), dict(t))
    print('   flat %.2f%% geo %.2f%%' % (100*t['flat_ok']/t['matched'], 100*t['geo_ok']/t['matched']))
    print('   geo-flat integer diff', sorted(diffs[mdl].items()))
    e = sorted(exact[mdl])
    print('   |geo-flat| exact s: median %.4f p90 %.3f p99 %.3f max %.3f; >0.1s: %d; >0.5s: %d' % (statistics.median(e), e[int(.9*len(e))], e[int(.99*len(e))], e[-1], sum(x>0.1 for x in e), sum(x>0.5 for x in e)))
json.dump(changed, open(S + '/changed%s.json' % ('_official' if OFFICIAL else ''), 'w'))
