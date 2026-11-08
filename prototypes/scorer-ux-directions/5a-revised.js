// PROTOTYPE: Round 5 prototype 5A, "4A revised". Prototype 4A with the round 4 decisions (README.md): a Competition
// page with the tabs Details, Airfield, Dates, Task sheets, Uploads and Team, turnpoint and airspace pages with a map,
// competitor pages with the tabs Results, Details and Loggers, and a Loggers list with an "unlinked" filter.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const A = KH.act;
  const S = KH.state;
  const R = KH.r5;
  const e = KH.esc;
  const field = W.field;
  const input = W.input;
  const select = W.select;

  // Scorers may change the competition dates in this prototype (README, round 4 decision 2).
  KH.scorerEditsDates = true;

  const C = (comp) => '/c/' + comp.slug;
  const EX = '/c/oberrhein-2026';
  const CP = (comp) => C(comp) + '/competition';
  const empty = (ctx, title, msg) => R.page(ctx, title, '<div class="wf-empty">' + msg + '</div>');

  const links = {
    competitors: (comp) => C(comp) + '/competitors',
    competitor: (c) => C(Q.competition(c.competitionId)) + '/competitors/' + c.id,
    newCompetitor: (comp, cls) => C(comp) + '/competitors/new' + (cls ? '?class=' + cls.slug : ''),
    logger: (l) => C(Q.competition(l.competitionId)) + '/loggers/' + l.id,
    newClass: (comp) => C(comp) + '/classes/new',
    newLogger: (comp) => C(comp) + '/loggers/new',
    team: (comp) => CP(comp) + '/team',
    setupTarget: (key, comp) => ({ airfield: CP(comp) + '/airfield', dates: CP(comp) + '/dates', turnpoints: C(comp) + '/turnpoints', airspace: C(comp) + '/airspace' })[key],
  };

  function tabBar(tabs, key) {
    return '<div class="wf-tabs r3-tabs">' + tabs.map(([k, href, label]) => '<a class="' + (k === key ? 'on' : '') + '" href="#' + href + '">' + label + '</a>').join('') + '</div>';
  }

  // ---------- greyscale map placeholder ----------

  const MAP = { w: 480, h: 300 };
  function bounds(points) {
    if (!points.length) return { minLat: 47.7, maxLat: 48.8, minLon: 7.5, maxLon: 9.4 };
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    return { minLat: Math.min(...lats) - 0.08, maxLat: Math.max(...lats) + 0.08, minLon: Math.min(...lons) - 0.12, maxLon: Math.max(...lons) + 0.12 };
  }
  const px = (b, lon) => ((lon - b.minLon) / (b.maxLon - b.minLon)) * MAP.w;
  const py = (b, lat) => MAP.h - ((lat - b.minLat) / (b.maxLat - b.minLat)) * MAP.h;
  function mapFrame(svg, attrs, tag) {
    let grid = '';
    for (let i = 1; i < 6; i++) grid += '<line x1="' + (i * MAP.w) / 6 + '" y1="0" x2="' + (i * MAP.w) / 6 + '" y2="' + MAP.h + '" stroke="#e4e4e4"/><line x1="0" y1="' + (i * MAP.h) / 6 + '" x2="' + MAP.w + '" y2="' + (i * MAP.h) / 6 + '" stroke="#e4e4e4"/>';
    return '<div class="wf-map r5-map" ' + (attrs || '') + '><span class="tag">' + (tag || 'Map (no basemap)') + '</span><svg viewBox="0 0 ' + MAP.w + ' ' + MAP.h + '" preserveAspectRatio="none">' + grid + svg + '</svg></div>';
  }
  const TP_MARK = { Airfield: 'square', 'Gliding airfield': 'square', Outlanding: 'diamond', Waypoint: 'circle' };
  function tpMarker(b, t, on) {
    const x = px(b, t.lon).toFixed(1);
    const y = py(b, t.lat).toFixed(1);
    const fill = on ? '#111' : t.type === 'Outlanding' ? '#fff' : '#777';
    const shape = TP_MARK[t.type] || 'circle';
    const m = shape === 'square' ? '<rect x="' + (x - 5) + '" y="' + (y - 5) + '" width="10" height="10" fill="' + fill + '" stroke="#111"/>' :
      shape === 'diamond' ? '<path d="M' + x + ' ' + (y - 6) + 'L' + (Number(x) + 6) + ' ' + y + 'L' + x + ' ' + (Number(y) + 6) + 'L' + (x - 6) + ' ' + y + 'Z" fill="' + fill + '" stroke="#111"/>' :
        '<circle cx="' + x + '" cy="' + y + '" r="' + (on ? 6 : 4) + '" fill="' + fill + '" stroke="#111"/>';
    return '<g><title>' + e(t.name + ' · ' + t.type) + '</title>' + m + (on ? '<text x="' + (Number(x) + 8) + '" y="' + (y - 8) + '" font-size="12" font-weight="bold">' + e(t.name) + '</text>' : '') + '</g>';
  }

  // ---------- Competition page ----------

  function compTabs(ctx, key) {
    const b = CP(ctx.comp);
    if (ctx.comp.lifecycle === 'archived') return tabBar([['team', b + '/team', 'Team']], key);
    return tabBar([['details', b, 'Details'], ['airfield', b + '/airfield', 'Airfield'], ['dates', b + '/dates', 'Dates'], ['sheets', b + '/task-sheets', 'Task sheets'], ['uploads', b + '/uploads', 'Uploads'], ['team', b + '/team', 'Team']], key);
  }
  const compPage = (ctx, key, body) => R.page(ctx, 'Competition', compTabs(ctx, key) + body);

  function details(ctx) {
    const comp = ctx.comp;
    const admin = Q.can('admin-fields', comp);
    const ro = admin ? '' : 'disabled';
    const form = '<form class="wf-stack" data-submit="r5SaveDetails" data-comp="' + comp.id + '"><div class="wf-form">' +
      field('Name', input('name', comp.name, ro)) +
      field('Slug', input('slug', comp.slug, 'disabled'), { hint: 'Fixed at creation' }) +
      field('Organising club or person', input('organiser', comp.organiser, ro)) +
      field('Country', input('country', comp.country, ro + ' class="narrow"')) +
      field('Website', input('website', comp.website, ro)) +
      '</div>' + (admin ? '<div class="wf-row"><button class="wf-btn primary">Save</button></div>' : '<p class="muted small">Only a competition admin can change these.</p>') + '</form>';
    const terms = Q.me().staff ? '<div class="wf-box fill small"><b>Organiser terms</b> <span class="muted">(staff only)</span><br>' + e(comp.terms.version) + ' accepted by ' + e(Q.user(comp.terms.userId).name) + ' on ' + W.dt(comp.terms.at) + ' for ' + e(comp.terms.organiser) + '</div>' : '';
    const danger = Q.can('archive', comp) ? '<div class="wf-box dashed r5-danger"><h3>Danger zone</h3>' +
      '<div class="wf-row between"><div><b>Archive</b><p class="muted small" style="margin:2px 0 0">Removes the scoring work and keeps only the published results, which can then no longer change. The upload password stops working.</p></div><button class="wf-btn" data-act="archiveComp" data-comp="' + comp.id + '">Archive competition…</button></div>' +
      '<div class="wf-row between" style="margin-top:12px"><div><b>Delete</b><p class="muted small" style="margin:2px 0 0">Removes the competition, its public pages and IGC downloads for good, and frees the slug.</p></div><button class="wf-btn danger" data-act="deleteComp" data-comp="' + comp.id + '">Delete competition…</button></div></div>' : '';
    return compPage(ctx, 'details', '<div class="wf-stack" style="max-width:820px"><div class="wf-box">' + form + '</div>' + terms + danger + '</div>');
  }

  function airfield(ctx) {
    const comp = ctx.comp;
    const a = comp.airfield;
    const tzLocked = Q.classesOf(comp.id).some((c) => Q.classDaysOf(c.id).length) || Q.filesOf(comp.id).length;
    const admin = Q.can('admin-fields', comp);
    const tps = comp.turnpointFile ? comp.turnpointFile.turnpoints : [];
    const b = bounds(tps.concat(a ? [a] : []));
    const svg = tps.map((t) => '<circle cx="' + px(b, t.lon).toFixed(1) + '" cy="' + py(b, t.lat).toFixed(1) + '" r="2.5" fill="#bbb"><title>' + e(t.name) + '</title></circle>').join('') +
      (a ? '<g transform="translate(' + px(b, a.lon).toFixed(1) + ',' + py(b, a.lat).toFixed(1) + ')"><circle r="9" fill="none" stroke="#111" stroke-width="2"/><circle r="3" fill="#111"/></g>' : '');
    const map = mapFrame(svg, 'data-act="r5PickAirfield" data-comp="' + comp.id + '" data-b="' + [b.minLat, b.maxLat, b.minLon, b.maxLon].join(',') + '" style="cursor:crosshair"', 'Click to place the airfield');
    const form = '<form class="wf-stack" data-submit="r5SaveAirfield" data-comp="' + comp.id + '"><div class="wf-form">' +
      field('Location', input('location', comp.location, admin ? '' : 'disabled'), { hint: admin ? 'Shown with the competition name' : 'Admin only' }) +
      field('Latitude', input('lat', a ? a.lat : '', 'placeholder="48.1214" class="mid"')) +
      field('Longitude', input('lon', a ? a.lon : '', 'placeholder="7.8309" class="mid"')) +
      field('Elevation (m MSL)', input('elev', a && a.elev != null ? a.elev : '', 'placeholder="210" class="narrow"'), { hint: a ? 'A change marks every file of the competition stale' : 'Needed before analysis' }) +
      field('Time zone', input('timeZone', comp.timeZone, tzLocked ? 'disabled' : ''), { hint: 'Fixed once the competition has a class day or IGC file' }) +
      '</div><div class="wf-row"><button class="wf-btn primary">Save</button></div></form>';
    return compPage(ctx, 'airfield', '<div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))"><div class="wf-box">' + form + '</div><div>' + map + '<p class="muted small">Grey dots are turnpoints, for orientation.</p></div></div>');
  }

  const dates = (ctx) => compPage(ctx, 'dates', '<div class="wf-box" style="max-width:820px"><h3>Competition dates</h3>' + W.datesEditor(ctx.comp) +
    '<p class="muted small">Class days are planned from the overview, the class pages and the dates in the sidebar.</p></div>');

  function taskSheets(ctx) {
    const comp = ctx.comp;
    return compPage(ctx, 'sheets', '<div class="wf-box" style="max-width:820px"><form class="wf-stack" data-submit="r5SaveSheets" data-comp="' + comp.id + '"><div class="wf-form">' +
      field('Standing notes', '<textarea name="standingNotes">' + e(comp.standingNotes) + '</textarea>', { full: true, hint: 'Printed on every task sheet' }) +
      field('Flight levels listed on task sheets', input('flightLevels', comp.flightLevels.join(', '), 'placeholder="FL 65, FL 95"'), { full: true, hint: 'Printed converted to m MSL with the class day QNH' }) +
      '</div><div class="wf-row"><button class="wf-btn primary">Save</button></div></form></div>');
  }
  const uploads = (ctx) => compPage(ctx, 'uploads', '<div class="wf-box" style="max-width:820px"><h3>Pilot upload password</h3>' + W.uploadPassword(ctx.comp) + '</div>');
  const team = (ctx) => compPage(ctx, 'team', '<div class="wf-box">' + W.members(ctx.comp) + '</div>');

  // ---------- turnpoints and airspace ----------

  function fileHead(comp, f, what, act, label) {
    return '<div class="wf-row between"><div>' + (f ? '<b>' + e(f.name) + '</b> <span class="muted">uploaded ' + W.dt(f.uploadedAt) + ', ' + (f.turnpoints || f.airspaces).length + ' ' + what + '</span>' : '<span class="muted">No ' + what.replace(/s$/, '') + ' file yet</span>') + '</div>' +
      '<div class="wf-row">' + (f ? '<button class="wf-btn small" data-act="fakeDownload" data-what="' + e(f.name) + '">Download original</button>' : '') +
      '<button class="wf-btn' + (f ? '' : ' primary') + '" data-act="' + act + '" data-comp="' + comp.id + '">' + (f ? 'Replace file…' : label) + '</button></div></div>';
  }
  function turnpoints(ctx) {
    const comp = ctx.comp;
    const f = comp.turnpointFile;
    const head = fileHead(comp, f, 'turnpoints', 'uploadTurnpoints', 'Upload CUP file…');
    if (!f) return R.page(ctx, 'Turnpoints', '<div class="wf-stack">' + head + '</div>');
    const sel = ctx.query.tp || '';
    const b = bounds(f.turnpoints);
    const svg = f.turnpoints.map((t) => tpMarker(b, t, t.name === sel)).join('');
    const legend = '<div class="r2-legend"><span>■ airfield</span><span>◇ outlanding</span><span>● waypoint</span></div>';
    const table = '<table class="wf-table"><thead><tr><th>Name</th><th>Type</th><th class="num">Latitude</th><th class="num">Longitude</th><th class="num">Elevation</th></tr></thead><tbody>' +
      f.turnpoints.map((t) => '<tr class="link' + (t.name === sel ? ' sel' : '') + '" data-href="' + C(comp) + '/turnpoints?tp=' + encodeURIComponent(t.name) + '"><td>' + (t.name === sel ? '<b>' + e(t.name) + '</b>' : e(t.name)) + '</td><td>' + e(t.type) + '</td><td class="num">' + t.lat.toFixed(4) + '</td><td class="num">' + t.lon.toFixed(4) + '</td><td class="num">' + t.elev + ' m</td></tr>').join('') + '</tbody></table>';
    return R.page(ctx, 'Turnpoints', '<div class="wf-stack">' + head +
      '<p class="muted small">Task points keep copies of their coordinates. A replacement never moves them, and the task view flags points that no longer match.</p>' +
      '<div class="r5-split"><div class="wf-table-wrap">' + table + '</div><div class="r5-sticky">' + mapFrame(svg) + legend + '<p class="muted small">Click a row to highlight its point.</p></div></div></div>');
  }

  // Airspaces have no geometry in the fake data, so the map draws a deterministic stand-in per airspace.
  function airspaceShape(i) {
    const cx = MAP.w * (0.15 + ((i * 37) % 70) / 100);
    const cy = MAP.h * (0.15 + ((i * 53) % 70) / 100);
    const r = 18 + ((i * 13) % 30);
    return { cx, cy, r };
  }
  function airspace(ctx) {
    const comp = ctx.comp;
    const f = comp.airspaceFile;
    const head = fileHead(comp, f, 'airspaces', 'uploadAirspace', 'Upload airspace file…');
    if (!f) return R.page(ctx, 'Airspace', '<div class="wf-stack">' + head + '</div>');
    const svg = f.airspaces.map((a, i) => {
      const s = airspaceShape(i);
      const open = comp.openedAirspaceNames.includes(a.name);
      return '<g><title>' + e(a.name + (open ? ' · opened' : ' · closed')) + '</title><circle cx="' + s.cx + '" cy="' + s.cy + '" r="' + s.r + '" fill="' + (open ? 'none' : 'rgba(0,0,0,.12)') + '" stroke="#333" stroke-dasharray="' + (open ? '4 3' : '0') + '"/><text x="' + s.cx + '" y="' + s.cy + '" font-size="9" text-anchor="middle" fill="#333">' + e(a.name.split(' ').slice(-1)[0]) + '</text></g>';
    }).join('');
    const gone = comp.openedAirspaceNames.filter((n) => !f.airspaces.some((a) => a.name === n));
    const toggle = (name, on) => '<label class="wf-field inline"><input type="checkbox" ' + (on ? 'checked' : '') + ' data-change="toggleOpened" data-comp="' + comp.id + '" data-name="' + e(name) + '"> opened</label>';
    const table = '<table class="wf-table"><thead><tr><th>Name</th><th>Category</th><th>Lower</th><th>Upper</th><th>Competition</th></tr></thead><tbody>' +
      gone.map((n) => '<tr><td>' + e(n) + '</td><td colspan="3"><span class="wf-badge dashed">not in the current file</span></td><td>' + toggle(n, true) + '</td></tr>').join('') +
      f.airspaces.map((a) => '<tr><td>' + e(a.name) + '</td><td>' + a.category + '</td><td>' + a.lower + '</td><td>' + a.upper + '</td><td>' + toggle(a.name, comp.openedAirspaceNames.includes(a.name)) + '</td></tr>').join('') + '</tbody></table>';
    return R.page(ctx, 'Airspace', '<div class="wf-stack">' + head + '<p class="muted small">Every airspace is closed for the competition unless it is opened here.</p>' +
      '<div class="r5-split"><div class="wf-table-wrap">' + table + '</div><div class="r5-sticky">' + mapFrame(svg) + '<div class="r2-legend"><span>Shaded: closed</span><span>Dashed: opened</span></div></div></div></div>');
  }

  // ---------- competitors ----------

  function competitors(ctx) {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    const b = links.competitors(ctx.comp);
    return R.page(ctx, 'Competitors', '<div class="wf-stack"><div class="wf-row"><a class="wf-btn small' + (!cls ? ' primary' : '') + '" href="#' + b + '">All</a>' + Q.classesOf(ctx.comp.id).map((c) => '<a class="wf-btn small' + (cls === c ? ' primary' : '') + '" href="#' + b + '?class=' + c.slug + '">' + e(c.name) + ' ' + Q.competitorsOf(ctx.comp.id, c.id).length + '</a>').join('') + '</div><div class="wf-table-wrap">' + W.competitorsTable(ctx.comp, cls && cls.id) + '</div></div>',
      '<a class="wf-btn primary" href="#' + links.newCompetitor(ctx.comp, cls) + '">Add competitor</a>');
  }
  function competitorNew(ctx) {
    const cls = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    return R.page(ctx, 'Add competitor', '<div class="wf-box">' + W.competitorForm(ctx.comp, null, cls && cls.id) + '</div>');
  }
  function competitorPage(ctx, key, body) {
    const c = ctx.competitor;
    const b = links.competitor(c);
    const title = e(c.cid) + ' · ' + e(Q.crewName(c)) + (c.hc ? ' <span class="wf-badge">HC</span>' : '') + (c.dsq ? ' <span class="wf-badge solid">DSQ</span>' : '') + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : '');
    const sub = '<p class="muted small r4-sub">' + e(Q.class(c.classId).name) + ' · ' + e(c.gliderType) + (c.handicap ? ', handicap ' + c.handicap : '') + '</p>';
    return R.page(ctx, title, sub + tabBar([['results', b, 'Results'], ['details', b + '/details', 'Details'], ['loggers', b + '/loggers', 'Loggers']], key) + body);
  }
  const withCompetitor = (fn) => (ctx) => (!ctx.competitor || ctx.competitor.competitionId !== ctx.comp.id ? empty(ctx, 'Not found', 'No such competitor') : fn(ctx));
  const competitorResults = withCompetitor((ctx) => {
    const c = ctx.competitor;
    const cls = Q.class(c.classId);
    const rows = ctx.comp.dates.map((d) => {
      const cd = Q.classDayOn(cls.id, d);
      const r = cd && R.live(cd) ? Q.resultFor(cd.id, c.id) : null;
      const day = '<a href="#' + R.dayPath(cls, d) + '">' + e(Q.dayLabel(cls.id, d)) + '</a> <span class="muted small">' + W.date(d) + '</span>';
      if (!r) return '<tr><td>' + day + '</td><td colspan="2"><span class="r3-status">' + R.statusIcon(cd ? cd.status : null) + ' ' + e(R.statusLabel(cd ? cd.status : null)) + '</span></td></tr>';
      return '<tr class="link" data-href="' + R.links.result(r) + '"><td>' + day + '</td><td>' + W.resultStatus(r) + '</td><td>' + (R.isTodo(r) ? R.todoIcon(R.todoReasons(r).join(', ')) : '') + '</td></tr>';
    }).join('');
    return competitorPage(ctx, 'results', '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Class day</th><th>Result</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>');
  });
  const competitorDetails = withCompetitor((ctx) => competitorPage(ctx, 'details', '<div class="wf-stack"><div class="wf-box">' + W.competitorForm(ctx.comp, ctx.competitor) + '</div><div class="wf-box">' + W.dsqPanel(ctx.competitor) + '</div></div>'));
  const competitorLoggers = withCompetitor((ctx) => {
    const c = ctx.competitor;
    const comp = ctx.comp;
    const mine = Q.loggersOf(comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
    const rows = mine.flatMap((l) => l.links.filter((k) => k.competitorId === c.id).map((k) => '<tr><td><a href="#' + links.logger(l) + '">' + e(Q.loggerLabel(l)) + '</a></td><td>' + (k.from ? W.date(k.from, true) : 'start of competition') + '</td><td>' + k.role + '</td></tr>')).join('');
    const others = Q.loggersOf(comp.id).filter((l) => !mine.includes(l));
    const form = '<form class="wf-row" data-submit="r5LinkLogger" data-comp="' + comp.id + '" data-competitor="' + c.id + '">' +
      field('Logger', select('loggerId', [['', 'New logger…']].concat(others.map((l) => [l.id, Q.loggerLabel(l) + (l.links.length ? '' : ' · unlinked')])), '')) +
      field('Manufacturer', input('manufacturer', '', 'maxlength="3" class="narrow" placeholder="LXV"'), { hint: 'For a new logger' }) +
      field('Serial', input('serial', '', 'class="mid"'), { hint: 'For a new logger' }) +
      field('From date', input('from', '', 'type="date"'), { hint: 'Empty: from the start' }) +
      field('Role', select('role', ['primary', 'secondary'], mine.length ? 'secondary' : 'primary')) +
      '<button class="wf-btn small primary" style="align-self:flex-end">Link logger</button></form>';
    return competitorPage(ctx, 'loggers', '<div class="wf-stack"><div class="wf-box"><h3>Dated links</h3><table class="wf-table"><thead><tr><th>Logger</th><th>From</th><th>Role</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="3" class="muted">No loggers linked. Unresolved files offer to create a link from the pilot\'s suggestion.</td></tr>') + '</tbody></table><p class="muted small">Change or remove a link on the logger\'s page.</p></div><div class="wf-box"><h3>Link logger</h3>' + form + '</div></div>');
  });

  // ---------- loggers ----------

  function loggers(ctx) {
    const comp = ctx.comp;
    const b = C(comp) + '/loggers';
    const unlinked = ctx.query.show === 'unlinked';
    const all = Q.loggersOf(comp.id);
    const list = unlinked ? all.filter((l) => !l.links.length) : all;
    const n = all.filter((l) => !l.links.length).length;
    const table = '<table class="wf-table"><thead><tr><th>Logger</th><th>Links</th><th class="num">Files</th></tr></thead><tbody>' +
      (list.length ? list.map((l) => '<tr class="link" data-href="' + links.logger(l) + '"><td><b>' + e(Q.loggerLabel(l)) + '</b></td><td>' + (l.links.length ? l.links.map((k) => e(Q.competitor(k.competitorId).cid) + ' ' + k.role + (k.from ? ' from ' + W.date(k.from) : '')).join('<br>') : '<span class="wf-badge dashed">unlinked</span>') + '</td><td class="num">' + S.files.filter((f) => f.loggerId === l.id).length + '</td></tr>').join('') : '<tr><td colspan="3" class="muted">' + (unlinked ? 'Every logger is linked' : 'No loggers yet') + '</td></tr>') + '</tbody></table>';
    return R.page(ctx, 'Loggers', '<div class="wf-stack"><div class="wf-row"><a class="wf-btn small' + (unlinked ? '' : ' primary') + '" href="#' + b + '">All ' + all.length + '</a><a class="wf-btn small' + (unlinked ? ' primary' : '') + '" href="#' + b + '?show=unlinked">Unlinked ' + n + '</a></div><div class="wf-table-wrap">' + table + '</div></div>',
      '<a class="wf-btn primary" href="#' + links.newLogger(comp) + '">Add logger</a>');
  }
  const loggerNew = (ctx) => R.page(ctx, 'Add logger', '<div class="wf-box">' + W.loggerForm(ctx.comp) + '</div>');
  function logger(ctx) {
    const l = ctx.logger;
    if (!l || l.competitionId !== ctx.comp.id) return empty(ctx, 'Not found', 'No such logger');
    const rows = S.files.filter((f) => f.loggerId === l.id).map((f) => ({ f, res: Q.resolve(f) }));
    return R.page(ctx, 'Logger ' + e(Q.loggerLabel(l)), '<div class="wf-stack"><div class="wf-box"><h3>Dated links</h3>' + W.loggerLinks(l) + '</div><div class="wf-box"><h3>Thresholds</h3>' + W.loggerForm(ctx.comp, l) + '</div><div class="wf-box"><h3>Files</h3><div class="wf-table-wrap">' + W.filesTable(rows) + '</div></div></div>');
  }

  const classNew = (ctx) => R.page(ctx, 'Add class', '<div class="wf-box">' + W.classForm(ctx.comp) + '</div>');

  const back = (path, label) => (ctx) => [[C(ctx.comp) + path, label]];
  const setupRoutes = [
    { path: '/c/:comp/competition', title: 'Competition: Details tab with the danger zone', example: EX + '/competition', render: details },
    { path: '/c/:comp/competition/airfield', title: 'Competition: Airfield tab with the map', example: EX + '/competition/airfield', render: airfield },
    { path: '/c/:comp/competition/dates', title: 'Competition: Dates tab', example: EX + '/competition/dates', render: dates },
    { path: '/c/:comp/competition/task-sheets', title: 'Competition: Task sheets tab', example: EX + '/competition/task-sheets', render: taskSheets },
    { path: '/c/:comp/competition/uploads', title: 'Competition: Uploads tab', example: EX + '/competition/uploads', render: uploads },
    { path: '/c/:comp/competition/team', title: 'Competition: Team tab', example: EX + '/competition/team', render: team, archived: true },
    { path: '/c/:comp/competitors', title: 'Competitors', example: EX + '/competitors', render: competitors },
    { path: '/c/:comp/competitors/new', title: 'Add competitor', example: EX + '/competitors/new', render: competitorNew, crumbs: back('/competitors', 'Competitors') },
    { path: '/c/:comp/competitors/:competitor', title: 'Competitor: Results tab', example: EX + '/competitors/p1', render: competitorResults, crumbs: back('/competitors', 'Competitors') },
    { path: '/c/:comp/competitors/:competitor/details', title: 'Competitor: Details tab', example: EX + '/competitors/p1/details', render: competitorDetails, crumbs: back('/competitors', 'Competitors') },
    { path: '/c/:comp/competitors/:competitor/loggers', title: 'Competitor: Loggers tab', example: EX + '/competitors/p1/loggers', render: competitorLoggers, crumbs: back('/competitors', 'Competitors') },
    { path: '/c/:comp/loggers', title: 'Loggers with the unlinked filter', example: EX + '/loggers', render: loggers },
    { path: '/c/:comp/loggers/new', title: 'Add logger', example: EX + '/loggers/new', render: loggerNew, crumbs: back('/loggers', 'Loggers') },
    { path: '/c/:comp/loggers/:logger', title: 'Logger and links', example: EX + '/loggers/lx1', render: logger, crumbs: back('/loggers', 'Loggers') },
    { path: '/c/:comp/turnpoints', title: 'Turnpoints with the map', example: EX + '/turnpoints', render: turnpoints },
    { path: '/c/:comp/airspace', title: 'Airspace with the map', example: EX + '/airspace', render: airspace },
    { path: '/c/:comp/classes/new', title: 'Add class', example: EX + '/classes/new', render: classNew },
  ];

  function setupMenu(ctx) {
    const comp = ctx.comp;
    const b = C(comp);
    const p = ctx.path;
    const n = R.navItem;
    const unlinked = Q.loggersOf(comp.id).filter((l) => !l.links.length).length;
    return n(CP(comp), 'Competition', ctx, '', 0, { within: p.startsWith(CP(comp) + '/') }) +
      n(b + '/competitors', 'Competitors', ctx, String(Q.competitorsOf(comp.id).length), 0, { within: p.startsWith(b + '/competitors/') }) +
      n(b + '/loggers', 'Loggers', ctx, unlinked ? unlinked + ' unlinked' : String(Q.loggersOf(comp.id).length), 0, { within: p.startsWith(b + '/loggers/') }) +
      n(b + '/turnpoints', 'Turnpoints', ctx, comp.turnpointFile ? '' : '—') +
      n(b + '/airspace', 'Airspace', ctx, comp.airspaceFile ? '' : '—');
  }

  const handlers = {
    r5SaveDetails: (d, ds) => {
      const comp = Q.competition(ds.comp);
      A.updateCompetition(comp, { name: d.name, organiser: d.organiser, country: d.country, website: d.website });
      KH.toast('Saved competition details');
    },
    r5SaveAirfield: (d, ds) => {
      const comp = Q.competition(ds.comp);
      const patch = {};
      if ('location' in d) patch.location = d.location;
      if ('timeZone' in d) patch.timeZone = d.timeZone;
      if (d.lat && d.lon) patch.airfield = { lat: Number(d.lat), lon: Number(d.lon), elev: d.elev === '' ? null : Number(d.elev) };
      A.updateCompetition(comp, patch);
      KH.toast('Saved airfield');
    },
    r5PickAirfield: (ds, el, ev) => {
      const comp = Q.competition(ds.comp);
      const [minLat, maxLat, minLon, maxLon] = ds.b.split(',').map(Number);
      const r = el.getBoundingClientRect();
      const fx = r.width ? (ev.clientX - r.left) / r.width : 0.5;
      const fy = r.height ? (ev.clientY - r.top) / r.height : 0.5;
      const lat = Math.round((maxLat - fy * (maxLat - minLat)) * 10000) / 10000;
      const lon = Math.round((minLon + fx * (maxLon - minLon)) * 10000) / 10000;
      A.updateCompetition(comp, { airfield: { lat, lon, elev: comp.airfield ? comp.airfield.elev : null } });
      KH.toast('Airfield placed at ' + lat + ', ' + lon + '. Check the elevation.');
    },
    r5SaveSheets: (d, ds) => {
      A.updateCompetition(Q.competition(ds.comp), { standingNotes: d.standingNotes, flightLevels: d.flightLevels.split(',').map((s) => s.trim()).filter(Boolean) });
      KH.toast('Saved task sheet settings');
    },
    r5LinkLogger: (d, ds) => {
      const comp = Q.competition(ds.comp);
      const c = Q.competitor(ds.competitor);
      let l = d.loggerId ? Q.logger(d.loggerId) : null;
      if (!l) {
        if (!d.manufacturer || !d.serial) throw new KH.Denied('Pick a logger or enter manufacturer and serial');
        l = A.saveLogger(comp, { manufacturer: d.manufacturer.toUpperCase(), serial: d.serial, enl: 500, mop: 500, cur: 20, minDuration: 30 });
      }
      A.addLink(l, { competitorId: c.id, from: d.from, role: d.role });
      KH.toast('Linked ' + Q.loggerLabel(l) + ' to ' + c.cid);
    },
  };

  R.mount({ id: '5a', setupRoutes, setupMenu, links, handlers });
})();
