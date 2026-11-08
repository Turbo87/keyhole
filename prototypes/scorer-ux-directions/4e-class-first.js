// PROTOTYPE: 4E, Class first. Each class owns its settings, competitors and class days.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const A = KH.act;
  const S = KH.state;
  const R = KH.r4;
  const e = KH.esc;
  const EX = '/c/oberrhein-2026';

  function competitionPath(comp) { return '/c/' + comp.slug; }
  function classPath(cls) { return competitionPath(Q.competition(cls.competitionId)) + '/class/' + cls.slug; }
  function button(path, label, primary) { return '<a class="wf-btn' + (primary ? ' primary' : ' small') + '" href="#' + path + '">' + label + '</a>'; }
  function wrapTable(html) { return html.replace('<table', '<div class="wf-table-wrap"><table').replace('</table>', '</table></div>'); }
  function page(ctx, title, body, actions) { return R.page(ctx, title, '<div class="e-setup">' + body + '</div>', actions); }
  function missing(ctx, message) { return page(ctx, 'Not found', '<div class="wf-empty">' + message + '</div>'); }
  function hasClass(ctx) { return ctx.cls && ctx.cls.competitionId === ctx.comp.id; }

  const links = {
    cls(cls) { return classPath(cls) + '/settings'; },
    competitors(comp) {
      const ctx = KH.current();
      const cls = ctx.cls && ctx.cls.competitionId === comp.id ? ctx.cls : Q.classesOf(comp.id)[0];
      return cls ? classPath(cls) + '/competitors' : links.newClass(comp);
    },
    competitor(c) { return classPath(Q.class(c.classId)) + '/competitors/' + c.id; },
    logger(l) {
      const c = l.links.map((k) => Q.competitor(k.competitorId)).find((c) => c && !c.deleted && !Q.class(c.classId).deleted);
      return (c ? links.competitor(c) : competitionPath(Q.competition(l.competitionId)) + '/competition/loggers') + '?logger=' + l.id;
    },
    newClass(comp) { return competitionPath(comp) + '/class/new'; },
    newLogger(comp) { return competitionPath(comp) + '/competition/loggers'; },
    members(comp) { return competitionPath(comp) + '/competition/members'; },
  };

  function tabs(ctx, base, items, selected) {
    return '<div class="wf-tabs">' + items.map(([key, label]) => '<a' + (key === selected ? ' class="on" aria-current="page"' : '') + ' href="#' + base + '/' + key + '">' + label + '</a>').join('') + '</div>';
  }
  function competitionTabs(ctx, selected) {
    return tabs(ctx, competitionPath(ctx.comp) + '/competition', [['details', 'Details'], ['password', 'Upload password'], ['dates', 'Dates'], ['members', 'Members'], ['loggers', 'All loggers']], selected);
  }
  function competitionPage(ctx, selected, body) {
    return page(ctx, 'Competition', competitionTabs(ctx, selected) + body);
  }
  function details(ctx) {
    const comp = ctx.comp;
    return competitionPage(ctx, 'details', '<div class="wf-stack"><div class="wf-box">' + W.competitionDetails(comp) + '</div><div class="wf-box fill small"><b>Organiser terms</b><br>' + e(comp.terms.version) + ' accepted by ' + e(Q.user(comp.terms.userId).name) + ' on ' + W.dt(comp.terms.at) + ' for ' + e(comp.terms.organiser) + '</div></div>');
  }
  function classTabs(ctx, selected) {
    return tabs(ctx, classPath(ctx.cls), [['settings', 'Settings'], ['competitors', 'Competitors'], ['days', 'Class days']], selected);
  }
  function classPage(ctx, selected, body, actions) {
    return page(ctx, e(ctx.cls.name), classTabs(ctx, selected) + body, actions);
  }
  function settings(ctx) {
    if (!hasClass(ctx)) return missing(ctx, 'No such class');
    const cls = ctx.cls;
    return classPage(ctx, 'settings', cls.deleted ? '<div class="wf-box"><p>This class is deleted. Restore it with its competitors, class days and results.</p><button class="wf-btn primary" data-act="restoreClass" data-cls="' + cls.id + '">Restore class</button></div>' : '<div class="wf-box">' + W.classForm(ctx.comp, cls) + '</div>', button(R.links.standings(cls), 'Standings'));
  }

  function competitors(ctx) {
    if (!hasClass(ctx)) return missing(ctx, 'No such class');
    const rows = Q.competitorsOf(ctx.comp.id, ctx.cls.id, true);
    const table = '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Competition ID</th><th>Crew</th><th>Glider</th><th>Handicap</th><th>Loggers</th><th>Flags</th></tr></thead><tbody>' + (rows.length ? rows.map((c) => {
      const loggers = Q.loggersOf(ctx.comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
      return '<tr class="link' + (c.deleted ? ' dim' : '') + '" data-href="' + links.competitor(c) + '"><td><b>' + e(c.cid) + '</b></td><td>' + e(Q.crewName(c)) + '</td><td>' + e(c.gliderType) + '</td><td>' + (c.handicap ?? '—') + '</td><td>' + (loggers.map((l) => e(Q.loggerLabel(l))).join('<br>') || 'None linked') + '</td><td>' + [c.hc ? 'Hors concours' : '', c.dsq ? 'Disqualified' : '', c.deleted ? 'Deleted' : ''].filter(Boolean).join(' · ') + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="muted">No competitors yet. Add a competitor, then create or link their loggers.</td></tr>') + '</tbody></table></div>';
    return classPage(ctx, 'competitors', '<p class="muted small">' + rows.filter((c) => !c.deleted).length + ' competitors in ' + e(ctx.cls.name) + '. Open a competitor to edit crew, glider, class and loggers.</p>' + table, button(classPath(ctx.cls) + '/competitors/new', 'Add competitor', true));
  }
  function competitorNew(ctx) {
    if (!hasClass(ctx)) return missing(ctx, 'No such class');
    return classPage(ctx, 'competitors', '<div class="wf-box"><h3>Add competitor to ' + e(ctx.cls.name) + '</h3>' + competitorForm(ctx.comp, null, ctx.cls.id) + '</div>');
  }
  function competitorForm(comp, c, classId) {
    return wrapTable(W.competitorForm(comp, c, classId).replace('<table class="wf-table">', '<table class="wf-table e-crew">')).replace('data-submit="saveCompetitor"', 'data-submit="eSaveCompetitor"');
  }
  function linkFields() {
    return W.field('From date', W.input('from', '', 'type="date"'), { hint: 'Empty: from the start' }) + W.field('Role', W.select('role', ['primary', 'secondary'], 'primary'));
  }
  function loggerPanel(comp, l, c) {
    const linksHtml = c ? W.loggerLinks(l).replace(W.linkForm(l), W.linkForm(l, { competitorId: c.id })) : W.loggerLinks(l);
    const files = S.files.filter((f) => f.loggerId === l.id).map((f) => ({ f, res: Q.resolve(f) }));
    return '<div class="wf-stack"><div><h4>Dated links</h4><div class="wf-table-wrap">' + linksHtml + '</div></div><div><h4>Thresholds</h4>' + W.loggerForm(comp, l) + '</div><details><summary>Files · ' + files.length + '</summary><div class="wf-table-wrap">' + W.filesTable(files) + '</div></details></div>';
  }
  function competitor(ctx) {
    const c = ctx.competitor;
    if (!hasClass(ctx) || !c || c.competitionId !== ctx.comp.id || c.classId !== ctx.cls.id) return missing(ctx, 'No such competitor in this class');
    const loggers = Q.loggersOf(ctx.comp.id);
    const linked = loggers.filter((l) => l.links.some((k) => k.competitorId === c.id));
    const create = W.loggerForm(ctx.comp).replace('data-submit="saveLogger"', 'data-submit="eCreateLogger" data-competitor="' + c.id + '"').replace('<div class="wf-row"><button', '<div class="wf-row">' + linkFields() + '</div><div class="wf-row"><button').replace('>Add logger</button>', '>Create and link logger</button>');
    const add = '<div class="wf-box"><h3>Add logger for ' + e(c.cid) + '</h3><details><summary>Create by manufacturer and serial</summary><div style="margin-top:12px">' + create + '</div></details><hr><h4>Link an existing logger</h4>' + (loggers.length ? '<form class="wf-row" data-submit="eLinkLogger" data-competitor="' + c.id + '">' + W.field('Logger', W.select('loggerId', loggers.map((l) => [l.id, Q.loggerLabel(l)]))) + linkFields() + '<button class="wf-btn small primary">Link logger</button></form>' : '<p class="muted small">No existing loggers yet.</p>') + '</div>';
    const loggerHtml = linked.map((l) => '<details class="wf-box e-logger" open><summary>' + e(Q.loggerLabel(l)) + '</summary>' + loggerPanel(ctx.comp, l, c) + '</details>').join('');
    const results = Q.classDaysOf(c.classId).filter(R.live).map((cd) => {
      const r = Q.resultFor(cd.id, c.id);
      return r ? '<tr><td><a href="#' + R.links.result(r) + '">' + e(Q.dayLabel(cd.classId, cd.date)) + '</a></td><td>' + W.resultStatus(r) + '</td><td>' + (R.isTodo(r) ? R.todoIcon(R.todoReasons(r).join(', ')) : '') + '</td></tr>' : '';
    }).join('');
    return page(ctx, e(c.cid) + ' · ' + e(Q.crewName(c)), classTabs(ctx, 'competitors') + '<div class="wf-stack"><p>' + button(classPath(ctx.cls) + '/competitors', '← ' + e(ctx.cls.name) + ' competitors') + '</p><div class="wf-box"><h3>Competitor' + (c.deleted ? ' · deleted' : '') + '</h3>' + competitorForm(ctx.comp, c) + '</div><h2>Loggers and dated links</h2>' + (loggerHtml || '<p class="muted">No loggers linked.</p>') + add + '<div class="wf-box">' + W.dsqPanel(c) + '</div>' + (results ? '<div class="wf-box"><h3>Results</h3><table class="wf-table"><tbody>' + results + '</tbody></table></div>' : '') + '</div>');
  }

  function allLoggers(ctx) {
    const l = ctx.query.logger ? Q.logger(ctx.query.logger) : null;
    const rows = Q.loggersOf(ctx.comp.id).map((logger) => '<tr class="link" data-href="' + competitionPath(ctx.comp) + '/competition/loggers?logger=' + logger.id + '"><td><b>' + e(Q.loggerLabel(logger)) + '</b></td><td>' + (logger.links.map((k) => {
      const c = Q.competitor(k.competitorId);
      return e(Q.class(c.classId).name) + ' · ' + e(c.cid) + ' · ' + e(k.role) + (k.from ? ' from ' + W.date(k.from, true) : ' from the start');
    }).join('<br>') || 'No links') + '</td><td>ENL ' + logger.enl + ' · MOP ' + logger.mop + ' · ' + logger.cur + ' A · ' + logger.minDuration + ' s</td></tr>').join('');
    const table = '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Logger</th><th>Class and competitor links</th><th>Thresholds</th></tr></thead><tbody>' + (rows || '<tr><td colspan="3" class="muted">No loggers yet.</td></tr>') + '</tbody></table></div>';
    return competitionPage(ctx, 'loggers', '<div class="wf-stack"><p class="muted small">Create and link loggers from a competitor’s page. This competition-wide table also includes unlinked loggers and loggers used across classes. Open a row to edit its thresholds and links.</p><div class="wf-row">' + Q.classesOf(ctx.comp.id).map((cls) => button(classPath(cls) + '/competitors', e(cls.name) + ' competitors')).join('') + '</div>' + (l && l.competitionId === ctx.comp.id ? '<div class="wf-box"><h3>' + e(Q.loggerLabel(l)) + '</h3>' + loggerPanel(ctx.comp, l) + '</div>' : '') + table + '</div>');
  }
  function classDays(ctx) {
    if (!hasClass(ctx)) return missing(ctx, 'No such class');
    const cls = ctx.cls;
    return classPage(ctx, 'days', '<div class="wf-box"><h3>Class days · ' + e(cls.name) + '</h3><p class="muted small">Only this class changes here. Practice is fixed after the first publish. Status changes become public when the class day is published.</p>' + ctx.comp.dates.map((date) => {
      const cd = Q.classDayOn(cls.id, date);
      const ds = ' data-cls="' + cls.id + '" data-date="' + date + '"';
      return '<div class="e-day"><div><b>' + W.date(date, true) + '</b><div class="muted small">' + e(Q.dayLabel(cls.id, date)) + '</div></div><div>' + (cd ? R.statusIcon(cd.status) + ' ' + e(R.statusLabel(cd.status)) : 'Untouched') + (cd && cd.reasons.length ? '<div class="muted small">Changes not published</div>' : '') + '</div><div class="wf-row">' + (cd ? button(R.dayPath(cls, date), 'Open class day') : '<button class="wf-btn small" data-act="eTouch"' + ds + '>Touch date</button>') + '<label class="wf-field inline"><input type="checkbox" data-change="ePractice"' + ds + (cd && cd.practice ? ' checked' : '') + (cd && cd.published ? ' disabled' : '') + '> Practice</label>' + (cd && cd.status === 'cancelled' ? button(R.links.classDayPublish(cd), 'Review cancellation') : '<button class="wf-btn small" data-act="eCancel"' + ds + '>Cancel day</button>') + '</div></div>';
    }).join('') + (!ctx.comp.dates.length ? '<p>No competition dates yet.</p>' : '') + '<p style="margin-top:12px">' + button(competitionPath(ctx.comp) + '/competition/dates', 'Edit competition dates') + '</p></div>');
  }

  function setupMenu(ctx) {
    const b = competitionPath(ctx.comp);
    const n = R.navItem;
    return R.navSection('Setup') + n(b + '/competition/details', 'Competition', ctx, '', 0, { within: ctx.path.startsWith(b + '/competition/') }) + n(b + '/course', 'Course', ctx) + Q.classesOf(ctx.comp.id, true).map((cls) => n(links.cls(cls), e(cls.name) + (cls.deleted ? ' <span class="muted small">deleted</span>' : ''), ctx, '', 0, { within: ctx.path.startsWith(classPath(cls) + '/') })).join('') + n(links.newClass(ctx.comp), 'Add class', ctx);
  }
  function setupCard(ctx) {
    const comp = ctx.comp;
    const classes = Q.classesOf(comp.id);
    const steps = R.setupSteps(comp);
    const date = comp.dates[0] || KH.TODAY;
    function linkedCount(cls) {
      return Q.competitorsOf(comp.id, cls.id).filter((c) => Q.loggersOf(comp.id).some((l) => Q.linkOn(l, date)?.competitorId === c.id)).length;
    }
    if (steps.every((s) => s.done) && classes.every((cls) => Q.competitorsOf(comp.id, cls.id).length && linkedCount(cls) === Q.competitorsOf(comp.id, cls.id).length)) return '';
    function check(done) { return done ? ' <i class="mdi mdi-check r3-ok" title="Complete" aria-label="Complete"></i>' : ' · needed'; }
    return '<div class="wf-box"><h3>Setup by class</h3><div class="e-card-row"><b>Competition</b><a href="#' + competitionPath(comp) + '/competition/details">Details' + check(steps.filter((s) => ['details', 'airfield'].includes(s.key)).every((s) => s.done)) + '</a><a href="#' + competitionPath(comp) + '/competition/dates">' + comp.dates.length + ' dates</a><a href="#' + links.members(comp) + '">Members' + check(steps.find((s) => s.key === 'members').done) + '</a></div><div class="e-card-row"><b>Course</b><a href="#' + competitionPath(comp) + '/course">Turnpoints' + check(!!comp.turnpointFile) + ' · Airspace' + check(!!comp.airspaceFile) + '</a></div>' + classes.map((cls) => '<div class="e-card-row"><b>' + e(cls.name) + '</b><a href="#' + links.cls(cls) + '">Settings' + check(!!KH.EDITIONS[cls.edition]) + '</a><a href="#' + classPath(cls) + '/competitors">' + Q.competitorsOf(comp.id, cls.id).length + ' competitors</a><a href="#' + classPath(cls) + '/competitors">Loggers linked ' + linkedCount(cls) + '/' + Q.competitorsOf(comp.id, cls.id).length + '</a><a href="#' + classPath(cls) + '/days">Class days</a></div>').join('') + '<p class="muted small" style="margin-top:10px">Logger coverage is shown for ' + W.date(date, true) + '.</p>' + button(links.newClass(comp), 'Add class', !classes.length) + '</div>';
  }

  const setupRoutes = [
    { path: '/c/:comp/competition/details', title: 'Competition details', example: EX + '/competition/details', render: details },
    { path: '/c/:comp/competition/password', title: 'Upload password', example: EX + '/competition/password', render(ctx) { return competitionPage(ctx, 'password', '<div class="wf-box">' + W.uploadPassword(ctx.comp) + '</div>'); } },
    { path: '/c/:comp/competition/dates', title: 'Competition dates', example: EX + '/competition/dates', render(ctx) { return competitionPage(ctx, 'dates', '<div class="wf-box"><h3>Competition dates</h3>' + W.datesEditor(ctx.comp) + '</div><p style="margin-top:12px" class="muted small">Touch, cancel and mark practice days on each class’s Class days page.</p>'); } },
    { path: '/c/:comp/competition/members', title: 'Members and invitations', archived: true, example: EX + '/competition/members', render(ctx) { return ctx.comp.lifecycle === 'archived' ? page(ctx, 'Members and invitations', wrapTable(W.members(ctx.comp))) : competitionPage(ctx, 'members', wrapTable(W.members(ctx.comp))); } },
    { path: '/c/:comp/competition/loggers', title: 'All loggers', example: EX + '/competition/loggers', render: allLoggers },
    { path: '/c/:comp/course', title: 'Course', example: EX + '/course', render(ctx) { return page(ctx, 'Course', '<div class="wf-stack"><div class="wf-box"><h3>Turnpoint file</h3>' + W.turnpoints(ctx.comp) + '</div><div class="wf-box"><h3>Airspace file</h3>' + W.airspace(ctx.comp) + '</div></div>'); } },
    { path: '/c/:comp/class/new', title: 'Add class', example: EX + '/class/new', render(ctx) { return page(ctx, 'Add class', '<div class="wf-box">' + W.classForm(ctx.comp) + '</div>'); } },
    { path: '/c/:comp/class/:class/settings', title: 'Class settings', example: EX + '/class/club/settings', render: settings },
    { path: '/c/:comp/class/:class/competitors', title: 'Class competitors', example: EX + '/class/club/competitors', render: competitors },
    { path: '/c/:comp/class/:class/competitors/new', title: 'Add competitor', example: EX + '/class/club/competitors/new', render: competitorNew },
    { path: '/c/:comp/class/:class/competitors/:competitor', title: 'Competitor and loggers', example: EX + '/class/club/competitors/p1', render: competitor },
    { path: '/c/:comp/class/:class/days', title: 'Class days', example: EX + '/class/club/days', render: classDays },
  ];

  const handlers = {
    eSaveCompetitor(d, ds) {
      KH.handlers.saveCompetitor(d, ds);
      if (ds.competitor) KH.go(links.competitor(Q.competitor(ds.competitor)));
    },
    eCreateLogger(d, ds) {
      const c = Q.competitor(ds.competitor);
      const comp = Q.competition(c.competitionId);
      if (Q.loggersOf(comp.id).some((l) => l.manufacturer.toUpperCase() === d.manufacturer.toUpperCase() && l.serial.toUpperCase() === d.serial.toUpperCase())) throw new KH.Denied('This logger already exists. Use Link an existing logger.');
      const l = A.saveLogger(comp, d);
      KH.handlers.addLink({ competitorId: c.id, from: d.from, role: d.role }, { logger: l.id });
    },
    eLinkLogger(d, ds) { KH.handlers.addLink({ competitorId: ds.competitor, from: d.from, role: d.role }, { logger: d.loggerId }); },
    eTouch(ds) { A.touchClassDay(Q.class(ds.cls), ds.date); },
    ePractice(value, ds) { A.setPractice(A.touchClassDay(Q.class(ds.cls), ds.date), value); },
    eCancel(ds) {
      KH.confirm({ title: 'Cancel ' + Q.class(ds.cls).name + ' · ' + W.date(ds.date) + '?', intro: 'This changes the working status. Publish the class day to make it public.', confirmLabel: 'Cancel day', onConfirm() { KH.run(() => A.setDayStatus(A.touchClassDay(Q.class(ds.cls), ds.date), 'cancelled')); } });
    },
  };

  R.mount({ id: '4e', ownsMembers: true, setupRoutes, setupMenu, setupCard, links, handlers });
})();
