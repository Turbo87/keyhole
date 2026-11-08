// PROTOTYPE: Round 4 prototype 4B, "Grouped pages". Setup shrinks to four larger pages: Competition (details, upload
// password, dates and class days, members), Classes (every class as a collapsible section), Course (turnpoints and
// airspace) and Entrants (competitors and loggers together, with a side panel for one competitor or logger).
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

  const links = {
    cls: (cls) => C(Q.competition(cls.competitionId)) + '/classes?open=' + cls.slug,
    competitors: (comp) => C(comp) + '/entrants',
    competitor: (c) => C(Q.competition(c.competitionId)) + '/entrants?competitor=' + c.id,
    logger: (l) => C(Q.competition(l.competitionId)) + '/entrants?logger=' + l.id,
    newClass: (comp) => C(comp) + '/classes?new=class',
    newLogger: (comp) => C(comp) + '/entrants?new=logger',
    members: (comp) => C(comp) + '/competition?section=members',
  };

  // Sections are addressed with ?section= so every scroll target has a URL.
  function scrollTo(ctx) {
    const id = ctx.query.section || ctx.query.open;
    if (!id || typeof setTimeout === 'undefined') return;
    setTimeout(() => {
      const el = document.getElementById('b4-' + id);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
    }, 0);
  }
  const jump = (ctx, path, items) => '<div class="b4-jump">' + items.map(([k, label]) => '<a class="wf-btn small' + (ctx.query.section === k ? ' primary' : '') + '" href="#' + C(ctx.comp) + path + '?section=' + k + '">' + label + '</a>').join('') + '</div>';
  const section = (id, title, body) => '<section class="b4-sec wf-stack" id="b4-' + id + '"><h2>' + title + '</h2>' + body + '</section>';

  function competition(ctx) {
    const comp = ctx.comp;
    scrollTo(ctx);
    if (comp.lifecycle === 'archived') return R.page(ctx, 'Members and invitations', W.members(comp));
    return R.page(ctx, 'Competition', '<div class="wf-stack">' +
      jump(ctx, '/competition', [['details', 'Details'], ['password', 'Upload password'], ['dates', 'Dates and class days'], ['members', 'Members']]) +
      section('details', 'Details', '<div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"><div class="wf-box">' + W.competitionDetails(comp) + '</div>' +
        '<div class="wf-box fill small"><b>Organiser terms</b><br>' + e(comp.terms.version) + ' accepted by ' + e(Q.user(comp.terms.userId).name) + ' on ' + W.dt(comp.terms.at) + ' for ' + e(comp.terms.organiser) + '</div></div>') +
      section('password', 'Upload password', '<div class="wf-box" style="max-width:560px">' + W.uploadPassword(comp) + '</div>') +
      section('dates', 'Dates and class days', '<div class="wf-box"><h3>Competition dates</h3>' + W.datesEditor(comp) + '</div><div>' + R.matrix(comp) + '</div>') +
      section('members', 'Members and invitations', W.members(comp)) + '</div>');
  }

  function classes(ctx) {
    const comp = ctx.comp;
    scrollTo(ctx);
    const list = Q.classesOf(comp.id, true);
    const adding = ctx.query.new === 'class';
    const body = (adding ? '<div class="wf-box" id="b4-new"><h3>Add class</h3>' + W.classForm(comp) + '</div>' : '') +
      (list.length ? list.map((c) => {
        const head = '<b>' + e(c.name) + '</b><span class="muted small">' + e(c.edition) + ' · ' + (c.handicapScale ? 'handicapped, scale ' + c.handicapScale : 'not handicapped') + ' · ' + Q.competitorsOf(comp.id, c.id).length + ' competitors</span>';
        if (c.deleted) return '<div class="b4-cls dim wf-row between" style="padding:8px 0"><span>' + head + ' <span class="wf-badge none">deleted</span></span><button class="wf-btn small" data-act="restoreClass" data-cls="' + c.id + '">Restore</button></div>';
        const open = ctx.query.open === c.slug || (!ctx.query.open && !adding && list.filter((x) => !x.deleted).length === 1);
        return '<details class="b4-cls" id="b4-' + c.slug + '"' + (open ? ' open' : '') + '><summary>' + head + ' <a class="small" href="#' + L.standings(c) + '">Standings</a></summary><div class="wf-box" style="margin-bottom:12px">' + W.classForm(comp, c) + '</div></details>';
      }).join('') : '<div class="wf-empty">No classes yet. Add the first class to plan its days and enter competitors.</div>');
    return R.page(ctx, 'Classes', '<div class="wf-stack">' + body + '</div>', adding ? '' : '<a class="wf-btn primary" href="#' + links.newClass(comp) + '">Add class</a>');
  }

  function course(ctx) {
    scrollTo(ctx);
    return R.page(ctx, 'Course', '<div class="wf-stack">' + jump(ctx, '/course', [['turnpoints', 'Turnpoint file'], ['airspace', 'Airspace file']]) +
      section('turnpoints', 'Turnpoint file', W.turnpoints(ctx.comp)) + section('airspace', 'Airspace file', W.airspace(ctx.comp)) + '</div>');
  }

  function competitorPanel(ctx, c) {
    const loggers = Q.loggersOf(ctx.comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
    return '<h3>' + e(c.cid) + ' · ' + e(Q.crewName(c)) + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : '') + '</h3>' + W.competitorForm(ctx.comp, c) +
      '<h3 style="margin-top:14px">Loggers</h3>' + (loggers.length ? '<table class="wf-table"><tbody>' + loggers.map((l) => '<tr class="link" data-href="' + links.logger(l) + '"><td>' + e(Q.loggerLabel(l)) + '</td><td>' + l.links.filter((k) => k.competitorId === c.id).map((k) => k.role + (k.from ? ' from ' + W.date(k.from) : '')).join(', ') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted small">No loggers linked</p>') +
      '<p><a class="wf-btn small" href="#' + links.newLogger(ctx.comp) + '">Add logger</a></p><div style="margin-top:10px">' + W.dsqPanel(c) + '</div>';
  }
  function loggerPanel(ctx, l) {
    return '<h3>Logger ' + e(Q.loggerLabel(l)) + '</h3><h4>Dated links</h4>' + W.loggerLinks(l) + '<h4 style="margin-top:12px">Thresholds</h4>' + W.loggerForm(ctx.comp, l) +
      '<p class="small" style="margin-top:10px"><a href="#' + C(ctx.comp) + '/files?logger=' + l.id + '">IGC files of this logger</a></p>';
  }

  function entrants(ctx) {
    const comp = ctx.comp;
    const q = ctx.query;
    const cls = q.class ? Q.classBySlug(comp.id, q.class) : null;
    const base = links.competitors(comp);
    const keep = (extra) => base + '?' + [cls ? 'class=' + cls.slug : '', extra].filter(Boolean).join('&');
    let panel = '';
    let sel = null;
    if (q.competitor) {
      const c = Q.competitor(q.competitor);
      sel = c && links.competitor(c);
      panel = c && c.competitionId === comp.id ? competitorPanel(ctx, c) : '<div class="wf-empty">No such competitor</div>';
    } else if (q.logger) {
      const l = Q.logger(q.logger);
      sel = l && links.logger(l);
      panel = l && l.competitionId === comp.id ? loggerPanel(ctx, l) : '<div class="wf-empty">No such logger</div>';
    } else if (q.new === 'competitor') panel = '<h3>Add competitor</h3>' + W.competitorForm(comp, null, cls && cls.id);
    else if (q.new === 'logger') panel = '<h3>Add logger</h3>' + W.loggerForm(comp);
    const mark = (html) => (sel ? html.split('data-href="' + sel + '"').join('data-href="' + sel + '" data-sel="1"').replace(/<tr class="([^"]*)" data-href="([^"]*)" data-sel="1"/g, '<tr class="$1 b4-sel" data-href="$2"') : html);

    const filters = '<div class="wf-row"><a class="wf-btn small' + (!cls ? ' primary' : '') + '" href="#' + base + '">All classes</a>' + Q.classesOf(comp.id).map((c) => '<a class="wf-btn small' + (cls === c ? ' primary' : '') + '" href="#' + base + '?class=' + c.slug + '">' + e(c.name) + '</a>').join('') + '</div>';
    const unlinked = Q.loggersOf(comp.id).filter((l) => !l.links.length);
    const list = '<div class="wf-stack">' + filters +
      '<div><h2>Competitors <span class="muted small" style="font-weight:400">' + Q.competitorsOf(comp.id, cls && cls.id).length + '</span></h2><div class="r2-wide">' + mark(W.competitorsTable(comp, cls && cls.id)) + '</div></div>' +
      '<div><h2>Loggers without a link <span class="muted small" style="font-weight:400">' + unlinked.length + '</span></h2>' +
        (unlinked.length ? '<table class="wf-table"><tbody>' + unlinked.map((l) => '<tr class="link' + (sel === links.logger(l) ? ' b4-sel' : '') + '" data-href="' + links.logger(l) + '"><td><b>' + e(Q.loggerLabel(l)) + '</b></td><td class="num">' + S.files.filter((f) => f.loggerId === l.id && !f.deleted).length + ' files</td><td class="small muted">ENL ' + l.enl + ', MOP ' + l.mop + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted small">Every logger is linked to a competitor.</p>') + '</div>' +
      '<details><summary>All loggers (' + Q.loggersOf(comp.id).length + ')</summary><div class="r2-wide" style="margin-top:8px">' + mark(W.loggersTable(comp)) + '</div></details></div>';
    const close = '<div class="wf-dialog-head"><span class="muted small">' + (q.competitor ? 'Competitor' : q.logger ? 'Logger' : 'New') + '</span><a class="wf-btn small" href="#' + keep('') + '">Close</a></div>';
    const actions = '<a class="wf-btn" href="#' + keep('new=logger') + '">Add logger</a><a class="wf-btn primary" href="#' + keep('new=competitor') + '">Add competitor</a>';
    return R.page(ctx, 'Entrants', panel ? '<div class="b4-split">' + list + '<aside class="b4-panel wf-box">' + close + panel + '</aside></div>' : list, actions);
  }

  const setupRoutes = [
    { path: '/c/:comp/competition', title: 'Competition: details, password, dates, members', example: EX + '/competition', render: competition, archived: true },
    { path: '/c/:comp/classes', title: 'Classes (all on one page)', example: EX + '/classes?open=club', render: classes },
    { path: '/c/:comp/course', title: 'Course: turnpoints and airspace', example: EX + '/course', render: course },
    { path: '/c/:comp/entrants', title: 'Entrants: competitors and loggers', example: EX + '/entrants?competitor=p1', render: entrants },
  ];

  function setupMenu(ctx) {
    const comp = ctx.comp;
    const b = C(comp);
    const n = R.navItem;
    const steps = Object.fromEntries(R.setupSteps(comp).map((s) => [s.key, s.done]));
    const mark = (keys) => (keys.every((k) => steps[k]) ? '' : '—');
    return R.navSection('Setup') + n(b + '/competition', 'Competition', ctx, mark(['details', 'airfield', 'members'])) + n(b + '/classes', 'Classes', ctx, String(Q.classesOf(comp.id).length)) +
      n(b + '/course', 'Course', ctx, mark(['turnpoints', 'airspace'])) + n(b + '/entrants', 'Entrants', ctx, String(Q.competitorsOf(comp.id).length));
  }

  const GROUPS = [
    ['Competition', '/competition', ['details', 'airfield', 'members'], 'Details, upload password, dates, members'],
    ['Classes', '/classes', ['classes'], 'Rule set editions and rule overrides'],
    ['Course', '/course', ['turnpoints', 'airspace'], 'Turnpoint and airspace files'],
    ['Entrants', '/entrants', ['competitors', 'loggers'], 'Competitors, loggers and their links'],
  ];
  function setupCard(ctx) {
    const comp = ctx.comp;
    const steps = R.setupSteps(comp);
    if (steps.every((s) => s.done)) return '';
    const by = Object.fromEntries(steps.map((s) => [s.key, s]));
    return '<div class="wf-box"><h3>Setup</h3><div class="b4-groups">' + GROUPS.map(([label, path, keys, hint]) => {
      const open = keys.map((k) => by[k]).filter((s) => !s.done);
      const href = path === '/classes' && !Q.classesOf(comp.id).length ? links.newClass(comp) : C(comp) + path;
      return '<a class="b4-group' + (open.length ? '' : ' done') + '" href="#' + href + '"><b><span class="mdi ' + (open.length ? 'mdi-circle-outline' : 'mdi-check-circle-outline') + '"></span>' + label + '</b><span class="small">' + (open.length ? 'Open: ' + open.map((s) => e(s.label.toLowerCase())).join(', ') : e(hint)) + '</span></a>';
    }).join('') + '</div>' + (comp.createdAt > '2026-07-28' ? '<p class="muted small" style="margin-top:8px">Created ' + W.dt(comp.createdAt) + '. Pilots can already upload test files with the competition password.</p>' : '') + '</div>';
  }

  R.mount({ id: '4b', setupRoutes, setupMenu, setupCard, links, ownsMembers: true });
})();
