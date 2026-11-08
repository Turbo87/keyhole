// PROTOTYPE: Round 3 prototype 3E, "Reason cards". The result review page is driven by what still needs work: every
// check reason, stale analysis, unknown or manual result becomes a card with only the evidence and actions it needs.
// Everything else waits in a folded "Full analysis" section.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const R = KH.r3;
  const e = KH.esc;

  const wide = (html) => '<div class="r2-wide">' + html + '</div>';

  function card(kind, title, body, footer) {
    return '<section class="e3-card"><header><h3>' + R.todoIcon(kind) + ' ' + title + '</h3><span class="e3-kind">' + e(kind) + '</span></header>' +
      body + (footer ? '<footer>' + footer + '</footer>' : '') + '</section>';
  }

  // Warnings and errors of a file's analysis, with the action each one offers. Info and debug entries stay in the
  // full log.
  function findings(f) {
    const res = Q.resolve(f);
    const rows = f.analysis.log.filter((x) => x.level === 'warning' || x.level === 'error');
    if (!rows.length) return '<p class="muted small">No warnings or errors in the analysis.</p>';
    return '<ul class="e3-findings">' + rows.map((x) => {
      let act = '';
      if (res.ok && x.kind === 'near-miss') act = '<button class="wf-btn small" data-act="creditTp" data-file="' + f.id + '" data-idx="' + x.tpIndex + '">Credit turnpoint</button>';
      if (res.ok && x.kind === 'finish-miss') act = '<button class="wf-btn small" data-act="creditFinish" data-file="' + f.id + '">Credit finish</button>';
      if (res.ok && x.suggestion) act = '<button class="wf-btn small" data-act="acceptFlightEnd" data-file="' + f.id + '" data-time="' + x.suggestion.time + '">Accept flight end ' + x.suggestion.time + '</button>';
      return '<li>' + W.level(x.level) + '<span class="mono small">' + e(x.time || '') + '</span><span class="grow">' + e(x.text) + (x.rule ? ' <span class="muted small">' + e(x.rule) + '</span>' : '') + '</span>' + act + '</li>';
    }).join('') + '</ul>';
  }

  const startFindings = (f) => f.analysis.log.some((x) => x.kind === 'start' && x.level === 'warning');

  function evidence(ctx, f) {
    return '<div class="wf-cols"><div class="wf-stack">' + R.rv.summary(f) + (W.staleBadge(f) ? '<div>' + W.staleBadge(f) + '</div>' : '') + '</div>' + R.rv.map(ctx, f, { h: 180 }) + '</div>';
  }

  function scoreAction(r, f) {
    return r.scoredFileId === f.id ? '<span class="wf-badge solid">scored file</span>' : '<button class="wf-btn" data-act="scoreFile" data-result="' + r.id + '" data-file="' + f.id + '">Score this file</button>';
  }

  // Check reasons that name the same file share one card, so its evidence shows once.
  function reasonCard(ctx, group) {
    const r = ctx.result;
    const f = group[0].file ? Q.file(group[0].file) : null;
    const lines = '<ul class="e3-reasons">' + group.map((c) => '<li>' + e(c.text) + ' <span class="muted small">' + W.dt(c.at) + '</span></li>').join('') + '</ul>';
    if (!f) return card('in check', e(group[0].text), lines + '<p class="muted small">This check reason names no file.</p>');
    const name = '<a href="#' + R.links.file(f) + '">' + e(f.name) + '</a>';
    const has = (prefix) => group.some((c) => c.text.startsWith(prefix));
    if (has('File left') && group.length === 1) {
      const res = Q.resolve(f);
      return card('in check', 'File left: ' + name, lines + '<p class="small">This file now belongs to ' + (res.ok ? e(Q.crewName(res.competitor)) + ' (' + e(res.competitor.cid) + '), ' + e(W.dayTitle(res.classDay, Q.class(res.classDay.classId))) : 'no class day') + '. Check that this result still has the file it should be scored from.</p>' + wide(R.rv.files(r)));
    }
    const body = lines + evidence(ctx, f) + '<h4>Warnings and errors</h4>' + findings(f) + (has('Scored file output changed') && startFindings(f) ? '<h4>Start candidates</h4>' + wide(R.rv.candidates(f)) : '');
    const footer = has('File arrived') ? scoreAction(r, f) + '<span class="muted small">' + (r.scoredFileId === f.id ? 'Already scored. Check its findings.' : 'Pick it as the scored file if it is the better flight.') + '</span>' : '';
    return card('in check', (has('File arrived') ? 'File arrived: ' : 'Check: ') + name, body, footer);
  }

  function cards(ctx) {
    const r = ctx.result;
    const groups = new Map();
    for (const c of r.checkReasons) {
      const k = c.file || c.text;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const out = [...groups.values()].map((g) => reasonCard(ctx, g));
    for (const f of Q.filesOfResult(r).filter((x) => x.analysis.stale.length)) {
      out.push(card('stale', 'Stale analysis: <a href="#' + R.links.file(f) + '">' + e(f.name) + '</a>',
        '<p class="small">Stale since ' + W.dt(f.analysis.stale[0].at) + ' because of ' + e(f.analysis.stale.map((s) => s.reason).join(', ')) + '. The result uses the previous run until the file is rerun.</p>',
        '<button class="wf-btn primary" data-act="rerun" data-file="' + f.id + '">Rerun</button>'));
    }
    if (r.status === 'unknown') {
      const files = Q.filesOfResult(r);
      out.push(card('unknown', 'No result yet',
        (files.length ? '<p class="small">Pick the file to score, or set another result status.</p>' + wide(R.rv.files(r)) : '<p class="small">No IGC file has arrived for this competitor. Set "did not fly", enter a manual result, or wait for the file.</p>'),
        R.rv.status(r)));
    }
    if (r.status === 'manual result') {
      out.push(card('manual', 'Manual result', '<p class="small">A manual result stands in until the IGC file arrives, so this result stays to do.</p>' + R.rv.manual(r), R.rv.status(r)));
    }
    return out;
  }

  function full(ctx, open) {
    const r = ctx.result;
    const f = R.scoredFile(r);
    const box = (title, body) => (body ? '<section class="wf-box">' + (title ? '<h3>' + title + '</h3>' : '') + body + '</section>' : '');
    return '<details class="e3-full"' + (open ? ' open' : '') + '><summary>Full analysis</summary><div class="wf-stack">' +
      box('', R.rv.status(r)) +
      box('Files', wide(R.rv.files(r))) +
      (f ? box('Scored file: ' + e(f.name), evidence(ctx, f)) + box('Start candidates', wide(R.rv.candidates(f))) + box('', wide(R.rv.log(f))) + box('Overrides', R.rv.overrides(f)) : '') +
      (r.status === 'manual result' ? '' : box('Manual result', R.rv.manual(r))) +
      box('Penalty', R.rv.penalty(r)) +
      box('Remarks and handicap', R.rv.remarks(r)) + '</div></details>';
  }

  function review(ctx) {
    const r = ctx.result;
    const list = cards(ctx);
    const head = '<div class="e3-head">' + R.reviewHeader(ctx) + R.reviewNav(ctx) + '</div>';
    const n = r.checkReasons.length;
    const end = '<div class="e3-end"><span class="small">' + (list.length ? list.length + ' open item' + (list.length === 1 ? '' : 's') + '. ' : '') +
      (n ? 'Clearing the check reasons marks this result reviewed.' : R.isTodo(r) ? 'No check reasons to clear. Resolve the open items above with their own actions.' : 'Nothing to do on this result.') + '</span>' + R.reviewButton(r) + '</div>';
    return '<div class="wf-stack">' + head +
      (list.length ? list.join('') : '<div class="e3-done">Nothing to do on this result. The full analysis is open below.</div>') +
      end + full(ctx, !list.length) + '</div>';
  }

  R.mount({ id: '3e', review });
})();
