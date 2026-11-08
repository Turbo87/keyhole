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
    { id: '2b', file: '2b-status-tab.html', name: 'Status tab', round: 2, idea: 'Not built yet.', tradeoff: '' },
    { id: '2c', file: '2c-day-hub.html', name: 'Day hub', round: 2, idea: 'Not built yet.', tradeoff: '' },
    { id: '2d', file: '2d-flights-tab.html', name: 'Flights tab', round: 2, idea: 'Not built yet.', tradeoff: '' },
  ];
  KH.BUILT = ['a', 'b', 'c', 'd', 'e', 'f', '2a'];
  // The prototype bar and the arrow keys cycle through the built directions of the current round.
  KH.siblings = () => {
    const round = KH.DIRECTIONS.find((d) => d.id === KH.app.id).round;
    return KH.DIRECTIONS.filter((d) => d.round === round && KH.BUILT.includes(d.id));
  };

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('kh-proto:' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
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
      html = ctx.route ? KH.app.render(ctx) : KH.app.notFound ? KH.app.notFound(ctx) : '<p>No page at ' + KH.esc(ctx.path) + '</p>';
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
