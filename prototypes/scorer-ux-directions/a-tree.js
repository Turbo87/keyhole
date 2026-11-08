// PROTOTYPE: Direction A, "Tree". A persistent sidebar mirrors the domain hierarchy and every object has its own page.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const S = KH.state;
  const e = KH.esc;

  const C = (comp) => '/c/' + comp.slug;
  const CL = (cls) => C(Q.competition(cls.competitionId)) + '/classes/' + cls.slug;
  const CD = (cd) => CL(Q.class(cd.classId)) + '/days/' + cd.date;

  const links = {
    competition: C,
    cls: CL,
    classDay: CD,
    classDayDate: (cls, date) => CL(cls) + '/days/' + date,
    classDayTasks: (cd) => CD(cd) + '/tasks',
    candidate: (t) => CD(Q.classDay(t.classDayId)) + '/tasks/' + t.id,
    result: (r) => CD(Q.classDay(r.classDayId)) + '/results/' + Q.competitor(r.competitorId).cid,
    file: (f) => C(Q.competition(Q.logger(f.loggerId).competitionId)) + '/files/' + f.id,
    competitor: (c) => C(Q.competition(c.competitionId)) + '/competitors/' + c.id,
    competitors: (comp) => C(comp) + '/competitors',
    logger: (l) => C(Q.competition(l.competitionId)) + '/loggers/' + l.id,
    files: (comp) => C(comp) + '/files',
  };

  const EX = '/c/oberrhein-2026';
  const EXD = EX + '/classes/club/days/2026-07-28';
  const routes = [
    { path: '/', title: 'My competitions', group: 'Account', example: '/' },
    { path: '/new', title: 'Create competition', group: 'Account', example: '/new' },
    { path: '/account', title: 'Account and invitations', group: 'Account', example: '/account' },
    { path: '/staff/users', title: 'Users and invitation tree (staff)', group: 'Staff', example: '/staff/users' },
    { path: '/staff/competitions', title: 'All competitions (staff)', group: 'Staff', example: '/staff/competitions' },
    { path: '/c/:comp', title: 'Competition overview', group: 'Competition', example: EX },
    { path: '/c/:comp/details', title: 'Details and upload password', group: 'Setup', example: EX + '/details' },
    { path: '/c/:comp/dates', title: 'Dates and class day grid', group: 'Setup', example: EX + '/dates' },
    { path: '/c/:comp/turnpoints', title: 'Turnpoint file', group: 'Setup', example: EX + '/turnpoints' },
    { path: '/c/:comp/airspace', title: 'Airspace file', group: 'Setup', example: EX + '/airspace' },
    { path: '/c/:comp/classes', title: 'Classes', group: 'Setup', example: EX + '/classes' },
    { path: '/c/:comp/classes/new', title: 'Add class', group: 'Setup', example: EX + '/classes/new' },
    { path: '/c/:comp/classes/:class', title: 'Class settings', group: 'Setup', example: EX + '/classes/club' },
    { path: '/c/:comp/competitors', title: 'Competitors', group: 'Setup', example: EX + '/competitors' },
    { path: '/c/:comp/competitors/new', title: 'Add competitor', group: 'Setup', example: EX + '/competitors/new' },
    { path: '/c/:comp/competitors/:competitor', title: 'Competitor', group: 'Setup', example: EX + '/competitors/p1' },
    { path: '/c/:comp/loggers', title: 'Loggers', group: 'Setup', example: EX + '/loggers' },
    { path: '/c/:comp/loggers/new', title: 'Add logger', group: 'Setup', example: EX + '/loggers/new' },
    { path: '/c/:comp/loggers/:logger', title: 'Logger and links', group: 'Setup', example: EX + '/loggers/lx1' },
    { path: '/c/:comp/classes/:class/days', title: 'Class days of a class', group: 'Class days', example: EX + '/classes/club/days' },
    { path: '/c/:comp/classes/:class/days/:date', title: 'Class day overview', group: 'Class days', example: EXD },
    { path: '/c/:comp/classes/:class/days/:date/tasks', title: 'Task candidates', group: 'Class days', example: EXD + '/tasks' },
    { path: '/c/:comp/classes/:class/days/:date/tasks/:cand', title: 'Task candidate editor', group: 'Class days', example: null },
    { path: '/c/:comp/classes/:class/days/:date/settings', title: 'Start procedure, limits, airspace', group: 'Class days', example: EXD + '/settings' },
    { path: '/c/:comp/classes/:class/days/:date/results', title: 'Results', group: 'Class days', example: EXD + '/results' },
    { path: '/c/:comp/classes/:class/days/:date/results/:cid', title: 'Result review', group: 'Class days', example: null },
    { path: '/c/:comp/classes/:class/days/:date/publish', title: 'Publish', group: 'Class days', example: EXD + '/publish' },
    { path: '/c/:comp/files', title: 'IGC files', group: 'Competition', example: EX + '/files' },
    { path: '/c/:comp/files/:file', title: 'IGC file', group: 'Competition', example: null },
    { path: '/c/:comp/members', title: 'Members and invitations', group: 'Competition', example: EX + '/members' },
    { path: '/c/:comp/lifecycle', title: 'Archive or delete', group: 'Competition', example: EX + '/lifecycle' },
  ];

  // ---------- shell ----------

  function header(ctx) {
    const me = Q.me();
    const comps = Q.myCompetitions();
    return '<header class="a-head"><a class="a-brand" href="#/">Keyhole</a>' +
      (ctx.comp ? '<select class="a-switch" onchange="location.hash=this.value">' + comps.map((c) => '<option value="#' + C(c) + '"' + (c === ctx.comp ? ' selected' : '') + '>' + e(c.name) + '</option>').join('') + '<option value="#/">All competitions…</option></select>' : '') +
      '<span class="grow"></span>' + (me.staff ? '<a href="#/staff/users">Staff</a>' : '') + '<a href="#/account">' + e(me.name) + '</a><span class="muted small">' + (ctx.comp ? e(Q.roleIn(ctx.comp) || 'no role') : me.staff ? 'staff' : '') + '</span><a href="#/" onclick="KH.toast(\'Prototype: would sign out\');return false" class="muted">Sign out</a></header>';
  }

  function navItem(href, label, ctx, extra, depth) {
    const cur = '#' + ctx.path === '#' + href;
    const within = ctx.path.startsWith(href + '/');
    return '<a class="a-nav' + (cur ? ' cur' : within ? ' within' : '') + '" style="padding-left:' + (10 + (depth || 0) * 14) + 'px" href="#' + href + '">' + label + (extra ? '<span class="a-nav-x">' + extra + '</span>' : '') + '</a>';
  }

  function sidebar(ctx) {
    const comp = ctx.comp;
    if (!comp) {
      const me = Q.me();
      return '<nav class="a-side">' + navItem('/', 'My competitions', ctx) + navItem('/new', 'Create competition', ctx) + navItem('/account', 'Account and invitations', ctx) +
        (me.staff ? '<div class="a-sec">Staff</div>' + navItem('/staff/users', 'Users', ctx) + navItem('/staff/competitions', 'Competitions', ctx) : '') + '</nav>';
    }
    if (comp.lifecycle === 'archived') return '<nav class="a-side"><div class="a-sec">' + e(comp.name) + '</div>' + navItem(C(comp), 'Overview', ctx) + navItem(C(comp) + '/members', 'Members', ctx) + navItem(C(comp) + '/lifecycle', 'Delete', ctx) + '</nav>';
    const classes = Q.classesOf(comp.id);
    const unresolved = Q.unresolvedFiles(comp.id).length;
    const base = C(comp);
    let html = '<nav class="a-side"><div class="a-sec">' + e(comp.name) + '</div>' +
      navItem(base, 'Overview', ctx) + navItem(base + '/details', 'Details and password', ctx) + navItem(base + '/dates', 'Dates and class days', ctx) +
      navItem(base + '/classes', 'Classes', ctx.params.date ? { ...ctx, path: '' } : ctx, String(classes.length)) +
      navItem(base + '/turnpoints', 'Turnpoints', ctx, comp.turnpointFile ? '' : '—') + navItem(base + '/airspace', 'Airspace', ctx, comp.airspaceFile ? '' : '—') +
      navItem(base + '/competitors', 'Competitors', ctx, String(Q.competitorsOf(comp.id).length)) + navItem(base + '/loggers', 'Loggers', ctx, String(Q.loggersOf(comp.id).length)) +
      navItem(base + '/files', 'IGC files', ctx, unresolved ? unresolved + ' unresolved' : '') + navItem(base + '/members', 'Members', ctx) + navItem(base + '/lifecycle', 'Archive or delete', ctx);
    html += '<div class="a-sec">Days</div>';
    if (!classes.length) html += '<div class="muted small" style="padding:4px 10px">Add a class to plan its days</div>';
    const openDate = ctx.params.date || (comp.dates.includes(KH.TODAY) ? KH.TODAY : null);
    const dot = (cd) => (cd ? '<span class="a-dot ' + cd.status.replace(' ', '-') + '" title="' + cd.status + '"></span>' : '<span class="a-dot none" title="untouched"></span>');
    for (const date of classes.length ? comp.dates : []) {
      const labels = [...new Set(classes.map((c) => Q.dayLabel(c.id, date)))];
      const open = date === openDate;
      const label = (open ? '▾ ' : '▸ ') + W.date(date) + (labels.length === 1 ? ' <span class="muted small">' + e(labels[0]) + '</span>' : '');
      const dots = open ? '' : classes.map((c) => dot(Q.classDayOn(c.id, date))).join('');
      html += navItem(CL(classes[0]) + '/days/' + date, label, { ...ctx, path: ctx.params.date === date ? '' : ctx.path }, dots, 0);
      if (!open) continue;
      for (const cls of classes) {
        const cd = Q.classDayOn(cls.id, date);
        const counts = cd && !['unplanned', 'cancelled'].includes(cd.status) ? Q.dayCounts(cd) : null;
        const x = (counts && counts.check ? counts.check + ' check ' : '') + dot(cd);
        html += navItem(CL(cls) + '/days/' + date, e(cls.name) + (labels.length > 1 ? ' <span class="muted small">' + e(Q.dayLabel(cls.id, date)) + '</span>' : ''), ctx, x, 1);
      }
    }
    return html + '</nav>';
  }

  function crumbs(ctx) {
    const out = [];
    if (ctx.comp) out.push(['#' + C(ctx.comp), ctx.comp.name]);
    if (ctx.cls && ctx.params.date) {
      out.push(['#' + CL(Q.classesOf(ctx.comp.id)[0]) + '/days/' + ctx.params.date, W.date(ctx.params.date, true)]);
      out.push(['#' + CL(ctx.cls) + '/days/' + ctx.params.date, ctx.cls.name + ' · ' + Q.dayLabel(ctx.cls.id, ctx.params.date)]);
    } else if (ctx.cls || ctx.path.endsWith('/classes/new')) {
      out.push(['#' + C(ctx.comp) + '/classes', 'Classes']);
      if (ctx.cls) out.push(['#' + CL(ctx.cls), ctx.cls.name]);
    }
    if (ctx.cand) out.push(['#' + links.classDayTasks(ctx.cd), 'Tasks']);
    if (ctx.params.cid) out.push(['#' + CD(ctx.cd) + '/results', 'Results']);
    if (ctx.file) out.push(['#' + C(ctx.comp) + '/files', 'IGC files']);
    if (ctx.logger) out.push(['#' + C(ctx.comp) + '/loggers', 'Loggers']);
    if (ctx.params.competitor) out.push(['#' + C(ctx.comp) + '/competitors', 'Competitors']);
    return out.length ? '<div class="a-crumbs">' + out.map(([h, t]) => '<a href="' + h + '">' + e(t) + '</a>').join(' / ') + '</div>' : '';
  }

  function page(ctx, title, body, actions) {
    return header(ctx) + '<div class="a-body">' + sidebar(ctx) + '<main class="a-main">' + crumbs(ctx) +
      (ctx.comp && ctx.comp.blocked ? '<div class="wf-note warn">Blocked by staff ' + W.dt(ctx.comp.blocked.at) + ': ' + e(ctx.comp.blocked.note) + '. Only staff can see this competition.</div>' : '') +
      '<div class="wf-row between a-title"><h1>' + title + '</h1><div class="wf-row">' + (actions || '') + '</div></div>' + body + '</main></div>';
  }

  // ---------- pages ----------

  const P = {};

  P['/'] = (ctx) => {
    const comps = Q.myCompetitions();
    return page(ctx, 'My competitions', '<div class="wf-stack">' + W.incomingInvitations() +
      '<table class="wf-table"><thead><tr><th>Competition</th><th>Dates</th><th>Your role</th><th>State</th></tr></thead><tbody>' +
      comps.map((c) => '<tr class="link" data-href="' + C(c) + '"><td><b>' + e(c.name) + '</b><div class="muted small">' + e(c.location) + ' · ' + e(c.organiser) + '</div></td><td>' + W.date(c.dates[0], true) + ' – ' + W.date(c.dates[c.dates.length - 1], true) + '</td><td>' + e(Q.roleIn(c)) + '</td><td>' + (c.blocked ? '<span class="wf-badge solid">blocked</span> ' : '') + (c.lifecycle === 'archived' ? 'archived' : c.dates[0] > KH.TODAY ? 'upcoming' : c.dates[c.dates.length - 1] < KH.TODAY ? 'finished' : 'running') + '</td></tr>').join('') +
      '</tbody></table></div>', '<a class="wf-btn primary" href="#/new">Create competition</a>');
  };
  P['/new'] = (ctx) => page(ctx, 'Create competition', '<div class="wf-box" style="max-width:880px">' + W.createCompetitionForm() + '</div>');
  P['/account'] = (ctx) => page(ctx, 'Account and invitations', W.incomingInvitations() + W.account());
  P['/staff/users'] = (ctx) => (Q.me().staff ? page(ctx, 'Users', '<p class="muted">The invitation tree. Each user records who invited them. Nothing acts on a whole branch automatically.</p>' + W.staffUsers()) : denied(ctx));
  P['/staff/competitions'] = (ctx) => (Q.me().staff ? page(ctx, 'All competitions', W.staffCompetitions()) : denied(ctx));

  function denied(ctx, msg) {
    return page(ctx, 'No access', '<div class="wf-empty">' + (msg || 'Switch to another role in the prototype bar.') + '</div>');
  }
  function guard(ctx) {
    if (!ctx.comp) return page(ctx, 'Not found', '<div class="wf-empty">This competition does not exist.</div>');
    if (!Q.roleIn(ctx.comp)) {
      const ci = S.competitionInvitations.find((i) => i.competitionId === ctx.comp.id && i.inviteeId === Q.me().id);
      return page({ ...ctx, comp: null }, ctx.comp.name, '<div class="wf-empty">You are not a member of this competition.' + (ci ? '<p><button class="wf-btn primary" data-act="acceptCI" data-id="' + ci.id + '">Accept invitation as ' + ci.role + '</button></p>' : '') + '</div>');
    }
    if (ctx.comp.blocked && !Q.me().staff) return page({ ...ctx, comp: null }, 'Not found', '<div class="wf-empty">This competition does not exist.</div>');
    return null;
  }

  P['/c/:comp'] = (ctx) => {
    const comp = ctx.comp;
    if (comp.lifecycle === 'archived') {
      return page(ctx, e(comp.name), '<div class="wf-stack"><div class="wf-note">Archived ' + W.dt(comp.archivedAt) + '. The scoring work was removed. Only the published results remain, and they can no longer change.</div>' +
        '<table class="wf-table"><thead><tr><th>Class</th><th>Published days</th><th>Competitors</th><th>Last status</th></tr></thead><tbody>' + comp.archive.classes.map((c) => '<tr><td>' + e(c.name) + '</td><td>' + c.days + '</td><td>' + c.competitors + '</td><td>' + W.dayBadge(c.lastStatus) + '</td></tr>').join('') + '</tbody></table>' +
        '<p><a href="#" onclick="KH.toast(\'Public pages are out of scope for this prototype\');return false">Open public results ↗</a></p></div>');
    }
    const setup = W.setupState(comp);
    const missing = setup.filter((s) => !s.done);
    const classes = Q.classesOf(comp.id);
    const todayRows = classes.map((cls) => {
      const cd = Q.classDayOn(cls.id, KH.TODAY);
      if (!cd) return '';
      const c = Q.dayCounts(cd);
      return '<tr class="link" data-href="' + CD(cd) + '/results"><td><b>' + e(cls.name) + '</b> ' + e(Q.dayLabel(cls.id, cd.date)) + '</td><td>' + W.dayBadge(cd.status) + '</td><td>' + (Q.task(cd) ? 'Task ' + e(Q.task(cd).letter) : '—') + '</td><td class="num">' + c.check + '</td><td class="num">' + c.unknown + '</td><td class="num">' + c.stale + '</td><td>' + W.unpublished(cd) + '</td></tr>';
    }).join('');
    const attention = [];
    for (const cls of classes) for (const cd of Q.classDaysOf(cls.id)) {
      if (Q.deadlinePassed(cd)) attention.push('<a href="#' + CD(cd) + '/publish">' + e(W.dayTitle(cd, cls)) + '</a>: complaint deadline passed, ready for final');
      else if (cd.reasons.length && cd.date !== KH.TODAY) attention.push('<a href="#' + CD(cd) + '/publish">' + e(W.dayTitle(cd, cls)) + '</a>: unpublished ' + e(cd.reasons.join(', ').toLowerCase()));
    }
    const unresolved = Q.unresolvedFiles(comp.id).length;
    if (unresolved) attention.push('<a href="#' + C(comp) + '/files?state=unresolved">' + unresolved + ' unresolved IGC files</a>');
    return page(ctx, e(comp.name), '<div class="wf-stack">' +
      (missing.length ? '<div class="wf-box"><h3>Setup</h3><div class="wf-steps">' + setup.map((s) => '<a class="' + (s.done ? 'done' : 'todo') + '" href="#' + C(comp) + '/' + ({ details: 'details', airfield: 'details', classes: classes.length ? 'classes/' + classes[0].slug : 'classes/new', turnpoints: 'turnpoints', airspace: 'airspace', competitors: 'competitors', loggers: 'loggers', members: 'members' })[s.key] + '">' + (s.done ? '✓ ' : '') + e(s.label) + '</a>').join('') + '</div>' +
        (comp.createdAt > '2026-07-28' ? '<p class="muted small" style="margin-top:8px">Created ' + W.dt(comp.createdAt) + '. Set it up well before the practice day. Pilots can already upload test files with the password below.</p>' : '') + '</div>' : '') +
      (todayRows ? '<div><h2>Today, ' + W.date(KH.TODAY, true) + '</h2><table class="wf-table"><thead><tr><th>Class day</th><th>Status</th><th>Task</th><th class="num">In check</th><th class="num">Unknown</th><th class="num">Stale files</th><th></th></tr></thead><tbody>' + todayRows + '</tbody></table></div>' : '') +
      (attention.length ? '<div class="wf-box fill"><h3>Needs attention</h3><ul style="margin:0;padding-left:18px">' + attention.map((a) => '<li>' + a + '</li>').join('') + '</ul></div>' : '') +
      '<div><h2>Class days</h2>' + W.classDayGrid(comp) + '</div>' +
      '<div class="wf-box" style="max-width:520px">' + W.uploadPassword(comp) + '</div></div>');
  };
  P['/c/:comp/details'] = (ctx) => page(ctx, 'Details and upload password', '<div class="wf-cols" style="grid-template-columns:2fr 1fr"><div class="wf-box">' + W.competitionDetails(ctx.comp) + '</div><div class="wf-stack"><div class="wf-box">' + W.uploadPassword(ctx.comp) + '</div><div class="wf-box fill small"><b>Organiser terms</b><br>' + e(ctx.comp.terms.version) + ' accepted by ' + e(Q.user(ctx.comp.terms.userId).name) + ' on ' + W.dt(ctx.comp.terms.at) + ' for ' + e(ctx.comp.terms.organiser) + '</div></div></div>');
  P['/c/:comp/dates'] = (ctx) => page(ctx, 'Dates and class days', '<div class="wf-stack"><div class="wf-box"><h3>Competition dates</h3>' + W.datesEditor(ctx.comp) + '</div><div><h3>Class day grid</h3><p class="muted small">A class day exists once someone touches its cell. Untouched past dates show as unplanned in public.</p>' + W.classDayGrid(ctx.comp) + '</div></div>');
  P['/c/:comp/turnpoints'] = (ctx) => page(ctx, 'Turnpoint file', W.turnpoints(ctx.comp));
  P['/c/:comp/airspace'] = (ctx) => page(ctx, 'Airspace file', W.airspace(ctx.comp));
  P['/c/:comp/classes'] = (ctx) => {
    const classes = Q.classesOf(ctx.comp.id, true);
    return page(ctx, 'Classes', '<table class="wf-table"><thead><tr><th>Class</th><th>Rule set edition</th><th>Handicapped</th><th class="num">Competitors</th><th class="num">Class days</th><th></th></tr></thead><tbody>' +
      (classes.length ? classes.map((c) => '<tr class="link' + (c.deleted ? ' dim' : '') + '" data-href="' + CL(c) + '"><td><b>' + e(c.name) + '</b>' + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : '') + '</td><td>' + e(c.edition) + '</td><td>' + (c.handicapScale ? 'scale ' + c.handicapScale + ', ' + e(c.handicapList) : 'no') + '</td><td class="num">' + Q.competitorsOf(ctx.comp.id, c.id).length + '</td><td class="num">' + Q.classDaysOf(c.id).length + '</td><td class="right">' + (c.deleted ? '<button class="wf-btn small" data-act="restoreClass" data-cls="' + c.id + '">Restore</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="6" class="muted">No classes yet</td></tr>') +
      '</tbody></table>', '<a class="wf-btn primary" href="#' + C(ctx.comp) + '/classes/new">Add class</a>');
  };
  P['/c/:comp/classes/new'] = (ctx) => page(ctx, 'Add class', '<div class="wf-box">' + W.classForm(ctx.comp) + '</div>');
  P['/c/:comp/classes/:class'] = (ctx) => {
    if (!ctx.cls) return page(ctx, 'Not found', '<div class="wf-empty">No such class</div>');
    const days = Q.classDaysOf(ctx.cls.id);
    return page(ctx, e(ctx.cls.name), '<div class="wf-stack"><div class="wf-row"><a class="wf-btn" href="#' + CL(ctx.cls) + '/days">Class days (' + days.length + ')</a><a class="wf-btn" href="#' + C(ctx.comp) + '/competitors">Competitors (' + Q.competitorsOf(ctx.comp.id, ctx.cls.id).length + ')</a></div><div class="wf-box">' + W.classForm(ctx.comp, ctx.cls) + '</div></div>');
  };
  P['/c/:comp/classes/:class/days'] = (ctx) => {
    const cls = ctx.cls;
    return page(ctx, e(cls.name) + ' class days', '<table class="wf-table"><thead><tr><th>Day</th><th>Date</th><th>Status</th><th>Task</th><th class="num">Check</th><th class="num">Unknown</th><th class="num">Stale</th><th>Published</th></tr></thead><tbody>' +
      ctx.comp.dates.map((d) => {
        const cd = Q.classDayOn(cls.id, d);
        if (!cd) return '<tr class="link dim" data-href="' + CL(cls) + '/days/' + d + '"><td>' + e(Q.dayLabel(cls.id, d)) + '</td><td>' + W.date(d) + '</td><td colspan="6">untouched</td></tr>';
        const c = Q.dayCounts(cd);
        const live = !['unplanned', 'cancelled'].includes(cd.status);
        return '<tr class="link" data-href="' + CD(cd) + '"><td>' + e(Q.dayLabel(cls.id, d)) + '</td><td>' + W.date(d) + '</td><td>' + W.dayBadge(cd.status) + (Q.deadlinePassed(cd) ? ' <span class="wf-badge">deadline passed</span>' : '') + '</td><td>' + (Q.task(cd) ? e(Q.task(cd).letter) + ' · ' + W.km(Q.taskDistance(Q.task(cd))) : '') + '</td><td class="num">' + (live ? c.check : '') + '</td><td class="num">' + (live ? c.unknown : '') + '</td><td class="num">' + (live ? c.stale : '') + '</td><td>' + (cd.published ? W.dayBadge(cd.published.status) : '') + ' ' + W.unpublished(cd) + '</td></tr>';
      }).join('') + '</tbody></table>');
  };

  function dayTabs(ctx, cur) {
    const cd = ctx.cd;
    const c = Q.dayCounts(cd);
    const t = (k, label, x) => '<a class="' + (cur === k ? 'on' : '') + '" href="#' + CD(cd) + (k ? '/' + k : '') + '">' + label + (x ? ' <span class="wf-badge">' + x + '</span>' : '') + '</a>';
    return '<div class="wf-tabs">' + t('', 'Overview') + t('tasks', 'Tasks', Q.task(cd) ? Q.task(cd).letter : '') + t('settings', 'Start, limits, airspace') + t('results', 'Results', c.check ? c.check + ' check' : '') + t('publish', 'Publish', cd.reasons.length ? 'changes' : '') + '</div>';
  }
  function dayPage(ctx, tab, body, actions) {
    if (!ctx.cls) return page(ctx, 'Not found', '<div class="wf-empty">No such class</div>');
    if (!ctx.comp.dates.includes(ctx.params.date)) return page(ctx, 'Not a competition date', '<div class="wf-empty">' + W.date(ctx.params.date, true) + ' is not a competition date.</div>');
    if (!ctx.cd) return page(ctx, e(ctx.cls.name) + ' · ' + e(Q.dayLabel(ctx.cls.id, ctx.params.date)), W.untouchedDay(ctx.cls, ctx.params.date));
    const title = e(ctx.cls.name) + ' · ' + e(Q.dayLabel(ctx.cls.id, ctx.cd.date)) + ' <span class="muted" style="font-weight:400">' + W.date(ctx.cd.date, true) + '</span> ' + W.dayBadge(ctx.cd.status);
    return page(ctx, title, dayTabs(ctx, tab) + body, actions);
  }

  P['/c/:comp/classes/:class/days/:date'] = (ctx) => {
    const cd = ctx.cd;
    if (!cd) return dayPage(ctx);
    const task = Q.task(cd);
    const c = Q.dayCounts(cd);
    const stale = Q.staleFilesOf(cd);
    return dayPage(ctx, '', '<div class="wf-cols"><div class="wf-stack"><div class="wf-box"><h3>Working state</h3><div class="wf-kv">' +
      '<span>Status</span><span>' + W.select('status', KH.DAY_STATUSES, cd.status, 'data-change="setWorkingStatus" data-cd="' + cd.id + '"') + '</span>' +
      '<span>Practice day</span><span>' + (cd.practice ? 'yes' : 'no') + '</span>' +
      '<span>Task</span><span>' + (task ? '<a href="#' + links.candidate(task) + '">' + e(task.letter) + '</a> ' + e(Q.taskLine(task)) + ', ' + W.km(Q.taskDistance(task)) : 'none published') + '</span>' +
      '<span>Results</span><span>' + c.ok + ' OK, ' + c.check + ' in check, ' + c.unknown + ' unknown</span>' +
      '<span>Unpublished</span><span>' + (cd.reasons.length ? e(cd.reasons.join(', ')) + ' · <a href="#' + CD(cd) + '/publish">Publish</a>' : 'nothing') + '</span></div></div>' +
      (stale.length ? '<div class="wf-box"><h3>Stale analyses (' + stale.length + ')</h3><table class="wf-table"><tbody>' + stale.map((f) => { const r = Q.resolve(f); return '<tr><td><a href="#' + links.file(f) + '">' + e(f.name) + '</a></td><td>' + e(r.competitor.cid) + '</td><td>' + W.staleBadge(f) + '</td><td class="right"><button class="wf-btn small" data-act="rerun" data-file="' + f.id + '">Rerun</button></td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      '</div><div class="wf-stack">' + (task ? W.taskMap(task.points) : '') + '<div class="wf-box"><h3>Published copy</h3>' + (cd.published ? W.dayBadge(cd.published.status) + ' ' + W.dt(cd.published.at) + (cd.publishedTask ? '<div class="small">Task ' + e(cd.publishedTask.letter) + ': ' + e(cd.publishedTask.line) + '</div>' : '') : '<span class="muted">never published</span>') + '</div></div></div>');
  };
  P['/c/:comp/classes/:class/days/:date/tasks'] = (ctx) => dayPage(ctx, 'tasks', ctx.cd ? W.candidateList(ctx.cd) : '');
  P['/c/:comp/classes/:class/days/:date/tasks/:cand'] = (ctx) => dayPage(ctx, 'tasks', ctx.cand ? W.taskEditor(ctx.cand) : '<div class="wf-empty">No such candidate</div>');
  P['/c/:comp/classes/:class/days/:date/settings'] = (ctx) => dayPage(ctx, 'settings', ctx.cd ? '<div class="wf-cols" style="grid-template-columns:3fr 2fr"><div class="wf-box">' + W.dayOverrides(ctx.cd) + '</div><div class="wf-box">' + W.dayAirspace(ctx.cd) + '</div></div>' : '');
  P['/c/:comp/classes/:class/days/:date/results'] = (ctx) => {
    if (!ctx.cd) return dayPage(ctx);
    const f = ctx.query.show || '';
    const c = Q.dayCounts(ctx.cd);
    const flt = (k, label) => '<a class="wf-btn small' + (f === k ? ' primary' : '') + '" href="#' + CD(ctx.cd) + '/results' + (k ? '?show=' + k : '') + '">' + label + '</a>';
    return dayPage(ctx, 'results', '<div class="wf-stack"><div class="wf-row">' + flt('', 'All ' + c.results) + flt('check', 'In check ' + c.check) + flt('unknown', 'Unknown ' + c.unknown) + flt('stale', 'Stale ' + c.stale) + '</div>' + W.resultsTable(ctx.cd, { filter: f }) + '</div>');
  };

  function neighbours(ctx) {
    const rows = KH.score(ctx.cd).rows;
    const check = rows.filter((x) => x.result.checkReasons.length || x.result === ctx.result);
    const i = check.findIndex((x) => x.result === ctx.result);
    return { prev: check[i - 1], next: check[i + 1], pos: i + 1, total: check.length };
  }
  P['/c/:comp/classes/:class/days/:date/results/:cid'] = (ctx) => {
    if (!ctx.cd || !ctx.result) return dayPage(ctx, 'results', '<div class="wf-empty">No such competitor in this class</div>');
    const r = ctx.result;
    const comp = ctx.competitor;
    const scored = r.scoredFileId ? Q.file(r.scoredFileId) : null;
    const task = Q.task(ctx.cd);
    const n = neighbours(ctx);
    const nav = '<div class="wf-row">' + (n.prev ? '<a class="wf-btn small" href="#' + links.result(n.prev.result) + '">← ' + e(n.prev.competitor.cid) + '</a>' : '') + '<span class="muted small">' + n.pos + ' of ' + n.total + ' in check</span>' + (n.next ? '<a class="wf-btn small" href="#' + links.result(n.next.result) + '">' + e(n.next.competitor.cid) + ' →</a>' : '') + '</div>';
    const body = '<div class="wf-stack"><div class="wf-row between"><div><h2 style="margin:0">' + e(comp.cid) + ' · ' + e(Q.crewName(comp)) + '</h2><div class="muted small">' + e(comp.gliderType) + (comp.handicap ? ', handicap ' + comp.handicap : '') + (comp.hc ? ', hors concours' : '') + ' · <a href="#' + links.competitor(comp) + '">competitor</a></div></div>' + nav + '</div>' +
      W.checkReasons(r) + W.resultStatusControl(r) +
      '<div class="wf-box"><h3>Files</h3>' + W.resultFiles(r) + '</div>' +
      (r.status === 'manual result' ? '<div class="wf-box"><h3>Manual result</h3>' + W.manualForm(r) + '</div>' : '') +
      (scored ? '<div class="wf-cols"><div class="wf-box"><h3>Scored file: ' + e(scored.name) + ' ' + W.staleBadge(scored) + '</h3>' + W.outputSummary(scored) + '</div>' + (task ? W.taskMap(task.points, { track: scored.seed, finished: scored.analysis.output && scored.analysis.output.finished, h: 200 }) : '') + '</div>' +
        '<div class="wf-box"><h3>Start candidates</h3>' + W.startCandidates(scored) + '</div>' +
        '<div class="wf-box">' + W.analysisLog(scored) + '</div>' +
        '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(scored) + '</div>' : '') +
      '<div class="wf-cols"><div class="wf-box"><h3>Penalty</h3>' + W.penaltyForm(r) + '</div><div class="wf-box"><h3>Remarks and handicap</h3>' + W.resultRemarks(r) + '</div></div></div>';
    return dayPage(ctx, 'results', body);
  };
  P['/c/:comp/classes/:class/days/:date/publish'] = (ctx) => dayPage(ctx, 'publish', ctx.cd ? '<div class="wf-cols" style="grid-template-columns:2fr 3fr"><div class="wf-box"><h3>Publish</h3>' + W.publishPanel(ctx.cd) + '</div><div class="wf-box"><h3>Latest published copy</h3>' + W.publishedCopy(ctx.cd) + '</div></div>' : '');

  P['/c/:comp/competitors'] = (ctx) => {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    const classes = Q.classesOf(ctx.comp.id);
    return page(ctx, 'Competitors', '<div class="wf-stack"><div class="wf-row">' + '<a class="wf-btn small' + (!cls ? ' primary' : '') + '" href="#' + C(ctx.comp) + '/competitors">All</a>' + classes.map((c) => '<a class="wf-btn small' + (cls === c ? ' primary' : '') + '" href="#' + C(ctx.comp) + '/competitors?class=' + c.slug + '">' + e(c.name) + ' ' + Q.competitorsOf(ctx.comp.id, c.id).length + '</a>').join('') + '</div>' + W.competitorsTable(ctx.comp, cls && cls.id) + '</div>', '<a class="wf-btn primary" href="#' + C(ctx.comp) + '/competitors/new' + (cls ? '?class=' + cls.slug : '') + '">Add competitor</a>');
  };
  P['/c/:comp/competitors/new'] = (ctx) => {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    return page(ctx, 'Add competitor', '<div class="wf-box">' + W.competitorForm(ctx.comp, null, cls && cls.id) + '</div>');
  };
  P['/c/:comp/competitors/:competitor'] = (ctx) => {
    const c = ctx.competitor;
    if (!c) return page(ctx, 'Not found', '<div class="wf-empty">No such competitor</div>');
    const loggers = Q.loggersOf(ctx.comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
    const days = Q.classDaysOf(c.classId).filter((cd) => !['unplanned', 'cancelled'].includes(cd.status));
    return page(ctx, e(c.cid) + ' · ' + e(Q.crewName(c)) + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : ''), '<div class="wf-cols" style="grid-template-columns:3fr 2fr"><div class="wf-box">' + W.competitorForm(ctx.comp, c) + '</div><div class="wf-stack">' +
      '<div class="wf-box"><h3>Loggers</h3>' + (loggers.length ? '<table class="wf-table"><tbody>' + loggers.map((l) => '<tr><td><a href="#' + links.logger(l) + '">' + e(Q.loggerLabel(l)) + '</a></td><td>' + l.links.filter((k) => k.competitorId === c.id).map((k) => k.role + (k.from ? ' from ' + W.date(k.from) : '')).join(', ') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted small">No loggers linked</p>') + '<a class="wf-btn small" href="#' + C(ctx.comp) + '/loggers/new">Add logger</a></div>' +
      '<div class="wf-box"><h3>Results</h3><table class="wf-table"><tbody>' + days.map((cd) => { const r = Q.resultFor(cd.id, c.id); return '<tr class="link" data-href="' + links.result(r) + '"><td>' + e(Q.dayLabel(cd.classId, cd.date)) + '</td><td>' + W.resultStatus(r) + '</td><td>' + W.reviewBadge(r) + '</td><td>' + (r.penalty ? '−' + r.penalty.points : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="wf-box">' + W.dsqPanel(c) + '</div></div></div>');
  };
  P['/c/:comp/loggers'] = (ctx) => page(ctx, 'Loggers', W.loggersTable(ctx.comp), '<a class="wf-btn primary" href="#' + C(ctx.comp) + '/loggers/new">Add logger</a>');
  P['/c/:comp/loggers/new'] = (ctx) => page(ctx, 'Add logger', '<div class="wf-box">' + W.loggerForm(ctx.comp) + '</div>');
  P['/c/:comp/loggers/:logger'] = (ctx) => {
    const l = ctx.logger;
    if (!l) return page(ctx, 'Not found', '<div class="wf-empty">No such logger</div>');
    const rows = S.files.filter((f) => f.loggerId === l.id).map((f) => ({ f, res: Q.resolve(f) }));
    return page(ctx, 'Logger ' + e(Q.loggerLabel(l)), '<div class="wf-stack"><div class="wf-box"><h3>Dated links</h3>' + W.loggerLinks(l) + '</div><div class="wf-box"><h3>Thresholds</h3>' + W.loggerForm(ctx.comp, l) + '</div><div class="wf-box"><h3>Files</h3>' + W.filesTable(rows) + '</div></div>');
  };
  P['/c/:comp/files'] = (ctx) => {
    const base = C(ctx.comp) + '/files';
    const { rows, hiddenUnresolved } = W.filterFiles(ctx.comp, ctx.query);
    return page(ctx, 'IGC files', '<div class="wf-stack">' + W.fileFilters(ctx.comp, ctx.query, base) +
      (hiddenUnresolved ? '<div class="wf-note warn">' + hiddenUnresolved + ' unresolved files are hidden by this filter. <a href="#' + base + '?state=unresolved">Show unresolved</a></div>' : '') +
      '<div class="muted small">' + rows.length + ' files</div>' + W.filesTable(rows.slice(0, 200)) + (rows.length > 200 ? '<p class="muted small">First 200 shown</p>' : '') +
      '<details><summary>Upload a file as scorer</summary><div class="wf-box" style="margin-top:8px">' + W.scorerUploadForm(ctx.comp) + '</div></details></div>');
  };
  P['/c/:comp/files/:file'] = (ctx) => {
    const f = ctx.file;
    if (!f) return page(ctx, 'Not found', '<div class="wf-empty">No such file</div>');
    const res = Q.resolve(f);
    const task = res.ok ? Q.task(res.classDay) : null;
    return page(ctx, e(f.name), '<div class="wf-stack"><div class="wf-cols"><div class="wf-box">' + W.fileMeta(f) + '</div><div class="wf-stack">' + (task ? W.taskMap(task.points, { track: f.seed, finished: f.analysis.output && f.analysis.output.finished }) : '<div class="wf-map" style="height:200px"><span class="tag">Map: track only</span></div>') + '<div class="wf-box">' + W.outputSummary(f) + '</div></div></div>' +
      (f.analysis.candidates && f.analysis.candidates.length ? '<div class="wf-box"><h3>Start candidates</h3>' + W.startCandidates(f) + '</div>' : '') +
      '<div class="wf-box">' + W.analysisLog(f) + '</div>' + (res.ok ? '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(f) + '</div>' : '') + '</div>');
  };
  P['/c/:comp/members'] = (ctx) => page(ctx, 'Members and invitations', W.members(ctx.comp));
  P['/c/:comp/lifecycle'] = (ctx) => page(ctx, ctx.comp.lifecycle === 'archived' ? 'Delete' : 'Archive or delete', W.lifecycle(ctx.comp));

  KH.mount({
    id: 'a',
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
    afterReview(r) {
      const ctx = KH.current();
      if (!ctx.params.cid) return;
      const n = neighbours(ctx);
      if (n.next) KH.go(links.result(n.next.result));
    },
  });
})();
