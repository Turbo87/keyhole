// PROTOTYPE: Round 4 prototype 4A, "Page per item". Every setup item has its own page in the flat menu, and the
// overview's setup card is a checklist that links to them. It is the round 3 setup split and the reference variant.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const S = KH.state;
  const R = KH.r4;
  const e = KH.esc;

  const C = (comp) => '/c/' + comp.slug;
  const EX = '/c/oberrhein-2026';
  const L = R.links;
  const empty = (ctx, title, msg) => R.page(ctx, title, '<div class="wf-empty">' + msg + '</div>');

  const links = {
    cls: (cls) => C(Q.competition(cls.competitionId)) + '/classes/' + cls.slug,
    competitors: (comp) => C(comp) + '/competitors',
    competitor: (c) => C(Q.competition(c.competitionId)) + '/competitors/' + c.id,
    logger: (l) => C(Q.competition(l.competitionId)) + '/loggers/' + l.id,
    newClass: (comp) => C(comp) + '/classes/new',
    newLogger: (comp) => C(comp) + '/loggers/new',
  };

  const back = (ctx, path, label) => [[C(ctx.comp) + path, label]];

  function details(ctx) {
    const comp = ctx.comp;
    return R.page(ctx, 'Details and upload password', '<div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"><div class="wf-box">' + W.competitionDetails(comp) + '</div><div class="wf-stack"><div class="wf-box">' + W.uploadPassword(comp) + '</div>' +
      '<div class="wf-box fill small"><b>Organiser terms</b><br>' + e(comp.terms.version) + ' accepted by ' + e(Q.user(comp.terms.userId).name) + ' on ' + W.dt(comp.terms.at) + ' for ' + e(comp.terms.organiser) + '</div></div></div>');
  }
  const dates = (ctx) => R.page(ctx, 'Dates and class days', '<div class="wf-stack"><div class="wf-box"><h3>Competition dates</h3>' + W.datesEditor(ctx.comp) + '</div><div><h3>Class days</h3>' + R.matrix(ctx.comp) + '</div></div>');

  function classes(ctx) {
    const list = Q.classesOf(ctx.comp.id, true);
    return R.page(ctx, 'Classes', '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Class</th><th>Rule set edition</th><th>Handicapped</th><th class="num">Competitors</th><th></th></tr></thead><tbody>' +
      (list.length ? list.map((c) => '<tr class="' + (c.deleted ? 'dim' : 'link') + '"' + (c.deleted ? '' : ' data-href="' + links.cls(c) + '"') + '><td><b>' + e(c.name) + '</b>' + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : '') + '</td><td>' + e(c.edition) + '</td><td>' + (c.handicapScale ? 'scale ' + c.handicapScale + ', ' + e(c.handicapList) : 'no') + '</td><td class="num">' + Q.competitorsOf(ctx.comp.id, c.id).length + '</td><td class="right nowrap">' +
        (c.deleted ? '<button class="wf-btn small" data-act="restoreClass" data-cls="' + c.id + '">Restore</button>' : '<a class="wf-btn small" href="#' + L.standings(c) + '">Standings</a>') + '</td></tr>').join('') : '<tr><td colspan="5" class="muted">No classes yet</td></tr>') +
      '</tbody></table></div>', '<a class="wf-btn primary" href="#' + links.newClass(ctx.comp) + '">Add class</a>');
  }
  const classNew = (ctx) => R.page(ctx, 'Add class', '<div class="wf-box">' + W.classForm(ctx.comp) + '</div>');
  const classSettings = (ctx) => (ctx.cls ? R.page(ctx, e(ctx.cls.name) + ' settings', '<div class="wf-box">' + W.classForm(ctx.comp, ctx.cls) + '</div>', '<a class="wf-btn small" href="#' + L.standings(ctx.cls) + '">Standings</a>') : empty(ctx, 'Not found', 'No such class'));

  function competitors(ctx) {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    const b = links.competitors(ctx.comp);
    return R.page(ctx, 'Competitors', '<div class="wf-stack"><div class="wf-row"><a class="wf-btn small' + (!cls ? ' primary' : '') + '" href="#' + b + '">All</a>' + Q.classesOf(ctx.comp.id).map((c) => '<a class="wf-btn small' + (cls === c ? ' primary' : '') + '" href="#' + b + '?class=' + c.slug + '">' + e(c.name) + ' ' + Q.competitorsOf(ctx.comp.id, c.id).length + '</a>').join('') + '</div><div class="wf-table-wrap">' + W.competitorsTable(ctx.comp, cls && cls.id) + '</div></div>',
      '<a class="wf-btn primary" href="#' + b + '/new' + (cls ? '?class=' + cls.slug : '') + '">Add competitor</a>');
  }
  function competitorNew(ctx) {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    return R.page(ctx, 'Add competitor', '<div class="wf-box">' + W.competitorForm(ctx.comp, null, cls && cls.id) + '</div>');
  }
  function competitor(ctx) {
    const c = ctx.competitor;
    if (!c || c.competitionId !== ctx.comp.id) return empty(ctx, 'Not found', 'No such competitor');
    const loggers = Q.loggersOf(ctx.comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
    const days = Q.classDaysOf(c.classId).filter(R.live);
    return R.page(ctx, e(c.cid) + ' · ' + e(Q.crewName(c)) + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : ''), '<div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))"><div class="wf-box">' + W.competitorForm(ctx.comp, c) + '</div><div class="wf-stack">' +
      '<div class="wf-box"><h3>Loggers</h3>' + (loggers.length ? '<table class="wf-table"><tbody>' + loggers.map((l) => '<tr><td><a href="#' + links.logger(l) + '">' + e(Q.loggerLabel(l)) + '</a></td><td>' + l.links.filter((k) => k.competitorId === c.id).map((k) => k.role + (k.from ? ' from ' + W.date(k.from) : '')).join(', ') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted small">No loggers linked</p>') + '<a class="wf-btn small" href="#' + links.newLogger(ctx.comp) + '">Add logger</a></div>' +
      '<div class="wf-box"><h3>Results</h3><table class="wf-table"><tbody>' + days.map((cd) => { const r = Q.resultFor(cd.id, c.id); return r ? '<tr class="link" data-href="' + L.result(r) + '"><td>' + e(Q.dayLabel(cd.classId, cd.date)) + '</td><td>' + W.resultStatus(r) + '</td><td>' + (R.isTodo(r) ? R.todoIcon(R.todoReasons(r).join(', ')) : '') + '</td></tr>' : ''; }).join('') + '</tbody></table></div>' +
      '<div class="wf-box">' + W.dsqPanel(c) + '</div></div></div>');
  }
  const loggers = (ctx) => R.page(ctx, 'Loggers', '<div class="wf-table-wrap">' + W.loggersTable(ctx.comp) + '</div>', '<a class="wf-btn primary" href="#' + links.newLogger(ctx.comp) + '">Add logger</a>');
  const loggerNew = (ctx) => R.page(ctx, 'Add logger', '<div class="wf-box">' + W.loggerForm(ctx.comp) + '</div>');
  function logger(ctx) {
    const l = ctx.logger;
    if (!l || l.competitionId !== ctx.comp.id) return empty(ctx, 'Not found', 'No such logger');
    const rows = S.files.filter((f) => f.loggerId === l.id).map((f) => ({ f, res: Q.resolve(f) }));
    return R.page(ctx, 'Logger ' + e(Q.loggerLabel(l)), '<div class="wf-stack"><div class="wf-box"><h3>Dated links</h3>' + W.loggerLinks(l) + '</div><div class="wf-box"><h3>Thresholds</h3>' + W.loggerForm(ctx.comp, l) + '</div><div class="wf-box"><h3>Files</h3><div class="wf-table-wrap">' + W.filesTable(rows) + '</div></div></div>');
  }

  const setupRoutes = [
    { path: '/c/:comp/details', title: 'Details and upload password', example: EX + '/details', render: details },
    { path: '/c/:comp/dates', title: 'Dates and class days', example: EX + '/dates', render: dates },
    { path: '/c/:comp/classes', title: 'Classes', example: EX + '/classes', render: classes },
    { path: '/c/:comp/classes/new', title: 'Add class', example: EX + '/classes/new', render: classNew, crumbs: (ctx) => back(ctx, '/classes', 'Classes') },
    { path: '/c/:comp/classes/:class', title: 'Class settings', example: EX + '/classes/club', render: classSettings, crumbs: (ctx) => back(ctx, '/classes', 'Classes') },
    { path: '/c/:comp/turnpoints', title: 'Turnpoint file', example: EX + '/turnpoints', render: (ctx) => R.page(ctx, 'Turnpoint file', W.turnpoints(ctx.comp)) },
    { path: '/c/:comp/airspace', title: 'Airspace file', example: EX + '/airspace', render: (ctx) => R.page(ctx, 'Airspace file', W.airspace(ctx.comp)) },
    { path: '/c/:comp/competitors', title: 'Competitors', example: EX + '/competitors', render: competitors },
    { path: '/c/:comp/competitors/new', title: 'Add competitor', example: EX + '/competitors/new', render: competitorNew, crumbs: (ctx) => back(ctx, '/competitors', 'Competitors') },
    { path: '/c/:comp/competitors/:competitor', title: 'Competitor', example: EX + '/competitors/p1', render: competitor, crumbs: (ctx) => back(ctx, '/competitors', 'Competitors') },
    { path: '/c/:comp/loggers', title: 'Loggers', example: EX + '/loggers', render: loggers },
    { path: '/c/:comp/loggers/new', title: 'Add logger', example: EX + '/loggers/new', render: loggerNew, crumbs: (ctx) => back(ctx, '/loggers', 'Loggers') },
    { path: '/c/:comp/loggers/:logger', title: 'Logger and links', example: EX + '/loggers/lx1', render: logger, crumbs: (ctx) => back(ctx, '/loggers', 'Loggers') },
  ];

  function setupMenu(ctx) {
    const comp = ctx.comp;
    const b = C(comp);
    const p = ctx.path;
    const n = R.navItem;
    return R.navSection('Setup') + n(b + '/details', 'Details and password', ctx) + n(b + '/dates', 'Dates and class days', ctx) +
      n(b + '/classes', 'Classes', ctx, String(Q.classesOf(comp.id).length), 0, { within: p.startsWith(b + '/classes/') }) +
      n(b + '/turnpoints', 'Turnpoints', ctx, comp.turnpointFile ? '' : '—') + n(b + '/airspace', 'Airspace', ctx, comp.airspaceFile ? '' : '—') +
      n(b + '/competitors', 'Competitors', ctx, String(Q.competitorsOf(comp.id).length), 0, { within: p.startsWith(b + '/competitors/') }) +
      n(b + '/loggers', 'Loggers', ctx, String(Q.loggersOf(comp.id).length), 0, { within: p.startsWith(b + '/loggers/') });
  }

  const TARGET = { details: '/details', airfield: '/details', classes: '/classes', turnpoints: '/turnpoints', airspace: '/airspace', competitors: '/competitors', loggers: '/loggers', members: '/members' };
  function setupCard(ctx) {
    const comp = ctx.comp;
    const steps = R.setupSteps(comp);
    if (steps.every((s) => s.done)) return '';
    const target = (s) => (s.key === 'classes' && !Q.classesOf(comp.id).length ? links.newClass(comp) : C(comp) + TARGET[s.key]);
    return '<div class="wf-box"><h3>Setup</h3><div class="wf-steps">' + steps.map((s) => '<a class="' + (s.done ? 'done' : 'todo') + '" href="#' + target(s) + '">' + (s.done ? '✓ ' : '') + e(s.label) + '</a>').join('') + '</div>' +
      (comp.createdAt > '2026-07-28' ? '<p class="muted small" style="margin-top:8px">Created ' + W.dt(comp.createdAt) + '. Pilots can already upload test files with the competition password.</p>' : '') + '</div>';
  }

  R.mount({ id: '4a', setupRoutes, setupMenu, setupCard, links });
})();
