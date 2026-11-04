import json, sys, glob, math, collections, statistics, os
sys.path.insert(0, os.path.dirname(__file__))
from match import analyse
recs = []
for f in sorted(glob.glob(sys.argv[1] + '/*.jsonl')):
    recs += [json.loads(l) for l in open(f)]
out = analyse(recs)
tot = collections.Counter()
diffs = collections.defaultdict(collections.Counter)
exact = collections.defaultdict(list)
days = collections.defaultdict(set)
changed_days = collections.defaultdict(set)
comp_model = collections.defaultdict(set)
for r in out:
    mdl = r['model']
    days[mdl].add(r['day'])
    comp_model[r['day'].split('/')[0]].add(mdl)
    tot[(mdl, 'flights')] += 1
    m = r['m']
    if not m: tot[(mdl, 'unmatched')] += 1; continue
    tot[(mdl, 'matched')] += 1
    tot[(mdl, 'flat_ok')] += m['flat'] == 0
    tot[(mdl, 'geo_ok')] += m['geo'] == 0
    tot[(mdl, 'changed')] += m['geo'] != m['flat']
    if m['geo'] != m['flat']: changed_days[mdl].add(r['day'])
    tot[(mdl, 'flat_ok_geo_bad')] += m['flat'] == 0 and m['geo'] != 0
    tot[(mdl, 'flat_bad_geo_ok')] += m['flat'] != 0 and m['geo'] == 0
    diffs[mdl][m['geo'] - m['flat']] += 1
    exact[mdl].append((m['gt'] - m['t'], abs(m['y']), r['half'], r['lat']))
    r['_dflat'] = m['flat']; r['_dgeo'] = m['geo']
for mdl in ['sphere', 'wgs84']:
    print(mdl, 'days', len(days[mdl]), 'days with any changed start', len(changed_days[mdl]))
    for k in ['flights','unmatched','matched','flat_ok','geo_ok','changed','flat_ok_geo_bad','flat_bad_geo_ok']:
        print('  ', k, tot[(mdl,k)])
    print('   geo-flat integer start diff', sorted(diffs[mdl].items()))
    e = [x[0] for x in exact[mdl]]
    print('   exact geo-flat crossing time s: min %.3f median %.3f p99 %.3f max %.3f' % (min(e), statistics.median(e), sorted(e)[int(.99*len(e))], max(e)))
    e2 = [x for x in exact[mdl] if x[1] > 4000]
    print('   ... |y|>4km n=%d median %.3f' % (len(e2), statistics.median([x[0] for x in e2])))
    print('   halfwidths', collections.Counter(int(x[2]) for x in exact[mdl]).most_common(6))
print({c: sorted(v) for c, v in comp_model.items()})
json.dump(out, open(sys.argv[1] + '/matched.json', 'w'))
