import json, glob, sys, statistics as st
def q(v, p): v = sorted(v); return v[min(len(v)-1, int(p*len(v)))]
for path in sys.argv[1:]:
    files = glob.glob(path + '/*.jsonl') if not path.endswith('.jsonl') else [path]
    r = [json.loads(l) for f in files for l in open(f)]
    N = sum(x['n'] for x in r)
    print('==', path.split('/')[-1], 'flights', len(r), 'fixes', N, 'median fixes', q([x['n'] for x in r], .5), 'max', max(x['n'] for x in r))
    for k in ['flat_ns', 'geo_ns', 'pre_ns', 'parse_ns']:
        v = [x[k] for x in r]
        print('  %-9s per fix %7.1f ns | per flight median %9.3f ms p99 %9.3f ms | total %8.2f s' % (k, sum(v)/N, q(v,.5)/1e6, q(v,.99)/1e6, sum(v)/1e9))
    print('  proj only: flat %.2f ns/fix, geo %.1f ns/fix' % (sum(x['flat_proj_ns'] for x in r)/N, sum(x['geo_proj_ns'] for x in r)/N))
    nc = sum(x['n_geo'] for x in r)
    print('  crossings flat %d geo %d; exact intersection %.0f ns/crossing, %.2f iterations/crossing' % (sum(x['n_flat'] for x in r), nc, sum(x['exact_ns'] for x in r)/max(1,nc), sum(x['exact_iters'] for x in r)/max(1,nc)))
    print('  prefilter: geodesic evals %d (%.3f%% of fixes), identical crossings on %d/%d flights' % (sum(x['pre_evals'] for x in r), 100*sum(x['pre_evals'] for x in r)/N, sum(x['identical'] for x in r), len(r)))
    print('  exact vs linear: floor differs on %d crossings, max |dt| %.2e s' % (sum(x['floor_diff'] for x in r), max(x['max_exact_dt'] for x in r)))
    bad = [x['file'] for x in r if not x['identical']][:5]
    if bad: print('  non-identical:', bad)
