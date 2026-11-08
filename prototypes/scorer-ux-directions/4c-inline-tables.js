// PROTOTYPE: 4C, Inline tables. Setup lists keep editing and the next empty row in the same table.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const A = KH.act;
  const S = KH.state;
  const R = KH.r4;
  const e = KH.esc;
  const L = R.links;
  const F = W.field;
  const I = W.input;
  const T = W.select;
  const drafts = new Map();
  const linkKeys = new WeakMap();
  let nextLinkKey = 0;
  let lastRowLink = '';

  function C(comp) { return '/c/' + comp.slug; }
  const links = {
    cls: (cls) => C(Q.competition(cls.competitionId)) + '/classes?edit=' + cls.id,
    competitors: (comp) => C(comp) + '/competitors',
    competitor: (c) => C(Q.competition(c.competitionId)) + '/competitors?class=' + Q.class(c.classId).slug + '&edit=' + c.id,
    logger: (l) => C(Q.competition(l.competitionId)) + '/loggers?edit=' + l.id,
    newClass: (comp) => C(comp) + '/classes?edit=new',
    newLogger: (comp) => C(comp) + '/loggers?edit=new',
  };

  function owned(html, id) {
    return html.replace(/<(input|select|textarea)\b/g, '<$1 form="' + id + '"');
  }
  function cell(label, html, wide) {
    return '<td data-label="' + e(label) + '"' + (wide ? ' class="r4c-wide"' : '') + '>' + html + '</td>';
  }
  function form(id, handler, attrs) {
    return '<form id="' + id + '" class="r4c-row-form" data-submit="' + handler + '" ' + attrs + '></form>';
  }
  function save(id, isNew, noun) {
    return '<button form="' + id + '" class="wf-btn small primary">' + (isNew ? 'Add ' + noun : 'Save') + '</button>';
  }
  function detail(html, isOpen, label, columns) {
    return '<tr class="r4c-detail"><td colspan="' + columns + '"><details' + (isOpen ? ' open' : '') + '><summary>' + label + '</summary><div class="wf-stack">' + html + '</div></details></td></tr>';
  }
  function table(headers, rows, widths) {
    return '<table class="wf-table r4c-table">' + (widths ? '<colgroup>' + widths.map((w) => '<col style="width:' + w + '%">').join('') + '</colgroup>' : '') + '<thead><tr>' + headers.map((h) => '<th scope="col">' + h + '</th>').join('') + '</tr></thead>' + rows + '</table>';
  }
  function stateClass(ctx, obj) {
    return (!obj ? 'r4c-new' : obj.deleted ? 'r4c-deleted' : '') + (ctx.query.edit === (obj ? obj.id : 'new') ? ' r4c-selected' : '');
  }
  function finish(formEl) {
    if (!formEl) return;
    formEl.dataset.saved = 'true';
    const current = document.getElementById(formEl.id);
    if (current && current.dataset) current.dataset.saved = 'true';
    drafts.delete(KH.session.role + ':' + formEl.id);
  }
  function focusNext(id) {
    if (!document.querySelector) return;
    setTimeout(() => {
      const next = document.querySelector('[form="' + id + '"]:not([type=hidden])');
      if (next) next.focus();
    }, 0);
  }

  function details(ctx) {
    const comp = ctx.comp;
    return R.page(ctx, 'Details and upload password', '<div class="wf-cols" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"><div class="wf-box">' + W.competitionDetails(comp) + '</div><div class="wf-stack"><div class="wf-box">' + W.uploadPassword(comp) + '</div><div class="wf-box fill small"><b>Organiser terms</b><br>' + e(comp.terms.version) + ' accepted by ' + e(Q.user(comp.terms.userId).name) + ' on ' + W.dt(comp.terms.at) + ' for ' + e(comp.terms.organiser) + '</div></div></div>');
  }
  function dates(ctx) {
    return R.page(ctx, 'Dates and class days', '<div class="wf-stack"><div class="wf-box"><h3>Competition dates</h3>' + W.datesEditor(ctx.comp) + '</div><div><h3>Class days</h3>' + R.matrix(ctx.comp) + '</div></div>');
  }

  function classRow(ctx, cls) {
    const id = 'r4c-class-' + (cls ? cls.id : 'new-' + ctx.comp.id);
    const draft = KH.ui.classDraft || {};
    const edition = cls ? cls.edition : draft.edition || 'DAeC SWO 2026';
    const ed = KH.EDITIONS[edition];
    const tmpl = ed.templates[draft.template] ? draft.template : Object.keys(ed.templates)[0];
    const data = cls || ed.templates[tmpl];
    if (cls && cls.deleted) return '<tbody class="r4c-deleted"><tr><td colspan="4">' + e(cls.name) + ' · deleted</td><td><button class="wf-btn small" data-act="restoreClass" data-cls="' + cls.id + '">Restore</button></td></tr></tbody>';
    const attrs = 'data-comp="' + ctx.comp.id + '" data-cls="' + (cls ? cls.id : '') + '"';
    const editionSelect = T('edition', Object.keys(KH.EDITIONS), edition, cls ? '' : 'data-change="r4cTemplate" data-key="edition"');
    const template = cls ? '<span class="muted small">Template values can be changed in row details.</span>' : F('Class template', T('template', Object.keys(ed.templates), tmpl, 'data-change="r4cTemplate" data-key="template"'));
    const row = cell('Name', form(id, 'r4cClass', attrs) + (!cls ? '<span class="r4c-new-label">New class</span>' : '') + owned(I('name', cls ? cls.name : '', 'aria-label="Class name" placeholder="' + e(tmpl) + '"'), id)) +
      cell('Rule set edition', owned(editionSelect, id)) +
      cell('Handicap scale', owned(T('handicapScale', [['', 'Not handicapped'], ['1.000', '1.000'], ['100', '100']], data.handicapScale), id)) +
      cell('Handicap list', owned(T('handicapList', [''].concat(Object.keys(KH.HANDICAP_LISTS)), data.handicapList), id)) +
      cell('Actions', '<div class="r4c-actions">' + save(id, !cls, 'class') + (cls ? '<button type="button" class="wf-btn small" data-act="r4cDeleteClass" data-cls="' + cls.id + '">Delete</button><a href="#' + links.cls(cls) + '" title="Link to this row">Row link</a><a href="#' + L.standings(cls) + '">Standings</a>' : '') + '</div>');
    const fields = '<div class="wf-form">' + template + F('Dm (km)', I('dm', data.dm, 'type="number" min="0" step="any"')) + F('D1 (km)', I('d1', data.d1, 'type="number" min="0" step="any"')) + F('Colour', I('colour', cls ? cls.colour : '', 'placeholder="#888888"')) + '</div><h3>Rule overrides</h3>' + W.ruleOverrideFields(cls ? cls.overrides : {}, ed.defaults, false) + '<p class="muted small">Empty values inherit from the rule set edition. Changing the edition or rule overrides marks affected files stale.</p>' + save(id, !cls, 'class');
    return '<tbody class="' + stateClass(ctx, cls) + '"><tr class="r4c-main">' + row + '</tr>' + detail(owned(fields, id), ctx.query.edit === (cls ? cls.id : 'new'), 'Template, rule values and overrides', 5) + '</tbody>';
  }
  function classes(ctx) {
    return R.page(ctx, 'Classes', '<p class="muted small r4c-help">Edit a row, then Save. Use the empty row to add a class; its template fills in the initial rule values and handicap list.</p>' + table(['Name', 'Rule set edition', 'Handicap scale', 'Handicap list', ''], Q.classesOf(ctx.comp.id, true).map((cls) => classRow(ctx, cls)).join('') + classRow(ctx), [18, 23, 15, 25, 19]));
  }

  function competitorRow(ctx, cls, c) {
    const id = 'r4c-competitor-' + (c ? c.id : 'new-' + cls.id);
    if (c && c.deleted) return '<tbody class="r4c-deleted"><tr><td colspan="7">' + e(c.cid) + ' · ' + e(Q.crewName(c)) + ' · deleted</td><td><button class="wf-btn small" data-act="r4cRestoreCompetitor" data-competitor="' + c.id + '">Restore</button></td></tr></tbody>';
    const crew = c ? c.crew.concat(c.crew.length < 6 ? [{}] : []) : [{}, {}];
    const crewNames = crew.map((p, i) => '<div class="r4c-crew">' + I('crew' + i + 'first', p.first, 'placeholder="First name" aria-label="Crew ' + (i + 1) + ' first name"') + I('crew' + i + 'last', p.last, 'placeholder="Last name" aria-label="Crew ' + (i + 1) + ' last name"') + '</div>').join('');
    const checkbox = (name, checked, label) => owned('<input type="checkbox" name="' + name + '" aria-label="' + label + '"' + (checked ? ' checked' : '') + '>', id);
    const row = cell('CID', form(id, 'r4cCompetitor', 'data-comp="' + ctx.comp.id + '" data-competitor="' + (c ? c.id : '') + '"') + (!c ? '<span class="r4c-new-label">New competitor</span>' : '') + owned(I('cid', c ? c.cid : '', 'required maxlength="5" aria-label="Competition ID"'), id)) +
      cell('Crew names', owned(crewNames, id), true) +
      cell('Glider type', owned(I('gliderType', c ? c.gliderType : '', 'required list="r4c-gliders-' + cls.id + '" aria-label="Glider type"'), id)) +
      cell('Registration', owned(I('registration', c ? c.registration : '', 'aria-label="Registration"'), id)) +
      cell('Handicap', owned(I('handicap', c ? c.handicap ?? '' : '', 'placeholder="From list" aria-label="Handicap"'), id)) +
      cell('Hors concours', checkbox('hc', c && c.hc, 'Hors concours')) + cell('Pure glider', checkbox('pureGlider', !c || c.pureGlider, 'Pure glider')) +
      cell('Actions', '<div class="r4c-actions">' + save(id, !c, 'competitor') + (c ? '<button type="button" class="wf-btn small" data-act="deleteCompetitor" data-competitor="' + c.id + '">Delete</button><a href="#' + links.competitor(c) + '">Row link</a>' : '') + '</div>', true);
    let extra = owned('<div class="wf-form">' + F('Class', T('classId', Q.classesOf(ctx.comp.id).map((x) => [x.id, x.name]), cls.id), { hint: c ? 'Can change only with unknown results and no resolved file.' : '' }) + F('Display name', I('displayName', c ? c.displayName : '', 'placeholder="Defaults to crew names"')) + '</div>' + crew.map((p, i) => '<div><h4>Crew ' + (i + 1) + '</h4><div class="wf-form">' + F('Club', I('crew' + i + 'club', p.club)) + F('Country', I('crew' + i + 'country', p.country)) + F('IGC Ranking ID', I('crew' + i + 'igcId', p.igcId)) + '</div></div>').join('') + '<p class="muted small">Leave crew names empty to drop a crew member. Save adds another empty crew line (up to six).</p>' + save(id, !c, 'competitor'), id);
    if (c) {
      const loggers = Q.loggersOf(ctx.comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
      const results = Q.classDaysOf(c.classId).filter(R.live).map((cd) => Q.resultFor(cd.id, c.id)).filter(Boolean);
      extra += '<div><h4>Loggers</h4>' + (loggers.length ? loggers.map((l) => '<a href="#' + links.logger(l) + '">' + e(Q.loggerLabel(l)) + '</a>').join(' · ') : '<span class="muted small">No loggers linked</span>') + ' · <a href="#' + links.newLogger(ctx.comp) + '">Add logger</a></div>' + '<div><h4>Results</h4>' + (results.length ? results.map((r) => '<a href="#' + L.result(r) + '">' + e(Q.dayLabel(c.classId, Q.classDay(r.classDayId).date)) + '</a> ' + W.resultStatus(r)).join(' · ') : '<span class="muted small">No results yet</span>') + '</div>' + W.dsqPanel(c);
    }
    return '<tbody class="' + stateClass(ctx, c) + '"><tr class="r4c-main">' + row + '</tr>' + detail(extra, ctx.query.edit === (c ? c.id : 'new'), 'Display name, crew details' + (c ? ', loggers, results and disqualification' + (c.dsq ? ' · Disqualified' : '') : ''), 8) + '</tbody>';
  }
  function competitors(ctx) {
    const classes = Q.classesOf(ctx.comp.id);
    const selected = ctx.query.class ? Q.classBySlug(ctx.comp.id, ctx.query.class) : null;
    const shown = selected && !selected.deleted ? [selected] : classes;
    const filters = '<div class="wf-row"><a class="wf-btn small' + (!selected ? ' primary' : '') + '" href="#' + C(ctx.comp) + '/competitors">All classes</a>' + classes.map((cls) => '<a class="wf-btn small' + (selected === cls ? ' primary' : '') + '" href="#' + C(ctx.comp) + '/competitors?class=' + cls.slug + '">' + e(cls.name) + ' ' + Q.competitorsOf(ctx.comp.id, cls.id).length + '</a>').join('') + '</div>';
    const body = shown.map((cls) => {
      const gliders = KH.HANDICAP_LISTS[cls.handicapList] || {};
      return '<section><div class="r4c-subhead"><h2>' + e(cls.name) + '</h2><span class="muted small">' + (cls.handicapScale ? 'Handicap scale ' + cls.handicapScale : 'Not handicapped') + '</span></div><datalist id="r4c-gliders-' + cls.id + '">' + Object.keys(gliders).map((g) => '<option value="' + e(g) + '">').join('') + '</datalist>' + table(['CID', 'Crew names', 'Glider type', 'Registration', 'Handicap', 'Hors<br>concours', 'Pure<br>glider', ''], Q.competitorsOf(ctx.comp.id, cls.id, true).map((c) => competitorRow(ctx, cls, c)).join('') + competitorRow(ctx, cls), [8, 25, 13, 11, 10, 8, 7, 18]) + '</section>';
    }).join('');
    return R.page(ctx, 'Competitors', '<p class="muted small r4c-help">Tab across a row and press Enter or Save. The empty row adds the next competitor. Changes in other rows stay here until saved.</p>' + filters + (classes.length ? body : '<div class="wf-empty"><a href="#' + links.newClass(ctx.comp) + '">Add a class</a> before entering competitors.</div>'));
  }

  function linkChips(comp, logger) {
    const choices = Q.competitorsOf(comp.id).map((c) => [c.id, c.cid + ' · ' + Q.class(c.classId).name + ' · ' + Q.crewName(c)]);
    const existing = logger.links.map((k, idx) => {
      if (!linkKeys.has(k)) linkKeys.set(k, ++nextLinkKey);
      return '<form class="r4c-chip r4c-row-form" id="r4c-link-' + logger.id + '-' + linkKeys.get(k) + '" data-submit="r4cLink" data-logger="' + logger.id + '" data-idx="' + idx + '">' + F('Competitor', T('competitorId', choices, k.competitorId)) + F('Role', T('role', ['primary', 'secondary'], k.role)) + F('From date (optional)', I('from', k.from || '', 'type="date"')) + '<button class="wf-btn small">Save link</button><button type="button" class="wf-btn small" data-act="removeLink" data-logger="' + logger.id + '" data-idx="' + idx + '">Remove</button></form>';
    }).join('');
    const add = choices.length ? '<form class="r4c-chip r4c-row-form" id="r4c-link-' + logger.id + '-new" data-submit="r4cAddLink" data-logger="' + logger.id + '">' + F('Competitor', T('competitorId', [['', 'Choose competitor']].concat(choices), '', 'required')) + F('Role', T('role', ['primary', 'secondary'], 'primary')) + F('From date (optional)', I('from', '', 'type="date"')) + '<button class="wf-btn small">Add link</button></form>' : '<p class="muted small">Add a competitor before linking this logger.</p>';
    return '<div class="r4c-link-list">' + (existing || '<span class="muted small">Not linked. Its files stay unresolved.</span>') + add + '<span class="muted small">Empty date: from the start of the competition. Only one competitor per logger on any date.</span></div>';
  }
  function loggerRow(ctx, logger) {
    const id = 'r4c-logger-' + (logger ? logger.id : 'new-' + ctx.comp.id);
    const l = logger || { manufacturer: '', serial: '', enl: 500, mop: 500, cur: 20, minDuration: 30 };
    const fixed = logger ? ' readonly title="Fixed logger identity"' : '';
    const row = cell('Manufacturer', form(id, 'r4cLogger', 'data-comp="' + ctx.comp.id + '" data-logger="' + (logger ? logger.id : '') + '"') + (!logger ? '<span class="r4c-new-label">New logger</span>' : '') + owned(I('manufacturer', l.manufacturer, 'required maxlength="3" placeholder="LXV" aria-label="Manufacturer"' + fixed), id)) +
      cell('Serial', owned(I('serial', l.serial, 'required aria-label="Serial"' + fixed), id)) +
      ['enl', 'mop', 'cur', 'minDuration'].map((key, i) => cell(['ENL threshold', 'MOP threshold', 'Current (A)', 'Duration (s)'][i], owned(I(key, l[key], 'type="number" min="0" step="any" required aria-label="' + ['ENL threshold', 'MOP threshold', 'Current threshold in amperes', 'Minimum duration in seconds'][i] + '"'), id))).join('') +
      cell('Actions', '<div class="r4c-actions">' + save(id, !logger, 'logger') + (logger ? '<a href="#' + links.logger(logger) + '">Row link</a>' : '') + '</div>', true);
    const files = logger ? S.files.filter((f) => f.loggerId === logger.id).map((f) => ({ f, res: Q.resolve(f) })) : [];
    return '<tbody class="' + stateClass(ctx, logger) + '"><tr class="r4c-main">' + row + '</tr>' + (logger ? '<tr class="r4c-detail"><td colspan="7">' + linkChips(ctx.comp, logger) + '<details' + (ctx.query.edit === logger.id ? ' open' : '') + '><summary>Files (' + files.length + ')</summary><div class="wf-table-wrap">' + W.filesTable(files) + '</div></details></td></tr>' : '<tr class="r4c-detail"><td colspan="7" class="muted small">Add the logger, then link competitors in this row.</td></tr>') + '</tbody>';
  }
  function loggers(ctx) {
    return R.page(ctx, 'Loggers', '<p class="muted small r4c-help">Save thresholds per row; changes mark this logger’s files stale. Logger identity is fixed once added. Edit dated competitor links directly below the thresholds.</p>' + table(['Manufacturer', 'Serial', 'ENL', 'MOP', 'Current (A)', 'Duration (s)', ''], Q.loggersOf(ctx.comp.id).map((l) => loggerRow(ctx, l)).join('') + loggerRow(ctx), [15, 17, 12, 12, 13, 13, 18]));
  }

  const setupRoutes = [
    { path: '/c/:comp/details', title: 'Details and upload password', render: details },
    { path: '/c/:comp/dates', title: 'Dates and class days', render: dates },
    { path: '/c/:comp/classes', title: 'Classes', render: classes },
    { path: '/c/:comp/turnpoints', title: 'Turnpoint file', render: (ctx) => R.page(ctx, 'Turnpoint file', W.turnpoints(ctx.comp)) },
    { path: '/c/:comp/airspace', title: 'Airspace file', render: (ctx) => R.page(ctx, 'Airspace file', W.airspace(ctx.comp)) },
    { path: '/c/:comp/competitors', title: 'Competitors', render: competitors },
    { path: '/c/:comp/loggers', title: 'Loggers', render: loggers },
  ].map((r) => ({ ...r, example: r.path.replace(':comp', 'oberrhein-2026') }));
  function setupMenu(ctx) {
    const b = C(ctx.comp);
    const n = R.navItem;
    return R.navSection('Setup') + n(b + '/details', 'Details and password', ctx) + n(b + '/dates', 'Dates and class days', ctx) + n(b + '/classes', 'Classes', ctx, String(Q.classesOf(ctx.comp.id).length)) + n(b + '/turnpoints', 'Turnpoints', ctx, ctx.comp.turnpointFile ? '' : '—') + n(b + '/airspace', 'Airspace', ctx, ctx.comp.airspaceFile ? '' : '—') + n(b + '/competitors', 'Competitors', ctx, String(Q.competitorsOf(ctx.comp.id).length)) + n(b + '/loggers', 'Loggers', ctx, String(Q.loggersOf(ctx.comp.id).length));
  }
  function setupCard(ctx) {
    const steps = R.setupSteps(ctx.comp);
    if (steps.every((s) => s.done)) return '';
    const paths = { details: '/details', airfield: '/details', classes: '/classes', turnpoints: '/turnpoints', airspace: '/airspace', competitors: '/competitors', loggers: '/loggers', members: '/members' };
    return '<div class="wf-box"><h3>Setup</h3><div class="wf-steps">' + steps.map((s) => '<a class="' + (s.done ? 'done' : 'todo') + '" href="#' + C(ctx.comp) + paths[s.key] + '">' + (s.done ? '✓ ' : '') + e(s.label) + '</a>').join('') + '</div>' + (ctx.comp.createdAt > '2026-07-28' ? '<p class="muted small" style="margin-top:8px">Created ' + W.dt(ctx.comp.createdAt) + '. Pilots can already upload test files with the competition password.</p>' : '') + '</div>';
  }

  const handlers = {
    r4cCompetitor(d, ds, el) {
      const existing = ds.competitor ? Q.competitor(ds.competitor) : null;
      const crew = [];
      for (let i = 0; i < 6; i++) if (d['crew' + i + 'first'] || d['crew' + i + 'last']) crew.push({ first: d['crew' + i + 'first'], last: d['crew' + i + 'last'], club: d['crew' + i + 'club'], country: d['crew' + i + 'country'], igcId: d['crew' + i + 'igcId'] });
      if (!crew.length) throw new KH.Denied('A competitor needs at least one crew member');
      const c = A.saveCompetitor(Q.competition(ds.comp), { ...d, crew }, existing);
      finish(el);
      KH.toast((existing ? 'Saved ' : 'Added ') + c.cid);
      if (!existing) focusNext('r4c-competitor-new-' + c.classId);
    },
    r4cRestoreCompetitor(ds) {
      const c = Q.competitor(ds.competitor);
      A.saveCompetitor(Q.competition(c.competitionId), { ...c, handicap: c.handicap ?? '' }, c);
      c.deleted = false;
      KH.toast('Restored ' + c.cid + '. Logger links must be added again.');
    },
    r4cClass(d, ds, el) {
      const cls = ds.cls ? Q.class(ds.cls) : null;
      const overrides = {};
      for (const key of ['startOpen', 'startClose', 'maxStartAlt', 'maxStartGs', 'pevStart', 'pevWait', 'pevWindow', 'towAltitude', 'maxAltitude', 'scoringEnd', 'earthModel', 'finishToEdge', 'deliveryPeriod']) overrides[key] = d[key] || '';
      const patch = { name: d.name || (cls ? cls.name : d.template), edition: d.edition, colour: d.colour, dm: Number(d.dm), d1: Number(d.d1), handicapScale: d.handicapScale, handicapList: d.handicapList, overrides };
      const saveClass = () => KH.run(() => {
        if (cls) A.updateClass(cls, patch);
        else {
          const added = A.createClass(Q.competition(ds.comp), { ...patch, template: d.template });
          A.updateClass(added, { overrides });
          KH.ui.classDraft = null;
        }
        finish(el);
        KH.closeModal();
        KH.toast((cls ? 'Saved ' : 'Added ') + patch.name);
        if (!cls) focusNext('r4c-class-new-' + ds.comp);
      });
      if (cls && d.edition !== cls.edition) KH.confirm({ title: 'Change the rule set edition?', intro: 'From ' + cls.edition + ' to ' + d.edition + '.', items: ['Every file of the class goes stale with the reason "rule set edition".', 'Rule overrides are validated against the new edition.'], confirmLabel: 'Change edition', onConfirm: saveClass });
      else saveClass();
    },
    r4cTemplate(v, ds, el) {
      const formEl = el.form;
      const name = formEl && formEl.elements.name.value;
      KH.ui.classDraft = { ...(KH.ui.classDraft || {}), [ds.key]: v };
      finish(formEl);
      if (formEl) {
        const key = KH.session.role + ':' + formEl.id;
        drafts.set(key, { fields: { name }, open: [] });
      }
    },
    r4cDeleteClass(ds) {
      const cls = Q.class(ds.cls);
      KH.confirm({ title: 'Delete class ' + cls.name + '?', intro: 'The class and its competitors, class days and results are hidden until restored.', confirmLabel: 'Delete class', onConfirm: () => KH.run(() => A.setClassDeleted(cls, true)) });
    },
    r4cLogger(d, ds, el) {
      const existing = ds.logger ? Q.logger(ds.logger) : null;
      if (existing) Object.assign(d, { manufacturer: existing.manufacturer, serial: existing.serial });
      const l = A.saveLogger(Q.competition(ds.comp), d, existing);
      finish(el);
      KH.toast(existing ? 'Saved thresholds' : 'Added logger ' + Q.loggerLabel(l));
      if (!existing) focusNext('r4c-logger-new-' + ds.comp);
    },
    r4cAddLink(d, ds, el) {
      const logger = Q.logger(ds.logger);
      const link = { competitorId: d.competitorId, from: d.from || '', role: d.role };
      const saveLink = () => KH.run(() => { A.addLink(logger, link); finish(el); KH.closeModal(); KH.toast('Added logger link'); });
      const moves = Q.previewLinkMove(logger, link);
      if (moves.length) KH.confirm({ title: 'Add logger link?', intro: 'These files move to another result:', items: moves.map((m) => e(m.file.name) + ': ' + e(m.from) + ' → ' + e(m.to)), confirmLabel: 'Move files', onConfirm: saveLink });
      else saveLink();
    },
    r4cLink(d, ds, el) {
      const logger = Q.logger(ds.logger);
      const idx = Number(ds.idx);
      const old = logger.links[idx];
      if (old.competitorId === d.competitorId && (old.from || '') === (d.from || '')) {
        A.setLinkRole(logger, idx, d.role);
        finish(el);
        KH.toast('Saved logger link');
        return;
      }
      const link = { competitorId: d.competitorId, from: d.from || '', role: d.role };
      KH.confirm({ title: 'Change dated logger link?', intro: 'Files can move to another result or become unresolved. A result whose scored file leaves returns to unknown. Newly resolved files must be rerun.', confirmLabel: 'Change link', onConfirm: () => KH.run(() => { A.removeLink(logger, idx); A.addLink(logger, link); finish(el); KH.closeModal(); KH.toast('Saved dated logger link'); }) });
    },
  };

  // The shell rerenders the whole page after actions. Keep unsaved rows while another row is saved.
  const render = KH.render;
  KH.render = function () {
    if (!document.querySelectorAll) return render();
    document.querySelectorAll('.r4c-row-form').forEach((el) => {
      if (el.dataset.saved) return;
      const fields = {};
      Array.from(el.elements).forEach((control) => { if (control.name) fields[control.name] = control.type === 'checkbox' ? control.checked : control.value; });
      const tbody = el.closest('tbody');
      drafts.set(KH.session.role + ':' + el.id, { fields, open: tbody ? Array.from(tbody.querySelectorAll('details')).map((d) => d.open) : [] });
    });
    render();
    document.querySelectorAll('.r4c-row-form').forEach((el) => {
      const d = drafts.get(KH.session.role + ':' + el.id);
      if (!d) return;
      Array.from(el.elements).forEach((control) => { if (Object.hasOwn(d.fields, control.name)) { if (control.type === 'checkbox') control.checked = d.fields[control.name]; else control.value = d.fields[control.name]; } });
      const tbody = el.closest('tbody');
      if (tbody && !KH.current().query.edit) tbody.querySelectorAll('details').forEach((node, i) => { if (i < d.open.length) node.open = d.open[i]; });
    });
    const current = KH.current();
    const rowLink = current.query.edit ? current.path + '?' + current.query.edit : '';
    if (rowLink && rowLink !== lastRowLink) setTimeout(() => {
      const row = document.querySelector('.r4c-selected');
      if (row) row.scrollIntoView({ block: 'start' });
    }, 0);
    lastRowLink = rowLink;
  };
  R.mount({ id: '4c', setupRoutes, setupMenu, setupCard, links, handlers });
})();
