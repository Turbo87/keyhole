// PROTOTYPE: Round 4 prototype 4D, "Competitor first". Entrants are set up on the competitor: its page adds loggers
// by manufacturer and serial, links them with a role and a date, and edits their thresholds. The loggers page is an
// overview with the logger-only edits.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const A = KH.act;
  const S = KH.state;
  const R = KH.r4;
  const H = KH.handlers;
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
    newLogger: (comp) => C(comp) + '/loggers?add=1',
  };
  const back = (ctx, path, label) => [[C(ctx.comp) + path, label]];

  const loggersOfCompetitor = (c) => Q.loggersOf(c.competitionId).filter((l) => l.links.some((k) => k.competitorId === c.id));
  const hasPrimary = (c) => loggersOfCompetitor(c).some((l) => l.links.some((k) => k.competitorId === c.id && k.role === 'primary'));
  const withoutPrimary = (comp) => Q.competitorsOf(comp.id).filter((c) => !hasPrimary(c));
  const currentLink = (l) => Q.linkOn(l, KH.TODAY) || l.links.slice().sort((a, b) => (a.from || '').localeCompare(b.from || '')).pop() || null;

  // ---------- pages shared with 4A ----------

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

  // ---------- competitors ----------

  function competitors(ctx) {
    const comp = ctx.comp;
    const cls = ctx.query.class ? Q.classBySlug(comp.id, ctx.query.class) : null;
    const open = ctx.query.show === 'nologger';
    const b = links.competitors(comp);
    const q = (patch) => {
      const p = { class: cls ? cls.slug : '', show: open ? 'nologger' : '', ...patch };
      const qs = Object.keys(p).filter((k) => p[k]).map((k) => k + '=' + p[k]).join('&');
      return b + (qs ? '?' + qs : '');
    };
    const missing = withoutPrimary(comp).length;
    let list = Q.competitorsOf(comp.id, cls && cls.id, true);
    if (open) list = list.filter((c) => !c.deleted && !hasPrimary(c));
    const rows = list.map((c) => {
      const lgs = loggersOfCompetitor(c);
      const primary = !c.deleted && hasPrimary(c);
      return '<tr class="link' + (c.deleted ? ' dim' : !primary ? ' d4-open' : '') + '" data-href="' + links.competitor(c) + '"><td><b>' + e(c.cid) + '</b></td>' + (cls ? '' : '<td>' + e(Q.class(c.classId).name) + '</td>') + '<td>' + e(Q.crewName(c)) + '</td><td>' + e(c.gliderType) + '</td><td>' +
        (lgs.length ? lgs.map((l) => { const k = Q.linkOn(l, KH.TODAY); return e(Q.loggerLabel(l)) + ' <span class="muted small">' + (k && k.competitorId === c.id ? k.role : 'not current') + '</span>'; }).join('<br>') : '') +
        (c.deleted ? '' : !primary ? ' <a class="wf-btn small" href="#' + links.competitor(c) + '?add=logger">Add primary logger</a>' : '') + '</td><td>' + [c.hc ? 'HC' : '', c.dsq ? 'DSQ' : '', c.deleted ? 'deleted' : '', c.pureGlider ? '' : 'engine'].filter(Boolean).map((x) => '<span class="wf-badge">' + x + '</span>').join(' ') + '</td></tr>';
    }).join('');
    return R.page(ctx, 'Competitors', '<div class="wf-stack"><div class="wf-row"><a class="wf-btn small' + (!cls ? ' primary' : '') + '" href="#' + q({ class: '' }) + '">All</a>' +
      Q.classesOf(comp.id).map((c) => '<a class="wf-btn small' + (cls === c ? ' primary' : '') + '" href="#' + q({ class: c.slug }) + '">' + e(c.name) + ' ' + Q.competitorsOf(comp.id, c.id).length + '</a>').join('') +
      '<span class="grow"></span><a class="wf-btn small' + (open ? ' primary' : '') + '" href="#' + q({ show: open ? '' : 'nologger' }) + '">Without primary logger ' + missing + '</a></div>' +
      '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>CID</th>' + (cls ? '' : '<th>Class</th>') + '<th>Crew</th><th>Glider</th><th>Loggers</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6" class="muted">' + (open ? 'Every competitor has a primary logger.' : 'No competitors yet') + '</td></tr>') + '</tbody></table></div></div>',
      '<a class="wf-btn primary" href="#' + b + '/new' + (cls ? '?class=' + cls.slug : '') + '">Add competitor</a>');
  }

  // The new-competitor form is the shared form plus the first logger, and can continue with the next competitor.
  function loggerFields(prefix, role) {
    return '<div class="d4-add"><h4 style="margin-top:0">Logger</h4><div class="wf-form">' +
      W.field('Manufacturer', W.input(prefix + 'manufacturer', '', 'maxlength="3" class="narrow" placeholder="LXV"')) +
      W.field('Serial', W.input(prefix + 'serial', '', 'class="mid"'), { hint: 'An existing logger of the competition gets linked' }) +
      W.field('Role', W.select(prefix + 'role', ['primary', 'secondary'], role || 'primary')) +
      W.field('Valid from', W.input(prefix + 'from', '', 'type="date"'), { hint: 'Empty: from the start' }) +
      '</div></div>';
  }
  function competitorNew(ctx) {
    const comp = ctx.comp;
    const cls = ctx.query.class ? Q.classBySlug(comp.id, ctx.query.class) : null;
    const after = ctx.query.after ? Q.competitor(ctx.query.after) : null;
    let form = W.competitorForm(comp, null, cls && cls.id);
    if (form.includes('data-submit="saveCompetitor"')) {
      form = form.replace('data-submit="saveCompetitor"', 'data-submit="d4SaveNew"').replace(
        '<div class="wf-row"><button class="wf-btn primary">Add competitor</button>',
        loggerFields('lg') + '<input type="hidden" name="next" value=""><div class="wf-row"><button class="wf-btn primary" onclick="this.form.next.value=\'\'">Add competitor</button><button class="wf-btn" onclick="this.form.next.value=\'1\'">Add and add next</button>'
      );
    }
    return R.page(ctx, 'Add competitor', '<div class="wf-stack">' + (after ? '<div class="wf-note">Added <a href="#' + links.competitor(after) + '">' + e(after.cid) + ' ' + e(Q.crewName(after)) + '</a>' + (hasPrimary(after) ? ' with ' + e(loggersOfCompetitor(after).map(Q.loggerLabel).join(', ')) : ', without a logger') + '. Next competitor in ' + e(Q.class(after.classId).name) + ':</div>' : '') +
      '<div class="wf-box d4-scroll">' + form + '</div></div>');
  }
  // Finds the logger by manufacturer and serial, or creates it, then links it to the competitor.
  function linkLogger(comp, c, d, prefix, defer) {
    const serial = (d[prefix + 'serial'] || '').trim();
    if (!serial) return null;
    const manufacturer = (d[prefix + 'manufacturer'] || '').trim().toUpperCase();
    if (!manufacturer) throw new KH.Denied('Enter the logger manufacturer, e.g. LXV');
    let l = Q.loggersOf(comp.id).find((x) => x.manufacturer === manufacturer && x.serial === serial);
    const created = !l;
    if (!l) l = A.saveLogger(comp, { manufacturer, serial }, null);
    const link = { competitorId: c.id, from: d[prefix + 'from'] || '', role: d[prefix + 'role'] || 'primary' };
    const add = () => H.addLink(link, { logger: l.id });
    // Linking a logger that already has files asks to confirm the moves. That dialog must open after any navigation.
    const moves = Q.previewLinkMove(l, link).length;
    if (!moves || !defer) add();
    else setTimeout(() => KH.run(add), 60);
    return { l, created, moves };
  }
  function crewOf(d) {
    const crew = [];
    for (let i = 0; i < 6; i++) if (d['crew' + i + 'first'] || d['crew' + i + 'last']) crew.push({ first: d['crew' + i + 'first'], last: d['crew' + i + 'last'], club: d['crew' + i + 'club'], country: d['crew' + i + 'country'], igcId: d['crew' + i + 'igcId'] });
    if (!crew.length) throw new KH.Denied('A competitor needs at least one crew member');
    return crew;
  }

  function competitor(ctx) {
    const c = ctx.competitor;
    const comp = ctx.comp;
    if (!c || c.competitionId !== comp.id) return empty(ctx, 'Not found', 'No such competitor');
    const lgs = loggersOfCompetitor(c);
    const days = Q.classDaysOf(c.classId).filter(R.live);
    const loggerBox = lgs.map((l) => {
      const files = S.files.filter((f) => f.loggerId === l.id && !f.deleted).length;
      const hist = l.links.slice().sort((a, b) => (a.from || '').localeCompare(b.from || '')).map((k) => {
        const idx = l.links.indexOf(k);
        const o = Q.competitor(k.competitorId);
        const mine = o === c;
        return '<tr' + (mine ? '' : ' class="dim"') + '><td>' + (k.from ? W.date(k.from, true) : 'start') + '</td><td>' + (mine ? '<b>' + e(o.cid) + '</b>' : '<a href="#' + links.competitor(o) + '">' + e(o.cid) + '</a> ' + e(Q.crewName(o))) + '</td><td>' +
          (mine ? W.select('role', ['primary', 'secondary'], k.role, 'data-change="setLinkRole" data-logger="' + l.id + '" data-idx="' + idx + '"') : k.role) + '</td><td class="right">' + (mine ? '<button class="wf-btn small" data-act="removeLink" data-logger="' + l.id + '" data-idx="' + idx + '">Remove</button>' : '') + '</td></tr>';
      }).join('');
      return '<div class="d4-lg"><div class="wf-row between"><b>' + e(Q.loggerLabel(l)) + '</b><span class="muted small">' + files + ' file' + (files === 1 ? '' : 's') + ' · <a href="#' + links.logger(l) + '">logger page</a></span></div>' +
        '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>From</th><th>Competitor</th><th>Role</th><th></th></tr></thead><tbody>' + hist + '</tbody></table></div>' +
        '<form class="d4-thr" data-submit="saveLogger" data-comp="' + comp.id + '" data-logger="' + l.id + '">' +
        [['enl', 'ENL'], ['mop', 'MOP'], ['cur', 'Current (A)'], ['minDuration', 'Min. duration (s)']].map(([k, label]) => '<label>' + label + W.input(k, l[k]) + '</label>').join('') +
        '<button class="wf-btn small">Save thresholds</button><span class="muted small">Changes mark this logger\'s files stale.</span></form></div>';
    }).join('');
    const addOpen = ctx.query.add === 'logger' || !lgs.length;
    const addForm = c.deleted ? '' : '<details id="add-logger"' + (addOpen ? ' open' : '') + ' style="margin-top:10px"><summary>Add a logger</summary><form class="wf-stack" data-submit="d4AddLogger" data-competitor="' + c.id + '" style="margin-top:8px">' +
      loggerFields('lg', hasPrimary(c) ? 'secondary' : 'primary') +
      '<div class="wf-row"><button class="wf-btn primary small">Add logger</button>' + (hasPrimary(c) ? '<span class="muted small">A new primary turns the current primary into a secondary from the same date.</span>' : '') + '</div></form></details>';
    const status = c.deleted ? '' : hasPrimary(c) ? '' : '<div class="wf-note warn">No primary logger. Files from this competitor\'s loggers can\'t be resolved until one is linked.</div>';
    return R.page(ctx, e(c.cid) + ' · ' + e(Q.crewName(c)) + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : ''),
      '<div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))"><div class="wf-box d4-scroll">' + W.competitorForm(comp, c) + '</div><div class="wf-stack">' +
      '<div class="wf-box"><h3>Loggers</h3>' + status + (loggerBox || '<p class="muted small">No loggers linked yet.</p>') + addForm + '</div>' +
      '<div class="wf-box"><h3>Results</h3>' + (days.length ? '<table class="wf-table"><tbody>' + days.map((cd) => { const r = Q.resultFor(cd.id, c.id); return '<tr class="link" data-href="' + L.result(r) + '"><td>' + e(Q.dayLabel(cd.classId, cd.date)) + '</td><td>' + W.resultStatus(r) + '</td><td>' + (R.isTodo(r) ? R.todoIcon(R.todoReasons(r).join(', ')) : '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted small">No class days yet</p>') + '</div>' +
      '<div class="wf-box">' + W.dsqPanel(c) + '</div></div></div>',
      '<a class="wf-btn" href="#' + links.competitors(comp) + '/new?class=' + Q.class(c.classId).slug + '">Add another in ' + e(Q.class(c.classId).name) + '</a>');
  }

  // ---------- loggers overview ----------

  function loggers(ctx) {
    const comp = ctx.comp;
    const only = ctx.query.show === 'unlinked';
    let list = Q.loggersOf(comp.id).map((l) => ({ l, k: currentLink(l) }));
    const unlinked = list.filter((x) => !x.k).length;
    list.sort((a, b) => (!!a.k - !!b.k) || Q.loggerLabel(a.l).localeCompare(Q.loggerLabel(b.l)));
    if (only) list = list.filter((x) => !x.k);
    const b = C(comp) + '/loggers';
    const rows = list.map(({ l, k }) => {
      const o = k && Q.competitor(k.competitorId);
      return '<tr class="link' + (k ? '' : ' d4-open') + '" data-href="' + links.logger(l) + '"><td><b>' + e(Q.loggerLabel(l)) + '</b></td><td>' + (o ? '<a href="#' + links.competitor(o) + '">' + e(o.cid) + '</a> ' + e(Q.crewName(o)) + ' <span class="muted small">' + e(Q.class(o.classId).name) + '</span>' : '<span class="wf-badge dashed">no link</span>') + '</td><td>' + (k ? k.role + (k.from ? ' from ' + W.date(k.from) : '') : '') + (l.links.length > 1 ? ' <span class="muted small">' + l.links.length + ' links</span>' : '') + '</td><td class="num">' + S.files.filter((f) => f.loggerId === l.id && !f.deleted).length + '</td><td class="small muted">ENL ' + l.enl + ', MOP ' + l.mop + ', CUR ' + l.cur + ' A, ' + l.minDuration + ' s</td></tr>';
    }).join('');
    const add = ctx.query.add ? '<div class="wf-box"><h3>Add a logger without a competitor</h3><p class="muted small">Usually you add loggers on the competitor. Use this for spare loggers, then link them on the logger page.</p>' + W.loggerForm(comp) + '</div>' : '';
    return R.page(ctx, 'Loggers', '<div class="wf-stack">' + add + '<p class="muted small" style="margin:0">Loggers are added and linked on each competitor. This page lists them all, with thresholds and links that move between competitors.</p>' +
      '<div class="wf-row"><a class="wf-btn small' + (!only ? ' primary' : '') + '" href="#' + b + '">All ' + Q.loggersOf(comp.id).length + '</a><a class="wf-btn small' + (only ? ' primary' : '') + '" href="#' + b + '?show=unlinked">Without link ' + unlinked + '</a></div>' +
      '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Logger</th><th>Current competitor</th><th>Link</th><th class="num">Files</th><th>Thresholds</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" class="muted">' + (only ? 'Every logger is linked.' : 'No loggers yet. Add them on a competitor.') + '</td></tr>') + '</tbody></table></div></div>',
      ctx.query.add ? '' : '<a class="wf-btn" href="#' + links.newLogger(comp) + '">Add spare logger</a>');
  }
  function logger(ctx) {
    const l = ctx.logger;
    if (!l || l.competitionId !== ctx.comp.id) return empty(ctx, 'Not found', 'No such logger');
    const rows = S.files.filter((f) => f.loggerId === l.id).map((f) => ({ f, res: Q.resolve(f) }));
    return R.page(ctx, 'Logger ' + e(Q.loggerLabel(l)), '<div class="wf-stack"><div class="wf-box"><h3>Dated links</h3><p class="muted small">Move the logger to another competitor by adding a link from the date it changes hands.</p>' + W.loggerLinks(l) + '</div><div class="wf-box"><h3>Thresholds</h3>' + W.loggerForm(ctx.comp, l) + '</div><div class="wf-box"><h3>Files</h3><div class="wf-table-wrap">' + W.filesTable(rows) + '</div></div></div>');
  }

  // ---------- handlers ----------

  const handlers = {
    d4SaveNew(d, ds) {
      const comp = Q.competition(ds.comp);
      const c = A.saveCompetitor(comp, { ...d, crew: crewOf(d) }, null);
      const lg = linkLogger(comp, c, d, 'lg', true);
      KH.toast('Added ' + c.cid + (lg ? ' with ' + (lg.created ? 'new logger ' : 'logger ') + Q.loggerLabel(lg.l) : ''));
      KH.go(d.next ? links.competitors(comp) + '/new?class=' + Q.class(c.classId).slug + '&after=' + c.id : links.competitor(c) + (lg ? '' : '?add=logger'));
    },
    d4AddLogger(d, ds) {
      const c = Q.competitor(ds.competitor);
      const comp = Q.competition(c.competitionId);
      if (!(d.lgserial || '').trim()) throw new KH.Denied('Enter the logger serial');
      const lg = linkLogger(comp, c, d, 'lg', false);
      if (!lg.moves) KH.toast((lg.created ? 'Added and linked ' : 'Linked ') + Q.loggerLabel(lg.l));
    },
  };

  // ---------- routes, menu, card ----------

  const setupRoutes = [
    { path: '/c/:comp/details', title: 'Details and upload password', example: EX + '/details', render: details },
    { path: '/c/:comp/dates', title: 'Dates and class days', example: EX + '/dates', render: dates },
    { path: '/c/:comp/classes', title: 'Classes', example: EX + '/classes', render: classes },
    { path: '/c/:comp/classes/new', title: 'Add class', example: EX + '/classes/new', render: classNew, crumbs: (ctx) => back(ctx, '/classes', 'Classes') },
    { path: '/c/:comp/classes/:class', title: 'Class settings', example: EX + '/classes/club', render: classSettings, crumbs: (ctx) => back(ctx, '/classes', 'Classes') },
    { path: '/c/:comp/turnpoints', title: 'Turnpoint file', example: EX + '/turnpoints', render: (ctx) => R.page(ctx, 'Turnpoint file', W.turnpoints(ctx.comp)) },
    { path: '/c/:comp/airspace', title: 'Airspace file', example: EX + '/airspace', render: (ctx) => R.page(ctx, 'Airspace file', W.airspace(ctx.comp)) },
    { path: '/c/:comp/competitors', title: 'Competitors (?show=nologger)', example: EX + '/competitors', render: competitors },
    { path: '/c/:comp/competitors/new', title: 'Add competitor with logger (?class, ?after)', example: EX + '/competitors/new?class=club', render: competitorNew, crumbs: (ctx) => back(ctx, '/competitors', 'Competitors') },
    { path: '/c/:comp/competitors/:competitor', title: 'Competitor with loggers (?add=logger)', example: EX + '/competitors/p1', render: competitor, crumbs: (ctx) => back(ctx, '/competitors', 'Competitors') },
    { path: '/c/:comp/loggers', title: 'Logger overview (?show=unlinked, ?add=1)', example: EX + '/loggers', render: loggers },
    { path: '/c/:comp/loggers/:logger', title: 'Logger links and thresholds', example: EX + '/loggers/lx1', render: logger, crumbs: (ctx) => back(ctx, '/loggers', 'Loggers') },
  ];

  function setupMenu(ctx) {
    const comp = ctx.comp;
    const b = C(comp);
    const p = ctx.path;
    const n = R.navItem;
    const missing = Q.competitorsOf(comp.id).length ? withoutPrimary(comp).length : 0;
    return R.navSection('Setup') + n(b + '/details', 'Details and password', ctx) + n(b + '/dates', 'Dates and class days', ctx) +
      n(b + '/classes', 'Classes', ctx, String(Q.classesOf(comp.id).length), 0, { within: p.startsWith(b + '/classes/') }) +
      n(b + '/turnpoints', 'Turnpoints', ctx, comp.turnpointFile ? '' : '—') + n(b + '/airspace', 'Airspace', ctx, comp.airspaceFile ? '' : '—') +
      n(b + '/competitors', 'Competitors', ctx, (missing ? R.todoIcon(missing + ' without a primary logger') + ' ' : '') + Q.competitorsOf(comp.id).length, 0, { within: p.startsWith(b + '/competitors/') }) +
      n(b + '/loggers', 'Loggers', ctx, String(Q.loggersOf(comp.id).length), 1, { within: p.startsWith(b + '/loggers/') });
  }

  const TARGET = { details: '/details', airfield: '/details', classes: '/classes', turnpoints: '/turnpoints', airspace: '/airspace', competitors: '/competitors', members: '/members' };
  function setupCard(ctx) {
    const comp = ctx.comp;
    const count = Q.competitorsOf(comp.id).length;
    const missing = withoutPrimary(comp).length;
    const steps = R.setupSteps(comp).filter((s) => s.key !== 'loggers');
    const items = steps.map((s) => ({ ...s, href: s.key === 'classes' && !Q.classesOf(comp.id).length ? links.newClass(comp) : s.key === 'competitors' && !count ? links.competitors(comp) + '/new' : C(comp) + TARGET[s.key] }));
    items.splice(items.findIndex((s) => s.key === 'competitors') + 1, 0, {
      key: 'primary', done: count > 0 && !missing, href: links.competitors(comp) + '?show=nologger',
      label: !count ? 'Primary loggers' : missing ? missing + ' competitor' + (missing === 1 ? '' : 's') + ' without a primary logger' : 'Every competitor has a primary logger',
    });
    if (items.every((s) => s.done)) return '';
    return '<div class="wf-box"><h3>Setup</h3><div class="wf-steps">' + items.map((s) => '<a class="' + (s.done ? 'done' : 'todo') + '" href="#' + s.href + '">' + (s.done ? '✓ ' : '') + e(s.label) + '</a>').join('') + '</div>' +
      (comp.createdAt > '2026-07-28' ? '<p class="muted small" style="margin-top:8px">Created ' + W.dt(comp.createdAt) + '. Pilots can already upload test files with the competition password. Add each competitor with their logger.</p>' : '') + '</div>';
  }

  R.mount({ id: '4d', setupRoutes, setupMenu, setupCard, links, handlers });
})();
