// PROTOTYPE: Round 2 prototype 2A, "Status track". Class day tabs Overview, Task and Results, with a status track
// under the title that ends in the publishing controls.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const R = KH.r2;
  const e = KH.esc;

  const STEPS = ['task published', 'preliminary', 'unofficial', 'final'];
  const LABEL = { 'task published': 'Task published', preliminary: 'Preliminary', unofficial: 'Unofficial', final: 'Final' };

  // The track shows the last published status. Unpublished changes are a mark after it, never a step back.
  function track(cd) {
    const pub = cd.published && cd.published.status;
    const publishBtn = '<a class="wf-btn small primary" href="#' + R.links.classDayPublish(cd) + '">Publish…</a>';
    const pending = cd.reasons.length ? '<span class="wf-badge dashed" title="' + e(cd.reasons.join(', ')) + '">unpublished changes</span>' : '';
    const working = cd.status !== pub && cd.status !== 'unplanned' ? '<span class="muted small">working status: ' + e(cd.status) + '</span>' : '';
    if (pub === 'cancelled') return '<div class="a2-track"><span class="a2-cancel">Cancelled · published ' + W.dt(cd.published.at) + '</span><span class="a2-after">' + working + pending + publishBtn + '</span></div>';
    const at = STEPS.indexOf(pub);
    const steps = STEPS.map((s, i) => {
      let sub = '';
      if (s === 'unofficial' && pub === 'unofficial' && cd.complaintDeadline) sub = (Q.deadlinePassed(cd) ? 'deadline passed ' : 'complaints until ') + W.dt(cd.complaintDeadline);
      else if (i === at) sub = W.dt(cd.published.at);
      return '<span class="a2-step' + (i < at ? ' done' : i === at ? ' cur' : '') + '">' + LABEL[s] + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</span>';
    }).join('');
    return '<div class="a2-track">' + steps + '<span class="a2-after">' + (at < 0 ? '<span class="muted small">nothing published</span>' : '') + working + pending + publishBtn + '</span></div>';
  }

  function tabs(ctx, key) {
    const cd = ctx.cd;
    const task = Q.task(cd);
    const c = R.counts(cd);
    const b = R.base(cd);
    const marks = R.live(cd) ? [c.check && c.check + ' check', c.unknown && c.unknown + ' unknown', c.stale && c.stale + ' stale', c.manual && c.manual + ' manual'].filter(Boolean) : [];
    const t = (k, href, label, badge) => '<a class="' + (k === key ? 'on' : '') + '" href="#' + href + '">' + label + (badge || '') + '</a>';
    return '<div class="wf-tabs">' + t('overview', b, 'Overview') +
      t('task', b + '/task', 'Task', task ? ' <span class="wf-badge">✓ ' + e(task.letter) + ' published</span>' : ' <span class="wf-badge dashed">not published</span>') +
      t('results', b + '/results', 'Results', marks.map((m) => ' <span class="wf-badge' + (m.includes('check') ? ' solid' : '') + '">' + m + '</span>').join('')) + '</div>';
  }

  function frame(ctx, key, body) {
    const cls = ctx.cls;
    const date = ctx.params.date;
    const title = e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, date)) + ' <span class="muted" style="font-weight:400">' + W.date(date, true) + '</span>';
    if (key === 'untouched') return R.page(ctx, title, body);
    const tabKey = { candidate: 'task', review: 'results', publish: '' }[key] ?? key;
    return R.page(ctx, title, track(ctx.cd) + tabs(ctx, tabKey) + (key === 'publish' ? '<h2>Publish</h2>' : '') + body);
  }

  // Start procedure, limits and airspace apply to every candidate, so they sit above the candidates.
  function shared(cd) {
    const eff = KH.effective(cd, Q.class(cd.classId));
    const summary = ['start opens ' + (eff.startOpen || '—'), eff.maxStartAlt ? 'max start ' + eff.maxStartAlt + ' m' : '', eff.maxAltitude ? 'max ' + eff.maxAltitude : '', cd.airspaceExceptions.length ? cd.airspaceExceptions.length + ' airspace exceptions' : ''].filter(Boolean).join(' · ');
    return '<details class="a2-shared"' + (Q.task(cd) ? '' : ' open') + '><summary><b>Start procedure, limits and airspace</b> <span class="muted small">for every candidate · ' + e(summary) + '</span></summary><div>' + R.settingsSection(cd) + '</div></details>';
  }

  function cell(x) {
    const r = x.result;
    const m = [];
    if (r.checkReasons.length) m.push('!');
    if (Q.filesOfResult(r).some((f) => f.analysis.stale.length)) m.push('~');
    if (r.status === 'manual result') m.push('M');
    if (r.penalty) m.push('−' + r.penalty.points);
    const pts = x.status === 'unknown' ? '?' : x.status === 'did not fly' ? 'DNF' : x.placeholder ? '–' : x.points ?? '';
    return '<span class="a2-cell">' + (m.length ? '<span class="mk">' + m.join('') + '</span>' : '') + pts + '</span>';
  }
  const LETTER = { unplanned: '', 'task published': 'T', preliminary: 'P', unofficial: 'U', final: 'F', cancelled: 'C' };
  function header(cd, cls, date) {
    const label = Q.dayLabel(cls.id, date).replace('Practice day ', 'P').replace('Day ', 'D');
    return e(label) + '<div class="muted small">' + (cd ? LETTER[cd.status] || '·' : '·') + '</div>';
  }

  R.mount({
    id: '2a',
    paths: { tasks: '/task', candidate: (id) => '/task/' + id, results: '/results', publish: '/publish' },
    dayRoutes: [
      { sub: '', key: 'overview', title: 'Class day: Overview tab' },
      { sub: '/task', key: 'task', title: 'Task tab: shared settings and candidates' },
      { sub: '/task/:cand', key: 'candidate', title: 'Task candidate editor', noExample: true },
      { sub: '/results', key: 'results', title: 'Results tab' },
      { sub: '/publish', key: 'publish', title: 'Publish (from the status track, no tab)' },
    ],
    sections: {
      overview: (ctx) => R.daySummary(ctx.cd),
      task: (ctx) => shared(ctx.cd) + '<h3>Task candidates</h3>' + R.taskSection(ctx),
      candidate: (ctx) => R.taskSection(ctx),
      results: (ctx) => R.resultsSection(ctx),
      publish: (ctx) => R.publishSection(ctx.cd),
    },
    frame,
    standingsHeader: header,
    standingsCell: cell,
    standingsLegend: '<div class="r2-legend"><span>Cell: points, ? unknown, DNF, – no result yet</span><span>! in check</span><span>~ stale analysis</span><span>M manual result</span><span>−n penalty</span><span>Header letter: T task published, P preliminary, U unofficial, F final, C cancelled</span></div>',
  });
})();
