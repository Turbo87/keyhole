// PROTOTYPE: round 2 shell shared by prototypes 2A to 2F.
//
// It implements every decision from the round 1 review (README.md, "Round 1 decisions"): the sidebar without a
// top bar, the overview page, the date page, the overall standings per class, the full-page result review, the
// setup pages, the IGC files, members and archive pages, the account and staff pages, and the guards.
// A variant only decides the open questions: the sections of a class day, where the start procedure, limits and
// airspace settings and the publishing controls live, where the class day status is shown and changed, and the
// contents of the standings cells and headers.
//
// Load order in a variant's HTML: shared/data.js, shared/proto.js, shared/widgets.js, shared/round2.js, then the
// variant script. Link shared/wire.css and shared/round2.css. The variant script calls KH.r2.mount(variant) once.
//
// variant = {
//   id: '2a',                       // matches the KH.DIRECTIONS entry in shared/proto.js
//   paths: {                        // where class day work lives, relative to the class day base path
//     tasks: '/task',               //   the task candidates list ('' allowed)
//     candidate: (id) => '/task/' + id,   // one candidate's editor
//     results: '/results',          //   the results list. It must honour ?show=check|unknown|stale|manual
//     publish: '/publish',          //   the publishing controls
//   },
//   dayRoutes: [                    // routes under the class day base path /c/:comp/days/:date/:class
//     { sub: '', key: 'overview', title: 'Class day overview' },
//     { sub: '/task/:cand', key: 'candidate', title: 'Task candidate editor', noExample: true },
//     ...                           // every path above must be covered by one of these
//   ],
//   sections: { overview(ctx) {...}, ... },  // key → function returning the body HTML of that class day route
//   frame(ctx, key, body),          // wraps a class day body into a full page. Use R.page() inside. key is a
//                                   // dayRoutes key, or 'review' for the shared result review page
//   standingsHeader(cd, cls, date), // optional: inner HTML of a standings column header. cd is null when untouched
//   standingsCell(x, cd),           // optional: inner HTML of a standings cell. x is a KH.score() row
//   standingsLegend,                // optional: HTML legend under the standings table
// }
//
// Context: every class day route resolves ctx.comp, ctx.cls, ctx.cd (null when untouched), ctx.params.date and,
// where present, ctx.cand, ctx.competitor and ctx.result. ctx.route.dayKey is the dayRoutes key.
// The shell checks the class, the date and an untouched class day before calling sections, so sections can rely on
// ctx.cd. Untouched class days render W.untouchedDay inside frame(ctx, 'untouched', body).
//
// Helpers on KH.r2 (call them as R.x after `const R = KH.r2`):
//   R.page(ctx, title, body, actions)   full page with sidebar, breadcrumbs and title row
//   R.base(cd) / R.dayPath(cls, date)   class day base path without '#'
//   R.counts(cd)                         Q.dayCounts plus `manual`
//   R.resultsSection(ctx)                filter buttons, stale box and the working results table
//   R.staleBox(cd)                       stale analyses with Rerun buttons, '' when none
//   R.taskSection(ctx)                   candidate list, or the editor when ctx.cand is set
//   R.settingsSection(cd)                start procedure, limits and airspace forms of the class day
//   R.publishSection(cd)                 publish form plus the latest published copy
//   R.daySummary(cd)                     practice flag, task, counts, task map and published copy
//   R.links                              the links map the shared widgets use
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const S = KH.state;
  const e = KH.esc;
  const R = (KH.r2 = {});
  let V;

  const C = (comp) => '/c/' + comp.slug;
  const dayPath = (cls, date) => C(Q.competition(cls.competitionId)) + '/days/' + date + '/' + cls.slug;
  const base = (cd) => dayPath(Q.class(cd.classId), cd.date);
  const live = (cd) => cd && !['unplanned', 'cancelled'].includes(cd.status);
  R.base = base;
  R.dayPath = dayPath;
  R.live = live;

  const links = {
    competition: C,
    cls: (cls) => C(Q.competition(cls.competitionId)) + '/classes/' + cls.slug + '/settings',
    standings: (cls) => C(Q.competition(cls.competitionId)) + '/classes/' + cls.slug,
    date: (comp, date) => C(comp) + '/days/' + date,
    classDay: base,
    classDayDate: dayPath,
    classDayTasks: (cd) => base(cd) + V.paths.tasks,
    classDayResults: (cd, show) => base(cd) + V.paths.results + (show ? '?show=' + show : ''),
    classDayPublish: (cd) => base(cd) + V.paths.publish,
    candidate: (t) => base(Q.classDay(t.classDayId)) + V.paths.candidate(t.id),
    result: (r) => base(Q.classDay(r.classDayId)) + '/results/' + Q.competitor(r.competitorId).cid,
    file: (f) => C(Q.competition(Q.logger(f.loggerId).competitionId)) + '/files/' + f.id,
    competitor: (c) => C(Q.competition(c.competitionId)) + '/competitors/' + c.id,
    competitors: (comp) => C(comp) + '/competitors',
    logger: (l) => C(Q.competition(l.competitionId)) + '/loggers/' + l.id,
    files: (comp) => C(comp) + '/files',
  };
  R.links = links;

  R.counts = (cd) => ({ ...Q.dayCounts(cd), manual: Q.resultsOf(cd).filter((r) => r.status === 'manual result').length });

  // ---------- shell ----------

  function dot(cd) {
    return '<span class="r2-dot ' + (cd ? cd.status.replace(' ', '-') : 'none') + '" title="' + (cd ? cd.status : 'untouched') + '"></span>';
  }
  R.dot = dot;

  function navItem(href, label, ctx, extra, depth, opts) {
    const cur = ctx.path === href;
    const within = !cur && opts && opts.within;
    return '<a class="r2-nav' + (cur ? ' cur' : within ? ' within' : '') + '" style="padding-left:' + (12 + (depth || 0) * 14) + 'px" href="#' + href + '">' + label + (extra ? '<span class="r2-nav-x">' + extra + '</span>' : '') + '</a>';
  }

  function sidebar(ctx) {
    const me = Q.me();
    const comp = ctx.comp;
    const comps = Q.myCompetitions();
    let html = '<nav class="r2-side" onclick="if(event.target.closest(\'a\'))document.body.classList.remove(\'r2-open\')"><div class="r2-top"><a class="r2-brand" href="#/">Keyhole</a>' +
      '<select class="r2-switch" onchange="location.hash=this.value"><option value="#/"' + (comp ? '' : ' selected') + '>My competitions</option>' +
      comps.map((c) => '<option value="#' + C(c) + '"' + (c === comp ? ' selected' : '') + '>' + e(c.name) + '</option>').join('') + '</select></div><div class="r2-scroll">';
    if (!comp) html += navItem('/', 'My competitions', ctx) + navItem('/new', 'Create competition', ctx);
    else if (comp.lifecycle === 'archived') html += navItem(C(comp), 'Overview', ctx) + navItem(C(comp) + '/members', 'Members', ctx) + navItem(C(comp) + '/lifecycle', 'Delete', ctx);
    else html += compNav(ctx, comp);
    html += '</div><div class="r2-account"><div><b>' + e(me.name) + '</b> <span class="muted small">' + (comp ? e(Q.roleIn(comp) || 'no role') : me.staff ? 'staff' : '') + '</span></div>' +
      navItem('/account', 'Account and invitations', ctx) + (me.staff ? navItem('/staff/users', 'Staff: users', ctx) + navItem('/staff/competitions', 'Staff: competitions', ctx) : '') +
      '<a class="r2-nav" href="#/" onclick="KH.toast(\'Prototype: would sign out\');return false">Sign out</a></div></nav>';
    return html;
  }

  function compNav(ctx, comp) {
    const b = C(comp);
    const classes = Q.classesOf(comp.id);
    const unresolved = Q.unresolvedFiles(comp.id).length;
    const p = ctx.path;
    let html = navItem(b, 'Overview', ctx) + navItem(b + '/details', 'Details and password', ctx) + navItem(b + '/dates', 'Dates and class days', ctx) +
      navItem(b + '/classes', 'Classes', ctx, String(classes.length), 0, { within: p.startsWith(b + '/classes/') });
    for (const cls of classes) html += navItem(links.standings(cls), e(cls.name) + ' standings', ctx, '', 1);
    html += navItem(b + '/turnpoints', 'Turnpoints', ctx, comp.turnpointFile ? '' : '—') + navItem(b + '/airspace', 'Airspace', ctx, comp.airspaceFile ? '' : '—') +
      navItem(b + '/competitors', 'Competitors', ctx, String(Q.competitorsOf(comp.id).length), 0, { within: p.startsWith(b + '/competitors/') }) +
      navItem(b + '/loggers', 'Loggers', ctx, String(Q.loggersOf(comp.id).length), 0, { within: p.startsWith(b + '/loggers/') }) +
      navItem(b + '/files', 'IGC files', ctx, unresolved ? unresolved + ' unresolved' : '', 0, { within: p.startsWith(b + '/files/') }) +
      navItem(b + '/members', 'Members', ctx) + navItem(b + '/lifecycle', 'Archive or delete', ctx);
    html += '<div class="r2-sec">Days</div>';
    if (!classes.length) return html + '<div class="muted small" style="padding:4px 12px">Add a class to plan its days</div>';
    const openDate = ctx.params.date || (comp.dates.includes(KH.TODAY) ? KH.TODAY : null);
    for (const date of comp.dates) {
      const labels = [...new Set(classes.map((c) => Q.dayLabel(c.id, date)))];
      const open = date === openDate;
      const label = W.date(date) + (date === KH.TODAY ? ' · today' : '') + (labels.length === 1 ? ' <span class="muted small">' + e(labels[0]) + '</span>' : '');
      html += navItem(links.date(comp, date), label, ctx, open ? '' : classes.map((c) => dot(Q.classDayOn(c.id, date))).join(''), 0, { within: ctx.params.date === date });
      if (!open) continue;
      for (const cls of classes) {
        const cd = Q.classDayOn(cls.id, date);
        const c = live(cd) ? Q.dayCounts(cd) : null;
        html += navItem(dayPath(cls, date), e(cls.name) + (labels.length > 1 ? ' <span class="muted small">' + e(Q.dayLabel(cls.id, date)) + '</span>' : ''), ctx, (c && c.check ? c.check + ' check ' : '') + dot(cd), 1, { within: ctx.cls === cls && ctx.params.date === date });
      }
    }
    return html;
  }

  function crumbs(ctx) {
    const out = [];
    const comp = ctx.comp;
    if (!comp) return '';
    out.push([C(comp), comp.name]);
    const d = ctx.params.date;
    if (d) out.push([links.date(comp, d), W.date(d, true)]);
    if (d && ctx.cls && ctx.route.path !== '/c/:comp/days/:date') out.push([dayPath(ctx.cls, d), ctx.cls.name + ' · ' + Q.dayLabel(ctx.cls.id, d)]);
    if (d && ctx.cd && ctx.params.cid && V.paths.results) out.push([links.classDayResults(ctx.cd), 'Results']);
    if (d && ctx.cd && ctx.cand && V.paths.tasks) out.push([links.classDayTasks(ctx.cd), 'Task']);
    if (!d && ctx.path.startsWith(C(comp) + '/classes/')) out.push([C(comp) + '/classes', 'Classes']);
    if (ctx.file) out.push([C(comp) + '/files', 'IGC files']);
    if (ctx.logger || ctx.path.endsWith('/loggers/new')) out.push([C(comp) + '/loggers', 'Loggers']);
    if (ctx.params.competitor || ctx.path.endsWith('/competitors/new')) out.push([C(comp) + '/competitors', 'Competitors']);
    if (out.length < 2 && ctx.path === C(comp)) return '';
    return '<div class="r2-crumbs">' + out.map(([h, t]) => '<a href="#' + h + '">' + e(t) + '</a>').join(' / ') + '</div>';
  }

  R.page = (ctx, title, body, actions) =>
    '<div class="r2">' + sidebar(ctx) + '<div class="r2-shade" onclick="document.body.classList.remove(\'r2-open\')"></div><main class="r2-main">' +
    '<button class="wf-btn r2-menu" onclick="document.body.classList.toggle(\'r2-open\')">☰ Menu</button>' + crumbs(ctx) +
    (ctx.comp && ctx.comp.blocked ? '<div class="wf-note warn">Blocked by staff ' + W.dt(ctx.comp.blocked.at) + ': ' + e(ctx.comp.blocked.note) + '. Only staff can see this competition.</div>' : '') +
    (title ? '<div class="r2-title"><h1>' + title + '</h1><div class="wf-row">' + (actions || '') + '</div></div>' : '') + body + '</main></div>';
  const page = R.page;
  const empty = (ctx, title, msg) => page(ctx, title, '<div class="wf-empty">' + msg + '</div>');

  // ---------- shared building blocks ----------

  R.staleBox = (cd) => {
    const stale = Q.staleFilesOf(cd);
    if (!stale.length) return '';
    return '<div class="wf-box"><h3>Stale analyses (' + stale.length + ')</h3><p class="muted small">Each file reruns on its own.</p><table class="wf-table"><tbody>' + stale.map((f) => {
      const r = Q.resolve(f);
      return '<tr><td><a href="#' + links.file(f) + '">' + e(f.name) + '</a></td><td>' + e(r.competitor.cid) + '</td><td>' + W.staleBadge(f) + '</td><td class="right"><button class="wf-btn small" data-act="rerun" data-file="' + f.id + '">Rerun</button></td></tr>';
    }).join('') + '</tbody></table></div>';
  };

  R.resultsSection = (ctx) => {
    const cd = ctx.cd;
    const f = ctx.query.show || '';
    const c = R.counts(cd);
    const flt = (k, label, n) => '<a class="wf-btn small' + (f === k ? ' primary' : '') + '" href="#' + links.classDayResults(cd, k) + '">' + label + ' ' + n + '</a>';
    return '<div class="wf-stack"><div class="wf-row">' + flt('', 'All', c.results) + flt('check', 'In check', c.check) + flt('unknown', 'Unknown', c.unknown) + flt('stale', 'Stale', c.stale) + flt('manual', 'Manual', c.manual) + '</div>' +
      (f === 'stale' || (!f && c.stale) ? R.staleBox(cd) : '') + '<div class="r2-wide">' + W.resultsTable(cd, { filter: f }) + '</div></div>';
  };

  R.taskSection = (ctx) => (ctx.cand ? '<p><a href="#' + links.classDayTasks(ctx.cd) + '">← All task candidates</a></p>' + W.taskEditor(ctx.cand) : W.candidateList(ctx.cd));

  R.settingsSection = (cd) => '<div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))"><div class="wf-box">' + W.dayOverrides(cd) + '</div><div class="wf-box">' + W.dayAirspace(cd) + '</div></div>';

  R.publishSection = (cd) => '<div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))"><div class="wf-box"><h3>Publish</h3>' + W.publishPanel(cd) + '</div><div class="wf-box"><h3>Latest published copy</h3>' + W.publishedCopy(cd) + '</div></div>';

  R.daySummary = (cd) => {
    const task = Q.task(cd);
    const c = R.counts(cd);
    return '<div class="wf-cols"><div class="wf-stack"><div class="wf-box"><h3>Class day</h3><div class="wf-kv">' +
      '<span>Practice day</span><span>' + (cd.practice ? 'yes' : 'no') + '</span>' +
      '<span>Task</span><span>' + (task ? '<a href="#' + links.candidate(task) + '">' + e(task.letter) + '</a> ' + e(Q.taskLine(task)) + ', ' + W.km(Q.taskDistance(task)) : 'none published · <a href="#' + links.classDayTasks(cd) + '">Enter or import</a>') + '</span>' +
      (live(cd) ? '<span>Results</span><span>' + c.ok + ' OK, <a href="#' + links.classDayResults(cd, 'check') + '">' + c.check + ' in check</a>, <a href="#' + links.classDayResults(cd, 'unknown') + '">' + c.unknown + ' unknown</a>, ' + c.manual + ' manual</span>' : '') +
      '<span>Unpublished</span><span>' + (cd.reasons.length ? e(cd.reasons.join(', ')) : 'nothing') + '</span></div></div>' + R.staleBox(cd) + '</div>' +
      '<div class="wf-stack">' + (task ? W.taskMap(task.points, { h: 220 }) : '') + '<div class="wf-box"><h3>Published copy</h3>' + (cd.published ? W.dayBadge(cd.published.status) + ' ' + W.dt(cd.published.at) + (cd.publishedTask ? '<div class="small">Task ' + e(cd.publishedTask.letter) + ': ' + e(cd.publishedTask.line) + '</div>' : '') : '<span class="muted">never published</span>') + '</div></div></div>';
  };

  // Dates as rows, classes as columns. Headers open the standings, cells open the class day.
  R.matrix = (comp) => {
    const classes = Q.classesOf(comp.id);
    if (!classes.length) return '<div class="wf-empty">No classes yet. <a href="#' + C(comp) + '/classes/new">Add a class</a> to fill the matrix.</div>';
    return '<div class="wf-table-wrap"><table class="r2-mx"><thead><tr><th class="rh">Date</th>' + classes.map((cls) => '<th><a href="#' + links.standings(cls) + '">' + e(cls.name) + '</a> <span class="muted small">' + Q.competitorsOf(comp.id, cls.id).length + '</span></th>').join('') + '</tr></thead><tbody>' +
      comp.dates.map((d) => '<tr class="' + (d === KH.TODAY ? 'today' : '') + '"><th class="rh"><a href="#' + links.date(comp, d) + '">' + W.date(d) + '</a>' + (d === KH.TODAY ? ' · today' : '') + '</th>' + classes.map((cls) => matrixCell(cls, d)).join('') + '</tr>').join('') + '</tbody></table></div>' +
      '<div class="r2-legend">Hatched: untouched. A class day exists once someone touches it. Column heads open the standings.</div>';
  };
  function matrixCell(cls, date) {
    const cd = Q.classDayOn(cls.id, date);
    const label = e(Q.dayLabel(cls.id, date));
    if (!cd) return '<td class="untouched"><a href="#' + dayPath(cls, date) + '"><div class="l1"><span>' + label + '</span></div><div class="l2">untouched</div></a></td>';
    const task = Q.task(cd);
    const c = live(cd) ? R.counts(cd) : null;
    const counts = c ? [c.check && c.check + ' check', c.unknown && c.unknown + ' unknown', c.stale && c.stale + ' stale'].filter(Boolean).join(' · ') : '';
    return '<td><a href="#' + base(cd) + '"><div class="l1"><span><b>' + label + '</b>' + (task ? ' · ' + e(task.letter) + ' ' + W.km(Q.taskDistance(task)) : '') + '</span>' + W.dayBadge(cd.status) + '</div>' +
      '<div class="l2">' + (counts || (c ? c.ok + ' OK' : '&nbsp;')) + '</div>' +
      (cd.reasons.length || Q.deadlinePassed(cd) ? '<div class="l2">' + (cd.reasons.length ? 'unpublished changes' : '') + (Q.deadlinePassed(cd) ? (cd.reasons.length ? ' · ' : '') + 'deadline passed' : '') + '</div>' : '') + '</a></td>';
  }

  function setupCard(comp) {
    const steps = W.setupState(comp);
    if (steps.every((s) => s.done)) return '';
    const classes = Q.classesOf(comp.id);
    const target = { details: 'details', airfield: 'details', classes: classes.length ? 'classes' : 'classes/new', turnpoints: 'turnpoints', airspace: 'airspace', competitors: 'competitors', loggers: 'loggers', members: 'members' };
    return '<div class="wf-box"><h3>Setup</h3><div class="wf-steps">' + steps.map((s) => '<a class="' + (s.done ? 'done' : 'todo') + '" href="#' + C(comp) + '/' + target[s.key] + '">' + (s.done ? '✓ ' : '') + e(s.label) + '</a>').join('') + '</div>' +
      (comp.createdAt > '2026-07-28' ? '<p class="muted small" style="margin-top:8px">Created ' + W.dt(comp.createdAt) + '. Pilots can already upload test files with the competition password.</p>' : '') + '</div>';
  }

  function todayCards(comp) {
    if (!comp.dates.includes(KH.TODAY)) return '';
    const cards = Q.classesOf(comp.id).map((cls) => {
      const cd = Q.classDayOn(cls.id, KH.TODAY);
      if (!cd) return '<a class="r2-card dim" href="#' + dayPath(cls, KH.TODAY) + '"><b>' + e(cls.name) + '</b> ' + e(Q.dayLabel(cls.id, KH.TODAY)) + '<div class="muted small">untouched</div></a>';
      const task = Q.task(cd);
      const c = live(cd) ? R.counts(cd) : null;
      return '<div class="r2-card"><div class="wf-row between"><a href="#' + base(cd) + '"><b>' + e(cls.name) + '</b> ' + e(Q.dayLabel(cls.id, cd.date)) + '</a>' + W.dayBadge(cd.status) + '</div>' +
        '<div class="small">' + (task ? 'Task ' + e(task.letter) + ' · ' + W.km(Q.taskDistance(task)) : '<a href="#' + links.classDayTasks(cd) + '">No task published</a>') + '</div>' +
        (c ? '<div class="wf-row small"><a href="#' + links.classDayResults(cd, 'check') + '">' + c.check + ' in check</a><a href="#' + links.classDayResults(cd, 'unknown') + '">' + c.unknown + ' unknown</a>' + (c.stale ? '<a href="#' + links.classDayResults(cd, 'stale') + '">' + c.stale + ' stale</a>' : '') + '</div>' : '') +
        (cd.reasons.length ? '<div class="small muted">Unpublished changes · <a href="#' + links.classDayPublish(cd) + '">Publish</a></div>' : '') + '</div>';
    });
    return '<div><h2>Today, ' + W.date(KH.TODAY, true) + '</h2><div class="r2-cards">' + cards.join('') + '</div></div>';
  }

  // Only work outside today. Today's work is in the today cards.
  function attention(comp) {
    const items = [];
    for (const cls of Q.classesOf(comp.id)) for (const cd of Q.classDaysOf(cls.id)) {
      if (cd.date === KH.TODAY || !live(cd)) continue;
      const c = Q.dayCounts(cd);
      const parts = [];
      if (Q.deadlinePassed(cd)) parts.push('<a href="#' + links.classDayPublish(cd) + '">complaint deadline passed, ready for final</a>');
      if (cd.reasons.length) parts.push('<a href="#' + links.classDayPublish(cd) + '">unpublished changes</a>');
      if (c.check) parts.push('<a href="#' + links.classDayResults(cd, 'check') + '">' + c.check + ' in check</a>');
      if (c.unknown) parts.push('<a href="#' + links.classDayResults(cd, 'unknown') + '">' + c.unknown + ' unknown</a>');
      if (c.stale) parts.push('<a href="#' + links.classDayResults(cd, 'stale') + '">' + c.stale + ' stale</a>');
      if (parts.length) items.push('<li><b>' + e(cls.name + ' · ' + Q.dayLabel(cls.id, cd.date)) + '</b> <span class="muted">' + W.date(cd.date) + '</span>: ' + parts.join(', ') + '</li>');
    }
    const unresolved = Q.unresolvedFiles(comp.id).length;
    if (unresolved) items.push('<li><a href="#' + C(comp) + '/files?state=unresolved">' + unresolved + ' unresolved IGC files</a></li>');
    return items.length ? '<div class="wf-box fill"><h3>Needs attention</h3><ul class="r2-attn">' + items.join('') + '</ul></div>' : '';
  }

  // ---------- pages ----------

  const P = {};
  P['/'] = (ctx) => page(ctx, 'My competitions', '<div class="wf-stack">' + W.incomingInvitations() +
    '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Competition</th><th>Dates</th><th>Your role</th><th>State</th></tr></thead><tbody>' +
    Q.myCompetitions().map((c) => '<tr class="link" data-href="' + C(c) + '"><td><b>' + e(c.name) + '</b><div class="muted small">' + e(c.location) + ' · ' + e(c.organiser) + '</div></td><td>' + W.date(c.dates[0], true) + ' – ' + W.date(c.dates[c.dates.length - 1], true) + '</td><td>' + e(Q.roleIn(c)) + '</td><td>' + (c.blocked ? '<span class="wf-badge solid">blocked</span> ' : '') + (c.lifecycle === 'archived' ? 'archived' : c.dates[0] > KH.TODAY ? 'upcoming' : c.dates[c.dates.length - 1] < KH.TODAY ? 'finished' : 'running') + '</td></tr>').join('') +
    '</tbody></table></div></div>', '<a class="wf-btn primary" href="#/new">Create competition</a>');
  P['/new'] = (ctx) => page(ctx, 'Create competition', '<div class="wf-box" style="max-width:880px">' + W.createCompetitionForm() + '</div>');
  P['/account'] = (ctx) => page(ctx, 'Account and invitations', W.incomingInvitations() + W.account());
  P['/staff/users'] = (ctx) => (Q.me().staff ? page(ctx, 'Users', '<p class="muted">The invitation tree. Each user records who invited them. Nothing acts on a whole branch automatically.</p>' + W.staffUsers()) : empty(ctx, 'No access', 'Staff only. Switch the role in the prototype bar.'));
  P['/staff/competitions'] = (ctx) => (Q.me().staff ? page(ctx, 'All competitions', W.staffCompetitions()) : empty(ctx, 'No access', 'Staff only. Switch the role in the prototype bar.'));

  P['/c/:comp'] = (ctx) => {
    const comp = ctx.comp;
    if (comp.lifecycle === 'archived') {
      return page(ctx, e(comp.name) + ' <span class="wf-badge">archived</span>', '<div class="wf-stack"><div class="wf-note">Archived ' + W.dt(comp.archivedAt) + '. The scoring work was removed. Only the published results remain, and they can no longer change.</div>' +
        '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Class</th><th>Published days</th><th>Competitors</th><th>Last status</th></tr></thead><tbody>' + comp.archive.classes.map((c) => '<tr><td>' + e(c.name) + '</td><td>' + c.days + '</td><td>' + c.competitors + '</td><td>' + W.dayBadge(c.lastStatus) + '</td></tr>').join('') + '</tbody></table></div>' +
        '<p><a href="#" onclick="KH.toast(\'Public pages are out of scope for this prototype\');return false">Open public results ↗</a></p></div>');
    }
    return page(ctx, e(comp.name), '<div class="wf-stack">' + setupCard(comp) + todayCards(comp) + attention(comp) + '<div><h2>Class days</h2>' + R.matrix(comp) + '</div></div>');
  };

  P['/c/:comp/days/:date'] = (ctx) => {
    const comp = ctx.comp;
    const date = ctx.params.date;
    if (!comp.dates.includes(date)) return empty(ctx, 'Not a competition date', W.date(date, true) + ' is not a competition date.');
    const classes = Q.classesOf(comp.id);
    const cols = classes.map((cls) => {
      const cd = Q.classDayOn(cls.id, date);
      const head = '<div class="wf-row between"><a href="#' + dayPath(cls, date) + '"><b>' + e(cls.name) + '</b> · ' + e(Q.dayLabel(cls.id, date)) + '</a>' + (cd ? W.dayBadge(cd.status) : '<span class="wf-badge none">untouched</span>') + '</div>';
      if (!cd) return '<div class="r2-col">' + head + '<p class="muted small">Nobody has touched this class day.</p><a class="wf-btn small" href="#' + dayPath(cls, date) + '">Open class day</a></div>';
      const task = Q.task(cd);
      const c = live(cd) ? R.counts(cd) : null;
      return '<div class="r2-col">' + head + '<div class="wf-kv small">' +
        '<span>Task</span><span>' + (task ? '<a href="#' + links.candidate(task) + '">' + e(task.letter) + '</a> ' + e(Q.taskLine(task)) + ', ' + W.km(Q.taskDistance(task)) : '<a href="#' + links.classDayTasks(cd) + '">none published</a>') + '</span>' +
        (c ? '<span>Results</span><span>' + c.ok + ' OK · <a href="#' + links.classDayResults(cd, 'check') + '">' + c.check + ' in check</a> · <a href="#' + links.classDayResults(cd, 'unknown') + '">' + c.unknown + ' unknown</a>' + (c.stale ? ' · <a href="#' + links.classDayResults(cd, 'stale') + '">' + c.stale + ' stale</a>' : '') + (c.manual ? ' · ' + c.manual + ' manual' : '') + '</span>' : '') +
        '<span>Published</span><span>' + (cd.published ? W.dayBadge(cd.published.status) + ' ' + W.dt(cd.published.at) : 'never') + '</span>' +
        '<span>Unpublished</span><span>' + (cd.reasons.length ? '<a href="#' + links.classDayPublish(cd) + '">' + e(cd.reasons.join(', ')) + '</a>' : 'nothing') + '</span></div>' +
        (task ? W.taskMap(task.points, { h: 150 }) : '') + '<a class="wf-btn small" href="#' + base(cd) + '">Open class day</a></div>';
    });
    const i = comp.dates.indexOf(date);
    const nav = (i > 0 ? '<a class="wf-btn small" href="#' + links.date(comp, comp.dates[i - 1]) + '">← ' + W.date(comp.dates[i - 1]) + '</a>' : '') + (i < comp.dates.length - 1 ? '<a class="wf-btn small" href="#' + links.date(comp, comp.dates[i + 1]) + '">' + W.date(comp.dates[i + 1]) + ' →</a>' : '');
    return page(ctx, W.date(date, true) + (date === KH.TODAY ? ' <span class="muted" style="font-weight:400">today</span>' : ''), classes.length ? '<div class="r2-cols">' + cols.join('') + '</div>' : '<div class="wf-empty">No classes yet</div>', nav);
  };

  // ---------- standings ----------

  function defaultHeader(cd, cls, date) {
    return e(Q.dayLabel(cls.id, date).replace('Practice day ', 'P').replace('Day ', 'D'));
  }
  function defaultCell(x) {
    return x.status === 'unknown' ? '?' : x.status === 'did not fly' ? 'DNF' : x.placeholder ? '–' : x.points ?? '';
  }
  P['/c/:comp/classes/:class'] = (ctx) => {
    const comp = ctx.comp;
    const cls = ctx.cls;
    if (!cls) return empty(ctx, 'Not found', 'No such class');
    const days = comp.dates.map((d) => {
      const cd = Q.classDayOn(cls.id, d);
      const rows = live(cd) && Q.resultsOf(cd).length ? KH.score(cd).rows : null;
      return { d, cd, byComp: rows ? new Map(rows.map((x) => [x.competitor.id, x])) : null };
    });
    const rows = Q.competitorsOf(comp.id, cls.id).map((c) => {
      const cells = days.map((day) => day.byComp && day.byComp.get(c.id));
      return { c, cells, total: cells.reduce((a, x, i) => a + (x && !days[i].cd.practice && x.points ? x.points : 0), 0) };
    }).sort((a, b) => b.total - a.total || a.c.cid.localeCompare(b.c.cid));
    const header = V.standingsHeader || defaultHeader;
    const cell = V.standingsCell || defaultCell;
    const head = days.map(({ d, cd }) => '<th class="' + (cd && cd.status === 'cancelled' ? 'cx' : '') + '" title="' + e(Q.dayLabel(cls.id, d) + ' · ' + W.date(d) + ' · ' + (cd ? cd.status : 'untouched')) + '"><a href="#' + dayPath(cls, d) + '">' + header(cd, cls, d) + '</a></th>').join('');
    const body = rows.map((row, i) => '<tr><th class="rh"><span class="muted">' + (row.c.hc ? 'HC' : i + 1) + '</span> <a href="#' + links.competitor(row.c) + '"><b>' + e(row.c.cid) + '</b></a> <span class="small r2-name">' + e(Q.crewName(row.c)) + '</span></th>' +
      row.cells.map((x, j) => {
        const cd = days[j].cd;
        if (!x) return '<td class="na' + (cd && cd.status === 'cancelled' ? ' cx' : '') + '">' + (cd && cd.status === 'cancelled' ? '' : '·') + '</td>';
        return '<td class="' + (x.result.checkReasons.length ? 'chk' : '') + '"><a href="#' + links.result(x.result) + '" title="' + e(x.competitor.cid + ' · ' + Q.dayLabel(cls.id, cd.date) + ' · ' + x.result.status) + '">' + cell(x, cd) + '</a></td>';
      }).join('') + '<td class="tot">' + row.total + '</td></tr>').join('');
    return page(ctx, e(cls.name) + ' standings <span class="muted small" style="font-weight:400">' + e(cls.edition) + (cls.handicapScale ? ', handicapped' : '') + '</span>',
      '<div class="wf-stack"><p class="muted small">Working scores of every day, practice days not counted in the total. A cell opens the result.</p><div class="wf-table-wrap"><table class="r2-st"><thead><tr><th class="rh">' + rows.length + ' competitors</th>' + head + '<th class="tot">Total</th></tr></thead><tbody>' +
      (rows.length ? body : '<tr><td colspan="' + (days.length + 2) + '" class="muted">No competitors</td></tr>') + '</tbody></table></div>' + (V.standingsLegend || '') + '</div>',
      '<a class="wf-btn small" href="#' + links.cls(cls) + '">Class settings</a><button class="wf-btn small" data-act="printOverall" data-cls="' + cls.id + '">Published overall sheet</button>');
  };

  // ---------- setup ----------

  P['/c/:comp/details'] = (ctx) => page(ctx, 'Details and upload password', '<div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"><div class="wf-box">' + W.competitionDetails(ctx.comp) + '</div><div class="wf-stack"><div class="wf-box">' + W.uploadPassword(ctx.comp) + '</div><div class="wf-box fill small"><b>Organiser terms</b><br>' + e(ctx.comp.terms.version) + ' accepted by ' + e(Q.user(ctx.comp.terms.userId).name) + ' on ' + W.dt(ctx.comp.terms.at) + ' for ' + e(ctx.comp.terms.organiser) + '</div></div></div>');
  P['/c/:comp/dates'] = (ctx) => page(ctx, 'Dates and class days', '<div class="wf-stack"><div class="wf-box"><h3>Competition dates</h3>' + W.datesEditor(ctx.comp) + '</div><div><h3>Class days</h3>' + R.matrix(ctx.comp) + '</div></div>');
  P['/c/:comp/turnpoints'] = (ctx) => page(ctx, 'Turnpoint file', W.turnpoints(ctx.comp));
  P['/c/:comp/airspace'] = (ctx) => page(ctx, 'Airspace file', W.airspace(ctx.comp));
  P['/c/:comp/classes'] = (ctx) => {
    const classes = Q.classesOf(ctx.comp.id, true);
    return page(ctx, 'Classes', '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Class</th><th>Rule set edition</th><th>Handicapped</th><th class="num">Competitors</th><th></th></tr></thead><tbody>' +
      (classes.length ? classes.map((c) => '<tr class="' + (c.deleted ? 'dim' : '') + '"><td><b>' + e(c.name) + '</b>' + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : '') + '</td><td>' + e(c.edition) + '</td><td>' + (c.handicapScale ? 'scale ' + c.handicapScale + ', ' + e(c.handicapList) : 'no') + '</td><td class="num">' + Q.competitorsOf(ctx.comp.id, c.id).length + '</td><td class="right nowrap">' +
        (c.deleted ? '<button class="wf-btn small" data-act="restoreClass" data-cls="' + c.id + '">Restore</button>' : '<a class="wf-btn small" href="#' + links.standings(c) + '">Standings</a> <a class="wf-btn small" href="#' + links.cls(c) + '">Settings</a>') + '</td></tr>').join('') : '<tr><td colspan="5" class="muted">No classes yet</td></tr>') +
      '</tbody></table></div>', '<a class="wf-btn primary" href="#' + C(ctx.comp) + '/classes/new">Add class</a>');
  };
  P['/c/:comp/classes/new'] = (ctx) => page(ctx, 'Add class', '<div class="wf-box">' + W.classForm(ctx.comp) + '</div>');
  P['/c/:comp/classes/:class/settings'] = (ctx) => (ctx.cls ? page(ctx, e(ctx.cls.name) + ' settings', '<div class="wf-box">' + W.classForm(ctx.comp, ctx.cls) + '</div>', '<a class="wf-btn small" href="#' + links.standings(ctx.cls) + '">Standings</a>') : empty(ctx, 'Not found', 'No such class'));
  P['/c/:comp/competitors'] = (ctx) => {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    const b = C(ctx.comp) + '/competitors';
    return page(ctx, 'Competitors', '<div class="wf-stack"><div class="wf-row"><a class="wf-btn small' + (!cls ? ' primary' : '') + '" href="#' + b + '">All</a>' + Q.classesOf(ctx.comp.id).map((c) => '<a class="wf-btn small' + (cls === c ? ' primary' : '') + '" href="#' + b + '?class=' + c.slug + '">' + e(c.name) + ' ' + Q.competitorsOf(ctx.comp.id, c.id).length + '</a>').join('') + '</div><div class="wf-table-wrap">' + W.competitorsTable(ctx.comp, cls && cls.id) + '</div></div>',
      '<a class="wf-btn primary" href="#' + b + '/new' + (cls ? '?class=' + cls.slug : '') + '">Add competitor</a>');
  };
  P['/c/:comp/competitors/new'] = (ctx) => {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    return page(ctx, 'Add competitor', '<div class="wf-box">' + W.competitorForm(ctx.comp, null, cls && cls.id) + '</div>');
  };
  P['/c/:comp/competitors/:competitor'] = (ctx) => {
    const c = ctx.competitor;
    if (!c) return empty(ctx, 'Not found', 'No such competitor');
    const loggers = Q.loggersOf(ctx.comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
    const days = Q.classDaysOf(c.classId).filter(live);
    return page(ctx, e(c.cid) + ' · ' + e(Q.crewName(c)) + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : ''), '<div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))"><div class="wf-box">' + W.competitorForm(ctx.comp, c) + '</div><div class="wf-stack">' +
      '<div class="wf-box"><h3>Loggers</h3>' + (loggers.length ? '<table class="wf-table"><tbody>' + loggers.map((l) => '<tr><td><a href="#' + links.logger(l) + '">' + e(Q.loggerLabel(l)) + '</a></td><td>' + l.links.filter((k) => k.competitorId === c.id).map((k) => k.role + (k.from ? ' from ' + W.date(k.from) : '')).join(', ') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted small">No loggers linked</p>') + '<a class="wf-btn small" href="#' + C(ctx.comp) + '/loggers/new">Add logger</a></div>' +
      '<div class="wf-box"><h3>Results</h3><table class="wf-table"><tbody>' + days.map((cd) => { const r = Q.resultFor(cd.id, c.id); return r ? '<tr class="link" data-href="' + links.result(r) + '"><td>' + e(Q.dayLabel(cd.classId, cd.date)) + '</td><td>' + W.resultStatus(r) + '</td><td>' + W.reviewBadge(r) + '</td><td>' + (r.penalty ? '−' + r.penalty.points : '') + '</td></tr>' : ''; }).join('') + '</tbody></table></div>' +
      '<div class="wf-box">' + W.dsqPanel(c) + '</div></div></div>');
  };
  P['/c/:comp/loggers'] = (ctx) => page(ctx, 'Loggers', '<div class="wf-table-wrap">' + W.loggersTable(ctx.comp) + '</div>', '<a class="wf-btn primary" href="#' + C(ctx.comp) + '/loggers/new">Add logger</a>');
  P['/c/:comp/loggers/new'] = (ctx) => page(ctx, 'Add logger', '<div class="wf-box">' + W.loggerForm(ctx.comp) + '</div>');
  P['/c/:comp/loggers/:logger'] = (ctx) => {
    const l = ctx.logger;
    if (!l) return empty(ctx, 'Not found', 'No such logger');
    const rows = S.files.filter((f) => f.loggerId === l.id).map((f) => ({ f, res: Q.resolve(f) }));
    return page(ctx, 'Logger ' + e(Q.loggerLabel(l)), '<div class="wf-stack"><div class="wf-box"><h3>Dated links</h3>' + W.loggerLinks(l) + '</div><div class="wf-box"><h3>Thresholds</h3>' + W.loggerForm(ctx.comp, l) + '</div><div class="wf-box"><h3>Files</h3><div class="wf-table-wrap">' + W.filesTable(rows) + '</div></div></div>');
  };
  P['/c/:comp/files'] = (ctx) => {
    const b = C(ctx.comp) + '/files';
    const { rows, hiddenUnresolved } = W.filterFiles(ctx.comp, ctx.query);
    return page(ctx, 'IGC files', '<div class="wf-stack">' + W.fileFilters(ctx.comp, ctx.query, b) +
      (hiddenUnresolved ? '<div class="wf-note warn">' + hiddenUnresolved + ' unresolved files are hidden by this filter. <a href="#' + b + '?state=unresolved">Show unresolved</a></div>' : '') +
      '<div class="muted small">' + rows.length + ' files</div><div class="wf-table-wrap">' + W.filesTable(rows.slice(0, 200)) + '</div>' + (rows.length > 200 ? '<p class="muted small">First 200 shown</p>' : '') +
      '<details><summary>Upload a file as scorer</summary><div class="wf-box" style="margin-top:8px">' + W.scorerUploadForm(ctx.comp) + '</div></details></div>');
  };
  P['/c/:comp/files/:file'] = (ctx) => {
    const f = ctx.file;
    if (!f) return empty(ctx, 'Not found', 'No such file');
    const res = Q.resolve(f);
    const task = res.ok ? Q.task(res.classDay) : null;
    return page(ctx, e(f.name), '<div class="wf-stack"><div class="wf-cols"><div class="wf-box">' + W.fileMeta(f) + '</div><div class="wf-stack">' + (task ? W.taskMap(task.points, { track: f.seed, finished: f.analysis.output && f.analysis.output.finished }) : '<div class="wf-map" style="height:200px"><span class="tag">Map: track only</span></div>') + '<div class="wf-box">' + W.outputSummary(f) + '</div></div></div>' +
      (f.analysis.candidates && f.analysis.candidates.length ? '<div class="wf-box"><h3>Start candidates</h3><div class="wf-table-wrap">' + W.startCandidates(f) + '</div></div>' : '') +
      '<div class="wf-box wf-table-wrap">' + W.analysisLog(f) + '</div>' + (res.ok ? '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(f) + '</div>' : '') + '</div>');
  };
  P['/c/:comp/members'] = (ctx) => page(ctx, 'Members and invitations', W.members(ctx.comp));
  P['/c/:comp/lifecycle'] = (ctx) => page(ctx, ctx.comp.lifecycle === 'archived' ? 'Delete' : 'Archive or delete', W.lifecycle(ctx.comp));

  // ---------- result review ----------

  function neighbours(ctx) {
    const rows = KH.score(ctx.cd).rows;
    const check = rows.filter((x) => x.result.checkReasons.length || x.result === ctx.result);
    const i = check.findIndex((x) => x.result === ctx.result);
    return { prev: check[i - 1], next: check[i + 1], pos: i + 1, total: check.length };
  }
  function review(ctx) {
    if (!ctx.result) return '<div class="wf-empty">No such competitor in this class</div>';
    const r = ctx.result;
    const comp = ctx.competitor;
    const scored = r.scoredFileId ? Q.file(r.scoredFileId) : null;
    const task = Q.task(ctx.cd);
    const n = neighbours(ctx);
    const nav = '<div class="wf-row">' + (n.prev ? '<a class="wf-btn small" href="#' + links.result(n.prev.result) + '">← ' + e(n.prev.competitor.cid) + '</a>' : '') + '<span class="muted small">' + (r.checkReasons.length ? n.pos + ' of ' + n.total + ' in check' : n.total ? n.total + ' in check' : 'none in check') + '</span>' + (n.next ? '<a class="wf-btn small" href="#' + links.result(n.next.result) + '">' + e(n.next.competitor.cid) + ' →</a>' : '') + '</div>';
    return '<div class="wf-stack"><div class="wf-row between"><div><h2 style="margin:0">' + e(comp.cid) + ' · ' + e(Q.crewName(comp)) + '</h2><div class="muted small">' + e(comp.gliderType) + (comp.handicap ? ', handicap ' + comp.handicap : '') + (comp.hc ? ', hors concours' : '') + ' · <a href="#' + links.competitor(comp) + '">competitor</a></div></div>' + nav + '</div>' +
      W.checkReasons(r) + W.resultStatusControl(r) +
      '<div class="wf-box"><h3>Files</h3><div class="wf-table-wrap">' + W.resultFiles(r) + '</div></div>' +
      (r.status === 'manual result' ? '<div class="wf-box"><h3>Manual result</h3>' + W.manualForm(r) + '</div>' : '') +
      (scored ? '<div class="wf-cols"><div class="wf-box"><h3>Scored file: ' + e(scored.name) + ' ' + W.staleBadge(scored) + '</h3>' + W.outputSummary(scored) + '</div>' + (task ? W.taskMap(task.points, { track: scored.seed, finished: scored.analysis.output && scored.analysis.output.finished, h: 200 }) : '') + '</div>' +
        '<div class="wf-box"><h3>Start candidates</h3><div class="wf-table-wrap">' + W.startCandidates(scored) + '</div></div>' +
        '<div class="wf-box wf-table-wrap">' + W.analysisLog(scored) + '</div>' +
        '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(scored) + '</div>' : '') +
      '<div class="wf-cols"><div class="wf-box"><h3>Penalty</h3>' + W.penaltyForm(r) + '</div><div class="wf-box"><h3>Remarks and handicap</h3>' + W.resultRemarks(r) + '</div></div></div>';
  }

  // ---------- class day routes ----------

  function classDay(ctx) {
    const key = ctx.route.dayKey;
    if (!ctx.cls) return empty(ctx, 'Not found', 'No such class');
    if (!ctx.comp.dates.includes(ctx.params.date)) return empty(ctx, 'Not a competition date', W.date(ctx.params.date, true) + ' is not a competition date.');
    if (!ctx.cd) return V.frame(ctx, 'untouched', W.untouchedDay(ctx.cls, ctx.params.date));
    if (key === 'review') return V.frame(ctx, 'review', review(ctx));
    if (ctx.params.cand && (!ctx.cand || ctx.cand.classDayId !== ctx.cd.id)) return V.frame(ctx, key, '<div class="wf-empty">No such task candidate</div>');
    return V.frame(ctx, key, V.sections[key](ctx));
  }

  // ---------- routes and guard ----------

  const EX = '/c/oberrhein-2026';
  const EXD = EX + '/days/2026-07-28/club';
  const shared = [
    ['/', 'My competitions', 'Account', '/'],
    ['/new', 'Create competition', 'Account', '/new'],
    ['/account', 'Account and invitations', 'Account', '/account'],
    ['/staff/users', 'Users and invitation tree (staff)', 'Staff', '/staff/users'],
    ['/staff/competitions', 'All competitions (staff)', 'Staff', '/staff/competitions'],
    ['/c/:comp', 'Overview', 'Competition', EX],
    ['/c/:comp/details', 'Details and upload password', 'Setup', EX + '/details'],
    ['/c/:comp/dates', 'Dates and class days', 'Setup', EX + '/dates'],
    ['/c/:comp/turnpoints', 'Turnpoint file', 'Setup', EX + '/turnpoints'],
    ['/c/:comp/airspace', 'Airspace file', 'Setup', EX + '/airspace'],
    ['/c/:comp/classes', 'Classes', 'Setup', EX + '/classes'],
    ['/c/:comp/classes/new', 'Add class', 'Setup', EX + '/classes/new'],
    ['/c/:comp/classes/:class', 'Overall standings of a class', 'Competition', EX + '/classes/standard'],
    ['/c/:comp/classes/:class/settings', 'Class settings', 'Setup', EX + '/classes/club/settings'],
    ['/c/:comp/competitors', 'Competitors', 'Setup', EX + '/competitors'],
    ['/c/:comp/competitors/new', 'Add competitor', 'Setup', EX + '/competitors/new'],
    ['/c/:comp/competitors/:competitor', 'Competitor', 'Setup', EX + '/competitors/p1'],
    ['/c/:comp/loggers', 'Loggers', 'Setup', EX + '/loggers'],
    ['/c/:comp/loggers/new', 'Add logger', 'Setup', EX + '/loggers/new'],
    ['/c/:comp/loggers/:logger', 'Logger and links', 'Setup', EX + '/loggers/lx1'],
    ['/c/:comp/files', 'IGC files', 'Competition', EX + '/files'],
    ['/c/:comp/files/:file', 'IGC file', 'Competition', null],
    ['/c/:comp/members', 'Members and invitations', 'Competition', EX + '/members'],
    ['/c/:comp/lifecycle', 'Archive or delete', 'Competition', EX + '/lifecycle'],
    ['/c/:comp/days/:date', 'Date page: classes side by side', 'Days', EX + '/days/2026-07-28'],
  ].map(([path, title, group, example]) => ({ path, title, group, example }));

  function guard(ctx) {
    if (!ctx.comp) return empty(ctx, 'Not found', 'This competition does not exist.');
    if (!Q.roleIn(ctx.comp)) {
      const ci = S.competitionInvitations.find((i) => i.competitionId === ctx.comp.id && i.inviteeId === Q.me().id);
      return page({ ...ctx, comp: null }, e(ctx.comp.name), '<div class="wf-empty">You are not a member of this competition.' + (ci ? '<p><button class="wf-btn primary" data-act="acceptCI" data-id="' + ci.id + '">Accept invitation as ' + ci.role + '</button></p>' : '') + '</div>');
    }
    if (ctx.comp.blocked && !Q.me().staff) return empty({ ...ctx, comp: null }, 'Not found', 'This competition does not exist.');
    if (ctx.comp.lifecycle === 'archived' && !['/c/:comp', '/c/:comp/members', '/c/:comp/lifecycle'].includes(ctx.route.path)) return empty(ctx, e(ctx.comp.name), 'Archived. The scoring work was removed. <a href="#' + C(ctx.comp) + '">Open the archive summary</a>');
    return null;
  }

  R.mount = (variant) => {
    V = variant;
    const dayRoutes = variant.dayRoutes.map((r) => ({ path: '/c/:comp/days/:date/:class' + r.sub, title: r.title, group: 'Class day', example: r.noExample ? null : EXD + r.sub.replace('/:cand', ''), dayKey: r.key }));
    dayRoutes.push({ path: '/c/:comp/days/:date/:class/results/:cid', title: 'Result review (full page)', group: 'Class day', example: null, dayKey: 'review' });
    const routes = shared.concat(dayRoutes);
    KH.mount({
      id: variant.id,
      routes,
      links,
      handlers: variant.handlers,
      render(ctx) {
        if (ctx.params.comp) {
          const g = guard(ctx);
          if (g) return g;
        }
        return ctx.route.dayKey ? classDay(ctx) : P[ctx.route.path](ctx);
      },
      notFound: (ctx) => empty(ctx, 'Not found', 'No page at ' + e(ctx.path)),
      afterReview() {
        const ctx = KH.current();
        if (!ctx.params.cid || !ctx.cd) return;
        const n = neighbours(ctx);
        if (n.next) KH.go(links.result(n.next.result));
        else KH.go(links.classDayResults(ctx.cd, 'check'));
      },
    });
  };
})();
