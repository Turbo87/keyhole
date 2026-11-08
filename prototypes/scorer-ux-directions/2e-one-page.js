// PROTOTYPE: Round 2 prototype 2E, "One page". A class day is one scrolling page with a sticky section index, and
// a sticky footer bar carries the day status and the publishing action.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const R = KH.r2;
  const e = KH.esc;

  const SECTIONS = ['settings', 'task', 'results', 'publish'];
  const LABEL = { settings: 'Day settings', task: 'Task', results: 'Results', publish: 'Publish' };

  // The section to scroll to: ?section=…, or the results when a results filter is set.
  function target(ctx) {
    if (SECTIONS.includes(ctx.query.section)) return ctx.query.section;
    return ctx.query.show !== undefined ? 'results' : null;
  }
  function scrollTo(id) {
    setTimeout(() => {
      const el = document.getElementById('e2-' + id);
      if (el && el.scrollIntoView) el.scrollIntoView();
    });
  }

  function marks(cd) {
    const task = Q.task(cd);
    const c = R.counts(cd);
    const live = R.live(cd);
    return {
      settings: '',
      task: task ? '<span class="wf-badge">✓ ' + e(task.letter) + ' published</span>' : '<span class="wf-badge dashed">not published</span>',
      results: live ? [c.check && '<span class="wf-badge solid">' + c.check + ' check</span>', c.unknown && '<span class="wf-badge">' + c.unknown + ' unknown</span>', c.stale && '<span class="wf-badge">' + c.stale + ' stale</span>', c.manual && '<span class="wf-badge">' + c.manual + ' manual</span>'].filter(Boolean).join(' ') : '',
      publish: cd.reasons.length ? '<span class="wf-badge dashed">unpublished changes</span>' : '',
    };
  }

  function index(cd, on) {
    const m = marks(cd);
    return '<nav class="e2-index">' + SECTIONS.map((s) => '<a class="' + (s === on ? 'on' : '') + '" href="#' + R.base(cd) + '?section=' + s + '">' + LABEL[s] + ' ' + m[s] + '</a>').join('') + '</nav>';
  }

  function footer(cd) {
    const pub = cd.published && cd.published.status;
    const bits = [];
    bits.push('<span>Published: <span class="st">' + (pub ? e(pub) : 'nothing yet') + '</span>' + (pub ? ' <span class="muted small">' + W.dt(cd.published.at) + '</span>' : '') + '</span>');
    if (cd.status !== pub && cd.status !== 'unplanned') bits.push('<span class="muted small">working status: ' + e(cd.status) + '</span>');
    if (pub === 'unofficial' && cd.complaintDeadline) bits.push('<span class="wf-badge' + (Q.deadlinePassed(cd) ? ' solid' : '') + '">' + (Q.deadlinePassed(cd) ? 'complaint deadline passed ' : 'complaints until ') + W.dt(cd.complaintDeadline) + '</span>');
    if (cd.reasons.length) bits.push('<span class="wf-badge dashed" title="' + e(cd.reasons.join(', ')) + '">unpublished: ' + e(cd.reasons.join(', ').toLowerCase()) + '</span>');
    return '<div class="e2-foot">' + bits.join('') + '<span class="grow"></span><a class="wf-btn primary" href="#' + R.base(cd) + '?section=publish">Publish…</a></div>';
  }

  // Start procedure, limits and airspace apply to every candidate, so they come first, folded to a summary.
  function settings(cd) {
    const eff = KH.effective(cd, Q.class(cd.classId));
    const summary = [cd.practice ? 'practice day' : '', 'start opens ' + (eff.startOpen || '—'), eff.maxStartAlt ? 'max start ' + eff.maxStartAlt + ' m' : '', eff.maxAltitude ? 'max ' + eff.maxAltitude : '', cd.airspaceExceptions.length ? cd.airspaceExceptions.length + ' airspace exceptions' : 'no airspace exceptions'].filter(Boolean).join(' · ');
    return '<details class="e2-settings"' + (Q.task(cd) ? '' : ' open') + '><summary><b>Edit</b> <span class="muted small">' + e(summary) + '</span></summary><div>' + R.settingsSection(cd) + '</div></details>';
  }

  function taskSection(ctx) {
    const task = Q.task(ctx.cd);
    return (task ? '<div class="wf-cols" style="margin-bottom:12px"><div class="wf-box"><h3>Published task ' + e(task.letter) + '</h3><p>' + e(Q.taskLine(task)) + ', ' + W.km(Q.taskDistance(task)) + '</p></div>' + W.taskMap(task.points, { h: 180 }) + '</div>' : '') +
      '<h3>Task candidates</h3>' + R.taskSection(ctx);
  }

  // The published copy is as long as the results, so it stays folded at the end of the page.
  function publish(cd) {
    return '<div class="wf-box" style="max-width:640px">' + W.publishPanel(cd) + '</div>' +
      '<details class="e2-settings" style="margin-top:12px"><summary><b>Latest published copy</b></summary><div>' + W.publishedCopy(cd) + '</div></details>';
  }

  function sec(id, cd, body) {
    return '<section class="e2-sec" id="e2-' + id + '"><h2>' + LABEL[id] + ' ' + marks(cd)[id] + '</h2>' + body + '</section>';
  }

  function page(ctx) {
    const cd = ctx.cd;
    const on = target(ctx);
    if (on) scrollTo(on);
    return index(cd, on) +
      sec('settings', cd, settings(cd)) +
      sec('task', cd, taskSection(ctx)) +
      sec('results', cd, R.live(cd) ? R.resultsSection(ctx) : '<p class="muted">No results: this class day is ' + e(cd.status) + '.</p>') +
      sec('publish', cd, publish(cd));
  }

  function frame(ctx, key, body) {
    const cls = ctx.cls;
    const date = ctx.params.date;
    const title = e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, date)) + ' <span class="muted" style="font-weight:400">' + W.date(date, true) + '</span>';
    if (key === 'untouched') return R.page(ctx, title, body);
    const lead = key === 'page' ? '' : index(ctx.cd, key === 'candidate' ? 'task' : 'results');
    const back = key === 'page' ? '' : '<p><a href="#' + R.base(ctx.cd) + '?section=' + (key === 'candidate' ? 'task' : 'results') + '">← Back to the class day page</a></p>';
    return R.page(ctx, title, lead + back + body + footer(ctx.cd));
  }

  // Standings: a review-state heatmap by default, points on request (?cells=points).
  function pointsMode() {
    return KH.current().query.cells === 'points';
  }
  function state(x) {
    const r = x.result;
    if (r.checkReasons.length) return 'check';
    if (Q.filesOfResult(r).some((f) => f.analysis.stale.length)) return 'stale';
    if (x.status === 'unknown') return 'unknown';
    if (r.status === 'manual result') return 'manual';
    if (x.status === 'did not fly') return 'dnf';
    return 'ok';
  }
  const STATE = { check: 'in check', stale: 'stale analysis', unknown: 'unknown', manual: 'manual result', dnf: 'did not fly', ok: 'OK' };
  function cell(x) {
    if (pointsMode()) return x.status === 'unknown' ? '?' : x.status === 'did not fly' ? 'DNF' : x.placeholder ? '–' : x.points ?? '';
    const s = state(x);
    return '<span class="e2-hm ' + s + (x.result.penalty ? ' pen' : '') + '" title="' + STATE[s] + (x.result.penalty ? ', penalty −' + x.result.penalty.points : '') + '"></span>';
  }
  function header(cd, cls, date) {
    return e(Q.dayLabel(cls.id, date).replace('Practice day ', 'P').replace('Day ', 'D')) + '<div>' + R.dot(cd) + '</div>';
  }
  const variant = {
    id: '2e',
    paths: { tasks: '', candidate: (id) => '/task/' + id, results: '', publish: '?section=publish' },
    dayRoutes: [
      { sub: '', key: 'page', title: 'Class day: one page (?section=settings|task|results|publish, ?show=…)' },
      { sub: '/task/:cand', key: 'candidate', title: 'Task candidate editor', noExample: true },
    ],
    sections: {
      page,
      candidate: (ctx) => R.taskSection(ctx),
    },
    frame,
    standingsHeader: header,
    standingsCell: cell,
  };
  Object.defineProperty(variant, 'standingsLegend', {
    get() {
      const pts = pointsMode();
      const seg = '<span class="seg"><a class="' + (pts ? '' : 'on') + '" href="#' + KH.withQuery({ cells: '' }) + '">Review state</a><a class="' + (pts ? 'on' : '') + '" href="#' + KH.withQuery({ cells: 'points' }) + '">Points</a></span>';
      const key = pts ? '<span>? unknown, DNF did not fly, – no result yet</span>' : ['check', 'stale', 'unknown', 'manual', 'dnf', 'ok'].map((s) => '<span><span class="e2-hm ' + s + '"></span> ' + STATE[s] + '</span>').join('') + '<span><span class="e2-hm ok pen"></span> underline: penalty</span>';
      return '<div class="e2-legend">Cells: ' + seg + key + '<span>Header dot: class day status</span></div>';
    },
  });
  R.mount(variant);
})();
