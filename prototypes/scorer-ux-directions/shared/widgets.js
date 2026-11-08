// PROTOTYPE: leaf widgets and their action handlers, shared by every direction.
// Directions decide the page inventory, navigation and layout. These are the forms and tables inside.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const A = KH.act;
  const S = KH.state;
  const e = KH.esc;
  const W = (KH.w = {});
  const H = KH.handlers;
  const L = () => KH.app.links;

  // ---------- formatting ----------

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  W.date = (iso, withYear) => {
    if (!iso) return '';
    const d = new Date(iso.slice(0, 10) + 'T12:00:00Z');
    return DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + (withYear ? ' ' + d.getUTCFullYear() : '');
  };
  W.dt = (iso) => (iso ? W.date(iso) + ' ' + iso.slice(11, 16) : '');
  W.km = (v) => (v == null || v === '' ? '' : Number(v).toFixed(1) + ' km');
  W.kmh = (v) => (v == null || v === '' ? '' : Number(v).toFixed(1) + ' km/h');
  W.dayTitle = (cd, cls) => {
    const c = cls || Q.class(cd.classId);
    return c.name + ' · ' + Q.dayLabel(c.id, cd.date) + ' · ' + W.date(cd.date);
  };

  // ---------- badges ----------

  W.dayBadge = (status) => {
    const cls = { unplanned: 'none', 'task published': 'dashed', preliminary: 'soft', unofficial: '', final: 'solid', cancelled: 'none dashed' }[status] || '';
    return '<span class="wf-badge ' + cls + '">' + e(status) + '</span>';
  };
  W.reviewBadge = (r) => (r.checkReasons.length ? '<span class="wf-badge solid">Check · ' + r.checkReasons.length + '</span>' : '<span class="wf-badge">OK</span>');
  W.resultStatus = (r) => '<span class="wf-badge ' + (r.status === 'unknown' ? 'dashed' : r.status === 'did not fly' ? 'none' : 'soft') + '">' + e(r.status) + '</span>';
  W.staleBadge = (f) => (f && f.analysis.stale.length ? '<span class="wf-badge dashed" title="' + e(f.analysis.stale.map((s) => s.reason).join(', ')) + '">stale: ' + e(f.analysis.stale.map((s) => s.reason).join(', ')) + '</span>' : '');
  W.level = (lvl) => '<span class="lvl ' + lvl + '">' + lvl + '</span>';
  W.roleNote = (comp) => {
    const role = Q.roleIn(comp);
    return role === 'scorer' ? '<span class="lock">Admin only</span>' : '';
  };
  W.unpublished = (cd) => (cd.reasons.length ? '<span class="wf-badge dashed" title="Unpublished changes">unpublished: ' + e(cd.reasons.join(', ')) + '</span>' : '');

  function field(label, input, opts) {
    return '<label class="wf-field' + (opts && opts.full ? ' full' : '') + (opts && opts.inline ? ' inline' : '') + '">' + (opts && opts.inline ? input + ' ' + label : label + input) + (opts && opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') + '</label>';
  }
  W.field = field;
  function input(name, value, attrs) {
    return '<input name="' + name + '" value="' + e(value ?? '') + '" ' + (attrs || '') + '>';
  }
  function select(name, options, value, attrs) {
    return '<select name="' + name + '" ' + (attrs || '') + '>' + options.map((o) => {
      const [v, label] = Array.isArray(o) ? o : [o, o];
      return '<option value="' + e(v) + '"' + (String(v) === String(value ?? '') ? ' selected' : '') + '>' + e(label) + '</option>';
    }).join('') + '</select>';
  }
  W.input = input;
  W.select = select;

  // ---------- competition ----------

  W.createCompetitionForm = (next) =>
    '<form class="wf-stack" data-submit="createCompetition" data-next="' + e(next || '') + '"><div class="wf-form">' +
    field('Name', input('name', '', 'required placeholder="Albtrauf Summer Contest 2027"')) +
    field('Slug', input('slug', '', 'required pattern="[a-z0-9-]{3,60}" placeholder="albtrauf-summer-2027"'), { hint: 'Lowercase, 3 to 60 characters. Fixed once created.' }) +
    field('Organising club or person', input('organiser', '', 'required')) +
    field('Location', input('location', '', 'required placeholder="Airfield name"')) +
    field('Country', select('country', ['DE', 'AT', 'CH', 'FR', 'NL', 'BE', 'CZ', 'PL'], 'DE')) +
    field('Time zone', select('timeZone', ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Paris', 'Europe/Amsterdam', 'Europe/Prague'], 'Europe/Berlin'), { hint: 'Fixed once the competition has a class day or IGC file.' }) +
    field('First date', input('first', '2027-06-05', 'type="date" required')) +
    field('Last date', input('last', '2027-06-13', 'type="date" required'), { hint: 'You can leave single dates out afterwards.' }) +
    field('Website', input('website', '', 'placeholder="https://"')) +
    '</div>' +
    field('I may act for this organiser and accept the <a href="#" onclick="return false">organiser terms</a> (organiser-terms-2026-11) on its behalf.', '<input type="checkbox" name="terms" required>', { inline: true }) +
    '<div class="wf-row"><button class="wf-btn primary">Create competition</button><span class="muted small">Staff get an email about every new competition. It is public right away.</span></div></form>';

  H.createCompetition = (d, ds) => {
    if (!d.terms) throw new KH.Denied('Accept the organiser terms first');
    if (Q.competitionBySlug(d.slug)) throw new KH.Denied('The slug ' + d.slug + ' is taken');
    const comp = A.createCompetition(d);
    KH.toast('Created ' + comp.name + '. You are its admin.');
    KH.go(L().competition(comp));
  };

  W.competitionDetails = (comp) => {
    const admin = Q.can('admin-fields', comp);
    const ro = admin ? '' : 'disabled';
    const lock = admin ? '' : ' <span class="lock">· admin only</span>';
    return '<form class="wf-stack" data-submit="saveCompetition" data-comp="' + comp.id + '">' +
      '<h4>Identity' + lock + '</h4><div class="wf-form">' +
      field('Name', input('name', comp.name, ro)) +
      field('Slug', input('slug', comp.slug, 'disabled'), { hint: 'Fixed at creation' }) +
      field('Organising club or person', input('organiser', comp.organiser, ro)) +
      field('Location', input('location', comp.location, ro)) +
      field('Country', input('country', comp.country, ro)) +
      field('Website', input('website', comp.website, ro)) +
      '</div><h4>Airfield and time</h4><div class="wf-form">' +
      field('Airfield latitude', input('lat', comp.airfield ? comp.airfield.lat : '', 'placeholder="48.1214"')) +
      field('Airfield longitude', input('lon', comp.airfield ? comp.airfield.lon : '', 'placeholder="7.8309"')) +
      field('Elevation (m MSL)', input('elev', comp.airfield ? comp.airfield.elev : '', 'placeholder="210"'), { hint: comp.airfield ? 'A change marks every file of the competition stale' : 'Needed before analysis' }) +
      field('Time zone', input('timeZone', comp.timeZone, Q.classesOf(comp.id).some((c) => Q.classDaysOf(c.id).length) || Q.filesOf(comp.id).length ? 'disabled' : ''), { hint: 'Fixed once the competition has a class day or IGC file' }) +
      '</div><h4>Task sheet</h4><div class="wf-form">' +
      field('Standing notes', '<textarea name="standingNotes">' + e(comp.standingNotes) + '</textarea>', { full: true, hint: 'Printed on every task sheet' }) +
      field('Flight levels listed on task sheets', input('flightLevels', comp.flightLevels.join(', '), 'placeholder="FL 65, FL 95"'), { full: true, hint: 'Printed converted to m MSL with the class day QNH' }) +
      '</div><div class="wf-row"><button class="wf-btn primary">Save</button></div></form>';
  };
  H.saveCompetition = (d, ds) => {
    const comp = Q.competition(ds.comp);
    const patch = { standingNotes: d.standingNotes, flightLevels: d.flightLevels.split(',').map((s) => s.trim()).filter(Boolean) };
    for (const k of ['name', 'organiser', 'location', 'country', 'website']) if (k in d) patch[k] = d[k];
    if ('timeZone' in d) patch.timeZone = d.timeZone;
    if (d.lat && d.lon) patch.airfield = { lat: Number(d.lat), lon: Number(d.lon), elev: Number(d.elev || 0) };
    A.updateCompetition(comp, patch);
    KH.toast('Saved competition details');
  };

  W.uploadPassword = (comp) =>
    '<div class="wf-stack"><div class="wf-row"><span class="muted">Upload password</span><code style="font-size:18px;letter-spacing:.1em">' + e(comp.uploadPassword || '—') + '</code>' +
    (comp.lifecycle === 'live' ? '<button class="wf-btn small" data-act="regeneratePassword" data-comp="' + comp.id + '">Regenerate</button>' : '') + '</div>' +
    (comp.lifecycle === 'live'
      ? '<form class="wf-row" data-submit="setPassword" data-comp="' + comp.id + '">' + input('password', '', 'placeholder="Custom value" minlength="4" pattern="[A-Za-z0-9]{4,}" class="mid"') + '<button class="wf-btn small">Set</button></form>' +
        '<p class="muted small">Pilots enter it to upload flights. It works from creation until archiving, the old value stops working at once, and every task sheet prints the current value.</p>'
      : '') + '</div>';
  H.regeneratePassword = (ds) => {
    A.regeneratePassword(Q.competition(ds.comp));
    KH.toast('New upload password. The old one stopped working.');
  };
  H.setPassword = (d, ds) => {
    A.updateCompetition(Q.competition(ds.comp), { uploadPassword: d.password.toUpperCase() });
    KH.toast('Upload password changed');
  };

  W.datesEditor = (comp) => {
    const admin = Q.can('admin-fields', comp);
    if (!comp.dates.length) return '<p class="muted">No dates</p>';
    const first = comp.dates[0];
    const last = comp.dates[comp.dates.length - 1];
    const all = KH.util.dateRange(first, last);
    return '<div class="wf-stack"><div class="wf-row">' +
      all.map((d) => {
        const on = comp.dates.includes(d);
        return '<button class="wf-btn small' + (on ? ' primary' : '') + '" ' + (admin ? 'data-act="toggleDate" data-comp="' + comp.id + '" data-date="' + d + '"' : 'disabled') + ' title="' + (on ? 'Competition date' : 'Left out') + '">' + W.date(d) + '</button>';
      }).join('') + '</div>' +
      (admin
        ? '<form class="wf-row" data-submit="extendDates" data-comp="' + comp.id + '">' + field('First date', input('first', first, 'type="date"')) + field('Last date', input('last', last, 'type="date"')) + '<button class="wf-btn small">Change range</button></form><p class="muted small">Leaving a date out only hides its class days until the date is restored.</p>'
        : '<p class="muted small">Competition dates are admin only.</p>') + '</div>';
  };
  H.toggleDate = (ds) => {
    const comp = Q.competition(ds.comp);
    const has = comp.dates.includes(ds.date);
    if (!has) return A.setDates(comp, comp.dates.concat([ds.date]));
    const published = Q.classesOf(comp.id).map((c) => Q.classDayOn(c.id, ds.date)).filter((cd) => cd && cd.published);
    KH.confirm({
      title: 'Remove ' + W.date(ds.date, true) + ' from the competition dates?',
      intro: 'Nothing stored changes. Class days, results and files stay, and adding the date back restores them.' + (published.length ? ' These class days on that date are published:' : ''),
      items: published.map((cd) => e(W.dayTitle(cd)) + ' (' + cd.published.status + ')'),
      confirmLabel: 'Remove date',
      onConfirm: () => KH.run(() => A.setDates(comp, comp.dates.filter((d) => d !== ds.date))),
    });
  };
  H.extendDates = (d, ds) => {
    const comp = Q.competition(ds.comp);
    const range = KH.util.dateRange(d.first, d.last);
    const kept = comp.dates.filter((x) => range.includes(x));
    const added = range.filter((x) => x < comp.dates[0] || x > comp.dates[comp.dates.length - 1]);
    A.setDates(comp, kept.concat(added));
  };

  // Class day grid: every competition date by class. A class day exists once someone touches its cell.
  W.classDayGrid = (comp, opts) => {
    const classes = Q.classesOf(comp.id);
    if (!classes.length) return '<div class="wf-empty">No classes yet</div>';
    const dates = comp.dates;
    return '<div class="wf-table-wrap"><table class="wf-grid-cal"><thead><tr><th class="rowhead">Class</th>' +
      dates.map((d) => '<th>' + W.date(d) + '</th>').join('') + '</tr></thead><tbody>' +
      classes.map((cls) => '<tr><th class="rowhead">' + e(cls.name) + '</th>' + dates.map((d) => {
        const cd = Q.classDayOn(cls.id, d);
        const label = Q.dayLabel(cls.id, d);
        const today = d === KH.TODAY ? ' today' : '';
        if (!cd) return '<td class="untouched' + today + '"><a href="#' + L().classDayDate(cls, d) + '">' + e(label) + '<span class="st">untouched</span></a></td>';
        const c = Q.dayCounts(cd);
        const extra = cd.status === 'cancelled' || cd.status === 'unplanned' ? '' : (c.check ? c.check + ' check' : '') + (c.stale ? ' · ' + c.stale + ' stale' : '');
        return '<td class="' + today + '"><a href="#' + L().classDay(cd) + '">' + e(label) + (Q.task(cd) ? ' · ' + e(Q.task(cd).letter) : '') + '<span class="st">' + W.dayBadge(cd.status) + '</span>' +
          (extra ? '<span class="st muted">' + extra + '</span>' : '') + (cd.reasons.length ? '<span class="st muted">unpublished</span>' : '') + (Q.deadlinePassed(cd) ? '<span class="st">deadline passed</span>' : '') + '</a></td>';
      }).join('') + '</tr>').join('') + '</tbody></table></div>';
  };

  // ---------- turnpoints and airspace ----------

  W.turnpoints = (comp) => {
    const f = comp.turnpointFile;
    const hasTasks = S.taskCandidates.some((t) => { const cd = Q.classDay(t.classDayId); return cd && Q.class(cd.classId).competitionId === comp.id; });
    return '<div class="wf-stack"><div class="wf-row between"><div>' + (f ? '<b>' + e(f.name) + '</b> <span class="muted">uploaded ' + W.dt(f.uploadedAt) + ', ' + f.turnpoints.length + ' turnpoints</span>' : '<span class="muted">No turnpoint file yet</span>') + '</div>' +
      '<div class="wf-row">' + (f ? '<button class="wf-btn small" data-act="fakeDownload" data-what="' + e(f.name) + '">Download original</button>' : '') +
      '<button class="wf-btn' + (f ? '' : ' primary') + '" data-act="uploadTurnpoints" data-comp="' + comp.id + '">' + (f ? 'Replace file…' : 'Upload CUP file…') + '</button></div></div>' +
      (f && hasTasks ? '<p class="muted small">Task points keep copies of their coordinates. A replacement never moves them, and the task view flags points that no longer match.</p>' : '') +
      (f ? '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Code</th><th>Name</th><th class="num">Latitude</th><th class="num">Longitude</th><th class="num">Elevation</th></tr></thead><tbody>' +
        f.turnpoints.map((t) => '<tr><td>' + t.code + '</td><td>' + e(t.name) + '</td><td class="num">' + t.lat.toFixed(4) + '</td><td class="num">' + t.lon.toFixed(4) + '</td><td class="num">' + t.elev + ' m</td></tr>').join('') + '</tbody></table></div>' : '') + '</div>';
  };
  H.uploadTurnpoints = (ds) => {
    const comp = Q.competition(ds.comp);
    const hasTasks = S.taskCandidates.some((t) => { const cd = Q.classDay(t.classDayId); return cd && Q.class(cd.classId).competitionId === comp.id; });
    const doIt = () => KH.run(() => { A.uploadTurnpointFile(comp); KH.toast('Turnpoint file uploaded'); });
    if (hasTasks) KH.confirm({ title: 'Replace the turnpoint file?', intro: 'Tasks already exist.', items: ['Task points keep their copied coordinates and elevation.', 'Points whose name or position no longer matches the file are flagged in the task editor.'], confirmLabel: 'Replace', onConfirm: doIt });
    else doIt();
  };

  W.airspace = (comp, cd) => {
    const f = comp.airspaceFile;
    const hasTasks = S.taskCandidates.some((t) => { const x = Q.classDay(t.classDayId); return x && Q.class(x.classId).competitionId === comp.id; });
    return '<div class="wf-stack"><div class="wf-row between"><div>' + (f ? '<b>' + e(f.name) + '</b> <span class="muted">uploaded ' + W.dt(f.uploadedAt) + ', ' + f.airspaces.length + ' airspaces</span>' : '<span class="muted">No airspace file yet</span>') + '</div>' +
      '<div class="wf-row">' + (f ? '<button class="wf-btn small" data-act="fakeDownload" data-what="' + e(f.name) + '">Download original</button>' : '') +
      '<button class="wf-btn' + (f ? '' : ' primary') + '" data-act="uploadAirspace" data-comp="' + comp.id + '">' + (f ? 'Replace file…' : 'Upload airspace file…') + '</button></div></div>' +
      (f ? '<p class="muted small">Every airspace is closed unless the competition opens its name here or a class day opens it with an airspace exception.' + (hasTasks ? ' Changing this once a task exists needs a confirmation and marks no file stale.' : '') + '</p>' +
        '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Name</th><th>Category</th><th>Lower</th><th>Upper</th><th>Competition</th></tr></thead><tbody>' +
        comp.openedAirspaceNames.filter((n) => !f.airspaces.some((a) => a.name === n)).map((n) => '<tr><td>' + e(n) + '</td><td colspan="3"><span class="wf-badge dashed">not in the current file</span></td><td><label class="wf-field inline"><input type="checkbox" checked data-change="toggleOpened" data-comp="' + comp.id + '" data-name="' + e(n) + '"> opened</label></td></tr>').join('') +
        f.airspaces.map((a) => {
          const open = comp.openedAirspaceNames.includes(a.name);
          return '<tr><td>' + e(a.name) + '</td><td>' + a.category + '</td><td>' + a.lower + '</td><td>' + a.upper + '</td><td><label class="wf-field inline"><input type="checkbox" ' + (open ? 'checked' : '') + ' data-change="toggleOpened" data-comp="' + comp.id + '" data-name="' + e(a.name) + '"> opened</label></td></tr>';
        }).join('') + '</tbody></table></div>' : '') + '</div>';
  };
  function hasTasks(comp) {
    return S.taskCandidates.some((t) => { const x = Q.classDay(t.classDayId); return x && Q.class(x.classId).competitionId === comp.id; });
  }
  const NO_STALE = 'Existing analyses keep the old airspace until each file is rerun. Nothing is marked stale.';
  H.uploadAirspace = (ds) => {
    const comp = Q.competition(ds.comp);
    const doIt = () => KH.run(() => {
      const before = comp.airspaceFile ? comp.airspaceFile.airspaces.map((a) => a.name) : [];
      A.uploadAirspaceFile(comp);
      const after = comp.airspaceFile.airspaces.map((a) => a.name);
      const gone = before.filter((n) => !after.includes(n));
      KH.toast('Airspace file uploaded' + (gone.length ? '. Missing names: ' + gone.join(', ') : '. Opened names and exceptions carry over by name.'));
    });
    if (!comp.airspaceFile || !hasTasks(comp)) return doIt();
    // Prototype: the replacement file is fixed, so the dialog can name what it drops.
    const gone = comp.id === 'k2' ? ['RMZ HOHENFELS', 'ED-R 132'] : [];
    const refs = (n) => (comp.openedAirspaceNames.includes(n) ? 'opened by the competition' : '') + S.classDays.filter((cd) => cd.airspaceExceptions.some((x) => x.name === n)).map((cd) => ', exception on ' + W.dayTitle(cd)).join('');
    KH.confirm({
      title: 'Replace the airspace file?', intro: 'Tasks already exist. Opened names and airspace exceptions carry over by name.',
      items: gone.map((n) => '<b>' + e(n) + '</b> is not in the new file' + (refs(n) ? ' but is ' + e(refs(n).replace(/^, /, '')) + '. It stays listed and flagged.' : '')).concat([NO_STALE]),
      confirmLabel: 'Replace file', onConfirm: doIt,
    });
  };
  H.toggleOpened = (v, ds) => {
    const comp = Q.competition(ds.comp);
    const doIt = () => KH.run(() => { A.toggleOpened(comp, ds.name); KH.toast(ds.name + (v ? ' opened' : ' closed') + ' for the competition'); });
    if (!hasTasks(comp)) return doIt();
    KH.confirm({ title: (v ? 'Open ' : 'Close ') + ds.name + ' for the competition?', intro: 'Tasks already exist and pilots were briefed on the current airspace.', items: [NO_STALE], confirmLabel: v ? 'Open' : 'Close', onConfirm: doIt });
  };
  H.fakeDownload = (ds) => KH.toast('Prototype: would download ' + ds.what);

  // ---------- rule overrides ----------
  // Class and class day share one field set. Empty fields inherit from the layer above.

  const OV_KEYS = ['startOpen', 'startClose', 'maxStartAlt', 'maxStartGs', 'pevStart', 'pevWait', 'pevWindow', 'towAltitude', 'maxAltitude', 'scoringEnd', 'earthModel', 'finishToEdge', 'deliveryPeriod'];
  const DAY_KEYS = ['dm', 'd1', 'startLine', 'tpZone', 'aatZone', 'finishZone'];
  function ruleOverrideFields(o, inh, dayLayer) {
    const shown = (v) => (v === '' || v == null ? 'none' : v === true ? 'yes' : String(v));
    const txt = (k, label, cls, hint) => field(label, input(k, o[k], 'placeholder="' + e(shown(inh[k])) + '" class="' + (cls || 'mid') + '"'), { hint });
    const sel = (k, label, opts, hint) => field(label, select(k, [['', 'Inherit (' + shown(inh[k]) + ')']].concat(opts), o[k]), { hint });
    const zones = Object.keys(KH.ZONES);
    return '<h4>Start procedure</h4><div class="wf-form">' +
      txt('startOpen', 'Start opening time', 'mid', 'hh:mm') + txt('startClose', 'Start closing time', 'mid', 'hh:mm') +
      txt('maxStartAlt', 'Maximum start altitude (m MSL)') + txt('maxStartGs', 'Maximum start ground speed (km/h)') +
      sel('pevStart', 'PEV start', [['yes', 'Yes'], ['no', 'No']]) + txt('pevWait', 'PEV wait time (min)', 'narrow') + txt('pevWindow', 'PEV start window (min)', 'narrow') +
      '</div><h4>Limits</h4><div class="wf-form">' +
      txt('towAltitude', 'Tow altitude (m MSL)') + txt('maxAltitude', 'Maximum altitude', 'mid', 'm MSL or a flight level') + txt('scoringEnd', 'Scoring end time', 'mid', 'hh:mm, empty means none') +
      '</div><h4>Scoring</h4><div class="wf-form">' +
      sel('earthModel', 'Earth model', ['WGS84', 'FAI Sphere']) + sel('finishToEdge', 'Finish distance to cylinder edge', [['yes', 'Yes'], ['no', 'No, to the centre']]) +
      txt('deliveryPeriod', 'Delivery period (min)', 'narrow') +
      (dayLayer ? txt('dm', 'Dm (km)', 'narrow') + txt('d1', 'D1 (km)', 'narrow') : '') +
      '</div>' + (dayLayer ? '<h4>Task entry defaults</h4><div class="wf-form">' +
        txt('startLine', 'Start line length (km)', 'narrow') + sel('tpZone', 'Turnpoint zone', zones) + sel('aatZone', 'Assigned area zone', zones) + sel('finishZone', 'Finish zone', zones) +
        '</div><p class="muted small">Defaults only prefill new task points. They never change existing tasks.</p>' : '');
  }
  function overridesFrom(d, dayLayer) {
    const out = {};
    for (const k of OV_KEYS.concat(dayLayer ? DAY_KEYS : [])) out[k] = d[k] || '';
    return out;
  }
  W.ruleOverrideFields = ruleOverrideFields;

  // ---------- classes ----------

  W.classForm = (comp, cls) => {
    const draft = KH.ui.classDraft || {};
    const edition = cls ? cls.edition : draft.edition || 'DAeC SWO 2026';
    const ed = KH.EDITIONS[edition];
    const tmpl = cls ? null : ed.templates[draft.template] ? draft.template : Object.keys(ed.templates)[0];
    const t = cls ? cls : { ...ed.templates[tmpl], name: '' };
    const o = cls ? cls.overrides : {};
    const departures = [];
    if (cls) {
      const tt = Object.values(ed.templates).find((x) => x.dm === cls.dm && x.d1 === cls.d1);
      if (!tt) departures.push('Dm or D1 differ from every class template of ' + edition);
      if (o.earthModel && o.earthModel !== ed.defaults.earthModel) departures.push('Earth model ' + o.earthModel + ' differs from the edition default ' + ed.defaults.earthModel);
    }
    return '<form class="wf-stack" data-submit="' + (cls ? 'saveClass' : 'createClass') + '" data-comp="' + comp.id + '" data-cls="' + (cls ? cls.id : '') + '">' +
      '<div class="wf-form">' +
      field('Rule set edition', select('edition', Object.keys(KH.EDITIONS), edition, cls ? '' : 'data-change="classDraft" data-key="edition"'), { hint: cls ? 'Changing it marks this class\'s files stale' : 'Pick first' }) +
      (cls ? '' : field('Class template', select('template', Object.keys(ed.templates), tmpl, 'data-change="classDraft" data-key="template"'), { hint: 'Fills in the values below once. The class keeps no link to it.' })) +
      field('Name', input('name', cls ? cls.name : '', cls ? '' : 'placeholder="' + e(tmpl) + '"')) +
      field('Colour', input('colour', cls ? cls.colour : '', 'placeholder="#888888"')) +
      field('Dm (km)', input('dm', t.dm, 'class="narrow"')) +
      field('D1 (km)', input('d1', t.d1, 'class="narrow"')) +
      field('Handicap scale', select('handicapScale', [['', 'Not handicapped'], ['1.000', '1.000'], ['100', '100']], t.handicapScale)) +
      field('Handicap list', select('handicapList', [''].concat(Object.keys(KH.HANDICAP_LISTS)), t.handicapList), { hint: 'Prefills new competitors' }) +
      '</div><h3>Rule overrides for the class</h3>' + ruleOverrideFields(o, ed.defaults, false) +
      (departures.length ? '<div class="wf-note warn">Departs from the rule set: ' + departures.map(e).join('. ') + '</div>' : '') +
      '<div class="wf-row"><button class="wf-btn primary">' + (cls ? 'Save class' : 'Add class') + '</button>' +
      (cls ? '<button type="button" class="wf-btn danger" data-act="deleteClass" data-cls="' + cls.id + '">Delete class</button>' : '') + '</div></form>';
  };
  H.classDraft = (v, ds) => {
    KH.ui.classDraft = { ...(KH.ui.classDraft || {}), [ds.key]: v };
  };
  function classPatch(d) {
    return { name: d.name, colour: d.colour, dm: Number(d.dm), d1: Number(d.d1), handicapScale: d.handicapScale, handicapList: d.handicapList, edition: d.edition, overrides: overridesFrom(d, false) };
  }
  H.createClass = (d, ds) => {
    const comp = Q.competition(ds.comp);
    const cls = A.createClass(comp, { ...classPatch(d), template: d.template, name: d.name || d.template });
    cls.overrides = classPatch(d).overrides;
    KH.ui.classDraft = null;
    KH.toast('Added class ' + cls.name);
    KH.go(L().cls(cls));
  };
  H.saveClass = (d, ds) => {
    const cls = Q.class(ds.cls);
    const patch = classPatch(d);
    const save = () => KH.run(() => { A.updateClass(cls, patch); KH.toast('Saved class ' + cls.name); });
    if (patch.edition !== cls.edition) KH.confirm({ title: 'Change the rule set edition?', intro: 'From ' + cls.edition + ' to ' + patch.edition + '.', items: ['Every file of the class goes stale with the reason "rule set edition".', 'Rule overrides are validated against the new edition.'], confirmLabel: 'Change edition', onConfirm: save });
    else save();
  };
  H.deleteClass = (ds) => {
    const cls = Q.class(ds.cls);
    const published = Q.classDaysOf(cls.id).filter((cd) => cd.published);
    KH.confirm({
      title: 'Delete class ' + cls.name + '?', intro: 'Deleting hides the class with everything in it until it is restored. Nothing is removed.',
      items: [Q.competitorsOf(cls.competitionId, cls.id).length + ' competitors are hidden with it']
        .concat(published.length ? ['Published class days stay public until restored or republished: ' + published.map((cd) => e(Q.dayLabel(cls.id, cd.date))).join(', ')] : []),
      confirmLabel: 'Delete class', onConfirm: () => KH.run(() => { A.setClassDeleted(cls, true); KH.go(L().competition(Q.competition(cls.competitionId))); }),
    });
  };
  H.restoreClass = (ds) => {
    const cls = Q.class(ds.cls);
    KH.confirm({ title: 'Restore class ' + cls.name + '?', intro: 'The class comes back with its competitors, class days and results.', confirmLabel: 'Restore', onConfirm: () => KH.run(() => A.setClassDeleted(cls, false)) });
  };

  // ---------- class day ----------

  W.untouchedDay = (cls, date) =>
    '<div class="wf-empty"><p><b>' + e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, date)) + ' · ' + W.date(date, true) + '</b></p><p>Nobody has touched this date yet. It shows as unplanned in public.</p>' +
    '<div class="wf-row" style="justify-content:center"><button class="wf-btn primary" data-act="touchDay" data-cls="' + cls.id + '" data-date="' + date + '" data-then="task">Add task candidate</button>' +
    '<button class="wf-btn" data-act="touchDay" data-cls="' + cls.id + '" data-date="' + date + '" data-then="practice">Mark as practice day</button>' +
    '<button class="wf-btn" data-act="touchDay" data-cls="' + cls.id + '" data-date="' + date + '" data-then="cancel">Cancel day</button></div></div>';
  H.touchDay = (ds) => {
    const cls = Q.class(ds.cls);
    const cd = A.touchClassDay(cls, ds.date);
    if (ds.then === 'practice') A.setPractice(cd, true);
    if (ds.then === 'cancel') {
      A.setDayStatus(cd, 'cancelled');
      A.publishClassDay(cd);
      KH.toast('Cancelled and published');
    }
    if (ds.then === 'task') {
      const cand = A.createCandidate(cd);
      KH.go(L().candidate(cand));
      return;
    }
    KH.go(L().classDay(cd));
  };

  W.dayOverrides = (cd) => {
    const cls = Q.class(cd.classId);
    const inh = { ...KH.effective(null, cls), dm: cls.dm, d1: cls.d1 };
    return '<form class="wf-stack" data-submit="saveDayOverrides" data-cd="' + cd.id + '">' +
      '<div class="wf-form">' +
      field('QNH (hPa)', input('qnh', cd.qnh, 'class="narrow"')) +
      field('Practice day', select('practice', [['no', 'No'], ['yes', 'Yes']], cd.practice ? 'yes' : 'no', cd.published ? 'disabled' : ''), { hint: cd.published ? 'Fixed since the first publish' : 'Excluded from overall results. Fixed after the first publish.' }) +
      '</div>' + ruleOverrideFields(cd.overrides, inh, true) +
      '<div class="wf-row"><button class="wf-btn primary">Save class day settings</button><span class="muted small">Changed analysis inputs mark this class day\'s files stale.</span></div></form>';
  };
  H.saveDayOverrides = (d, ds) => {
    const cd = Q.classDay(ds.cd);
    const patch = { qnh: Number(d.qnh), overrides: overridesFrom(d, true) };
    if (d.practice) patch.practice = d.practice === 'yes';
    A.updateClassDay(cd, patch);
    KH.toast('Saved');
  };

  W.dayAirspace = (cd) => {
    const cls = Q.class(cd.classId);
    const comp = Q.competition(cls.competitionId);
    const names = comp.airspaceFile ? comp.airspaceFile.airspaces.map((a) => a.name) : [];
    const state = (n) => {
      const ex = cd.airspaceExceptions.find((x) => x.name === n);
      if (ex) return ex.direction === 'open' ? 'opened by exception' : 'closed by exception';
      return comp.openedAirspaceNames.includes(n) ? 'opened (competition)' : 'closed';
    };
    return '<div class="wf-stack"><h4>Airspace exceptions</h4>' +
      (cd.airspaceExceptions.length ? '<table class="wf-table"><tbody>' + cd.airspaceExceptions.map((x, i) => '<tr><td>' + e(x.name) + '</td><td>' + x.direction + ' for the whole day' + (names.includes(x.name) ? '' : ' <span class="wf-badge dashed">name not in file</span>') + '</td><td class="right"><button class="wf-btn small" data-act="removeException" data-cd="' + cd.id + '" data-idx="' + i + '">Remove</button></td></tr>').join('') + '</tbody></table>' : '<p class="muted small">None. The competition settings apply.</p>') +
      (names.length ? '<form class="wf-row" data-submit="addException" data-cd="' + cd.id + '">' + select('name', names.map((n) => [n, n + ' — ' + state(n)])) + select('direction', [['open', 'Open'], ['close', 'Close']]) + '<button class="wf-btn small">Add exception</button></form>' : '<p class="muted small">Upload an airspace file first.</p>') +
      '<h4>NOTAM airspaces</h4>' + (cd.notamAirspaces.length ? '<ul>' + cd.notamAirspaces.map((n) => '<li>' + e(n.name) + ' <span class="muted">' + n.lower + '–' + n.upper + ', from ' + e(n.file) + ', always closed</span></li>').join('') + '</ul>' : '<p class="muted small">None</p>') +
      '<button class="wf-btn small" data-act="addNotam" data-cd="' + cd.id + '">Upload NOTAM airspace file…</button></div>';
  };
  H.addException = (d, ds) => A.addAirspaceException(Q.classDay(ds.cd), d.name, d.direction);
  H.removeException = (ds) => A.removeAirspaceException(Q.classDay(ds.cd), Number(ds.idx));
  H.addNotam = (ds) => {
    A.addNotam(Q.classDay(ds.cd));
    KH.toast('NOTAM airspace added. Files of this class day are stale.');
  };

  // ---------- publishing ----------

  W.publishPanel = (cd, opts) => {
    const pub = cd.published;
    const cls = Q.class(cd.classId);
    const comp = Q.competition(cls.competitionId);
    const ed = KH.EDITIONS[cls.edition];
    const lastDay = comp.dates[comp.dates.length - 1] === cd.date;
    const hours = cls.edition.startsWith('FAI') && lastDay ? 2 : ed.defaults.complaintHours;
    const nowMs = new Date(KH.NOW + ':00Z').getTime() + hours * 3600000;
    const deadline = new Date(nowMs).toISOString().slice(0, 16);
    const c = Q.dayCounts(cd);
    const canPublish = !comp.blocked && comp.lifecycle === 'live';
    return '<div class="wf-stack">' +
      '<div class="wf-kv"><span>Published</span><span>' + (pub ? W.dayBadge(pub.status) + ' ' + W.dt(pub.at) + (pub.complaintDeadline ? ', complaint deadline ' + W.dt(pub.complaintDeadline) : '') : 'never') + '</span>' +
      '<span>Working status</span><span>' + W.dayBadge(cd.status) + (Q.deadlinePassed(cd) ? ' <span class="wf-badge">deadline passed</span>' : '') + '</span>' +
      '<span>Unpublished changes</span><span>' + (cd.reasons.length ? e(cd.reasons.join(', ')) : 'none') + '</span>' +
      '<span>Results</span><span>' + c.ok + ' OK, ' + c.check + ' in check, ' + c.unknown + ' unknown, ' + c.stale + ' stale files</span></div>' +
      '<form class="wf-stack" data-submit="publishDay" data-cd="' + cd.id + '"><div class="wf-form">' +
      field('Status to publish', select('status', KH.DAY_STATUSES.filter((s) => s !== 'unplanned' || !Q.task(cd)), opts && opts.status ? opts.status : cd.status === 'task published' && pub && pub.status === 'task published' ? 'preliminary' : cd.status)) +
      field('Complaint deadline (unofficial only)', input('complaintDeadline', deadline, 'type="datetime-local"'), { hint: hours + ' h from now under ' + cls.edition + (hours === 2 ? ' on the last competition day' : '') + '. Every unofficial publish sets it again.' }) +
      field('Results note', '<textarea name="resultsNote" placeholder="Public remark published with the results">' + e(cd.resultsNote) + '</textarea>', { full: true }) +
      '</div><div class="wf-row"><button class="wf-btn primary" ' + (canPublish ? '' : 'disabled') + '>Publish</button><span class="muted small">Makes the status, task and results public together, replacing the latest published copy.</span></div></form>' +
      (comp.blocked ? '<p class="muted small">Blocked by staff: nothing is public.</p>' : '') + '</div>';
  };
  H.publishDay = (d, ds) => {
    const cd = Q.classDay(ds.cd);
    const checks = Q.publishChecks(cd, d.status);
    const doIt = () => KH.run(() => {
      A.publishClassDay(cd, { status: d.status, complaintDeadline: d.status === 'unofficial' ? d.complaintDeadline : cd.complaintDeadline, resultsNote: d.resultsNote });
      KH.toast('Published ' + W.dayTitle(cd) + ' as ' + d.status);
    });
    if (checks.length) KH.confirm({ title: 'Publish as ' + d.status + '?', intro: 'This departs from the rules or skips a check:', items: checks.map(e), confirmLabel: 'Publish anyway', onConfirm: doIt, extra: '<p class="muted small">Explain anything pilots should know in the results note.</p>' });
    else doIt();
  };
  H.setWorkingStatus = (v, ds) => {
    A.setDayStatus(Q.classDay(ds.cd), v);
    KH.toast('Working status set to ' + v + '. Not public until you publish.');
  };

  function remarks(r) {
    return [r.penaltyRemark && (r.penalty ? 'Penalty −' + r.penalty + ': ' : 'Official warning: ') + r.penaltyRemark.replace(/^Official warning: /, ''), r.publicRemark, r.dsqRemark && 'Disqualified: ' + r.dsqRemark].filter(Boolean);
  }
  function publishedTable(pub) {
    return '<table class="wf-table"><thead><tr><th>Rank</th><th>CID</th><th>Pilot</th><th>Glider</th><th class="num">Hcp</th><th>Start</th><th>Finish</th><th class="num">Distance</th><th class="num">Speed</th><th class="num">Penalty</th><th class="num">Points</th></tr></thead><tbody>' +
      pub.rows.map((r) => {
        const c = Q.competitor(r.competitorId);
        const rem = remarks(r);
        return '<tr class="' + (r.placeholder ? 'dim' : '') + '"><td>' + e(r.rankLabel) + '</td><td>' + e(c.cid) + '</td><td>' + e(Q.crewName(c)) + (rem.length ? '<div class="muted small">' + rem.map(e).join('<br>') + '</div>' : '') + '</td><td class="small">' + e(c.gliderType) + '</td><td class="num">' + (r.handicap ?? '') + '</td><td class="mono">' + (r.start || '') + '</td><td class="mono">' + (r.finish || '') + '</td><td class="num">' + (r.placeholder ? 'No result yet' : r.rankLabel === 'DNF' ? 'did not fly' : W.km(r.distance)) + '</td><td class="num">' + W.kmh(r.speed) + '</td><td class="num">' + (r.penalty ? '−' + r.penalty : r.penaltyRemark ? 'warning' : '') + '</td><td class="num">' + (r.points ?? '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  W.publishedCopy = (cd) => {
    const pub = cd.published;
    if (!pub || !pub.rows || !pub.rows.length) return '<p class="muted">No published results.' + (pub ? ' Published as ' + e(pub.status) + ' ' + W.dt(pub.at) + '.' : '') + '</p>';
    return '<div class="wf-stack"><div class="muted small">' + W.dayBadge(pub.status) + ' published ' + W.dt(pub.at) + ' · Task ' + e(pub.taskLetter) + ' ' + e(pub.taskLine) + ' · ' + W.km(pub.taskDistance) +
      ' · N ' + pub.params.N + ', n1 ' + pub.params.n1 + ', Do ' + pub.params.Do + ' km, Vo ' + pub.params.Vo + ' km/h, Pm ' + pub.params.Pm + ' · ' + e(pub.edition) + ' · engine ' + pub.engine + '</div>' +
      (pub.resultsNote ? '<div class="wf-note">' + e(pub.resultsNote) + '</div>' : '') + publishedTable(pub) +
      '<div class="wf-row"><button class="wf-btn small" data-act="printResults" data-cd="' + cd.id + '">Print results sheet</button><button class="wf-btn small" data-act="printOverall" data-cls="' + cd.classId + '">Print overall results sheet</button></div></div>';
  };
  // Results sheets render the last publish, never working data.
  H.printResults = (ds) => {
    const cd = Q.classDay(ds.cd);
    const cls = Q.class(cd.classId);
    const pub = cd.published;
    KH.modal({
      title: 'Results sheet (print preview)', wide: true,
      body: '<div class="wf-sheet wf-stack"><div class="wf-row between"><div><h2 style="margin:0">' + e(Q.competition(cls.competitionId).name) + '</h2><div>' + e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, cd.date)) + ' · Task ' + e(pub.taskLetter) + ' · ' + W.date(cd.date, true) + '</div></div><div style="text-align:right"><div style="font-size:22px;font-weight:700;text-transform:uppercase">' + e(pub.status) + '</div><div class="small">Published ' + W.dt(pub.at) + (pub.complaintDeadline ? '<br>Complaint deadline ' + W.dt(pub.complaintDeadline) : '') + '</div></div></div>' +
        '<div class="small">' + e(pub.taskLine) + ' · ' + W.km(pub.taskDistance) + ' · N ' + pub.params.N + ', Do ' + pub.params.Do + ' km, Vo ' + pub.params.Vo + ' km/h, Pm ' + pub.params.Pm + '</div>' +
        (pub.resultsNote ? '<div class="wf-note">' + e(pub.resultsNote) + '</div>' : '') + publishedTable(pub) +
        '<div class="wf-row between small"><span>' + e(pub.edition) + ' · engine ' + pub.engine + ' · rules hash ' + pub.rulesHash + '</span><span>Signed: ______________________ Competition director</span></div></div>' +
        '<div class="wf-row end"><button class="wf-btn primary" data-act="fakeDownload" data-what="the results sheet to the printer">Print</button></div>',
    });
  };
  W.overall = (cls) => {
    const days = Q.classDaysOf(cls.id).filter((cd) => !cd.practice && cd.published && cd.published.rows && cd.published.rows.length && cd.published.status !== 'cancelled');
    const order = ['preliminary', 'unofficial', 'final'];
    const lowest = days.length ? order[Math.min(...days.map((cd) => order.indexOf(cd.published.status)))] : '';
    const rows = Q.competitorsOf(cls.competitionId, cls.id).map((c) => {
      const per = days.map((cd) => cd.published.rows.find((r) => r.competitorId === c.id));
      return { c, per, total: per.reduce((a, r) => a + (r && r.points ? r.points : 0), 0) };
    }).sort((a, b) => b.total - a.total);
    return { days, lowest, rows };
  };
  H.printOverall = (ds) => {
    const cls = Q.class(ds.cls);
    const o = W.overall(cls);
    KH.modal({
      title: 'Overall results sheet (print preview)', wide: true,
      body: '<div class="wf-sheet wf-stack" style="max-width:none"><div class="wf-row between"><h2 style="margin:0">' + e(Q.competition(cls.competitionId).name) + ' · ' + e(cls.name) + ' · Overall</h2><b style="text-transform:uppercase">' + e(o.lowest) + '</b></div>' +
        '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Rank</th><th>CID</th><th>Pilot</th>' + o.days.map((cd) => '<th class="num">' + e(Q.dayLabel(cls.id, cd.date).replace('Day ', 'D')) + '</th>').join('') + '<th class="num">Total</th></tr></thead><tbody>' +
        o.rows.map((x, i) => '<tr><td>' + (x.c.hc ? 'HC' : i + 1) + '</td><td>' + e(x.c.cid) + '</td><td>' + e(Q.crewName(x.c)) + '</td>' + x.per.map((r) => '<td class="num">' + (r ? (r.rankLabel === 'DNF' ? '0' : r.points ?? '') : '') + '</td>').join('') + '<td class="num"><b>' + x.total + '</b></td></tr>').join('') +
        '</tbody></table></div><div class="small">From the latest published copy of each day. Practice and cancelled days are left out. Signed: ______________________</div></div>' +
        '<div class="wf-row end"><button class="wf-btn primary" data-act="fakeDownload" data-what="the overall results sheet to the printer">Print</button></div>',
    });
  };

  // ---------- tasks ----------

  W.taskMap = (points, opts) => {
    if (!points || points.length < 2) return '<div class="wf-map" style="height:' + ((opts && opts.h) || 220) + 'px"><span class="tag">Map</span></div>';
    const h = (opts && opts.h) || 220;
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    const pad = 0.12;
    const minLat = Math.min(...lats) - pad, maxLat = Math.max(...lats) + pad, minLon = Math.min(...lons) - pad * 1.5, maxLon = Math.max(...lons) + pad * 1.5;
    const W_ = 400, H_ = 260;
    const x = (lon) => ((lon - minLon) / (maxLon - minLon)) * W_;
    const y = (lat) => H_ - ((lat - minLat) / (maxLat - minLat)) * H_;
    const kmPx = W_ / ((maxLon - minLon) * 74);
    let svg = '<polyline fill="none" stroke="#111" stroke-width="1.5" points="' + points.map((p) => x(p.lon) + ',' + y(p.lat)).join(' ') + '"/>';
    points.forEach((p, i) => {
      const r = p.zone && p.zone.r1 ? Math.max(3, p.zone.r1 * kmPx) : 3;
      if (p.zone && p.zone.kind === 'line') svg += '<line x1="' + (x(p.lon) - 10) + '" y1="' + (y(p.lat) - 10) + '" x2="' + (x(p.lon) + 10) + '" y2="' + (y(p.lat) + 10) + '" stroke="#111" stroke-width="3"/>';
      else svg += '<circle cx="' + x(p.lon) + '" cy="' + y(p.lat) + '" r="' + r + '" fill="rgba(0,0,0,.06)" stroke="#555" stroke-dasharray="3 2"/>';
      svg += '<text x="' + (x(p.lon) + 5) + '" y="' + (y(p.lat) - 5) + '" font-size="10" fill="#333">' + e(p.name) + '</text>';
    });
    if (opts && opts.track) {
      const r = KH.util.rng(opts.track);
      const tr = [];
      for (let i = 0; i < points.length - 1; i++) for (let k = 0; k < 6; k++) {
        const t = k / 6;
        tr.push([points[i].lon + (points[i + 1].lon - points[i].lon) * t + (r() - 0.5) * 0.06, points[i].lat + (points[i + 1].lat - points[i].lat) * t + (r() - 0.5) * 0.04]);
      }
      if (!opts.finished) tr.splice(Math.floor(tr.length * 0.7));
      svg += '<polyline fill="none" stroke="#777" stroke-width="1" stroke-dasharray="4 2" points="' + tr.map(([lo, la]) => x(lo) + ',' + y(la)).join(' ') + '"/>';
    }
    return '<div class="wf-map" style="height:' + h + 'px"><span class="tag">Map (no basemap)</span><svg viewBox="0 0 ' + W_ + ' ' + H_ + '" preserveAspectRatio="xMidYMid meet">' + svg + '</svg></div>';
  };

  W.candidateList = (cd) => {
    const cands = Q.candidates(cd.id, true);
    const task = Q.task(cd);
    return '<div class="wf-stack"><table class="wf-table"><thead><tr><th>Letter</th><th>Type</th><th>Turnpoints</th><th class="num">Distance</th><th></th></tr></thead><tbody>' +
      (cands.length ? cands.map((c) => '<tr class="' + (c.deleted ? 'dim' : '') + '"><td><a href="#' + L().candidate(c) + '"><b>' + e(c.letter || '(no letter)') + '</b></a> ' + (task === c ? '<span class="wf-badge solid">published task</span>' : '') + (c.deleted ? ' <span class="wf-badge none">deleted</span>' : '') + '</td><td>' + (c.type === 'aat' ? 'AAT ' + e(c.minTaskTime) : 'Racing') + '</td><td>' + e(Q.taskLine(c)) + '</td><td class="num">' + W.km(Q.taskDistance(c)) + '</td><td class="right nowrap">' +
        (c.deleted ? '<button class="wf-btn small" data-act="restoreCandidate" data-cand="' + c.id + '">Restore</button>' : '<a class="wf-btn small" href="#' + L().candidate(c) + '">Edit</a> ' + (task !== c ? '<button class="wf-btn small" data-act="publishTask" data-cand="' + c.id + '">Publish as task</button>' : '')) + '</td></tr>').join('') : '<tr><td colspan="5" class="muted">No task candidates yet</td></tr>') +
      '</tbody></table><div class="wf-row"><button class="wf-btn" data-act="newCandidate" data-cd="' + cd.id + '">New candidate</button><button class="wf-btn" data-act="importCup" data-cd="' + cd.id + '">Import CUP…</button>' +
      (task ? '<button class="wf-btn ghost" data-act="withdrawTask" data-cd="' + cd.id + '">Withdraw published task</button>' : '') + '</div></div>';
  };
  H.newCandidate = (ds) => {
    const cd = Q.classDay(ds.cd);
    const comp = Q.competition(Q.class(cd.classId).competitionId);
    if (!comp.turnpointFile) throw new KH.Denied('Upload a turnpoint file first. Every task turnpoint comes from it.');
    const c = A.createCandidate(cd);
    KH.go(L().candidate(c));
  };
  H.duplicateCandidate = (ds) => {
    const from = Q.candidate(ds.cand);
    const c = A.createCandidate(Q.classDay(from.classDayId), from);
    KH.toast('Copied to candidate ' + c.letter);
    KH.go(L().candidate(c));
  };
  H.importCup = (ds) => {
    KH.modal({
      title: 'Import task from CUP',
      body: '<p>CUP is the only format. Each task waypoint must match a turnpoint by name and within about 1 m.</p><p class="muted small">Prototype: pick which file you "chose".</p>' +
        '<div class="wf-row"><button class="wf-btn primary" data-act="importCupGo" data-cd="' + ds.cd + '" data-which="ok">task-day9.cup (matches)</button><button class="wf-btn" data-act="importCupGo" data-cd="' + ds.cd + '" data-which="blocked">seeyou-export.cup (mismatch)</button></div>',
    });
  };
  H.importCupGo = (ds) => {
    const cd = Q.classDay(ds.cd);
    const comp = Q.competition(Q.class(cd.classId).competitionId);
    if (!comp.turnpointFile) throw new KH.Denied('Upload a turnpoint file first');
    const out = A.importCup(cd, ds.which);
    if (out.error) {
      KH.modal({ title: 'Import blocked', body: '<div class="wf-note warn">' + e(out.error) + '</div><p class="muted small">Nothing was imported.</p>' });
      return;
    }
    KH.closeModal();
    KH.toast('Imported as candidate ' + out.candidate.letter + '. Ignored options without scoring effect.');
    KH.go(L().candidate(out.candidate));
  };
  H.withdrawTask = (ds) => {
    const cd = Q.classDay(ds.cd);
    KH.confirm({ title: 'Withdraw the published task?', items: ['The class day goes back to unplanned.', 'Its files go stale with the reason "task".', 'Uploads stay open.'], confirmLabel: 'Withdraw', onConfirm: () => KH.run(() => A.withdrawTask(cd)) });
  };
  H.restoreCandidate = (ds) => A.restoreCandidate(Q.candidate(ds.cand));
  H.deleteCandidate = (ds) => {
    const c = Q.candidate(ds.cand);
    const cd = Q.classDay(c.classDayId);
    if (cd.taskCandidateId === c.id) throw new KH.Denied('The published task cannot be deleted');
    KH.confirm({ title: 'Delete candidate ' + (c.letter || '(no letter)') + '?', intro: 'You can restore it from the candidate list.', confirmLabel: 'Delete', onConfirm: () => KH.run(() => {
      A.deleteCandidate(c);
      KH.go(L().classDayTasks ? L().classDayTasks(cd) : L().classDay(cd));
    }) });
  };
  H.publishTask = (ds) => {
    const c = Q.candidate(ds.cand);
    const cd = Q.classDay(c.classDayId);
    const problems = Q.taskProblems(c, cd).filter((p) => !p.includes('differs') && !p.includes('no longer'));
    if (problems.length) throw new KH.Denied(problems.join('. '));
    const items = Q.taskDepartures(c, cd).map((d) => 'Departs from the rule set: ' + d);
    const waiting = S.files.filter((f) => { const r = Q.resolve(f); return r.ok && r.classDay === cd && !f.deleted; }).length;
    if (cd.taskCandidateId && cd.taskCandidateId !== c.id) items.push('Switches the published task from ' + Q.task(cd).letter + ' to ' + c.letter);
    if (waiting) items.push(waiting + ' files of this class day go stale with the reason "task"');
    for (const x of Q.publishChecks(cd, cd.status === 'unplanned' ? 'task published' : cd.status)) if (!x.startsWith('Task departs')) items.push('The class day is republished as ' + (cd.status === 'unplanned' ? 'task published' : cd.status) + ': ' + x);
    const doIt = () => KH.run(() => { A.publishTask(c); KH.toast('Published task ' + c.letter + ' for ' + W.dayTitle(cd)); });
    if (items.length) KH.confirm({ title: 'Publish task ' + c.letter + '?', intro: 'Publishing makes the class day\'s status, task and results public together.', items, confirmLabel: 'Publish task', onConfirm: doIt });
    else doIt();
  };

  function zoneSummary(z, role) {
    if (z.kind === 'line') return 'Line ' + z.length + ' km';
    if (role === 'finish' && z.kind === 'cylinder') return 'Cylinder ' + z.r1 + ' km';
    return (z.preset || 'Custom') + ' R1 ' + z.r1 + ' km A1 ' + z.a1 + '°' + (z.r2 ? ' R2 ' + z.r2 + ' km A2 ' + z.a2 + '°' : '') + ', ' + z.orientation + (z.orientation === 'fixed' && z.bearing !== undefined ? ' ' + z.bearing + '°' : '');
  }
  W.zoneSummary = zoneSummary;

  W.taskEditor = (c) => {
    const cd = Q.classDay(c.classDayId);
    const cls = Q.class(cd.classId);
    const comp = Q.competition(cls.competitionId);
    const isTask = cd.taskCandidateId === c.id;
    const problems = Q.taskProblems(c, cd);
    const departures = Q.taskDepartures(c, cd);
    const tps = comp.turnpointFile ? comp.turnpointFile.turnpoints : [];
    const role = (i) => (i === 0 ? 'start' : i === c.points.length - 1 ? 'finish' : 'tp');
    const zoneEditor = (p, i) => {
      const r = role(i);
      const z = p.zone;
      const hid = '<input type="hidden" name="idx" value="' + i + '">';
      if (r === 'start') return '<form class="wf-row" data-submit="saveZone" data-cand="' + c.id + '">' + hid + '<span class="small">Line, length</span>' + input('length', z.length, 'class="narrow"') + '<span class="small">km</span><button class="wf-btn small">Set</button></form>';
      if (r === 'finish') return '<form class="wf-row" data-submit="saveZone" data-cand="' + c.id + '">' + hid + select('kind', [['cylinder', 'Cylinder'], ['line', 'Line']], z.kind) + '<span class="small">' + (z.kind === 'line' ? 'length' : 'radius') + '</span>' + input(z.kind === 'line' ? 'length' : 'r1', z.kind === 'line' ? z.length : z.r1, 'class="narrow"') + '<span class="small">km</span><button class="wf-btn small">Set</button></form>';
      return '<form class="wf-row" data-submit="saveZone" data-cand="' + c.id + '">' + hid + select('preset', ['Cylinder', 'Keyhole', 'Sector', 'Annular sector', 'Custom'], z.preset) +
        '<span class="small">R1</span>' + input('r1', z.r1, 'class="narrow"') + '<span class="small">A1</span>' + input('a1', z.a1, 'class="narrow"') +
        '<span class="small">R2</span>' + input('r2', z.r2, 'class="narrow"') + '<span class="small">A2</span>' + input('a2', z.a2, 'class="narrow"') +
        select('orientation', ['symmetric', 'fixed', 'to previous', 'to next'], z.orientation) + (z.orientation === 'fixed' ? '<span class="small">bearing</span>' + input('bearing', z.bearing, 'class="narrow" placeholder="°"') : '') + '<button class="wf-btn small">Set</button></form>';
    };
    return '<div class="wf-stack">' +
      '<div class="wf-row between"><div class="wf-row"><h2 style="margin:0">Task candidate ' + e(c.letter || '(no letter)') + '</h2>' + (isTask ? '<span class="wf-badge solid">published task</span>' : '<span class="wf-badge dashed">private</span>') + '</div>' +
      '<div class="wf-row">' + (isTask && !cd.reasons.includes('Task') ? '' : '<button class="wf-btn primary" data-act="publishTask" data-cand="' + c.id + '">' + (isTask ? 'Publish changes' : 'Publish as task') + '</button>') +
      '<button class="wf-btn" data-act="printSheet" data-cand="' + c.id + '">Task sheet</button><button class="wf-btn" data-act="duplicateCandidate" data-cand="' + c.id + '">Duplicate</button>' + (isTask ? '' : '<button class="wf-btn danger" data-act="deleteCandidate" data-cand="' + c.id + '">Delete</button>') + '</div></div>' +
      (isTask ? '<p class="muted small">Edits to the published task mark this class day\'s files stale and need a publish to become public.</p>' : '') +
      (problems.length ? '<div class="wf-note warn">' + problems.map(e).join('<br>') + '</div>' : '') +
      (departures.length ? '<div class="wf-note">Departs from ' + e(cls.edition) + ': ' + departures.map(e).join('. ') + '. You confirm this at publish time.</div>' : '') +
      '<div class="wf-cols"><form class="wf-stack" data-submit="saveCandidate" data-cand="' + c.id + '"><div class="wf-form">' +
      field('Letter', input('letter', c.letter, 'class="narrow" maxlength="2"'), { hint: 'Needed to publish' }) +
      field('Task type', select('type', [['racing', 'Racing task'], ['aat', 'Assigned area task']], c.type)) +
      field('Minimum task time', input('minTaskTime', c.minTaskTime, 'placeholder="hh:mm" class="mid"' + (c.type === 'aat' ? ' required' : ' disabled')), { hint: 'AAT only' }) +
      field('Minimum finish height (m MSL)', input('minFinishHeight', c.minFinishHeight, 'class="mid"'), { hint: 'Unchecked when empty' }) +
      field('Day notes', '<textarea name="dayNotes">' + e(c.dayNotes) + '</textarea>', { full: true, hint: 'Printed on this candidate\'s task sheet' }) +
      '</div><div class="wf-row"><button class="wf-btn">Save</button><span class="muted small">' + W.km(Q.taskDistance(c)) + (c.type === 'aat' ? ' nominal' : '') + '</span></div></form>' +
      W.taskMap(c.points, { h: 240 }) + '</div>' +
      '<table class="wf-table"><thead><tr><th>#</th><th>Role</th><th>Turnpoint</th><th>Observation zone</th><th class="num">Leg</th><th></th></tr></thead><tbody>' +
      c.points.map((p, i) => '<tr><td>' + i + '</td><td>' + ({ start: 'Start', finish: 'Finish', tp: c.type === 'aat' ? 'Assigned area' : 'Turnpoint' })[role(i)] + '</td><td><b>' + e(p.name) + '</b><div class="muted small">' + p.lat.toFixed(4) + ' ' + p.lon.toFixed(4) + ', ' + p.elev + ' m</div></td><td>' + zoneEditor(p, i) + '</td><td class="num">' + (i ? W.km(Math.round(KH.util.haversine(c.points[i - 1], p) * 10) / 10) : '') + '</td><td class="right nowrap">' +
        '<button class="wf-btn small" data-act="moveTp" data-cand="' + c.id + '" data-idx="' + i + '" data-delta="-1">↑</button><button class="wf-btn small" data-act="moveTp" data-cand="' + c.id + '" data-idx="' + i + '" data-delta="1">↓</button> <button class="wf-btn small" data-act="removeTp" data-cand="' + c.id + '" data-idx="' + i + '">Remove</button></td></tr>').join('') +
      '</tbody></table>' +
      '<form class="wf-row" data-submit="addTp" data-cand="' + c.id + '"><input name="name" list="tp-list-' + c.id + '" placeholder="Turnpoint from the file" required><datalist id="tp-list-' + c.id + '">' + tps.map((t) => '<option value="' + e(t.name) + '">' + t.code + '</option>').join('') + '</datalist><button class="wf-btn small">Add before finish</button><span class="muted small">Only turnpoints from the turnpoint file. Start zones are always lines.</span></form>' +
      '</div>';
  };
  H.saveCandidate = (d, ds) => {
    const c = Q.candidate(ds.cand);
    const cd = Q.classDay(c.classDayId);
    if (d.letter && Q.candidates(cd.id, true).some((x) => x !== c && x.letter === d.letter.toUpperCase())) throw new KH.Denied('Letter ' + d.letter + ' is already used on this class day');
    const patch = { letter: (d.letter || '').toUpperCase(), type: d.type, minTaskTime: d.type === 'aat' ? d.minTaskTime || c.minTaskTime : '', minFinishHeight: d.minFinishHeight, dayNotes: d.dayNotes };
    const save = () => KH.run(() => { A.updateCandidate(c, patch); KH.toast('Saved candidate ' + (patch.letter || '')); });
    if (cd.taskCandidateId === c.id && patch.letter !== c.letter) KH.confirm({ title: 'Re-letter the published task?', intro: 'Pilots were briefed on task ' + c.letter + '.', confirmLabel: 'Change letter', onConfirm: save });
    else save();
  };
  H.addTp = (d, ds) => {
    const c = Q.candidate(ds.cand);
    const comp = Q.competition(Q.class(Q.classDay(c.classDayId).classId).competitionId);
    if (!comp.turnpointFile.turnpoints.some((t) => t.name === d.name)) throw new KH.Denied(d.name + ' is not in the turnpoint file');
    A.addTaskPoint(c, d.name, true);
  };
  H.removeTp = (ds) => A.removeTaskPoint(Q.candidate(ds.cand), Number(ds.idx));
  H.moveTp = (ds) => A.moveTaskPoint(Q.candidate(ds.cand), Number(ds.idx), Number(ds.delta));
  H.saveZone = (d, ds) => {
    const presets = { Cylinder: { r2: 0, a2: 0, a1: 180 }, Keyhole: { r1: 10, a1: 45, r2: 0.5, a2: 180 }, Sector: { a1: 45, r2: 0, a2: 0 }, 'Annular sector': { a1: 45, a2: 0 } };
    const z = {};
    for (const k of ['length', 'r1', 'a1', 'r2', 'a2', 'bearing']) if (d[k] !== undefined && d[k] !== '') z[k] = Number(d[k]);
    if (d.kind) z.kind = d.kind;
    if (d.orientation) z.orientation = d.orientation;
    if (d.preset) {
      z.preset = d.preset;
      const c = Q.candidate(ds.cand);
      if (c.points[Number(d.idx)].zone.preset !== d.preset) Object.assign(z, presets[d.preset] || {});
    }
    A.setZone(Q.candidate(ds.cand), Number(d.idx), z);
  };

  W.taskSheet = (c) => {
    const cd = Q.classDay(c.classDayId);
    const cls = Q.class(cd.classId);
    const comp = Q.competition(cls.competitionId);
    const o = KH.effective(cd, cls);
    const dist = Q.taskDistance(c);
    const course = (a, b) => Math.round(((Math.atan2((b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI + 360) % 360);
    const opened = (comp.airspaceFile ? comp.airspaceFile.airspaces.map((a) => a.name) : []).filter((n) => {
      const ex = cd.airspaceExceptions.find((x) => x.name === n);
      return ex ? ex.direction === 'open' : comp.openedAirspaceNames.includes(n);
    });
    const flToM = (fl) => Math.round(Number(String(fl).replace(/\D/g, '')) * 100 * 0.3048 + (cd.qnh - 1013) * 8.3);
    const sunset = '21:14';
    const scoringLine = o.scoringEnd ? (o.scoringEnd === sunset ? 'Scoring end at sunset (' + sunset + ')' : 'Scoring end ' + o.scoringEnd + ', sunset ' + sunset) : 'Sunset ' + sunset;
    const closedEx = cd.airspaceExceptions.map((x) => x.name + ' ' + (x.direction === 'open' ? 'opened' : 'closed'));
    return '<div class="wf-sheet wf-stack"><div class="wf-row between"><div><h2 style="margin:0">' + e(comp.name) + '</h2><div>' + e(cls.name) + ' · ' + e(Q.dayLabel(cls.id, cd.date)) + ' · ' + W.date(cd.date, true) + '</div></div><div style="text-align:right"><div style="font-size:28px;font-weight:700">Task ' + e(c.letter || '?') + '</div><div class="muted small">Working state, ' + W.dt(KH.NOW) + '</div></div></div>' +
      '<div class="wf-cols"><div class="wf-kv"><span>Type</span><span>' + (c.type === 'aat' ? 'Assigned area task, minimum task time ' + e(c.minTaskTime) : 'Racing task') + '</span><span>Distance</span><span>' + (c.type === 'aat' ? 'nominal ' + W.km(dist) + ', minimum ' + W.km(Math.round(dist * 0.74)) + ', maximum ' + W.km(Math.round(dist * 1.31)) : W.km(dist)) + '</span>' +
      '<span>Start</span><span>Opens ' + e(o.startOpen || '—') + (o.startClose ? ', closes ' + e(o.startClose) : '') + (o.maxStartAlt ? ', max ' + o.maxStartAlt + ' m MSL' : '') + (o.maxStartGs ? ', max ' + o.maxStartGs + ' km/h' : '') + (o.pevStart === 'yes' ? ', PEV start: wait ' + o.pevWait + ' min, window ' + o.pevWindow + ' min' : '') + '</span>' +
      '<span>Limits</span><span>' + (o.maxAltitude ? 'Maximum altitude ' + e(o.maxAltitude) + '. ' : '') + (o.towAltitude ? 'Tow altitude ' + o.towAltitude + ' m MSL. ' : '') + (c.minFinishHeight ? 'Minimum finish height ' + c.minFinishHeight + ' m MSL. ' : '') + scoringLine + '</span>' +
      '<span>QNH</span><span>' + cd.qnh + ' hPa' + (comp.flightLevels.length ? ' · ' + comp.flightLevels.map((fl) => fl + ' = ' + flToM(fl) + ' m MSL').join(', ') : '') + '</span>' +
      '<span>Airspace</span><span>All airspaces of ' + e(comp.airspaceFile ? comp.airspaceFile.name : 'the airspace file') + ' are closed except ' + (opened.length ? opened.map(e).join(', ') : 'none') + (closedEx.length ? '. Changed for today: ' + closedEx.map(e).join(', ') : '') + (cd.notamAirspaces.length ? '. NOTAM, closed: ' + cd.notamAirspaces.map((n) => e(n.name)).join(', ') : '') + '</span>' +
      '<span>Upload</span><span>keyhole.example/' + e(comp.slug) + '/upload · password <b class="mono">' + e(comp.uploadPassword) + '</b></span></div>' +
      '<div class="wf-row" style="align-items:flex-start">' + W.taskMap(c.points, { h: 160 }).replace('class="wf-map"', 'class="wf-map grow"') + '<div class="wf-map" style="width:110px;height:110px;min-height:0"><span class="tag">QR</span></div></div></div>' +
      '<table class="wf-table"><thead><tr><th>#</th><th>Turnpoint</th><th class="num">Elevation</th><th>Zone</th><th class="num">Course</th><th class="num">Leg</th></tr></thead><tbody>' + c.points.map((p, i) => '<tr><td>' + i + '</td><td>' + e(p.name) + '</td><td class="num">' + p.elev + ' m</td><td>' + zoneSummary(p.zone, i === c.points.length - 1 ? 'finish' : '') + '</td><td class="num">' + (i ? course(c.points[i - 1], p) + '°' : '') + '</td><td class="num">' + (i ? W.km(Math.round(KH.util.haversine(c.points[i - 1], p) * 10) / 10) : '') + '</td></tr>').join('') + '</tbody></table>' +
      (c.dayNotes ? '<div><h4>Day notes</h4>' + e(c.dayNotes) + '</div>' : '') + (comp.standingNotes ? '<div><h4>Notes</h4>' + e(comp.standingNotes) + '</div>' : '') + '</div>';
  };
  H.printSheet = (ds) => KH.modal({ title: 'Task sheet (print preview)', wide: true, body: W.taskSheet(Q.candidate(ds.cand)) + '<div class="wf-row end"><button class="wf-btn primary" data-act="fakeDownload" data-what="the task sheet to the printer">Print</button></div>' });

  // ---------- competitors and loggers ----------

  W.competitorsTable = (comp, classId, opts) => {
    const list = Q.competitorsOf(comp.id, classId, true);
    return '<table class="wf-table"><thead><tr><th>CID</th>' + (classId ? '' : '<th>Class</th>') + '<th>Crew</th><th>Glider</th><th class="num">Handicap</th><th>Loggers</th><th>Flags</th></tr></thead><tbody>' +
      (list.length ? list.map((c) => {
        const loggers = Q.loggersOf(comp.id).filter((l) => l.links.some((k) => k.competitorId === c.id));
        return '<tr class="link' + (c.deleted ? ' dim' : '') + '" data-href="' + L().competitor(c) + '"><td><b>' + e(c.cid) + '</b></td>' + (classId ? '' : '<td>' + e(Q.class(c.classId).name) + '</td>') + '<td>' + e(Q.crewName(c)) + '</td><td>' + e(c.gliderType) + '</td><td class="num">' + (c.handicap ?? '') + '</td><td>' +
          loggers.map((l) => e(Q.loggerLabel(l)) + ' <span class="muted small">' + Q.linkOn(l, KH.TODAY)?.role + '</span>').join('<br>') + '</td><td>' + [c.hc ? 'HC' : '', c.dsq ? 'DSQ' : '', c.deleted ? 'deleted' : '', c.pureGlider ? '' : 'engine'].filter(Boolean).map((x) => '<span class="wf-badge">' + x + '</span>').join(' ') + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="muted">No competitors yet</td></tr>') + '</tbody></table>';
  };

  W.competitorForm = (comp, c, classId) => {
    const classes = Q.classesOf(comp.id);
    const cls = c ? Q.class(c.classId) : classes.find((x) => x.id === classId) || classes[0];
    const gliders = cls && cls.handicapList ? Object.keys(KH.HANDICAP_LISTS[cls.handicapList]) : [];
    const crew = c ? c.crew.concat([{}]) : [{}, {}];
    if (!classes.length) return '<div class="wf-empty">Add a class first</div>';
    return '<form class="wf-stack" data-submit="saveCompetitor" data-comp="' + comp.id + '" data-competitor="' + (c ? c.id : '') + '"><div class="wf-form">' +
      field('Class', select('classId', classes.map((x) => [x.id, x.name]), cls.id), { hint: c ? 'Editable only while all results are unknown and no file resolves' : '' }) +
      field('Competition ID', input('cid', c ? c.cid : '', 'required maxlength="5" class="mid"'), { hint: 'Unique per class' }) +
      field('Glider type', input('gliderType', c ? c.gliderType : '', 'list="gl-' + cls.id + '" required') + '<datalist id="gl-' + cls.id + '">' + gliders.map((g) => '<option value="' + e(g) + '">').join('') + '</datalist>', { hint: cls.handicapList ? 'From ' + cls.handicapList : '' }) +
      field('Handicap', input('handicap', c ? c.handicap ?? '' : '', 'class="mid" placeholder="from list"'), { hint: cls.handicapScale ? 'Scale ' + cls.handicapScale : 'Class not handicapped' }) +
      field('Registration', input('registration', c ? c.registration : '', 'class="mid"')) +
      field('Display name', input('displayName', c ? c.displayName : '', 'placeholder="Defaults to the crew names"')) +
      field('Pure glider', '<input type="checkbox" name="pureGlider" ' + (!c || c.pureGlider ? 'checked' : '') + '>', { inline: true }) +
      field('Hors concours', '<input type="checkbox" name="hc" ' + (c && c.hc ? 'checked' : '') + '>', { inline: true }) +
      '</div><h4>Crew</h4><table class="wf-table"><thead><tr><th>#</th><th>First name</th><th>Last name</th><th>Club</th><th>Country</th><th>IGC Ranking ID</th></tr></thead><tbody>' +
      crew.map((p, i) => '<tr><td>' + (i + 1) + '</td><td>' + input('crew' + i + 'first', p.first) + '</td><td>' + input('crew' + i + 'last', p.last) + '</td><td>' + input('crew' + i + 'club', p.club) + '</td><td>' + input('crew' + i + 'country', p.country, 'class="narrow"') + '</td><td>' + input('crew' + i + 'igcId', p.igcId, 'class="mid"') + '</td></tr>').join('') +
      '</tbody></table><p class="muted small">Leave a row empty to drop it. Save adds another empty row.</p>' +
      '<div class="wf-row"><button class="wf-btn primary">' + (c ? 'Save competitor' : 'Add competitor') + '</button>' + (c ? '<button type="button" class="wf-btn danger" data-act="deleteCompetitor" data-competitor="' + c.id + '">Delete competitor</button>' : '') + '</div></form>';
  };
  H.saveCompetitor = (d, ds) => {
    const comp = Q.competition(ds.comp);
    const existing = ds.competitor ? Q.competitor(ds.competitor) : null;
    const crew = [];
    for (let i = 0; i < 6; i++) if (d['crew' + i + 'first'] || d['crew' + i + 'last']) crew.push({ first: d['crew' + i + 'first'], last: d['crew' + i + 'last'], club: d['crew' + i + 'club'], country: d['crew' + i + 'country'], igcId: d['crew' + i + 'igcId'] });
    if (!crew.length) throw new KH.Denied('A competitor needs at least one crew member');
    const c = A.saveCompetitor(comp, { ...d, crew }, existing);
    KH.toast((existing ? 'Saved ' : 'Added ') + c.cid);
    if (!existing) KH.go(L().competitor(c));
  };
  H.deleteCompetitor = (ds) => {
    const c = Q.competitor(ds.competitor);
    const links = S.loggers.filter((l) => l.links.some((k) => k.competitorId === c.id));
    KH.confirm({
      title: 'Delete ' + c.cid + '?', intro: 'Deleting frees the competition ID. Published results keep the row until each affected day is published again.',
      items: links.map((l) => 'Removes the links of ' + Q.loggerLabel(l) + '. Its files become unresolved.'), confirmLabel: 'Delete competitor',
      onConfirm: () => KH.run(() => { A.deleteCompetitor(c); KH.go(L().competitors(Q.competition(c.competitionId))); }),
    });
  };

  W.dsqPanel = (c) =>
    c.dsq
      ? '<div class="wf-note warn"><b>Competition disqualification</b><br>' + e(c.dsq.publicRemark) + (c.dsq.internalRemark ? '<br><span class="muted">Internal: ' + e(c.dsq.internalRemark) + '</span>' : '') + '</div><button class="wf-btn small" data-act="liftDsq" data-competitor="' + c.id + '">Lift disqualification</button>'
      : '<details><summary>Disqualify from the competition…</summary><form class="wf-stack" data-submit="setDsq" data-competitor="' + c.id + '" style="margin-top:8px"><div class="wf-form">' + field('Public remark', input('publicRemark', '', 'required'), { full: true }) + field('Internal remark', input('internalRemark', ''), { full: true }) + '</div><p class="muted small">Zeroes every day score. Flights still count toward day parameters. Each day shows it at its next publish.</p><button class="wf-btn danger">Disqualify</button></form></details>';
  H.setDsq = (d, ds) => A.setDsq(Q.competitor(ds.competitor), { publicRemark: d.publicRemark, internalRemark: d.internalRemark });
  H.liftDsq = (ds) => A.setDsq(Q.competitor(ds.competitor), null);

  W.loggersTable = (comp) => {
    const list = Q.loggersOf(comp.id);
    return '<table class="wf-table"><thead><tr><th>Logger</th><th>Links</th><th class="num">Files</th><th>Thresholds</th></tr></thead><tbody>' +
      (list.length ? list.map((l) => '<tr class="link" data-href="' + L().logger(l) + '"><td><b>' + e(Q.loggerLabel(l)) + '</b></td><td>' + (l.links.length ? l.links.map((k) => e(Q.competitor(k.competitorId).cid) + ' ' + k.role + (k.from ? ' from ' + W.date(k.from) : '')).join('<br>') : '<span class="wf-badge dashed">no link</span>') + '</td><td class="num">' + S.files.filter((f) => f.loggerId === l.id && !f.deleted).length + '</td><td class="small muted">ENL ' + l.enl + ', MOP ' + l.mop + ', CUR ' + l.cur + ' A, ' + l.minDuration + ' s</td></tr>').join('') : '<tr><td colspan="4" class="muted">No loggers yet. Files from unknown loggers create them, or enter them here.</td></tr>') + '</tbody></table>';
  };
  W.loggerForm = (comp, l) =>
    '<form class="wf-stack" data-submit="saveLogger" data-comp="' + comp.id + '" data-logger="' + (l ? l.id : '') + '"><div class="wf-form">' +
    field('Manufacturer', input('manufacturer', l ? l.manufacturer : '', 'required maxlength="3" class="narrow" placeholder="LXV"' + (l ? ' disabled' : ''))) +
    field('Serial', input('serial', l ? l.serial : '', 'required class="mid"' + (l ? ' disabled' : ''))) +
    field('ENL threshold', input('enl', l ? l.enl : 500, 'class="narrow"')) +
    field('MOP threshold', input('mop', l ? l.mop : 500, 'class="narrow"')) +
    field('Current threshold (A)', input('cur', l ? l.cur : 20, 'class="narrow"')) +
    field('Minimum duration (s)', input('minDuration', l ? l.minDuration : 30, 'class="narrow"')) +
    '</div><div class="wf-row"><button class="wf-btn primary">' + (l ? 'Save thresholds' : 'Add logger') + '</button>' + (l ? '<span class="muted small">Changes mark this logger\'s files stale.</span>' : '') + '</div></form>';
  H.saveLogger = (d, ds) => {
    const comp = Q.competition(ds.comp);
    const existing = ds.logger ? Q.logger(ds.logger) : null;
    if (existing) Object.assign(d, { manufacturer: existing.manufacturer, serial: existing.serial });
    const l = A.saveLogger(comp, d, existing);
    KH.toast(existing ? 'Saved thresholds' : 'Added logger ' + Q.loggerLabel(l));
    if (!existing) KH.go(L().logger(l));
  };

  W.linkForm = (l, prefill) => {
    const comp = Q.competition(l.competitionId);
    const comps = Q.competitorsOf(comp.id);
    const p = prefill || {};
    return '<form class="wf-row" data-submit="addLink" data-logger="' + l.id + '">' +
      field('Competitor', select('competitorId', comps.map((c) => [c.id, c.cid + ' · ' + Q.class(c.classId).name + ' · ' + Q.crewName(c)]), p.competitorId)) +
      field('From date', input('from', p.from || '', 'type="date"'), { hint: 'Empty: from the start' }) +
      field('Role', select('role', ['primary', 'secondary'], p.role || 'primary')) +
      '<button class="wf-btn small primary" style="align-self:flex-end">Add link</button></form>';
  };
  W.loggerLinks = (l) =>
    '<div class="wf-stack"><table class="wf-table"><thead><tr><th>From</th><th>Competitor</th><th>Role</th><th></th></tr></thead><tbody>' +
    (l.links.length ? l.links.slice().sort((a, b) => (a.from || '').localeCompare(b.from || '')).map((k) => {
      const idx = l.links.indexOf(k);
      const c = Q.competitor(k.competitorId);
      return '<tr><td>' + (k.from ? W.date(k.from, true) : 'start of competition') + '</td><td><a href="#' + L().competitor(c) + '">' + e(c.cid) + '</a> ' + e(Q.crewName(c)) + '</td><td>' + select('role', ['primary', 'secondary'], k.role, 'data-change="setLinkRole" data-logger="' + l.id + '" data-idx="' + idx + '"') + '</td><td class="right"><button class="wf-btn small" data-act="removeLink" data-logger="' + l.id + '" data-idx="' + idx + '">Remove</button></td></tr>';
    }).join('') : '<tr><td colspan="4" class="muted">Not linked. Its files stay unresolved.</td></tr>') + '</tbody></table>' + W.linkForm(l) + '</div>';
  function confirmMoves(title, moves, onConfirm) {
    if (!moves.length) return onConfirm();
    KH.confirm({ title, intro: 'These files move to another result:', items: moves.map((m) => e(m.file.name) + ': ' + e(m.from) + ' → ' + e(m.to) + (m.file.internalRemark ? ' <span class="wf-badge">has remark</span>' : '')), confirmLabel: 'Move files', onConfirm });
  }
  H.addLink = (d, ds) => {
    const l = Q.logger(ds.logger);
    const link = { competitorId: d.competitorId, from: d.from, role: d.role };
    confirmMoves('Add link for ' + Q.loggerLabel(l) + '?', Q.previewLinkMove(l, link), () => KH.run(() => { A.addLink(l, link); KH.closeModal(); KH.toast('Linked ' + Q.loggerLabel(l) + '. Resolved files are stale until you rerun them.'); }));
  };
  H.removeLink = (ds) => {
    const l = Q.logger(ds.logger);
    KH.confirm({ title: 'Remove this link?', items: ['Files that resolved through it become unresolved or move to an earlier link.', 'A result whose scored file leaves returns to unknown.'], confirmLabel: 'Remove link', onConfirm: () => KH.run(() => A.removeLink(l, Number(ds.idx))) });
  };
  H.setLinkRole = (v, ds) => {
    A.setLinkRole(Q.logger(ds.logger), Number(ds.idx), v);
    KH.toast('Role changed. Its files are stale.');
  };

  // ---------- IGC files ----------

  W.filterFiles = (comp, q) => {
    let files = Q.filesOf(comp.id);
    if (q.deleted !== '1') files = files.filter((f) => !f.deleted);
    const info = files.map((f) => ({ f, res: Q.resolve(f) }));
    let out = info;
    if (q.date) out = out.filter((x) => Q.flightDate(x.f) === q.date);
    if (q.class) out = out.filter((x) => x.res.ok && Q.class(x.res.competitor.classId).slug === q.class);
    if (q.q) out = out.filter((x) => (x.f.name + ' ' + (x.res.competitor ? x.res.competitor.cid + ' ' + Q.crewName(x.res.competitor) : '') + ' ' + Q.loggerLabel(Q.logger(x.f.loggerId))).toLowerCase().includes(q.q.toLowerCase()));
    if (q.state === 'unresolved') out = out.filter((x) => !x.res.ok);
    if (q.state === 'stale') out = out.filter((x) => x.f.analysis.stale.length);
    if (q.state === 'warnings') out = out.filter((x) => x.f.analysis.log.some((l) => l.level === 'warning' || l.level === 'error'));
    if (q.state === 'scored') out = out.filter((x) => x.res.ok && x.res.result.scoredFileId === x.f.id);
    out.sort((a, b) => (b.f.uploadedAt > a.f.uploadedAt ? 1 : -1));
    const hiddenUnresolved = info.filter((x) => !x.res.ok).length - out.filter((x) => !x.res.ok).length;
    return { rows: out, hiddenUnresolved };
  };
  W.fileFilters = (comp, q, basePath) => {
    const classes = Q.classesOf(comp.id);
    const set = (patch) => '#' + KH.withQuery(patch);
    return '<form class="wf-row" data-submit="fileFilter" data-base="' + e(basePath) + '">' +
      select('date', [['', 'All dates']].concat(comp.dates.map((d) => [d, W.date(d)])), q.date) +
      select('class', [['', 'All classes']].concat(classes.map((c) => [c.slug, c.name])), q.class) +
      select('state', [['', 'Any state'], ['unresolved', 'Unresolved'], ['stale', 'Stale'], ['warnings', 'With warnings or errors'], ['scored', 'Scored files']], q.state) +
      input('q', q.q, 'placeholder="Pilot, CID, logger, file"') +
      '<label class="wf-field inline"><input type="checkbox" name="deleted" ' + (q.deleted === '1' ? 'checked' : '') + '> include deleted</label>' +
      '<button class="wf-btn small">Filter</button>' + (Object.keys(q).length ? '<a class="wf-btn small ghost" href="#' + basePath + '">Clear</a>' : '') + '</form>';
  };
  H.fileFilter = (d, ds) => {
    const q = { date: d.date, class: d.class, state: d.state, q: d.q, deleted: d.deleted ? '1' : '' };
    const qs = Object.keys(q).filter((k) => q[k]).map((k) => k + '=' + encodeURIComponent(q[k])).join('&');
    KH.go(ds.base + (qs ? '?' + qs : ''));
  };
  W.filesTable = (rows, opts) => {
    const showResult = !opts || opts.showResult !== false;
    return '<table class="wf-table"><thead><tr><th>File</th><th>Uploaded</th><th>Flight date</th><th>Logger</th>' + (showResult ? '<th>Resolves to</th>' : '<th>Role</th>') + '<th>Analysis</th><th>Warnings</th></tr></thead><tbody>' +
      (rows.length ? rows.map(({ f, res }) => {
        const warn = f.analysis.log.filter((l) => l.level === 'warning' || l.level === 'error').length;
        const scored = res.ok && res.result.scoredFileId === f.id;
        return '<tr class="link' + (f.deleted ? ' dim' : '') + '" data-href="' + L().file(f) + '"><td><b>' + e(f.name) + '</b>' + (f.deleted ? ' <span class="wf-badge none">deleted</span>' : '') + (f.private ? ' <span class="wf-badge none">private</span>' : '') + (f.internalRemark ? ' <span class="wf-badge none" title="' + e(f.internalRemark) + '">remark</span>' : '') + '</td><td class="nowrap">' + W.dt(f.uploadedAt) + '<div class="muted small">' + f.uploadedBy + '</div></td><td class="nowrap">' + W.date(Q.flightDate(f)) + (f.dateOverride ? ' <span class="wf-badge">override</span>' : '') + '</td><td>' + e(Q.loggerLabel(Q.logger(f.loggerId))) + '</td>' +
          (showResult ? '<td>' + (res.ok ? e(res.competitor.cid) + ' · ' + e(Q.class(res.competitor.classId).name) + ' · ' + e(Q.dayLabel(res.classDay.classId, res.classDay.date)) + ' <span class="muted small">' + res.role + '</span>' + (scored ? ' <span class="wf-badge solid">scored</span>' : '') : '<span class="wf-badge dashed">unresolved</span><div class="muted small">' + e(res.reason) + (f.suggestedCid ? '. Pilot chose ' + e(f.suggestedClass) + ' ' + e(f.suggestedCid) : '') + '</div>') + '</td>'
            : '<td>' + (res.role || '') + (scored ? ' <span class="wf-badge solid">scored</span>' : '') + '</td>') +
          '<td>' + (f.analysis.stale.length ? W.staleBadge(f) : f.analysis.state === 'pending' ? 'running' : f.analysis.output ? 'done' : f.analysis.log.some((l) => l.kind === 'parse') ? 'failed to parse' : res.ok ? 'waiting for task' : 'partial') + '</td><td class="num">' + (warn || '') + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="muted">No files match</td></tr>') + '</tbody></table>';
  };

  W.scorerUploadForm = (comp, prefill) => {
    const loggers = Q.loggersOf(comp.id);
    return '<form class="wf-row" data-submit="scorerUpload" data-comp="' + comp.id + '">' + field('IGC file', '<input type="file" disabled title="Prototype: the logger and date below stand in for the file">') +
      field('Logger (from the A record)', select('loggerId', loggers.map((l) => [l.id, Q.loggerLabel(l)]), prefill && prefill.loggerId)) + field('Flight date', input('date', (prefill && prefill.date) || KH.TODAY, 'type="date"')) +
      '<button class="wf-btn small" style="align-self:flex-end">Upload as scorer</button></form>';
  };
  H.scorerUpload = (d, ds) => {
    const f = A.scorerUpload(Q.competition(ds.comp), d.loggerId, d.date);
    KH.toast('Uploaded ' + f.name);
    KH.go(L().file(f));
  };

  W.fileMeta = (f) => {
    const res = Q.resolve(f);
    const logger = Q.logger(f.loggerId);
    const comp = Q.competition(logger.competitionId);
    return '<div class="wf-stack"><div class="wf-kv">' +
      '<span>File</span><span><b>' + e(f.name) + '</b> <button class="wf-btn small" data-act="fakeDownload" data-what="' + e(f.name) + '">Download</button></span>' +
      '<span>SHA-256</span><span class="mono">' + f.sha + '…</span>' +
      '<span>Uploaded</span><span>' + W.dt(f.uploadedAt) + ' by ' + f.uploadedBy + (f.suggestedCid ? ', pilot chose ' + e(f.suggestedClass) + ' ' + e(f.suggestedCid) : '') + '</span>' +
      '<span>Logger</span><span><a href="#' + L().logger(logger) + '">' + e(Q.loggerLabel(logger)) + '</a>' + (res.role ? ' · ' + res.role : '') + '</span>' +
      '<span>Recorded date</span><span>' + W.date(f.recordedDate, true) + '</span>' +
      '<span>Flight date</span><span>' + W.date(f.flightDate, true) + (f.dateOverride ? ' → <b>' + W.date(f.dateOverride, true) + '</b> (override)' : '') + '</span>' +
      '<span>G record</span><span>' + ({ valid: 'valid', invalid: 'not valid', none: 'not checked' })[f.gRecord] + '</span>' +
      '<span>Resolves to</span><span>' + (res.ok ? '<a href="#' + L().result(res.result) + '">' + e(res.competitor.cid) + ' · ' + e(W.dayTitle(res.classDay)) + '</a>' + (res.result.scoredFileId === f.id ? ' <span class="wf-badge solid">scored file</span>' : '') : '<span class="wf-badge dashed">unresolved</span> ' + e(res.reason)) + '</span>' +
      '<span>Analysis</span><span>' + (f.analysis.stale.length ? W.staleBadge(f) + ' ' : '') + 'engine ' + f.analysis.engine + ', ran ' + W.dt(f.analysis.ranAt) + ' <button class="wf-btn small" data-act="rerun" data-file="' + f.id + '"' + (f.analysis.stale.length ? '' : ' title="Not stale"') + '>Rerun analysis</button></span>' +
      '</div>' +
      (!res.ok && !f.deleted ? '<div class="wf-note warn"><b>Unresolved.</b> ' + e(res.reason) + '. <button class="wf-btn small primary" data-act="linkUnknown" data-file="' + f.id + '">Link logger…</button> <button class="wf-btn small" data-act="dateOverrideDialog" data-file="' + f.id + '">Set flight date…</button></div>' : '') +
      '<div class="wf-row">' + (res.ok ? '<button class="wf-btn small" data-act="dateOverrideDialog" data-file="' + f.id + '">Set flight date…</button>' : '') +
      '<label class="wf-field inline"><input type="checkbox" data-change="setPrivate" data-file="' + f.id + '" ' + (f.private ? 'checked' : '') + '> private (hash kept out of published results)</label>' +
      (f.deleted ? '<span class="wf-badge none">deleted. A re-upload of the same file restores it.</span>' : '<button class="wf-btn small danger" data-act="deleteFile" data-file="' + f.id + '">Delete file</button>') + '</div>' +
      '<form class="wf-row" data-submit="fileRemark" data-file="' + f.id + '">' + input('internalRemark', f.internalRemark, 'placeholder="Internal remark (scorers and staff only)" style="flex:1"') + '<button class="wf-btn small">Save remark</button></form></div>';
  };
  H.rerun = (ds) => {
    A.rerun(Q.file(ds.file));
    KH.toast('Analysis rerun');
  };
  H.setPrivate = (v, ds) => A.setFileField(Q.file(ds.file), { private: v });
  H.fileRemark = (d, ds) => {
    A.setFileField(Q.file(ds.file), { internalRemark: d.internalRemark });
    KH.toast('Remark saved');
  };
  H.deleteFile = (ds) => {
    const f = Q.file(ds.file);
    const res = Q.resolve(f);
    if (res.ok && res.result.scoredFileId === f.id) throw new KH.Denied('The scored file cannot be deleted. Pick another scored file first.');
    KH.confirm({ title: 'Delete ' + f.name + '?', intro: 'The file stops counting for any result. Uploading the same file again restores it as if new.', confirmLabel: 'Delete file', onConfirm: () => KH.run(() => A.deleteFile(f)) });
  };
  H.linkUnknown = (ds) => {
    const f = Q.file(ds.file);
    const l = Q.logger(f.loggerId);
    const comp = Q.competition(l.competitionId);
    const sug = f.suggestedCid ? S.competitors.find((c) => c.competitionId === comp.id && c.cid === f.suggestedCid && Q.class(c.classId).name === f.suggestedClass) : null;
    const hasPrimary = sug && S.loggers.some((x) => { const k = Q.linkOn(x, Q.flightDate(f)); return k && k.competitorId === sug.id && k.role === 'primary'; });
    KH.modal({ title: 'Link ' + Q.loggerLabel(l), body: '<p>Prefilled from the pilot\'s choice and the flight date. A test file before the competition gives a link covering every class day.</p>' + W.linkForm(l, { competitorId: sug && sug.id, from: Q.flightDate(f), role: hasPrimary ? 'secondary' : 'primary' }) + (l.links.length ? W.loggerLinks(l) : '') });
  };
  H.dateOverrideDialog = (ds) => {
    const f = Q.file(ds.file);
    const comp = Q.competition(Q.logger(f.loggerId).competitionId);
    KH.modal({ title: 'Flight date of ' + f.name, body: '<p>The flight date picks the logger link and class day. Recorded date ' + W.date(f.recordedDate, true) + ', derived flight date ' + W.date(f.flightDate, true) + '.</p><form class="wf-row" data-submit="setDateOverride" data-file="' + f.id + '">' + select('date', [['', 'No override']].concat(comp.dates.map((d) => [d, W.date(d)])), f.dateOverride) + '<button class="wf-btn primary small">Set</button></form>' });
  };
  H.setDateOverride = (d, ds) => {
    const f = Q.file(ds.file);
    const before = Q.resolve(f);
    const saved = f.dateOverride;
    f.dateOverride = d.date;
    const after = Q.resolve(f);
    f.dateOverride = saved;
    const moves = (before.ok ? before.result : null) !== (after.ok ? after.result : null) ? [{ file: f, from: before.ok ? before.competitor.cid + ' ' + Q.dayLabel(before.classDay.classId, before.classDay.date) : 'unresolved', to: after.ok ? after.competitor.cid + ' ' + Q.dayLabel(after.classDay.classId, after.classDay.date) : 'unresolved' }] : [];
    confirmMoves('Change the flight date?', moves, () => KH.run(() => { A.setDateOverride(f, d.date); KH.closeModal(); KH.toast('Flight date set'); }));
  };

  // ---------- analysis ----------

  // Reminders that depend on the current scored file and links, derived at display time.
  function contextEntries(f, res) {
    const out = [];
    if (!res.ok) return out;
    const cls = Q.class(res.classDay.classId);
    if (res.role === 'secondary' && res.result.scoredFileId === f.id) {
      out.push({ level: 'warning', time: '', text: 'The scored file is from a secondary logger. Consider a public remark that indicates its use.', rule: KH.ruleRef('secondary', cls.edition) });
      if (KH.effective(res.classDay, cls).pevStart === 'yes') out.push({ level: 'warning', time: '', text: 'PEVs of this secondary logger are used for the start. The rule set accepts PEVs only from the primary logger. Use a start override if the primary has a valid PEV.', rule: KH.ruleRef('secondary-pev', cls.edition) });
    }
    if (f.suggestedCid && (f.suggestedCid !== res.competitor.cid || f.suggestedClass !== cls.name)) {
      out.push({ level: 'warning', time: '', text: 'The pilot chose ' + f.suggestedClass + ' ' + f.suggestedCid + ' on upload, but the logger link resolves to ' + cls.name + ' ' + res.competitor.cid + '.', adjust: true });
    }
    return out;
  }

  W.analysisLog = (f, opts) => {
    const showDebug = KH.ui.showDebug;
    const res = Q.resolve(f);
    const scored = res.ok && res.result.scoredFileId === f.id;
    if (f.analysis.state === 'pending') return '<div class="wf-stack"><h4 style="margin:0">Analysis log</h4><div class="wf-empty">Analysis is running. Uploaded ' + W.dt(f.uploadedAt) + '.</div></div>';
    const all = contextEntries(f, res).concat(f.analysis.log);
    const entries = all.filter((x) => showDebug || x.level !== 'debug');
    const hidden = all.filter((x) => x.level === 'debug').length;
    return '<div class="wf-stack"><div class="wf-row between"><h4 style="margin:0">Analysis log</h4><button class="wf-btn small ghost" data-act="toggleDebug">' + (showDebug ? 'Hide' : 'Show') + ' ' + hidden + ' debug entries</button></div>' +
      (f.analysis.stale.length ? '<div class="wf-note warn">Stale since ' + W.dt(f.analysis.stale[0].at) + ': ' + e(f.analysis.stale.map((s) => s.reason).join(', ')) + '. The result below is from the previous run. <button class="wf-btn small primary" data-act="rerun" data-file="' + f.id + '">Rerun</button></div>' : '') +
      '<table class="wf-table"><thead><tr><th>Time</th><th>Level</th><th>Entry</th><th>Rule</th><th></th></tr></thead><tbody>' +
      entries.map((x) => {
        let act = '';
        if (x.suggestion && res.ok) act = f.overrides.flightEnd === x.suggestion.time ? '<span class="wf-badge solid">flight end set</span>' : '<button class="wf-btn small" data-act="acceptFlightEnd" data-file="' + f.id + '" data-time="' + x.suggestion.time + '">Accept flight end ' + x.suggestion.time + '</button>';
        if (x.kind === 'near-miss' && res.ok) act = '<button class="wf-btn small" data-act="creditTp" data-file="' + f.id + '" data-idx="' + x.tpIndex + '">Credit turnpoint</button>';
        if (x.kind === 'finish-miss' && res.ok) act = '<button class="wf-btn small" data-act="creditFinish" data-file="' + f.id + '">Credit finish</button>';
        if (x.kind === 'start' && x.candidate && !x.text.includes('(in use)') && res.ok) act = '<button class="wf-btn small" data-act="useCandidate" data-file="' + f.id + '" data-time="' + x.candidate + '">Use this start</button>';
        if (x.adjust) act = '<a class="wf-btn small" href="#' + L().logger(Q.logger(f.loggerId)) + '">Adjust links</a>';
        return '<tr class="log-' + x.level + '"><td class="mono nowrap">' + (x.time || '') + '</td><td>' + W.level(x.level) + '</td><td>' + e(x.text) + '</td><td class="small muted nowrap">' + e(x.rule || '') + '</td><td class="right nowrap">' + act + '</td></tr>';
      }).join('') + '</tbody></table>' + (opts && opts.hideNote ? '' : '<p class="muted small">Warnings need a look. Errors mean a check could not run, and reviewing them does not complete the analysis.' + (scored ? '' : ' Overrides apply to this file and stay with it.') + '</p>') + '</div>';
  };
  H.toggleDebug = () => (KH.ui.showDebug = !KH.ui.showDebug);

  W.startCandidates = (f) => {
    const cands = f.analysis.candidates || [];
    if (!cands.length) return '<p class="muted small">No start candidates' + (f.analysis.output ? '' : ' until task analysis runs') + '.</p>';
    return '<div class="wf-stack"><table class="wf-table"><thead><tr><th>Crossing</th><th class="num">Altitude</th><th class="num">Ground speed</th><th>PEV</th><th>Breaches</th><th></th></tr></thead><tbody>' +
      cands.map((c) => '<tr class="' + (c.inUse ? 'sel' : '') + '"><td class="mono">' + c.time + '</td><td class="num">' + c.alt + ' m</td><td class="num">' + c.gs + ' km/h</td><td>' + e(c.pev || '—') + '</td><td>' + (c.breaches.length ? c.breaches.map(e).join('<br>') : '<span class="muted">valid</span>') + '</td><td class="right nowrap">' +
        (c.auto ? '<span class="wf-badge">automatic</span> ' : '') + (c.inUse ? '<span class="wf-badge solid">in use</span>' : '<button class="wf-btn small" data-act="useCandidate" data-file="' + f.id + '" data-time="' + c.time + '">Use</button>') + '</td></tr>').join('') +
      '</tbody></table><form class="wf-row" data-submit="freeStart" data-file="' + f.id + '"><span class="small">Or a free start time</span>' + input('time', f.overrides.start && f.overrides.start.kind === 'free' ? f.overrides.start.time : '', 'placeholder="hh:mm:ss" class="mid"') + '<button class="wf-btn small">Set start</button></form></div>';
  };
  H.useCandidate = (ds) => {
    A.setOverride(Q.file(ds.file), 'start', { kind: 'candidate', time: ds.time });
    KH.toast('Start override set to ' + ds.time + '. Analysis reran.');
  };
  H.freeStart = (d, ds) => A.setOverride(Q.file(ds.file), 'start', { kind: 'free', time: d.time });
  H.acceptFlightEnd = (ds) => {
    A.setOverride(Q.file(ds.file), 'flightEnd', ds.time);
    KH.toast('Flight end override at ' + ds.time + '. Analysis reran.');
  };
  H.creditFinish = (ds) => {
    A.creditFinish(Q.file(ds.file));
    KH.toast('Finish credited. Analysis reran.');
  };
  H.pinAat = (d, ds) => A.pinAatFix(Q.file(ds.file), Number(d.idx), d.time);
  H.creditTp = (ds) => {
    A.creditTurnpoint(Q.file(ds.file), Number(ds.idx));
    KH.toast('Turnpoint credited. Analysis reran.');
  };

  W.overrides = (f) => {
    const o = f.overrides;
    const items = [];
    if (o.start) items.push(['start', 'Start: ' + (o.start.kind === 'free' ? 'free time ' : 'candidate ') + o.start.time]);
    if (o.flightEnd) items.push(['flightEnd', 'Flight end: ' + o.flightEnd]);
    if (o.tpCredits && o.tpCredits.length) items.push(['tpCredits', 'Turnpoint credit: ' + o.tpCredits.map((c) => c.idx + 1 + ' ' + c.name).join(', ')]);
    if (o.finishCredit) items.push(['finishCredit', 'Finish credit: ' + o.finishCredit.name]);
    if (o.finishTime) items.push(['finishTime', 'Finish time: ' + o.finishTime]);
    for (const [k, v] of Object.entries(o.aatPins || {})) items.push(['aatPin:' + k, 'Pinned fix in assigned area ' + (Number(k) + 1) + ' ' + v.name + ': ' + v.time]);
    const res = Q.resolve(f);
    const task = res.ok ? Q.task(res.classDay) : null;
    return '<div class="wf-stack">' + (items.length ? '<table class="wf-table"><tbody>' + items.map(([k, t]) => '<tr><td>' + e(t) + '</td><td class="right"><button class="wf-btn small" data-act="clearOverride" data-file="' + f.id + '" data-kind="' + k + '">Remove</button></td></tr>').join('') + '</tbody></table>' : '<p class="muted small">No overrides on this file.</p>') +
      '<form class="wf-row" data-submit="setFlightEnd" data-file="' + f.id + '">' + input('time', o.flightEnd, 'placeholder="hh:mm:ss" class="mid"') + '<button class="wf-btn small">Set flight end</button></form>' +
      '<form class="wf-row" data-submit="setFinishTime" data-file="' + f.id + '">' + input('time', o.finishTime, 'placeholder="hh:mm:ss" class="mid"') + '<button class="wf-btn small">Set finish time</button></form>' +
      (task && task.type === 'aat' ? '<form class="wf-row" data-submit="pinAat" data-file="' + f.id + '">' + select('idx', task.points.slice(1, -1).map((p, i) => [i, 'Area ' + (i + 1) + ' ' + p.name])) + input('time', '', 'placeholder="hh:mm:ss" class="mid"') + '<button class="wf-btn small">Pin fix</button><span class="muted small">Empty time removes the pin</span></form>' : '') +
      '<p class="muted small">Overrides belong to the file. They stay when it is analysed again and follow it within its class day.</p></div>';
  };
  H.clearOverride = (ds) => (ds.kind.startsWith('aatPin:') ? A.pinAatFix(Q.file(ds.file), Number(ds.kind.slice(7)), '') : A.setOverride(Q.file(ds.file), ds.kind, null));
  H.setFlightEnd = (d, ds) => A.setOverride(Q.file(ds.file), 'flightEnd', d.time || null);
  H.setFinishTime = (d, ds) => A.setOverride(Q.file(ds.file), 'finishTime', d.time || null);

  W.outputSummary = (f) => {
    const o = f.analysis.output;
    if (!o) return '<p class="muted">' + (f.analysis.state === 'pending' ? 'Analysis is running.' : f.analysis.log.some((l) => l.kind === 'parse') ? 'The file failed to parse. The competitor needs another file or a manual result.' : Q.resolve(f).ok ? 'No task analysis yet: waiting for a published task.' : 'Only the analysis that needs no class day ran.') + '</p>';
    return '<div class="wf-kv"><span>Start</span><span class="mono">' + o.start + '</span><span>' + (o.finished ? 'Finish' : 'Landing') + '</span><span class="mono">' + (o.finished ? o.finish : o.landing) + (o.flightEnd ? ' (flight end ' + o.flightEnd + ')' : '') + '</span><span>Distance</span><span>' + W.km(o.distance) + '</span><span>Time</span><span class="mono">' + (o.time || '—') + '</span><span>Speed</span><span>' + (o.speed ? W.kmh(o.speed) : '—') + '</span></div>';
  };

  // ---------- results ----------

  W.resultsTable = (cd, opts) => {
    const { rows, params } = KH.score(cd);
    const cls = Q.class(cd.classId);
    const filter = (opts && opts.filter) || '';
    const shown = rows.filter((x) => !filter || (filter === 'check' && x.result.checkReasons.length) || (filter === 'unknown' && x.status === 'unknown') || (filter === 'stale' && x.result.scoredFileId && Q.file(x.result.scoredFileId).analysis.stale.length) || (filter === 'stale' && Q.filesOfResult(x.result).some((f) => f.analysis.stale.length)));
    return '<div class="wf-stack"><div class="muted small">Working scores. N ' + params.N + ', n1 ' + params.n1 + ', Do ' + params.Do + ' km, Vo ' + params.Vo + ' km/h, Pm ' + params.Pm + (cls.handicapScale ? ' · handicapped (scale ' + cls.handicapScale + ')' : '') + '</div>' +
      '<div class="wf-table-wrap"><table class="wf-table"><thead><tr><th>Rank</th><th>CID</th><th>Pilot</th><th>Glider</th><th>Result</th><th>Review</th><th>Files</th><th>Start</th><th>Finish</th><th class="num">Distance</th><th class="num">Speed</th><th class="num">Penalty</th><th class="num">Points</th></tr></thead><tbody>' +
      shown.map((x) => {
        const r = x.result;
        const files = Q.filesOfResult(r);
        const stale = files.some((f) => f.analysis.stale.length);
        const sel = opts && opts.selected === r.id;
        return '<tr class="link' + (x.placeholder ? ' dim' : '') + (sel ? ' sel' : '') + '" data-href="' + L().result(r) + '"><td>' + e(x.rankLabel) + '</td><td><b>' + e(x.competitor.cid) + '</b></td><td>' + e(Q.crewName(x.competitor)) + '</td><td class="small">' + e(x.competitor.gliderType) + '</td><td>' + W.resultStatus(r) + '</td><td>' + W.reviewBadge(r) + '</td><td class="nowrap">' + files.length + (stale ? ' <span class="wf-badge dashed">stale</span>' : '') + '</td>' +
          '<td class="mono">' + (x.start || '') + '</td><td class="mono">' + (x.finish || '') + '</td><td class="num">' + (x.placeholder ? 'No result yet' : W.km(x.distance)) + '</td><td class="num">' + W.kmh(x.speed) + '</td><td class="num">' + (r.penalty ? '−' + r.penalty.points : '') + '</td><td class="num"><b>' + (x.points ?? '') + '</b></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  };

  W.checkReasons = (r) =>
    r.checkReasons.length
      ? '<div class="wf-box fill"><div class="wf-row between"><b>Check reasons</b><button class="wf-btn small primary" data-act="review" data-result="' + r.id + '" data-count="' + r.checkReasons.length + '">Reviewed, clear ' + r.checkReasons.length + '</button></div><ul style="margin:6px 0 0;padding-left:18px">' +
        r.checkReasons.map((c) => '<li>' + e(c.text) + (c.file ? ': ' + e(Q.file(c.file).name) : '') + ' <span class="muted small">' + W.dt(c.at) + '</span></li>').join('') + '</ul></div>'
      : '<div class="wf-row"><span class="wf-badge">OK</span><span class="muted small">No check reasons. To ask a colleague to look, leave an internal remark.</span></div>';
  H.review = (ds) => {
    A.review(Q.result(ds.result), Number(ds.count));
    KH.toast('Reviewed');
    if (KH.app.afterReview) KH.app.afterReview(Q.result(ds.result));
  };

  W.resultFiles = (r) => {
    const files = Q.filesOfResult(r);
    return '<table class="wf-table"><thead><tr><th>File</th><th>Role</th><th>Uploaded</th><th>Analysis</th><th></th></tr></thead><tbody>' +
      (files.length ? files.map((f) => {
        const res = Q.resolve(f);
        const scored = r.scoredFileId === f.id;
        return '<tr class="' + (scored ? 'sel' : '') + '"><td><a href="#' + L().file(f) + '">' + e(f.name) + '</a></td><td>' + res.role + '</td><td>' + W.dt(f.uploadedAt) + '</td><td>' + (W.staleBadge(f) || (f.analysis.output ? (f.analysis.output.finished ? 'finished ' : 'landed ') + W.km(f.analysis.output.distance) : 'waiting')) + '</td><td class="right">' + (scored ? '<span class="wf-badge solid">scored file</span>' : '<button class="wf-btn small" data-act="scoreFile" data-result="' + r.id + '" data-file="' + f.id + '">Score this file</button>') + '</td></tr>';
      }).join('') : '<tr><td colspan="5" class="muted">No file resolves to this result.</td></tr>') + '</tbody></table>';
  };
  H.scoreFile = (ds) => {
    A.setScoredFile(Q.result(ds.result), Q.file(ds.file));
    KH.toast('Scored file chosen');
  };

  W.resultStatusControl = (r) =>
    '<div class="wf-row"><span class="muted small">Result status</span>' + ['unknown', 'did not fly', 'scored file', 'manual result'].map((s) =>
      '<button class="wf-btn small' + (r.status === s ? ' primary' : '') + '" data-act="setResultStatus" data-result="' + r.id + '" data-status="' + s + '"' + (s === 'scored file' && !Q.filesOfResult(r).length ? ' disabled' : '') + '>' + s + '</button>').join('') + '</div>';
  H.setResultStatus = (ds) => {
    const r = Q.result(ds.result);
    if (ds.status === 'scored file') {
      const files = Q.filesOfResult(r);
      const f = files.find((x) => x.id === r.lastScoredFileId) || (files.length === 1 ? files[0] : null);
      if (!f) throw new KH.Denied(files.length ? 'Pick the scored file in the file list' : 'No file resolves to this result');
      A.setScoredFile(r, f);
    } else A.setResultStatus(r, ds.status);
  };

  W.manualForm = (r) => {
    const m = r.manual || {};
    return '<form class="wf-stack" data-submit="saveManual" data-result="' + r.id + '"><div class="wf-form">' +
      field('Start time', input('startTime', m.startTime, 'placeholder="hh:mm:ss" class="mid"')) +
      field('Finished', '<input type="checkbox" name="finished" ' + (m.finished ? 'checked' : '') + '>', { inline: true }) +
      field('Finish time', input('finishTime', m.finishTime, 'placeholder="hh:mm:ss" class="mid"'), { hint: 'When finished' }) +
      field('Distance (km)', input('distance', m.distance, 'class="mid"'), { hint: 'When not finished, always on an AAT' }) +
      field('Landing position', input('landing', m.landing, 'placeholder="Racing distance helper"'), { full: true }) +
      '</div><div class="wf-row"><button class="wf-btn primary">Save manual result</button><span class="muted small">Switching back to a file discards nothing.</span></div></form>';
  };
  H.saveManual = (d, ds) => {
    A.saveManual(Q.result(ds.result), { startTime: d.startTime, finished: !!d.finished, finishTime: d.finishTime, distance: d.distance, landing: d.landing });
    KH.toast('Manual result saved');
  };

  W.penaltyForm = (r) => {
    const p = r.penalty || {};
    return '<form class="wf-stack" data-submit="savePenalty" data-result="' + r.id + '"><div class="wf-form">' +
      field('Penalty points', input('points', p.points ?? '', 'class="mid" placeholder="0 = official warning"')) +
      field('Public remark', input('publicRemark', p.publicRemark, 'required'), { full: true }) +
      field('Internal remark', input('internalRemark', p.internalRemark), { full: true }) +
      '</div><div class="wf-row"><button class="wf-btn">' + (r.penalty ? 'Save penalty' : 'Add penalty') + '</button>' + (r.penalty ? '<button type="button" class="wf-btn ghost" data-act="clearPenalty" data-result="' + r.id + '">Remove</button>' : '') + '<span class="muted small">Deducted after the formula, floored at zero.</span></div></form>';
  };
  H.savePenalty = (d, ds) => {
    A.setPenalty(Q.result(ds.result), { points: Number(d.points || 0), publicRemark: d.publicRemark, internalRemark: d.internalRemark });
    KH.toast(Number(d.points || 0) ? 'Penalty saved' : 'Official warning saved');
  };
  H.clearPenalty = (ds) => A.setPenalty(Q.result(ds.result), null);

  W.resultRemarks = (r) => {
    const c = Q.competitor(r.competitorId);
    return '<form class="wf-stack" data-submit="resultRemarks" data-result="' + r.id + '"><div class="wf-form">' +
      field('Handicap override', input('handicapOverride', r.handicapOverride, 'class="mid" placeholder="' + (c.handicap ?? '—') + '"'), { hint: 'This class day only' }) +
      field('Public remark', input('publicRemark', r.publicRemark), { full: true }) +
      field('Internal remark', input('internalRemark', r.internalRemark), { full: true, hint: 'Scorers and staff only' }) +
      '</div><button class="wf-btn small">Save</button></form>';
  };
  H.resultRemarks = (d, ds) => {
    A.setResultField(Q.result(ds.result), d);
    KH.toast('Saved');
  };

  // ---------- members, account, staff ----------

  W.members = (comp) => {
    const admin = Q.can('members', comp);
    const me = Q.me();
    const members = Q.membersOf(comp.id);
    const inv = S.invitations.filter((i) => i.competitionId === comp.id);
    const cinv = S.competitionInvitations.filter((i) => i.competitionId === comp.id);
    return '<div class="wf-stack"><table class="wf-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>' +
      members.map((m) => {
        const u = Q.user(m.userId);
        return '<tr><td>' + e(u.name) + (u.id === me.id ? ' <span class="muted">(you)</span>' : '') + '</td><td>' + e(u.email) + '</td><td>' + (admin ? select('role', ['admin', 'scorer'], m.role, 'data-change="setRole" data-comp="' + comp.id + '" data-user="' + u.id + '"') : m.role) + '</td><td class="right">' +
          (admin && u.id !== me.id ? '<button class="wf-btn small" data-act="removeMember" data-comp="' + comp.id + '" data-user="' + u.id + '">Remove</button>' : '') + (u.id === me.id ? '<button class="wf-btn small" data-act="removeMember" data-comp="' + comp.id + '" data-user="' + u.id + '" data-leave="1">Leave</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (members.filter((m) => m.role === 'admin').length === 0 ? '<div class="wf-note warn">This competition has no admin. Only staff can perform admin actions until staff invite or promote one.</div>' : '') +
      '<h4>Pending invitations</h4>' +
      (inv.length + cinv.length ? '<table class="wf-table"><tbody>' +
        inv.map((i) => '<tr><td>' + e(i.email) + '</td><td>' + i.role + '</td><td class="muted small">new user · sent by ' + e(Q.user(i.inviterId).name) + ' · expires ' + W.dt(i.expires) + '</td><td class="right">' + (admin ? '<button class="wf-btn small" data-act="revoke" data-id="' + i.id + '">Revoke</button>' : '') + '</td></tr>').join('') +
        cinv.map((i) => '<tr><td>' + e(Q.user(i.inviteeId).email) + '</td><td>' + i.role + '</td><td class="muted small">existing user · sent by ' + e(Q.user(i.senderId).name) + ' · expires ' + W.dt(i.expires) + '</td><td class="right">' + (admin ? '<button class="wf-btn small" data-act="revoke" data-id="' + i.id + '">Revoke</button>' : '') + '</td></tr>').join('') +
        '</tbody></table>' : '<p class="muted small">None</p>') +
      (admin ? '<form class="wf-row" data-submit="invite" data-comp="' + comp.id + '">' + input('email', '', 'type="email" required placeholder="email@example.org" style="min-width:240px"') + select('role', ['scorer', 'admin']) + '<button class="wf-btn primary small">Invite</button><span class="muted small">An existing user gets a competition invitation. Anyone else gets an invitation that counts toward your limit.</span></form>' : '<p class="muted small">Only admins manage members.</p>') + '</div>';
  };
  H.invite = (d, ds) => {
    const comp = ds.comp ? Q.competition(ds.comp) : null;
    const kind = A.invite(comp, d.email, d.role);
    KH.toast('Sent ' + kind + ' to ' + d.email);
  };
  H.revoke = (ds) => A.revokeInvitation(ds.id);
  H.setRole = (v, ds) => A.setRole(Q.competition(ds.comp), ds.user, v);
  H.removeMember = (ds) => {
    const comp = Q.competition(ds.comp);
    KH.confirm({ title: ds.leave ? 'Leave ' + comp.name + '?' : 'Remove ' + Q.user(ds.user).name + '?', confirmLabel: ds.leave ? 'Leave' : 'Remove', onConfirm: () => KH.run(() => { A.removeMember(comp, ds.user); if (ds.leave) KH.go('/'); }) });
  };
  H.acceptCI = (ds) => {
    const ci = S.competitionInvitations.find((i) => i.id === ds.id);
    A.acceptCompetitionInvitation(ds.id);
    KH.toast('Joined ' + Q.competition(ci.competitionId).name + ' as ' + ci.role);
  };

  W.incomingInvitations = () => {
    const me = Q.me();
    const list = S.competitionInvitations.filter((i) => i.inviteeId === me.id);
    if (!list.length) return '';
    return '<div class="wf-box fill"><h3>Competition invitations</h3>' + list.map((i) => '<div class="wf-row between"><span><b>' + e(Q.competition(i.competitionId).name) + '</b> as ' + i.role + ' <span class="muted small">from ' + e(Q.user(i.senderId).name) + ', expires ' + W.dt(i.expires) + '. Ignore it to decline.</span></span><button class="wf-btn primary small" data-act="acceptCI" data-id="' + i.id + '">Accept</button></div>').join('') + '</div>';
  };

  W.account = () => {
    const me = Q.me();
    const mine = S.invitations.filter((i) => i.inviterId === me.id);
    const accepted = S.users.filter((u) => u.inviterId === me.id);
    const used = Q.invitationsUsed(me.id);
    return '<div class="wf-stack"><div class="wf-kv"><span>Name</span><span>' + e(me.name) + '</span><span>Email</span><span>' + e(me.email) + '</span><span>Invited by</span><span>' + (me.inviterId ? e(Q.user(me.inviterId).name) : '—') + '</span><span>Invitations</span><span>' + (me.staff ? 'No limit (staff)' : used + ' of ' + me.invitationLimit + ' used, ' + (me.invitationLimit - used) + ' left') + '</span></div>' +
      '<h4>Invite someone to Keyhole</h4><form class="wf-row" data-submit="invite">' + input('email', '', 'type="email" required placeholder="email@example.org" style="min-width:240px"') + '<button class="wf-btn primary small">Send invitation</button><span class="muted small">Without a competition, for example a fellow organiser. Expires after 7 days.</span></form>' +
      '<h4>My invitations</h4><table class="wf-table"><thead><tr><th>Email</th><th>Competition</th><th>State</th><th></th></tr></thead><tbody>' +
      mine.map((i) => '<tr><td>' + e(i.email) + '</td><td>' + (i.competitionId ? e(Q.competition(i.competitionId)?.name || '') + ' (' + i.role + ')' : '—') + '</td><td>' + (i.expires < KH.NOW ? 'expired' : 'pending until ' + W.dt(i.expires)) + '</td><td class="right"><button class="wf-btn small" data-act="revoke" data-id="' + i.id + '">Revoke</button></td></tr>').join('') +
      accepted.map((u) => '<tr><td>' + e(u.deleted ? '(deleted user)' : u.email) + '</td><td></td><td>accepted</td><td></td></tr>').join('') +
      (mine.length + accepted.length ? '' : '<tr><td colspan="4" class="muted">None yet</td></tr>') + '</tbody></table></div>';
  };

  W.staffUsers = () => {
    const kids = (id) => S.users.filter((u) => u.inviterId === id);
    const node = (u) => {
      const pending = S.invitations.filter((i) => i.inviterId === u.id);
      return '<li><div class="wf-row"><b>' + e(u.deleted ? '(deleted user)' : u.name) + '</b><span class="muted small">' + e(u.email) + '</span>' + (u.staff ? '<span class="wf-badge solid">staff</span>' : '') + (u.blocked ? '<span class="wf-badge">blocked</span>' : '') +
        (!u.staff && !u.deleted ? '<span class="muted small">' + Q.invitationsUsed(u.id) + '/' + u.invitationLimit + ' invitations</span>' : '') +
        '<span class="muted small">' + S.memberships.filter((m) => m.userId === u.id).map((m) => Q.competition(m.competitionId).slug + ' ' + m.role).join(', ') + '</span>' +
        (!u.deleted && u.id !== Q.me().id ? (u.blocked ? '<button class="wf-btn small" data-act="unblockUser" data-user="' + u.id + '">Unblock</button>' : '<button class="wf-btn small" data-act="blockUserDialog" data-user="' + u.id + '">Block</button>') +
          '<form class="wf-row" data-submit="setLimit" data-user="' + u.id + '">' + input('limit', u.invitationLimit, 'class="narrow"') + '<button class="wf-btn small">Set limit</button></form><button class="wf-btn small danger" data-act="softDelete" data-user="' + u.id + '">Delete</button>' : '') + '</div>' +
        (u.blocked ? '<div class="muted small">Blocked ' + W.dt(u.blocked.at) + ' by ' + e(Q.user(u.blocked.by).name) + ': ' + e(u.blocked.note) + '</div>' : '') +
        (pending.length ? '<div class="muted small">Pending: ' + pending.map((i) => e(i.email) + (i.expires < KH.NOW ? ' (expired)' : '')).join(', ') + '</div>' : '') +
        (kids(u.id).length ? '<ul>' + kids(u.id).map(node).join('') + '</ul>' : '') + '</li>';
    };
    return '<div class="wf-tree"><ul>' + S.users.filter((u) => !u.inviterId).map(node).join('') + '</ul></div>';
  };
  H.blockUserDialog = (ds) => {
    const u = Q.user(ds.user);
    KH.modal({ title: 'Block ' + u.name + '?', body: '<p>Bars login and revokes their pending invitations. Their competitions stay up unless you block those too.</p><form class="wf-stack" data-submit="blockUser" data-user="' + u.id + '">' + field('Internal note', input('note', '', 'required'), { full: true }) + '<div class="wf-row end"><button class="wf-btn primary">Block user</button></div></form>' });
  };
  H.blockUser = (d, ds) => {
    A.blockUser(Q.user(ds.user), d.note);
    KH.closeModal();
  };
  H.unblockUser = (ds) => A.unblockUser(Q.user(ds.user));
  H.setLimit = (d, ds) => A.setInvitationLimit(Q.user(ds.user), Number(d.limit));
  H.softDelete = (ds) => {
    const u = Q.user(ds.user);
    KH.confirm({ title: 'Delete ' + u.name + '?', items: ['Removes name, email, sessions and staff flag. The inviter link stays.', 'Removes their memberships and every pending invitation they sent or received.', 'A competition whose last admin this is is left without an admin.'], confirmLabel: 'Delete user', onConfirm: () => KH.run(() => A.softDeleteUser(u)) });
  };

  W.staffCompetitions = () =>
    '<table class="wf-table"><thead><tr><th>Competition</th><th>Created</th><th>Admins</th><th>State</th><th></th></tr></thead><tbody>' +
    S.competitions.map((c) => '<tr><td><a href="#' + L().competition(c) + '"><b>' + e(c.name) + '</b></a><div class="muted small">/' + c.slug + ' · ' + e(c.organiser) + '</div></td><td>' + W.dt(c.createdAt) + '<div class="muted small">by ' + e(Q.user(c.createdBy).name) + '</div></td><td>' + Q.membersOf(c.id).filter((m) => m.role === 'admin').map((m) => e(Q.user(m.userId).name)).join(', ') + '</td><td>' + (c.blocked ? '<span class="wf-badge solid">blocked</span>' : '') + ' ' + c.lifecycle + '</td><td class="right">' +
      (c.blocked ? '<button class="wf-btn small" data-act="unblockComp" data-comp="' + c.id + '">Unblock</button>' : '<button class="wf-btn small" data-act="blockCompDialog" data-comp="' + c.id + '">Block</button>') + '</td></tr>').join('') + '</tbody></table>';
  H.blockCompDialog = (ds) => {
    const c = Q.competition(ds.comp);
    KH.modal({ title: 'Block ' + c.name + '?', body: '<p>Takes the competition down: to everyone except staff it looks like it does not exist. Its published files move to a private prefix and it is frozen until you unblock or delete it.</p><form class="wf-stack" data-submit="blockComp" data-comp="' + c.id + '">' + field('Internal note', input('note', '', 'required'), { full: true }) + '<div class="wf-row end"><button class="wf-btn primary">Block competition</button></div></form>' });
  };
  H.blockComp = (d, ds) => {
    A.blockCompetition(Q.competition(ds.comp), d.note);
    KH.closeModal();
  };
  H.unblockComp = (ds) => A.unblockCompetition(Q.competition(ds.comp));

  W.lifecycle = (comp) => {
    const admin = Q.can('archive', comp);
    if (comp.lifecycle === 'archived') return '<div class="wf-stack"><p>Archived ' + W.dt(comp.archivedAt) + '. Only the published results remain and they can no longer change.</p>' + (Q.can('delete', comp) ? '<button class="wf-btn danger" data-act="deleteComp" data-comp="' + comp.id + '">Delete competition…</button>' : '') + '</div>';
    return '<div class="wf-stack"><div class="wf-box"><h3>Archive</h3><p>Archiving removes the scoring work from Keyhole and keeps only the published results, which can then no longer change. The upload password stops working.</p>' +
      (admin ? '<button class="wf-btn" data-act="archiveComp" data-comp="' + comp.id + '">Archive competition…</button>' : '<p class="muted small">Admin only</p>') + '</div>' +
      '<div class="wf-box dashed"><h3>Delete</h3><p>Removes the competition, its public pages and IGC downloads for good, and frees the slug. Staff get an email.</p>' +
      (admin ? '<button class="wf-btn danger" data-act="deleteComp" data-comp="' + comp.id + '">Delete competition…</button>' : '<p class="muted small">Admin only</p>') + '</div></div>';
  };
  H.archiveComp = (ds) => {
    const comp = Q.competition(ds.comp);
    const items = [];
    for (const cls of Q.classesOf(comp.id)) for (const cd of Q.classDaysOf(cls.id)) {
      if (!['final', 'cancelled'].includes(cd.status)) items.push(e(W.dayTitle(cd, cls)) + ' is ' + cd.status);
      else if (cd.reasons.length) items.push(e(W.dayTitle(cd, cls)) + ' has unpublished changes');
    }
    KH.confirm({ title: 'Archive ' + comp.name + '?', intro: 'This deletes the scoring work irreversibly.' + (items.length ? ' These class days are not settled:' : ''), items, confirmLabel: 'Archive', onConfirm: () => KH.run(() => { A.archive(comp); KH.toast('Archived'); }) });
  };
  H.deleteComp = (ds) => {
    const comp = Q.competition(ds.comp);
    KH.confirm({ title: 'Delete ' + comp.name + '?', intro: 'Its links and IGC downloads stop working for good. There is no tombstone.', confirmLabel: 'Delete for good', onConfirm: () => KH.run(() => { A.deleteCompetition(comp); KH.toast('Deleted ' + comp.name); KH.go('/'); }) });
  };

  // Setup progress, derived from the data. Directions decide whether and how to show it.
  W.setupState = (comp) => {
    const classes = Q.classesOf(comp.id);
    return [
      { key: 'details', label: 'Competition details', done: true },
      { key: 'airfield', label: 'Airfield', done: !!comp.airfield },
      { key: 'classes', label: 'Classes', done: classes.length > 0 },
      { key: 'turnpoints', label: 'Turnpoint file', done: !!comp.turnpointFile },
      { key: 'airspace', label: 'Airspace file', done: !!comp.airspaceFile },
      { key: 'competitors', label: 'Competitors', done: Q.competitorsOf(comp.id).length > 0 },
      { key: 'loggers', label: 'Loggers', done: Q.loggersOf(comp.id).some((l) => l.links.length) },
      { key: 'members', label: 'Scorers invited', done: Q.membersOf(comp.id).length > 1 },
    ];
  };
})();
