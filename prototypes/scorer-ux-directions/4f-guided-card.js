// PROTOTYPE: Round 4 prototype 4F, "Guided card". Setup pages are one per item as in 4A, but the overview's setup
// card does the light work itself: small steps have an inline form in the card, bigger ones show counts and a link.
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

  const TARGET = { details: '/details', airfield: '/details', dates: '/dates', password: '/details', classes: '/classes', turnpoints: '/turnpoints', airspace: '/airspace', competitors: '/competitors', loggers: '/loggers', members: '/members' };
  const WF = W.field;
  const WI = W.input;
  const WS = W.select;

  // One card row: state icon, label with its state, the inline form when the role may do the step here, and a link.
  function item(comp, key, label, done, state, act) {
    const href = key === 'classes' && !Q.classesOf(comp.id, true).length ? links.newClass(comp) : C(comp) + TARGET[key];
    return '<div class="f4-item' + (done ? ' done' : '') + '"><span class="mdi ' + (done ? 'mdi-check-circle' : 'mdi-circle-outline') + '" title="' + (done ? 'done' : 'open') + '"></span>' +
      '<div><b>' + e(label) + '</b><div class="f4-state">' + state + '</div></div><div class="f4-act">' + (act || '') + '</div>' +
      '<a class="f4-link small nowrap" href="#' + href + '">Open page →</a></div>';
  }
  function datesItem(comp) {
    const first = comp.dates[0];
    const last = comp.dates[comp.dates.length - 1];
    const state = comp.dates.length ? W.date(first, true) + ' – ' + W.date(last, true) + ' · ' + comp.dates.length + ' dates' : 'No dates';
    const form = Q.can('admin-fields', comp) ? '<form data-submit="extendDates" data-comp="' + comp.id + '">' + WI('first', first, 'type="date" aria-label="First date"') + WI('last', last, 'type="date" aria-label="Last date"') + '<button class="wf-btn small">Set range</button></form>' : '<span class="muted small">Admins change the dates</span>';
    return item(comp, 'dates', 'Competition dates', comp.dates.length > 0, state, form);
  }
  function passwordItem(comp) {
    return item(comp, 'password', 'Upload password', true, 'Pilots can upload test flights with it now',
      '<code style="font-size:15px;letter-spacing:.1em">' + e(comp.uploadPassword || '—') + '</code><button class="wf-btn small" data-act="regeneratePassword" data-comp="' + comp.id + '">Regenerate</button>');
  }
  function classesItem(comp) {
    const list = Q.classesOf(comp.id);
    const edition = (KH.ui.f4Class && KH.ui.f4Class.edition) || 'DAeC SWO 2026';
    const ed = KH.EDITIONS[edition];
    const tmpl = KH.ui.f4Class && ed.templates[KH.ui.f4Class.template] ? KH.ui.f4Class.template : Object.keys(ed.templates)[0];
    const form = '<form data-submit="f4AddClass" data-comp="' + comp.id + '">' + WS('edition', Object.keys(KH.EDITIONS), edition, 'data-change="f4ClassDraft" data-key="edition" aria-label="Rule set edition"') +
      WS('template', Object.keys(ed.templates), tmpl, 'data-change="f4ClassDraft" data-key="template" aria-label="Class template"') + '<button class="wf-btn small' + (list.length ? '' : ' primary') + '">Add class</button></form>';
    const state = list.length ? list.map((c) => '<a href="#' + links.cls(c) + '">' + e(c.name) + '</a>').join(', ') + ' · rule overrides on the class page' : 'No classes yet. Add one from a template, then fine-tune it on its page.';
    return item(comp, 'classes', 'Classes', list.length > 0, state, form);
  }
  function fileItem(comp, key, label, f, count, act) {
    return item(comp, key, label, !!f, f ? e(f.name) + ' · ' + count : 'No file yet', '<button class="wf-btn small' + (f ? '' : ' primary') + '" data-act="' + act + '" data-comp="' + comp.id + '">' + (f ? 'Replace…' : 'Upload…') + '</button>');
  }
  function competitorsItem(comp) {
    const classes = Q.classesOf(comp.id);
    const n = Q.competitorsOf(comp.id).length;
    const per = classes.map((c) => e(c.name) + ' ' + Q.competitorsOf(comp.id, c.id).length).join(' · ');
    return item(comp, 'competitors', 'Competitors', n > 0, n ? n + ' entered' + (classes.length > 1 ? ': ' + per : '') : classes.length ? 'None yet' : 'Add a class first',
      classes.length ? '<a class="wf-btn small" href="#' + links.competitors(comp) + '/new">Add competitor</a>' : '');
  }
  function loggersItem(comp) {
    const all = Q.loggersOf(comp.id);
    const linked = Q.competitorsOf(comp.id).filter((c) => all.some((l) => l.links.some((k) => k.competitorId === c.id))).length;
    const total = Q.competitorsOf(comp.id).length;
    return item(comp, 'loggers', 'Loggers', all.some((l) => l.links.length), all.length ? all.length + ' loggers · competitors with a logger ' + linked + '/' + total : 'None yet', '<a class="wf-btn small" href="#' + links.newLogger(comp) + '">Add logger</a>');
  }
  function membersItem(comp) {
    const members = Q.membersOf(comp.id);
    const pending = S.invitations.filter((i) => i.competitionId === comp.id).length + S.competitionInvitations.filter((i) => i.competitionId === comp.id).length;
    const form = Q.can('members', comp) ? '<form data-submit="invite" data-comp="' + comp.id + '">' + WI('email', '', 'type="email" required placeholder="scorer@example.org" aria-label="Email"') + WS('role', ['scorer', 'admin']) + '<button class="wf-btn small">Invite</button></form>' : '<span class="muted small">Admins invite members</span>';
    return item(comp, 'members', 'Scorers and admins', members.length > 1, members.length + ' member' + (members.length === 1 ? '' : 's') + (pending ? ' · ' + pending + ' invitation' + (pending === 1 ? '' : 's') + ' pending' : ''), form);
  }

  function setupCard(ctx) {
    const comp = ctx.comp;
    if (comp.lifecycle === 'archived') return '';
    const steps = R.setupSteps(comp);
    const done = (k) => steps.find((s) => s.key === k).done;
    const complete = steps.every((s) => s.done);
    const open = ctx.query.setup === 'open';
    const overview = C(comp);
    if (complete && !open) return '<div class="wf-box f4-card"><div class="f4-bar"><span><span class="mdi mdi-check-circle"></span> <b>Setup complete</b> <span class="muted small">Every setup item is done. Changes stay possible on the setup pages.</span></span><a class="wf-btn small" href="#' + overview + '?setup=open">Show setup</a></div></div>';
    const rows = [
      item(comp, 'details', 'Competition details', true, e(comp.organiser) + ' · ' + e(comp.location)),
      item(comp, 'airfield', 'Airfield', done('airfield'), comp.airfield ? comp.airfield.lat + ', ' + comp.airfield.lon + ', ' + comp.airfield.elev + ' m' : 'Needed before flights can be analysed'),
      datesItem(comp), passwordItem(comp), classesItem(comp),
      fileItem(comp, 'turnpoints', 'Turnpoint file', comp.turnpointFile, comp.turnpointFile ? comp.turnpointFile.turnpoints.length + ' turnpoints' : '', 'uploadTurnpoints'),
      fileItem(comp, 'airspace', 'Airspace file', comp.airspaceFile, comp.airspaceFile ? comp.airspaceFile.airspaces.length + ' airspaces, ' + comp.openedAirspaceNames.length + ' opened' : '', 'uploadAirspace'),
      competitorsItem(comp), loggersItem(comp), membersItem(comp),
    ];
    const todo = rows.filter((r) => !r.includes('f4-item done')).length;
    return '<div class="wf-box f4-card"><div class="f4-head"><h3>Setup <span class="muted small" style="font-weight:400">' + (todo ? todo + ' of ' + rows.length + ' open' : 'complete') + '</span></h3>' +
      (complete ? '<a class="wf-btn small" href="#' + overview + '">Hide</a>' : '') + '</div>' + rows.join('') +
      (comp.createdAt > '2026-07-28' ? '<p class="muted small" style="margin:0;padding:8px 14px">Created ' + W.dt(comp.createdAt) + '. Pilots can already upload test files with the competition password.</p>' : '') + '</div>';
  }

  const handlers = {
    f4ClassDraft: (v, ds) => {
      KH.ui.f4Class = { ...(KH.ui.f4Class || {}), [ds.key]: v };
    },
    // Adds a class with the template's values and stays on the overview. Fine-tuning happens on the class page.
    f4AddClass: (d, ds) => {
      const comp = Q.competition(ds.comp);
      const taken = Q.classesOf(comp.id, true).map((c) => c.name);
      let name = d.template;
      for (let i = 2; taken.includes(name); i++) name = d.template + ' ' + i;
      const cls = KH.act.createClass(comp, { edition: d.edition, template: d.template, name });
      KH.ui.f4Class = null;
      KH.toast('Added class ' + cls.name + ' from the ' + d.template + ' template');
    },
  };

  R.mount({ id: '4f', setupRoutes, setupMenu, setupCard, links, handlers });
})();
