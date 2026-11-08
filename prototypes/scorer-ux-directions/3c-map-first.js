// PROTOTYPE: Round 3 prototype 3C, "Map first".
(function () {
  const KH = window.KH;
  const R = KH.r3;
  const e = KH.esc;

  function box(title, body, className) {
    return body ? '<section class="wf-box ' + (className || '') + '">' + (title ? '<h3>' + title + '</h3>' : '') + body + '</section>' : '';
  }

  function wide(body) {
    return '<div class="r2-wide">' + body + '</div>';
  }

  function rowId(f, key) {
    return 'c3-' + f.id + '-' + key;
  }

  function isSelected(ctx, f, key) {
    return ctx.query.file === f.id && ctx.query.entry === key;
  }

  // The shared log prepends context warnings. Annotate its rows to retain their rules and actions.
  function linkedLog(ctx, f) {
    const entries = f.analysis.log.map((entry, i) => ({ ...entry, key: 'entry-' + i })).filter((entry) => KH.ui.showDebug || entry.level !== 'debug');
    const html = R.rv.log(f);
    const count = (html.match(/<tr class="log-/g) || []).length;
    const contextCount = count - entries.length;
    const rows = [];
    const log = html.replace(/<tr class="log-(debug|info|warning|error)">([\s\S]*?)<\/tr>/g, (row, level, cells) => {
      const i = rows.length;
      const entry = i < contextCount ? { level, time: '', key: 'context-' + i } : entries[i - contextCount];
      const columns = [...cells.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
      rows.push({ ...entry, textHtml: columns[2][1] });
      return row.replace('<tr class="log-' + level + '"', '<tr id="' + rowId(f, entry.key) + '" tabindex="-1" class="log-' + level + (isSelected(ctx, f, entry.key) ? ' c3-selected' : '') + '"');
    });
    return { html: log, rows };
  }

  function marker(entry, f) {
    const candidate = entry.candidate && (f.analysis.candidates || []).find((c) => c.time === entry.candidate);
    const text = entry.text || '';
    const problem = entry.level === 'warning' || entry.level === 'error';
    let label;
    let icon;
    let inUse = false;
    if (candidate) {
      inUse = candidate.inUse;
      label = inUse ? 'Start in use' : 'Other start candidate';
      icon = inUse ? 'flag' : 'flag-outline';
    } else if (text === 'Take-off') {
      label = 'Take-off';
      icon = 'airplane-takeoff';
    } else if (/^(Turnpoint|Assigned area) .* reached/.test(text)) {
      label = text;
      icon = 'map-marker-outline';
    } else if (/^Finish (at |credited)/.test(text)) {
      label = 'Finish';
      icon = 'flag-checkered';
    } else if (/^Landing\b/.test(text)) {
      label = text;
      icon = 'airplane-landing';
    } else if (text === 'Start time set by override') {
      label = 'Start in use (override)';
      icon = 'flag';
      inUse = true;
    } else if (problem) {
      label = text;
    } else {
      return '';
    }
    if (problem) icon = entry.level === 'error' ? 'close-octagon-outline' : 'alert-outline';
    return { ...entry, labelHtml: label ? e(label) : entry.textHtml, icon, inUse, problem };
  }

  function markerLink(ctx, f, entry, timed) {
    const href = '#' + R.links.result(ctx.result) + '?file=' + encodeURIComponent(f.id) + '&entry=' + encodeURIComponent(entry.key) + (entry.time ? '&at=' + encodeURIComponent(entry.time) : '');
    const symbol = '<i class="mdi mdi-' + entry.icon + '" aria-hidden="true"></i>';
    const current = isSelected(ctx, f, entry.key) ? ' aria-current="true"' : '';
    const label = entry.labelHtml + (entry.problem ? '<small>' + e(entry.level) + '</small>' : '');
    return '<a data-c3-marker href="' + e(href) + '"' + current + ' class="' + (timed ? 'c3-marker c3-' + entry.level + (entry.inUse ? ' c3-in-use' : '') : '') + '">' +
      (timed ? '<span class="c3-symbol">' + symbol + '</span><time>' + e(entry.time) + '</time><span class="c3-label">' + label + '</span>' : symbol + '<span>' + label + '</span>') + '</a>';
  }

  function timeline(ctx, f, rows) {
    const markers = rows.map((entry) => marker(entry, f)).filter(Boolean);
    const timed = markers.filter((entry) => entry.time).sort((a, b) => a.time.localeCompare(b.time));
    const untimed = markers.filter((entry) => !entry.time);
    return '<div class="c3-timeline"><h3>Flight timeline</h3><p class="muted small">Select a marker to read its analysis log entry. Markers are ordered by time, with equal spacing.</p>' +
      (timed.length ? '<nav aria-label="Flight timeline" class="c3-strip"><ol class="c3-markers">' + timed.map((entry) => '<li>' + markerLink(ctx, f, entry, true) + '</li>').join('') + '</ol></nav>' : '<p class="muted small">No timed flight entries are available.</p>') +
      (untimed.length ? '<div class="c3-file-checks"><b class="small">Whole-file checks · no flight time</b><ul>' + untimed.map((entry) => '<li>' + markerLink(ctx, f, entry, false) + '</li>').join('') + '</ul></div>' : '') + '</div>';
  }

  function review(ctx) {
    const r = ctx.result;
    const f = R.scoredFile(r);
    const log = f ? linkedLog(ctx, f) : null;
    const header = '<div class="c3-head">' + R.reviewHeader(ctx) + R.reviewNav(ctx) + '</div>';
    const flight = f ? '<section class="c3-flight"><div class="c3-caption"><b>Scored file</b> · ' + e(f.name) + '</div>' + R.rv.map(ctx, f, { h: 390 }) +
      '<div class="c3-under-map">' + timeline(ctx, f, log.rows) + '<div class="c3-output"><h3>Output summary</h3>' + R.rv.summary(f) + '</div></div></section>' :
      '<div class="wf-note">No scored file selected. Choose a file below to see its map, flight timeline and analysis log.</div>';
    return '<div class="wf-stack c3-review">' + header + flight +
      box('Check reasons', '<div class="wf-row between"><div>' + R.rv.reasons(r) + '</div>' + R.reviewButton(r) + '</div>') +
      box('', R.rv.status(r)) + box('Files', wide(R.rv.files(r))) +
      (f ? box('Start candidates', wide(R.rv.candidates(f))) + box('', wide(log.html), 'c3-log') + box('Overrides', wide(R.rv.overrides(f))) : '') +
      box('Manual result', R.rv.manual(r)) + box('Penalty', R.rv.penalty(r)) + box('Remarks and handicap', R.rv.remarks(r)) + '</div>';
  }

  function scrollToEntry() {
    const ctx = KH.current();
    if (!ctx.result || !ctx.query.entry || !ctx.query.file) return;
    const f = R.scoredFile(ctx.result);
    if (!f || f.id !== ctx.query.file) return;
    const row = document.getElementById(rowId(f, ctx.query.entry));
    if (row && row.scrollIntoView) {
      row.scrollIntoView({ block: 'start' });
      row.focus({ preventScroll: true });
    }
  }

  R.mount({ id: '3c', review });
  window.addEventListener('hashchange', scrollToEntry);
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-c3-marker]');
    if (link && link.hash === location.hash) scrollToEntry();
  });
  window.addEventListener('load', scrollToEntry);
})();
