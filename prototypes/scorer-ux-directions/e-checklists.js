// PROTOTYPE: Direction E, "Checklists". Setup and every class day are fixed, numbered steps with a progress rail.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const S = KH.state;
  const e = KH.esc;

  const C = (comp) => '/c/' + comp.slug;
  const plural = (k, word) => k + ' ' + word + (k === 1 ? '' : 's');
  const DD = (cls, date) => C(Q.competition(cls.competitionId)) + '/days/' + date + '/' + cls.slug;
  const CD = (cd) => DD(Q.class(cd.classId), cd.date);

  const links = {
    competition: C,
    cls: (cls) => C(Q.competition(cls.competitionId)) + '/setup/classes/' + cls.slug,
    classDay: CD,
    classDayDate: DD,
    classDayTasks: (cd) => CD(cd) + '/task',
    candidate: (t) => CD(Q.classDay(t.classDayId)) + '/task/' + t.id,
    result: (r) => CD(Q.classDay(r.classDayId)) + '/review/' + Q.competitor(r.competitorId).cid,
    file: (f) => C(Q.competition(Q.logger(f.loggerId).competitionId)) + '/files/' + f.id,
    competitor: (c) => C(Q.competition(c.competitionId)) + '/setup/competitors/' + c.id,
    competitors: (comp) => C(comp) + '/setup/competitors',
    logger: (l) => C(Q.competition(l.competitionId)) + '/setup/loggers/' + l.id,
    files: (comp) => C(comp) + '/files',
  };

  const EX = '/c/oberrhein-2026';
  const EXD = EX + '/days/2026-07-28/club';
  const routes = [
    { path: '/', title: 'My competitions', group: 'Account', example: '/' },
    { path: '/new', title: 'Create competition', group: 'Account', example: '/new' },
    { path: '/account', title: 'Account and invitations', group: 'Account', example: '/account' },
    { path: '/staff/users', title: 'Users and invitation tree (staff)', group: 'Staff', example: '/staff/users' },
    { path: '/staff/competitions', title: 'All competitions (staff)', group: 'Staff', example: '/staff/competitions' },
    { path: '/c/:comp', title: 'Today checklist', group: 'Competition', example: EX },
    { path: '/c/:comp/setup', title: 'Setup checklist', group: 'Setup checklist', example: EX + '/setup' },
    { path: '/c/:comp/setup/classes/new', title: 'Setup 3 · Add class', group: 'Setup checklist', example: EX + '/setup/classes/new' },
    { path: '/c/:comp/setup/classes/:class', title: 'Setup 3 · Class settings', group: 'Setup checklist', example: EX + '/setup/classes/club' },
    { path: '/c/:comp/setup/competitors/new', title: 'Setup 6 · Add competitor', group: 'Setup checklist', example: EX + '/setup/competitors/new' },
    { path: '/c/:comp/setup/competitors/:competitor', title: 'Setup 6 · Competitor', group: 'Setup checklist', example: EX + '/setup/competitors/p1' },
    { path: '/c/:comp/setup/loggers/new', title: 'Setup 7 · Add logger', group: 'Setup checklist', example: EX + '/setup/loggers/new' },
    { path: '/c/:comp/setup/loggers/:logger', title: 'Setup 7 · Logger and links', group: 'Setup checklist', example: EX + '/setup/loggers/lx1' },
    { path: '/c/:comp/setup/:step', title: 'Setup step (details, dates, classes, turnpoints, airspace, competitors, loggers, members)', group: 'Setup checklist', example: EX + '/setup/details' },
    { path: '/c/:comp/days', title: 'All days with each class day\'s step', group: 'Class days', example: EX + '/days' },
    { path: '/c/:comp/days/:date', title: 'One date: the classes and their steps', group: 'Class days', example: EX + '/days/2026-07-28' },
    { path: '/c/:comp/days/:date/:class', title: 'Class day, opens at its current step', group: 'Class day stepper', example: EXD },
    { path: '/c/:comp/days/:date/:class/task/:cand', title: 'Step 2 · Task candidate editor', group: 'Class day stepper', example: null },
    { path: '/c/:comp/days/:date/:class/review/:cid', title: 'Step 4 · Review one result', group: 'Class day stepper', example: null },
    { path: '/c/:comp/days/:date/:class/:step', title: 'Class day step (plan, task, flights, review, publish)', group: 'Class day stepper', example: EXD + '/flights' },
    { path: '/c/:comp/files', title: 'IGC files (reference)', group: 'Reference', example: EX + '/files' },
    { path: '/c/:comp/files/:file', title: 'IGC file (reference)', group: 'Reference', example: null },
    { path: '/c/:comp/archive', title: 'Wrap-up checklist: archive or delete', group: 'Competition', example: EX + '/archive' },
  ];

  // ---------- progress ----------

  const SETUP = [
    { key: 'details', label: 'Details and upload password', done: (comp) => !!comp.airfield },
    { key: 'dates', label: 'Dates and class days', done: (comp) => comp.dates.length > 0 },
    { key: 'classes', label: 'Classes', done: (comp) => Q.classesOf(comp.id).length > 0 },
    { key: 'turnpoints', label: 'Turnpoint file', done: (comp) => !!comp.turnpointFile },
    { key: 'airspace', label: 'Airspace file', done: (comp) => !!comp.airspaceFile },
    { key: 'competitors', label: 'Competitors', done: (comp) => Q.competitorsOf(comp.id).length > 0 },
    { key: 'loggers', label: 'Loggers and links', done: (comp) => Q.loggersOf(comp.id).some((l) => l.links.length) },
    { key: 'members', label: 'Members and invitations', done: (comp) => Q.membersOf(comp.id).length > 1 },
  ];
  const setupDone = (comp) => SETUP.filter((s) => s.done(comp)).length;

  const STEPS = [
    ['plan', 'Plan'],
    ['task', 'Task'],
    ['flights', 'Flights'],
    ['review', 'Review'],
    ['publish', 'Publish'],
  ];

  // Derives each step's state and the next action of a class day from the data.
  function dayState(cls, date) {
    const comp = Q.competition(cls.competitionId);
    const cd = Q.classDayOn(cls.id, date);
    const st = {};
    if (!cd) {
      STEPS.forEach(([k]) => (st[k] = { done: false, note: '' }));
      st.plan.note = 'untouched';
      return { cd, st, current: 'plan', action: 'Plan the day' };
    }
    const task = Q.task(cd);
    const c = Q.dayCounts(cd);
    const stale = c.stale;
    const unresolved = Q.unresolvedFiles(comp.id).filter((f) => Q.flightDate(f) === date).length;
    const files = Q.resultsOf(cd).reduce((n, r) => n + Q.filesOfResult(r).length, 0);
    const settled = ['final', 'cancelled'].includes(cd.status) && cd.published && !cd.reasons.length;
    if (cd.status === 'cancelled') {
      st.plan = { done: true, note: 'cancelled' };
      for (const k of ['task', 'flights', 'review']) st[k] = { done: true, skip: true, note: 'not needed' };
      st.publish = { done: settled, note: cd.published ? 'cancellation published' : 'not published' };
      return { cd, st, current: settled ? null : 'publish', action: settled ? '' : 'Publish the cancellation' };
    }
    st.plan = { done: true, note: cd.practice ? 'practice day' : 'competition day' };
    st.task = { done: !!task, note: task ? 'Task ' + task.letter + ', ' + W.km(Q.taskDistance(task)) : Q.candidates(cd.id).length + ' candidates, none published' };
    st.flights = { done: !!task && !stale && !unresolved && date < KH.TODAY, note: files + ' files' + (stale ? ', ' + stale + ' stale' : '') + (unresolved ? ', ' + unresolved + ' unresolved' : '') };
    st.review = { done: !!task && !c.check && !c.unknown, note: c.check + ' in check, ' + c.unknown + ' unknown' };
    st.publish = { done: settled, note: (cd.published ? cd.published.status : 'never published') + (cd.reasons.length ? ', changes' : '') + (Q.deadlinePassed(cd) ? ', deadline passed' : '') };
    const current = STEPS.map(([k]) => k).find((k) => !st[k].done) || null;
    const action = {
      plan: 'Plan the day',
      task: 'Publish a task',
      flights: stale ? 'Rerun ' + plural(stale, 'stale analysis').replace('analysiss', 'analyses') : unresolved ? 'Attach ' + plural(unresolved, 'unresolved file') : 'Collect flights',
      review: c.check ? 'Review ' + plural(c.check, 'result') + ' in check' : 'Settle ' + plural(c.unknown, 'unknown result'),
      publish: Q.deadlinePassed(cd) ? 'Publish final' : cd.reasons.length ? 'Publish the changes' : 'Publish results',
    }[current];
    return { cd, st, current, action: action || '' };
  }

  // ---------- shell ----------

  function header(ctx) {
    const me = Q.me();
    const comp = ctx.comp;
    const on = (k) => (ctx.section === k ? ' class="on"' : '');
    let mid = '';
    if (comp) {
      const comps = Q.myCompetitions();
      mid = '<select onchange="location.hash=this.value">' + comps.map((c) => '<option value="#' + C(c) + '"' + (c === comp ? ' selected' : '') + '>' + e(c.name) + '</option>').join('') + '<option value="#/">All competitions…</option></select>';
      if (comp.lifecycle !== 'archived') {
        mid += '<a href="#' + C(comp) + '"' + on('today') + '>Today</a><a href="#' + C(comp) + '/setup"' + on('setup') + '>Setup ' + setupDone(comp) + '/' + SETUP.length + '</a><a href="#' + C(comp) + '/days"' + on('days') + '>All days</a><a href="#' + C(comp) + '/files"' + on('files') + '>IGC files</a>';
      }
    }
    return '<header class="e-head"><a class="e-brand" href="#/">Keyhole</a>' + mid + '<span class="grow"></span>' +
      (me.staff ? '<a href="#/staff/users"' + on('staff') + '>Staff</a>' : '') + '<a href="#/account"' + on('account') + '>' + e(me.name) + '</a><span class="muted small">' + (comp ? e(Q.roleIn(comp) || 'no role') : me.staff ? 'staff' : '') + '</span>' +
      '<a href="#/" onclick="KH.toast(\'Prototype: would sign out\');return false" class="muted">Sign out</a></header>';
  }

  function crumbs(list) {
    return list.length ? '<div class="e-crumbs">' + list.map(([h, t]) => '<a href="#' + h + '">' + e(t) + '</a>').join(' / ') + '</div>' : '';
  }

  function page(ctx, title, body, actions, trail) {
    return header(ctx) + '<main class="e-main">' + crumbs(trail || []) +
      (ctx.comp && ctx.comp.blocked ? '<div class="wf-note warn">Blocked by staff ' + W.dt(ctx.comp.blocked.at) + ': ' + e(ctx.comp.blocked.note) + '. Only staff can see this competition.</div>' : '') +
      '<div class="wf-row between e-title"><h1>' + title + '</h1><div class="wf-row">' + (actions || '') + '</div></div>' + body + '</main>';
  }

  function item(done, main, sub, action, opts) {
    return '<div class="e-item' + (done ? ' done' : '') + '"><span class="e-box' + (done ? ' done' : '') + '">' + (done ? '✓' : (opts && opts.num) || '') + '</span><div><div class="main">' + main + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div><div>' + (action || '') + '</div></div>';
  }

  // ---------- account and staff ----------

  const P = {};

  P['/'] = (ctx) => {
    const comps = Q.myCompetitions();
    return page(ctx, 'My competitions', '<div class="wf-stack">' + W.incomingInvitations() +
      '<div class="e-list">' + (comps.length ? comps.map((c) => {
        const state = c.lifecycle === 'archived' ? 'archived' : c.dates[0] > KH.TODAY ? 'upcoming' : c.dates[c.dates.length - 1] < KH.TODAY ? 'finished' : 'running';
        let sub = e(c.location) + ' · ' + W.date(c.dates[0], true) + ' – ' + W.date(c.dates[c.dates.length - 1], true) + ' · ' + e(Q.roleIn(c)) + ' · ' + state;
        let todo = '';
        if (c.lifecycle !== 'archived') {
          const open = SETUP.length - setupDone(c);
          const today = Q.classesOf(c.id).map((cls) => dayState(cls, KH.TODAY)).filter((d) => d.cd && d.current);
          todo = open ? open + ' setup steps open' : today.length ? today.length + ' class days in progress today' : '';
        }
        return item(c.lifecycle === 'archived', '<a href="#' + C(c) + '"><b>' + e(c.name) + '</b></a>' + (c.blocked ? ' <span class="wf-badge solid">blocked</span>' : ''), sub + (todo ? ' · <b>' + todo + '</b>' : ''), '<a class="wf-btn small" href="#' + C(c) + '">Open</a>');
      }).join('') : item(false, 'No competitions yet', '', '')) + '</div></div>', '<a class="wf-btn primary" href="#/new">Create competition</a>');
  };
  P['/new'] = (ctx) => page(ctx, 'Create competition', '<p class="muted">After creating it you land on its setup checklist.</p><div class="wf-box" style="max-width:880px">' + W.createCompetitionForm() + '</div>');
  P['/account'] = (ctx) => page({ ...ctx, section: 'account' }, 'Account and invitations', W.incomingInvitations() + W.account());
  P['/staff/users'] = (ctx) => (Q.me().staff ? page({ ...ctx, section: 'staff' }, 'Users', staffTabs('users') + '<p class="muted">The invitation tree. Each user records who invited them. Nothing acts on a whole branch automatically.</p>' + W.staffUsers()) : denied(ctx));
  P['/staff/competitions'] = (ctx) => (Q.me().staff ? page({ ...ctx, section: 'staff' }, 'All competitions', staffTabs('competitions') + W.staffCompetitions()) : denied(ctx));
  function staffTabs(cur) {
    return '<div class="wf-tabs"><a class="' + (cur === 'users' ? 'on' : '') + '" href="#/staff/users">Users</a><a class="' + (cur === 'competitions' ? 'on' : '') + '" href="#/staff/competitions">Competitions</a></div>';
  }

  function denied(ctx, msg) {
    return page(ctx, 'No access', '<div class="wf-empty">' + (msg || 'Switch to another role in the prototype bar.') + '</div>');
  }
  function guard(ctx) {
    if (!ctx.comp) return page(ctx, 'Not found', '<div class="wf-empty">This competition does not exist.</div>');
    if (!Q.roleIn(ctx.comp)) {
      const ci = S.competitionInvitations.find((i) => i.competitionId === ctx.comp.id && i.inviteeId === Q.me().id);
      return page({ ...ctx, comp: null }, e(ctx.comp.name), '<div class="wf-empty">You are not a member of this competition.' + (ci ? '<p><button class="wf-btn primary" data-act="acceptCI" data-id="' + ci.id + '">Accept invitation as ' + ci.role + '</button></p><p class="muted small">You then start on its setup checklist.</p>' : '') + '</div>');
    }
    if (ctx.comp.blocked && !Q.me().staff) return page({ ...ctx, comp: null }, 'Not found', '<div class="wf-empty">This competition does not exist.</div>');
    if (ctx.comp.lifecycle === 'archived' && !['/c/:comp', '/c/:comp/archive'].includes(ctx.route.path)) {
      return page(ctx, e(ctx.comp.name), '<div class="wf-empty">This competition is archived. Its scoring work was removed. <a href="#' + C(ctx.comp) + '">See what remains</a></div>');
    }
    return null;
  }

  // ---------- today ----------

  function setupCard(comp) {
    const done = setupDone(comp);
    const first = SETUP.find((s) => !s.done(comp));
    return '<div class="wf-box"><div class="wf-row between"><h3 style="margin:0">Setup checklist · ' + done + ' of ' + SETUP.length + ' done</h3>' +
      (first ? '<a class="wf-btn primary small" href="#' + C(comp) + '/setup/' + first.key + '">Continue: ' + e(first.label) + '</a>' : '<a class="wf-btn small" href="#' + C(comp) + '/setup">Open</a>') + '</div>' +
      (first ? '<div class="e-list" style="margin-top:8px">' + SETUP.map((s, i) => item(s.done(comp), '<a href="#' + C(comp) + '/setup/' + s.key + '">' + e(s.label) + '</a>', '', '', { num: i + 1 })).join('') + '</div>' : '') + '</div>';
  }

  function dayItem(cls, date, withDate) {
    const ds = dayState(cls, date);
    const label = e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, date)) + (withDate ? ' <span class="muted">' + W.date(date, true) + '</span>' : '');
    const i = ds.current ? STEPS.findIndex(([k]) => k === ds.current) : -1;
    const reopened = ds.cd && ds.cd.published && ds.cd.published.status !== 'task published' && i < 3;
    const sub = !ds.cd ? 'Untouched' : !ds.current ? 'Settled, ' + e(ds.cd.status) : (reopened ? 'Published ' + e(ds.cd.published.status) + ', reopened at step ' : 'Step ') + (i + 1) + ' of 5, ' + STEPS[i][1] + ': ' + e(ds.st[ds.current].note);
    const act = ds.current ? '<a class="wf-btn small' + (ds.cd ? ' primary' : '') + '" href="#' + DD(cls, date) + '/' + ds.current + '">' + e(ds.action) + ' →</a>' : '<a class="wf-btn small ghost" href="#' + DD(cls, date) + '/publish">Open</a>';
    return item(!ds.current, '<a href="#' + DD(cls, date) + '"><b>' + label + '</b></a> ' + (ds.cd ? W.dayBadge(ds.cd.status) : ''), sub, act);
  }

  P['/c/:comp'] = (ctx) => {
    const comp = ctx.comp;
    if (comp.lifecycle === 'archived') {
      return page(ctx, e(comp.name), '<div class="wf-stack"><div class="wf-note">Archived ' + W.dt(comp.archivedAt) + '. The scoring work was removed. Only the published results remain, and they can no longer change.</div>' +
        '<table class="wf-table"><thead><tr><th>Class</th><th>Published days</th><th>Competitors</th><th>Last status</th></tr></thead><tbody>' + comp.archive.classes.map((c) => '<tr><td>' + e(c.name) + '</td><td>' + c.days + '</td><td>' + c.competitors + '</td><td>' + W.dayBadge(c.lastStatus) + '</td></tr>').join('') + '</tbody></table>' +
        '<p><a href="#" onclick="KH.toast(\'Public pages are out of scope for this prototype\');return false">Open public results ↗</a> · <a href="#' + C(comp) + '/archive">Delete…</a></p></div>');
    }
    const classes = Q.classesOf(comp.id);
    const isDay = comp.dates.includes(KH.TODAY);
    const earlier = [];
    for (const cls of classes) for (const cd of Q.classDaysOf(cls.id)) {
      if (cd.date >= KH.TODAY) continue;
      if (dayState(cls, cd.date).current) earlier.push(dayItem(cls, cd.date, true));
    }
    const unresolved = Q.unresolvedFiles(comp.id).length;
    const setupOpen = setupDone(comp) < SETUP.length;
    const next = comp.dates.find((d) => d >= KH.TODAY);
    return page({ ...ctx, section: 'today' }, e(comp.name) + ' <span class="muted" style="font-weight:400">· Today</span>', '<div class="wf-stack">' +
      (setupOpen ? setupCard(comp) : '') +
      (isDay && classes.length ? '<div><h2>' + W.date(KH.TODAY, true) + '</h2><div class="e-list">' + classes.map((cls) => dayItem(cls, KH.TODAY)).join('') + '</div></div>'
        : '<div class="wf-box fill">' + (next ? 'No competition day today. The next date is ' + W.date(next, true) + '.' : 'The competition dates are over.') + (classes.length && next ? ' <a href="#' + C(comp) + '/days/' + next + '">Prepare it</a>' : '') + '</div>') +
      (earlier.length || unresolved ? '<div><h2>Still open from earlier days</h2><div class="e-list">' + earlier.join('') +
        (unresolved ? item(false, unresolved + ' unresolved IGC files', 'They match no competitor or class day and appear on no result', '<a class="wf-btn small" href="#' + C(comp) + '/files?state=unresolved">Resolve →</a>') : '') + '</div></div>' : '') +
      (!setupOpen ? '<p class="muted small">Setup checklist complete. <a href="#' + C(comp) + '/setup">Review it</a></p>' : '') +
      '<div class="wf-box" style="max-width:520px">' + W.uploadPassword(comp) + '</div>' +
      '<p class="muted small"><a href="#' + C(comp) + '/archive">Wrap up: archive or delete the competition</a></p></div>');
  };

  // ---------- setup checklist ----------

  function setupPage(ctx, key, title, body, actions) {
    const comp = ctx.comp;
    const i = SETUP.findIndex((s) => s.key === key);
    const rail = '<nav class="e-rail"><div class="h">Setup · ' + setupDone(comp) + ' of ' + SETUP.length + '</div>' + SETUP.map((s, j) =>
      '<a class="' + (s.key === key ? 'on' : '') + '" href="#' + C(comp) + '/setup/' + s.key + '"><span class="e-num' + (s.done(comp) ? ' done' : '') + '">' + (s.done(comp) ? '✓' : j + 1) + '</span>' + e(s.label) + '</a>').join('') + '</nav>';
    const prev = SETUP[i - 1];
    const nxt = SETUP[i + 1];
    const foot = i < 0 ? '' : '<div class="e-foot">' + (prev ? '<a class="wf-btn" href="#' + C(comp) + '/setup/' + prev.key + '">← ' + e(prev.label) + '</a>' : '<a class="wf-btn" href="#' + C(comp) + '">← Today</a>') +
      '<span class="muted small">Step ' + (i + 1) + ' of ' + SETUP.length + (SETUP[i].done(comp) ? ', done' : ', open') + '. No step blocks another.</span>' +
      (nxt ? '<a class="wf-btn primary" href="#' + C(comp) + '/setup/' + nxt.key + '">Continue: ' + e(nxt.label) + ' →</a>' : '<a class="wf-btn primary" href="#' + C(comp) + '">Finish setup →</a>') + '</div>';
    const trail = [[C(comp), comp.name], [C(comp) + '/setup', 'Setup']];
    return page({ ...ctx, section: 'setup' }, (i >= 0 ? (i + 1) + '. ' : '') + title, '<div class="e-split">' + rail + '<div>' + body + foot + '</div></div>', actions, trail);
  }

  P['/c/:comp/setup'] = (ctx) => {
    const comp = ctx.comp;
    return setupPage(ctx, null, 'Setup checklist', '<div class="wf-stack"><p class="muted">Work through the steps in any order. Each step is saved on its own page. The checklist only shows what is missing.</p><div class="e-list">' +
      SETUP.map((s, i) => item(s.done(comp), '<a href="#' + C(comp) + '/setup/' + s.key + '"><b>' + e(s.label) + '</b></a>', setupNote(comp, s.key), '<a class="wf-btn small' + (s.done(comp) ? ' ghost' : ' primary') + '" href="#' + C(comp) + '/setup/' + s.key + '">' + (s.done(comp) ? 'Edit' : 'Start') + '</a>', { num: i + 1 })).join('') + '</div></div>');
  };
  function setupNote(comp, key) {
    const classes = Q.classesOf(comp.id);
    return {
      details: comp.airfield ? e(comp.organiser) + ', ' + e(comp.location) : 'Airfield position missing',
      dates: comp.dates.length + ' dates, ' + W.date(comp.dates[0]) + ' – ' + W.date(comp.dates[comp.dates.length - 1]),
      classes: classes.length ? classes.map((c) => e(c.name)).join(', ') : 'No classes yet',
      turnpoints: comp.turnpointFile ? e(comp.turnpointFile.name) : 'No file uploaded',
      airspace: comp.airspaceFile ? e(comp.airspaceFile.name) : 'No file uploaded',
      competitors: Q.competitorsOf(comp.id).length + ' competitors',
      loggers: Q.loggersOf(comp.id).length + ' loggers, ' + Q.loggersOf(comp.id).filter((l) => !l.links.length).length + ' without links',
      members: Q.membersOf(comp.id).length + ' members',
    }[key];
  }

  const STEP_BODY = {
    details: (comp) => '<div class="wf-cols" style="grid-template-columns:2fr 1fr"><div class="wf-box">' + W.competitionDetails(comp) + '</div><div class="wf-stack"><div class="wf-box">' + W.uploadPassword(comp) + '</div><div class="wf-box fill small"><b>Organiser terms</b><br>' + e(comp.terms.version) + ' accepted by ' + e(Q.user(comp.terms.userId).name) + ' on ' + W.dt(comp.terms.at) + ' for ' + e(comp.terms.organiser) + '</div></div></div>',
    dates: (comp) => '<div class="wf-stack"><div class="wf-box"><h3>Competition dates</h3>' + W.datesEditor(comp) + '</div><div><h3>Class day grid</h3><p class="muted small">A class day exists once someone touches its cell. Each cell opens that class day\'s stepper.</p>' + W.classDayGrid(comp) + '</div></div>',
    classes: (comp) => {
      const classes = Q.classesOf(comp.id, true);
      return '<div class="wf-stack"><table class="wf-table"><thead><tr><th>Class</th><th>Rule set edition</th><th>Handicapped</th><th class="num">Competitors</th><th class="num">Class days</th><th></th></tr></thead><tbody>' +
        (classes.length ? classes.map((c) => '<tr class="link' + (c.deleted ? ' dim' : '') + '" data-href="' + links.cls(c) + '"><td><b>' + e(c.name) + '</b>' + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : '') + '</td><td>' + e(c.edition) + '</td><td>' + (c.handicapScale ? 'scale ' + c.handicapScale + ', ' + e(c.handicapList) : 'no') + '</td><td class="num">' + Q.competitorsOf(comp.id, c.id).length + '</td><td class="num">' + Q.classDaysOf(c.id).length + '</td><td class="right">' + (c.deleted ? '<button class="wf-btn small" data-act="restoreClass" data-cls="' + c.id + '">Restore</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="6" class="muted">No classes yet</td></tr>') +
        '</tbody></table><div><a class="wf-btn" href="#' + C(comp) + '/setup/classes/new">Add class</a></div></div>';
    },
    turnpoints: (comp) => W.turnpoints(comp),
    airspace: (comp) => W.airspace(comp),
    competitors: (comp, ctx) => {
      const cls = ctx.query.class ? Q.classBySlug(comp.id, ctx.query.class) : null;
      const base = C(comp) + '/setup/competitors';
      return '<div class="wf-stack"><div class="wf-row"><a class="wf-btn small' + (!cls ? ' primary' : '') + '" href="#' + base + '">All</a>' + Q.classesOf(comp.id).map((c) => '<a class="wf-btn small' + (cls === c ? ' primary' : '') + '" href="#' + base + '?class=' + c.slug + '">' + e(c.name) + ' ' + Q.competitorsOf(comp.id, c.id).length + '</a>').join('') +
        '<span class="grow"></span><a class="wf-btn" href="#' + base + '/new' + (cls ? '?class=' + cls.slug : '') + '">Add competitor</a></div>' + W.competitorsTable(comp, cls && cls.id) + '</div>';
    },
    loggers: (comp) => '<div class="wf-stack"><div><a class="wf-btn" href="#' + C(comp) + '/setup/loggers/new">Add logger</a></div>' + W.loggersTable(comp) + '</div>',
    members: (comp) => W.members(comp),
  };

  P['/c/:comp/setup/:step'] = (ctx) => {
    const s = SETUP.find((x) => x.key === ctx.params.step);
    if (!s) return page(ctx, 'Not found', '<div class="wf-empty">No setup step ' + e(ctx.params.step) + '</div>');
    return setupPage(ctx, s.key, e(s.label), STEP_BODY[s.key](ctx.comp, ctx));
  };
  function subTrail(ctx, key, label) {
    return '<div class="e-crumbs"><a href="#' + C(ctx.comp) + '/setup/' + key + '">← ' + e(label) + '</a></div>';
  }
  P['/c/:comp/setup/classes/new'] = (ctx) => setupPage(ctx, 'classes', 'Add class', subTrail(ctx, 'classes', 'All classes') + '<div class="wf-box">' + W.classForm(ctx.comp) + '</div>');
  P['/c/:comp/setup/classes/:class'] = (ctx) => {
    if (!ctx.cls) return setupPage(ctx, 'classes', 'Not found', '<div class="wf-empty">No such class</div>');
    return setupPage(ctx, 'classes', e(ctx.cls.name), subTrail(ctx, 'classes', 'All classes') + '<div class="wf-box">' + W.classForm(ctx.comp, ctx.cls) + '</div>');
  };
  P['/c/:comp/setup/competitors/new'] = (ctx) => {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    return setupPage(ctx, 'competitors', 'Add competitor', subTrail(ctx, 'competitors', 'All competitors') + '<div class="wf-box">' + W.competitorForm(ctx.comp, null, cls && cls.id) + '</div>');
  };
  P['/c/:comp/setup/competitors/:competitor'] = (ctx) => {
    const c = ctx.competitor;
    if (!c) return setupPage(ctx, 'competitors', 'Not found', '<div class="wf-empty">No such competitor</div>');
    const loggers = Q.loggersOf(ctx.comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
    const days = Q.classDaysOf(c.classId).filter((cd) => !['unplanned', 'cancelled'].includes(cd.status));
    return setupPage(ctx, 'competitors', e(c.cid) + ' · ' + e(Q.crewName(c)) + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : ''), subTrail(ctx, 'competitors', 'All competitors') +
      '<div class="wf-cols" style="grid-template-columns:3fr 2fr"><div class="wf-box">' + W.competitorForm(ctx.comp, c) + '</div><div class="wf-stack">' +
      '<div class="wf-box"><h3>Loggers</h3>' + (loggers.length ? '<table class="wf-table"><tbody>' + loggers.map((l) => '<tr><td><a href="#' + links.logger(l) + '">' + e(Q.loggerLabel(l)) + '</a></td><td>' + l.links.filter((k) => k.competitorId === c.id).map((k) => k.role + (k.from ? ' from ' + W.date(k.from) : '')).join(', ') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted small">No loggers linked</p>') + '<a class="wf-btn small" href="#' + C(ctx.comp) + '/setup/loggers/new">Add logger</a></div>' +
      '<div class="wf-box"><h3>Results</h3><table class="wf-table"><tbody>' + days.map((cd) => { const r = Q.resultFor(cd.id, c.id); return '<tr class="link" data-href="' + links.result(r) + '"><td>' + e(Q.dayLabel(cd.classId, cd.date)) + '</td><td>' + W.resultStatus(r) + '</td><td>' + W.reviewBadge(r) + '</td><td>' + (r.penalty ? '−' + r.penalty.points : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="wf-box">' + W.dsqPanel(c) + '</div></div></div>');
  };
  P['/c/:comp/setup/loggers/new'] = (ctx) => setupPage(ctx, 'loggers', 'Add logger', subTrail(ctx, 'loggers', 'All loggers') + '<div class="wf-box">' + W.loggerForm(ctx.comp) + '</div>');
  P['/c/:comp/setup/loggers/:logger'] = (ctx) => {
    const l = ctx.logger;
    if (!l) return setupPage(ctx, 'loggers', 'Not found', '<div class="wf-empty">No such logger</div>');
    const rows = S.files.filter((f) => f.loggerId === l.id).map((f) => ({ f, res: Q.resolve(f) }));
    return setupPage(ctx, 'loggers', 'Logger ' + e(Q.loggerLabel(l)), subTrail(ctx, 'loggers', 'All loggers') + '<div class="wf-stack"><div class="wf-box"><h3>Dated links</h3>' + W.loggerLinks(l) + '</div><div class="wf-box"><h3>Thresholds</h3>' + W.loggerForm(ctx.comp, l) + '</div><div class="wf-box"><h3>Files</h3>' + W.filesTable(rows) + '</div></div>');
  };

  // ---------- days ----------

  function cellFor(cls, date) {
    const ds = dayState(cls, date);
    if (!ds.cd) return '<a class="muted" href="#' + DD(cls, date) + '">untouched</a>';
    const i = ds.current ? STEPS.findIndex(([k]) => k === ds.current) : 5;
    return '<a href="#' + DD(cls, date) + '">' + W.dayBadge(ds.cd.status) + '</a> <span class="small">' + (ds.current ? (i + 1) + '/5 ' + e(ds.action) : '✓ settled') + '</span>';
  }

  P['/c/:comp/days'] = (ctx) => {
    const comp = ctx.comp;
    const classes = Q.classesOf(comp.id);
    if (!classes.length) return page({ ...ctx, section: 'days' }, 'All days', '<div class="wf-empty">Add a class first. <a href="#' + C(comp) + '/setup/classes/new">Add class</a></div>');
    return page({ ...ctx, section: 'days' }, 'All days', '<p class="muted small">Each cell shows the class day\'s current step and its next action.</p><div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Date</th>' + classes.map((c) => '<th>' + e(c.name) + '</th>').join('') + '</tr></thead><tbody>' +
      comp.dates.map((d) => '<tr' + (d === KH.TODAY ? ' class="sel"' : '') + '><td class="nowrap"><a href="#' + C(comp) + '/days/' + d + '"><b>' + W.date(d) + '</b></a></td>' + classes.map((c) => '<td>' + cellFor(c, d) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div>', '', [[C(comp), comp.name]]);
  };
  P['/c/:comp/days/:date'] = (ctx) => {
    const comp = ctx.comp;
    const date = ctx.params.date;
    if (!comp.dates.includes(date)) return page(ctx, 'Not a competition date', '<div class="wf-empty">' + W.date(date, true) + ' is not a competition date.</div>');
    const classes = Q.classesOf(comp.id);
    const i = comp.dates.indexOf(date);
    const nav = (i > 0 ? '<a class="wf-btn small" href="#' + C(comp) + '/days/' + comp.dates[i - 1] + '">← ' + W.date(comp.dates[i - 1]) + '</a>' : '') + (i < comp.dates.length - 1 ? '<a class="wf-btn small" href="#' + C(comp) + '/days/' + comp.dates[i + 1] + '">' + W.date(comp.dates[i + 1]) + ' →</a>' : '');
    return page({ ...ctx, section: 'days' }, W.date(date, true), classes.length ? '<div class="e-list">' + classes.map((cls) => dayItem(cls, date)).join('') + '</div>' : '<div class="wf-empty">No classes yet</div>', nav, [[C(comp), comp.name], [C(comp) + '/days', 'All days']]);
  };

  function stepper(cls, date, cur, ds) {
    return '<div class="e-steps">' + STEPS.map(([k, label], i) => {
      const s = ds.st[k];
      const cls2 = s.skip ? 'skip' : s.done ? 'done' : k === ds.current ? 'next' : '';
      return '<a class="e-step' + (k === cur ? ' on' : '') + '" href="#' + DD(cls, date) + '/' + k + '"><span class="e-num ' + cls2 + '">' + (s.done && !s.skip ? '✓' : i + 1) + '</span><span><span class="t">' + label + '</span>' + (k === ds.current ? ' <span class="wf-badge">next</span>' : '') + '<br><span class="s">' + e(s.note) + '</span></span></a>';
    }).join('') + '</div>';
  }

  function dayPage(ctx, step, body) {
    const comp = ctx.comp;
    const cls = ctx.cls;
    const date = ctx.params.date;
    if (!cls) return page(ctx, 'Not found', '<div class="wf-empty">No such class</div>');
    if (!comp.dates.includes(date)) return page(ctx, 'Not a competition date', '<div class="wf-empty">' + W.date(date, true) + ' is not a competition date.</div>');
    const ds = dayState(cls, date);
    const i = STEPS.findIndex(([k]) => k === step);
    const others = Q.classesOf(comp.id).filter((c) => c !== cls).map((c) => '<a class="wf-btn small ghost" href="#' + DD(c, date) + '/' + step + '">' + e(c.name) + '</a>').join('');
    const title = e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, date)) + ' <span class="muted" style="font-weight:400">' + W.date(date, true) + '</span> ' + (ds.cd ? W.dayBadge(ds.cd.status) : '<span class="wf-badge none">untouched</span>');
    const inner = !ds.cd ? W.untouchedDay(cls, date) : body;
    const prev = STEPS[i - 1];
    const nxt = STEPS[i + 1];
    const foot = '<div class="e-foot">' + (prev ? '<a class="wf-btn" href="#' + DD(cls, date) + '/' + prev[0] + '">← ' + (i) + '. ' + prev[1] + '</a>' : '<a class="wf-btn" href="#' + C(comp) + '">← Today</a>') +
      '<span class="muted small">' + (ds.current ? 'Next action: ' + e(ds.action) : 'This class day is settled') + '</span>' +
      (nxt ? '<a class="wf-btn primary" href="#' + DD(cls, date) + '/' + nxt[0] + '">Continue: ' + (i + 2) + '. ' + nxt[1] + ' →</a>' : '<a class="wf-btn primary" href="#' + C(comp) + '">Back to today →</a>') + '</div>';
    return page({ ...ctx, section: 'days' }, title, stepper(cls, date, step, ds) + inner + foot, others ? '<span class="muted small">Same step for</span>' + others : '', [[C(comp), comp.name], [C(comp) + '/days/' + date, W.date(date, true)]]);
  }

  const DAY = {};
  DAY.plan = (ctx) => {
    const cd = ctx.cd;
    return '<div class="wf-stack"><div class="wf-box"><h3>Working status</h3><div class="wf-kv"><span>Status</span><span>' + W.select('status', KH.DAY_STATUSES, cd.status, 'data-change="setWorkingStatus" data-cd="' + cd.id + '"') + '</span><span></span><span class="muted small">Set cancelled here when the day is called off. Publishing is step 5.</span></div></div>' +
      '<div class="wf-cols" style="grid-template-columns:3fr 2fr"><div class="wf-box"><h3>Practice, start procedure and limits</h3>' + W.dayOverrides(cd) + '</div><div class="wf-box"><h3>Airspace</h3>' + W.dayAirspace(cd) + '</div></div></div>';
  };
  DAY.task = (ctx) => (ctx.cand ? '<div class="e-crumbs"><a href="#' + links.classDayTasks(ctx.cd) + '">← All candidates</a></div>' + W.taskEditor(ctx.cand) : W.candidateList(ctx.cd));
  DAY.flights = (ctx) => {
    const comp = ctx.comp;
    const cd = ctx.cd;
    const stale = Q.staleFilesOf(cd);
    const unresolved = W.filterFiles(comp, { date: cd.date, state: 'unresolved' }).rows;
    const mine = W.filterFiles(comp, { date: cd.date, class: ctx.cls.slug }).rows;
    const missing = Q.resultsOf(cd).filter((r) => !Q.filesOfResult(r).length).map((r) => Q.competitor(r.competitorId));
    const done = (b) => b;
    return '<div class="wf-stack"><div class="e-list">' +
      item(done(!stale.length), '<b>Rerun stale analyses</b>', stale.length ? stale.length + ' files were analysed with settings that have changed since. Rerun them one at a time.' : 'No stale analyses', '') +
      (stale.length ? '<div style="padding:0 12px 10px 54px"><table class="wf-table"><tbody>' + stale.map((f) => { const r = Q.resolve(f); return '<tr><td><a href="#' + links.file(f) + '">' + e(f.name) + '</a></td><td>' + e(r.competitor ? r.competitor.cid : '') + '</td><td>' + W.staleBadge(f) + '</td><td class="right"><button class="wf-btn small" data-act="rerun" data-file="' + f.id + '">Rerun</button></td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      item(!unresolved.length, '<b>Resolve unresolved files flown on ' + W.date(cd.date) + '</b>', unresolved.length ? unresolved.length + ' files from this date match no competitor. They may belong to any class.' : 'Every file from this date resolves', '') +
      (unresolved.length ? '<div style="padding:0 12px 10px 54px">' + W.filesTable(unresolved) + '</div>' : '') +
      item(!missing.length, '<b>Collect missing flights</b>', missing.length ? missing.length + ' competitors have no file: ' + missing.slice(0, 12).map((c) => e(c.cid)).join(', ') + (missing.length > 12 ? '…' : '') : 'Every competitor has a file', '') +
      '<div style="padding:0 12px 12px 54px"><details><summary>Upload a file as scorer</summary><div style="margin-top:8px">' + W.scorerUploadForm(comp, { date: cd.date }) + '</div></details></div>' +
      '</div><div><h3>' + mine.length + ' files resolved to ' + e(ctx.cls.name) + ' on this day</h3>' + W.filesTable(mine) + '</div></div>';
  };
  DAY.review = (ctx) => {
    const cd = ctx.cd;
    const f = ctx.query.show === undefined ? 'check' : ctx.query.show;
    const c = Q.dayCounts(cd);
    const rows = KH.score(cd).rows.filter((x) => x.result.checkReasons.length);
    const base = CD(cd) + '/review';
    const flt = (k, label) => '<a class="wf-btn small' + (f === k ? ' primary' : '') + '" href="#' + base + '?show=' + k + '">' + label + '</a>';
    return '<div class="wf-stack"><div class="wf-row between"><div class="wf-row">' + flt('check', 'In check ' + c.check) + flt('unknown', 'Unknown ' + c.unknown) + flt('stale', 'Stale ' + c.stale) + flt('', 'All ' + c.results) + '</div>' +
      (rows.length ? '<a class="wf-btn primary" href="#' + links.result(rows[0].result) + '">Start review: ' + rows.length + ' in check →</a>' : '<span class="muted">Nothing in check</span>') + '</div>' + W.resultsTable(cd, { filter: f }) + '</div>';
  };
  DAY.publish = (ctx) => '<div class="wf-stack"><div class="wf-cols" style="grid-template-columns:2fr 3fr"><div class="wf-box"><h3>Publish</h3>' + W.publishPanel(ctx.cd) + '</div><div class="wf-box"><h3>Latest published copy</h3>' + W.publishedCopy(ctx.cd) + '</div></div></div>';

  P['/c/:comp/days/:date/:class'] = (ctx) => {
    if (!ctx.cls) return dayPage(ctx, 'plan', '');
    const ds = dayState(ctx.cls, ctx.params.date);
    const step = ds.current || 'publish';
    return dayPage(ctx, step, ctx.cd ? DAY[step](ctx) : '');
  };
  P['/c/:comp/days/:date/:class/:step'] = (ctx) => {
    if (!DAY[ctx.params.step]) return page(ctx, 'Not found', '<div class="wf-empty">No step ' + e(ctx.params.step) + '</div>');
    return dayPage(ctx, ctx.params.step, ctx.cd ? DAY[ctx.params.step](ctx) : '');
  };
  P['/c/:comp/days/:date/:class/task/:cand'] = (ctx) => dayPage(ctx, 'task', ctx.cd ? (ctx.cand ? DAY.task(ctx) : '<div class="wf-empty">No such candidate</div>') : '');

  function queue(ctx) {
    const rows = KH.score(ctx.cd).rows;
    const check = rows.filter((x) => x.result.checkReasons.length || x.result === ctx.result);
    const i = check.findIndex((x) => x.result === ctx.result);
    return { check, prev: check[i - 1], next: check[i + 1], pos: i + 1, total: check.length };
  }
  P['/c/:comp/days/:date/:class/review/:cid'] = (ctx) => {
    if (!ctx.cd || !ctx.result) return dayPage(ctx, 'review', '<div class="wf-empty">No such competitor in this class</div>');
    const r = ctx.result;
    const comp = ctx.competitor;
    const scored = r.scoredFileId ? Q.file(r.scoredFileId) : null;
    const task = Q.task(ctx.cd);
    const n = queue(ctx);
    const rail = '<div class="wf-box fill"><div class="wf-row between"><b>Review queue · ' + (n.pos ? n.pos + ' of ' + n.total : 'not in check') + '</b><div class="wf-row"><a class="wf-btn small ghost" href="#' + CD(ctx.cd) + '/review">All results</a>' +
      (n.prev ? '<a class="wf-btn small" href="#' + links.result(n.prev.result) + '">← ' + e(n.prev.competitor.cid) + '</a>' : '') + (n.next ? '<a class="wf-btn small" href="#' + links.result(n.next.result) + '">Skip to ' + e(n.next.competitor.cid) + ' →</a>' : '<a class="wf-btn small" href="#' + CD(ctx.cd) + '/publish">Done: continue to publish →</a>') + '</div></div>' +
      '<div class="e-queue" style="margin-top:6px">' + n.check.map((x) => '<a class="' + (x.result === r ? 'on' : x.result.checkReasons.length ? '' : 'done') + '" href="#' + links.result(x.result) + '">' + e(x.competitor.cid) + '</a>').join('') + '</div></div>';
    const body = '<div class="wf-stack">' + rail + '<div><h2 style="margin:0">' + e(comp.cid) + ' · ' + e(Q.crewName(comp)) + '</h2><div class="muted small">' + e(comp.gliderType) + (comp.handicap ? ', handicap ' + comp.handicap : '') + (comp.hc ? ', hors concours' : '') + ' · <a href="#' + links.competitor(comp) + '">competitor</a></div></div>' +
      '<div class="e-list">' +
      item(!r.checkReasons.length, '<b>a. Check reasons</b>', r.checkReasons.length ? 'Clearing them marks the result reviewed and opens the next one in the queue' : 'Reviewed. Nothing to check.', '') + '<div style="padding:0 12px 10px 54px">' + W.checkReasons(r) + '</div>' +
      item(r.status !== 'unknown', '<b>b. Result source</b>', 'Pick the scored file, or enter a manual result', '') + '<div style="padding:0 12px 10px 54px">' + W.resultStatusControl(r) + '<div class="wf-box" style="margin-top:8px"><h3>Files</h3>' + W.resultFiles(r) + '</div>' + (r.status === 'manual result' ? '<div class="wf-box" style="margin-top:8px"><h3>Manual result</h3>' + W.manualForm(r) + '</div>' : '') + '</div>' +
      (scored ? item(!scored.analysis.stale.length, '<b>c. Scored file: ' + e(scored.name) + '</b> ' + W.staleBadge(scored), 'Analysis log, start candidates and overrides', '') +
        '<div style="padding:0 12px 10px 54px" class="wf-stack"><div class="wf-cols"><div class="wf-box">' + W.outputSummary(scored) + '</div>' + (task ? W.taskMap(task.points, { track: scored.seed, finished: scored.analysis.output && scored.analysis.output.finished, h: 200 }) : '') + '</div>' +
        '<div class="wf-box"><h3>Start candidates</h3>' + W.startCandidates(scored) + '</div><div class="wf-box">' + W.analysisLog(scored) + '</div><div class="wf-box"><h3>Overrides</h3>' + W.overrides(scored) + '</div></div>' : '') +
      item(!!r.penalty, '<b>d. Penalty</b>', 'Optional', '') + '<div style="padding:0 12px 10px 54px">' + W.penaltyForm(r) + '</div>' +
      item(false, '<b>e. Remarks and handicap</b>', 'Optional', '') + '<div style="padding:0 12px 12px 54px">' + W.resultRemarks(r) + '</div>' +
      '</div></div>';
    return dayPage(ctx, 'review', body);
  };

  // ---------- reference and wrap-up ----------

  P['/c/:comp/files'] = (ctx) => {
    const base = C(ctx.comp) + '/files';
    const { rows, hiddenUnresolved } = W.filterFiles(ctx.comp, ctx.query);
    return page({ ...ctx, section: 'files' }, 'IGC files', '<div class="wf-stack"><p class="muted small">Reference list of every file. Each class day\'s step 3 shows the files of that day.</p>' + W.fileFilters(ctx.comp, ctx.query, base) +
      (hiddenUnresolved ? '<div class="wf-note warn">' + hiddenUnresolved + ' unresolved files are hidden by this filter. <a href="#' + base + '?state=unresolved">Show unresolved</a></div>' : '') +
      '<div class="muted small">' + rows.length + ' files</div>' + W.filesTable(rows.slice(0, 200)) + (rows.length > 200 ? '<p class="muted small">First 200 shown</p>' : '') +
      '<details><summary>Upload a file as scorer</summary><div class="wf-box" style="margin-top:8px">' + W.scorerUploadForm(ctx.comp) + '</div></details></div>', '', [[C(ctx.comp), ctx.comp.name]]);
  };
  P['/c/:comp/files/:file'] = (ctx) => {
    const f = ctx.file;
    if (!f) return page(ctx, 'Not found', '<div class="wf-empty">No such file</div>');
    const res = Q.resolve(f);
    const task = res.ok ? Q.task(res.classDay) : null;
    const back = res.ok ? '<a class="wf-btn small" href="#' + links.result(res.result) + '">Open in review step</a>' : '';
    return page({ ...ctx, section: 'files' }, e(f.name), '<div class="wf-stack"><div class="wf-cols"><div class="wf-box">' + W.fileMeta(f) + '</div><div class="wf-stack">' + (task ? W.taskMap(task.points, { track: f.seed, finished: f.analysis.output && f.analysis.output.finished }) : '<div class="wf-map" style="height:200px"><span class="tag">Map: track only</span></div>') + '<div class="wf-box">' + W.outputSummary(f) + '</div></div></div>' +
      (f.analysis.candidates && f.analysis.candidates.length ? '<div class="wf-box"><h3>Start candidates</h3>' + W.startCandidates(f) + '</div>' : '') +
      '<div class="wf-box">' + W.analysisLog(f) + '</div>' + (res.ok ? '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(f) + '</div>' : '') + '</div>', back, [[C(ctx.comp), ctx.comp.name], [C(ctx.comp) + '/files', 'IGC files']]);
  };

  P['/c/:comp/archive'] = (ctx) => {
    const comp = ctx.comp;
    if (comp.lifecycle === 'archived') return page(ctx, 'Delete', W.lifecycle(comp), '', [[C(comp), comp.name]]);
    const items = [];
    for (const cls of Q.classesOf(comp.id)) for (const cd of Q.classDaysOf(cls.id)) {
      const ds = dayState(cls, cd.date);
      items.push(item(!ds.current, '<a href="#' + CD(cd) + '">' + e(W.dayTitle(cd, cls)) + '</a> ' + W.dayBadge(cd.status), ds.current ? 'Not settled: ' + e(ds.action.toLowerCase()) : 'Settled', ds.current ? '<a class="wf-btn small" href="#' + CD(cd) + '/' + ds.current + '">Open</a>' : ''));
    }
    const open = Q.unresolvedFiles(comp.id).length;
    const unsettled = items.filter((x) => !x.includes('e-item done')).length;
    return page(ctx, 'Wrap up', '<div class="wf-stack"><p class="muted">Archiving has no precondition. This checklist shows what would be lost unsettled. The confirmation lists the same class days again.</p>' +
      '<div class="e-list">' + (items.length ? items.join('') : item(true, 'No class days', '', '')) + item(!open, 'Unresolved IGC files', open ? open + ' files are not attached to any result' : 'None', open ? '<a class="wf-btn small" href="#' + C(comp) + '/files?state=unresolved">Open</a>' : '') + '</div>' +
      '<div class="muted small">' + unsettled + ' class days not settled</div>' + W.lifecycle(comp) + '</div>', '', [[C(comp), comp.name]]);
  };

  KH.mount({
    id: 'e',
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
      if (!ctx.params.cid || !ctx.cd) return;
      const n = queue(ctx);
      if (n.next) KH.go(links.result(n.next.result));
      else KH.go(CD(ctx.cd) + '/publish');
    },
  });
})();
