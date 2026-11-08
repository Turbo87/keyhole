// PROTOTYPE: router, event wiring, dialogs and the floating prototype bar shared by every direction.
(function () {
  const KH = (window.KH = window.KH || {});

  KH.DIRECTIONS = [
    {
      id: 'a', file: 'a-tree.html', name: 'Tree', round: 1,
      idea: 'A persistent sidebar holds one flat menu of competition-wide pages, then every competition date with its classes nested inside. Every object has its own page and deep URL.',
      tradeoff: 'Predictable and fully linkable, and the date-first tree matches how a competition runs, but work on one class across many days, or on one competitor, means hopping between dates.',
    },
    {
      id: 'b', file: 'b-day-desk.html', name: 'Day desk', round: 1,
      idea: 'The workspace is one competition date: a date strip picks the day, every class of that date sits side by side as a column with its task, results and publish state, and flight review opens in a drawer over the desk. Competition-wide setup is a separate Setup mode.',
      tradeoff: 'Today\'s work across all classes is on one screen and review never loses the day\'s context, but setup is a separate mode, and following one class or competitor across days means stepping through dates or detouring through setup.',
    },
    {
      id: 'c', file: 'c-review-inbox.html', name: 'Review inbox', round: 1,
      idea: 'The competition opens on a work queue like an email client: folders of open work with counts, a list of items, and the selected item\'s detail with its actions. Finishing an item moves on to the next, and setup pages wait behind a Browse menu and a jump box.',
      tradeoff: 'Fastest for working through a competition day and makes leftover work impossible to miss, but the structure of the competition is hidden, so setup and looking things up depend on the Browse menu and search rather than on seeing where you are.',
    },
    {
      id: 'd', file: 'd-overview-grid.html', name: 'Overview grid', round: 1,
      idea: 'Dense matrices are the navigation: dates × classes for the competition and competitors × days for each class, and selecting a cell opens its full editor in a panel under the matrix without leaving it.',
      tradeoff: 'Shows the state of the whole competition at a glance and makes moving between neighbouring days or competitors one click, but the matrices get heavy and need a legend, and setup is pushed into one long settings page and side-panel tables.',
    },
    {
      id: 'e', file: 'e-checklists.html', name: 'Checklists', round: 1,
      idea: 'Setup is a numbered checklist and every class day is a fixed five-step stepper (Plan, Task, Flights, Review, Publish), so each page says which step you are on and what to do next.',
      tradeoff: 'Guides new organisers and keeps the day\'s work in order, but anything outside the steps, such as one competitor across days, IGC files or a published day reopened by a change, sits off to the side or reads as "back at step 3".',
    },
    {
      id: 'f', file: 'f-workspace.html', name: 'Workspace', round: 1,
      idea: 'An IDE-like workspace: a searchable object browser on the left, every class day, result, file or setup page opens as a tab, and an inspector on the right shows the active tab\'s context, so the analysis log, map, start candidates and overrides are all on screen at once.',
      tradeoff: 'Fast for long review sessions and for comparing objects side by side, but it is dense, the tab state is something to manage, and it gives a newcomer little guidance on what to do next.',
    },
    {
      id: '2a', file: '2a-status-track.html', name: 'Status track', round: 2,
      idea: 'A class day has Overview, Task and Results tabs. The start procedure, limits and airspace sit at the top of the Task tab because every candidate shares them, and a status track under the title runs from task published to final and ends in the Publish button.',
      tradeoff: 'The status reads as a progression on every class day page and publishing is always one click away, but the track takes a row of its own and publishing is a page without a tab.',
    },
    {
      id: '2b', file: '2b-status-tab.html', name: 'Status tab', round: 2,
      idea: 'The class day has four tabs, Overview, Task, Results and Status. The day settings sit on the Overview because they apply to every task candidate, and the Status tab\'s label is the only place the day status appears, with every publishing control behind it.',
      tradeoff: 'The page stays calm and the status is always in the same spot, but publishing is a tab away from the results being published, and the status only reads as a label rather than a progression.',
    },
    {
      id: '2c', file: '2c-day-hub.html', name: 'Day hub', round: 2,
      idea: 'A class day is a hub of four section cards (day settings, task, results, status and publishing), each with its marks and a link to a full page, while the title carries the day status and a button for the next publishing step.',
      tradeoff: 'The hub makes outstanding work easy to scan and always names the next step, but moving between sections goes back through the hub.',
    },
    {
      id: '2d', file: '2d-flights-tab.html', name: 'Flights tab', round: 2,
      idea: 'Class day tabs Overview, Task, Flights and Results separate file work (arrivals, stale analyses, unresolved files, competitors without a file) from scoring work (ranking, review, manual results), and a status pill in the title row opens a small menu for the working status and publishing.',
      tradeoff: 'Each tab has one kind of work and the day settings stay next to the candidates in a disclosure, but fixing a file problem and reviewing the result it causes means switching tabs, and the status menu hides publishing one click away.',
    },
    {
      id: '2e', file: '2e-one-page.html', name: 'One page', round: 2,
      idea: 'A class day is one scrolling page (day settings, task, results, publish) with a sticky section index carrying each section\'s marks, and a sticky footer bar that always shows the day status and the publish action.',
      tradeoff: 'Nothing about a day is hidden behind a tab and the status is always in view, but the page is long, the results push publishing far down, and the footer bar costs screen height on every class day page.',
    },
    {
      id: '2f', file: '2f-settings-tab.html', name: 'Settings tab', round: 2,
      idea: 'Class day tabs Overview, Day, Task and Results: the Day tab gathers everything about the day itself (working status, practice, start procedure, limits, airspace), and results are published from a bar on top of the Results tab, so the status only shows in the breadcrumb and sidebar.',
      tradeoff: 'Publishing happens where the results are checked and the task tab stays about tasks, but the status has no prominent place of its own and the day settings sit one tab away from the candidates they apply to.',
    },
    {
      id: '3a', file: '3a-stacked.html', name: 'Stacked', round: 3,
      idea: 'The result review page is one column in the order a scorer works through a result: check reasons, result status, files, the scored file with its map, start candidates, analysis log, overrides, manual result, penalty and remarks, under a sticky header with the pilot, previous and next, and the Reviewed button.',
      tradeoff: 'Simple, predictable and the same on a phone, but the analysis log and the map are never on screen together, and reaching penalty or remarks means a long scroll past the evidence.',
    },
    {
      id: '3b', file: '3b-two-columns.html', name: 'Two columns', round: 3,
      idea: 'The result review page splits into the scorer\'s decision on the left (check reasons, result status, files, manual result, penalty, remarks) and the evidence on the right (summary, map, start candidates, analysis log, overrides), and the evidence column scrolls on its own so the decision stays in view.',
      tradeoff: 'The decision and the evidence for it are visible side by side on a desktop, but both columns are narrow for wide tables like the analysis log, and on a phone the evidence ends up below everything else.',
    },
    {
      id: '3c', file: '3c-map-first.html', name: 'Map first', round: 3,
      idea: 'A large map of the scored flight leads the result review page, with a flight timeline under it whose markers for start candidates, turnpoints, finish, landing and every warning link to the highlighted analysis log row further down.',
      tradeoff: 'Shows the flight as a flight first and makes jumping to the relevant log entry easy, but the map pushes the check reasons and the decision controls far down the page, and long timelines scroll sideways.',
    },
    {
      id: '3d', file: '3d-log-spine.html', name: 'Log spine', round: 3,
      idea: 'The analysis log of the scored file is the spine of the review page: start choices, credits, flight end, finish time, AAT pins and penalty suggestions sit as actions on the log rows they concern, existing overrides appear as marked rows at their time, and the map and output stay in a sticky aside.',
      tradeoff: 'Every decision sits next to the evidence that prompted it and there is no separate overrides or start candidates panel to cross-reference, but the page depends on the log being readable, and actions with no log entry, such as a free start or a flight end without a warning, are easier to miss.',
    },
    {
      id: '3e', file: '3e-reason-cards.html', name: 'Reason cards', round: 3,
      idea: 'The result review page is driven by what still needs work: every check reason, stale analysis, unknown or manual result becomes a card with only the evidence and the action it needs, and the full analysis waits folded below.',
      tradeoff: 'Quick for clearing typical results and hard to miss an open item, but evidence for different reasons can repeat across cards, and anything not tied to a reason, such as penalty, remarks or overrides, is one fold away.',
    },
    {
      id: '3f', file: '3f-review-tabs.html', name: 'Review tabs', round: 3,
      idea: 'A compact sticky header keeps the pilot, previous and next, the check reasons and the Reviewed button in view above review sub-tabs for summary, log, start, overrides, and penalty and remarks, each with its own URL.',
      tradeoff: 'Each part of the review stays short and focused and works well on a phone, but comparing the map with the log or the start candidates means switching sub-tabs.',
    },
    {
      id: '4a', file: '4a-page-per-item.html', name: 'Page per item', round: 4,
      idea: 'Every setup item has its own page in a Setup section of the sidebar: details and upload password, dates and class days, classes, turnpoints, airspace, competitors and loggers, and the overview\'s setup card is a checklist linking to them.',
      tradeoff: 'Each page is short and does one thing, and every item has a stable URL, but setting up a new competition means visiting seven pages, and a competitor and its loggers are entered on separate pages.',
    },
    {
      id: '4b', file: '4b-grouped-pages.html', name: 'Grouped pages', round: 4,
      idea: 'Setup shrinks to four larger pages: Competition (details, upload password, dates, members), Classes (every class as a collapsible section), Course (turnpoints and airspace) and Entrants, where competitors and loggers share one page and one side panel.',
      tradeoff: 'Fewer places to look and competitors and their loggers are edited side by side, but the pages are long, the Competition page mixes admin-only and scorer work, and a single class or competitor has no page of its own.',
    },
    { id: '4c', file: '4c-inline-tables.html', name: 'Inline tables', round: 4, idea: 'Not built yet.', tradeoff: '' },
    {
      id: '4d', file: '4d-competitor-first.html', name: 'Competitor first', round: 4,
      idea: 'Entrants are set up on the competitor: adding one includes their logger by manufacturer and serial, "Add and add next" moves straight on to the next competitor, and the competitor page links loggers, shows their dated links and edits their thresholds, while the loggers page is only an overview with the logger-only edits.',
      tradeoff: 'Entering a field of pilots is one form per pilot with nothing to cross-reference, but a logger that changes hands or is shared between competitors is spread over several competitor pages, and logger thresholds sit away from the logger list.',
    },
    { id: '4e', file: '4e-class-first.html', name: 'Class first', round: 4, idea: 'Not built yet.', tradeoff: '' },
    {
      id: '4f', file: '4f-guided-card.html', name: 'Guided card', round: 4,
      idea: 'Setup pages stay one per item, but the overview\'s setup card does the light work itself: dates, upload password, adding a class from a template, turnpoint and airspace uploads and inviting members happen inline in the card, bigger steps show counts and link to their page, and the card folds into a one-line bar once setup is complete.',
      tradeoff: 'A new competition can be mostly set up without leaving the overview, but the same actions live in two places, the card gets long, and a class added from the card skips its rule overrides until someone opens the class page.',
    },
  ];
  KH.BUILT = ['a', 'b', 'c', 'd', 'e', 'f', '2a', '2b', '2c', '2d', '2e', '2f', '3a', '3b', '3f', '3d', '3e', '3c', '4a', '4b', '4f', '4d'];
  // The prototype bar and the arrow keys cycle through the built directions of the current round.
  KH.siblings = () => {
    const round = KH.DIRECTIONS.find((d) => d.id === KH.app.id).round;
    return KH.DIRECTIONS.filter((d) => d.round === round && KH.BUILT.includes(d.id));
  };

  // Values also live in memory, because some browsers block localStorage for pages opened from file://.
  const memory = {};
  const store = {
    get(k, d) {
      if (k in memory) return memory[k];
      try {
        const v = localStorage.getItem('kh-proto:' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      memory[k] = v;
      try {
        localStorage.setItem('kh-proto:' + k, JSON.stringify(v));
      } catch (e) {}
    },
  };
  KH.store = store;

  KH.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  KH.handlers = {};
  KH.ui = {};

  // ---------- routing ----------

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = raw.split('?');
    const query = {};
    if (qs) for (const part of qs.split('&')) {
      const [k, v] = part.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
    return { path, query };
  }
  function match(pattern, path) {
    const a = pattern.split('/').filter(Boolean);
    const b = path.split('/').filter(Boolean);
    if (a.length !== b.length) return null;
    const params = {};
    for (let i = 0; i < a.length; i++) {
      if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
      else if (a[i] !== b[i]) return null;
    }
    return params;
  }
  KH.go = (path) => {
    location.hash = '#' + path;
  };
  KH.withQuery = (patch) => {
    const { path, query } = parseHash();
    const q = { ...query, ...patch };
    const qs = Object.keys(q).filter((k) => q[k] !== '' && q[k] != null).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(q[k])).join('&');
    return path + (qs ? '?' + qs : '');
  };

  // Resolves the common route parameters to domain objects.
  function resolveParams(params) {
    const Q = KH.q;
    const ctx = {};
    if (params.comp) ctx.comp = Q.competitionBySlug(params.comp);
    if (ctx.comp && params.class) ctx.cls = Q.classBySlug(ctx.comp.id, params.class);
    if (ctx.cls && params.date) ctx.cd = Q.classDayOn(ctx.cls.id, params.date);
    if (ctx.cls && params.cid) ctx.competitor = Q.competitorByCid(ctx.cls.id, params.cid);
    if (ctx.cd && ctx.competitor) ctx.result = Q.resultFor(ctx.cd.id, ctx.competitor.id);
    if (params.file) ctx.file = Q.file(params.file);
    if (params.logger) ctx.logger = Q.logger(params.logger);
    if (params.competitor) ctx.competitor = Q.competitor(params.competitor);
    if (params.cand) ctx.cand = Q.candidate(params.cand);
    return ctx;
  }

  // ---------- mounting ----------

  KH.mount = (app) => {
    KH.app = app;
    Object.assign(KH.handlers, app.handlers || {});
    KH.session.role = store.get('role', 'scorer');
    document.body.insertAdjacentHTML('beforeend', '<div id="app"></div><div id="kh-modal"></div><div id="kh-toast"></div><div id="kh-proto"></div>');
    window.addEventListener('hashchange', () => {
      KH.closeModal();
      KH.render();
      window.scrollTo(0, 0);
    });
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    KH.render();
  };

  KH.current = () => {
    const { path, query } = parseHash();
    for (const route of KH.app.routes) {
      const params = match(route.path, path);
      if (params) return { route, params, query, path, ...resolveParams(params) };
    }
    return { route: null, params: {}, query, path };
  };

  KH.render = () => {
    const ctx = KH.current();
    let html;
    try {
      html = KH.memoize(() => (ctx.route ? KH.app.render(ctx) : KH.app.notFound ? KH.app.notFound(ctx) : '<p>No page at ' + KH.esc(ctx.path) + '</p>'));
    } catch (e) {
      console.error(e);
      html = '<div class="wf-error"><b>Prototype error</b><pre>' + KH.esc(e.stack || e.message) + '</pre></div>';
    }
    document.getElementById('app').innerHTML = html;
    renderProto(ctx);
  };

  function run(fn) {
    try {
      const out = fn();
      KH.render();
      return out;
    } catch (e) {
      if (e instanceof KH.Denied) {
        KH.toast(e.message, 'error');
        KH.render();
      } else {
        console.error(e);
        KH.toast('Prototype error: ' + e.message, 'error');
      }
    }
  }
  KH.run = run;

  function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el) {
      const row = ev.target.closest('[data-href]');
      if (row && !ev.target.closest('a, button, input, select, textarea, label, form')) KH.go(row.dataset.href);
      return;
    }
    const name = el.dataset.act;
    const fn = KH.handlers[name];
    if (!fn) {
      KH.toast('No handler for ' + name, 'error');
      return;
    }
    ev.preventDefault();
    run(() => fn(el.dataset, el, ev));
  }
  function formData(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') {
        if (el.name.endsWith('[]')) {
          const k = el.name.slice(0, -2);
          out[k] = out[k] || [];
          if (el.checked) out[k].push(el.value);
        } else out[el.name] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) out[el.name] = el.value;
      } else out[el.name] = el.value;
    }
    return out;
  }
  function onSubmit(ev) {
    const form = ev.target.closest('form[data-submit]');
    if (!form) return;
    ev.preventDefault();
    const fn = KH.handlers[form.dataset.submit];
    if (!fn) return KH.toast('No handler for ' + form.dataset.submit, 'error');
    run(() => fn(formData(form), form.dataset, form));
  }
  function onChange(ev) {
    const el = ev.target.closest('[data-change]');
    if (!el) return;
    const fn = KH.handlers[el.dataset.change];
    if (!fn) return;
    run(() => fn(el.type === 'checkbox' ? el.checked : el.value, el.dataset, el));
  }
  function inField(ev) {
    const t = ev.target;
    return t.closest('input, textarea, select, [contenteditable]');
  }
  function onKey(ev) {
    if (ev.key === 'Escape') return KH.closeModal();
    if (inField(ev) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const built = KH.siblings();
      if (built.length < 2) return;
      const i = built.findIndex((d) => d.id === KH.app.id);
      const next = built[(i + (ev.key === 'ArrowLeft' ? -1 : 1) + built.length) % built.length];
      location.href = next.file;
    }
    if (KH.app.onKey) KH.app.onKey(ev);
  }

  // ---------- dialogs and toasts ----------

  KH.modal = ({ title, body, wide }) => {
    const el = document.getElementById('kh-modal');
    el.innerHTML =
      '<div class="wf-overlay" data-act="__close"></div><div class="wf-dialog' + (wide ? ' wide' : '') + '" role="dialog"><div class="wf-dialog-head"><b>' + KH.esc(title) +
      '</b><button class="wf-btn small" data-act="__close">Close</button></div><div class="wf-dialog-body">' + body + '</div></div>';
  };
  KH.closeModal = () => {
    const el = document.getElementById('kh-modal');
    if (el) el.innerHTML = '';
    KH._pending = null;
  };
  // A confirmation is a dialog only. Nothing about it is stored.
  KH.confirm = ({ title, intro, items, confirmLabel, onConfirm, extra }) => {
    KH._pending = onConfirm;
    KH.modal({
      title,
      body:
        (intro ? '<p>' + intro + '</p>' : '') +
        (items && items.length ? '<ul class="wf-confirm-list">' + items.map((i) => '<li>' + i + '</li>').join('') + '</ul>' : '') +
        (extra || '') +
        '<div class="wf-row end"><button class="wf-btn" data-act="__close">Cancel</button><button class="wf-btn primary" data-act="__confirm">' + KH.esc(confirmLabel || 'Confirm') + '</button></div>',
    });
  };
  KH.handlers.__close = () => KH.closeModal();
  KH.handlers.__confirm = () => {
    const fn = KH._pending;
    KH.closeModal();
    if (fn) fn();
  };
  let toastTimer;
  KH.toast = (text, kind) => {
    const el = document.getElementById('kh-toast');
    el.innerHTML = '<div class="wf-toast ' + (kind || '') + '">' + KH.esc(text) + '</div>';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.innerHTML = ''), kind === 'error' ? 6000 : 3000);
  };

  // ---------- prototype bar and sitemap ----------

  KH.handlers.__role = (d) => {
    KH.session.role = d.role;
    store.set('role', d.role);
    KH.toast('Viewing as ' + KH.PERSONAS[d.role].who);
  };
  KH.handlers.__sitemap = () => store.set('sitemap', !store.get('sitemap', false));

  function renderProto(ctx) {
    const app = KH.app;
    const built = KH.siblings();
    const i = built.findIndex((d) => d.id === app.id);
    const prev = built[(i - 1 + built.length) % built.length];
    const next = built[(i + 1) % built.length];
    const dir = KH.DIRECTIONS.find((d) => d.id === app.id);
    const open = store.get('sitemap', false);
    const role = KH.session.role;
    const roles = Object.keys(KH.PERSONAS)
      .map((r) => '<button class="' + (r === role ? 'on' : '') + '" data-act="__role" data-role="' + r + '" title="' + KH.esc(KH.PERSONAS[r].who) + '">' + KH.PERSONAS[r].label + '</button>')
      .join('');

    const groups = {};
    for (const r of app.routes) (groups[r.group || 'Pages'] = groups[r.group || 'Pages'] || []).push(r);
    const sitemap = Object.keys(groups)
      .map(
        (g) =>
          '<div class="kh-sm-group"><div class="kh-sm-title">' + KH.esc(g) + '</div>' +
          groups[g]
            .map((r) => {
              const cur = ctx.route === r;
              const label = '<code>' + KH.esc(r.path) + '</code><span>' + KH.esc(r.title) + '</span>';
              return '<div class="kh-sm-route' + (cur ? ' cur' : '') + '">' + (r.example ? '<a href="#' + r.example + '">' + label + '</a>' : label) + '</div>';
            })
            .join('') +
          '</div>'
      )
      .join('');

    document.getElementById('kh-proto').innerHTML =
      (open
        ? '<aside class="kh-sitemap"><div class="kh-sm-head"><b>Sitemap · ' + KH.esc(dir.name) + '</b><button data-act="__sitemap">Hide</button></div>' +
          '<div class="kh-sm-cur"><div>URL</div><code>#' + KH.esc(location.hash.replace(/^#/, '') || '/') + '</code><div>Route</div><code>' + KH.esc(ctx.route ? ctx.route.path : 'none') + '</code></div>' +
          sitemap + '</aside>'
        : '') +
      '<div class="kh-bar">' +
      (built.length > 1 ? '<a class="kh-arrow" href="' + prev.file + '" title="Previous direction (←)">◀</a>' : '') +
      '<span class="kh-dir">' + app.id.toUpperCase() + ' · ' + KH.esc(dir.name) + '</span>' +
      (built.length > 1 ? '<a class="kh-arrow" href="' + next.file + '" title="Next direction (→)">▶</a>' : '') +
      '<span class="kh-sep"></span><span class="kh-roles">' + roles + '</span><span class="kh-sep"></span>' +
      '<button class="kh-btn' + (open ? ' on' : '') + '" data-act="__sitemap">Sitemap</button>' +
      '<a class="kh-btn" href="index.html">All directions</a>' +
      '</div>';
  }
})();
