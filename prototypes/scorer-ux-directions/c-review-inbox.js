// PROTOTYPE: Direction C, "Review inbox". The competition opens on a work queue; structure pages hide behind Browse and a jump box.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const S = KH.state;
  const e = KH.esc;

  const C = (comp) => '/c/' + comp.slug;
  const compOf = (cls) => Q.competition(cls.competitionId);
  const SH = (cls, date) => C(compOf(cls)) + '/sheet/' + cls.slug + '/' + date;
  const SHD = (cd) => SH(Q.class(cd.classId), cd.date);
  const B = (comp, page) => C(comp) + '/browse/' + page;

  const links = {
    competition: C,
    cls: (cls) => B(compOf(cls), 'classes/' + cls.slug),
    classDay: SHD,
    classDayDate: SH,
    classDayTasks: SHD,
    candidate: (t) => SHD(Q.classDay(t.classDayId)) + '/task/' + t.id,
    result: (r) => SHD(Q.classDay(r.classDayId)) + '/pilot/' + Q.competitor(r.competitorId).cid,
    file: (f) => B(Q.competition(Q.logger(f.loggerId).competitionId), 'files/' + f.id),
    competitor: (c) => B(Q.competition(c.competitionId), 'competitors/' + c.id),
    competitors: (comp) => B(comp, 'competitors'),
    logger: (l) => B(Q.competition(l.competitionId), 'loggers/' + l.id),
    files: (comp) => B(comp, 'files'),
  };

  const EX = '/c/oberrhein-2026';
  const EXS = EX + '/sheet/club/2026-07-28';
  const routes = [
    { path: '/', title: 'My competitions', group: 'Account', example: '/' },
    { path: '/new', title: 'Create competition', group: 'Account', example: '/new' },
    { path: '/account', title: 'Account and invitations', group: 'Account', example: '/account' },
    { path: '/staff/users', title: 'Users and invitation tree (staff)', group: 'Staff', example: '/staff/users' },
    { path: '/staff/competitions', title: 'All competitions (staff)', group: 'Staff', example: '/staff/competitions' },
    { path: '/c/:comp', title: 'Inbox, busiest folder', group: 'Inbox', example: EX },
    { path: '/c/:comp/inbox/:folder', title: 'Inbox folder', group: 'Inbox', example: EX + '/inbox/check' },
    { path: '/c/:comp/inbox/:folder/:item', title: 'Inbox item (result, file, publish, task, setup)', group: 'Inbox', example: null },
    { path: '/c/:comp/sheet/:class/:date', title: 'Class day sheet', group: 'Class day', example: EXS },
    { path: '/c/:comp/sheet/:class/:date/task/:cand', title: 'Task candidate editor', group: 'Class day', example: null },
    { path: '/c/:comp/sheet/:class/:date/pilot/:cid', title: 'Result of one pilot', group: 'Class day', example: null },
    { path: '/c/:comp/browse/days', title: 'Dates and class day grid', group: 'Browse', example: EX + '/browse/days' },
    { path: '/c/:comp/browse/details', title: 'Details and upload password', group: 'Browse', example: EX + '/browse/details' },
    { path: '/c/:comp/browse/classes', title: 'Classes', group: 'Browse', example: EX + '/browse/classes' },
    { path: '/c/:comp/browse/classes/new', title: 'Add class', group: 'Browse', example: EX + '/browse/classes/new' },
    { path: '/c/:comp/browse/classes/:class', title: 'Class settings and overall', group: 'Browse', example: EX + '/browse/classes/club' },
    { path: '/c/:comp/browse/turnpoints', title: 'Turnpoint file', group: 'Browse', example: EX + '/browse/turnpoints' },
    { path: '/c/:comp/browse/airspace', title: 'Airspace file', group: 'Browse', example: EX + '/browse/airspace' },
    { path: '/c/:comp/browse/competitors', title: 'Competitors', group: 'Browse', example: EX + '/browse/competitors' },
    { path: '/c/:comp/browse/competitors/new', title: 'Add competitor', group: 'Browse', example: EX + '/browse/competitors/new' },
    { path: '/c/:comp/browse/competitors/:competitor', title: 'Competitor', group: 'Browse', example: EX + '/browse/competitors/p1' },
    { path: '/c/:comp/browse/loggers', title: 'Loggers', group: 'Browse', example: EX + '/browse/loggers' },
    { path: '/c/:comp/browse/loggers/new', title: 'Add logger', group: 'Browse', example: EX + '/browse/loggers/new' },
    { path: '/c/:comp/browse/loggers/:logger', title: 'Logger and links', group: 'Browse', example: EX + '/browse/loggers/lx1' },
    { path: '/c/:comp/browse/files', title: 'IGC files', group: 'Browse', example: EX + '/browse/files' },
    { path: '/c/:comp/browse/files/:file', title: 'IGC file', group: 'Browse', example: null },
    { path: '/c/:comp/browse/members', title: 'Members and invitations', group: 'Browse', example: EX + '/browse/members' },
    { path: '/c/:comp/browse/archive', title: 'Archive or delete', group: 'Browse', example: EX + '/browse/archive' },
  ];

  // ---------- queue ----------

  const FOLDERS = [
    { key: 'everything', label: 'Everything', hint: 'Every open item from the folders below, most urgent first.' },
    { key: 'check', label: 'Results in check', hint: 'Results with check reasons. Reviewing one moves on to the next.' },
    { key: 'unknown', label: 'Unknown results', hint: 'Competitors without a scored file, a manual result or "did not fly" on a class day with a task.' },
    { key: 'stale', label: 'Stale analyses', hint: 'Files whose analysis ran with inputs that changed since. Rerun them one at a time.' },
    { key: 'unresolved', label: 'Unresolved IGC files', hint: 'Files no logger link or date assigns to a competitor and class day.' },
    { key: 'publish', label: 'Unpublished changes', hint: 'Class days whose working state differs from the latest published copy.' },
    { key: 'deadlines', label: 'Deadlines passed', hint: 'Unofficial class days whose complaint deadline has passed.' },
    { key: 'tasks', label: 'Tasks to publish', hint: 'The next competition dates where a class has no published task.' },
    { key: 'setup', label: 'Setup gaps', hint: 'What the competition still needs before the practice day.' },
  ];
  const LIVE = ['task published', 'preliminary', 'unofficial', 'final'];

  function liveDays(comp, cls) {
    const out = [];
    for (const c of Q.classesOf(comp.id)) if (!cls || c === cls) for (const cd of Q.classDaysOf(c.id)) out.push(cd);
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
  const dayName = (cd) => Q.class(cd.classId).name + ' · ' + Q.dayLabel(cd.classId, cd.date);

  function resultItem(r, why) {
    const c = Q.competitor(r.competitorId);
    const cd = Q.classDay(r.classDayId);
    return { key: 'result.' + r.id, kind: 'result', obj: r, title: c.cid + ' · ' + Q.crewName(c), sub: dayName(cd) + ' · ' + W.date(cd.date), why };
  }
  function fileItem(f, why) {
    const res = Q.resolve(f);
    return { key: 'file.' + f.id, kind: 'file', obj: f, title: f.name, sub: res.ok ? res.competitor.cid + ' · ' + dayName(res.classDay) : 'Logger ' + Q.loggerLabel(Q.logger(f.loggerId)) + ', flown ' + W.date(Q.flightDate(f)), why };
  }

  function folderItems(comp, key, cls) {
    const days = liveDays(comp, cls);
    switch (key) {
      case 'check':
        return days.flatMap((cd) => Q.resultsOf(cd).filter((r) => r.checkReasons.length).map((r) => resultItem(r, r.checkReasons.length + ' check: ' + r.checkReasons[0].text)));
      case 'unknown':
        return days.filter((cd) => LIVE.includes(cd.status)).flatMap((cd) => Q.resultsOf(cd).filter((r) => r.status === 'unknown').map((r) => resultItem(r, Q.filesOfResult(r).length ? Q.filesOfResult(r).length + ' files, none picked' : 'no file yet')));
      case 'stale':
        return Q.filesOf(comp.id).filter((f) => !f.deleted && f.analysis.stale.length && (!cls || (Q.resolve(f).ok && Q.resolve(f).competitor.classId === cls.id)))
          .map((f) => fileItem(f, 'stale: ' + f.analysis.stale.map((s) => s.reason).join(', ')));
      case 'unresolved':
        return cls ? [] : Q.unresolvedFiles(comp.id).map((f) => fileItem(f, Q.resolve(f).reason || 'unresolved'));
      case 'publish':
        return days.filter((cd) => cd.reasons.length && !Q.deadlinePassed(cd)).map((cd) => ({ key: 'publish.' + cd.id, kind: 'publish', obj: cd, title: dayName(cd), sub: W.date(cd.date) + ' · ' + cd.status, why: 'unpublished ' + cd.reasons.join(', ').toLowerCase() }));
      case 'deadlines':
        return days.filter((cd) => Q.deadlinePassed(cd)).map((cd) => ({ key: 'deadline.' + cd.id, kind: 'publish', obj: cd, title: dayName(cd), sub: W.date(cd.date) + ' · unofficial', why: 'deadline ' + W.dt(cd.complaintDeadline) + ', ready for final' }));
      case 'tasks': {
        const next = comp.dates.filter((d) => d >= KH.TODAY).slice(0, 3);
        const out = [];
        for (const d of next) for (const c of Q.classesOf(comp.id)) {
          if (cls && c !== cls) continue;
          const cd = Q.classDayOn(c.id, d);
          if (cd && (cd.status === 'cancelled' || Q.task(cd))) continue;
          out.push({ key: 'task.' + c.slug + '~' + d, kind: 'task', obj: { cls: c, date: d, cd }, title: c.name + ' · ' + Q.dayLabel(c.id, d), sub: W.date(d), why: cd ? Q.candidates(cd.id).length + ' candidates, none published' : 'untouched' });
        }
        return out;
      }
      case 'setup':
        return cls ? [] : W.setupState(comp).filter((s) => !s.done).map((s) => ({ key: 'setup.' + s.key, kind: 'setup', obj: s, title: s.label, sub: 'Setup', why: 'missing' }));
      case 'everything': {
        const seen = new Set();
        const out = [];
        for (const k of ['deadlines', 'publish', 'check', 'stale', 'unresolved', 'tasks', 'unknown', 'setup']) for (const it of folderItems(comp, k, cls)) {
          if (seen.has(it.key)) continue;
          seen.add(it.key);
          out.push({ ...it, folder: k });
        }
        return out;
      }
    }
    return [];
  }

  function findItem(comp, key) {
    const [kind, id] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)];
    if (kind === 'result') {
      const r = Q.result(id);
      return r && resultItem(r, '');
    }
    if (kind === 'file') {
      const f = Q.file(id);
      return f && fileItem(f, '');
    }
    if (kind === 'publish' || kind === 'deadline') {
      const cd = Q.classDay(id);
      return cd && { key, kind: 'publish', obj: cd, title: dayName(cd), sub: W.date(cd.date) };
    }
    if (kind === 'task') {
      const [slug, d] = id.split('~');
      const c = Q.classBySlug(comp.id, slug);
      return c && { key, kind: 'task', obj: { cls: c, date: d, cd: Q.classDayOn(c.id, d) }, title: c.name + ' · ' + Q.dayLabel(c.id, d), sub: W.date(d) };
    }
    if (kind === 'setup') {
      const s = W.setupState(comp).find((x) => x.key === id);
      return s && { key, kind: 'setup', obj: s, title: s.label, sub: 'Setup' };
    }
    return null;
  }

  // The order of the list as last shown, so finishing an item can move to the one after it.
  KH.ui.cQueue = KH.ui.cQueue || { base: '', keys: [] };
  const inboxPath = (comp, folder, key, query) => C(comp) + '/inbox/' + folder + (key ? '/' + key : '') + (query && query.class ? '?class=' + query.class : '');

  function busiest(comp) {
    for (const k of ['check', 'deadlines', 'publish', 'stale', 'unresolved', 'tasks', 'setup']) if (folderItems(comp, k).length) return k;
    return 'everything';
  }

  // ---------- shell ----------

  function jumpTargets(comp) {
    const out = [];
    const add = (label, href) => out.push({ label, href });
    for (const f of FOLDERS) add('Inbox: ' + f.label, inboxPath(comp, f.key));
    for (const [p, l] of [['days', 'Dates and class days'], ['details', 'Details and upload password'], ['classes', 'Classes'], ['turnpoints', 'Turnpoints'], ['airspace', 'Airspace'], ['competitors', 'Competitors'], ['loggers', 'Loggers'], ['files', 'IGC files'], ['members', 'Members'], ['archive', 'Archive or delete']]) add(l, B(comp, p));
    for (const cls of Q.classesOf(comp.id)) {
      add('Class ' + cls.name, links.cls(cls));
      for (const d of comp.dates) add(cls.name + ' · ' + Q.dayLabel(cls.id, d) + ' · ' + W.date(d), SH(cls, d));
    }
    for (const c of Q.competitorsOf(comp.id)) add(c.cid + ' · ' + Q.crewName(c) + ' (' + Q.class(c.classId).name + ')', links.competitor(c));
    for (const l of Q.loggersOf(comp.id)) add('Logger ' + Q.loggerLabel(l), links.logger(l));
    return out;
  }

  const BROWSE = [['days', 'Dates and class days'], ['details', 'Details and password'], ['classes', 'Classes'], ['turnpoints', 'Turnpoints'], ['airspace', 'Airspace'], ['competitors', 'Competitors'], ['loggers', 'Loggers'], ['files', 'IGC files'], ['members', 'Members'], ['archive', 'Archive or delete']];

  function header(ctx) {
    const me = Q.me();
    const comp = ctx.comp;
    const live = comp && comp.lifecycle !== 'archived';
    const browse = comp ? (live ? BROWSE : [['members', 'Members'], ['archive', 'Delete']]) : [];
    const inBrowse = ctx.path.includes('/browse/');
    return '<header class="c-head"><a class="c-brand" href="#/">Keyhole</a>' +
      (comp ? '<select class="c-switch" onchange="location.hash=this.value">' + Q.myCompetitions().map((c) => '<option value="#' + C(c) + '"' + (c === comp ? ' selected' : '') + '>' + e(c.name) + '</option>').join('') + '<option value="#/">All competitions…</option></select>' +
        (live ? '<a class="c-tab' + (ctx.path.includes('/inbox') || ctx.path === C(comp) ? ' on' : '') + '" href="#' + C(comp) + '">Inbox</a>' : '<a class="c-tab' + (ctx.path === C(comp) ? ' on' : '') + '" href="#' + C(comp) + '">Archive</a>') +
        '<details class="c-browse"><summary class="c-tab' + (inBrowse ? ' on' : '') + '">Browse ▾</summary><div class="c-menu">' + browse.map(([p, l]) => '<a href="#' + B(comp, p) + '">' + l + '</a>').join('') + '</div></details>' +
        (live ? '<form class="c-jump" data-submit="cJump" data-comp="' + comp.id + '"><input name="q" list="c-jump-list" placeholder="Jump to pilot, class day, logger, page…  ( / )" autocomplete="off"><datalist id="c-jump-list">' + jumpTargets(comp).map((t) => '<option value="' + e(t.label) + '">').join('') + '</datalist></form>' : '') : '') +
      '<span class="grow"></span>' + (me.staff ? '<a href="#/staff/users">Staff</a>' : '') + '<a href="#/account">' + e(me.name) + '</a><span class="muted small">' + (comp ? e(Q.roleIn(comp) || 'no role') : me.staff ? 'staff' : '') + '</span><a href="#/" onclick="KH.toast(\'Prototype: would sign out\');return false" class="muted">Sign out</a></header>';
  }

  function blockedNote(ctx) {
    return ctx.comp && ctx.comp.blocked ? '<div class="wf-note warn">Blocked by staff ' + W.dt(ctx.comp.blocked.at) + ': ' + e(ctx.comp.blocked.note) + '. Only staff can see this competition.</div>' : '';
  }

  // A plain page below the header, used for everything that is not the inbox.
  function page(ctx, title, body, actions, crumbs) {
    const cr = ctx.comp ? [['#' + C(ctx.comp), ctx.comp.lifecycle === 'archived' ? ctx.comp.name : 'Inbox']].concat(crumbs || []) : crumbs || [];
    return header(ctx) + '<main class="c-page">' + (cr.length ? '<div class="c-crumbs">' + cr.map(([h, t]) => (h ? '<a href="' + h + '">' + e(t) + '</a>' : e(t))).join(' / ') + '</div>' : '') + blockedNote(ctx) +
      '<div class="wf-row between c-title"><h1>' + title + '</h1><div class="wf-row">' + (actions || '') + '</div></div>' + body + '</main>';
  }
  const browseCrumb = (ctx, p, l) => [['#' + B(ctx.comp, p), l]];

  // ---------- item details, shared by inbox and plain pages ----------

  function resultDetail(r) {
    const comp = Q.competitor(r.competitorId);
    const cd = Q.classDay(r.classDayId);
    const scored = r.scoredFileId ? Q.file(r.scoredFileId) : null;
    const task = Q.task(cd);
    return '<div class="wf-stack"><div><h2 style="margin:0">' + e(comp.cid) + ' · ' + e(Q.crewName(comp)) + '</h2><div class="muted small"><a href="#' + SHD(cd) + '">' + e(dayName(cd)) + ', ' + W.date(cd.date) + '</a> ' + W.dayBadge(cd.status) + ' · ' + e(comp.gliderType) + (comp.handicap ? ', handicap ' + comp.handicap : '') + (comp.hc ? ', hors concours' : '') + ' · <a href="#' + links.competitor(comp) + '">competitor</a></div></div>' +
      W.checkReasons(r) + W.resultStatusControl(r) +
      '<div class="wf-box"><h3>Files</h3>' + W.resultFiles(r) + '</div>' +
      (r.status === 'manual result' ? '<div class="wf-box"><h3>Manual result</h3>' + W.manualForm(r) + '</div>' : '') +
      (scored ? '<div class="wf-cols"><div class="wf-box"><h3>Scored file: ' + e(scored.name) + ' ' + W.staleBadge(scored) + '</h3>' + W.outputSummary(scored) + '</div>' + (task ? W.taskMap(task.points, { track: scored.seed, finished: scored.analysis.output && scored.analysis.output.finished, h: 200 }) : '') + '</div>' +
        '<div class="wf-box"><h3>Start candidates</h3>' + W.startCandidates(scored) + '</div><div class="wf-box">' + W.analysisLog(scored) + '</div><div class="wf-box"><h3>Overrides</h3>' + W.overrides(scored) + '</div>' : '') +
      '<div class="wf-cols"><div class="wf-box"><h3>Penalty</h3>' + W.penaltyForm(r) + '</div><div class="wf-box"><h3>Remarks and handicap</h3>' + W.resultRemarks(r) + '</div></div></div>';
  }

  function fileDetail(f) {
    const res = Q.resolve(f);
    const task = res.ok ? Q.task(res.classDay) : null;
    return '<div class="wf-stack"><div class="wf-cols"><div class="wf-box">' + W.fileMeta(f) + '</div><div class="wf-stack">' +
      (task ? W.taskMap(task.points, { track: f.seed, finished: f.analysis.output && f.analysis.output.finished, h: 200 }) : '<div class="wf-map" style="height:160px"><span class="tag">Map: track only</span></div>') + '<div class="wf-box">' + W.outputSummary(f) + '</div></div></div>' +
      (f.analysis.candidates && f.analysis.candidates.length ? '<div class="wf-box"><h3>Start candidates</h3>' + W.startCandidates(f) + '</div>' : '') +
      '<div class="wf-box">' + W.analysisLog(f) + '</div>' + (res.ok ? '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(f) + '</div>' : '') + '</div>';
  }

  function publishDetail(cd) {
    const c = Q.dayCounts(cd);
    return '<div class="wf-stack"><div><h2 style="margin:0">' + e(dayName(cd)) + ' ' + W.dayBadge(cd.status) + '</h2><div class="muted small">' + W.date(cd.date, true) + ' · ' + c.ok + ' OK, ' + c.check + ' in check, ' + c.unknown + ' unknown, ' + c.stale + ' stale · <a href="#' + SHD(cd) + '">open class day sheet</a></div></div>' +
      (c.check || c.stale ? '<div class="wf-note">' + (c.check ? '<a href="#' + inboxPath(Q.competition(Q.class(cd.classId).competitionId), 'check') + '?class=' + Q.class(cd.classId).slug + '">' + c.check + ' results in check</a> ' : '') + (c.stale ? c.stale + ' stale files ' : '') + 'remain on this class day.</div>' : '') +
      '<div class="wf-cols" style="grid-template-columns:1fr 1fr"><div class="wf-box"><h3>Publish</h3>' + W.publishPanel(cd) + '</div><div class="wf-box"><h3>Latest published copy</h3>' + W.publishedCopy(cd) + '</div></div></div>';
  }

  function taskDetail(o) {
    if (!o.cd) return W.untouchedDay(o.cls, o.date);
    const cands = Q.candidates(o.cd.id);
    const cur = Q.task(o.cd) || cands[0];
    return '<div class="wf-stack"><div><h2 style="margin:0">' + e(o.cls.name) + ' · ' + e(Q.dayLabel(o.cls.id, o.date)) + ' ' + W.dayBadge(o.cd.status) + '</h2><div class="muted small">' + W.date(o.date, true) + ' · <a href="#' + SHD(o.cd) + '">open class day sheet</a></div></div>' +
      W.candidateList(o.cd) + (cur ? '<div class="wf-box"><h3>Candidate ' + e(cur.letter || '(no letter)') + '</h3>' + W.taskEditor(cur) + '</div>' : '') + '</div>';
  }

  function setupDetail(comp, s) {
    switch (s.key) {
      case 'airfield':
      case 'details':
        return '<div class="wf-box">' + W.competitionDetails(comp) + '</div>';
      case 'classes':
        return '<div class="wf-box"><h3>Add class</h3>' + W.classForm(comp) + '</div>';
      case 'turnpoints':
        return W.turnpoints(comp);
      case 'airspace':
        return W.airspace(comp);
      case 'competitors':
        return '<div class="wf-stack"><div class="wf-box"><h3>Add competitor</h3>' + W.competitorForm(comp) + '</div>' + W.competitorsTable(comp) + '</div>';
      case 'loggers':
        return '<div class="wf-stack"><p class="muted small">Done once a logger is linked to a competitor.</p>' + W.loggersTable(comp) + '<div class="wf-box"><h3>Add logger</h3>' + W.loggerForm(comp) + '</div></div>';
      case 'members':
        return W.members(comp);
    }
    return '';
  }

  function itemDetail(comp, it) {
    if (it.kind === 'result') return resultDetail(it.obj);
    if (it.kind === 'file') return fileDetail(it.obj);
    if (it.kind === 'publish') return publishDetail(it.obj);
    if (it.kind === 'task') return taskDetail(it.obj);
    return '<h2>' + e(it.title) + '</h2>' + setupDetail(comp, it.obj);
  }

  // ---------- inbox ----------

  function folderSummary(comp) {
    const rows = Q.classesOf(comp.id).map((cls) => {
      const cd = Q.classDayOn(cls.id, KH.TODAY);
      if (!cd) return '';
      const c = Q.dayCounts(cd);
      return '<tr class="link" data-href="' + SHD(cd) + '"><td><b>' + e(cls.name) + '</b> ' + e(Q.dayLabel(cls.id, cd.date)) + '</td><td>' + W.dayBadge(cd.status) + '</td><td>' + (Q.task(cd) ? 'Task ' + e(Q.task(cd).letter) : '—') + '</td><td class="num">' + c.check + '</td><td class="num">' + c.unknown + '</td><td class="num">' + c.stale + '</td></tr>';
    }).join('');
    return (rows ? '<div><h3>Today, ' + W.date(KH.TODAY, true) + '</h3><table class="wf-table"><thead><tr><th>Class day</th><th>Status</th><th>Task</th><th class="num">Check</th><th class="num">Unknown</th><th class="num">Stale</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '') +
      '<div class="wf-box" style="max-width:480px">' + W.uploadPassword(comp) + '</div>';
  }

  function inbox(ctx, folderKey, itemKey) {
    const comp = ctx.comp;
    const folder = FOLDERS.find((f) => f.key === folderKey);
    if (!folder) return page(ctx, 'Not found', '<div class="wf-empty">No folder called ' + e(folderKey) + '</div>');
    const cls = ctx.query.class ? Q.classBySlug(comp.id, ctx.query.class) : null;
    const items = folderItems(comp, folder.key, cls);
    const base = inboxPath(comp, folder.key, '', ctx.query);
    const keys = items.map((x) => x.key);

    // Finishing an item takes it out of the folder: show the one after it instead.
    let sel = itemKey ? items.find((x) => x.key === itemKey) : null;
    let note = '';
    if (itemKey && !sel) {
      const prev = KH.ui.cQueue;
      const i = prev.base === base ? prev.keys.indexOf(itemKey) : -1;
      if (i >= 0) {
        const nextKey = prev.keys.slice(i + 1).concat(prev.keys.slice(0, i).reverse()).find((k) => keys.includes(k));
        if (nextKey) {
          sel = items.find((x) => x.key === nextKey);
          const p = inboxPath(comp, folder.key, nextKey, ctx.query);
          if (typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', '#' + p);
          note = '<div class="wf-note small">Done with the previous item. This is the next one.</div>';
        } else note = '<div class="wf-empty">Folder empty. Nothing left to do here.</div>';
      } else {
        sel = findItem(comp, itemKey);
        if (sel) note = '<div class="wf-note small">This item is not in ' + e(folder.label) + ' any more.</div>';
      }
    }
    KH.ui.cQueue = { base, keys };

    const counts = {};
    for (const f of FOLDERS) counts[f.key] = folderItems(comp, f.key, cls).length;
    const classes = Q.classesOf(comp.id);
    const q = (slug) => (slug ? '?class=' + slug : '');
    const folders = '<nav class="c-folders">' + FOLDERS.map((f) => '<a class="c-folder' + (f === folder ? ' on' : '') + (counts[f.key] ? '' : ' zero') + '" href="#' + C(comp) + '/inbox/' + f.key + q(ctx.query.class) + '"><span>' + f.label + '</span><span class="c-count">' + counts[f.key] + '</span></a>').join('') +
      (classes.length ? '<div class="c-sec">Class</div><a class="c-folder' + (!cls ? ' on' : '') + '" href="#' + C(comp) + '/inbox/' + folder.key + '">All classes</a>' + classes.map((c) => '<a class="c-folder' + (cls === c ? ' on' : '') + '" href="#' + C(comp) + '/inbox/' + folder.key + q(c.slug) + '">' + e(c.name) + '</a>').join('') : '') +
      '<div class="c-sec">Keys</div><div class="muted small" style="padding:0 12px">j / k or ↓ / ↑ move through the list. / jumps.</div></nav>';
    const selKey = sel ? sel.key : null;
    const list = '<div class="c-list"><div class="c-list-head"><b>' + folder.label + '</b>' + (cls ? ' · ' + e(cls.name) : '') + ' <span class="muted small">' + items.length + '</span><div class="muted small">' + folder.hint + '</div></div>' +
      (items.length ? items.map((it) => '<a class="c-item' + (it.key === selKey ? ' on' : '') + '" href="#' + inboxPath(comp, folder.key, it.key, ctx.query) + '"><div class="wf-row between"><b>' + e(it.title) + '</b>' + (it.folder && folder.key === 'everything' ? '<span class="wf-badge soft">' + e(FOLDERS.find((f) => f.key === it.folder).label.split(' ')[0].toLowerCase()) + '</span>' : '') + '</div><div class="muted small">' + e(it.sub) + '</div>' + (it.why ? '<div class="small">' + e(it.why) + '</div>' : '') + '</a>').join('') : '<div class="wf-empty">Nothing here.</div>') + '</div>';
    const detail = '<section class="c-detail">' + blockedNote(ctx) + note + (sel ? itemDetail(comp, sel) : '<h2>' + e(comp.name) + '</h2><p class="muted">Pick an item on the left, or press j.</p>' + folderSummary(comp)) + '</section>';
    return header(ctx) + '<div class="c-inbox">' + folders + list + detail + '</div>';
  }

  function moveSelection(step) {
    const ctx = KH.current();
    if (!ctx.route || !ctx.route.path.startsWith('/c/:comp/inbox')) return false;
    const keys = KH.ui.cQueue.keys;
    if (!keys.length) return true;
    const i = keys.indexOf(ctx.params.item);
    const j = i < 0 ? 0 : Math.max(0, Math.min(keys.length - 1, i + step));
    KH.go(inboxPath(ctx.comp, ctx.params.folder, keys[j], ctx.query));
    return true;
  }

  // ---------- pages ----------

  const P = {};

  P['/'] = (ctx) => page(ctx, 'My competitions', '<div class="wf-stack">' + W.incomingInvitations() +
    '<table class="wf-table"><thead><tr><th>Competition</th><th>Dates</th><th>Your role</th><th>State</th><th class="num">Open items</th></tr></thead><tbody>' +
    Q.myCompetitions().map((c) => '<tr class="link" data-href="' + C(c) + '"><td><b>' + e(c.name) + '</b><div class="muted small">' + e(c.location) + ' · ' + e(c.organiser) + '</div></td><td>' + W.date(c.dates[0], true) + ' – ' + W.date(c.dates[c.dates.length - 1], true) + '</td><td>' + e(Q.roleIn(c)) + '</td><td>' + (c.blocked ? '<span class="wf-badge solid">blocked</span> ' : '') + (c.lifecycle === 'archived' ? 'archived' : c.dates[0] > KH.TODAY ? 'upcoming' : c.dates[c.dates.length - 1] < KH.TODAY ? 'finished' : 'running') + '</td><td class="num">' + (c.lifecycle === 'archived' ? '' : folderItems(c, 'everything').length) + '</td></tr>').join('') +
    '</tbody></table></div>', '<a class="wf-btn primary" href="#/new">Create competition</a>');
  P['/new'] = (ctx) => page(ctx, 'Create competition', '<div class="wf-box" style="max-width:880px">' + W.createCompetitionForm() + '</div>');
  P['/account'] = (ctx) => page(ctx, 'Account and invitations', W.incomingInvitations() + W.account());
  P['/staff/users'] = (ctx) => (Q.me().staff ? page(ctx, 'Users', '<p class="muted">The invitation tree. Each user records who invited them. Nothing acts on a whole branch automatically.</p>' + W.staffUsers(), '<a class="wf-btn" href="#/staff/competitions">All competitions</a>') : denied(ctx));
  P['/staff/competitions'] = (ctx) => (Q.me().staff ? page(ctx, 'All competitions', W.staffCompetitions(), '<a class="wf-btn" href="#/staff/users">Users</a>') : denied(ctx));

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
    if (ctx.comp.lifecycle === 'archived' && !/^\/c\/:comp(\/browse\/(members|archive))?$/.test(ctx.route.path)) return page(ctx, 'Archived', '<div class="wf-empty">' + e(ctx.comp.name) + ' is archived. Its scoring work was removed.</div>');
    return null;
  }

  P['/c/:comp'] = (ctx) => {
    const comp = ctx.comp;
    if (comp.lifecycle === 'archived') {
      return page(ctx, e(comp.name), '<div class="wf-stack"><div class="wf-note">Archived ' + W.dt(comp.archivedAt) + '. The scoring work was removed, so there is no inbox. Only the published results remain, and they can no longer change.</div>' +
        '<table class="wf-table"><thead><tr><th>Class</th><th>Published days</th><th>Competitors</th><th>Last status</th></tr></thead><tbody>' + comp.archive.classes.map((c) => '<tr><td>' + e(c.name) + '</td><td>' + c.days + '</td><td>' + c.competitors + '</td><td>' + W.dayBadge(c.lastStatus) + '</td></tr>').join('') + '</tbody></table>' +
        '<p><a href="#" onclick="KH.toast(\'Public pages are out of scope for this prototype\');return false">Open public results ↗</a></p></div>', '', []);
    }
    return inbox(ctx, busiest(comp));
  };
  P['/c/:comp/inbox/:folder'] = (ctx) => inbox(ctx, ctx.params.folder);
  P['/c/:comp/inbox/:folder/:item'] = (ctx) => inbox(ctx, ctx.params.folder, ctx.params.item);

  // The class day sheet is one scrolling page: no tabs, every part of the day in order.
  function sheetTitle(ctx) {
    return e(ctx.cls.name) + ' · ' + e(Q.dayLabel(ctx.cls.id, ctx.params.date)) + ' <span class="muted" style="font-weight:400">' + W.date(ctx.params.date, true) + '</span>' + (ctx.cd ? ' ' + W.dayBadge(ctx.cd.status) : '');
  }
  function sheetNav(ctx) {
    const comp = ctx.comp;
    const i = comp.dates.indexOf(ctx.params.date);
    const prev = comp.dates[i - 1];
    const next = comp.dates[i + 1];
    return (prev ? '<a class="wf-btn small" href="#' + SH(ctx.cls, prev) + '">← ' + W.date(prev) + '</a>' : '') +
      '<select onchange="location.hash=this.value">' + Q.classesOf(comp.id).map((c) => '<option value="#' + SH(c, ctx.params.date) + '"' + (c === ctx.cls ? ' selected' : '') + '>' + e(c.name) + '</option>').join('') + '</select>' +
      (next ? '<a class="wf-btn small" href="#' + SH(ctx.cls, next) + '">' + W.date(next) + ' →</a>' : '');
  }
  function sheetGuard(ctx) {
    if (!ctx.cls) return page(ctx, 'Not found', '<div class="wf-empty">No such class</div>');
    if (!ctx.comp.dates.includes(ctx.params.date)) return page(ctx, 'Not a competition date', '<div class="wf-empty">' + W.date(ctx.params.date, true) + ' is not a competition date.</div>');
    return null;
  }
  const dayOverrideCount = (cd) => Object.values(cd.overrides || {}).filter((v) => v !== '' && v != null).length;
  const dayCrumb = (ctx) => [['#' + B(ctx.comp, 'days'), 'Dates and class days']];

  P['/c/:comp/sheet/:class/:date'] = (ctx) => {
    const g = sheetGuard(ctx);
    if (g) return g;
    const cd = ctx.cd;
    if (!cd) return page(ctx, sheetTitle(ctx), W.untouchedDay(ctx.cls, ctx.params.date), sheetNav(ctx), dayCrumb(ctx));
    const task = Q.task(cd);
    const c = Q.dayCounts(cd);
    const stale = Q.staleFilesOf(cd);
    const f = ctx.query.show || '';
    const flt = (k, label) => '<a class="wf-btn small' + (f === k ? ' primary' : '') + '" href="#' + SHD(cd) + (k ? '?show=' + k : '') + '">' + label + '</a>';
    const sec = (id, title, body) => '<section class="c-sec-block" id="' + id + '"><h2>' + title + '</h2>' + body + '</section>';
    const body = '<div class="c-sheet-jump small"><a href="#' + SHD(cd) + '" onclick="document.getElementById(\'c-s-task\').scrollIntoView();return false">Task</a><a href="#' + SHD(cd) + '" onclick="document.getElementById(\'c-s-set\').open=true;document.getElementById(\'c-s-set\').scrollIntoView();return false">Start, limits, airspace</a><a href="#' + SHD(cd) + '" onclick="document.getElementById(\'c-s-res\').scrollIntoView();return false">Results</a><a href="#' + SHD(cd) + '" onclick="document.getElementById(\'c-s-pub\').scrollIntoView();return false">Publish</a></div>' +
      '<div class="wf-box"><div class="wf-kv"><span>Status</span><span>' + W.select('status', KH.DAY_STATUSES, cd.status, 'data-change="setWorkingStatus" data-cd="' + cd.id + '"') + '</span><span>Practice day</span><span>' + (cd.practice ? 'yes' : 'no') + '</span>' +
      '<span>Results</span><span>' + c.ok + ' OK, ' + c.check + ' in check, ' + c.unknown + ' unknown</span><span>Unpublished</span><span>' + (cd.reasons.length ? e(cd.reasons.join(', ')) : 'nothing') + '</span></div></div>' +
      sec('c-s-task', 'Task', '<div class="wf-cols" style="grid-template-columns:3fr 2fr"><div>' + W.candidateList(cd) + '</div>' + (task ? W.taskMap(task.points) : '<div class="wf-empty">No task published</div>') + '</div>') +
      '<details class="c-sec-block" id="c-s-set"><summary><h2 style="display:inline">Start procedure, limits, airspace</h2> <span class="muted small">' + (dayOverrideCount(cd) ? dayOverrideCount(cd) + (dayOverrideCount(cd) === 1 ? ' day override' : ' day overrides') : 'class settings apply') + '</span></summary><div class="wf-cols" style="grid-template-columns:3fr 2fr;margin-top:10px"><div class="wf-box">' + W.dayOverrides(cd) + '</div><div class="wf-box">' + W.dayAirspace(cd) + '</div></div></details>' +
      sec('c-s-res', 'Results', '<div class="wf-stack">' + (stale.length ? '<div class="wf-box"><h3>Stale analyses (' + stale.length + ')</h3><table class="wf-table"><tbody>' + stale.map((x) => '<tr><td><a href="#' + links.file(x) + '">' + e(x.name) + '</a></td><td>' + e(Q.resolve(x).competitor.cid) + '</td><td>' + W.staleBadge(x) + '</td><td class="right"><button class="wf-btn small" data-act="rerun" data-file="' + x.id + '">Rerun</button></td></tr>').join('') + '</tbody></table></div>' : '') +
        '<div class="wf-row">' + flt('', 'All ' + c.results) + flt('check', 'In check ' + c.check) + flt('unknown', 'Unknown ' + c.unknown) + flt('stale', 'Stale ' + c.stale) + (c.check ? '<a class="wf-btn small" href="#' + inboxPath(ctx.comp, 'check') + '?class=' + ctx.cls.slug + '">Review in inbox →</a>' : '') + '</div>' + W.resultsTable(cd, { filter: f }) + '</div>') +
      sec('c-s-pub', 'Publish', '<div class="wf-cols" style="grid-template-columns:2fr 3fr"><div class="wf-box">' + W.publishPanel(cd) + '</div><div class="wf-box"><h3>Latest published copy</h3>' + W.publishedCopy(cd) + '</div></div>');
    return page(ctx, sheetTitle(ctx), body, sheetNav(ctx), dayCrumb(ctx));
  };
  P['/c/:comp/sheet/:class/:date/task/:cand'] = (ctx) => {
    const g = sheetGuard(ctx);
    if (g) return g;
    return page(ctx, 'Task candidate ' + e((ctx.cand && ctx.cand.letter) || ''), ctx.cand ? W.taskEditor(ctx.cand) : '<div class="wf-empty">No such candidate</div>', '', dayCrumb(ctx).concat([['#' + SH(ctx.cls, ctx.params.date), ctx.cls.name + ' · ' + Q.dayLabel(ctx.cls.id, ctx.params.date)]]));
  };
  P['/c/:comp/sheet/:class/:date/pilot/:cid'] = (ctx) => {
    const g = sheetGuard(ctx);
    if (g) return g;
    if (!ctx.result) return page(ctx, 'Not found', '<div class="wf-empty">No such competitor on this class day</div>');
    return page(ctx, 'Result', resultDetail(ctx.result), '', dayCrumb(ctx).concat([['#' + SH(ctx.cls, ctx.params.date), ctx.cls.name + ' · ' + Q.dayLabel(ctx.cls.id, ctx.params.date)]]));
  };

  P['/c/:comp/browse/days'] = (ctx) => page(ctx, 'Dates and class days', '<div class="wf-stack"><div><p class="muted small">Every cell opens a class day sheet. A class day exists once someone touches its cell.</p>' + W.classDayGrid(ctx.comp) + '</div><div class="wf-box"><h3>Competition dates</h3>' + W.datesEditor(ctx.comp) + '</div></div>');
  P['/c/:comp/browse/details'] = (ctx) => page(ctx, 'Details and upload password', '<div class="wf-cols" style="grid-template-columns:2fr 1fr"><div class="wf-box">' + W.competitionDetails(ctx.comp) + '</div><div class="wf-stack"><div class="wf-box">' + W.uploadPassword(ctx.comp) + '</div><div class="wf-box fill small"><b>Organiser terms</b><br>' + e(ctx.comp.terms.version) + ' accepted by ' + e(Q.user(ctx.comp.terms.userId).name) + ' on ' + W.dt(ctx.comp.terms.at) + ' for ' + e(ctx.comp.terms.organiser) + '</div></div></div>');
  P['/c/:comp/browse/turnpoints'] = (ctx) => page(ctx, 'Turnpoint file', W.turnpoints(ctx.comp));
  P['/c/:comp/browse/airspace'] = (ctx) => page(ctx, 'Airspace file', W.airspace(ctx.comp));
  P['/c/:comp/browse/classes'] = (ctx) => {
    const classes = Q.classesOf(ctx.comp.id, true);
    return page(ctx, 'Classes', '<table class="wf-table"><thead><tr><th>Class</th><th>Rule set edition</th><th>Handicapped</th><th class="num">Competitors</th><th class="num">Class days</th><th></th></tr></thead><tbody>' +
      (classes.length ? classes.map((c) => '<tr class="link' + (c.deleted ? ' dim' : '') + '" data-href="' + links.cls(c) + '"><td><b>' + e(c.name) + '</b>' + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : '') + '</td><td>' + e(c.edition) + '</td><td>' + (c.handicapScale ? 'scale ' + c.handicapScale + ', ' + e(c.handicapList) : 'no') + '</td><td class="num">' + Q.competitorsOf(ctx.comp.id, c.id).length + '</td><td class="num">' + Q.classDaysOf(c.id).length + '</td><td class="right">' + (c.deleted ? '<button class="wf-btn small" data-act="restoreClass" data-cls="' + c.id + '">Restore</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="6" class="muted">No classes yet</td></tr>') +
      '</tbody></table>', '<a class="wf-btn primary" href="#' + B(ctx.comp, 'classes/new') + '">Add class</a>');
  };
  P['/c/:comp/browse/classes/new'] = (ctx) => page(ctx, 'Add class', '<div class="wf-box">' + W.classForm(ctx.comp) + '</div>', '', browseCrumb(ctx, 'classes', 'Classes'));
  P['/c/:comp/browse/classes/:class'] = (ctx) => {
    if (!ctx.cls) return page(ctx, 'Not found', '<div class="wf-empty">No such class</div>');
    return page(ctx, e(ctx.cls.name), '<div class="wf-stack"><div class="wf-row"><a class="wf-btn" href="#' + B(ctx.comp, 'competitors') + '">Competitors (' + Q.competitorsOf(ctx.comp.id, ctx.cls.id).length + ')</a><a class="wf-btn" href="#' + inboxPath(ctx.comp, 'everything') + '?class=' + ctx.cls.slug + '">Open items in inbox</a></div><div class="wf-box">' + W.classForm(ctx.comp, ctx.cls) + '</div>' +
      '<div class="wf-row"><button class="wf-btn" data-act="printOverall" data-cls="' + ctx.cls.id + '">Overall results sheet…</button></div>' + '</div>', '', browseCrumb(ctx, 'classes', 'Classes'));
  };
  P['/c/:comp/browse/competitors'] = (ctx) => {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    const base = B(ctx.comp, 'competitors');
    return page(ctx, 'Competitors', '<div class="wf-stack"><div class="wf-row"><a class="wf-btn small' + (!cls ? ' primary' : '') + '" href="#' + base + '">All</a>' + Q.classesOf(ctx.comp.id).map((c) => '<a class="wf-btn small' + (cls === c ? ' primary' : '') + '" href="#' + base + '?class=' + c.slug + '">' + e(c.name) + ' ' + Q.competitorsOf(ctx.comp.id, c.id).length + '</a>').join('') + '</div>' + W.competitorsTable(ctx.comp, cls && cls.id) + '</div>', '<a class="wf-btn primary" href="#' + base + '/new' + (cls ? '?class=' + cls.slug : '') + '">Add competitor</a>');
  };
  P['/c/:comp/browse/competitors/new'] = (ctx) => {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    return page(ctx, 'Add competitor', '<div class="wf-box">' + W.competitorForm(ctx.comp, null, cls && cls.id) + '</div>', '', browseCrumb(ctx, 'competitors', 'Competitors'));
  };
  P['/c/:comp/browse/competitors/:competitor'] = (ctx) => {
    const c = ctx.competitor;
    if (!c) return page(ctx, 'Not found', '<div class="wf-empty">No such competitor</div>');
    const loggers = Q.loggersOf(ctx.comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
    const days = Q.classDaysOf(c.classId).filter((cd) => !['unplanned', 'cancelled'].includes(cd.status));
    return page(ctx, e(c.cid) + ' · ' + e(Q.crewName(c)) + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : ''), '<div class="wf-cols" style="grid-template-columns:3fr 2fr"><div class="wf-box">' + W.competitorForm(ctx.comp, c) + '</div><div class="wf-stack">' +
      '<div class="wf-box"><h3>Loggers</h3>' + (loggers.length ? '<table class="wf-table"><tbody>' + loggers.map((l) => '<tr><td><a href="#' + links.logger(l) + '">' + e(Q.loggerLabel(l)) + '</a></td><td>' + l.links.filter((k) => k.competitorId === c.id).map((k) => k.role + (k.from ? ' from ' + W.date(k.from) : '')).join(', ') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted small">No loggers linked</p>') + '<a class="wf-btn small" href="#' + B(ctx.comp, 'loggers/new') + '">Add logger</a></div>' +
      '<div class="wf-box"><h3>Results</h3><table class="wf-table"><tbody>' + days.map((cd) => { const r = Q.resultFor(cd.id, c.id); return '<tr class="link" data-href="' + links.result(r) + '"><td>' + e(Q.dayLabel(cd.classId, cd.date)) + '</td><td>' + W.resultStatus(r) + '</td><td>' + W.reviewBadge(r) + '</td><td>' + (r.penalty ? '−' + r.penalty.points : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="wf-box">' + W.dsqPanel(c) + '</div></div></div>', '', browseCrumb(ctx, 'competitors', 'Competitors'));
  };
  P['/c/:comp/browse/loggers'] = (ctx) => page(ctx, 'Loggers', W.loggersTable(ctx.comp), '<a class="wf-btn primary" href="#' + B(ctx.comp, 'loggers/new') + '">Add logger</a>');
  P['/c/:comp/browse/loggers/new'] = (ctx) => page(ctx, 'Add logger', '<div class="wf-box">' + W.loggerForm(ctx.comp) + '</div>', '', browseCrumb(ctx, 'loggers', 'Loggers'));
  P['/c/:comp/browse/loggers/:logger'] = (ctx) => {
    const l = ctx.logger;
    if (!l) return page(ctx, 'Not found', '<div class="wf-empty">No such logger</div>');
    const rows = S.files.filter((f) => f.loggerId === l.id).map((f) => ({ f, res: Q.resolve(f) }));
    return page(ctx, 'Logger ' + e(Q.loggerLabel(l)), '<div class="wf-stack"><div class="wf-box"><h3>Dated links</h3>' + W.loggerLinks(l) + '</div><div class="wf-box"><h3>Thresholds</h3>' + W.loggerForm(ctx.comp, l) + '</div><div class="wf-box"><h3>Files</h3>' + W.filesTable(rows) + '</div></div>', '', browseCrumb(ctx, 'loggers', 'Loggers'));
  };
  P['/c/:comp/browse/files'] = (ctx) => {
    const base = B(ctx.comp, 'files');
    const { rows, hiddenUnresolved } = W.filterFiles(ctx.comp, ctx.query);
    return page(ctx, 'IGC files', '<div class="wf-stack">' + W.fileFilters(ctx.comp, ctx.query, base) +
      (hiddenUnresolved ? '<div class="wf-note warn">' + hiddenUnresolved + ' unresolved files are hidden by this filter. <a href="#' + inboxPath(ctx.comp, 'unresolved') + '">Work through them in the inbox</a></div>' : '') +
      '<div class="muted small">' + rows.length + ' files</div>' + W.filesTable(rows.slice(0, 200)) + (rows.length > 200 ? '<p class="muted small">First 200 shown</p>' : '') +
      '<details><summary>Upload a file as scorer</summary><div class="wf-box" style="margin-top:8px">' + W.scorerUploadForm(ctx.comp) + '</div></details></div>');
  };
  P['/c/:comp/browse/files/:file'] = (ctx) => (ctx.file ? page(ctx, e(ctx.file.name), fileDetail(ctx.file), '', browseCrumb(ctx, 'files', 'IGC files')) : page(ctx, 'Not found', '<div class="wf-empty">No such file</div>'));
  P['/c/:comp/browse/members'] = (ctx) => page(ctx, 'Members and invitations', W.members(ctx.comp));
  P['/c/:comp/browse/archive'] = (ctx) => page(ctx, ctx.comp.lifecycle === 'archived' ? 'Delete' : 'Archive or delete', W.lifecycle(ctx.comp));

  // ---------- handlers ----------

  const handlers = {
    cJump(d, ds) {
      const comp = Q.competition(ds.comp);
      const q = (d.q || '').trim().toLowerCase();
      if (!q) return;
      const all = jumpTargets(comp);
      const hit = all.find((t) => t.label.toLowerCase() === q) || all.find((t) => t.label.toLowerCase().startsWith(q)) || all.find((t) => t.label.toLowerCase().includes(q));
      if (!hit) throw new KH.Denied('Nothing matches "' + d.q + '"');
      KH.go(hit.href);
    },
  };

  KH.mount({
    id: 'c',
    routes,
    links,
    handlers,
    render(ctx) {
      if (ctx.params.comp) {
        const g = guard(ctx);
        if (g) return g;
      }
      return P[ctx.route.path](ctx);
    },
    notFound: (ctx) => page(ctx, 'Not found', '<div class="wf-empty">No page at ' + e(ctx.path) + '</div>'),
    // Reviewing in the inbox moves on to the next item of the folder, even when the reviewed one stays in it.
    afterReview(r) {
      const ctx = KH.current();
      if (!ctx.route || ctx.route.path !== '/c/:comp/inbox/:folder/:item' || ctx.params.item !== 'result.' + r.id) return;
      const keys = KH.ui.cQueue.keys;
      const next = keys[keys.indexOf(ctx.params.item) + 1];
      if (next) KH.go(inboxPath(ctx.comp, ctx.params.folder, next, ctx.query));
    },
    onKey(ev) {
      if (ev.key === '/') {
        const input = document.querySelector('.c-jump input');
        if (input) {
          ev.preventDefault();
          input.focus();
        }
        return;
      }
      const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[ev.key];
      if (step && moveSelection(step)) ev.preventDefault();
    },
  });
})();
