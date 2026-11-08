// PROTOTYPE: Round 2 variant 2C, "Day hub". Section cards open full pages without class day tabs.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const R = KH.r2;
  const e = KH.esc;

  function nextStatus(cd) {
    if (cd && cd.status === 'cancelled') return '';
    if (!cd || !Q.task(cd)) return 'task';
    if (cd.status === 'unplanned' || cd.status === 'task published') return 'preliminary';
    if (cd.status === 'preliminary') return 'unofficial';
    if (Q.deadlinePassed(cd)) return 'final';
    return '';
  }

  const TITLES = { settings: 'Day settings', task: 'Task candidates', candidate: 'Task candidate', results: 'Results', publish: 'Status and publishing', review: 'Result review' };

  function frame(ctx, key, body) {
    const cd = ctx.cd;
    const base = R.dayPath(ctx.cls, ctx.params.date);
    const next = nextStatus(cd);
    const title = e(ctx.cls.name) + ' · ' + e(Q.dayLabel(ctx.cls.id, ctx.params.date)) + ' ' + W.dayBadge(cd ? cd.status : 'unplanned') +
      ' <span class="muted small" style="font-weight:400">' + W.date(ctx.params.date, true) + '</span>';
    const actions = next ? '<a class="wf-btn primary" href="#' + base + '/publish">Publish ' + next + '…</a>' : '';
    const back = key !== 'hub' && ctx.path !== base ? '<p class="c2-back"><a href="#' + base + '">← Day hub</a></p>' : '';
    return R.page(ctx, title, back + (TITLES[key] ? '<h2>' + TITLES[key] + '</h2>' : '') + '<div class="c2-subpage">' + body + '</div>', actions);
  }

  function card(title, mark, body, href, linkLabel) {
    return '<section class="wf-box c2-card"><div class="wf-row between"><h2><a href="#' + href + '">' + title + '</a></h2><span class="wf-badge">' + e(mark) + '</span></div>' + body +
      '<a class="c2-open" href="#' + href + '">' + linkLabel + ' →</a></section>';
  }

  function hub(ctx) {
    const cd = ctx.cd;
    const base = R.base(cd);
    const task = Q.task(cd);
    const c = R.counts(cd);
    const eff = KH.effective(cd, ctx.cls);
    const pub = cd.published;
    const deadline = cd.complaintDeadline;
    const changed = Object.keys(cd.overrides).length;
    const resultLink = (show, label, n) => '<a href="#' + R.links.classDayResults(cd, show) + '">' + n + ' ' + label + '</a>';
    const settings = '<div class="wf-kv"><span>Start procedure</span><span>' + (eff.pevStart === 'yes' ? 'PEV start' : 'Start line') + ', opens ' + e(eff.startOpen || '—') + '</span>' +
      '<span>Limits</span><span>Maximum start altitude ' + e(eff.maxStartAlt || '—') + ' m · maximum altitude ' + e(eff.maxAltitude || '—') + '</span>' +
      '<span>Airspace</span><span>' + cd.airspaceExceptions.length + ' exceptions · ' + cd.notamAirspaces.length + ' NOTAM airspaces</span></div>';
    const taskBody = '<div>' + (task ? '<b>Task ' + e(task.letter) + '</b> · ' + W.km(Q.taskDistance(task)) + '<p class="muted small">' + e(Q.taskLine(task)) + '</p>' : '<p>No task published.</p>') +
      '<span class="muted small">' + Q.candidates(cd.id).length + ' task candidates</span></div>';
    const results = '<div class="wf-kv"><span>Review</span><span>' + resultLink('check', 'in check', c.check) + '</span>' +
      '<span>Result status</span><span>' + resultLink('unknown', 'unknown', c.unknown) + ' · ' + resultLink('manual', 'manual results', c.manual) + '</span>' +
      '<span>Flight analysis</span><span>' + resultLink('stale', 'stale files', c.stale) + '</span></div>';
    const publishing = '<div class="wf-kv"><span>Last published</span><span>' + (pub ? W.dayBadge(pub.status) + ' ' + W.dt(pub.at) : 'Nothing published') + '</span>' +
      '<span>Unpublished changes</span><span>' + (cd.reasons.length ? e(cd.reasons.join(', ')) : 'None') + '</span>' +
      '<span>Complaint deadline</span><span>' + (deadline ? W.dt(deadline) + (Q.deadlinePassed(cd) ? ' · passed' : '') : 'Not set') + '</span></div>';
    return '<p class="muted small c2-context">Day hub' + (cd.practice ? ' · Practice day · excluded from overall results' : '') + '</p><div class="c2-hub">' +
      card('Day settings', changed ? changed + ' rule overrides' : 'class defaults', settings, base + '/settings', 'Open day settings') +
      card('Task', task ? 'published' : 'not published', taskBody, base + '/task', 'Open task candidates') +
      card('Results', c.check + ' in check · ' + c.stale + ' stale', results, base + '/results', 'Open all ' + c.results + ' results') +
      card('Status and publishing', cd.reasons.length ? 'unpublished changes' : pub ? 'published' : 'not published', publishing, base + '/publish', 'Open status and publishing') + '</div>';
  }

  function publish(ctx) {
    const cd = ctx.cd;
    const next = nextStatus(cd);
    // The shared section has no status-default hook; the leaf widget does.
    return '<div class="wf-stack">' + (!Q.task(cd) && cd.status !== 'cancelled' ? '<div class="wf-box wf-table-wrap"><h3>Choose a candidate to publish as task</h3>' + R.taskSection(ctx) + '</div>' : '') +
      (cd.status === 'unofficial' && !Q.deadlinePassed(cd) ? '<p class="wf-note">The complaint deadline ' + W.dt(cd.complaintDeadline) + ' has not passed yet.</p>' : '') +
      '<div class="wf-box"><h3>Publish class day</h3>' + W.publishPanel(cd, { status: next && next !== 'task' ? next : cd.status }) + '</div>' +
      '<div class="wf-box wf-table-wrap"><h3>Latest published copy</h3>' + W.publishedCopy(cd) + '</div></div>';
  }

  function cell(x) {
    const r = x.result;
    const stale = Q.filesOfResult(r).some((f) => f.analysis.stale.length);
    const marker = r.checkReasons.length ? '!' : stale ? '~' : r.status === 'manual result' ? 'M' : r.status === 'unknown' ? '?' : r.penalty && r.penalty.points > 0 ? '−' : '';
    const labels = { '!': 'in check', '~': 'stale analysis', M: 'manual result', '?': 'unknown result', '−': 'penalty' };
    const points = x.points ?? (r.status === 'did not fly' ? '0' : '–');
    return '<span class="c2-cell">' + points + (marker ? '<sup title="' + labels[marker] + '" aria-label="' + labels[marker] + '">' + marker + '</sup>' : '') + '</span>';
  }

  const LETTER = { 'task published': 'T', preliminary: 'P', unofficial: 'U', final: 'F', cancelled: 'C' };
  function header(cd, cls, date) {
    const label = Q.dayLabel(cls.id, date).replace('Practice day ', 'P').replace('Day ', 'D');
    return e(label) + (cd && LETTER[cd.status] ? '<span class="c2-status-letter">' + LETTER[cd.status] + '</span>' : '');
  }

  R.mount({
    id: '2c',
    paths: { tasks: '/task', candidate: (id) => '/task/' + id, results: '/results', publish: '/publish' },
    dayRoutes: [
      { sub: '', key: 'hub', title: 'Class day: Day hub' },
      { sub: '/settings', key: 'settings', title: 'Day settings: start procedure, limits and airspace' },
      { sub: '/task', key: 'task', title: 'Task candidates' },
      { sub: '/task/:cand', key: 'candidate', title: 'Task candidate editor', noExample: true },
      { sub: '/results', key: 'results', title: 'Results with review filters' },
      { sub: '/publish', key: 'publish', title: 'Status and publishing' },
    ],
    sections: {
      hub,
      settings: (ctx) => R.settingsSection(ctx.cd),
      task: (ctx) => '<div class="wf-table-wrap">' + R.taskSection(ctx) + '</div>',
      candidate: (ctx) => R.taskSection(ctx),
      results: (ctx) => R.resultsSection(ctx),
      publish,
    },
    frame,
    standingsHeader: header,
    standingsCell: cell,
    standingsLegend: '<div class="r2-legend"><span>Cell: points; – no points yet; 0 also includes did not fly</span><span>One superscript, first applicable: ! in check → ~ stale → M manual → ? unknown → − penalty</span><span>Header: T task published · P preliminary · U unofficial · F final · C cancelled; no letter = unplanned</span><span>P1 = practice day 1</span></div>',
  });
})();
