// PROTOTYPE: Direction B, "Day desk". One competition date is the workspace. Every class of that date is a column, and review opens in a drawer over it.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const S = KH.state;
  const e = KH.esc;

  const C = (comp) => '/c/' + comp.slug;
  const SU = (comp) => C(comp) + '/setup';
  const compOf = (cls) => Q.competition(cls.competitionId);
  const DESK = (comp, date) => C(comp) + '/' + date;
  const COL = (cls, date) => DESK(compOf(cls), date) + '/' + cls.slug;
  const CD = (cd) => COL(Q.class(cd.classId), cd.date);

  // A file opened from the desk stays in a drawer over the desk. Anywhere else it opens in setup.
  function fileLink(f) {
    const comp = Q.competition(Q.logger(f.loggerId).competitionId);
    const ctx = KH.current();
    const res = Q.resolve(f);
    if (ctx.params.date && ctx.comp === comp && res.ok) return CD(res.classDay) + '/files/' + f.id;
    return SU(comp) + '/files/' + f.id;
  }

  const links = {
    competition: C,
    cls: (cls) => SU(compOf(cls)) + '/classes/' + cls.slug,
    classDay: CD,
    classDayDate: (cls, date) => COL(cls, date),
    classDayTasks: (cd) => CD(cd) + '/task',
    candidate: (t) => CD(Q.classDay(t.classDayId)) + '/task/' + t.id,
    result: (r) => CD(Q.classDay(r.classDayId)) + '/results/' + Q.competitor(r.competitorId).cid,
    file: fileLink,
    competitor: (c) => SU(Q.competition(c.competitionId)) + '/competitors/' + c.id,
    competitors: (comp) => SU(comp) + '/competitors',
    logger: (l) => SU(Q.competition(l.competitionId)) + '/loggers/' + l.id,
    files: (comp) => SU(comp) + '/files',
  };

  const EX = '/c/oberrhein-2026';
  const EXD = EX + '/2026-07-28';
  const EXS = EX + '/setup';
  const club = () => Q.classDayOn('cl1', '2026-07-28');
  const routes = [
    { path: '/', title: 'My competitions', group: 'Account', example: '/' },
    { path: '/new', title: 'Create competition', group: 'Account', example: '/new' },
    { path: '/account', title: 'Account and invitations', group: 'Account', example: '/account' },
    { path: '/staff/users', title: 'Users and invitation tree (staff)', group: 'Staff', example: '/staff/users' },
    { path: '/staff/competitions', title: 'All competitions (staff)', group: 'Staff', example: '/staff/competitions' },
    { path: '/c/:comp', title: 'Desk for today (or setup until a class exists)', group: 'Desk', example: EX },
    { path: '/c/:comp/setup', title: 'Setup overview and class day grid', group: 'Setup', example: EXS },
    { path: '/c/:comp/setup/details', title: 'Details and upload password', group: 'Setup', example: EXS + '/details' },
    { path: '/c/:comp/setup/dates', title: 'Dates and class days', group: 'Setup', example: EXS + '/dates' },
    { path: '/c/:comp/setup/classes', title: 'Classes', group: 'Setup', example: EXS + '/classes' },
    { path: '/c/:comp/setup/classes/new', title: 'Add class', group: 'Setup', example: EXS + '/classes/new' },
    { path: '/c/:comp/setup/classes/:class', title: 'Class settings', group: 'Setup', example: EXS + '/classes/club' },
    { path: '/c/:comp/setup/turnpoints', title: 'Turnpoint file', group: 'Setup', example: EXS + '/turnpoints' },
    { path: '/c/:comp/setup/airspace', title: 'Airspace file', group: 'Setup', example: EXS + '/airspace' },
    { path: '/c/:comp/setup/competitors', title: 'Competitors', group: 'Setup', example: EXS + '/competitors' },
    { path: '/c/:comp/setup/competitors/new', title: 'Add competitor', group: 'Setup', example: EXS + '/competitors/new' },
    { path: '/c/:comp/setup/competitors/:competitor', title: 'Competitor', group: 'Setup', example: EXS + '/competitors/p1' },
    { path: '/c/:comp/setup/loggers', title: 'Loggers', group: 'Setup', example: EXS + '/loggers' },
    { path: '/c/:comp/setup/loggers/new', title: 'Add logger', group: 'Setup', example: EXS + '/loggers/new' },
    { path: '/c/:comp/setup/loggers/:logger', title: 'Logger and links', group: 'Setup', example: EXS + '/loggers/lx1' },
    { path: '/c/:comp/setup/files', title: 'IGC files', group: 'Setup', example: EXS + '/files' },
    { path: '/c/:comp/setup/files/:file', title: 'IGC file', group: 'Setup', example: null },
    { path: '/c/:comp/setup/members', title: 'Members and invitations', group: 'Setup', example: EXS + '/members' },
    { path: '/c/:comp/setup/archive', title: 'Archive or delete', group: 'Setup', example: EXS + '/archive' },
    { path: '/c/:comp/:date', title: 'Desk: every class of one date', group: 'Desk', example: EXD },
    { path: '/c/:comp/:date/:class', title: 'Class sheet: full results table', group: 'Desk', example: EXD + '/club' },
    { path: '/c/:comp/:date/:class/task', title: 'Drawer: task candidates', group: 'Desk drawers', example: EXD + '/club/task' },
    { path: '/c/:comp/:date/:class/task/:cand', title: 'Drawer: task candidate editor', group: 'Desk drawers', example: null },
    { path: '/c/:comp/:date/:class/settings', title: 'Drawer: start procedure, limits, airspace', group: 'Desk drawers', example: EXD + '/club/settings' },
    { path: '/c/:comp/:date/:class/results/:cid', title: 'Drawer: result review', group: 'Desk drawers', example: null },
    { path: '/c/:comp/:date/:class/files/:file', title: 'Drawer: IGC file', group: 'Desk drawers', example: null },
    { path: '/c/:comp/:date/:class/publish', title: 'Drawer: publish results', group: 'Desk drawers', example: EXD + '/club/publish' },
  ];
  // Examples for routes whose ids only exist once the dataset is built.
  routes.find((r) => r.path.endsWith('/task/:cand')).example = EXD + '/club/task/' + Q.task(club()).id;
  routes.find((r) => r.path.endsWith('/results/:cid')).example = EXD + '/club/results/' + KH.score(club()).rows.find((x) => x.result.checkReasons.length).competitor.cid;
  routes.find((r) => r.path.endsWith('/:class/files/:file')).example = EXD + '/club/files/' + Q.filesOfResult(KH.score(club()).rows.find((x) => Q.filesOfResult(x.result).length).result)[0].id;
  routes.find((r) => r.path === '/c/:comp/setup/files/:file').example = EXS + '/files/' + Q.unresolvedFiles('k2')[0].id;

  // ---------- shell ----------

  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  function deskDate(comp) {
    if (comp.dates.includes(KH.TODAY)) return KH.TODAY;
    return comp.dates.find((d) => d > KH.TODAY) || comp.dates[comp.dates.length - 1];
  }

  function header(ctx) {
    const me = Q.me();
    const comp = ctx.comp;
    const setup = ctx.path.includes('/setup') || (comp && !Q.classesOf(comp.id).length && !isDate(ctx.params.date));
    const live = comp && comp.lifecycle !== 'archived';
    return '<header class="b-head"><a class="b-brand" href="#/">Keyhole</a>' +
      (comp ? '<select class="b-switch" onchange="location.hash=this.value">' + Q.myCompetitions().map((c) => '<option value="#' + C(c) + '"' + (c === comp ? ' selected' : '') + '>' + e(c.name) + '</option>').join('') + '<option value="#/">All competitions…</option></select>' : '') +
      (live ? '<nav class="b-mode"><a class="' + (setup ? '' : 'on') + '" href="#' + DESK(comp, ctx.params.date && isDate(ctx.params.date) ? ctx.params.date : deskDate(comp)) + '">Desk</a><a class="' + (setup ? 'on' : '') + '" href="#' + SU(comp) + '">Setup</a></nav>' : '') +
      '<span class="grow"></span>' + (me.staff ? '<a href="#/staff/users">Staff</a>' : '') + '<a href="#/">Competitions</a><a href="#/account">' + e(me.name) + '</a><span class="muted small">' + (comp ? e(Q.roleIn(comp) || 'no role') : me.staff ? 'staff' : '') + '</span><a href="#/" onclick="KH.toast(\'Prototype: would sign out\');return false" class="muted">Sign out</a></header>';
  }

  function blockedNote(ctx) {
    return ctx.comp && ctx.comp.blocked ? '<div class="wf-note warn">Blocked by staff ' + W.dt(ctx.comp.blocked.at) + ': ' + e(ctx.comp.blocked.note) + '. Only staff can see this competition.</div>' : '';
  }

  function page(ctx, title, body, actions) {
    return header(ctx) + '<main class="b-main">' + blockedNote(ctx) + '<div class="wf-row between b-title"><h1>' + title + '</h1><div class="wf-row">' + (actions || '') + '</div></div>' + body + '</main>';
  }

  const SETUP_TABS = [
    ['', 'Overview'], ['details', 'Details and password'], ['dates', 'Dates and class days'], ['classes', 'Classes'], ['turnpoints', 'Turnpoints'], ['airspace', 'Airspace'],
    ['competitors', 'Competitors'], ['loggers', 'Loggers'], ['files', 'IGC files'], ['members', 'Members'], ['archive', 'Archive or delete'],
  ];
  function setupPage(ctx, title, body, actions) {
    const comp = ctx.comp;
    const rest = ctx.path.slice(SU(comp).length + 1).split('/')[0] || '';
    const unresolved = Q.unresolvedFiles(comp.id).length;
    const tabs = comp.lifecycle === 'archived' ? SETUP_TABS.filter(([k]) => k === 'members' || k === 'archive') : SETUP_TABS;
    const x = { classes: Q.classesOf(comp.id).length, competitors: Q.competitorsOf(comp.id).length, loggers: Q.loggersOf(comp.id).length, files: unresolved ? unresolved + ' unresolved' : '', turnpoints: comp.turnpointFile ? '' : 'missing', airspace: comp.airspaceFile ? '' : 'missing' };
    const nav = '<nav class="b-subnav">' + tabs.map(([k, label]) => '<a class="' + (rest === k ? 'on' : '') + '" href="#' + SU(comp) + (k ? '/' + k : '') + '">' + label + (x[k] !== undefined && x[k] !== '' ? ' <span class="muted small">' + x[k] + '</span>' : '') + '</a>').join('') + '</nav>';
    return header(ctx) + nav + '<main class="b-main">' + blockedNote(ctx) + '<div class="wf-row between b-title"><h1>' + title + '</h1><div class="wf-row">' + (actions || '') + '</div></div>' + body + '</main>';
  }

  // ---------- desk ----------

  const dot = (cd) => '<span class="b-dot ' + (cd ? cd.status.replace(' ', '-') : 'none') + '" title="' + (cd ? cd.status : 'untouched') + '"></span>';

  function dateStrip(comp, date, classSlug) {
    const classes = Q.classesOf(comp.id);
    return '<nav class="b-dates">' + comp.dates.map((d) => {
      const labels = [...new Set(classes.map((c) => Q.dayLabel(c.id, d)))];
      const check = classes.reduce((n, c) => { const cd = Q.classDayOn(c.id, d); return n + (cd && !['unplanned', 'cancelled'].includes(cd.status) ? Q.dayCounts(cd).check : 0); }, 0);
      return '<a class="' + (d === date ? 'on' : '') + (d === KH.TODAY ? ' today' : '') + '" href="#' + DESK(comp, d) + (classSlug && d !== date ? '/' + classSlug : '') + '"><span class="b-d">' + W.date(d) + (d === KH.TODAY ? ' · today' : '') + '</span><span class="b-l">' + e(labels.join(' / ')) + '</span><span class="b-dots">' + classes.map((c) => dot(Q.classDayOn(c.id, d))).join('') + (check ? ' <span class="b-check">' + check + '</span>' : '') + '</span></a>';
    }).join('') + '</nav>';
  }

  function column(cls, date, ctx, focus) {
    const cd = Q.classDayOn(cls.id, date);
    const label = Q.dayLabel(cls.id, date);
    const head = '<div class="b-col-head"><div class="wf-row between"><a href="#' + COL(cls, date) + '"><b>' + e(cls.name) + '</b> · ' + e(label) + '</a>' + (cd ? W.dayBadge(cd.status) : '<span class="wf-badge none">untouched</span>') + '</div></div>';
    if (!cd) {
      return '<section class="b-col">' + head + '<div class="b-col-body"><p class="muted small">Nobody has touched this date for ' + e(cls.name) + '. It shows as unplanned in public.</p><div class="wf-stack">' +
        '<button class="wf-btn primary" data-act="touchDay" data-cls="' + cls.id + '" data-date="' + date + '" data-then="task">Add task candidate</button> ' +
        '<button class="wf-btn" data-act="touchDay" data-cls="' + cls.id + '" data-date="' + date + '" data-then="practice">Mark as practice day</button> ' +
        '<button class="wf-btn" data-act="touchDay" data-cls="' + cls.id + '" data-date="' + date + '" data-then="cancel">Cancel day</button></div></div></section>';
    }
    const task = Q.task(cd);
    const cands = Q.candidates(cd.id);
    const live = !['unplanned', 'cancelled'].includes(cd.status);
    const c = Q.dayCounts(cd);
    const stale = Q.staleFilesOf(cd);
    const base = CD(cd);
    const sel = ctx.result ? ctx.result.id : null;
    const show = ctx.query.show || '';
    let body = '<div class="b-col-body"><div class="b-block"><div class="wf-row between"><span class="muted small">Working status</span>' + W.select('status', KH.DAY_STATUSES, cd.status, 'data-change="setWorkingStatus" data-cd="' + cd.id + '"') + '</div>' +
      (cd.practice ? '<div class="small">Practice day</div>' : '') + '</div>';
    body += '<div class="b-block"><div class="wf-row between"><b class="small">Task</b><span class="wf-row"><a class="wf-btn small" href="#' + base + '/task">' + (task ? 'Candidates ' + cands.length : cands.length ? 'Candidates ' + cands.length : 'Enter or import') + '</a><a class="wf-btn small" href="#' + base + '/settings">Start, limits, airspace</a></span></div>' +
      (task ? '<div class="small"><a href="#' + links.candidate(task) + '"><b>' + e(task.letter) + '</b></a> ' + e(Q.taskLine(task)) + ', ' + W.km(Q.taskDistance(task)) + '</div>'
        : cands.length ? '<div class="small muted">No task published. ' + cands.map((t) => '<a href="#' + links.candidate(t) + '">' + e(t.letter || '(no letter)') + '</a> <button class="wf-btn small" data-act="publishTask" data-cand="' + t.id + '">Publish</button>').join(' ') + '</div>'
          : '<div class="small muted">No task candidates yet</div>') + '</div>';
    if (live) {
      const f = (k, n, l) => '<a class="wf-btn small' + (show === k ? ' primary' : '') + '" href="#' + KH.withQuery({ show: show === k ? '' : k }) + '">' + n + ' ' + l + '</a>';
      body += '<div class="b-block"><div class="wf-row">' + f('check', c.check, 'check') + f('unknown', c.unknown, 'unknown') + f('stale', c.stale, 'stale') + '<span class="muted small">' + c.ok + ' OK</span></div></div>';
      if (stale.length && (show === 'stale' || focus)) body += '<div class="b-block"><b class="small">Stale analyses</b><table class="wf-table"><tbody>' + stale.map((fl) => { const r = Q.resolve(fl); return '<tr><td><a href="#' + CD(cd) + '/files/' + fl.id + '">' + e(r.competitor.cid) + '</a> ' + W.staleBadge(fl) + '</td><td class="right"><button class="wf-btn small" data-act="rerun" data-file="' + fl.id + '">Rerun</button></td></tr>'; }).join('') + '</tbody></table></div>';
      const rows = KH.score(cd).rows.filter((x) => !show || (show === 'check' && x.result.checkReasons.length) || (show === 'unknown' && x.status === 'unknown') || (show === 'stale' && Q.filesOfResult(x.result).some((fl) => fl.analysis.stale.length)));
      body += '<div class="b-list"><table class="wf-table"><thead><tr><th>#</th><th>CID</th><th>Result</th><th>Review</th><th class="num">Pts</th></tr></thead><tbody>' +
        (rows.length ? rows.map((x) => { const r = x.result; return '<tr class="link' + (x.placeholder ? ' dim' : '') + (sel === r.id ? ' sel' : '') + '" data-href="' + links.result(r) + '"><td>' + e(x.rankLabel) + '</td><td><b>' + e(x.competitor.cid) + '</b> <span class="small muted">' + e(Q.crewName(x.competitor).split(' ').pop()) + '</span></td><td>' + W.resultStatus(r) + '</td><td>' + (r.checkReasons.length ? W.reviewBadge(r) : '') + (Q.filesOfResult(r).some((fl) => fl.analysis.stale.length) ? ' <span class="wf-badge dashed">stale</span>' : '') + '</td><td class="num">' + (x.points ?? '') + '</td></tr>'; }).join('') : '<tr><td colspan="5" class="muted">Nothing matches</td></tr>') +
        '</tbody></table></div>';
    }
    body += '<div class="b-block b-pub"><div class="wf-row between"><span class="small">' + (cd.published ? 'Published ' + W.dayBadge(cd.published.status) + ' ' + W.dt(cd.published.at) : 'Never published') + '</span><a class="wf-btn small' + (cd.reasons.length ? ' primary' : '') + '" href="#' + base + '/publish">Publish…</a></div>' +
      (cd.reasons.length ? '<div class="small muted">Unpublished: ' + e(cd.reasons.join(', ')) + '</div>' : '') + (Q.deadlinePassed(cd) ? '<div class="small"><b>Complaint deadline passed.</b> Ready for final.</div>' : '') + '</div></div>';
    return '<section class="b-col' + (focus ? ' focus' : '') + '">' + head + body + '</section>';
  }

  function deskBody(ctx, date) {
    const comp = ctx.comp;
    const classes = Q.classesOf(comp.id);
    if (!classes.length) return '<div class="wf-empty">No classes yet. <a href="#' + SU(comp) + '/classes/new">Add a class in setup</a> to plan its days.</div>';
    const focus = ctx.cls ? ctx.cls.id : null;
    const unresolved = Q.unresolvedFiles(comp.id).length;
    return '<div class="b-desk-top">' + dateStrip(comp, date) +
      '<div class="wf-row between b-desk-info"><span><b>' + W.date(date, true) + '</b>' + (date === KH.TODAY ? ' · today' : '') + '</span><span class="wf-row">' +
      (unresolved ? '<a href="#' + SU(comp) + '/files?state=unresolved">' + unresolved + ' unresolved IGC files</a>' : '') +
      '<a class="wf-btn small" href="#' + SU(comp) + '/files?date=' + date + '">IGC files of this date</a></span></div></div>' +
      '<div class="b-cols" style="grid-template-columns:repeat(' + classes.length + ', minmax(300px, 1fr))">' + classes.map((cls) => column(cls, date, ctx, cls.id === focus)).join('') + '</div>';
  }

  function deskPage(ctx, date, drawer) {
    const html = header(ctx) + '<main class="b-desk">' + blockedNote(ctx) + deskBody(ctx, date) + '</main>';
    if (!drawer) return html;
    return html + '<a class="b-scrim" href="#' + DESK(ctx.comp, date) + '" aria-label="Close"></a><aside class="b-drawer"><div class="b-drawer-head"><div>' + drawer.crumb + '<h2>' + drawer.title + '</h2></div><a class="wf-btn small" href="#' + (drawer.close || DESK(ctx.comp, date)) + '">Close</a></div><div class="b-drawer-body">' + drawer.body + '</div></aside>';
  }

  function drawerFor(ctx, title, body, close) {
    const cls = ctx.cls;
    const crumb = '<div class="muted small">' + e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, ctx.params.date)) + ' · ' + W.date(ctx.params.date, true) + (ctx.cd ? ' ' + W.dayBadge(ctx.cd.status) : '') + '</div>';
    return deskPage(ctx, ctx.params.date, { crumb, title, body, close });
  }

  function dateGuard(ctx) {
    const d = ctx.params.date;
    if (!isDate(d)) return page(ctx, 'Not found', '<div class="wf-empty">No page at ' + e(ctx.path) + '</div>');
    if (!ctx.comp.dates.includes(d)) return page(ctx, 'Not a competition date', '<div class="wf-empty">' + W.date(d, true) + ' is not a competition date. <a href="#' + SU(ctx.comp) + '/dates">Edit dates</a></div>');
    if (ctx.params.class && !ctx.cls) return page(ctx, 'Not found', '<div class="wf-empty">No such class</div>');
    return null;
  }
  function needCd(ctx) {
    return ctx.cd ? null : drawerFor(ctx, 'Untouched day', W.untouchedDay(ctx.cls, ctx.params.date));
  }

  // ---------- pages ----------

  const P = {};

  P['/'] = (ctx) => {
    const comps = Q.myCompetitions();
    return page(ctx, 'My competitions', '<div class="wf-stack">' + W.incomingInvitations() +
      '<table class="wf-table"><thead><tr><th>Competition</th><th>Dates</th><th>Your role</th><th>State</th><th></th></tr></thead><tbody>' +
      comps.map((c) => {
        const running = c.lifecycle !== 'archived' && c.dates.includes(KH.TODAY);
        return '<tr class="link" data-href="' + C(c) + '"><td><b>' + e(c.name) + '</b><div class="muted small">' + e(c.location) + ' · ' + e(c.organiser) + '</div></td><td>' + W.date(c.dates[0], true) + ' – ' + W.date(c.dates[c.dates.length - 1], true) + '</td><td>' + e(Q.roleIn(c)) + '</td><td>' + (c.blocked ? '<span class="wf-badge solid">blocked</span> ' : '') + (c.lifecycle === 'archived' ? 'archived' : c.dates[0] > KH.TODAY ? 'upcoming' : c.dates[c.dates.length - 1] < KH.TODAY ? 'finished' : 'running') + '</td><td class="right">' + (running ? '<a class="wf-btn small" href="#' + DESK(c, KH.TODAY) + '">Today’s desk</a>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>', '<a class="wf-btn primary" href="#/new">Create competition</a>');
  };
  P['/new'] = (ctx) => page(ctx, 'Create competition', '<div class="wf-box" style="max-width:880px">' + W.createCompetitionForm() + '</div>');
  P['/account'] = (ctx) => page(ctx, 'Account and invitations', W.incomingInvitations() + W.account());
  P['/staff/users'] = (ctx) => (Q.me().staff ? page(ctx, 'Users', '<p class="muted">The invitation tree. Each user records who invited them. Nothing acts on a whole branch automatically.</p>' + W.staffUsers()) : denied(ctx));
  P['/staff/competitions'] = (ctx) => (Q.me().staff ? page(ctx, 'All competitions', W.staffCompetitions()) : denied(ctx));

  function denied(ctx, msg) {
    return page(ctx, 'No access', '<div class="wf-empty">' + (msg || 'Switch to another role in the prototype bar.') + '</div>');
  }
  function guard(ctx) {
    if (!ctx.comp) return page({ ...ctx, comp: null }, 'Not found', '<div class="wf-empty">This competition does not exist.</div>');
    if (!Q.roleIn(ctx.comp)) {
      const ci = S.competitionInvitations.find((i) => i.competitionId === ctx.comp.id && i.inviteeId === Q.me().id);
      return page({ ...ctx, comp: null }, e(ctx.comp.name), '<div class="wf-empty">You are not a member of this competition.' + (ci ? '<p><button class="wf-btn primary" data-act="acceptCI" data-id="' + ci.id + '">Accept invitation as ' + ci.role + '</button></p>' : '') + '</div>');
    }
    if (ctx.comp.blocked && !Q.me().staff) return page({ ...ctx, comp: null }, 'Not found', '<div class="wf-empty">This competition does not exist.</div>');
    if (ctx.comp.lifecycle === 'archived' && ctx.path !== C(ctx.comp) && !/\/setup\/(members|archive)$/.test(ctx.path)) return P['/c/:comp'](ctx);
    return null;
  }

  function archived(ctx) {
    const comp = ctx.comp;
    return page(ctx, e(comp.name), '<div class="wf-stack"><div class="wf-note">Archived ' + W.dt(comp.archivedAt) + '. The scoring work was removed. Only the published results remain, and they can no longer change.</div>' +
      '<table class="wf-table"><thead><tr><th>Class</th><th>Published days</th><th>Competitors</th><th>Last status</th></tr></thead><tbody>' + comp.archive.classes.map((c) => '<tr><td>' + e(c.name) + '</td><td>' + c.days + '</td><td>' + c.competitors + '</td><td>' + W.dayBadge(c.lastStatus) + '</td></tr>').join('') + '</tbody></table>' +
      '<div class="wf-row"><a class="wf-btn" href="#' + SU(comp) + '/members">Members</a><a class="wf-btn" href="#' + SU(comp) + '/archive">Delete</a><a href="#" onclick="KH.toast(\'Public pages are out of scope for this prototype\');return false">Open public results ↗</a></div></div>');
  }

  P['/c/:comp'] = (ctx) => {
    if (ctx.comp.lifecycle === 'archived') return archived(ctx);
    if (!Q.classesOf(ctx.comp.id).length) return P['/c/:comp/setup'](ctx);
    return deskPage(ctx, deskDate(ctx.comp));
  };

  P['/c/:comp/:date'] = (ctx) => dateGuard(ctx) || deskPage(ctx, ctx.params.date);
  P['/c/:comp/:date/:class'] = (ctx) => {
    const g = dateGuard(ctx);
    if (g) return g;
    if (!ctx.cd) return drawerFor(ctx, 'Untouched day', W.untouchedDay(ctx.cls, ctx.params.date));
    const f = ctx.query.show || '';
    const c = Q.dayCounts(ctx.cd);
    const flt = (k, label) => '<a class="wf-btn small' + (f === k ? ' primary' : '') + '" href="#' + CD(ctx.cd) + (k ? '?show=' + k : '') + '">' + label + '</a>';
    const live = !['unplanned', 'cancelled'].includes(ctx.cd.status);
    return drawerFor(ctx, 'Class sheet', '<div class="wf-stack"><div class="wf-row"><a class="wf-btn small" href="#' + CD(ctx.cd) + '/task">Task</a><a class="wf-btn small" href="#' + CD(ctx.cd) + '/settings">Start, limits, airspace</a><a class="wf-btn small" href="#' + CD(ctx.cd) + '/publish">Publish</a></div>' +
      (live ? '<div class="wf-row">' + flt('', 'All ' + c.results) + flt('check', 'In check ' + c.check) + flt('unknown', 'Unknown ' + c.unknown) + flt('stale', 'Stale ' + c.stale) + '</div>' + W.resultsTable(ctx.cd, { filter: f }) : '<div class="wf-empty">No results on a ' + e(ctx.cd.status) + ' day.</div>') + '</div>');
  };
  P['/c/:comp/:date/:class/task'] = (ctx) => dateGuard(ctx) || needCd(ctx) || drawerFor(ctx, 'Task candidates', W.candidateList(ctx.cd));
  P['/c/:comp/:date/:class/task/:cand'] = (ctx) => dateGuard(ctx) || needCd(ctx) || drawerFor(ctx, 'Task ' + e((ctx.cand && ctx.cand.letter) || ''), ctx.cand ? '<p><a href="#' + CD(ctx.cd) + '/task">← All candidates</a></p>' + W.taskEditor(ctx.cand) : '<div class="wf-empty">No such candidate</div>');
  P['/c/:comp/:date/:class/settings'] = (ctx) => dateGuard(ctx) || needCd(ctx) || drawerFor(ctx, 'Start procedure, limits, airspace', '<div class="wf-stack"><div class="wf-box">' + W.dayOverrides(ctx.cd) + '</div><div class="wf-box">' + W.dayAirspace(ctx.cd) + '</div></div>');
  P['/c/:comp/:date/:class/publish'] = (ctx) => dateGuard(ctx) || needCd(ctx) || drawerFor(ctx, 'Publish results', '<div class="wf-stack"><div class="wf-box">' + W.publishPanel(ctx.cd) + '</div><div class="wf-box"><h3>Latest published copy</h3>' + W.publishedCopy(ctx.cd) + '</div></div>');

  function neighbours(ctx) {
    const rows = KH.score(ctx.cd).rows;
    const check = rows.filter((x) => x.result.checkReasons.length || x.result === ctx.result);
    const i = check.findIndex((x) => x.result === ctx.result);
    return { prev: check[i - 1], next: check[i + 1], pos: i + 1, total: check.length };
  }
  P['/c/:comp/:date/:class/results/:cid'] = (ctx) => {
    const g = dateGuard(ctx) || needCd(ctx);
    if (g) return g;
    if (!ctx.result) return drawerFor(ctx, 'Not found', '<div class="wf-empty">No such competitor in this class</div>');
    const r = ctx.result;
    const comp = ctx.competitor;
    const scored = r.scoredFileId ? Q.file(r.scoredFileId) : null;
    const task = Q.task(ctx.cd);
    const n = neighbours(ctx);
    const nav = '<div class="wf-row">' + (n.prev ? '<a class="wf-btn small" href="#' + links.result(n.prev.result) + '">← ' + e(n.prev.competitor.cid) + '</a>' : '') + '<span class="muted small">' + n.pos + ' of ' + n.total + ' in check</span>' + (n.next ? '<a class="wf-btn small" href="#' + links.result(n.next.result) + '">' + e(n.next.competitor.cid) + ' →</a>' : '') + '</div>';
    const body = '<div class="wf-stack"><div class="wf-row between"><div class="muted small">' + e(comp.gliderType) + (comp.handicap ? ', handicap ' + comp.handicap : '') + (comp.hc ? ', hors concours' : '') + ' · <a href="#' + links.competitor(comp) + '">competitor in setup</a></div>' + nav + '</div>' +
      W.checkReasons(r) + W.resultStatusControl(r) +
      '<div class="wf-box"><h3>Files</h3>' + W.resultFiles(r) + '</div>' +
      (r.status === 'manual result' ? '<div class="wf-box"><h3>Manual result</h3>' + W.manualForm(r) + '</div>' : '') +
      (scored ? '<div class="b-two"><div class="wf-box"><h3>Scored file: ' + e(scored.name) + ' ' + W.staleBadge(scored) + '</h3>' + W.outputSummary(scored) + '</div>' + (task ? W.taskMap(task.points, { track: scored.seed, finished: scored.analysis.output && scored.analysis.output.finished, h: 200 }) : '') + '</div>' +
        '<div class="wf-box"><h3>Start candidates</h3>' + W.startCandidates(scored) + '</div>' +
        '<div class="wf-box">' + W.analysisLog(scored) + '</div>' +
        '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(scored) + '</div>' : '') +
      '<div class="b-two"><div class="wf-box"><h3>Penalty</h3>' + W.penaltyForm(r) + '</div><div class="wf-box"><h3>Remarks and handicap</h3>' + W.resultRemarks(r) + '</div></div></div>';
    return drawerFor(ctx, e(comp.cid) + ' · ' + e(Q.crewName(comp)), body);
  };

  function fileBody(f) {
    const res = Q.resolve(f);
    const task = res.ok ? Q.task(res.classDay) : null;
    return '<div class="wf-stack"><div class="b-two"><div class="wf-box">' + W.fileMeta(f) + '</div><div class="wf-stack">' + (task ? W.taskMap(task.points, { track: f.seed, finished: f.analysis.output && f.analysis.output.finished }) : '<div class="wf-map" style="height:200px"><span class="tag">Map: track only</span></div>') + '<div class="wf-box">' + W.outputSummary(f) + '</div></div></div>' +
      (f.analysis.candidates && f.analysis.candidates.length ? '<div class="wf-box"><h3>Start candidates</h3>' + W.startCandidates(f) + '</div>' : '') +
      '<div class="wf-box">' + W.analysisLog(f) + '</div>' + (res.ok ? '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(f) + '</div>' : '') + '</div>';
  }
  P['/c/:comp/:date/:class/files/:file'] = (ctx) => {
    const g = dateGuard(ctx);
    if (g) return g;
    const f = ctx.file;
    if (!f) return drawerFor(ctx, 'Not found', '<div class="wf-empty">No such file</div>');
    const res = Q.resolve(f);
    const back = res.ok && res.classDay === ctx.cd ? links.result(res.result) : null;
    return drawerFor(ctx, e(f.name), (back ? '<p><a href="#' + back + '">← Result of ' + e(res.competitor.cid) + '</a></p>' : '') + fileBody(f));
  };

  // ---------- setup mode ----------

  P['/c/:comp/setup'] = (ctx) => {
    const comp = ctx.comp;
    const setup = W.setupState(comp);
    const classes = Q.classesOf(comp.id);
    const target = { details: 'details', airfield: 'details', classes: classes.length ? 'classes/' + classes[0].slug : 'classes/new', turnpoints: 'turnpoints', airspace: 'airspace', competitors: 'competitors', loggers: 'loggers', members: 'members' };
    const attention = [];
    for (const cls of classes) for (const cd of Q.classDaysOf(cls.id)) {
      if (Q.deadlinePassed(cd)) attention.push('<a href="#' + CD(cd) + '/publish">' + e(W.dayTitle(cd, cls)) + '</a>: complaint deadline passed, ready for final');
      else if (cd.reasons.length && cd.date !== KH.TODAY) attention.push('<a href="#' + CD(cd) + '/publish">' + e(W.dayTitle(cd, cls)) + '</a>: unpublished ' + e(cd.reasons.join(', ').toLowerCase()));
    }
    return setupPage(ctx, 'Setup', '<div class="wf-stack"><div class="wf-box"><h3>Setup steps</h3><div class="wf-steps">' + setup.map((s) => '<a class="' + (s.done ? 'done' : 'todo') + '" href="#' + SU(comp) + '/' + target[s.key] + '">' + (s.done ? '✓ ' : '') + e(s.label) + '</a>').join('') + '</div>' +
      (comp.createdAt > '2026-07-28' ? '<p class="muted small" style="margin-top:8px">Created ' + W.dt(comp.createdAt) + '. Set it up well before the practice day. Pilots can already upload test files with the password below.</p>' : '') + '</div>' +
      (attention.length ? '<div class="wf-box fill"><h3>Other dates need attention</h3><ul style="margin:0;padding-left:18px">' + attention.map((a) => '<li>' + a + '</li>').join('') + '</ul></div>' : '') +
      '<div><h3>Class day grid</h3><p class="muted small">Each cell opens that date’s desk with the class in focus.</p>' + W.classDayGrid(comp) + '</div><div class="wf-box" style="max-width:520px">' + W.uploadPassword(comp) + '</div></div>');
  };
  P['/c/:comp/setup/details'] = (ctx) => setupPage(ctx, 'Details and upload password', '<div class="wf-cols" style="grid-template-columns:2fr 1fr"><div class="wf-box">' + W.competitionDetails(ctx.comp) + '</div><div class="wf-stack"><div class="wf-box">' + W.uploadPassword(ctx.comp) + '</div><div class="wf-box fill small"><b>Organiser terms</b><br>' + e(ctx.comp.terms.version) + ' accepted by ' + e(Q.user(ctx.comp.terms.userId).name) + ' on ' + W.dt(ctx.comp.terms.at) + ' for ' + e(ctx.comp.terms.organiser) + '</div></div></div>');
  P['/c/:comp/setup/dates'] = (ctx) => setupPage(ctx, 'Dates and class days', '<div class="wf-stack"><div class="wf-box"><h3>Competition dates</h3>' + W.datesEditor(ctx.comp) + '</div><div><h3>Class day grid</h3><p class="muted small">A class day exists once someone touches its cell. Untouched past dates show as unplanned in public.</p>' + W.classDayGrid(ctx.comp) + '</div></div>');
  P['/c/:comp/setup/turnpoints'] = (ctx) => setupPage(ctx, 'Turnpoint file', W.turnpoints(ctx.comp));
  P['/c/:comp/setup/airspace'] = (ctx) => setupPage(ctx, 'Airspace file', W.airspace(ctx.comp));
  P['/c/:comp/setup/classes'] = (ctx) => {
    const classes = Q.classesOf(ctx.comp.id, true);
    return setupPage(ctx, 'Classes', '<table class="wf-table"><thead><tr><th>Class</th><th>Rule set edition</th><th>Handicapped</th><th class="num">Competitors</th><th class="num">Class days</th><th></th></tr></thead><tbody>' +
      (classes.length ? classes.map((c) => '<tr class="link' + (c.deleted ? ' dim' : '') + '" data-href="' + links.cls(c) + '"><td><b>' + e(c.name) + '</b>' + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : '') + '</td><td>' + e(c.edition) + '</td><td>' + (c.handicapScale ? 'scale ' + c.handicapScale + ', ' + e(c.handicapList) : 'no') + '</td><td class="num">' + Q.competitorsOf(ctx.comp.id, c.id).length + '</td><td class="num">' + Q.classDaysOf(c.id).length + '</td><td class="right">' + (c.deleted ? '<button class="wf-btn small" data-act="restoreClass" data-cls="' + c.id + '">Restore</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="6" class="muted">No classes yet</td></tr>') +
      '</tbody></table>', '<a class="wf-btn primary" href="#' + SU(ctx.comp) + '/classes/new">Add class</a>');
  };
  P['/c/:comp/setup/classes/new'] = (ctx) => setupPage(ctx, 'Add class', '<div class="wf-box">' + W.classForm(ctx.comp) + '</div>');
  P['/c/:comp/setup/classes/:class'] = (ctx) => {
    if (!ctx.cls) return setupPage(ctx, 'Not found', '<div class="wf-empty">No such class</div>');
    return setupPage(ctx, e(ctx.cls.name), '<div class="wf-stack"><div class="wf-row"><a class="wf-btn" href="#' + SU(ctx.comp) + '/competitors?class=' + ctx.cls.slug + '">Competitors (' + Q.competitorsOf(ctx.comp.id, ctx.cls.id).length + ')</a><a class="wf-btn" href="#' + SU(ctx.comp) + '/dates">Class days (' + Q.classDaysOf(ctx.cls.id).length + ')</a></div><div class="wf-box">' + W.classForm(ctx.comp, ctx.cls) + '</div></div>');
  };
  P['/c/:comp/setup/competitors'] = (ctx) => {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    const base = SU(ctx.comp) + '/competitors';
    return setupPage(ctx, 'Competitors', '<div class="wf-stack"><div class="wf-row"><a class="wf-btn small' + (!cls ? ' primary' : '') + '" href="#' + base + '">All</a>' + Q.classesOf(ctx.comp.id).map((c) => '<a class="wf-btn small' + (cls === c ? ' primary' : '') + '" href="#' + base + '?class=' + c.slug + '">' + e(c.name) + ' ' + Q.competitorsOf(ctx.comp.id, c.id).length + '</a>').join('') + '</div>' + W.competitorsTable(ctx.comp, cls && cls.id) + '</div>', '<a class="wf-btn primary" href="#' + base + '/new' + (cls ? '?class=' + cls.slug : '') + '">Add competitor</a>');
  };
  P['/c/:comp/setup/competitors/new'] = (ctx) => {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    return setupPage(ctx, 'Add competitor', '<div class="wf-box">' + W.competitorForm(ctx.comp, null, cls && cls.id) + '</div>');
  };
  P['/c/:comp/setup/competitors/:competitor'] = (ctx) => {
    const c = ctx.competitor;
    if (!c) return setupPage(ctx, 'Not found', '<div class="wf-empty">No such competitor</div>');
    const loggers = Q.loggersOf(ctx.comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
    const days = Q.classDaysOf(c.classId).filter((cd) => !['unplanned', 'cancelled'].includes(cd.status));
    return setupPage(ctx, e(c.cid) + ' · ' + e(Q.crewName(c)) + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : ''), '<div class="wf-cols" style="grid-template-columns:3fr 2fr"><div class="wf-box">' + W.competitorForm(ctx.comp, c) + '</div><div class="wf-stack">' +
      '<div class="wf-box"><h3>Loggers</h3>' + (loggers.length ? '<table class="wf-table"><tbody>' + loggers.map((l) => '<tr><td><a href="#' + links.logger(l) + '">' + e(Q.loggerLabel(l)) + '</a></td><td>' + l.links.filter((k) => k.competitorId === c.id).map((k) => k.role + (k.from ? ' from ' + W.date(k.from) : '')).join(', ') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted small">No loggers linked</p>') + '<a class="wf-btn small" href="#' + SU(ctx.comp) + '/loggers/new">Add logger</a></div>' +
      '<div class="wf-box"><h3>Results</h3><table class="wf-table"><tbody>' + days.map((cd) => { const r = Q.resultFor(cd.id, c.id); return '<tr class="link" data-href="' + links.result(r) + '"><td>' + e(Q.dayLabel(cd.classId, cd.date)) + '</td><td>' + W.resultStatus(r) + '</td><td>' + W.reviewBadge(r) + '</td><td>' + (r.penalty ? '−' + r.penalty.points : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="wf-box">' + W.dsqPanel(c) + '</div></div></div>');
  };
  P['/c/:comp/setup/loggers'] = (ctx) => setupPage(ctx, 'Loggers', W.loggersTable(ctx.comp), '<a class="wf-btn primary" href="#' + SU(ctx.comp) + '/loggers/new">Add logger</a>');
  P['/c/:comp/setup/loggers/new'] = (ctx) => setupPage(ctx, 'Add logger', '<div class="wf-box">' + W.loggerForm(ctx.comp) + '</div>');
  P['/c/:comp/setup/loggers/:logger'] = (ctx) => {
    const l = ctx.logger;
    if (!l) return setupPage(ctx, 'Not found', '<div class="wf-empty">No such logger</div>');
    const rows = S.files.filter((f) => f.loggerId === l.id).map((f) => ({ f, res: Q.resolve(f) }));
    return setupPage(ctx, 'Logger ' + e(Q.loggerLabel(l)), '<div class="wf-stack"><div class="wf-box"><h3>Dated links</h3>' + W.loggerLinks(l) + '</div><div class="wf-box"><h3>Thresholds</h3>' + W.loggerForm(ctx.comp, l) + '</div><div class="wf-box"><h3>Files</h3>' + W.filesTable(rows) + '</div></div>');
  };
  P['/c/:comp/setup/files'] = (ctx) => {
    const base = SU(ctx.comp) + '/files';
    const { rows, hiddenUnresolved } = W.filterFiles(ctx.comp, ctx.query);
    return setupPage(ctx, 'IGC files', '<div class="wf-stack">' + W.fileFilters(ctx.comp, ctx.query, base) +
      (hiddenUnresolved ? '<div class="wf-note warn">' + hiddenUnresolved + ' unresolved files are hidden by this filter. <a href="#' + base + '?state=unresolved">Show unresolved</a></div>' : '') +
      '<div class="muted small">' + rows.length + ' files</div>' + W.filesTable(rows.slice(0, 200)) + (rows.length > 200 ? '<p class="muted small">First 200 shown</p>' : '') +
      '<details><summary>Upload a file as scorer</summary><div class="wf-box" style="margin-top:8px">' + W.scorerUploadForm(ctx.comp) + '</div></details></div>');
  };
  P['/c/:comp/setup/files/:file'] = (ctx) => (ctx.file ? setupPage(ctx, e(ctx.file.name), '<p><a href="#' + SU(ctx.comp) + '/files">← IGC files</a></p>' + fileBody(ctx.file)) : setupPage(ctx, 'Not found', '<div class="wf-empty">No such file</div>'));
  P['/c/:comp/setup/members'] = (ctx) => setupPage(ctx, 'Members and invitations', W.members(ctx.comp));
  P['/c/:comp/setup/archive'] = (ctx) => setupPage(ctx, ctx.comp.lifecycle === 'archived' ? 'Delete' : 'Archive or delete', W.lifecycle(ctx.comp));

  KH.mount({
    id: 'b',
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
