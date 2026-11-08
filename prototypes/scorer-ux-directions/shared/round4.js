// PROTOTYPE: round 4 shell shared by prototypes 4A to 4F.
//
// It implements every decision from rounds 1 to 3 (README.md, "Round 1/2/3 decisions"): the sidebar without a top
// bar, the overview page with the class day matrix, the date page, the overall standings per class, the class day
// with the tabs Overview, Task, Results and Publish, the shared task settings page, the two-column result review page
// with the linked map and barogram, the IGC files and IGC file pages, members, archive, account and staff pages, and
// the guards. A variant decides only the setup pages (README.md, "Open questions for round 4"): how details and upload
// password, dates, classes, turnpoints, airspace, competitors, loggers and optionally members are split into pages,
// which sidebar entries lead to them, and what the setup card on the overview shows.
//
// Load order in a variant's HTML: shared/data.js, shared/proto.js, shared/widgets.js, shared/round4.js, then the
// variant script. Link shared/wire.css, shared/round4.css and the mdi icon font
// (https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css). The variant script calls
// KH.r4.mount(variant) once.
//
// variant = {
//   id: '4a',                       // matches the KH.DIRECTIONS entry in shared/proto.js
//   setupRoutes: [                  // the variant's own pages, all under /c/:comp
//     { path: '/c/:comp/details', title: 'Details and upload password', example: '/c/oberrhein-2026/details',
//       render(ctx) { return R.page(ctx, 'Details', '...html...'); },
//       crumbs: (ctx) => [[href, label]],   // optional breadcrumbs after the competition, e.g. back to a list
//       archived: false },          // true when the page stays reachable in an archived competition
//     ...                           // must not use /c/:comp/days/*, /c/:comp/standings/*, /c/:comp/files*,
//   ],                              // /c/:comp/lifecycle or (unless ownsMembers) /c/:comp/members
//   setupMenu(ctx),                 // HTML of the sidebar entries between "Overview" and "Standings". Build them with
//                                   // R.navItem(href, label, ctx, extra, depth, { within }) and R.navSection(label)
//   setupCard(ctx),                 // HTML of the setup card at the top of the overview, '' to hide it. ctx.comp is set
//   links: {                        // where the shared widgets and shell pages link to. Required:
//     cls(cls),                     //   class settings of one class (used after creating a class)
//     competitors(comp),            //   the competitor list (used after deleting a competitor)
//     competitor(c),                //   one competitor
//     logger(l),                    //   one logger with its dated links
//     newClass(comp),               //   where "Add a class" goes from the empty matrix
//     newLogger(comp),              //   where "Add logger" goes
//     members(comp),                //   optional: where "Members" goes in an archived competition when ownsMembers
//   },
//   ownsMembers: false,             // true when the variant shows members itself (then the shell drops its
//                                   // "Members" entry and its /c/:comp/members page)
//   handlers: { name(ds, el, ev) {...} },   // optional extra data-act / data-submit / data-change handlers
// }
//
// Setup routes come before the shell routes, so the variant's order decides between /x/new and /x/:id. The overall
// standings live at /c/:comp/standings/:class (R.links.standings). The result review page, the shared task settings
// page (/c/:comp/days/:date/:class/task/settings) and the IGC file page are fixed in the shell.
//
// The shell resolves ctx.comp, ctx.cls (from :class), ctx.competitor (from :competitor), ctx.logger (from :logger),
// ctx.file and ctx.query on every route. Use these param names in setup routes to get them resolved.
//
// Helpers (const R = KH.r4): R.page(ctx, title, body, actions) wraps a page with the sidebar and breadcrumbs.
// R.navItem and R.navSection build sidebar entries. R.links is the full links map (shell plus variant). R.matrix(comp)
// is the class day matrix. R.setupSteps(comp) returns [{ key, label, done }] for details, airfield, classes,
// turnpoints, airspace, competitors, loggers and members (W.setupState). R.statusIcon(status), R.statusLabel(status),
// R.todoIcon(title), R.isTodo(r), R.counts(cd), R.live(cd), R.dayPath(cls, date), R.base(cd) as in round 3.
// The shared widgets for setup are W.competitionDetails, W.uploadPassword, W.datesEditor, W.classForm,
// W.turnpoints, W.airspace, W.competitorsTable, W.competitorForm, W.dsqPanel, W.loggersTable, W.loggerForm,
// W.loggerLinks and W.members (shared/widgets.js). Prototype 4A shows one page per item and is the reference.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const A = KH.act;
  const S = KH.state;
  const e = KH.esc;
  const R = (KH.r4 = {});
  let V;

  const C = (comp) => '/c/' + comp.slug;
  const dayPath = (cls, date) => C(Q.competition(cls.competitionId)) + '/days/' + date + '/' + cls.slug;
  const base = (cd) => dayPath(Q.class(cd.classId), cd.date);
  const live = (cd) => cd && !['unplanned', 'cancelled'].includes(cd.status);
  R.base = base;
  R.dayPath = dayPath;
  R.live = live;

  // The variant adds cls, competitors, competitor, logger, newClass and newLogger at mount.
  const links = {
    competition: C,
    standings: (cls) => C(Q.competition(cls.competitionId)) + '/standings/' + cls.slug,
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
    files: (comp) => C(comp) + '/files',
  };
  R.links = links;

  // ---------- status and work to do ----------

  const LABEL = { unplanned: 'Unplanned', 'task published': 'Task published', preliminary: 'Preliminary', unofficial: 'Unofficial', final: 'Final', cancelled: 'Cancelled' };
  const ICON = { unplanned: 'calendar-blank-outline', 'task published': 'flag-outline', preliminary: 'clock-outline', unofficial: 'timer-sand', final: 'check-decagram', cancelled: 'cancel' };
  R.statusLabel = (status) => LABEL[status] || 'Untouched';
  R.statusIcon = (status) => '<i class="mdi mdi-' + (ICON[status] || 'calendar-blank-outline') + ' r3-si' + (status ? '' : ' untouched') + '" title="' + e(R.statusLabel(status)) + '"></i>';
  R.todoIcon = (title) => '<i class="mdi mdi-alert-circle-outline r3-todo" title="' + e(title || 'Work to do') + '"></i>';

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

  R.navItem = navItem;
  R.navSection = (label) => '<div class="r2-sec">' + e(label) + '</div>';

  function sidebar(ctx) {
    const me = Q.me();
    const comp = ctx.comp;
    const comps = Q.myCompetitions();
    let html = '<nav class="r2-side" onclick="if(event.target.closest(\'a\'))document.body.classList.remove(\'r2-open\')"><div class="r2-top"><a class="r2-brand" href="#/">Keyhole</a>' +
      '<select class="r2-switch" onchange="location.hash=this.value"><option value="#/"' + (comp ? '' : ' selected') + '>My competitions</option>' +
      comps.map((c) => '<option value="#' + C(c) + '"' + (c === comp ? ' selected' : '') + '>' + e(c.name) + '</option>').join('') + '</select></div><div class="r2-scroll">';
    if (!comp) html += navItem('/', 'My competitions', ctx) + navItem('/new', 'Create competition', ctx);
    else if (comp.lifecycle === 'archived') html += navItem(C(comp), 'Overview', ctx) + navItem(links.members ? links.members(comp) : C(comp) + '/members', 'Members', ctx) + navItem(C(comp) + '/lifecycle', 'Delete', ctx);
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
    let html = navItem(b, 'Overview', ctx) + V.setupMenu(ctx);
    if (classes.length) html += R.navSection('Standings') + classes.map((cls) => navItem(links.standings(cls), e(cls.name), ctx)).join('');
    html += R.navSection('Competition') + navItem(b + '/files', 'IGC files', ctx, unresolved ? unresolved + ' unresolved' : '', 0, { within: p.startsWith(b + '/files/') }) +
      (V.ownsMembers ? '' : navItem(b + '/members', 'Members', ctx)) + navItem(b + '/lifecycle', 'Archive or delete', ctx);
    html += '<div class="r2-sec">Days</div>';
    if (!classes.length) return html + '<div class="muted small" style="padding:4px 12px"><a href="#' + links.newClass(comp) + '">Add a class</a> to plan its days</div>';
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
    if (ctx.route && ctx.route.crumbs) for (const c of ctx.route.crumbs(ctx)) out.push(c);
    if (ctx.file) out.push([C(comp) + '/files', 'IGC files']);
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
    if (!classes.length) return '<div class="wf-empty">No classes yet. <a href="#' + links.newClass(comp) + '">Add a class</a> to fill the matrix.</div>';
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

  R.setupSteps = (comp) => W.setupState(comp);

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
    return page(ctx, e(comp.name), '<div class="wf-stack">' + V.setupCard(ctx) + todayCards(comp) + attention(comp) + '<div><h2>Class days</h2>' + R.matrix(comp) + '</div></div>');
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

  P['/c/:comp/standings/:class'] = (ctx) => {
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

  // ---------- IGC files, members and archive ----------

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
    const note = res.ok ? '' : '<div class="wf-note warn"><b>Unresolved.</b> ' + e(res.reason) + ' The analysis stops before the task checks until the file resolves to a class day. <a href="#' + C(ctx.comp) + '/files?state=unresolved">All unresolved files</a></div>';
    const left = '<div class="wf-stack">' + note +
      (f.analysis.candidates && f.analysis.candidates.length ? '<div class="wf-box"><h3>Start candidates</h3><div class="r2-wide">' + W.startCandidates(f) + '</div></div>' : '') +
      '<div class="wf-box">' + R.logBox(f) + '</div>' + (res.ok ? '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(f) + '</div>' : '') + '</div>';
    const body = '<div class="wf-box r4-filehead">' + W.fileMeta(f) + '</div>' + R.twoColumns(ctx, f, left, res.ok ? Q.task(res.classDay) : null);
    return page(ctx, e(f.name), body);
  };
  P['/c/:comp/members'] = (ctx) => (V.ownsMembers ? empty(ctx, 'Not found', 'Members live on another page in this prototype.') : page(ctx, 'Members and invitations', W.members(ctx.comp)));
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
    const tabKey = { candidate: 'task', settings: 'task' }[key] || key;
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
  R.handlers = {};
  function settingsBox(ctx) {
    const cd = ctx.cd;
    return '<div class="wf-box"><div class="wf-row between"><h3 style="margin:0">Shared task settings <span class="muted small" style="font-weight:400">apply to every task candidate</span></h3>' +
      '<a class="wf-btn small" href="#' + links.classDaySettings(cd) + '">Edit</a></div>' + settingsSummary(cd, ctx.cls) +
      '<p class="muted small" style="margin:6px 0 0">Bold values are set for this class day. The rest come from the class.</p></div>';
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
    return '<div class="wf-stack"><div class="wf-row">' + flt('', 'All', c.results) + flt('todo', 'To do', c.todo) + flt('check', 'In check', c.check) + flt('unknown', 'Unknown', c.unknown) + flt('stale', 'Stale', c.stale) + flt('manual', 'Manual', c.manual) + '<span class="muted small">' + c.done + '/' + c.total + ' done</span></div>' +
      (f === 'stale' || (!f && c.stale) ? R.staleBox(cd) : '') + '<div class="r2-wide">' + W.resultsTable(cd, { filter: f, ...(f === 'todo' && { match: (x) => R.isTodo(x.result) }) }) + '</div></div>';
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

  // ---------- flight model, map and barogram ----------

  // A deterministic fake of the flight: position and altitude for every second between take-off and landing,
  // derived from the analysis output and log. Real Keyhole draws the IGC fixes.
  const secs = KH.util.secs;
  const hms = KH.util.hms;
  function flightModel(f, task, comp) {
    const a = f.analysis;
    if (!a || !a.log) return null;
    const timed = a.log.filter((x) => x.time);
    if (!timed.length) return null;
    const find = (re) => timed.find((x) => re.test(x.text));
    const t0 = secs((find(/^Take-off/) || timed[0]).time);
    const tL = secs((find(/^Landing/) || timed[timed.length - 1]).time);
    if (!(tL > t0)) return null;
    const o = a.output || {};
    const home = comp.airfield || { lat: 48.12, lon: 7.83, elev: 210 };
    const pts = task && task.points.length > 1 ? task.points : [{ lat: home.lat, lon: home.lon, name: 'Take-off' }, { lat: home.lat + 0.25, lon: home.lon + 0.35, name: '' }, { lat: home.lat - 0.15, lon: home.lon + 0.55, name: '' }, { lat: home.lat, lon: home.lon, name: '' }];
    const tS = o.start ? secs(o.start) : t0 + (tL - t0) * 0.15;
    const tF = o.finish ? secs(o.finish) : tL - 300;
    const legs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot((pts[i + 1].lon - pts[i].lon) * 0.67, pts[i + 1].lat - pts[i].lat);
      legs.push(d);
      total += d;
    }
    const taskKm = task ? Q.taskDistance(task) : 0;
    const reach = o.finished || !task ? 1 : Math.max(0.05, Math.min(0.98, (o.distance || 0) / (taskKm || 1)));
    const along = (fr) => {
      let s = fr * total;
      for (let i = 0; i < legs.length; i++) {
        if (s <= legs[i] || i === legs.length - 1) {
          const k = legs[i] ? Math.min(1, s / legs[i]) : 0;
          return [pts[i].lon + (pts[i + 1].lon - pts[i].lon) * k, pts[i].lat + (pts[i + 1].lat - pts[i].lat) * k];
        }
        s -= legs[i];
      }
      return [pts[0].lon, pts[0].lat];
    };
    const seed = (f.seed || 7) % 997;
    const wig = (t, amp) => [Math.sin(t / 410 + seed) * amp, Math.cos(t / 530 + seed * 1.7) * amp * 0.7];
    const pos = (t) => {
      if (t <= tS) {
        const k = (t - t0) / Math.max(1, tS - t0);
        const ang = k * 9 + seed;
        const r = 0.012 + 0.03 * Math.min(1, k * 3);
        return [pts[0].lon + Math.cos(ang) * r * 1.4, pts[0].lat + Math.sin(ang) * r];
      }
      if (t <= tF) {
        const [lo, la] = along(reach * (t - tS) / Math.max(1, tF - tS));
        const [dx, dy] = wig(t, 0.018);
        return [lo + dx, la + dy];
      }
      const [lo, la] = along(reach);
      const k = Math.min(1, (t - tF) / Math.max(1, tL - tF));
      return [lo + Math.sin(k * 3 + seed) * 0.01, la + Math.cos(k * 3 + seed) * 0.008];
    };
    const num = (re, d) => {
      const x = timed.find((y) => re.test(y.text));
      const m = x && x.text.match(/(\d{3,4}) m MSL/);
      return m ? Number(m[1]) : d;
    };
    const elev = home.elev || 300;
    const release = num(/^Release|^Self-launch/, 900);
    const inUse = (a.candidates || []).find((c) => c.inUse);
    const startAlt = inUse ? inUse.alt : 1400;
    const finishAlt = o.finishHeight || num(/^Finish at/, elev + 250);
    const saw = (t) => {
      const period = 900 + (seed % 5) * 120;
      const ph = ((t + seed * 37) % period) / period;
      const base = 1150 + 350 * Math.sin(t / 5400 + seed);
      return base + (ph < 0.45 ? ph / 0.45 : (1 - ph) / 0.55) * 650;
    };
    const lerp = (x, y, k) => x + (y - x) * Math.max(0, Math.min(1, k));
    const alt = (t) => {
      if (t <= t0 + 360) return lerp(elev, release, (t - t0) / 360);
      if (t <= tS - 600) return lerp(release, saw(t), (t - t0 - 360) / 600);
      if (t <= tS) return lerp(saw(t), startAlt, (t - (tS - 600)) / 600);
      if (t <= tF - 1200) return lerp(startAlt, saw(t), (t - tS) / 900);
      if (t <= tF) return lerp(saw(tF - 1200), o.finished ? finishAlt : elev + 120, (t - (tF - 1200)) / 1200);
      return lerp(o.finished ? finishAlt : elev + 120, elev, (t - tF) / Math.max(1, tL - tF));
    };
    const engines = timed.filter((x) => /engine run|Engine test/i.test(x.text)).map((x) => {
      const m = x.text.match(/(\d\d:\d\d:\d\d)–(\d\d:\d\d:\d\d)/);
      return m ? [secs(m[1]), secs(m[2])] : [secs(x.time), secs(x.time) + 40];
    });
    const markers = timed.filter((x) => x.level === 'warning' || x.level === 'error' || x.kind === 'start' || /^(Take-off|Landing|Finish at|Turnpoint \d+ .* reached|Assigned area \d+ .* reached)/.test(x.text))
      .map((x) => ({ t: secs(x.time), time: x.time, text: x.text, kind: x.level === 'warning' || x.level === 'error' ? 'warn' : x.kind === 'start' ? 'start' : /^Landing|^Take-off/.test(x.text) ? 'field' : 'tp' }));
    const lats = pts.map((p) => p.lat);
    const lons = pts.map((p) => p.lon);
    const pad = 0.1;
    const box = { minLat: Math.min(...lats) - pad, maxLat: Math.max(...lats) + pad, minLon: Math.min(...lons) - pad * 1.5, maxLon: Math.max(...lons) + pad * 1.5 };
    const altMax = Math.max(2400, startAlt + 400, release + 400);
    return { f, task, pts, t0, tL, tS, tF, pos, alt, altMax, engines, markers, box, elev, timedTimes: [...new Set(timed.map((x) => x.time))].filter((x) => secs(x) >= t0 && secs(x) <= tL) };
  }

  const MW = 400, MH = 270, BW = 400, BH = 110;
  const mx = (m, lon) => ((lon - m.box.minLon) / (m.box.maxLon - m.box.minLon)) * MW;
  const my = (m, lat) => MH - ((lat - m.box.minLat) / (m.box.maxLat - m.box.minLat)) * MH;
  const bx = (m, t) => ((t - m.t0) / (m.tL - m.t0)) * BW;
  const by = (m, h) => BH - 6 - (h / m.altMax) * (BH - 14);
  const MARK = { warn: '#c25e00', start: '#111', tp: '#555', field: '#999' };

  function mapSvg(m, at) {
    let svg = '<polyline fill="none" stroke="#bbb" stroke-width="1.2" points="' + m.pts.map((p) => mx(m, p.lon) + ',' + my(m, p.lat)).join(' ') + '"/>';
    if (m.task) m.pts.forEach((p) => {
      svg += p.zone && p.zone.kind === 'line' ? '<line x1="' + (mx(m, p.lon) - 9) + '" y1="' + (my(m, p.lat) - 9) + '" x2="' + (mx(m, p.lon) + 9) + '" y2="' + (my(m, p.lat) + 9) + '" stroke="#111" stroke-width="3"/>' :
        '<circle cx="' + mx(m, p.lon) + '" cy="' + my(m, p.lat) + '" r="' + Math.max(4, ((p.zone && p.zone.r1) || 0.5) * 2.2) + '" fill="rgba(0,0,0,.05)" stroke="#888" stroke-dasharray="3 2"/>';
      svg += '<text x="' + (mx(m, p.lon) + 5) + '" y="' + (my(m, p.lat) - 6) + '" font-size="10" fill="#555">' + e(p.name) + '</text>';
    });
    const tr = [];
    for (let t = m.t0; t <= m.tL; t += 60) tr.push(m.pos(t));
    svg += '<polyline fill="none" stroke="#333" stroke-width="1.3" points="' + tr.map(([lo, la]) => mx(m, lo).toFixed(1) + ',' + my(m, la).toFixed(1)).join(' ') + '"/>';
    for (const k of m.markers) {
      const [lo, la] = m.pos(k.t);
      svg += '<circle class="r4-mk" data-pin="' + k.time + '" cx="' + mx(m, lo).toFixed(1) + '" cy="' + my(m, la).toFixed(1) + '" r="4.5" fill="' + MARK[k.kind] + '" stroke="#fff" stroke-width="1.2"><title>' + k.time + ' ' + e(k.text) + '</title></circle>';
    }
    const [glo, gla] = m.pos(at == null ? m.tL : at);
    svg += '<g id="r4-glider"' + (at == null ? ' style="display:none"' : '') + ' transform="translate(' + mx(m, glo).toFixed(1) + ',' + my(m, gla).toFixed(1) + ')"><circle r="8" fill="none" stroke="#111" stroke-width="2"/><circle r="2.5" fill="#111"/></g>';
    return '<div class="wf-map r4-map"><span class="tag">Map (no basemap)</span><svg viewBox="0 0 ' + MW + ' ' + MH + '" preserveAspectRatio="xMidYMid meet">' + svg + '</svg></div>';
  }

  function baroSvg(m, at) {
    let svg = '';
    for (const h of [1000, 2000]) if (h < m.altMax) svg += '<line x1="0" x2="' + BW + '" y1="' + by(m, h) + '" y2="' + by(m, h) + '" stroke="#eee"/><text x="2" y="' + (by(m, h) - 2) + '" font-size="8" fill="#999">' + h + ' m</text>';
    for (const [a, b] of m.engines) svg += '<rect x="' + bx(m, a).toFixed(1) + '" y="0" width="' + Math.max(2, bx(m, b) - bx(m, a)).toFixed(1) + '" height="' + BH + '" fill="rgba(194,94,0,.18)"><title>Engine run</title></rect>';
    svg += '<rect x="' + bx(m, m.tS).toFixed(1) + '" y="0" width="' + Math.max(1, bx(m, m.tF) - bx(m, m.tS)).toFixed(1) + '" height="4" fill="#ddd"><title>Task</title></rect>';
    const pts = [];
    for (let t = m.t0; t <= m.tL; t += 30) pts.push(bx(m, t).toFixed(1) + ',' + by(m, m.alt(t)).toFixed(1));
    svg += '<polyline fill="none" stroke="#222" stroke-width="1" points="' + pts.join(' ') + '"/>';
    for (const k of m.markers) svg += '<line class="r4-mk" data-pin="' + k.time + '" x1="' + bx(m, k.t).toFixed(1) + '" x2="' + bx(m, k.t).toFixed(1) + '" y1="' + (BH - 12) + '" y2="' + BH + '" stroke="' + MARK[k.kind] + '" stroke-width="3"><title>' + k.time + ' ' + e(k.text) + '</title></line>';
    const x = at == null ? 0 : bx(m, at);
    svg += '<g id="r4-cursor"' + (at == null ? ' style="display:none"' : '') + ' transform="translate(' + x.toFixed(1) + ',0)"><line y1="0" y2="' + BH + '" stroke="#111" stroke-dasharray="2 2"/><text id="r4-cursor-label" x="3" y="10" font-size="9" fill="#111">' + (at == null ? '' : hms(at) + ' · ' + Math.round(m.alt(at)) + ' m') + '</text></g>';
    return '<div class="r4-baro"><div class="r4-baro-head small muted">Barogram · ' + hms(m.t0) + '–' + hms(m.tL) + '</div><svg viewBox="0 0 ' + BW + ' ' + BH + '" preserveAspectRatio="none">' + svg + '</svg></div>';
  }

  // The current flight on screen, for the client-side preview without a re-render.
  let shown = null;
  function moveTo(t) {
    if (!shown) return;
    const g = document.getElementById('r4-glider');
    const c = document.getElementById('r4-cursor');
    const label = document.getElementById('r4-cursor-label');
    if (t == null) {
      if (g) g.style.display = 'none';
      if (c) c.style.display = 'none';
      return;
    }
    const [lo, la] = shown.pos(t);
    if (g) {
      g.style.display = '';
      g.setAttribute('transform', 'translate(' + mx(shown, lo).toFixed(1) + ',' + my(shown, la).toFixed(1) + ')');
    }
    if (c) {
      c.style.display = '';
      c.setAttribute('transform', 'translate(' + bx(shown, t).toFixed(1) + ',0)');
    }
    if (label) label.textContent = hms(t) + ' · ' + Math.round(shown.alt(t)) + ' m';
  }
  function pinnedAt() {
    const at = KH.current().query.at;
    return at && /^\d\d:\d\d:\d\d$/.test(at) ? at : null;
  }
  function highlight(at, scroll) {
    if (typeof document.querySelectorAll !== 'function') return;
    document.querySelectorAll('.r4-at.pin').forEach((r) => r.classList.remove('pin'));
    if (!at) return;
    const rows = document.querySelectorAll('.r4-at[data-at="' + at + '"]');
    rows.forEach((r) => r.classList.add('pin'));
    const row = rows[0];
    const box = row && row.closest('.r4-logbox');
    if (row && box && box.scrollHeight > box.clientHeight) box.scrollTop = row.offsetTop - box.clientHeight / 2;
    else if (row && scroll) row.scrollIntoView({ block: 'center' });
  }
  // Pinning only rewrites the URL. A hash change would re-render and scroll the page to the top.
  function pin(at, scroll) {
    history.replaceState(null, '', '#' + KH.withQuery({ at }));
    moveTo(at ? secs(at) : null);
    highlight(at, scroll);
  }
  R.pin = pin;
  function inShownFlight(el) {
    return shown && el.closest('.r4-flight');
  }
  document.addEventListener('mouseover', (ev) => {
    const row = ev.target.closest && ev.target.closest('.r4-at');
    if (row && inShownFlight(row)) moveTo(secs(row.dataset.at));
  });
  document.addEventListener('mouseout', (ev) => {
    const box = ev.target.closest && ev.target.closest('.r4-logbox');
    if (box && inShownFlight(box) && !box.contains(ev.relatedTarget)) {
      const at = pinnedAt();
      moveTo(at ? secs(at) : null);
    }
  });
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest) return;
    const mk = ev.target.closest('[data-pin]');
    if (mk && inShownFlight(mk)) return pin(mk.dataset.pin, true);
    const row = ev.target.closest('.r4-at');
    if (row && inShownFlight(row) && !ev.target.closest('a, button, input, select, textarea, label, form')) pin(row.dataset.at, false);
  });

  // The shared analysis log with a time attribute and a phone map button on every timed row.
  R.logBox = (f) => {
    const html = W.analysisLog(f).replace(/<tr class="log-(\w+)"><td class="mono nowrap">(\d\d:\d\d:\d\d)<\/td>/g, (all, lvl, t) =>
      '<tr class="log-' + lvl + ' r4-at" data-at="' + t + '"><td class="mono nowrap">' + t + ' <button class="r4-mapbtn" data-act="r4MapOpen" data-file="' + f.id + '" data-at="' + t + '" title="Show on map"><i class="mdi mdi-map-marker-outline"></i></button></td>');
    return '<div class="r4-logbox">' + html + '</div>';
  };

  // Left column plus, when the file has a flight, the sticky map and barogram on the right.
  R.twoColumns = (ctx, f, left, task) => {
    const m = f ? flightModel(f, task, ctx.comp) : null;
    shown = m;
    if (!m) return '<div class="r4-cols one"><div class="r4-left">' + left + '</div></div>';
    const at = ctx.query.at && /^\d\d:\d\d:\d\d$/.test(ctx.query.at) ? secs(ctx.query.at) : null;
    if (at != null) setTimeout(() => highlight(ctx.query.at, false), 0);
    const open = KH.ui.r4map && KH.ui.r4map.file === f.id ? KH.ui.r4map.at : null;
    return '<div class="r4-cols r4-flight"><div class="r4-left">' + left + '</div><aside class="r4-right"><div class="r4-sticky">' + mapSvg(m, at) + baroSvg(m, at) +
      '<p class="muted small">Hover a log line to see that moment. Click it to pin it. Markers open their log line.</p></div></aside></div>' + (open ? fullMap(m, open) : '');
  };

  // Phones: the map and barogram open full screen, with previous and next through the timed log entries.
  function fullMap(m, at) {
    const list = m.timedTimes;
    const i = Math.max(0, list.indexOf(at));
    const entries = m.f.analysis.log.filter((x) => x.time === list[i]).map((x) => '<div>' + W.level(x.level) + ' ' + e(x.text) + '</div>').join('');
    const step = (j, label) => (list[j] ? '<button class="wf-btn small" data-act="r4MapOpen" data-file="' + m.f.id + '" data-at="' + list[j] + '">' + label + '</button>' : '<span></span>');
    return '<div class="r4-full r4-flight"><div class="r4-full-head"><button class="wf-btn small" data-act="r4MapClose">Close</button>' + step(i - 1, '← Previous') + '<b class="mono">' + list[i] + '</b>' + step(i + 1, 'Next →') + '</div>' +
      mapSvg(m, secs(list[i])) + baroSvg(m, secs(list[i])) + '<div class="r4-full-entry small">' + entries + '</div></div>';
  }
  Object.assign(R.handlers, {
    r4MapOpen: (ds) => {
      KH.ui.r4map = { file: ds.file, at: ds.at };
      history.replaceState(null, '', '#' + KH.withQuery({ at: ds.at }));
    },
    r4MapClose: () => {
      KH.ui.r4map = null;
    },
    r4MarkOk: (ds) => {
      const r = Q.result(ds.result);
      A.review(r, Number(ds.count));
      r.manuallyOk = { userId: Q.me().id, at: KH.NOW };
      KH.toast('Marked OK');
    },
  });

  // ---------- result review ----------

  function outputLine(f) {
    const o = f.analysis.output;
    if (!o) return '<span class="muted small">no task result</span>';
    return '<span class="small">' + [o.start && 'start ' + o.start, o.finished ? 'finish ' + o.finish : 'landed ' + o.landing, W.km(o.distance), o.speed ? W.kmh(o.speed) : ''].filter(Boolean).join(' · ') + '</span>';
  }
  function reasonsBlock(r, f) {
    const by = r.manuallyOk ? '<p class="small">Manually OK by ' + e(Q.user(r.manuallyOk.userId).name) + ', ' + W.dt(r.manuallyOk.at) + '</p>' : '';
    if (r.checkReasons.length) {
      return '<div class="wf-box r4-reasons"><h3>Check reasons</h3><ul class="r3-reasons">' + r.checkReasons.map((c) => '<li>' + e(c.text) + (c.file ? ': ' + e(Q.file(c.file).name) : '') + ' <span class="muted small">' + W.dt(c.at) + '</span></li>').join('') + '</ul>' +
        '<div class="wf-row" style="margin-top:8px"><button class="wf-btn primary" data-act="r4MarkOk" data-result="' + r.id + '" data-count="' + r.checkReasons.length + '">Mark OK</button><span class="muted small">Clears ' + (r.checkReasons.length === 1 ? 'this reason' : 'these ' + r.checkReasons.length + ' reasons') + ' and sets the result to manually OK.</span></div></div>';
    }
    const notes = [];
    if (r.status === 'unknown') notes.push(R.todoIcon() + ' <b>No result yet.</b> Score one of the files below, or set did not fly or a manual result.');
    if (r.status === 'manual result') notes.push(R.todoIcon() + ' <b>Manual result.</b> It stands in until the IGC file arrives, so it stays to do.');
    if (f && f.analysis.stale.length) notes.push(R.todoIcon() + ' <b>Stale analysis.</b> Rerun the scored file in the log below.');
    if (!notes.length) notes.push('<b>OK.</b> No check reasons.');
    return '<div class="wf-box r4-reasons">' + notes.map((n) => '<p style="margin:0 0 4px">' + n + '</p>').join('') + by + '</div>';
  }

  function reviewPage(ctx) {
    const r = ctx.result;
    const c = ctx.competitor;
    const f = R.scoredFile(r);
    const left = '<div class="wf-stack">' + reasonsBlock(r, f) +
      '<div class="wf-box"><h3>Result</h3>' + W.resultStatusControl(r) + '<div class="r2-wide" style="margin-top:8px">' + W.resultFiles(r) + '</div>' + (r.status === 'manual result' ? '<div style="margin-top:10px">' + W.manualForm(r) + '</div>' : '') + '</div>' +
      (f ? '<div class="wf-box"><h3>Start candidates</h3><div class="r2-wide">' + (f.analysis.candidates && f.analysis.candidates.length ? W.startCandidates(f) : '<p class="muted small">No start candidates.</p>') + '</div></div>' +
        '<div class="wf-box"><div class="wf-row between"><b>Scored file: <a href="#' + links.file(f) + '">' + e(f.name) + '</a></b>' + outputLine(f) + '</div>' + R.logBox(f) + '</div>' +
        '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(f) + '</div>' : '') +
      '<div class="wf-box"><h3>Penalty</h3>' + W.penaltyForm(r) + '</div><div class="wf-box"><h3>Remarks and handicap</h3>' + W.resultRemarks(r) + '</div></div>';
    const title = e(c.cid) + ' · ' + e(Q.crewName(c));
    const sub = '<p class="muted small r4-sub"><a href="#' + links.classDayResults(ctx.cd, 'todo') + '">← Results to do</a> · ' + e(c.gliderType) + (c.handicap ? ', handicap ' + c.handicap : '') + (c.hc ? ', hors concours' : '') + ' · ' + e(ctx.cls.name) + ' ' + e(Q.dayLabel(ctx.cls.id, ctx.cd.date)) + ' · <a href="#' + links.competitor(c) + '">competitor</a></p>';
    return page(ctx, title, sub + R.twoColumns(ctx, f, left, Q.task(ctx.cd)));
  }

  R.scoredFile = (r) => (r.scoredFileId ? Q.file(r.scoredFileId) : null);

  function classDay(ctx) {
    const key = ctx.route.dayKey;
    if (!ctx.cls) return empty(ctx, 'Not found', 'No such class');
    if (!ctx.comp.dates.includes(ctx.params.date)) return empty(ctx, 'Not a competition date', W.date(ctx.params.date, true) + ' is not a competition date.');
    if (!ctx.cd) return frame(ctx, 'untouched', W.untouchedDay(ctx.cls, ctx.params.date));
    if (key === 'review') return ctx.result ? reviewPage(ctx) : frame(ctx, 'results', '<div class="wf-empty">No such competitor in this class</div>');
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
    ['/c/:comp/standings/:class', 'Overall standings of a class', 'Competition', EX + '/standings/standard'],
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
    ['/results/:cid', 'review', 'Result review: two columns with map and barogram', EXD + '/results/3Y'],
    ['/publish', 'publish', 'Publish tab: status, deadline, publish', EX + '/days/2026-07-27/standard/publish'],
  ].map(([sub, dayKey, title, example]) => ({ path: '/c/:comp/days/:date/:class' + sub, title, group: 'Class day', example, dayKey }));

  function guard(ctx) {
    if (!ctx.comp) return empty(ctx, 'Not found', 'This competition does not exist.');
    if (!Q.roleIn(ctx.comp)) {
      const ci = S.competitionInvitations.find((i) => i.competitionId === ctx.comp.id && i.inviteeId === Q.me().id);
      return page({ ...ctx, comp: null }, e(ctx.comp.name), '<div class="wf-empty">You are not a member of this competition.' + (ci ? '<p><button class="wf-btn primary" data-act="acceptCI" data-id="' + ci.id + '">Accept invitation as ' + ci.role + '</button></p>' : '') + '</div>');
    }
    if (ctx.comp.blocked && !Q.me().staff) return empty({ ...ctx, comp: null }, 'Not found', 'This competition does not exist.');
    if (ctx.comp.lifecycle === 'archived' && !['/c/:comp', '/c/:comp/members', '/c/:comp/lifecycle'].includes(ctx.route.path) && !ctx.route.archived) return empty(ctx, e(ctx.comp.name), 'Archived. The scoring work was removed. <a href="#' + C(ctx.comp) + '">Open the archive summary</a>');
    return null;
  }

  R.mount = (variant) => {
    V = variant;
    Object.assign(links, variant.links);
    const setup = variant.setupRoutes.map((r) => ({ group: 'Setup', ...r, setup: true }));
    KH.mount({
      id: variant.id,
      routes: setup.concat(shared, dayRoutes),
      links,
      handlers: { ...R.handlers, ...(variant.handlers || {}) },
      render(ctx) {
        if (ctx.params.comp) {
          const g = guard(ctx);
          if (g) return g;
        }
        if (ctx.route.setup) return ctx.route.render(ctx);
        return ctx.route.dayKey ? classDay(ctx) : P[ctx.route.path](ctx);
      },
      notFound: (ctx) => empty(ctx, 'Not found', 'No page at ' + e(ctx.path)),
    });
  };
})();
