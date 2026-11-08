// PROTOTYPE: Round 3 prototype 3F, "Review tabs". Breadcrumbs replace the class day tab row during review.
(function () {
  const KH = window.KH;
  const R = KH.r3;
  const e = KH.esc;
  const tabs = [['summary', 'Summary'], ['log', 'Log'], ['start', 'Start'], ['overrides', 'Overrides'], ['penalty', 'Penalty & remarks']];

  function activeTab(ctx) {
    return tabs.some(([key]) => key === ctx.query.tab) ? ctx.query.tab : 'summary';
  }

  function box(title, body) {
    return body ? '<section class="wf-box">' + (title ? '<h3>' + title + '</h3>' : '') + body + '</section>' : '';
  }

  function wide(body) {
    return '<div class="r2-wide">' + body + '</div>';
  }

  function indicator(icon, title) {
    return '<i class="mdi mdi-' + icon + '" role="img" aria-label="' + e(title) + '" title="' + e(title) + '"></i>';
  }

  function tabIcons(r, f) {
    const icons = {};
    if (R.isTodo(r)) icons.summary = R.todoIcon('Result needs work');
    if (f) {
      if (f.analysis.stale.length || f.analysis.log.some((entry) => ['warning', 'error'].includes(entry.level))) icons.log = R.todoIcon('Analysis needs a look');
      if (r.checkReasons.some((reason) => reason.file === f.id && /output changed/i.test(reason.text))) icons.log = R.todoIcon('Scored file output changed');
      if (f.overrides.start) icons.start = indicator('pencil-outline', 'Start override set');
      if (Object.values(f.overrides).some((value) => value && (typeof value !== 'object' || Object.keys(value).length))) icons.overrides = indicator('pencil-outline', 'Overrides set');
    }
    if (r.penalty) icons.penalty = indicator('gavel', r.penalty.points ? 'Penalty set' : 'Official warning set');
    else if (r.publicRemark || r.internalRemark || r.handicapOverride) icons.penalty = indicator('note-text-outline', 'Remarks or handicap override set');
    return icons;
  }

  function review(ctx) {
    const r = ctx.result;
    const f = R.scoredFile(r);
    const tab = activeTab(ctx);
    const icons = tabIcons(r, f);
    const nav = R.reviewNav(ctx).replace(/href="([^"]+)"/g, (match, href) => 'href="' + href + '?tab=' + tab + '"');
    const header = '<div class="f3-sticky"><header class="f3-head">' + R.reviewHeader(ctx) + '<div class="f3-actions">' + nav + R.reviewButton(r) + '</div></header>' +
      '<div class="f3-reasons"><b>Check reasons</b>' + R.rv.reasons(r) + '</div>' +
      '<nav class="wf-tabs f3-tabs" aria-label="Result review sections">' + tabs.map(([key, label]) =>
        '<a href="#' + e(ctx.path) + '?tab=' + key + '"' + (key === tab ? ' class="on" aria-current="page"' : '') + '>' + e(label) + (icons[key] ? ' ' + icons[key] : '') + '</a>').join('') + '</nav></div>';
    let body;
    if (tab === 'summary') {
      body = box('', R.rv.status(r)) + box('Manual result', R.rv.manual(r)) + box('Files', wide(R.rv.files(r))) +
        box('Output summary', (f ? '<p class="f3-file">Scored file: ' + e(f.name) + '</p>' : '') + '<div class="f3-output"><div>' +
          (f ? R.rv.summary(f) : '<p class="muted">No scored file selected.</p>') + '</div>' + R.rv.map(ctx, f, { h: 260 }) + '</div>');
    } else if (tab === 'penalty') {
      body = box('Penalty', R.rv.penalty(r)) + box('Remarks and handicap', R.rv.remarks(r));
    } else if (f) {
      const titles = { log: '', start: 'Start candidates', overrides: 'Overrides' };
      const widgets = { log: R.rv.log, start: R.rv.candidates, overrides: R.rv.overrides };
      body = '<p class="f3-file">Scored file: ' + e(f.name) + '</p>' + box(titles[tab], wide(widgets[tab](f)));
    } else {
      body = box(tabs.find(([key]) => key === tab)[1], '<p class="muted">No scored file selected. Choose a file in Summary to see its analysis log, start candidates and overrides.</p><a class="wf-btn" href="#' + e(ctx.path) + '?tab=summary">Open Summary</a>');
    }
    return '<div class="f3-review">' + header + '<div class="wf-stack f3-panel">' + body + '</div></div>';
  }

  R.mount({ id: '3f', reviewChrome: 'none', review });

  // The shell's automatic advance has no variant hook for retaining the review query.
  KH.app.afterReview = function () {
    const ctx = KH.current();
    if (!ctx.params.cid || !ctx.cd || !ctx.result) return;
    const next = R.neighbours(ctx).next;
    KH.go(next ? R.links.result(next.result) + '?tab=' + activeTab(ctx) : R.links.classDayResults(ctx.cd));
  };

  function revealActiveTab() {
    const nav = document.querySelector('.f3-tabs');
    if (!nav) return;
    const active = nav.querySelector('.on');
    nav.scrollLeft = Math.max(0, active.offsetLeft - nav.offsetLeft - 12);
  }
  window.addEventListener('hashchange', revealActiveTab);
  document.addEventListener('DOMContentLoaded', revealActiveTab);
})();
