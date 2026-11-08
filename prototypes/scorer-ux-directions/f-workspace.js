// PROTOTYPE: Direction F, "Workspace". An object browser, tabbed documents and a context inspector, like an IDE.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const S = KH.state;
  const H = KH.handlers;
  const e = KH.esc;

  // A document is identified by a token relative to its scope: the competition's workspace or the account.
  // The active document is the route path. All open documents are listed in the `tabs` query parameter.
  const WS = (comp) => '/c/' + comp.slug + '/w';
  const compOfClass = (cls) => Q.competition(cls.competitionId);
  const dayTok = (cls, date) => 'day/' + cls.slug + '/' + date;
  const resultTok = (r) => {
    const cd = Q.classDay(r.classDayId);
    return 'result/' + Q.class(cd.classId).slug + '/' + cd.date + '/' + Q.competitor(r.competitorId).cid;
  };
  const fileComp = (f) => Q.competition(Q.logger(f.loggerId).competitionId);

  const links = {
    competition: WS,
    cls: (cls) => WS(compOfClass(cls)) + '/class/' + cls.slug,
    classDay: (cd) => WS(compOfClass(Q.class(cd.classId))) + '/' + dayTok(Q.class(cd.classId), cd.date),
    classDayDate: (cls, date) => WS(compOfClass(cls)) + '/' + dayTok(cls, date),
    classDayTasks: (cd) => links.classDay(cd) + '/tasks',
    candidate: (t) => WS(compOfClass(Q.class(Q.classDay(t.classDayId).classId))) + '/task/' + t.id,
    result: (r) => WS(compOfClass(Q.class(Q.classDay(r.classDayId).classId))) + '/' + resultTok(r),
    file: (f) => WS(fileComp(f)) + '/file/' + f.id,
    competitor: (c) => WS(Q.competition(c.competitionId)) + '/competitor/' + c.id,
    competitors: (comp) => WS(comp) + '/setup/competitors',
    logger: (l) => WS(Q.competition(l.competitionId)) + '/logger/' + l.id,
    files: (comp) => WS(comp) + '/setup/files',
  };

  const EX = '/c/oberrhein-2026/w';
  const T = '?tabs=day/club/2026-07-28,day/18m/2026-07-28,setup/files';
  const SETUP = {
    details: 'Details and password', dates: 'Dates and class days', turnpoints: 'Turnpoints', airspace: 'Airspace',
    classes: 'Classes', 'new-class': 'Add class', competitors: 'Competitors', 'new-competitor': 'Add competitor',
    loggers: 'Loggers', 'new-logger': 'Add logger', files: 'IGC files', members: 'Members and invitations', lifecycle: 'Archive or delete',
  };
  const TOP = { new: 'Create competition', account: 'Account and invitations', 'staff-users': 'Users (staff)', 'staff-competitions': 'All competitions (staff)' };
  const SECTIONS = { results: 'Results', tasks: 'Tasks', settings: 'Start, limits, airspace', publish: 'Publish' };

  const routes = [
    { path: '/', title: 'My competitions', group: 'Account', example: '/' },
    { path: '/doc/:top', title: 'Account document: ' + Object.keys(TOP).join(', '), group: 'Account', example: '/doc/account?tabs=home,doc/account,doc/new' },
    { path: '/c/:comp', title: 'Competition (opens its workspace)', group: 'Workspace', example: '/c/albtrauf-2027' },
    { path: '/c/:comp/w', title: 'Workspace overview', group: 'Workspace', example: EX },
    { path: '/c/:comp/w/setup/:item', title: 'Setup document: ' + Object.keys(SETUP).join(', '), group: 'Workspace', example: EX + '/setup/files' + T },
    { path: '/c/:comp/w/class/:class', title: 'Class settings', group: 'Documents', example: EX + '/class/std' },
    { path: '/c/:comp/w/day/:class/:date', title: 'Class day, results section', group: 'Documents', example: EX + '/day/club/2026-07-28' + T },
    { path: '/c/:comp/w/day/:class/:date/:sec', title: 'Class day section: tasks, settings, publish', group: 'Documents', example: EX + '/day/18m/2026-07-28/publish' + T },
    { path: '/c/:comp/w/task/:cand', title: 'Task candidate', group: 'Documents', example: null },
    { path: '/c/:comp/w/result/:class/:date/:cid', title: 'Result review', group: 'Documents', example: null },
    { path: '/c/:comp/w/file/:file', title: 'IGC file', group: 'Documents', example: null },
    { path: '/c/:comp/w/competitor/:competitor', title: 'Competitor', group: 'Documents', example: EX + '/competitor/p1' },
    { path: '/c/:comp/w/logger/:logger', title: 'Logger and links', group: 'Documents', example: EX + '/logger/lx1' },
  ];

  // ---------- tabs ----------

  KH.ui.fTabs = KH.ui.fTabs || {};
  KH.ui.fOpen = KH.ui.fOpen || {};

  function scopeOf(ctx) {
    return ctx.comp ? ctx.comp.slug : '_';
  }
  function tokenOf(ctx) {
    if (ctx.comp) return ctx.path.replace(/^\/c\/[^/]+(\/w)?\/?/, '') || 'home';
    return ctx.path.replace(/^\//, '') || 'home';
  }
  function pathOf(scope, tok) {
    const base = scope === '_' ? '' : '/c/' + scope + '/w';
    return tok === 'home' ? base || '/' : base + '/' + tok;
  }
  // Switching a class day section keeps the same document, so it replaces the tab.
  const docId = (tok) => (tok.startsWith('day/') ? tok.split('/').slice(0, 3).join('/') : tok);

  function tabsFor(ctx) {
    const scope = scopeOf(ctx);
    const cur = tokenOf(ctx);
    let tabs = ctx.query.tabs ? ctx.query.tabs.split(',').filter(Boolean) : (KH.ui.fTabs[scope] || []).slice();
    const i = tabs.findIndex((t) => docId(t) === docId(cur));
    if (i >= 0) tabs[i] = cur;
    else tabs.push(cur);
    while (tabs.length > 10) tabs.splice(tabs.findIndex((t) => t !== cur), 1);
    KH.ui.fTabs[scope] = tabs;
    return tabs;
  }
  function hrefWith(scope, tok, tabs, extraQuery) {
    return '#' + pathOf(scope, tok) + '?' + (extraQuery ? extraQuery + '&' : '') + 'tabs=' + tabs.join(',');
  }
  function syncUrl(ctx, tabs) {
    const scope = scopeOf(ctx);
    const rest = Object.keys(ctx.query).filter((k) => k !== 'tabs').map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(ctx.query[k])).join('&');
    const want = hrefWith(scope, tokenOf(ctx), tabs, rest);
    if (location.hash !== want && typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', want);
  }

  function tabLabel(comp, tok) {
    const p = tok.split('/');
    if (tok === 'home') return comp ? 'Overview' : 'My competitions';
    if (!comp) return TOP[p[1]] || tok;
    const cls = p[1] && ['class', 'day', 'result'].includes(p[0]) ? Q.classBySlug(comp.id, p[1]) : null;
    switch (p[0]) {
      case 'setup': return SETUP[p[1]] || tok;
      case 'class': return cls ? cls.name + ' settings' : 'Not found';
      case 'day': return cls ? cls.name + ' · ' + Q.dayLabel(cls.id, p[2]) + (p[3] ? ' · ' + (SECTIONS[p[3]] || p[3]) : '') : 'Not found';
      case 'result': return cls ? p[3] + ' · ' + cls.name + ' ' + Q.dayLabel(cls.id, p[2]) : 'Not found';
      case 'task': {
        const c = Q.candidate(p[1]);
        if (!c) return 'Not found';
        const cd = Q.classDay(c.classDayId);
        return 'Task ' + (c.letter || '(no letter)') + ' · ' + Q.class(cd.classId).name + ' ' + Q.dayLabel(cd.classId, cd.date);
      }
      case 'file': { const f = Q.file(p[1]); return f ? f.name : 'Not found'; }
      case 'competitor': { const c = Q.competitor(p[1]); return c ? c.cid + ' · ' + Q.crewName(c) : 'Not found'; }
      case 'logger': { const l = Q.logger(p[1]); return l ? 'Logger ' + Q.loggerLabel(l) : 'Not found'; }
    }
    return tok;
  }
  const KIND = { home: 'Overview', setup: 'Setup', class: 'Class', day: 'Class day', task: 'Task candidate', result: 'Result', file: 'IGC file', competitor: 'Competitor', logger: 'Logger', doc: 'Account' };

  function tabBar(ctx, tabs) {
    const scope = scopeOf(ctx);
    const cur = tokenOf(ctx);
    return '<div class="f-tabs">' + tabs.map((t) => '<span class="f-tab' + (t === cur ? ' on' : '') + '"><a class="t" href="' + hrefWith(scope, t, tabs) + '" title="' + e(tabLabel(ctx.comp, t)) + '">' + e(tabLabel(ctx.comp, t)) + '</a>' +
      '<button data-act="fClose" data-tok="' + e(t) + '" title="Close">×</button></span>').join('') +
      '<span class="f-tabs-x">' + (tabs.length > 1 ? '<a class="muted" href="#" data-act="fCloseOthers">Close others</a> · ' : '') + '<a class="muted" href="#" data-act="fInsp">' + (KH.ui.fHideInsp ? 'Show' : 'Hide') + ' inspector</a></span></div>';
  }

  H.fClose = (ds) => {
    const ctx = KH.current();
    const scope = scopeOf(ctx);
    const cur = tokenOf(ctx);
    const tabs = (KH.ui.fTabs[scope] || []).slice();
    const i = tabs.indexOf(ds.tok);
    if (i < 0) return;
    tabs.splice(i, 1);
    if (!tabs.length) tabs.push('home');
    KH.ui.fTabs[scope] = tabs;
    const next = ds.tok === cur ? tabs[Math.max(0, i - 1)] : cur;
    location.hash = hrefWith(scope, next, tabs);
  };
  H.fInsp = () => {
    KH.ui.fHideInsp = !KH.ui.fHideInsp;
  };
  H.fCloseOthers = () => {
    const ctx = KH.current();
    const scope = scopeOf(ctx);
    KH.ui.fTabs[scope] = [tokenOf(ctx)];
    location.hash = hrefWith(scope, tokenOf(ctx), [tokenOf(ctx)]);
  };
  // Opens a document in place of the active tab, for stepping through results.
  function replaceHref(ctx, tok) {
    const scope = scopeOf(ctx);
    const tabs = (KH.ui.fTabs[scope] || []).filter((t) => t !== tok).map((t) => (t === tokenOf(ctx) ? tok : t));
    return hrefWith(scope, tok, tabs);
  }

  // ---------- jump to ----------

  function jumpIndex(comp) {
    const out = [];
    if (!comp) {
      for (const c of Q.myCompetitions()) out.push([c.name, WS(c)]);
      for (const k of Object.keys(TOP)) out.push([TOP[k], '/doc/' + k]);
      return out;
    }
    out.push(['Overview', WS(comp)]);
    for (const k of Object.keys(SETUP)) out.push([SETUP[k], WS(comp) + '/setup/' + k]);
    for (const cls of Q.classesOf(comp.id)) {
      out.push([cls.name + ' class settings', links.cls(cls)]);
      for (const d of comp.dates) out.push([cls.name + ' · ' + Q.dayLabel(cls.id, d) + ' · ' + W.date(d) + ' · ' + d, links.classDayDate(cls, d)]);
    }
    for (const c of Q.competitorsOf(comp.id)) out.push([c.cid + ' · ' + Q.crewName(c) + ' · ' + Q.class(c.classId).name, links.competitor(c)]);
    for (const l of Q.loggersOf(comp.id)) out.push(['Logger ' + Q.loggerLabel(l), links.logger(l)]);
    return out;
  }
  H.fJump = (d) => {
    const ctx = KH.current();
    const q = (d.q || '').trim();
    if (!q) return;
    const idx = jumpIndex(ctx.comp);
    const exact = idx.find(([label]) => label === q);
    if (exact) return KH.go(exact[1]);
    const words = q.toLowerCase().split(/\s+/);
    const hit = (s) => words.every((w) => s.toLowerCase().includes(w));
    let found = idx.filter(([label]) => hit(label));
    if (ctx.comp) found = found.concat(Q.filesOf(ctx.comp.id).filter((f) => hit(f.name)).map((f) => ['IGC file ' + f.name, links.file(f)]));
    if (found.length === 1) return KH.go(found[0][1]);
    if (!found.length) return KH.toast('Nothing matches “' + q + '”', 'error');
    KH.modal({ title: found.length + ' matches for “' + q + '”', body: '<div class="f-jumplist">' + found.slice(0, 40).map(([label, path]) => '<a href="#' + path + '">' + e(label) + '</a>').join('') + '</div>' + (found.length > 40 ? '<p class="muted small">First 40 shown. Type more to narrow.</p>' : '') });
  };

  // ---------- shell ----------

  function header(ctx) {
    const me = Q.me();
    const comps = Q.myCompetitions();
    const opts = jumpIndex(ctx.comp).map(([label]) => '<option value="' + e(label) + '">').join('');
    return '<header class="f-head"><a class="f-brand" href="#/">Keyhole</a>' +
      '<select onchange="location.hash=this.value"><option value="#/"' + (ctx.comp ? '' : ' selected') + '>No competition</option>' + comps.map((c) => '<option value="#' + WS(c) + '"' + (c === ctx.comp ? ' selected' : '') + '>' + e(c.name) + '</option>').join('') + '</select>' +
      '<form class="f-jump" data-submit="fJump" autocomplete="off"><input name="q" id="f-jump" list="f-jumpopts" placeholder="Jump to… class, day, CID, pilot, logger, file name  ( / )"><datalist id="f-jumpopts">' + opts + '</datalist></form>' +
      '<span class="grow"></span>' + (me.staff ? '<a href="#/doc/staff-users">Staff</a>' : '') + '<a href="#/doc/account">' + e(me.name) + '</a><span class="muted small">' + (ctx.comp ? e(Q.roleIn(ctx.comp) || 'no role') : me.staff ? 'staff' : '') + '</span>' +
      '<a href="#/" onclick="KH.toast(\'Prototype: would sign out\');return false" class="muted">Sign out</a></header>';
  }

  const dot = (cd) => '<span class="f-dot ' + (cd ? cd.status.replace(' ', '-') : 'none') + '" title="' + (cd ? cd.status : 'untouched') + '"></span>';

  function group(id, label, count, inner, ctxOpen, defOpen) {
    const open = KH.ui.fOpen[id] ?? (ctxOpen || defOpen);
    return '<details data-g="' + e(id) + '"' + (open || ctxOpen ? ' open' : '') + ' ontoggle="KH.ui.fOpen[this.dataset.g]=this.open"><summary><span>' + label + '</span>' + (count !== '' && count != null ? '<span>' + count + '</span>' : '') + '</summary>' + inner + '</details>';
  }

  function browser(ctx, tabs) {
    const scope = scopeOf(ctx);
    const cur = tokenOf(ctx);
    const open = new Set(tabs.map(docId));
    const item = (tok, label, x, depth) =>
      '<a class="f-item' + (depth ? ' d' + depth : '') + (docId(tok) === docId(cur) ? ' cur' : open.has(docId(tok)) ? ' open' : '') + '" href="#' + pathOf(scope, tok) + '" data-k="' + e(String(label).replace(/<[^>]*>/g, '')) + '"><span>' + label + '</span>' + (x ? '<span class="x">' + x + '</span>' : '') + '</a>';
    const filter = '<div class="f-filter"><input placeholder="Filter" oninput="KH.ui.fFilter(this.value)" value="' + e(KH.ui.fFilterText || '') + '"></div>';
    const comp = ctx.comp;
    if (!comp) {
      const me = Q.me();
      return '<nav class="f-pane f-browser">' + filter + group('top', 'Account', '', item('home', 'My competitions') + item('doc/new', 'Create competition') + item('doc/account', 'Account and invitations'), false, true) +
        group('topcomps', 'Competitions', Q.myCompetitions().length, Q.myCompetitions().map((c) => '<a class="f-item" href="#' + WS(c) + '">' + e(c.name) + '</a>').join(''), false, true) +
        (me.staff ? group('staff', 'Staff', '', item('doc/staff-users', 'Users') + item('doc/staff-competitions', 'All competitions'), false, true) : '') + '</nav>';
    }
    let html = '<nav class="f-pane f-browser">' + filter + '<div class="f-comp">' + e(comp.name) + '</div>';
    if (comp.lifecycle === 'archived') {
      return html + group('comp', 'Competition', '', item('home', 'Overview') + item('setup/members', 'Members') + item('setup/lifecycle', 'Delete'), false, true) + '</nav>';
    }
    const classes = Q.classesOf(comp.id);
    const unresolved = Q.unresolvedFiles(comp.id);
    html += group('comp', 'Competition', '', item('home', 'Overview') + ['details', 'dates', 'turnpoints', 'airspace', 'members', 'lifecycle'].map((k) =>
      item('setup/' + k, SETUP[k], k === 'turnpoints' ? (comp.turnpointFile ? '' : 'missing') : k === 'airspace' ? (comp.airspaceFile ? '' : 'missing') : '')).join(''), cur.startsWith('setup/') && !/competitors|loggers|files|class/.test(cur), true);
    const curCls = ctx.cls || (ctx.cand ? Q.class(Q.classDay(ctx.cand.classDayId).classId) : null);
    html += group('classes', 'Classes and class days', classes.length,
      classes.map((cls) => group('cls:' + cls.id, e(cls.name), '', item('class/' + cls.slug, 'Class settings', '', 2) + comp.dates.map((d) => {
        const cd = Q.classDayOn(cls.id, d);
        const counts = cd && !['unplanned', 'cancelled'].includes(cd.status) ? Q.dayCounts(cd) : null;
        return item(dayTok(cls, d), e(Q.dayLabel(cls.id, d)) + ' <span class="muted">' + W.date(d) + '</span>', (counts && counts.check ? counts.check + ' check ' : '') + (counts && counts.stale ? counts.stale + ' stale ' : '') + dot(cd), 2);
      }).join(''), curCls === cls, true)).join('') + item('setup/classes', 'All classes') + item('setup/new-class', '+ Add class'), !!curCls, true);
    const comps = Q.competitorsOf(comp.id);
    const curComp = ctx.params.competitor ? ctx.competitor : null;
    html += group('competitors', 'Competitors', comps.length, item('setup/competitors', 'All competitors') + item('setup/new-competitor', '+ Add competitor') +
      classes.map((cls) => group('comp:' + cls.id, e(cls.name), Q.competitorsOf(comp.id, cls.id).length, Q.competitorsOf(comp.id, cls.id).map((c) => item('competitor/' + c.id, '<b>' + e(c.cid) + '</b> ' + e(Q.crewName(c)), '', 2)).join(''), curComp && curComp.classId === cls.id, false)).join(''), !!curComp, false);
    const loggers = Q.loggersOf(comp.id);
    html += group('loggers', 'Loggers', loggers.length, item('setup/loggers', 'All loggers') + item('setup/new-logger', '+ Add logger') + loggers.map((l) => item('logger/' + l.id, e(Q.loggerLabel(l)), l.links.length ? '' : 'no link', 1)).join(''), !!ctx.logger, false);
    const stale = Q.filesOf(comp.id).filter((f) => f.analysis.stale.length);
    html += group('files', 'IGC files', unresolved.length ? unresolved.length + ' unresolved' : '', item('setup/files', 'All IGC files', Q.filesOf(comp.id).length) +
      group('files:unresolved', 'Unresolved', unresolved.length, unresolved.map((f) => item('file/' + f.id, e(f.name), '', 2)).join(''), false, true) +
      group('files:stale', 'Stale analyses', stale.length, stale.map((f) => { const r = Q.resolve(f); return item('file/' + f.id, (r.ok ? '<b>' + e(r.competitor.cid) + '</b> ' : '') + e(f.name), '', 2); }).join(''), false, false), !!ctx.file || cur === 'setup/files', true);
    return html + '</nav>';
  }
  KH.ui.fFilter = (text) => {
    KH.ui.fFilterText = text;
    const t = text.trim().toLowerCase();
    for (const a of document.querySelectorAll('.f-browser .f-item')) a.classList.toggle('f-hidden', !!t && !a.dataset.k.toLowerCase().includes(t));
    if (t) for (const d of document.querySelectorAll('.f-browser details')) d.open = !!d.querySelector('.f-item:not(.f-hidden)');
  };

  function shell(ctx, doc) {
    const tabs = tabsFor(ctx);
    syncUrl(ctx, tabs);
    const kind = KIND[tokenOf(ctx).split('/')[0]] || '';
    if (KH.ui.fHideInsp) doc = { ...doc, insp: '' };
    return header(ctx) + '<div class="f-body' + (doc.insp ? '' : ' noinsp') + '">' + browser(ctx, tabs) +
      '<section class="f-center">' + tabBar(ctx, tabs) + '<div class="f-doc">' +
      (ctx.comp && ctx.comp.blocked ? '<div class="wf-note warn">Blocked by staff ' + W.dt(ctx.comp.blocked.at) + ': ' + e(ctx.comp.blocked.note) + '. Only staff can see this competition.</div>' : '') +
      '<div class="f-doc-head"><div><div class="f-kind">' + kind + '</div><h1>' + doc.title + '</h1></div><div class="wf-row">' + (doc.actions || '') + '</div></div>' + doc.body + '</div></section>' +
      (doc.insp ? '<aside class="f-pane f-insp"><div class="f-insp-head"><span>Inspector · ' + e(doc.inspTitle || kind) + '</span></div><div class="f-insp-body">' + doc.insp + '</div></aside>' : '') + '</div>';
  }
  const box = (title, body) => '<div class="wf-box">' + (title ? '<h3>' + title + '</h3>' : '') + body + '</div>';

  // ---------- account documents ----------

  const D = {};
  function home() {
    const comps = Q.myCompetitions();
    return {
      title: 'My competitions',
      actions: '<a class="wf-btn primary" href="#/doc/new">Create competition</a>',
      body: '<div class="wf-stack">' + W.incomingInvitations() + '<table class="wf-table"><thead><tr><th>Competition</th><th>Dates</th><th>Your role</th><th>State</th></tr></thead><tbody>' +
        comps.map((c) => '<tr class="link" data-href="' + WS(c) + '"><td><b>' + e(c.name) + '</b><div class="muted small">' + e(c.location) + ' · ' + e(c.organiser) + '</div></td><td>' + W.date(c.dates[0], true) + ' – ' + W.date(c.dates[c.dates.length - 1], true) + '</td><td>' + e(Q.roleIn(c)) + '</td><td>' + (c.blocked ? '<span class="wf-badge solid">blocked</span> ' : '') + (c.lifecycle === 'archived' ? 'archived' : c.dates[0] > KH.TODAY ? 'upcoming' : c.dates[c.dates.length - 1] < KH.TODAY ? 'finished' : 'running') + '</td></tr>').join('') +
        '</tbody></table></div>',
      insp: box('Working in the workspace', '<p class="small">Open a competition to get its object browser. Every object opens as a tab, and the inspector on the right follows the active tab.</p><p class="small muted">Press <b>/</b> to jump to any class day, competitor, logger or file by name.</p>'),
    };
  }
  const TOPDOCS = {
    new: () => ({ title: 'Create competition', body: '<div class="wf-box" style="max-width:880px">' + W.createCompetitionForm() + '</div>' }),
    account: () => ({ title: 'Account and invitations', body: W.incomingInvitations() + W.account() }),
    'staff-users': () => ({ title: 'Users', body: '<p class="muted">The invitation tree. Each user records who invited them. Nothing acts on a whole branch automatically.</p>' + W.staffUsers(), staff: true }),
    'staff-competitions': () => ({ title: 'All competitions', body: W.staffCompetitions(), staff: true }),
  };
  D['/'] = (ctx) => shell(ctx, home());
  D['/doc/:top'] = (ctx) => {
    const f = TOPDOCS[ctx.params.top];
    if (!f) return shell(ctx, notFoundDoc('No document ' + ctx.params.top));
    const doc = f();
    if (doc.staff && !Q.me().staff) return shell(ctx, { title: 'No access', body: '<div class="wf-empty">Only staff can open this. Switch role in the prototype bar.</div>' });
    return shell(ctx, doc);
  };
  const notFoundDoc = (msg) => ({ title: 'Not found', body: '<div class="wf-empty">' + e(msg) + '</div>' });

  // ---------- competition documents ----------

  function setupInsp(comp) {
    return box('Setup', '<div class="small">' + W.setupState(comp).map((s) => '<div><a href="#' + WS(comp) + '/' + ({ details: 'setup/details', airfield: 'setup/details', classes: 'setup/classes', turnpoints: 'setup/turnpoints', airspace: 'setup/airspace', competitors: 'setup/competitors', loggers: 'setup/loggers', members: 'setup/members' })[s.key] + '">' + (s.done ? '✓ ' : '○ ') + e(s.label) + '</a></div>').join('') + '</div>') +
      box('', W.uploadPassword(comp));
  }

  function overview(ctx) {
    const comp = ctx.comp;
    if (comp.lifecycle === 'archived') {
      return {
        title: e(comp.name),
        body: '<div class="wf-stack"><div class="wf-note">Archived ' + W.dt(comp.archivedAt) + '. The scoring work was removed. Only the published results remain, and they can no longer change.</div>' +
          '<table class="wf-table"><thead><tr><th>Class</th><th>Published days</th><th>Competitors</th><th>Last status</th></tr></thead><tbody>' + comp.archive.classes.map((c) => '<tr><td>' + e(c.name) + '</td><td>' + c.days + '</td><td>' + c.competitors + '</td><td>' + W.dayBadge(c.lastStatus) + '</td></tr>').join('') + '</tbody></table>' +
          '<p><a href="#" onclick="KH.toast(\'Public pages are out of scope for this prototype\');return false">Open public results ↗</a></p></div>',
      };
    }
    const classes = Q.classesOf(comp.id);
    const todayRows = classes.map((cls) => {
      const cd = Q.classDayOn(cls.id, KH.TODAY);
      if (!cd) return '';
      const c = Q.dayCounts(cd);
      return '<tr class="link" data-href="' + links.classDay(cd) + '"><td><b>' + e(cls.name) + '</b> ' + e(Q.dayLabel(cls.id, cd.date)) + '</td><td>' + W.dayBadge(cd.status) + '</td><td>' + (Q.task(cd) ? 'Task ' + e(Q.task(cd).letter) : '—') + '</td><td class="num">' + c.check + '</td><td class="num">' + c.unknown + '</td><td class="num">' + c.stale + '</td><td>' + W.unpublished(cd) + '</td></tr>';
    }).join('');
    const attention = [];
    for (const cls of classes) for (const cd of Q.classDaysOf(cls.id)) {
      if (Q.deadlinePassed(cd)) attention.push('<a href="#' + links.classDay(cd) + '/publish">' + e(W.dayTitle(cd, cls)) + '</a>: complaint deadline passed, ready for final');
      else if (cd.reasons.length && cd.date !== KH.TODAY) attention.push('<a href="#' + links.classDay(cd) + '/publish">' + e(W.dayTitle(cd, cls)) + '</a>: unpublished ' + e(cd.reasons.join(', ').toLowerCase()));
    }
    const unresolved = Q.unresolvedFiles(comp.id).length;
    if (unresolved) attention.push('<a href="#' + WS(comp) + '/setup/files?state=unresolved">' + unresolved + ' unresolved IGC files</a>');
    const missing = W.setupState(comp).filter((s) => !s.done);
    return {
      title: e(comp.name),
      body: '<div class="wf-stack">' +
        (missing.length && comp.createdAt > '2026-07-28' ? '<div class="wf-note">Created ' + W.dt(comp.createdAt) + '. Work through the setup list in the inspector. Each item opens as a tab, so you can keep several open while you enter data.</div>' : '') +
        (todayRows ? '<div><h2>Today, ' + W.date(KH.TODAY, true) + '</h2><table class="wf-table"><thead><tr><th>Class day</th><th>Status</th><th>Task</th><th class="num">In check</th><th class="num">Unknown</th><th class="num">Stale files</th><th></th></tr></thead><tbody>' + todayRows + '</tbody></table></div>' : '') +
        (attention.length ? '<div class="wf-box fill"><h3>Needs attention</h3><ul style="margin:0;padding-left:18px">' + attention.map((a) => '<li>' + a + '</li>').join('') + '</ul></div>' : '') +
        '<div><h2>Class days</h2>' + W.classDayGrid(comp) + '</div></div>',
      insp: setupInsp(comp),
      inspTitle: 'Competition',
    };
  }

  const SETUPDOCS = {
    details: (comp) => ({ body: '<div class="wf-box">' + W.competitionDetails(comp) + '</div>', insp: box('', W.uploadPassword(comp)) + '<div class="wf-box fill small"><b>Organiser terms</b><br>' + e(comp.terms.version) + ' accepted by ' + e(Q.user(comp.terms.userId).name) + ' on ' + W.dt(comp.terms.at) + ' for ' + e(comp.terms.organiser) + '</div>' }),
    dates: (comp) => ({ body: '<div class="wf-stack"><div class="wf-box"><h3>Competition dates</h3>' + W.datesEditor(comp) + '</div><div><h3>Class day grid</h3><p class="muted small">A class day exists once someone touches its cell. Untouched past dates show as unplanned in public.</p>' + W.classDayGrid(comp) + '</div></div>' }),
    turnpoints: (comp) => ({ body: W.turnpoints(comp) }),
    airspace: (comp) => ({ body: W.airspace(comp) }),
    classes: (comp) => {
      const classes = Q.classesOf(comp.id, true);
      return {
        actions: '<a class="wf-btn primary" href="#' + WS(comp) + '/setup/new-class">Add class</a>',
        body: '<table class="wf-table"><thead><tr><th>Class</th><th>Rule set edition</th><th>Handicapped</th><th class="num">Competitors</th><th class="num">Class days</th><th></th></tr></thead><tbody>' +
          (classes.length ? classes.map((c) => '<tr class="link' + (c.deleted ? ' dim' : '') + '" data-href="' + links.cls(c) + '"><td><b>' + e(c.name) + '</b>' + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : '') + '</td><td>' + e(c.edition) + '</td><td>' + (c.handicapScale ? 'scale ' + c.handicapScale + ', ' + e(c.handicapList) : 'no') + '</td><td class="num">' + Q.competitorsOf(comp.id, c.id).length + '</td><td class="num">' + Q.classDaysOf(c.id).length + '</td><td class="right">' + (c.deleted ? '<button class="wf-btn small" data-act="restoreClass" data-cls="' + c.id + '">Restore</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="6" class="muted">No classes yet</td></tr>') +
          '</tbody></table>',
      };
    },
    'new-class': (comp) => ({ body: '<div class="wf-box">' + W.classForm(comp) + '</div>' }),
    competitors: (comp, ctx) => {
      const cls = ctx.query.class ? Q.classBySlug(comp.id, ctx.query.class) : null;
      const base = WS(comp) + '/setup/competitors';
      return {
        actions: '<a class="wf-btn primary" href="#' + WS(comp) + '/setup/new-competitor' + (cls ? '?class=' + cls.slug : '') + '">Add competitor</a>',
        body: '<div class="wf-stack"><div class="wf-row"><a class="wf-btn small' + (!cls ? ' primary' : '') + '" href="#' + base + '">All</a>' + Q.classesOf(comp.id).map((c) => '<a class="wf-btn small' + (cls === c ? ' primary' : '') + '" href="#' + base + '?class=' + c.slug + '">' + e(c.name) + ' ' + Q.competitorsOf(comp.id, c.id).length + '</a>').join('') + '</div>' + W.competitorsTable(comp, cls && cls.id) + '</div>',
      };
    },
    'new-competitor': (comp, ctx) => {
      const cls = ctx.query.class ? Q.classBySlug(comp.id, ctx.query.class) : null;
      return { body: '<div class="wf-box">' + W.competitorForm(comp, null, cls && cls.id) + '</div>' };
    },
    loggers: (comp) => ({ actions: '<a class="wf-btn primary" href="#' + WS(comp) + '/setup/new-logger">Add logger</a>', body: W.loggersTable(comp) }),
    'new-logger': (comp) => ({ body: '<div class="wf-box">' + W.loggerForm(comp) + '</div>' }),
    files: (comp, ctx) => {
      const base = WS(comp) + '/setup/files';
      const { rows, hiddenUnresolved } = W.filterFiles(comp, ctx.query);
      return {
        body: '<div class="wf-stack">' + W.fileFilters(comp, ctx.query, base) +
          (hiddenUnresolved ? '<div class="wf-note warn">' + hiddenUnresolved + ' unresolved files are hidden by this filter. <a href="#' + base + '?state=unresolved">Show unresolved</a></div>' : '') +
          '<div class="muted small">' + rows.length + ' files. Click a row to open the file in a new tab.</div>' + W.filesTable(rows.slice(0, 200)) + (rows.length > 200 ? '<p class="muted small">First 200 shown</p>' : '') + '</div>',
        insp: box('Upload a file as scorer', W.scorerUploadForm(comp)),
        inspTitle: 'IGC files',
      };
    },
    members: (comp) => ({ body: W.members(comp) }),
    lifecycle: (comp) => ({ title: comp.lifecycle === 'archived' ? 'Delete' : 'Archive or delete', body: W.lifecycle(comp) }),
  };
  D['/c/:comp/w/setup/:item'] = (ctx) => {
    const f = SETUPDOCS[ctx.params.item];
    if (!f) return shell(ctx, notFoundDoc('No setup document ' + ctx.params.item));
    const doc = f(ctx.comp, ctx);
    return shell(ctx, { title: SETUP[ctx.params.item], insp: setupInsp(ctx.comp), inspTitle: 'Competition setup', ...doc });
  };
  D['/c/:comp'] = (ctx) => shell(ctx, overview(ctx));
  D['/c/:comp/w'] = D['/c/:comp'];

  D['/c/:comp/w/class/:class'] = (ctx) => {
    const cls = ctx.cls;
    if (!cls) return shell(ctx, notFoundDoc('No such class'));
    const rows = ctx.comp.dates.map((d) => {
      const cd = Q.classDayOn(cls.id, d);
      return '<tr class="link' + (cd ? '' : ' dim') + '" data-href="' + links.classDayDate(cls, d) + '"><td>' + dot(cd) + ' ' + e(Q.dayLabel(cls.id, d)) + '</td><td>' + W.date(d) + '</td><td>' + (cd ? W.dayBadge(cd.status) : 'untouched') + '</td></tr>';
    }).join('');
    return shell(ctx, {
      title: e(cls.name) + ' settings',
      body: '<div class="wf-box">' + W.classForm(ctx.comp, cls) + '</div>',
      insp: box('Class days', '<table class="wf-table"><tbody>' + rows + '</tbody></table>') +
        box('Competitors', '<p class="small">' + Q.competitorsOf(ctx.comp.id, cls.id).length + ' in this class. <a href="#' + WS(ctx.comp) + '/setup/competitors?class=' + cls.slug + '">Open list</a></p>') +
        box('Overall results', '<button class="wf-btn small" data-act="printOverall" data-cls="' + cls.id + '">Print preview of overall results</button>'),
      inspTitle: cls.name,
    });
  };

  // ---------- class day ----------

  function dayInsp(cd) {
    const task = Q.task(cd);
    const c = Q.dayCounts(cd);
    const pub = cd.published;
    return box('Task', task ? W.taskMap(task.points, { h: 180 }) + '<div class="small" style="margin-top:6px"><a href="#' + links.candidate(task) + '"><b>Task ' + e(task.letter) + '</b></a> ' + e(Q.taskLine(task)) + ', ' + W.km(Q.taskDistance(task)) + '</div><div class="wf-row" style="margin-top:6px"><button class="wf-btn small" data-act="printSheet" data-cand="' + task.id + '">Task sheet</button><a class="wf-btn small" href="#' + links.classDayTasks(cd) + '">All candidates</a></div>' : '<p class="muted small">No task published. <a href="#' + links.classDayTasks(cd) + '">Enter or import a task</a></p>') +
      box('Results', '<div class="wf-kv"><span>OK</span><span>' + c.ok + '</span><span>In check</span><span>' + c.check + '</span><span>Unknown</span><span>' + c.unknown + '</span><span>Stale files</span><span>' + c.stale + '</span></div>') +
      box('Published copy', (pub ? W.dayBadge(pub.status) + ' ' + W.dt(pub.at) + (cd.publishedTask ? '<div class="small">Task ' + e(cd.publishedTask.letter) + ': ' + e(cd.publishedTask.line) + '</div>' : '') : '<span class="muted">never published</span>') +
        '<div class="small" style="margin-top:6px">' + (cd.reasons.length ? 'Unpublished: ' + e(cd.reasons.join(', ')) + ' · <a href="#' + links.classDay(cd) + '/publish">Publish</a>' : 'No unpublished changes') + '</div>');
  }

  function dayDoc(ctx, sec) {
    const cls = ctx.cls;
    if (!cls) return shell(ctx, notFoundDoc('No such class'));
    const date = ctx.params.date;
    if (!ctx.comp.dates.includes(date)) return shell(ctx, notFoundDoc(W.date(date, true) + ' is not a competition date.'));
    const cd = ctx.cd;
    const label = e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, date)) + ' <span class="muted" style="font-weight:400">' + W.date(date, true) + '</span>';
    if (!cd) return shell(ctx, { title: label, body: W.untouchedDay(cls, date) });
    if (!SECTIONS[sec]) return shell(ctx, notFoundDoc('No section ' + sec));
    const c = Q.dayCounts(cd);
    const task = Q.task(cd);
    const t = (k, lbl, x) => '<a class="' + (sec === k ? 'on' : '') + '" href="#' + links.classDay(cd) + (k === 'results' ? '' : '/' + k) + '">' + lbl + (x ? ' <span class="wf-badge">' + x + '</span>' : '') + '</a>';
    const sub = '<div class="f-sub">' + t('results', 'Results', c.check ? c.check + ' check' : '') + t('tasks', 'Tasks', task ? task.letter : '') + t('settings', 'Start, limits, airspace') + t('publish', 'Publish', cd.reasons.length ? 'changes' : '') + '</div>';
    let body = '';
    if (sec === 'results') {
      const f = ctx.query.show || '';
      const flt = (k, lbl) => '<a class="wf-btn small' + (f === k ? ' primary' : '') + '" href="#' + KH.withQuery({ show: k }) + '">' + lbl + '</a>';
      const stale = Q.staleFilesOf(cd);
      body = '<div class="wf-stack">' +
        (stale.length ? '<details class="wf-box"' + (stale.length <= 6 ? ' open' : '') + '><summary><b>Stale analyses (' + stale.length + ')</b> <span class="muted small">rerun one at a time</span></summary><table class="wf-table"><tbody>' + stale.map((fl) => { const r = Q.resolve(fl); return '<tr><td><a href="#' + links.file(fl) + '">' + e(fl.name) + '</a></td><td>' + e(r.competitor.cid) + '</td><td>' + W.staleBadge(fl) + '</td><td class="right"><button class="wf-btn small" data-act="rerun" data-file="' + fl.id + '">Rerun</button></td></tr>'; }).join('') + '</tbody></table></details>' : '') +
        '<div class="wf-row">' + flt('', 'All ' + c.results) + flt('check', 'In check ' + c.check) + flt('unknown', 'Unknown ' + c.unknown) + flt('stale', 'Stale ' + c.stale) + '<span class="muted small">Click a row to open the result in a new tab.</span></div>' + W.resultsTable(cd, { filter: f }) + '</div>';
    } else if (sec === 'tasks') body = W.candidateList(cd);
    else if (sec === 'settings') body = '<div class="wf-cols" style="grid-template-columns:3fr 2fr"><div class="wf-box">' + W.dayOverrides(cd) + '</div><div class="wf-box">' + W.dayAirspace(cd) + '</div></div>';
    else body = '<div class="wf-stack"><div class="wf-box"><h3>Publish</h3>' + W.publishPanel(cd) + '</div><div class="wf-box"><h3>Latest published copy</h3>' + W.publishedCopy(cd) + '</div></div>';
    return shell(ctx, {
      title: label + ' ' + W.dayBadge(cd.status),
      actions: '<span class="small muted">Working status</span> ' + W.select('status', KH.DAY_STATUSES, cd.status, 'data-change="setWorkingStatus" data-cd="' + cd.id + '"') + (cd.practice ? ' <span class="wf-badge">practice day</span>' : ''),
      body: sub + body,
      insp: dayInsp(cd),
      inspTitle: cls.name + ' ' + Q.dayLabel(cls.id, date),
    });
  }
  D['/c/:comp/w/day/:class/:date'] = (ctx) => dayDoc(ctx, 'results');
  D['/c/:comp/w/day/:class/:date/:sec'] = (ctx) => dayDoc(ctx, ctx.params.sec);

  D['/c/:comp/w/task/:cand'] = (ctx) => {
    const cand = ctx.cand;
    if (!cand) return shell(ctx, notFoundDoc('No such task candidate'));
    const cd = Q.classDay(cand.classDayId);
    const cls = Q.class(cd.classId);
    return shell(ctx, {
      title: 'Task ' + e(cand.letter || '(no letter yet)') + ' <span class="muted" style="font-weight:400">' + e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, cd.date)) + ' · ' + W.date(cd.date, true) + '</span>',
      actions: '<a class="wf-btn small" href="#' + links.classDay(cd) + '">Open class day</a>',
      body: W.taskEditor(cand),
      insp: box('Candidates of this class day', W.candidateList(cd)),
      inspTitle: cls.name + ' ' + Q.dayLabel(cls.id, cd.date),
    });
  };

  // ---------- result review ----------

  function neighbours(ctx) {
    const rows = KH.score(ctx.cd).rows;
    const check = rows.filter((x) => x.result.checkReasons.length || x.result === ctx.result);
    const i = check.findIndex((x) => x.result === ctx.result);
    return { prev: check[i - 1], next: check[i + 1], pos: i + 1, total: check.length };
  }
  D['/c/:comp/w/result/:class/:date/:cid'] = (ctx) => {
    if (!ctx.cd || !ctx.result) return shell(ctx, notFoundDoc('No such competitor on this class day'));
    const r = ctx.result;
    const comp = ctx.competitor;
    const scored = r.scoredFileId ? Q.file(r.scoredFileId) : null;
    const task = Q.task(ctx.cd);
    const n = neighbours(ctx);
    const nav = (n.prev ? '<a class="wf-btn small" href="' + replaceHref(ctx, resultTok(n.prev.result)) + '">← ' + e(n.prev.competitor.cid) + '</a>' : '') + '<span class="muted small">' + n.pos + ' of ' + n.total + ' in check</span>' + (n.next ? '<a class="wf-btn small" href="' + replaceHref(ctx, resultTok(n.next.result)) + '">' + e(n.next.competitor.cid) + ' →</a>' : '');
    const body = '<div class="wf-stack"><div class="muted small">' + e(comp.gliderType) + (comp.handicap ? ', handicap ' + comp.handicap : '') + (comp.hc ? ', hors concours' : '') + ' · <a href="#' + links.classDay(ctx.cd) + '">' + e(W.dayTitle(ctx.cd, ctx.cls)) + '</a> · <a href="#' + links.competitor(comp) + '">competitor</a></div>' +
      W.checkReasons(r) + W.resultStatusControl(r) +
      '<div class="wf-box"><h3>Files</h3>' + W.resultFiles(r) + '</div>' +
      (r.status === 'manual result' ? '<div class="wf-box"><h3>Manual result</h3>' + W.manualForm(r) + '</div>' : '') +
      (scored ? '<div class="wf-box">' + W.analysisLog(scored) + '</div>' : '') +
      '<div class="wf-cols"><div class="wf-box"><h3>Penalty</h3>' + W.penaltyForm(r) + '</div><div class="wf-box"><h3>Remarks and handicap</h3>' + W.resultRemarks(r) + '</div></div></div>';
    const insp = scored
      ? box('Scored file', '<a href="#' + links.file(scored) + '">' + e(scored.name) + '</a> ' + W.staleBadge(scored) + '<div style="margin-top:8px">' + (task ? W.taskMap(task.points, { track: scored.seed, finished: scored.analysis.output && scored.analysis.output.finished, h: 200 }) : '') + '</div><div style="margin-top:8px">' + W.outputSummary(scored) + '</div>') +
        box('Start candidates', W.startCandidates(scored)) + box('Overrides', W.overrides(scored))
      : box('No scored file', '<p class="small muted">Pick a scored file under Files, or enter a manual result. The map, start candidates and overrides of the scored file show here.</p>');
    return shell(ctx, { title: e(comp.cid) + ' · ' + e(Q.crewName(comp)), actions: nav, body, insp, inspTitle: scored ? 'Scored file' : 'Result' });
  };

  // ---------- files, competitors, loggers ----------

  D['/c/:comp/w/file/:file'] = (ctx) => {
    const f = ctx.file;
    if (!f) return shell(ctx, notFoundDoc('No such file'));
    const res = Q.resolve(f);
    const task = res.ok ? Q.task(res.classDay) : null;
    return shell(ctx, {
      title: e(f.name) + ' ' + W.staleBadge(f),
      body: '<div class="wf-stack"><div class="wf-box">' + W.outputSummary(f) + '</div>' +
        (f.analysis.candidates && f.analysis.candidates.length ? '<div class="wf-box"><h3>Start candidates</h3>' + W.startCandidates(f) + '</div>' : '') +
        '<div class="wf-box">' + W.analysisLog(f) + '</div>' + (res.ok ? '<div class="wf-box"><h3>Overrides</h3>' + W.overrides(f) + '</div>' : '') + '</div>',
      insp: (task ? W.taskMap(task.points, { track: f.seed, finished: f.analysis.output && f.analysis.output.finished, h: 200 }) : '<div class="wf-map" style="height:160px"><span class="tag">Map: track only</span></div>') + box('Metadata and resolution', W.fileMeta(f)),
      inspTitle: 'File',
    });
  };
  D['/c/:comp/w/competitor/:competitor'] = (ctx) => {
    const c = ctx.competitor;
    if (!c) return shell(ctx, notFoundDoc('No such competitor'));
    const loggers = Q.loggersOf(ctx.comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
    const days = Q.classDaysOf(c.classId).filter((cd) => !['unplanned', 'cancelled'].includes(cd.status));
    return shell(ctx, {
      title: e(c.cid) + ' · ' + e(Q.crewName(c)) + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : ''),
      body: '<div class="wf-stack"><div class="wf-box">' + W.competitorForm(ctx.comp, c) + '</div>' +
        '<div class="wf-box"><h3>Results</h3><table class="wf-table"><tbody>' + days.map((cd) => { const r = Q.resultFor(cd.id, c.id); return '<tr class="link" data-href="' + links.result(r) + '"><td>' + e(Q.dayLabel(cd.classId, cd.date)) + '</td><td>' + W.date(cd.date) + '</td><td>' + W.resultStatus(r) + '</td><td>' + W.reviewBadge(r) + '</td><td>' + (r.penalty ? '−' + r.penalty.points : '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>',
      insp: box('Loggers', (loggers.length ? '<table class="wf-table"><tbody>' + loggers.map((l) => '<tr><td><a href="#' + links.logger(l) + '">' + e(Q.loggerLabel(l)) + '</a></td><td>' + l.links.filter((k) => k.competitorId === c.id).map((k) => k.role + (k.from ? ' from ' + W.date(k.from) : '')).join(', ') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted small">No loggers linked</p>') + '<a class="wf-btn small" href="#' + WS(ctx.comp) + '/setup/new-logger">Add logger</a>') +
        box('', W.dsqPanel(c)),
      inspTitle: c.cid,
    });
  };
  D['/c/:comp/w/logger/:logger'] = (ctx) => {
    const l = ctx.logger;
    if (!l) return shell(ctx, notFoundDoc('No such logger'));
    const rows = S.files.filter((f) => f.loggerId === l.id).map((f) => ({ f, res: Q.resolve(f) }));
    const linked = [...new Set(l.links.map((k) => k.competitorId))].map(Q.competitor).filter(Boolean);
    return shell(ctx, {
      title: 'Logger ' + e(Q.loggerLabel(l)),
      body: '<div class="wf-stack"><div class="wf-box"><h3>Dated links</h3>' + W.loggerLinks(l) + '</div><div class="wf-box"><h3>Files</h3>' + W.filesTable(rows) + '</div></div>',
      insp: box('Thresholds', W.loggerForm(ctx.comp, l)) + box('Linked competitors', linked.length ? linked.map((c) => '<div><a href="#' + links.competitor(c) + '">' + e(c.cid) + ' · ' + e(Q.crewName(c)) + '</a></div>').join('') : '<p class="muted small">None</p>'),
      inspTitle: 'Logger',
    });
  };

  // ---------- guard and mount ----------

  // A page outside any document: no tabs and no inspector.
  function bareFor(ctx) {
    return (title, body) => header({ ...ctx, comp: null }) + '<div class="f-body noinsp"><nav class="f-pane f-browser"></nav><section class="f-center"><div class="f-doc"><div class="f-doc-head"><h1>' + title + '</h1></div>' + body + '</div></section></div>';
  }
  function guard(ctx) {
    const bare = bareFor(ctx);
    if (!ctx.comp) return bare('Not found', '<div class="wf-empty">This competition does not exist.</div>');
    if (!Q.roleIn(ctx.comp)) {
      const ci = S.competitionInvitations.find((i) => i.competitionId === ctx.comp.id && i.inviteeId === Q.me().id);
      return bare(e(ctx.comp.name), '<div class="wf-empty">You are not a member of this competition.' + (ci ? '<p><button class="wf-btn primary" data-act="acceptCI" data-id="' + ci.id + '">Accept invitation as ' + ci.role + '</button></p>' : '') + '</div>');
    }
    if (ctx.comp.blocked && !Q.me().staff) return bare('Not found', '<div class="wf-empty">This competition does not exist.</div>');
    if (ctx.comp.lifecycle === 'archived' && !/^\/c\/[^/]+(\/w)?(\/setup\/(members|lifecycle))?$/.test(ctx.path)) return bare(e(ctx.comp.name), '<div class="wf-empty">This competition is archived. Its scoring work was removed. <a href="#' + WS(ctx.comp) + '">Open overview</a></div>');
    return null;
  }

  KH.mount({
    id: 'f',
    routes,
    links,
    render(ctx) {
      if (ctx.params.comp) {
        const g = guard(ctx);
        if (g) return g;
      }
      return D[ctx.route.path](ctx);
    },
    notFound: (ctx) => bareFor(ctx)('Not found', '<div class="wf-empty">No document at ' + e(ctx.path) + '. <a href="#/">My competitions</a></div>'),
    onKey(ev) {
      if (ev.key === '/') {
        const el = document.getElementById('f-jump');
        if (el && el.focus) {
          ev.preventDefault();
          el.focus();
        }
      }
    },
    afterReview() {
      const ctx = KH.current();
      if (!ctx.params.cid || !ctx.cd) return;
      const n = neighbours(ctx);
      if (n.next) location.hash = replaceHref(ctx, resultTok(n.next.result));
    },
  });
})();
