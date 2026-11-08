// PROTOTYPE: Round 2 prototype 2F, "Settings tab". Class day tabs Overview, Day, Task and Results. The Day tab holds
// everything about the day rather than its task, and results are published from the Results tab.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const R = KH.r2;
  const e = KH.esc;

  const NEXT = { unplanned: 'preliminary', 'task published': 'preliminary', preliminary: 'unofficial', unofficial: 'final' };
  const publishPath = (cd, status) => R.base(cd) + '/results/publish' + (status ? '?as=' + encodeURIComponent(status) : '');

  function tabs(ctx, key) {
    const cd = ctx.cd;
    const task = Q.task(cd);
    const c = R.counts(cd);
    const b = R.base(cd);
    const marks = R.live(cd) ? [c.check && c.check + ' check', c.unknown && c.unknown + ' unknown', c.stale && c.stale + ' stale', c.manual && c.manual + ' manual'].filter(Boolean) : [];
    const t = (k, href, label, badge) => '<a class="' + (k === key ? 'on' : '') + '" href="#' + href + '">' + label + (badge || '') + '</a>';
    return '<div class="wf-tabs">' + t('overview', b, 'Overview') +
      t('day', b + '/day', 'Day', cd.practice ? ' <span class="wf-badge">practice</span>' : '') +
      t('task', b + '/task', 'Task', task ? ' <span class="wf-badge">✓ ' + e(task.letter) + ' published</span>' : ' <span class="wf-badge dashed">not published</span>') +
      t('results', b + '/results', 'Results', marks.map((m) => ' <span class="wf-badge' + (m.includes('check') ? ' solid' : '') + '">' + m + '</span>').join('')) + '</div>';
  }

  // The day status lives in the breadcrumb only. The shell renders the crumb, so the status is appended to it here.
  function withStatus(html, ctx) {
    const cd = ctx.cd;
    if (!cd) return html;
    const crumb = '>' + e(ctx.cls.name + ' · ' + Q.dayLabel(ctx.cls.id, cd.date)) + '</a>';
    const pub = cd.published ? cd.published.status : 'nothing published';
    return html.replace(crumb, crumb + ' <span class="f2-crumb-status">· ' + e(pub) + (cd.reasons.length ? ', unpublished changes' : '') + '</span>');
  }

  function frame(ctx, key, body) {
    const cls = ctx.cls;
    const date = ctx.params.date;
    const title = e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, date)) + ' <span class="muted" style="font-weight:400">' + W.date(date, true) + '</span>';
    if (key === 'untouched') return R.page(ctx, title, body);
    const tabKey = { candidate: 'task', review: 'results', publish: 'results' }[key] || key;
    return withStatus(R.page(ctx, title, tabs(ctx, tabKey) + body), ctx);
  }

  // Publishing sits where the results are read. The bar offers the next status, and republishing when changes wait.
  function publishBar(cd) {
    const pub = cd.published && cd.published.status;
    const next = pub === 'cancelled' ? null : NEXT[pub || 'unplanned'];
    const lines = [];
    lines.push('<b>' + (pub ? 'Published as ' + e(pub) + ' ' + W.dt(cd.published.at) : 'No results published yet') + '</b>');
    if (cd.complaintDeadline && pub === 'unofficial') lines.push((Q.deadlinePassed(cd) ? 'Complaint deadline passed ' : 'Complaints until ') + W.dt(cd.complaintDeadline));
    lines.push(cd.reasons.length ? 'Unpublished changes: ' + e(cd.reasons.join(', ').toLowerCase()) : 'No unpublished changes');
    const acts = [];
    if (next && Q.task(cd)) acts.push('<a class="wf-btn small primary" href="#' + publishPath(cd, next) + '">Publish these results as ' + next + '…</a>');
    if (pub && pub !== 'task published' && cd.reasons.length) acts.push('<a class="wf-btn small' + (next ? '' : ' primary') + '" href="#' + publishPath(cd, pub) + '">Republish as ' + e(pub) + '…</a>');
    acts.push('<a class="wf-btn small" href="#' + publishPath(cd) + '">Other status…</a>');
    return '<div class="f2-bar"><div class="info">' + lines.join('<span></span>') + '</div><div class="acts">' + acts.join('') + '</div></div>';
  }

  function daySection(ctx) {
    const cd = ctx.cd;
    return '<div class="wf-stack f2-day"><div class="wf-box"><h3>Working status</h3><div class="wf-row">' +
      W.select('status', KH.DAY_STATUSES, cd.status, 'data-change="setWorkingStatus" data-cd="' + cd.id + '"') +
      '<span class="muted small">Internal. Pilots see the status only once it is published from the Results tab.</span></div></div>' +
      '<p class="muted small" style="margin:0">Practice day, start procedure, limits and airspace belong to the day and apply to every task candidate.</p>' +
      R.settingsSection(cd) + '</div>';
  }

  function publishSection(ctx) {
    const cd = ctx.cd;
    const as = ctx.query.as;
    return '<p><a href="#' + R.links.classDayResults(cd) + '">← Back to the results</a></p><div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))"><div class="wf-box"><h3>Publish results</h3>' +
      W.publishPanel(cd, as ? { status: as } : undefined) + '</div><div class="wf-box"><h3>Latest published copy</h3>' + W.publishedCopy(cd) + '</div></div>';
  }

  function cell(x) {
    const r = x.result;
    const m = [];
    if (r.checkReasons.length) m.push('!');
    if (Q.filesOfResult(r).some((f) => f.analysis.stale.length)) m.push('~');
    if (r.status === 'manual result') m.push('M');
    if (x.status === 'unknown') m.push('?');
    if (r.penalty) m.push('−' + r.penalty.points);
    const pts = x.status === 'unknown' ? '' : x.status === 'did not fly' ? 'DNF' : x.placeholder ? '–' : x.points ?? '';
    return '<span class="f2-cell"><span>' + (pts === '' ? '&nbsp;' : pts) + '</span><span class="mk">' + m.join(' ') + '</span></span>';
  }
  function header(cd, cls, date) {
    const label = Q.dayLabel(cls.id, date).replace('Practice day ', 'P').replace('Day ', 'D');
    return '<div class="f2-head">' + e(label) + '<div class="muted">' + e(W.date(date).replace(/^\w+ /, '')) + '</div></div>';
  }

  R.mount({
    id: '2f',
    paths: { tasks: '/task', candidate: (id) => '/task/' + id, results: '/results', publish: '/results/publish' },
    dayRoutes: [
      { sub: '', key: 'overview', title: 'Class day: Overview tab' },
      { sub: '/day', key: 'day', title: 'Day tab: working status, practice, start procedure, limits, airspace' },
      { sub: '/task', key: 'task', title: 'Task tab: candidates' },
      { sub: '/task/:cand', key: 'candidate', title: 'Task candidate editor', noExample: true },
      { sub: '/results', key: 'results', title: 'Results tab with publish bar' },
      { sub: '/results/publish', key: 'publish', title: 'Publish results (from the Results tab)' },
    ],
    sections: {
      overview: (ctx) => R.daySummary(ctx.cd),
      day: daySection,
      task: (ctx) => R.taskSection(ctx),
      candidate: (ctx) => R.taskSection(ctx),
      results: (ctx) => publishBar(ctx.cd) + R.resultsSection(ctx),
      publish: publishSection,
    },
    frame,
    standingsHeader: header,
    standingsCell: cell,
    standingsLegend: '<div class="r2-legend"><span>Cell: points, DNF, – no result yet</span><span>Second line: ! in check</span><span>~ stale analysis</span><span>M manual result</span><span>? unknown</span><span>−n penalty</span></div>',
  });
})();
