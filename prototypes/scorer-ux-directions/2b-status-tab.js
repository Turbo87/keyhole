// PROTOTYPE: Round 2 prototype 2B, "Status tab". Class day tabs Overview, Task, Results and Status. The Status tab's
// label is the only place that shows the class day status, and the tab holds every publishing control.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const R = KH.r2;
  const e = KH.esc;

  const LABEL = { unplanned: 'Unplanned', 'task published': 'Task published', preliminary: 'Preliminary', unofficial: 'Unofficial', final: 'Final', cancelled: 'Cancelled' };

  // The tab shows the last published status. Unpublished changes and a passed deadline are added to it.
  function statusLabel(cd) {
    const pub = cd.published ? LABEL[cd.published.status] : 'Not published';
    const extra = [cd.reasons.length && 'changes', Q.deadlinePassed(cd) && 'deadline passed'].filter(Boolean);
    return '<span class="wf-badge' + (cd.reasons.length || Q.deadlinePassed(cd) ? ' solid' : '') + '">' + e(pub) + (extra.length ? ' · ' + extra.join(' · ') : '') + '</span>';
  }

  function tabs(ctx, key) {
    const cd = ctx.cd;
    const task = Q.task(cd);
    const c = R.counts(cd);
    const b = R.base(cd);
    const marks = R.live(cd) ? [c.check && c.check + ' check', c.unknown && c.unknown + ' unknown', c.stale && c.stale + ' stale', c.manual && c.manual + ' manual'].filter(Boolean) : [];
    const t = (k, href, label, badge, cls) => '<a class="' + (k === key ? 'on' : '') + (cls ? ' ' + cls : '') + '" href="#' + href + '">' + label + (badge || '') + '</a>';
    return '<div class="wf-tabs b2-tabs">' + t('overview', b, 'Overview') +
      t('task', b + '/task', 'Task', task ? ' <span class="wf-badge">✓ ' + e(task.letter) + ' published</span>' : ' <span class="wf-badge dashed">not published</span>') +
      t('results', b + '/results', 'Results', marks.map((m) => ' <span class="wf-badge' + (m.includes('check') ? ' solid' : '') + '">' + m + '</span>').join('')) +
      t('status', b + '/status', 'Status ', statusLabel(cd), 'status') + '</div>';
  }

  function frame(ctx, key, body) {
    const cls = ctx.cls;
    const date = ctx.params.date;
    const title = e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, date)) + ' <span class="muted" style="font-weight:400">' + W.date(date, true) + '</span>';
    if (key === 'untouched') return R.page(ctx, title, body);
    const tabKey = { candidate: 'task', review: 'results' }[key] ?? key;
    return R.page(ctx, title, tabs(ctx, tabKey) + body);
  }

  // The summary leaves out every status and publishing detail, which belong to the Status tab.
  function overview(ctx) {
    const cd = ctx.cd;
    const task = Q.task(cd);
    const c = R.counts(cd);
    const L = R.links;
    const eff = KH.effective(cd, ctx.cls);
    const summary = '<div class="wf-box"><h3>Class day</h3><div class="wf-kv">' +
      '<span>Practice day</span><span>' + (cd.practice ? 'yes' : 'no') + '</span>' +
      '<span>Task</span><span>' + (task ? '<a href="#' + L.candidate(task) + '">' + e(task.letter) + '</a> ' + e(Q.taskLine(task)) + ', ' + W.km(Q.taskDistance(task)) : 'none published · <a href="#' + L.classDayTasks(cd) + '">Enter or import</a>') + '</span>' +
      (R.live(cd) ? '<span>Results</span><span>' + c.ok + ' OK, <a href="#' + L.classDayResults(cd, 'check') + '">' + c.check + ' in check</a>, <a href="#' + L.classDayResults(cd, 'unknown') + '">' + c.unknown + ' unknown</a>, ' + c.manual + ' manual</span>' : '') +
      '</div></div>';
    const settings = '<div class="wf-box b2-settings"><h3>Day settings <span class="muted small" style="font-weight:400">apply to every task candidate · start opens ' + e(eff.startOpen || '—') + (cd.airspaceExceptions.length ? ' · ' + cd.airspaceExceptions.length + ' airspace exceptions' : '') + '</span></h3>' + R.settingsSection(cd) + '</div>';
    return '<div class="wf-stack"><div class="wf-cols"><div class="wf-stack">' + summary + R.staleBox(cd) + '</div><div>' + (task ? W.taskMap(task.points, { h: 220 }) : '<div class="wf-map" style="height:220px"><span class="tag">No task published yet</span></div>') + '</div></div>' + settings + '</div>';
  }

  // The shared publish panel already shows the published status, working status and changes, so the tab adds
  // only the working status control, and the published copy gets the full width below it.
  function status(ctx) {
    const cd = ctx.cd;
    return '<div class="wf-stack"><div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))"><div class="wf-box"><h3>Publish</h3>' + W.publishPanel(cd) + '</div>' +
      '<div class="wf-box"><h3>Working status</h3><p>' + W.select('status', KH.DAY_STATUSES, cd.status, 'data-change="setWorkingStatus" data-cd="' + cd.id + '"') + '</p><p class="muted small">What you are working towards. It stays internal until you publish.</p></div></div>' +
      '<div class="wf-box"><h3>Latest published copy</h3>' + W.publishedCopy(cd) + '</div></div>';
  }

  function cell(x) {
    const r = x.result;
    let k = 'ok';
    if (r.checkReasons.length) k = 'chk';
    else if (x.status === 'unknown') k = 'unknown';
    else if (Q.filesOfResult(r).some((f) => f.analysis.stale.length)) k = 'stale';
    if (r.status === 'manual result') k += ' manual';
    const pts = x.status === 'unknown' ? '?' : x.status === 'did not fly' ? 'DNF' : x.placeholder ? '–' : x.points ?? '';
    return '<span class="b2-s ' + k + '">' + (r.penalty ? '<small>−' + r.penalty.points + '</small> ' : '') + pts + '</span>';
  }
  function header(cd, cls, date) {
    return e(Q.dayLabel(cls.id, date).replace('Practice day ', 'P').replace('Day ', 'D')) + '<div class="muted small">' + e(date.slice(8) + '.' + date.slice(5, 7)) + '</div>';
  }
  const sw = (k, label) => '<span><span class="b2-sw ' + k + '"></span>' + label + '</span>';

  R.mount({
    id: '2b',
    paths: { tasks: '/task', candidate: (id) => '/task/' + id, results: '/results', publish: '/status' },
    dayRoutes: [
      { sub: '', key: 'overview', title: 'Class day: Overview tab with day settings' },
      { sub: '/task', key: 'task', title: 'Task tab: candidates' },
      { sub: '/task/:cand', key: 'candidate', title: 'Task candidate editor', noExample: true },
      { sub: '/results', key: 'results', title: 'Results tab' },
      { sub: '/status', key: 'status', title: 'Status tab: working status and publishing' },
    ],
    sections: {
      overview,
      task: (ctx) => R.taskSection(ctx),
      candidate: (ctx) => R.taskSection(ctx),
      results: (ctx) => R.resultsSection(ctx),
      status,
    },
    frame,
    standingsHeader: header,
    standingsCell: cell,
    standingsLegend: '<div class="r2-legend">' + sw('chk', 'in check') + sw('unknown', 'unknown') + sw('stale', 'stale analysis') + sw('ok', 'reviewed') + sw('manual', 'manual result') + '<span>−n penalty · ? unknown · DNF · – no result yet</span></div>',
  });
})();
