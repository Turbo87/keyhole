// PROTOTYPE: Direction D, "Overview grid". Dense matrices are the navigation and a detail panel under them edits the selected cell.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const S = KH.state;
  const e = KH.esc;

  const C = (comp) => '/c/' + comp.slug;
  const compOf = (cls) => Q.competition(cls.competitionId);
  const CELL = (cls, date) => C(compOf(cls)) + '/matrix/' + date + '/' + cls.slug;
  const CD = (cd) => CELL(Q.class(cd.classId), cd.date);
  const COL = (cls, date) => C(compOf(cls)) + '/class/' + cls.slug + '/' + date;
  const LIVE = (cd) => cd && !['unplanned', 'cancelled'].includes(cd.status);

  // Keeps the current filters when a link stays on the same table page.
  function keepQuery(path, patch) {
    const cur = KH.current();
    const q = cur.path === path ? { ...cur.query } : {};
    Object.assign(q, patch);
    const qs = Object.keys(q).filter((k) => q[k] !== '' && q[k] != null).map((k) => k + '=' + encodeURIComponent(q[k])).join('&');
    return path + (qs ? '?' + qs : '');
  }

  const links = {
    competition: (comp) => C(comp) + '/matrix',
    cls: (cls) => C(compOf(cls)) + '/settings?section=classes&class=' + cls.slug,
    classDay: CD,
    classDayDate: CELL,
    classDayTasks: (cd) => CD(cd) + '?pane=task',
    candidate: (t) => CD(Q.classDay(t.classDayId)) + '?pane=task&cand=' + t.id,
    result: (r) => COL(Q.class(Q.classDay(r.classDayId).classId), Q.classDay(r.classDayId).date) + '/' + Q.competitor(r.competitorId).cid,
    file: (f) => keepQuery(C(Q.competition(Q.logger(f.loggerId).competitionId)) + '/files', { open: f.id }),
    competitor: (c) => keepQuery(C(Q.competition(c.competitionId)) + '/competitors', { edit: c.id }),
    competitors: (comp) => C(comp) + '/competitors',
    logger: (l) => keepQuery(C(Q.competition(l.competitionId)) + '/loggers', { edit: l.id }),
    files: (comp) => C(comp) + '/files',
  };

  const EX = '/c/oberrhein-2026';
  const routes = [
    { path: '/', title: 'My competitions', group: 'Account', example: '/' },
    { path: '/new', title: 'Create competition', group: 'Account', example: '/new' },
    { path: '/account', title: 'Account and invitations', group: 'Account', example: '/account' },
    { path: '/staff/users', title: 'Users and invitation tree (staff)', group: 'Staff', example: '/staff/users' },
    { path: '/staff/competitions', title: 'All competitions (staff)', group: 'Staff', example: '/staff/competitions' },
    { path: '/c/:comp/matrix', title: 'Matrix: dates × classes', group: 'Matrix', example: EX + '/matrix' },
    { path: '/c/:comp/matrix/:date/:class', title: 'Matrix with a class day selected (?pane=summary|task|settings|results|publish, &cand=)', group: 'Matrix', example: EX + '/matrix/2026-07-28/club' },
    { path: '/c/:comp/class/:class', title: 'Class matrix: competitors × days (?rows=check, ?view=overall)', group: 'Class matrix', example: EX + '/class/standard' },
    { path: '/c/:comp/class/:class/:date', title: 'Class matrix with a day column selected (?pane=…)', group: 'Class matrix', example: EX + '/class/standard/2026-07-27' },
    { path: '/c/:comp/class/:class/:date/:cid', title: 'Class matrix with a result cell selected', group: 'Class matrix', example: null },
    { path: '/c/:comp/competitors', title: 'Competitors table (?class=, ?edit=id|new)', group: 'Tables', example: EX + '/competitors?edit=p1' },
    { path: '/c/:comp/loggers', title: 'Loggers table (?edit=id|new)', group: 'Tables', example: EX + '/loggers?edit=lx1' },
    { path: '/c/:comp/files', title: 'IGC files table (filters, ?open=file)', group: 'Tables', example: EX + '/files?state=unresolved' },
    { path: '/c/:comp/settings', title: 'Competition settings (?section=details|dates|classes|turnpoints|airspace|members|archive)', group: 'Settings', example: EX + '/settings' },
  ];

  // ---------- shell ----------

  function header(ctx) {
    const me = Q.me();
    const comp = ctx.comp;
    const top = '<div class="d-top"><a class="d-brand" href="#/">Keyhole</a>' +
      (comp ? '<select onchange="location.hash=this.value">' + Q.myCompetitions().map((c) => '<option value="#' + links.competition(c) + '"' + (c === comp ? ' selected' : '') + '>' + e(c.name) + '</option>').join('') + '<option value="#/">All competitions…</option></select>' : '') +
      '<span class="grow"></span>' + (me.staff ? '<a href="#/staff/users">Staff</a>' : '') + '<a href="#/account">' + e(me.name) + '</a><span class="muted small">' + (comp ? e(Q.roleIn(comp) || 'no role') : me.staff ? 'staff' : '') + '</span><a href="#/" onclick="KH.toast(\'Prototype: would sign out\');return false" class="muted">Sign out</a></div>';
    const tab = (href, label, on, x) => '<a class="' + (on ? 'on' : '') + '" href="#' + href + '">' + label + (x ? ' <span class="x">' + x + '</span>' : '') + '</a>';
    let tabs = '';
    if (!comp) {
      tabs = tab('/', 'My competitions', ctx.path === '/') + tab('/new', 'Create competition', ctx.path === '/new') + tab('/account', 'Account', ctx.path === '/account') +
        (me.staff ? '<span class="sep"></span>' + tab('/staff/users', 'Users', ctx.path === '/staff/users') + tab('/staff/competitions', 'All competitions', ctx.path === '/staff/competitions') : '');
    } else if (comp.lifecycle === 'archived') {
      tabs = tab(links.competition(comp), 'Archive', sect(ctx) === 'matrix') + tab(C(comp) + '/settings', 'Settings', sect(ctx) === 'settings');
    } else {
      const s = sect(ctx);
      const unresolved = Q.unresolvedFiles(comp.id).length;
      tabs = tab(links.competition(comp), 'Matrix', s === 'matrix') +
        Q.classesOf(comp.id).map((cls) => {
          const check = Q.classDaysOf(cls.id).filter(LIVE).reduce((a, cd) => a + Q.dayCounts(cd).check, 0);
          return tab(C(comp) + '/class/' + cls.slug, e(cls.name), s === 'class' && ctx.cls === cls, check ? check + ' check' : '');
        }).join('') +
        '<span class="sep"></span>' + tab(C(comp) + '/competitors', 'Competitors', s === 'competitors', String(Q.competitorsOf(comp.id).length)) + tab(C(comp) + '/loggers', 'Loggers', s === 'loggers', String(Q.loggersOf(comp.id).length)) +
        tab(C(comp) + '/files', 'IGC files', s === 'files', unresolved ? unresolved + ' unresolved' : '') + tab(C(comp) + '/settings', 'Settings', s === 'settings');
    }
    return '<header class="d-head">' + top + '<nav class="d-tabs">' + tabs + '</nav></header>';
  }
  function sect(ctx) {
    return (ctx.path.split('/')[3] || '').split('?')[0];
  }

  function page(ctx, title, body, actions) {
    return header(ctx) + '<main class="d-main">' +
      (ctx.comp && ctx.comp.blocked ? '<div class="wf-note warn">Blocked by staff ' + W.dt(ctx.comp.blocked.at) + ': ' + e(ctx.comp.blocked.note) + '. Only staff can see this competition.</div>' : '') +
      (title ? '<div class="d-title"><h1>' + title + '</h1><div class="wf-row">' + (actions || '') + '</div></div>' : '') + body + '</main>';
  }
  function panel(head, body, close) {
    return '<section class="d-panel"><div class="d-panel-head"><h2>' + head + '</h2>' + (close ? '<a class="wf-btn small ghost" href="#' + close + '">Close panel</a>' : '') + '</div><div class="d-panel-body">' + body + '</div></section>';
  }
  function denied(ctx, msg) {
    return page(ctx, 'No access', '<div class="wf-empty">' + (msg || 'Switch to another role in the prototype bar.') + '</div>');
  }
  function guard(ctx) {
    if (!ctx.comp) return page(ctx, 'Not found', '<div class="wf-empty">This competition does not exist.</div>');
    if (!Q.roleIn(ctx.comp)) {
      const ci = S.competitionInvitations.find((i) => i.competitionId === ctx.comp.id && i.inviteeId === Q.me().id);
      return page({ ...ctx, comp: null }, e(ctx.comp.name), '<div class="wf-empty">You are not a member of this competition.' + (ci ? '<p><button class="wf-btn primary" data-act="acceptCI" data-id="' + ci.id + '">Accept invitation as ' + ci.role + '</button></p>' : '') + '</div>');
    }
    if (ctx.comp.blocked && !Q.me().staff) return page({ ...ctx, comp: null }, 'Not found', '<div class="wf-empty">This competition does not exist.</div>');
    if (ctx.comp.lifecycle === 'archived' && !['matrix', 'settings'].includes(sect(ctx))) return page(ctx, e(ctx.comp.name), '<div class="wf-empty">Archived. The scoring work was removed. <a href="#' + links.competition(ctx.comp) + '">Open the archive summary</a></div>');
    return null;
  }
  // Brings the selected cell or section into view after the router resets the scroll position.
  function reveal(selector, id) {
    setTimeout(() => {
      const el = id ? document.getElementById(id) : document.querySelector && document.querySelector(selector);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: id ? 'start' : 'nearest', inline: 'nearest' });
    }, 0);
  }

  // ---------- account and staff ----------

  const P = {};
  P['/'] = (ctx) => page(ctx, 'My competitions', '<div class="wf-stack">' + W.incomingInvitations() +
    '<table class="wf-table"><thead><tr><th>Competition</th><th>Dates</th><th>Your role</th><th>State</th></tr></thead><tbody>' +
    Q.myCompetitions().map((c) => '<tr class="link" data-href="' + links.competition(c) + '"><td><b>' + e(c.name) + '</b><div class="muted small">' + e(c.location) + ' · ' + e(c.organiser) + '</div></td><td>' + W.date(c.dates[0], true) + ' – ' + W.date(c.dates[c.dates.length - 1], true) + '</td><td>' + e(Q.roleIn(c)) + '</td><td>' + (c.blocked ? '<span class="wf-badge solid">blocked</span> ' : '') + (c.lifecycle === 'archived' ? 'archived' : c.dates[0] > KH.TODAY ? 'upcoming' : c.dates[c.dates.length - 1] < KH.TODAY ? 'finished' : 'running') + '</td></tr>').join('') +
    '</tbody></table></div>', '<a class="wf-btn primary" href="#/new">Create competition</a>');
  P['/new'] = (ctx) => page(ctx, 'Create competition', '<div class="wf-box" style="max-width:880px">' + W.createCompetitionForm() + '</div>');
  P['/account'] = (ctx) => page(ctx, 'Account and invitations', W.incomingInvitations() + W.account());
  P['/staff/users'] = (ctx) => (Q.me().staff ? page(ctx, 'Users', '<p class="muted">The invitation tree. Each user records who invited them. Nothing acts on a whole branch automatically.</p>' + W.staffUsers()) : denied(ctx));
  P['/staff/competitions'] = (ctx) => (Q.me().staff ? page(ctx, 'All competitions', W.staffCompetitions()) : denied(ctx));

  // ---------- matrix: dates × classes ----------

  function dayCell(cls, date, on) {
    const cd = Q.classDayOn(cls.id, date);
    const label = e(Q.dayLabel(cls.id, date));
    if (!cd) return '<td class="untouched' + (on ? ' on' : '') + '"><a href="#' + CELL(cls, date) + '"><div class="l1"><span>' + label + '</span></div><div class="l2">untouched</div></a></td>';
    const task = Q.task(cd);
    const c = LIVE(cd) ? Q.dayCounts(cd) : null;
    const counts = c ? [c.check ? c.check + ' check' : '', c.unknown ? c.unknown + ' unknown' : '', c.stale ? c.stale + ' stale' : ''].filter(Boolean).join(' · ') : '';
    return '<td class="' + (on ? 'on' : '') + '"><a href="#' + CELL(cls, date) + '"><div class="l1"><span><b>' + label + '</b>' + (task ? ' · ' + e(task.letter) + ' ' + W.km(Q.taskDistance(task)) : '') + '</span>' + W.dayBadge(cd.status) + '</div>' +
      '<div class="l2">' + (counts || (c ? c.ok + ' OK' : '&nbsp;')) + '</div>' +
      (cd.reasons.length || Q.deadlinePassed(cd) ? '<div class="l2">' + (cd.reasons.length ? 'unpublished: ' + e(cd.reasons.join(', ').toLowerCase()) : '') + (Q.deadlinePassed(cd) ? ' deadline passed' : '') + '</div>' : '') + '</a></td>';
  }

  function attention(comp) {
    const out = [];
    for (const cls of Q.classesOf(comp.id)) for (const cd of Q.classDaysOf(cls.id)) {
      if (Q.deadlinePassed(cd)) out.push('<a href="#' + CD(cd) + '?pane=publish">' + e(W.dayTitle(cd, cls)) + ': ready for final</a>');
      else if (cd.reasons.length && cd.date !== KH.TODAY) out.push('<a href="#' + CD(cd) + '?pane=publish">' + e(W.dayTitle(cd, cls)) + ': unpublished changes</a>');
    }
    const unresolved = Q.unresolvedFiles(comp.id).length;
    if (unresolved) out.push('<a href="#' + C(comp) + '/files?state=unresolved">' + unresolved + ' unresolved IGC files</a>');
    return out.length ? '<div class="d-attn"><b>Needs attention</b>' + out.join('') + '</div>' : '';
  }

  function setupSteps(comp) {
    const steps = W.setupState(comp);
    if (steps.every((s) => s.done)) return '';
    const target = { details: 'details', airfield: 'details', classes: 'classes', turnpoints: 'turnpoints', airspace: 'airspace', members: 'members' };
    return '<div class="wf-box" style="margin-bottom:12px"><h3>Setup</h3><div class="wf-steps">' + steps.map((s) => {
      const href = s.key === 'competitors' ? C(comp) + '/competitors?edit=new' : s.key === 'loggers' ? C(comp) + '/loggers?edit=new' : C(comp) + '/settings?section=' + target[s.key];
      return '<a class="' + (s.done ? 'done' : 'todo') + '" href="#' + href + '">' + (s.done ? '✓ ' : '') + e(s.label) + '</a>';
    }).join('') + '</div>' + (comp.createdAt > '2026-07-28' ? '<p class="muted small" style="margin-top:8px">Created ' + W.dt(comp.createdAt) + '. Pilots can already upload test files with the competition password (Settings, Details).</p>' : '') + '</div>';
  }

  function archiveSummary(ctx) {
    const comp = ctx.comp;
    return page(ctx, e(comp.name) + ' <span class="wf-badge">archived</span>', '<div class="wf-stack"><div class="wf-note">Archived ' + W.dt(comp.archivedAt) + '. The scoring work was removed. Only the published results remain, and they can no longer change.</div>' +
      '<table class="wf-table"><thead><tr><th>Class</th><th>Published days</th><th>Competitors</th><th>Last status</th></tr></thead><tbody>' + comp.archive.classes.map((c) => '<tr><td>' + e(c.name) + '</td><td>' + c.days + '</td><td>' + c.competitors + '</td><td>' + W.dayBadge(c.lastStatus) + '</td></tr>').join('') + '</tbody></table>' +
      '<p><a href="#" onclick="KH.toast(\'Public pages are out of scope for this prototype\');return false">Open public results ↗</a></p></div>');
  }

  function matrixPage(ctx, panelHtml) {
    const comp = ctx.comp;
    if (comp.lifecycle === 'archived') return archiveSummary(ctx);
    const classes = Q.classesOf(comp.id);
    const sel = ctx.params.date;
    const grid = classes.length
      ? '<div class="d-scroll' + (panelHtml ? '' : ' tall') + '"><table class="d-mx days"><thead><tr><th class="rh">Date</th>' + classes.map((cls) => '<th><a href="#' + C(comp) + '/class/' + cls.slug + '">' + e(cls.name) + ' <span class="muted small">' + Q.competitorsOf(comp.id, cls.id).length + ' competitors</span></a></th>').join('') + '</tr></thead><tbody>' +
        comp.dates.map((d) => '<tr id="d-row-' + d + '" class="' + (d === KH.TODAY ? 'today' : '') + '"><th class="rh">' + W.date(d) + (d === KH.TODAY ? ' · today' : '') + '</th>' + classes.map((cls) => dayCell(cls, d, sel === d && ctx.cls === cls)).join('') + '</tr>').join('') + '</tbody></table></div>' +
        '<div class="d-legend"><span>Click a cell to work on that class day below the matrix.</span><span>Hatched: untouched, a class day exists once someone touches its cell.</span></div>'
      : '<div class="wf-empty">No classes yet. <a href="#' + C(comp) + '/settings?section=classes">Add a class</a> to fill the matrix.</div>';
    if (panelHtml) reveal('.d-mx td.on');
    else if (comp.dates.includes(KH.TODAY)) reveal('#d-row-' + KH.TODAY);
    return page(ctx, '', setupSteps(comp) + attention(comp) + grid + (panelHtml || ''));
  }
  P['/c/:comp/matrix'] = (ctx) => matrixPage(ctx);
  P['/c/:comp/matrix/:date/:class'] = (ctx) => matrixPage(ctx, dayPanel(ctx, CELL(ctx.cls || {}, ctx.params.date), 'summary', links.competition(ctx.comp)));

  // ---------- class day panel ----------

  function dayPanel(ctx, base, defPane, close) {
    const cls = ctx.cls;
    const date = ctx.params.date;
    if (!cls) return panel('Not found', '<div class="wf-empty">No such class</div>', close);
    if (!ctx.comp.dates.includes(date)) return panel('Not a competition date', '<div class="wf-empty">' + W.date(date, true) + ' is not a competition date.</div>', close);
    const cd = ctx.cd;
    const head = e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, date)) + ' <span class="muted" style="font-weight:400">' + W.date(date, true) + '</span> ' + (cd ? W.dayBadge(cd.status) : '');
    if (!cd) return panel(head, W.untouchedDay(cls, date), close);
    const pane = ctx.query.pane || defPane;
    const c = Q.dayCounts(cd);
    const t = (k, label, x) => '<a class="' + (pane === k ? 'on' : '') + '" href="#' + base + '?pane=' + k + '">' + label + (x ? ' <span class="wf-badge">' + x + '</span>' : '') + '</a>';
    const tabs = '<div class="wf-tabs">' + t('summary', 'Summary') + t('task', 'Task', Q.task(cd) ? Q.task(cd).letter : '') + t('settings', 'Start, limits, airspace') + t('results', 'Results', c.check ? c.check + ' check' : '') + t('publish', 'Publish', cd.reasons.length ? 'changes' : '') + '</div>';
    let body;
    if (pane === 'task') {
      const cand = ctx.query.cand ? Q.candidate(ctx.query.cand) : null;
      body = cand ? '<p><a href="#' + base + '?pane=task">← All candidates</a></p>' + W.taskEditor(cand) : W.candidateList(cd);
    } else if (pane === 'settings') body = '<div class="wf-cols" style="grid-template-columns:3fr 2fr"><div class="wf-box">' + W.dayOverrides(cd) + '</div><div class="wf-box">' + W.dayAirspace(cd) + '</div></div>';
    else if (pane === 'results') {
      const f = ctx.query.show || '';
      const flt = (k, label) => '<a class="wf-btn small' + (f === k ? ' primary' : '') + '" href="#' + base + '?pane=results' + (k ? '&show=' + k : '') + '">' + label + '</a>';
      body = '<div class="wf-stack"><div class="wf-row">' + flt('', 'All ' + c.results) + flt('check', 'In check ' + c.check) + flt('unknown', 'Unknown ' + c.unknown) + flt('stale', 'Stale ' + c.stale) + '<span class="muted small">A row opens its cell in the ' + e(cls.name) + ' matrix.</span></div>' + W.resultsTable(cd, { filter: f }) + '</div>';
    } else if (pane === 'publish') body = '<div class="wf-cols" style="grid-template-columns:2fr 3fr"><div class="wf-box"><h3>Publish</h3>' + W.publishPanel(cd) + '</div><div class="wf-box"><h3>Latest published copy</h3>' + W.publishedCopy(cd) + '</div></div>';
    else body = daySummary(cd, base);
    return panel(head, tabs + body, close);
  }

  function daySummary(cd, base) {
    const task = Q.task(cd);
    const c = Q.dayCounts(cd);
    const stale = Q.staleFilesOf(cd);
    const cls = Q.class(cd.classId);
    return '<div class="wf-cols"><div class="wf-stack"><div class="wf-box"><h3>Working state</h3><div class="wf-kv">' +
      '<span>Status</span><span>' + W.select('status', KH.DAY_STATUSES, cd.status, 'data-change="setWorkingStatus" data-cd="' + cd.id + '"') + '</span>' +
      '<span>Practice day</span><span>' + (cd.practice ? 'yes' : 'no') + '</span>' +
      '<span>Task</span><span>' + (task ? '<a href="#' + links.candidate(task) + '">' + e(task.letter) + '</a> ' + e(Q.taskLine(task)) + ', ' + W.km(Q.taskDistance(task)) : 'none published · <a href="#' + base + '?pane=task">Enter or import</a>') + '</span>' +
      '<span>Results</span><span>' + c.ok + ' OK, ' + c.check + ' in check, ' + c.unknown + ' unknown · <a href="#' + COL(cls, cd.date) + '">Review in the ' + e(cls.name) + ' matrix</a></span>' +
      '<span>Unpublished</span><span>' + (cd.reasons.length ? e(cd.reasons.join(', ')) + ' · <a href="#' + base + '?pane=publish">Publish</a>' : 'nothing') + '</span></div></div>' +
      (stale.length ? '<div class="wf-box"><h3>Stale analyses (' + stale.length + ')</h3><table class="wf-table"><tbody>' + stale.map((f) => { const r = Q.resolve(f); return '<tr><td><a href="#' + links.file(f) + '">' + e(f.name) + '</a></td><td>' + e(r.competitor.cid) + '</td><td>' + W.staleBadge(f) + '</td><td class="right"><button class="wf-btn small" data-act="rerun" data-file="' + f.id + '">Rerun</button></td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      '</div><div class="wf-stack">' + (task ? W.taskMap(task.points, { h: 220 }) : '') + '<div class="wf-box"><h3>Published copy</h3>' + (cd.published ? W.dayBadge(cd.published.status) + ' ' + W.dt(cd.published.at) + (cd.publishedTask ? '<div class="small">Task ' + e(cd.publishedTask.letter) + ': ' + e(cd.publishedTask.line) + '</div>' : '') : '<span class="muted">never published</span>') + '</div></div></div>';
  }

  // ---------- class matrix: competitors × days ----------

  function marks(x) {
    const r = x.result;
    const out = [];
    if (r.checkReasons.length) out.push('!' + r.checkReasons.length);
    if (Q.filesOfResult(r).some((f) => f.analysis.stale.length)) out.push('stale');
    if (r.status === 'manual result') out.push('M');
    if (r.penalty) out.push('−' + r.penalty.points);
    return out.join(' ');
  }
  function resultCell(cls, cd, x, on, col) {
    const r = x.result;
    const pts = x.status === 'unknown' ? '?' : x.status === 'did not fly' ? 'DNF' : x.placeholder ? '–' : x.points ?? '';
    const cl = [on ? 'on' : '', col ? 'colsel' : '', r.checkReasons.length ? 'chk' : '', x.status === 'unknown' ? 'unk' : ''].filter(Boolean).join(' ');
    return '<td class="' + cl + '"><a href="#' + COL(cls, cd.date) + '/' + e(x.competitor.cid) + '" title="' + e(x.competitor.cid + ' · ' + Q.dayLabel(cls.id, cd.date) + ' · ' + r.status + (r.checkReasons.length ? ' · check: ' + r.checkReasons.map((c) => c.text).join(', ') : '')) + '">' + (marks(x) ? '<span class="mk">' + marks(x) + '</span> ' : '') + '<span class="pts">' + pts + '</span></a></td>';
  }

  function classMatrix(ctx, panelHtml) {
    const comp = ctx.comp;
    const cls = ctx.cls;
    if (!cls) return page(ctx, 'Not found', '<div class="wf-empty">No such class</div>');
    const base = C(comp) + '/class/' + cls.slug;
    const selDate = ctx.params.date;
    const days = comp.dates.map((d) => {
      const cd = Q.classDayOn(cls.id, d);
      const rows = LIVE(cd) && Q.resultsOf(cd).length ? KH.score(cd).rows : null;
      return { d, cd, byComp: rows ? new Map(rows.map((x) => [x.competitor.id, x])) : null };
    });
    let rows = Q.competitorsOf(comp.id, cls.id).map((c) => {
      const cells = days.map((day) => day.byComp && day.byComp.get(c.id));
      const total = cells.reduce((a, x, i) => a + (x && !days[i].cd.practice && x.points ? x.points : 0), 0);
      return { c, cells, total, check: cells.some((x) => x && x.result.checkReasons.length) };
    });
    rows.sort((a, b) => b.total - a.total || a.c.cid.localeCompare(b.c.cid));
    const onlyCheck = ctx.query.rows === 'check';
    if (onlyCheck) rows = rows.filter((r) => r.check || (ctx.competitor && r.c === ctx.competitor));
    const keep = ctx.query.rows ? '?rows=' + ctx.query.rows : '';
    const head = days.map(({ d, cd }) => {
      const c = LIVE(cd) ? Q.dayCounts(cd) : null;
      return '<th class="' + (selDate === d ? 'on' : '') + '"><a href="#' + base + '/' + d + keep + '">' + e(Q.dayLabel(cls.id, d).replace('Day ', 'D')) + ' <span class="muted small">' + W.date(d).replace(/^\w+ /, '') + '</span><div class="small">' + (cd ? cd.status : 'untouched') + (c && c.check ? ' · ' + c.check + ' !' : '') + (cd && cd.reasons.length ? ' · unpubl.' : '') + '</div></a></th>';
    }).join('');
    const body = rows.map((row, i) => '<tr><th class="rh"><span class="muted">' + (row.c.hc ? 'HC' : i + 1) + '</span> <a href="#' + links.competitor(row.c) + '"><b>' + e(row.c.cid) + '</b></a> <span class="small">' + e(Q.crewName(row.c)) + '</span></th>' +
      row.cells.map((x, j) => (x ? resultCell(cls, days[j].cd, x, ctx.competitor === row.c && selDate === days[j].d, selDate === days[j].d) : '<td class="na' + (selDate === days[j].d ? ' colsel' : '') + '"><a href="#' + base + '/' + days[j].d + '">·</a></td>')).join('') +
      '<td><a class="pts" href="#' + links.competitor(row.c) + '">' + row.total + '</a></td></tr>').join('');
    const tools = '<div class="wf-row"><a class="wf-btn small' + (!onlyCheck ? ' primary' : '') + '" href="#' + KH.withQuery({ rows: '' }) + '">All rows</a><a class="wf-btn small' + (onlyCheck ? ' primary' : '') + '" href="#' + KH.withQuery({ rows: 'check' }) + '">Rows with checks</a>' +
      '<a class="wf-btn small" href="#' + base + '?view=overall">Published overall</a><button class="wf-btn small" data-act="printOverall" data-cls="' + cls.id + '">Overall sheet</button></div>';
    const grid = '<div class="d-scroll"><table class="d-mx res"><thead><tr><th class="rh">' + e(cls.name) + ' · ' + rows.length + ' competitors</th>' + head + '<th>Working total</th></tr></thead><tbody>' +
      (rows.length ? body : '<tr><td colspan="' + (days.length + 2) + '" class="muted">No competitors' + (onlyCheck ? ' with checks' : '') + '</td></tr>') + '</tbody></table></div>' +
      '<div class="d-legend"><span>Cell: points, or ? unknown, DNF, – no result yet</span><span>!n check reasons</span><span>stale analysis</span><span>M manual result</span><span>−n penalty</span><span>Column head opens the class day</span></div>';
    let extra = panelHtml || '';
    if (!panelHtml && ctx.query.view === 'overall') extra = panel('Published overall', overallTable(cls), base);
    if (panelHtml) reveal('.d-mx td.on, .d-mx th.on');
    return page(ctx, e(cls.name) + ' <span class="muted small" style="font-weight:400">' + e(cls.edition) + (cls.handicapScale ? ', handicapped' : '') + '</span>', grid + extra, tools);
  }
  function overallTable(cls) {
    const o = W.overall(cls);
    if (!o.days.length) return '<div class="wf-empty">No published days yet</div>';
    return '<p class="muted small">From the latest published copy of each day. Lowest status: ' + e(o.lowest) + '.</p><div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Rank</th><th>CID</th><th>Pilot</th>' + o.days.map((cd) => '<th class="num">' + e(Q.dayLabel(cls.id, cd.date).replace('Day ', 'D')) + '</th>').join('') + '<th class="num">Total</th></tr></thead><tbody>' +
      o.rows.map((x, i) => '<tr><td>' + (x.c.hc ? 'HC' : i + 1) + '</td><td>' + e(x.c.cid) + '</td><td>' + e(Q.crewName(x.c)) + '</td>' + x.per.map((r) => '<td class="num">' + (r ? (r.rankLabel === 'DNF' ? '0' : r.points ?? '') : '') + '</td>').join('') + '<td class="num"><b>' + x.total + '</b></td></tr>').join('') + '</tbody></table></div>';
  }

  P['/c/:comp/class/:class'] = (ctx) => classMatrix(ctx);
  P['/c/:comp/class/:class/:date'] = (ctx) => classMatrix(ctx, ctx.cls && dayPanel(ctx, COL(ctx.cls, ctx.params.date), 'results', C(ctx.comp) + '/class/' + ctx.cls.slug));

  function neighbours(ctx) {
    const rows = KH.score(ctx.cd).rows;
    const check = rows.filter((x) => x.result.checkReasons.length || x.result === ctx.result);
    const i = check.findIndex((x) => x.result === ctx.result);
    return { prev: check[i - 1], next: check[i + 1], pos: i + 1, total: check.length };
  }
  function resultPanel(ctx) {
    const close = COL(ctx.cls, ctx.params.date);
    if (!ctx.cd || !LIVE(ctx.cd) || !ctx.result) return panel('No result', '<div class="wf-empty">No result for this competitor on this day</div>', close);
    const r = ctx.result;
    const comp = ctx.competitor;
    const scored = r.scoredFileId ? Q.file(r.scoredFileId) : null;
    const task = Q.task(ctx.cd);
    const n = neighbours(ctx);
    const nav = '<div class="wf-row">' + (n.prev ? '<a class="wf-btn small" href="#' + links.result(n.prev.result) + '">← ' + e(n.prev.competitor.cid) + '</a>' : '') + '<span class="muted small">' + n.pos + ' of ' + n.total + ' in check on this day</span>' + (n.next ? '<a class="wf-btn small" href="#' + links.result(n.next.result) + '">' + e(n.next.competitor.cid) + ' →</a>' : '') + '<a class="wf-btn small ghost" href="#' + close + '">Close panel</a></div>';
    const head = e(comp.cid) + ' · ' + e(Q.crewName(comp)) + ' · ' + e(Q.dayLabel(ctx.cls.id, ctx.cd.date)) + ' <span class="muted small" style="font-weight:400">' + e(comp.gliderType) + (comp.handicap ? ', handicap ' + comp.handicap : '') + (comp.hc ? ', hors concours' : '') + ' · <a href="#' + links.competitor(comp) + '">competitor</a> · <a href="#' + COL(ctx.cls, ctx.cd.date) + '?pane=publish">publish day</a></span>';
    const body = '<div class="wf-stack">' + W.checkReasons(r) + W.resultStatusControl(r) +
      '<div class="wf-box"><h3>Files</h3>' + W.resultFiles(r) + '</div>' +
      (r.status === 'manual result' ? '<div class="wf-box"><h3>Manual result</h3>' + W.manualForm(r) + '</div>' : '') +
      (scored ? '<div class="wf-cols"><div class="wf-box"><h3>Scored file: ' + e(scored.name) + ' ' + W.staleBadge(scored) + '</h3>' + W.outputSummary(scored) + '</div>' + (task ? W.taskMap(task.points, { track: scored.seed, finished: scored.analysis.output && scored.analysis.output.finished, h: 200 }) : '') + '</div>' +
        '<div class="wf-box"><h3>Start candidates</h3>' + W.startCandidates(scored) + '</div>' +
        '<div class="wf-box">' + W.analysisLog(scored) + '</div>' +
        '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(scored) + '</div>' : '') +
      '<div class="wf-cols"><div class="wf-box"><h3>Penalty</h3>' + W.penaltyForm(r) + '</div><div class="wf-box"><h3>Remarks and handicap</h3>' + W.resultRemarks(r) + '</div></div></div>';
    return '<section class="d-panel"><div class="d-panel-head"><h2>' + head + '</h2>' + nav + '</div><div class="d-panel-body">' + body + '</div></section>';
  }
  P['/c/:comp/class/:class/:date/:cid'] = (ctx) => (ctx.cls ? classMatrix(ctx, resultPanel(ctx)) : classMatrix(ctx));

  // ---------- tables with a side panel ----------

  // The shared tables have no selected-row option, so the row is marked after rendering.
  function markSel(html, href) {
    return href ? html.replace('<tr class="link" data-href="' + href + '"', '<tr class="link sel" data-href="' + href + '"') : html;
  }
  function split(main, side) {
    return '<div class="d-split"><div class="wf-stack" style="min-width:0">' + main + '</div><aside class="d-side">' + side + '</aside></div>';
  }

  P['/c/:comp/competitors'] = (ctx) => {
    const comp = ctx.comp;
    const base = C(comp) + '/competitors';
    const cls = ctx.query.class ? Q.classBySlug(comp.id, ctx.query.class) : null;
    const edit = ctx.query.edit;
    const flt = (c) => '<a class="wf-btn small' + (cls === c ? ' primary' : '') + '" href="#' + base + (c ? '?class=' + c.slug : '') + (edit ? (c ? '&' : '?') + 'edit=' + edit : '') + '">' + (c ? e(c.name) + ' ' + Q.competitorsOf(comp.id, c.id).length : 'All') + '</a>';
    const close = KH.withQuery({ edit: '' });
    let side;
    if (edit === 'new') side = panel('Add competitor', W.competitorForm(comp, null, cls && cls.id), close);
    else if (edit) {
      const c = Q.competitor(edit);
      side = c ? panel(e(c.cid) + ' · ' + e(Q.crewName(c)) + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : ''), competitorDetail(comp, c), close) : panel('Not found', '<div class="wf-empty">No such competitor</div>', close);
    } else side = panel('Competitor', '<p class="muted">Select a row to edit it here, or add a new competitor.</p><a class="wf-btn primary" href="#' + KH.withQuery({ edit: 'new' }) + '">Add competitor</a>');
    return page(ctx, 'Competitors', split('<div class="wf-row">' + flt(null) + Q.classesOf(comp.id).map(flt).join('') + '</div>' + markSel(W.competitorsTable(comp, cls && cls.id), edit && edit !== 'new' && Q.competitor(edit) ? links.competitor(Q.competitor(edit)) : ''), side), '<a class="wf-btn primary" href="#' + KH.withQuery({ edit: 'new' }) + '">Add competitor</a>');
  };
  function competitorDetail(comp, c) {
    const loggers = Q.loggersOf(comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
    const days = Q.classDaysOf(c.classId).filter(LIVE);
    return '<div class="wf-stack">' + W.competitorForm(comp, c) +
      '<div><h3>Loggers</h3>' + (loggers.length ? '<table class="wf-table"><tbody>' + loggers.map((l) => '<tr><td><a href="#' + links.logger(l) + '">' + e(Q.loggerLabel(l)) + '</a></td><td>' + l.links.filter((k) => k.competitorId === c.id).map((k) => k.role + (k.from ? ' from ' + W.date(k.from) : '')).join(', ') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted small">No loggers linked</p>') + '<a class="wf-btn small" href="#' + C(comp) + '/loggers?edit=new">Add logger</a></div>' +
      '<div><h3>Results</h3><table class="wf-table"><tbody>' + days.map((cd) => { const r = Q.resultFor(cd.id, c.id); return r ? '<tr class="link" data-href="' + links.result(r) + '"><td>' + e(Q.dayLabel(cd.classId, cd.date)) + '</td><td>' + W.resultStatus(r) + '</td><td>' + W.reviewBadge(r) + '</td><td>' + (r.penalty ? '−' + r.penalty.points : '') + '</td></tr>' : ''; }).join('') + '</tbody></table></div>' +
      '<div>' + W.dsqPanel(c) + '</div></div>';
  }

  P['/c/:comp/loggers'] = (ctx) => {
    const comp = ctx.comp;
    const edit = ctx.query.edit;
    const close = KH.withQuery({ edit: '' });
    let side;
    if (edit === 'new') side = panel('Add logger', W.loggerForm(comp), close);
    else if (edit) {
      const l = Q.logger(edit);
      side = l ? panel('Logger ' + e(Q.loggerLabel(l)), '<div class="wf-stack"><div><h3>Dated links</h3>' + W.loggerLinks(l) + '</div><div><h3>Thresholds</h3>' + W.loggerForm(comp, l) + '</div><div><h3>Files</h3>' + W.filesTable(S.files.filter((f) => f.loggerId === l.id).map((f) => ({ f, res: Q.resolve(f) })), { showResult: false }) + '</div></div>', close) : panel('Not found', '<div class="wf-empty">No such logger</div>', close);
    } else side = panel('Logger', '<p class="muted">Select a row to edit its links and thresholds here.</p><a class="wf-btn primary" href="#' + KH.withQuery({ edit: 'new' }) + '">Add logger</a>');
    return page(ctx, 'Loggers', split(markSel(W.loggersTable(comp), edit && edit !== 'new' && Q.logger(edit) ? links.logger(Q.logger(edit)) : ''), side), '<a class="wf-btn primary" href="#' + KH.withQuery({ edit: 'new' }) + '">Add logger</a>');
  };

  P['/c/:comp/files'] = (ctx) => {
    const comp = ctx.comp;
    const base = C(comp) + '/files';
    const { open, ...filters } = ctx.query;
    const { rows, hiddenUnresolved } = W.filterFiles(comp, filters);
    const f = open ? Q.file(open) : null;
    let detail = '';
    if (open && !f) detail = panel('Not found', '<div class="wf-empty">No such file</div>', KH.withQuery({ open: '' }));
    if (f) {
      const res = Q.resolve(f);
      const task = res.ok ? Q.task(res.classDay) : null;
      detail = panel(e(f.name) + (res.ok ? ' <span class="muted small" style="font-weight:400">' + e(res.competitor.cid) + ' · <a href="#' + links.result(res.result) + '">open result</a></span>' : ''), '<div class="wf-stack"><div class="wf-cols"><div class="wf-box">' + W.fileMeta(f) + '</div><div class="wf-stack">' + (task ? W.taskMap(task.points, { track: f.seed, finished: f.analysis.output && f.analysis.output.finished, h: 200 }) : '<div class="wf-map" style="height:200px"><span class="tag">Map: track only</span></div>') + '<div class="wf-box">' + W.outputSummary(f) + '</div></div></div>' +
        (f.analysis.candidates && f.analysis.candidates.length ? '<div class="wf-box"><h3>Start candidates</h3>' + W.startCandidates(f) + '</div>' : '') +
        '<div class="wf-box">' + W.analysisLog(f) + '</div>' + (res.ok ? '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(f) + '</div>' : '') + '</div>', KH.withQuery({ open: '' }));
      reveal('.d-scroll tr.sel');
    }
    const table = markSel(W.filesTable(rows.slice(0, 200)), f ? links.file(f) : '');
    return page(ctx, 'IGC files', '<div class="wf-stack">' + W.fileFilters(comp, filters, base) +
      (hiddenUnresolved ? '<div class="wf-note warn">' + hiddenUnresolved + ' unresolved files are hidden by this filter. <a href="#' + base + '?state=unresolved">Show unresolved</a></div>' : '') +
      '<div class="muted small">' + rows.length + ' files' + (rows.length > 200 ? ', first 200 shown' : '') + '</div><div class="d-scroll' + (f ? '' : ' tall') + '">' + table + '</div>' + detail +
      '<details><summary>Upload a file as scorer</summary><div class="wf-box" style="margin-top:8px">' + W.scorerUploadForm(comp) + '</div></details></div>');
  };

  // ---------- settings: one long page ----------

  P['/c/:comp/settings'] = (ctx) => {
    const comp = ctx.comp;
    const base = C(comp) + '/settings';
    const archived = comp.lifecycle === 'archived';
    const secs = archived
      ? [['members', 'Members'], ['archive', 'Delete']]
      : [['details', 'Details and password'], ['dates', 'Dates'], ['classes', 'Classes'], ['turnpoints', 'Turnpoints'], ['airspace', 'Airspace'], ['members', 'Members and invitations'], ['archive', 'Archive or delete']];
    const content = {
      details: () => '<div class="wf-cols" style="grid-template-columns:2fr 1fr"><div class="wf-box">' + W.competitionDetails(comp) + '</div><div class="wf-stack"><div class="wf-box">' + W.uploadPassword(comp) + '</div><div class="wf-box fill small"><b>Organiser terms</b><br>' + e(comp.terms.version) + ' accepted by ' + e(Q.user(comp.terms.userId).name) + ' on ' + W.dt(comp.terms.at) + ' for ' + e(comp.terms.organiser) + '</div></div></div>',
      dates: () => '<div class="wf-box">' + W.datesEditor(comp) + '</div><p class="muted small">Class days live in the <a href="#' + links.competition(comp) + '">matrix</a>.</p>',
      classes: () => classesSection(ctx),
      turnpoints: () => W.turnpoints(comp),
      airspace: () => W.airspace(comp),
      members: () => W.members(comp),
      archive: () => W.lifecycle(comp),
    };
    if (ctx.query.section) reveal(null, 'sec-' + ctx.query.section);
    return page(ctx, 'Settings', '<nav class="d-sections">' + secs.map(([k, l]) => '<a class="wf-btn small' + (ctx.query.section === k ? ' primary' : '') + '" href="#' + base + '?section=' + k + '">' + l + '</a>').join('') + '</nav>' +
      secs.map(([k, l]) => '<section class="d-sec" id="sec-' + k + '"><h2>' + l + '</h2>' + content[k]() + '</section>').join(''));
  };
  function classesSection(ctx) {
    const comp = ctx.comp;
    const open = ctx.query.class;
    const classes = Q.classesOf(comp.id, true);
    return '<div class="wf-stack">' + (classes.length ? classes.map((c) => '<details class="wf-box"' + (open === c.slug ? ' open' : '') + '><summary><b>' + e(c.name) + '</b> <span class="muted small">' + e(c.edition) + ' · ' + (c.handicapScale ? 'handicapped, scale ' + c.handicapScale + ', ' + e(c.handicapList) : 'not handicapped') + ' · ' + Q.competitorsOf(comp.id, c.id).length + ' competitors · ' + Q.classDaysOf(c.id).length + ' class days</span>' + (c.deleted ? ' <span class="wf-badge none">deleted</span> <button class="wf-btn small" data-act="restoreClass" data-cls="' + c.id + '">Restore</button>' : '') + '</summary>' +
      (c.deleted ? '' : '<div style="margin-top:10px">' + W.classForm(comp, c) + '</div>') + '</details>').join('') : '<div class="wf-empty">No classes yet</div>') +
      '<details class="wf-box"' + (open === 'new' || (!classes.length && ctx.query.section === 'classes') ? ' open' : '') + '><summary><b>Add class</b></summary><div style="margin-top:10px">' + W.classForm(comp) + '</div></details></div>';
  }

  KH.mount({
    id: 'd',
    routes,
    links,
    render(ctx) {
      if (ctx.params.comp) {
        const g = guard(ctx);
        if (g) return g;
      }
      return P[ctx.route.path](ctx);
    },
    notFound: (ctx) => page(ctx, 'Not found', '<div class="wf-empty">No page at ' + e(ctx.path) + '</div>'),
    afterReview() {
      const ctx = KH.current();
      if (!ctx.params.cid || !ctx.result) return;
      const n = neighbours(ctx);
      if (n.next) KH.go(links.result(n.next.result));
    },
  });
})();
