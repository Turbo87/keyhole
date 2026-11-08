// PROTOTYPE: round 3 shell shared by prototypes 3A to 3F.
//
// It implements every decision from rounds 1 and 2 (README.md, "Round 1 decisions" and "Round 2 decisions"): the
// sidebar without a top bar, the overview page with the class day matrix, the date page, the overall standings per
// class, the class day with the tabs Overview, Task, Results and Publish, the setup pages, the IGC files, members and
// archive pages, the account and staff pages, and the guards. A variant decides only the layout of the result review
// page (README.md, "Open questions for round 3").
//
// Load order in a variant's HTML: shared/data.js, shared/proto.js, shared/widgets.js, shared/round3.js, then the
// variant script. Link shared/wire.css, shared/round3.css and the mdi icon font
// (https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css). The variant script calls
// KH.r3.mount(variant) once.
//
// variant = {
//   id: '3a',                 // matches the KH.DIRECTIONS entry in shared/proto.js
//   review(ctx),              // returns the HTML of the result review page below the class day title and tabs.
//                             // Route: /c/:comp/days/:date/:class/results/:cid. ctx.cd, ctx.cls, ctx.competitor and
//                             // ctx.result are set (the shell shows "not found" otherwise).
//   reviewChrome: 'tabs',     // optional. 'tabs' (default) puts the class day title and tabs above the review.
//                             // 'none' renders only the breadcrumbs, so the review gets the whole content area.
//   handlers: { name(ds, el, ev) {...} },   // optional extra data-act / data-submit / data-change handlers
// }
//
// Review helpers (const R = KH.r3):
//   R.reviewHeader(ctx)       CID, crew, glider, handicap, result status and a link to the competitor
//   R.reviewNav(ctx)          previous / next through the results to do of this class day, "2 of 17 to do"
//   R.reviewButton(r)         "Reviewed, clear N" (clears the check reasons, then the shell moves to the next result
//                             to do), or an OK badge when the result has no check reasons
//   R.neighbours(ctx)         { prev, next, pos, total } over the results to do, as KH.score() rows
//   R.isTodo(r) / R.todoReasons(r)   whether a result still needs work: in check, unknown, stale or manual
//   R.scoredFile(r)           the scored IGC file or null
//   R.rv.reasons(r)           the check reasons as a list, without the button
//   R.rv.status(r)            result status control (unknown, did not fly, scored file, manual result)
//   R.rv.files(r)             files that resolve to the result, with "Score this file"
//   R.rv.manual(r)            manual result form ('' unless the status is manual result)
//   R.rv.penalty(r)           penalty form
//   R.rv.remarks(r)           handicap override and remarks form
//   R.rv.summary(f)           start, finish, distance, time and speed of a file
//   R.rv.map(ctx, f, opts)    task map with the file's track. opts.h sets the height in px
//   R.rv.candidates(f)        start candidates with "Use" and a free start time
//   R.rv.log(f)               analysis log with rule references and debug toggle
//   R.rv.overrides(f)         flight end, finish time and AAT pin overrides
//   Every block is plain HTML with its own forms and actions. Wrap blocks in <div class="wf-box"> as needed. Wide
//   tables (candidates, log, files) sit best in <div class="wf-table-wrap">.
//
// Other helpers: R.page(ctx, title, body, actions), R.base(cd), R.dayPath(cls, date), R.live(cd), R.links (the links
// map the shared widgets use, plus standings, date, classDayResults(cd, show), classDayPublish, classDaySettings),
// R.statusIcon(status), R.statusLabel(status), R.todoIcon(title), R.dayLine(cd), R.counts(cd).
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const A = KH.act;
  const S = KH.state;
  const e = KH.esc;
  const R = (KH.r3 = {});
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
    classDayTasks: (cd) => base(cd) + '/task',
    classDaySettings: (cd) => base(cd) + '/task/settings',
    classDayResults: (cd, show) => base(cd) + '/results' + (show ? '?show=' + show : ''),
    classDayPublish: (cd) => base(cd) + '/publish',
    candidate: (t) => base(Q.classDay(t.classDayId)) + '/task/' + t.id,
    result: (r) => base(Q.classDay(r.classDayId)) + '/results/' + Q.competitor(r.competitorId).cid,
    file: (f) => C(Q.competition(Q.logger(f.loggerId).competitionId)) + '/files/' + f.id,
    competitor: (c) => C(Q.competition(c.competitionId)) + '/competitors/' + c.id,
    competitors: (comp) => C(comp) + '/competitors',
    logger: (l) => C(Q.competition(l.competitionId)) + '/loggers/' + l.id,
    files: (comp) => C(comp) + '/files',
  };
  R.links = links;

  // ---------- status and work to do ----------

  const LABEL = { unplanned: 'Unplanned', 'task published': 'Task published', preliminary: 'Preliminary', unofficial: 'Unofficial', final: 'Final', cancelled: 'Cancelled' };
  const ICON = { unplanned: 'calendar-blank-outline', 'task published': 'flag-outline', preliminary: 'clock-outline', unofficial: 'timer-sand', final: 'check-decagram', cancelled: 'cancel' };
  R.statusLabel = (status) => LABEL[status] || 'Untouched';
  R.statusIcon = (status) => '<i class="mdi mdi-' + (ICON[status] || 'calendar-blank-outline') + ' r3-si' + (status ? '' : ' untouched') + '" title="' + e(R.statusLabel(status)) + '"></i>';
  R.todoIcon = (title) => '<i class="mdi mdi-alert-circle-outline r3-todo" title="' + e(title || 'Work to do') + '"></i>';

  R.scoredFile = (r) => (r.scoredFileId ? Q.file(r.scoredFileId) : null);
  // A manual result stands in until the IGC file arrives, so it counts as work to do.
  R.todoReasons = (r) => {
    const out = [];
    if (r.checkReasons.length) out.push('in check');
    if (r.status === 'unknown') out.push('unknown');
    if (Q.filesOfResult(r).some((f) => f.analysis.stale.length)) out.push('stale');
    if (r.status === 'manual result') out.push('manual');
    return out;
  };
  R.isTodo = (r) => R.todoReasons(r).length > 0;
  R.counts = (cd) => {
    const results = Q.resultsOf(cd);
    const todo = results.filter(R.isTodo).length;
    return { ...Q.dayCounts(cd), manual: results.filter((r) => r.status === 'manual result').length, todo, done: results.length - todo, total: results.length, data: results.some((r) => r.status !== 'unknown' || Q.filesOfResult(r).length) };
  };

  function taskLine(task) {
    const d = Q.taskDistance(task);
    return 'Task ' + e(task.letter) + ' · ' + (task.type === 'aat' ? 'AAT ' + Math.round(d * 0.74) + '–' + Math.round(d * 1.31) + ' km' : Math.round(d) + ' km');
  }
  R.taskLine = taskLine;

  // The second line of a class day in the matrix, the today cards and the date page, in priority order.
  R.dayLine = (cd) => {
    if (!live(cd)) return '';
    const c = R.counts(cd);
    if (c.data && c.todo) return c.done + '/' + c.total + ' done';
    if (cd.reasons.length) return 'Changes not published';
    if (Q.deadlinePassed(cd)) return 'Deadline passed';
    const task = Q.task(cd);
    if (task && !c.data) return taskLine(task);
    return '';
  };

  // ---------- shell ----------

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
    const icon = (cd) => R.statusIcon(cd ? cd.status : null);
    for (const date of comp.dates) {
      const labels = [...new Set(classes.map((c) => Q.dayLabel(c.id, date)))];
      const open = date === openDate;
      const label = W.date(date) + (date === KH.TODAY ? ' · today' : '') + (labels.length === 1 ? ' <span class="muted small">' + e(labels[0]) + '</span>' : '');
      html += navItem(links.date(comp, date), label, ctx, open ? '' : classes.map((c) => icon(Q.classDayOn(c.id, date))).join(''), 0, { within: ctx.params.date === date });
      if (!open) continue;
      for (const cls of classes) {
        const cd = Q.classDayOn(cls.id, date);
        const todo = live(cd) && R.counts(cd).todo;
        html += navItem(dayPath(cls, date), e(cls.name) + (labels.length > 1 ? ' <span class="muted small">' + e(Q.dayLabel(cls.id, date)) + '</span>' : ''), ctx, (todo ? R.todoIcon('Results to do') : '') + icon(cd), 1, { within: ctx.cls === cls && ctx.params.date === date });
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
    if (d && ctx.cd && ctx.params.cid) out.push([links.classDayResults(ctx.cd), 'Results']);
    if (d && ctx.cd && (ctx.cand || ctx.route.dayKey === 'settings')) out.push([links.classDayTasks(ctx.cd), 'Task']);
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

  // ---------- overview, matrix and date page ----------

  // Dates as rows, classes as columns. Headers open the standings, cells open the class day.
  R.matrix = (comp) => {
    const classes = Q.classesOf(comp.id);
    if (!classes.length) return '<div class="wf-empty">No classes yet. <a href="#' + C(comp) + '/classes/new">Add a class</a> to fill the matrix.</div>';
    return '<div class="wf-table-wrap"><table class="r2-mx r3-mx"><thead><tr><th class="rh">Date</th>' + classes.map((cls) => '<th><a href="#' + links.standings(cls) + '">' + e(cls.name) + '</a> <span class="muted small">' + Q.competitorsOf(comp.id, cls.id).length + '</span></th>').join('') + '</tr></thead><tbody>' +
      comp.dates.map((d) => '<tr class="' + (d === KH.TODAY ? 'today' : '') + '"><th class="rh"><a href="#' + links.date(comp, d) + '">' + W.date(d) + '</a>' + (d === KH.TODAY ? ' · today' : '') + '</th>' + classes.map((cls) => matrixCell(cls, d)).join('') + '</tr>').join('') + '</tbody></table></div>' +
      '<div class="r2-legend">Hatched: untouched. Column heads open the standings.</div>';
  };
  function matrixCell(cls, date) {
    const cd = Q.classDayOn(cls.id, date);
    const label = e(Q.dayLabel(cls.id, date));
    if (!cd) return '<td class="untouched"><a href="#' + dayPath(cls, date) + '"><div class="l1"><span>' + label + '</span></div><div class="l2">untouched</div></a></td>';
    const line = R.dayLine(cd);
    return '<td class="' + cd.status.replace(' ', '-') + '"><a href="#' + base(cd) + '"><div class="l1"><b>' + e(R.statusLabel(cd.status)) + '</b><span class="muted">' + label + '</span></div>' +
      '<div class="l2">' + (line || '&nbsp;') + '</div></a></td>';
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
      const line = R.dayLine(cd);
      return '<a class="r2-card" href="#' + base(cd) + '"><div class="wf-row between"><span><b>' + e(cls.name) + '</b> ' + e(Q.dayLabel(cls.id, cd.date)) + '</span><span class="r3-status">' + R.statusIcon(cd.status) + ' ' + e(R.statusLabel(cd.status)) + '</span></div>' +
        '<div class="small">' + (task ? taskLine(task) : 'No task published') + '</div>' + (line && !line.startsWith('Task ') ? '<div class="small">' + (R.counts(cd).todo ? R.todoIcon() + ' ' : '') + e(line) + '</div>' : '') + '</a>';
    });
    return '<div><h2>Today, ' + W.date(KH.TODAY, true) + '</h2><div class="r2-cards">' + cards.join('') + '</div></div>';
  }

  // Only work outside today. Today's work is in the today cards.
  function attention(comp) {
    const items = [];
    for (const cls of Q.classesOf(comp.id)) for (const cd of Q.classDaysOf(cls.id)) {
      if (cd.date === KH.TODAY || !live(cd)) continue;
      const c = R.counts(cd);
      const parts = [];
      if (Q.deadlinePassed(cd)) parts.push('<a href="#' + links.classDayPublish(cd) + '">complaint deadline passed, ready for final</a>');
      if (cd.reasons.length) parts.push('<a href="#' + links.classDayPublish(cd) + '">changes not published</a>');
      if (c.todo) parts.push('<a href="#' + links.classDayResults(cd) + '">' + c.done + '/' + c.total + ' results done</a>');
      if (parts.length) items.push('<li><b>' + e(cls.name + ' · ' + Q.dayLabel(cls.id, cd.date)) + '</b> <span class="muted">' + W.date(cd.date) + '</span>: ' + parts.join(', ') + '</li>');
    }
    const unresolved = Q.unresolvedFiles(comp.id).length;
    if (unresolved) items.push('<li><a href="#' + C(comp) + '/files?state=unresolved">' + unresolved + ' unresolved IGC files</a></li>');
    return items.length ? '<div class="wf-box fill"><h3>Needs attention</h3><ul class="r2-attn">' + items.join('') + '</ul></div>' : '';
  }

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
        '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Class</th><th>Published days</th><th>Competitors</th><th>Last status</th></tr></thead><tbody>' + comp.archive.classes.map((c) => '<tr><td>' + e(c.name) + '</td><td>' + c.days + '</td><td>' + c.competitors + '</td><td>' + R.statusIcon(c.lastStatus) + ' ' + e(R.statusLabel(c.lastStatus)) + '</td></tr>').join('') + '</tbody></table></div>' +
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
      const head = '<div class="wf-row between"><a href="#' + dayPath(cls, date) + '"><b>' + e(cls.name) + '</b> · ' + e(Q.dayLabel(cls.id, date)) + '</a><span class="r3-status">' + R.statusIcon(cd ? cd.status : null) + ' ' + e(cd ? R.statusLabel(cd.status) : 'Untouched') + '</span></div>';
      if (!cd) return '<div class="r2-col">' + head + '<p class="muted small">Nobody has touched this class day.</p><a class="wf-btn small" href="#' + dayPath(cls, date) + '">Open class day</a></div>';
      const task = Q.task(cd);
      const c = live(cd) ? R.counts(cd) : null;
      return '<div class="r2-col">' + head + '<div class="wf-kv small">' +
        '<span>Task</span><span>' + (task ? '<a href="#' + links.classDayTasks(cd) + '">' + taskLine(task) + '</a>' : '<a href="#' + links.classDayTasks(cd) + '">none published</a>') + '</span>' +
        (c ? '<span>Results</span><span><a href="#' + links.classDayResults(cd) + '">' + c.done + '/' + c.total + ' done</a>' + (c.todo ? ' ' + R.todoIcon() : '') + '</span>' : '') +
        '<span>Publish</span><span><a href="#' + links.classDayPublish(cd) + '">' + (cd.reasons.length ? 'Changes not published' : Q.deadlinePassed(cd) ? 'Deadline passed' : cd.published ? 'Published ' + W.dt(cd.published.at) : 'Never published') + '</a></span></div>' +
        (task ? W.taskMap(task.points, { h: 150 }) : '') + '<a class="wf-btn small" href="#' + base(cd) + '">Open class day</a></div>';
    });
    const i = comp.dates.indexOf(date);
    const nav = (i > 0 ? '<a class="wf-btn small" href="#' + links.date(comp, comp.dates[i - 1]) + '">← ' + W.date(comp.dates[i - 1]) + '</a>' : '') + (i < comp.dates.length - 1 ? '<a class="wf-btn small" href="#' + links.date(comp, comp.dates[i + 1]) + '">' + W.date(comp.dates[i + 1]) + ' →</a>' : '');
    return page(ctx, W.date(date, true) + (date === KH.TODAY ? ' <span class="muted" style="font-weight:400">today</span>' : ''), classes.length ? '<div class="r2-cols">' + cols.join('') + '</div>' : '<div class="wf-empty">No classes yet</div>', nav);
  };

  // ---------- standings ----------

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
    const head = days.map(({ d, cd }) => '<th class="' + (cd && cd.status === 'cancelled' ? 'cx' : '') + '" title="' + e(Q.dayLabel(cls.id, d) + ' · ' + W.date(d) + ' · ' + R.statusLabel(cd && cd.status)) + '"><a href="#' + dayPath(cls, d) + '">' + e(Q.dayLabel(cls.id, d).replace('Practice day ', 'P').replace('Day ', 'D')) + ' ' + R.statusIcon(cd ? cd.status : null) + '</a></th>').join('');
    const body = rows.map((row, i) => '<tr><th class="rh"><span class="muted">' + (row.c.hc ? 'HC' : i + 1) + '</span> <a href="#' + links.competitor(row.c) + '"><b>' + e(row.c.cid) + '</b></a> <span class="small r2-name">' + e(Q.crewName(row.c)) + '</span></th>' +
      row.cells.map((x, j) => {
        const cd = days[j].cd;
        if (!x) return '<td class="na' + (cd && cd.status === 'cancelled' ? ' cx' : '') + '">' + (cd && cd.status === 'cancelled' ? '' : '·') + '</td>';
        const todo = R.todoReasons(x.result);
        const pts = x.status === 'did not fly' ? 'DNF' : x.status === 'unknown' || x.placeholder || x.points == null ? '–' : x.points;
        return '<td><a href="#' + links.result(x.result) + '" title="' + e(x.competitor.cid + ' · ' + Q.dayLabel(cls.id, cd.date) + ' · ' + x.result.status + (todo.length ? ' · to do: ' + todo.join(', ') : '')) + '">' + (todo.length ? R.todoIcon(todo.join(', ')) + ' ' : '') + pts + '</a></td>';
      }).join('') + '<td class="tot">' + row.total + '</td></tr>').join('');
    const legend = '<div class="r2-legend"><span>' + R.todoIcon() + ' work to do: in check, unknown, stale or manual</span>' + Object.keys(LABEL).map((s) => '<span>' + R.statusIcon(s) + ' ' + LABEL[s] + '</span>').join('') + '</div>';
    return page(ctx, e(cls.name) + ' standings <span class="muted small" style="font-weight:400">' + e(cls.edition) + (cls.handicapScale ? ', handicapped' : '') + '</span>',
      '<div class="wf-stack"><p class="muted small">Working scores of every day, practice days not counted in the total. A cell opens the result.</p><div class="wf-table-wrap"><table class="r2-st r3-st"><thead><tr><th class="rh">' + rows.length + ' competitors</th>' + head + '<th class="tot">Total</th></tr></thead><tbody>' +
      (rows.length ? body : '<tr><td colspan="' + (days.length + 2) + '" class="muted">No competitors</td></tr>') + '</tbody></table></div>' + legend + '</div>',
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
      '<div class="wf-box"><h3>Results</h3><table class="wf-table"><tbody>' + days.map((cd) => { const r = Q.resultFor(cd.id, c.id); return r ? '<tr class="link" data-href="' + links.result(r) + '"><td>' + e(Q.dayLabel(cd.classId, cd.date)) + '</td><td>' + W.resultStatus(r) + '</td><td>' + (R.isTodo(r) ? R.todoIcon(R.todoReasons(r).join(', ')) : '') + '</td></tr>' : ''; }).join('') + '</tbody></table></div>' +
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

  // ---------- class day ----------

  function tabs(ctx, key) {
    const cd = ctx.cd;
    const b = base(cd);
    const t = (k, href, label, mark) => '<a class="' + (k === key ? 'on' : '') + '" href="#' + href + '">' + label + (mark ? ' ' + mark : '') + '</a>';
    const todo = live(cd) && R.counts(cd).todo;
    const chip = '<span class="r3-chip" title="Status: ' + e(R.statusLabel(cd.status)) + (cd.reasons.length ? ', changes not published' : '') + '">' + R.statusIcon(cd.status) + ' ' + e(R.statusLabel(cd.status)) + (cd.reasons.length ? '<i class="r3-dot" title="Changes not published"></i>' : '') + '</span>';
    return '<div class="wf-tabs r3-tabs">' + t('overview', b, 'Overview') +
      t('task', b + '/task', 'Task', Q.task(cd) ? '<i class="mdi mdi-check r3-ok" title="Task published"></i>' : '') +
      t('results', b + '/results', 'Results', todo ? R.todoIcon('Results to do') : '') +
      t('publish', b + '/publish', 'Publish', chip) + '</div>';
  }

  function frame(ctx, key, body) {
    const cls = ctx.cls;
    const date = ctx.params.date;
    const title = e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, date)) + ' <span class="muted" style="font-weight:400">' + W.date(date, true) + '</span>';
    if (key === 'untouched') return page(ctx, title, body);
    if (key === 'review' && V.reviewChrome === 'none') return page(ctx, '', body);
    const tabKey = { candidate: 'task', settings: 'task', review: 'results' }[key] || key;
    return page(ctx, title, tabs(ctx, tabKey) + body);
  }

  function overviewTab(ctx) {
    const cd = ctx.cd;
    const task = Q.task(cd);
    const status = '<span class="r3-status">' + R.statusIcon(cd.status) + ' ' + e(R.statusLabel(cd.status)) + '</span>';
    if (cd.status === 'cancelled') return '<div class="wf-box"><div class="wf-kv"><span>Status</span><span>' + status + '</span></div><p class="muted small">Cancelled days are excluded from the overall results. <a href="#' + links.classDayPublish(cd) + '">Change the status on the Publish tab</a></p></div>';
    if (cd.status === 'unplanned' && !task) return '<div class="wf-box"><div class="wf-kv"><span>Status</span><span>' + status + '</span></div><p><a class="wf-btn primary" href="#' + links.classDayTasks(cd) + '">Enter or import a task</a></p></div>';
    const c = R.counts(cd);
    const pub = cd.reasons.length ? 'Changes not published' : Q.deadlinePassed(cd) ? 'Deadline passed' : cd.published ? 'Published as ' + R.statusLabel(cd.published.status).toLowerCase() + ' ' + W.dt(cd.published.at) : 'Never published';
    return '<div class="wf-cols"><div class="wf-box"><div class="wf-kv">' +
      '<span>Status</span><span>' + status + (cd.practice ? ' <span class="wf-badge">practice day</span>' : '') + '</span>' +
      '<span>Task</span><span>' + (task ? '<a href="#' + links.classDayTasks(cd) + '">' + taskLine(task) + '</a> <span class="muted small">' + e(Q.taskLine(task)) + '</span>' : '<a href="#' + links.classDayTasks(cd) + '">none published</a>') + '</span>' +
      (live(cd) ? '<span>Results</span><span><a href="#' + links.classDayResults(cd) + '">' + c.done + '/' + c.total + ' done</a>' + (c.todo ? ' ' + R.todoIcon() : '') + '</span>' : '') +
      '<span>Publish</span><span><a href="#' + links.classDayPublish(cd) + '">' + e(pub) + '</a></span></div></div>' +
      '<div>' + (task ? W.taskMap(task.points, { h: 220 }) : '<div class="wf-map" style="height:220px"><span class="tag">No task published yet</span></div>') + '</div></div>';
  }

  // One line per group. Values set for this class day, rather than inherited from the class, are bold.
  function settingsSummary(cd, cls) {
    const eff = KH.effective(cd, cls);
    const ov = cd.overrides || {};
    const v = (k, text) => (ov[k] !== '' && ov[k] != null ? '<b class="r3-ov" title="Set for this class day">' + text + '</b>' : text);
    const start = eff.pevStart ? v('pevStart', 'PEV start') + (eff.startOpen ? ', opens ' + v('startOpen', e(eff.startOpen)) : '') : eff.startOpen ? 'Start opens ' + v('startOpen', e(eff.startOpen)) : 'Start opening not set';
    const limits = [eff.maxStartAlt && 'max start ' + v('maxStartAlt', e(eff.maxStartAlt) + ' m'), eff.maxStartGs && 'max start speed ' + v('maxStartGs', e(eff.maxStartGs) + ' km/h'), eff.maxAltitude && 'max altitude ' + v('maxAltitude', e(eff.maxAltitude))].filter(Boolean).join(', ') || 'no limits set';
    const air = (cd.airspaceExceptions.length ? '<b class="r3-ov">' + cd.airspaceExceptions.length + ' airspace exceptions</b>' : 'no airspace exceptions') + (cd.notamAirspaces.length ? ', <b class="r3-ov">' + cd.notamAirspaces.length + ' NOTAM airspaces</b>' : '');
    return '<div class="r3-summary">' + [start, limits, air, cd.practice ? 'practice day' : ''].filter(Boolean).map((s) => '<span>' + s + '</span>').join('') + '</div>';
  }
  const EDIT_KEY = 'r3:settingsEdit';
  R.handlers = {
    r3EditMode: (ds) => KH.store.set(EDIT_KEY, ds.mode),
  };
  function settingsBox(ctx) {
    const cd = ctx.cd;
    const mode = KH.store.get(EDIT_KEY, 'accordion');
    const toggle = '<span class="r3-proto" title="Prototype only: compare both ways of editing">Prototype: <button class="' + (mode === 'page' ? 'on' : '') + '" data-act="r3EditMode" data-mode="page">Edit on page</button><button class="' + (mode === 'accordion' ? 'on' : '') + '" data-act="r3EditMode" data-mode="accordion">Edit in accordion</button></span>';
    const head = '<div class="wf-row between"><h3 style="margin:0">Shared task settings <span class="muted small" style="font-weight:400">apply to every task candidate</span></h3>' + toggle + '</div>' + settingsSummary(cd, ctx.cls);
    if (mode === 'page') return '<div class="wf-box">' + head + '<p style="margin:8px 0 0"><a class="wf-btn small" href="#' + links.classDaySettings(cd) + '">Edit shared task settings</a></p><p class="muted small" style="margin:6px 0 0">Bold values are set for this class day. The rest come from the class.</p></div>';
    return '<div class="wf-box">' + head + '<details class="r3-acc"' + (Q.task(cd) ? '' : ' open') + '><summary>Edit shared task settings</summary>' + R.settingsSection(cd) + '</details><p class="muted small" style="margin:6px 0 0">Bold values are set for this class day. The rest come from the class.</p></div>';
  }
  R.settingsSection = (cd) => '<div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))"><div class="wf-box">' + W.dayOverrides(cd) + '</div><div class="wf-box">' + W.dayAirspace(cd) + '</div></div>';

  function taskTab(ctx) {
    if (ctx.cand) return '<p><a href="#' + links.classDayTasks(ctx.cd) + '">← All task candidates</a></p>' + W.taskEditor(ctx.cand);
    return '<div class="wf-stack">' + settingsBox(ctx) + W.candidateList(ctx.cd) + '</div>';
  }
  function settingsPage(ctx) {
    return '<div class="wf-stack"><p><a href="#' + links.classDayTasks(ctx.cd) + '">← Task</a></p><div class="wf-box"><h3>Shared task settings</h3>' + settingsSummary(ctx.cd, ctx.cls) + '</div>' + R.settingsSection(ctx.cd) + '</div>';
  }

  R.staleBox = (cd) => {
    const stale = Q.staleFilesOf(cd);
    if (!stale.length) return '';
    return '<div class="wf-box"><h3>Stale analyses (' + stale.length + ')</h3><p class="muted small">Each file reruns on its own.</p><table class="wf-table"><tbody>' + stale.map((f) => {
      const r = Q.resolve(f);
      return '<tr><td><a href="#' + links.file(f) + '">' + e(f.name) + '</a></td><td>' + e(r.competitor.cid) + '</td><td>' + W.staleBadge(f) + '</td><td class="right"><button class="wf-btn small" data-act="rerun" data-file="' + f.id + '">Rerun</button></td></tr>';
    }).join('') + '</tbody></table></div>';
  };
  function resultsTab(ctx) {
    const cd = ctx.cd;
    const f = ctx.query.show || '';
    const c = R.counts(cd);
    const flt = (k, label, n) => '<a class="wf-btn small' + (f === k ? ' primary' : '') + '" href="#' + links.classDayResults(cd, k) + '">' + label + ' ' + n + '</a>';
    return '<div class="wf-stack"><div class="wf-row">' + flt('', 'All', c.results) + flt('check', 'In check', c.check) + flt('unknown', 'Unknown', c.unknown) + flt('stale', 'Stale', c.stale) + flt('manual', 'Manual', c.manual) + '<span class="muted small">' + c.done + '/' + c.total + ' done</span></div>' +
      (f === 'stale' || (!f && c.stale) ? R.staleBox(cd) : '') + '<div class="r2-wide">' + W.resultsTable(cd, { filter: f }) + '</div></div>';
  }

  // One stored status (#123). Publishing makes the current status, task and results public together.
  function publishTab(ctx) {
    const cd = ctx.cd;
    const cls = ctx.cls;
    const comp = ctx.comp;
    const lastDay = comp.dates[comp.dates.length - 1] === cd.date;
    const hours = cls.edition.startsWith('FAI') && lastDay ? 2 : KH.EDITIONS[cls.edition].defaults.complaintHours;
    const deadline = new Date(new Date(KH.NOW + ':00Z').getTime() + hours * 3600000).toISOString().slice(0, 16);
    const statuses = KH.DAY_STATUSES.filter((s) => s !== 'unplanned' || !Q.task(cd) || cd.status === 'unplanned');
    const canPublish = !comp.blocked && comp.lifecycle === 'live';
    const pub = cd.published;
    return '<div class="wf-box" style="max-width:720px"><div class="wf-stack">' +
      '<div class="wf-kv"><span>Status</span><span><select data-change="r3SetStatus" data-cd="' + cd.id + '">' + statuses.map((s) => '<option value="' + s + '"' + (s === cd.status ? ' selected' : '') + '>' + R.statusLabel(s) + '</option>').join('') + '</select> ' + R.statusIcon(cd.status) + '</span>' +
      (cd.status === 'unofficial' && cd.complaintDeadline ? '<span>Complaint deadline</span><span>' + W.dt(cd.complaintDeadline) + (Q.deadlinePassed(cd) ? ' <b>passed</b>, ready for final' : '') + '</span>' : '') +
      '<span>Published</span><span>' + (pub ? R.statusLabel(pub.status) + ' · ' + W.dt(pub.at) : 'never') + ' · <a href="#" data-act="r3PublicPage">Open public results ↗</a></span>' +
      '<span>Changes not published</span><span>' + (cd.reasons.length ? '<i class="r3-dot"></i> ' + e(cd.reasons.join(', ')) : 'none') + '</span></div>' +
      '<form class="wf-stack" data-submit="r3Publish" data-cd="' + cd.id + '"><div class="wf-form">' +
      (cd.status === 'unofficial' ? W.field('Complaint deadline', '<input type="datetime-local" name="complaintDeadline" value="' + deadline + '">', { hint: hours + ' h from now under ' + e(cls.edition) + (hours === 2 ? ' on the last competition day' : '') + '. Every unofficial publish sets it again.' }) : '') +
      W.field('Results note', '<textarea name="resultsNote" placeholder="Public remark published with the results">' + e(cd.resultsNote) + '</textarea>', { full: true }) +
      '</div><div class="wf-row"><button class="wf-btn primary"' + (canPublish ? '' : ' disabled') + '>Publish as ' + e(R.statusLabel(cd.status).toLowerCase()) + '</button><span class="muted small">Makes the status, task and results public together.</span></div></form>' +
      (comp.blocked ? '<p class="muted small">Blocked by staff: nothing is public.</p>' : '') + '</div></div>';
  }
  Object.assign(R.handlers, {
    r3SetStatus: (v, ds) => {
      A.setDayStatus(Q.classDay(ds.cd), v);
      KH.toast('Status set to ' + R.statusLabel(v).toLowerCase() + '. Pilots see it after you publish.');
    },
    r3Publish: (d, ds) => {
      const cd = Q.classDay(ds.cd);
      const checks = Q.publishChecks(cd, cd.status);
      const doIt = () => KH.run(() => {
        A.publishClassDay(cd, { complaintDeadline: cd.status === 'unofficial' ? d.complaintDeadline : cd.complaintDeadline, resultsNote: d.resultsNote });
        KH.toast('Published ' + W.dayTitle(cd) + ' as ' + R.statusLabel(cd.status).toLowerCase());
      });
      if (checks.length) KH.confirm({ title: 'Publish as ' + R.statusLabel(cd.status).toLowerCase() + '?', intro: 'This departs from the rules or skips a check:', items: checks.map(e), confirmLabel: 'Publish anyway', onConfirm: doIt, extra: '<p class="muted small">Explain anything pilots should know in the results note.</p>' });
      else doIt();
    },
    r3PublicPage: () => KH.toast('Public pages are out of scope for this prototype'),
  });

  // ---------- result review building blocks ----------

  R.neighbours = (ctx) => {
    const rows = KH.score(ctx.cd).rows;
    const todo = rows.filter((x) => R.isTodo(x.result) || x.result === ctx.result);
    const i = todo.findIndex((x) => x.result === ctx.result);
    return { prev: todo[i - 1], next: todo[i + 1], pos: i + 1, total: todo.length - (R.isTodo(ctx.result) ? 0 : 1) };
  };
  R.reviewNav = (ctx) => {
    const n = R.neighbours(ctx);
    const pos = R.isTodo(ctx.result) ? n.pos + ' of ' + n.total + ' to do' : n.total ? n.total + ' to do' : 'nothing to do';
    return '<div class="wf-row r3-nav">' + (n.prev ? '<a class="wf-btn small" href="#' + links.result(n.prev.result) + '" title="Previous result to do">← ' + e(n.prev.competitor.cid) + '</a>' : '<span class="wf-btn small" aria-disabled="true">←</span>') +
      '<span class="muted small">' + pos + '</span>' + (n.next ? '<a class="wf-btn small" href="#' + links.result(n.next.result) + '" title="Next result to do">' + e(n.next.competitor.cid) + ' →</a>' : '<span class="wf-btn small" aria-disabled="true">→</span>') + '</div>';
  };
  R.reviewButton = (r) => (r.checkReasons.length ? '<button class="wf-btn primary" data-act="review" data-result="' + r.id + '" data-count="' + r.checkReasons.length + '">Reviewed, clear ' + r.checkReasons.length + '</button>' : '<span class="wf-badge">no check reasons</span>');
  R.reviewHeader = (ctx) => {
    const c = ctx.competitor;
    const r = ctx.result;
    const todo = R.todoReasons(r);
    return '<div class="r3-rh"><h2>' + e(c.cid) + ' · ' + e(Q.crewName(c)) + '</h2><div class="muted small">' + e(c.gliderType) + (c.handicap ? ', handicap ' + c.handicap : '') + (c.hc ? ', hors concours' : '') + ' · ' + W.resultStatus(r) + (todo.length ? ' ' + R.todoIcon() + ' ' + e(todo.join(', ')) : ' done') + ' · <a href="#' + links.competitor(c) + '">competitor</a></div></div>';
  };
  R.rv = {
    reasons: (r) => (r.checkReasons.length ? '<ul class="r3-reasons">' + r.checkReasons.map((c) => '<li>' + e(c.text) + (c.file ? ': ' + e(Q.file(c.file).name) : '') + ' <span class="muted small">' + W.dt(c.at) + '</span></li>').join('') + '</ul>' : '<p class="muted small">No check reasons. To ask a colleague to look, leave an internal remark.</p>'),
    status: (r) => W.resultStatusControl(r),
    files: (r) => W.resultFiles(r),
    manual: (r) => (r.status === 'manual result' ? W.manualForm(r) : ''),
    penalty: (r) => W.penaltyForm(r),
    remarks: (r) => W.resultRemarks(r),
    summary: (f) => W.outputSummary(f),
    map: (ctx, f, opts) => {
      const task = Q.task(ctx.cd);
      const h = (opts && opts.h) || 220;
      return task ? W.taskMap(task.points, { track: f ? f.seed : undefined, finished: f && f.analysis.output && f.analysis.output.finished, h }) : '<div class="wf-map" style="height:' + h + 'px"><span class="tag">No task published</span></div>';
    },
    candidates: (f) => (f.analysis.candidates && f.analysis.candidates.length ? W.startCandidates(f) : '<p class="muted small">No start candidates.</p>'),
    log: (f) => W.analysisLog(f),
    overrides: (f) => W.overrides(f),
  };

  function classDay(ctx) {
    const key = ctx.route.dayKey;
    if (!ctx.cls) return empty(ctx, 'Not found', 'No such class');
    if (!ctx.comp.dates.includes(ctx.params.date)) return empty(ctx, 'Not a competition date', W.date(ctx.params.date, true) + ' is not a competition date.');
    if (!ctx.cd) return frame(ctx, 'untouched', W.untouchedDay(ctx.cls, ctx.params.date));
    if (key === 'review') return frame(ctx, 'review', ctx.result ? V.review(ctx) : '<div class="wf-empty">No such competitor in this class</div>');
    if (ctx.params.cand && (!ctx.cand || ctx.cand.classDayId !== ctx.cd.id)) return frame(ctx, key, '<div class="wf-empty">No such task candidate</div>');
    return frame(ctx, key, SECTIONS[key](ctx));
  }
  const SECTIONS = { overview: overviewTab, task: taskTab, candidate: taskTab, settings: settingsPage, results: resultsTab, publish: publishTab };

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
  // /task/settings comes before /task/:cand so it is never read as a candidate id.
  const dayRoutes = [
    ['', 'overview', 'Class day: Overview tab', EXD],
    ['/task', 'task', 'Task tab: shared task settings and candidates', EXD + '/task'],
    ['/task/settings', 'settings', 'Shared task settings page', EXD + '/task/settings'],
    ['/task/:cand', 'candidate', 'Task candidate editor', null],
    ['/results', 'results', 'Results tab', EXD + '/results'],
    ['/results/:cid', 'review', 'Result review (variant)', EX + '/days/2026-07-27/standard/results/D'],
    ['/publish', 'publish', 'Publish tab: status, deadline, publish', EX + '/days/2026-07-27/standard/publish'],
  ].map(([sub, dayKey, title, example]) => ({ path: '/c/:comp/days/:date/:class' + sub, title, group: 'Class day', example, dayKey }));

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
    KH.mount({
      id: variant.id,
      routes: shared.concat(dayRoutes),
      links,
      handlers: { ...R.handlers, ...(variant.handlers || {}) },
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
        if (!ctx.params.cid || !ctx.cd || !ctx.result) return;
        const n = R.neighbours(ctx);
        if (n.next) KH.go(links.result(n.next.result));
        else KH.go(links.classDayResults(ctx.cd));
      },
    });
  };
})();
