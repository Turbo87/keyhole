// PROTOTYPE: Round 2 variant 2D, "Flights tab".
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const R = KH.r2;
  const e = KH.esc;

  function badge(label, solid) {
    return ' <span class="wf-badge' + (solid ? ' solid' : '') + '">' + label + '</span>';
  }

  function tabs(cd, key) {
    const b = R.base(cd);
    const c = R.counts(cd);
    const task = Q.task(cd);
    const tab = (name, path, label, mark) => '<a class="' + (key === name ? 'on' : '') + '" href="#' + b + path + '"' + (key === name ? ' aria-current="page"' : '') + '>' + label + (mark || '') + '</a>';
    return '<nav class="wf-tabs" aria-label="Class day">' + tab('overview', '', 'Overview') +
      tab('task', '/task', 'Task', task ? badge(e(task.letter) + ' published') : badge('not published')) +
      tab('flights', '/flights', 'Flights', (c.stale ? badge(c.stale + ' stale') : '') + (c.unknown ? badge(c.unknown + ' unknown') : '')) +
      tab('results', '/results', 'Results', (c.check ? badge(c.check + ' in check', true) : '') + (c.manual ? badge(c.manual + ' manual') : '')) + '</nav>';
  }

  function statusPill(cd) {
    const pub = cd.published;
    return '<span class="d2-pill" title="' + e(pub ? 'Last published ' + W.dt(pub.at) : 'This class day has never been published') + '">' +
      e(pub ? pub.status : 'Nothing published') + (cd.reasons.length ? '<span class="d2-change" role="img" aria-label="Unpublished changes" title="Unpublished: ' + e(cd.reasons.join(', ')) + '"></span>' : '') + '</span>';
  }

  function statusMenu(ds) {
    const cd = Q.classDay(ds.cd);
    KH.modal({
      title: 'Change status · ' + W.dayTitle(cd),
      body: '<div class="wf-stack d2-status-menu">' + statusPill(cd) +
        W.field('Working status', W.select('status', KH.DAY_STATUSES.filter((s) => s !== 'unplanned' || !Q.task(cd)), cd.status, 'data-change="d2WorkingStatus" data-cd="' + cd.id + '"')) +
        '<p class="muted small">The public sees the last published status. Changing the working status stays private until you publish.</p>' +
        '<a class="wf-btn primary" href="#' + R.links.classDayPublish(cd) + '">Publish status, task and results…</a>' +
        '<p class="muted small">Open the full publishing panel to set the complaint deadline and results note, and compare the published copy.</p>' +
        (cd.published && cd.published.rows.length ? '<button class="wf-btn small" data-act="printResults" data-cd="' + cd.id + '">Print published results sheet</button>' : '') + '</div>',
    });
  }

  function frame(ctx, key, body) {
    const title = e(ctx.cls.name) + ' · ' + e(Q.dayLabel(ctx.cls.id, ctx.params.date)) + ' <span class="muted" style="font-weight:400">' + W.date(ctx.params.date, true) + '</span>';
    if (key === 'untouched') return R.page(ctx, title, body);
    const tabKey = { candidate: 'task', review: 'results', publish: '' }[key] ?? key;
    return R.page(ctx, title + statusPill(ctx.cd), tabs(ctx.cd, tabKey) + (key === 'publish' ? '<h2>Publish</h2>' : '') + body,
      '<button class="wf-btn small" data-act="d2StatusMenu" data-cd="' + ctx.cd.id + '" aria-haspopup="dialog">Change status…</button>');
  }

  function task(ctx) {
    return '<details class="d2-settings"><summary><b>Day settings</b> <span class="muted small">Start procedure, limits and airspace · apply to every candidate</span></summary><div>' +
      R.settingsSection(ctx.cd) + '</div></details><h3>Task candidates</h3>' + R.taskSection(ctx);
  }

  function flights(ctx) {
    const cd = ctx.cd;
    const rows = W.filterFiles(ctx.comp, { date: cd.date, class: ctx.cls.slug }).rows;
    rows.sort((a, b) => a.f.uploadedAt.localeCompare(b.f.uploadedAt));
    const unresolved = Q.unresolvedFiles(ctx.comp.id).filter((f) => Q.flightDate(f) === cd.date);
    const arrived = new Set(rows.map((x) => x.res.competitor.id));
    const missing = Q.competitorsOf(ctx.comp.id, ctx.cls.id).filter((c) => !arrived.has(c.id));
    const unresolvedPath = R.links.files(ctx.comp) + '?date=' + cd.date + '&state=unresolved';
    return '<div class="wf-stack"><div><h2>Flights</h2><p class="muted small">Files and flight analysis for ' + e(ctx.cls.name) + ' · ' + W.date(cd.date) + '. <a href="#' + R.links.classDayResults(cd) + '">Review and score results →</a></p></div>' +
      '<div class="wf-cols"><div class="wf-box"><h3>Unresolved on this date (' + unresolved.length + ')</h3><p class="muted small">Across the competition: these files cannot yet be assigned to a class day.</p>' +
      '<a href="#' + unresolvedPath + '">Open IGC files filtered to unresolved on ' + W.date(cd.date) + ' →</a></div>' +
      '<div class="wf-box"><h3>Competitors without a file (' + missing.length + ')</h3>' + (missing.length ? '<div class="d2-missing">' + missing.map((c) => '<a href="#' + R.links.result(Q.resultFor(cd.id, c.id)) + '" title="' + e(Q.crewName(c)) + '">' + e(c.cid) + '</a>').join('') + '</div><p class="muted small">Open a competitor’s result to enter a manual result or record did not fly.</p>' : '<p class="muted small">Every competitor has at least one file.</p>') + '</div></div>' +
      '<div id="stale" class="wf-table-wrap">' + R.staleBox(cd) + '</div>' +
      '<div><div class="wf-row between"><h3>All class day IGC files (' + rows.length + ')</h3><span class="muted small">Upload order · earliest first</span></div><div class="wf-table-wrap">' + W.filesTable(rows) + '</div></div>' +
      '<details class="d2-settings"><summary>Upload an IGC file as scorer</summary><div>' + W.scorerUploadForm(ctx.comp, { date: cd.date }) + '</div></details></div>';
  }

  // Keep file reruns in Flights while preserving every filtered Results link from the shell.
  function results(ctx) {
    const cd = ctx.cd;
    const f = ctx.query.show || '';
    const c = R.counts(cd);
    const filter = (value, label, count) => '<a class="wf-btn small' + (f === value ? ' primary' : '') + '" href="#' + R.links.classDayResults(cd, value) + '">' + label + ' ' + count + '</a>';
    return '<div class="wf-stack"><div><h2>Working ranking</h2><p class="muted small">Review results, enter manual results and apply penalties. Open a row for the full result review.</p></div>' +
      '<div class="wf-row">' + filter('', 'All', c.results) + filter('check', 'In check', c.check) + filter('manual', 'Manual', c.manual) + filter('unknown', 'Unknown', c.unknown) + filter('stale', 'Stale files', c.stale) + '</div>' +
      (f === 'stale' ? '<div class="wf-note">Results with stale file analyses. <a href="#' + R.base(cd) + '/flights">Open Flights to rerun analyses →</a></div>' : '') + W.resultsTable(cd, { filter: f }) + '</div>';
  }

  function header(cd, cls, date) {
    const label = Q.dayLabel(cls.id, date).replace('Practice day ', 'P').replace('Day ', 'D');
    const status = cd && cd.published ? cd.published.status : 'unplanned';
    const parts = date.split('-');
    return '<span class="d2-head ' + status.replace(' ', '-') + '" title="Last published day status: ' + e(status) + '"><span>' + e(label) + '</span><small>' + Number(parts[2]) + '.' + Number(parts[1]) + '</small></span>';
  }

  function cell(x) {
    const r = x.result;
    const marks = [];
    if (r.checkReasons.length) marks.push('!');
    if (Q.filesOfResult(r).some((f) => f.analysis.stale.length)) marks.push('~');
    if (r.status === 'manual result') marks.push('M');
    if (x.status === 'unknown') marks.push('?');
    if (r.penalty) marks.push('−' + r.penalty.points);
    const points = x.status === 'did not fly' ? 'DNF' : x.placeholder ? '–' : x.points ?? '–';
    return '<span class="d2-cell">' + points + (marks.length ? '<small>' + marks.join(' ') + '</small>' : '') + '</span>';
  }

  R.mount({
    id: '2d',
    paths: { tasks: '/task', candidate: (id) => '/task/' + id, results: '/results', publish: '/publish' },
    dayRoutes: [
      { sub: '', key: 'overview', title: 'Class day: Overview tab' },
      { sub: '/task', key: 'task', title: 'Task tab: day settings and candidates' },
      { sub: '/task/:cand', key: 'candidate', title: 'Task candidate editor', noExample: true },
      { sub: '/flights', key: 'flights', title: 'Flights tab: files, reruns and missing uploads' },
      { sub: '/results', key: 'results', title: 'Results tab: working ranking and review' },
      { sub: '/publish', key: 'publish', title: 'Publish (from status menu, no tab)' },
    ],
    sections: { overview: (ctx) => R.daySummary(ctx.cd), task, candidate: (ctx) => R.taskSection(ctx), flights, results, publish: (ctx) => R.publishSection(ctx.cd) },
    frame,
    handlers: {
      d2StatusMenu: statusMenu,
      d2WorkingStatus(value, ds) {
        KH.handlers.setWorkingStatus(value, ds);
        statusMenu(ds);
      },
    },
    standingsHeader: header,
    standingsCell: cell,
    standingsLegend: '<div class="r2-legend"><span>Cells: points; – no result yet; DNF did not fly</span><span>! in check</span><span>~ stale analysis</span><span>M manual result</span><span>? unknown</span><span>−n penalty</span></div>' +
      '<div class="r2-legend d2-border-legend"><span>Header border: last published day status</span><span><i class="d2-head task-published">D</i> dotted: task published</span><span><i class="d2-head preliminary">D</i> dashed: preliminary</span><span><i class="d2-head unofficial">D</i> thin: unofficial</span><span><i class="d2-head final">D</i> thick: final</span><span><i class="d2-head cancelled">D</i> hatched / struck: cancelled</span><span>No border: unplanned or never published</span></div>',
  });
})();
